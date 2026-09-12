// shield/shield.js
'use strict';

const express = require('express');
const { EventEmitter } = require('events');

const { MemoryStore } = require('./stores/memory');
const { analyze } = require('./detector');
const { Captcha } = require('./captcha');
const { Metrics } = require('./metrics');
const {
  getClientIp,
  safeEqual,
  ipMatches,
  toMatchers,
  wantsHtml,
  safeNext,
} = require('./util');

/* ------------------------------------------------------------- defaults */

const DEFAULTS = {
  /* routing */
  basePath: '/__shield',
  skip: ['/healthz', '/favicon.ico'],
  allowlist: [],

  /* identity */
  trustProxy: false,
  clientIp: null,

  /* security */
  secret: process.env.SHIELD_SECRET || 'shield-dev-secret-change-me',
  adminToken: process.env.SHIELD_ADMIN_TOKEN || 'shield-dev-admin-token',

  /* rate limiting */
  windowMs: 60_000,
  warnLimit: 10,
  softLimit: 20,   // -> CAPTCHA challenge
  hardLimit: 60,   // -> block

  /* burst detection */
  burstWindowMs: 2_000,
  burstLimit: 15,

  /* sensitive endpoints get tighter limits */
  sensitivePaths: ['/login', '/api/auth', '/admin', '/wp-login', '/api/token', '/password'],
  sensitiveSoftLimit: 5,
  sensitiveHardLimit: 15,

  /* not-found (scanning) detection */
  notFoundWindowMs: 60_000,
  notFoundLimit: 20,

  /* scoring thresholds */
  challengeScore: 40,
  blockScore: 85,

  /* escalation */
  maxStrikes: 3,
  strikeWindowMs: 10 * 60_000,

  /* punishment / reward windows */
  blockDurationMs: 5 * 60_000,
  grantDurationMs: 30 * 60_000,
  grantMultiplier: 3,

  /* captcha */
  captchaTtlMs: 120_000,
  captchaMinSolveMs: 600,
  maxChallengesPerMinute: 30,

  /* plumbing */
  store: null,
  maxEvents: 400,
  onEvent: null,
};

/* ------------------------------------------------------------- factory */

function createShield(userOptions = {}) {
  const cfg = { ...DEFAULTS, ...userOptions };
  const basePath = String(cfg.basePath || '/__shield').replace(/\/+$/, '') || '/__shield';
  const skipMatchers = toMatchers(cfg.skip);
  const sensitiveMatchers = toMatchers(cfg.sensitivePaths);

  const bus = new EventEmitter();
  bus.setMaxListeners(0);

  const store = cfg.store || new MemoryStore({
    staleMs: Math.max(cfg.windowMs, cfg.strikeWindowMs, cfg.notFoundWindowMs),
  });

  const captcha = new Captcha({
    secret: cfg.secret,
    ttlMs: cfg.captchaTtlMs,
    minSolveMs: cfg.captchaMinSolveMs,
  });

  const metrics = new Metrics({ maxEvents: cfg.maxEvents });

  const emit = (type, payload) => {
    const event = { type, at: Date.now(), ...payload };
    metrics.record(event);
    bus.emit('event', event);
    if (typeof cfg.onEvent === 'function') {
      try { cfg.onEvent(event); } catch { /* never break the request path */ }
    }
  };

  /* --------------------------------------------------------- helpers */

  const isSkipped = (req) => skipMatchers.some((re) => re.test(req.path));

  const logOnFinish = (req, res, ip) => {
    const start = process.hrtime.bigint();
    res.on('finish', () => {
      const ms = Number(process.hrtime.bigint() - start) / 1e6;
      if (res.statusCode === 404) {
        Promise.resolve(store.recordHit(`404:${ip}`, Date.now(), cfg.notFoundWindowMs)).catch(() => {});
      }
      emit('request', {
        ip,
        method: req.method,
        path: req.path,
        status: res.statusCode,
        ms: Math.round(ms),
        score: req.shield ? req.shield.score : 0,
        verdict: req.shield ? req.shield.verdict : 'allow',
      });
    });
  };

  const respondChallenge = (req, res, info) => {
    const target = `${basePath}/challenge?next=${encodeURIComponent(safeNext(req.originalUrl || '/'))}`;
    const retryAfter = Math.max(1, Math.ceil((info.until - Date.now()) / 1000));

    res.setHeader('Retry-After', String(retryAfter));
    res.setHeader('Cache-Control', 'no-store');

    if (wantsHtml(req)) return res.redirect(302, target);

    return res.status(info.status).json({
      error: info.code,
      message: 'Automated traffic detected. Complete the security check to continue.',
      reason: info.reason,
      score: req.shield ? req.shield.score : 0,
      retryAfter,
      challengeUrl: target,
    });
  };

  /* ------------------------------------------------------------ guard */

  async function guard(req, res, next) {
    metrics.inc('total');

    const ip = getClientIp(req, cfg);
    req.shield = { ip, score: 0, reasons: [], verdict: 'allow' };

    if (req.method === 'OPTIONS' || isSkipped(req)) {
      metrics.inc('allowed');
      return next();
    }

    metrics.trackRequest(req.path, ip);

    if (ipMatches(ip, cfg.allowlist)) {
      metrics.inc('allowed');
      req.shield.verdict = 'allowlisted';
      return next();
    }

    const now = Date.now();

    /* 1. Already blocked? Bail out immediately (cheapest path). */
    const block = await store.getBlock(ip);
    if (block) {
      metrics.inc('blocked');
      req.shield.verdict = 'blocked';
      return respondChallenge(req, res, {
        status: 403,
        code: 'ip_blocked',
        until: block.until,
        reason: block.reason,
      });
    }

    /* 2. Sliding-window counters. */
    const sensitive = sensitiveMatchers.some((re) => re.test(req.path));

    const { count } = await store.recordHit(`rl:${ip}`, now, cfg.windowMs);
    const { count: burst } = await store.recordHit(`burst:${ip}`, now, cfg.burstWindowMs);
    const notFound = await store.getCount(`404:${ip}`, now, cfg.notFoundWindowMs);

    const granted = (await store.getGrant(ip)) !== null;
    const multiplier = granted ? cfg.grantMultiplier : 1;

    const softLimit = (sensitive ? cfg.sensitiveSoftLimit : cfg.softLimit) * multiplier;
    const hardLimit = (sensitive ? cfg.sensitiveHardLimit : cfg.hardLimit) * multiplier;

    /* 3. Behavioural scoring. */
    const verdict = analyze(req, {
      path: req.path,
      count,
      burst,
      notFound,
      sensitive,
      burstExceeded: burst > cfg.burstLimit,
      notFoundExceeded: notFound > cfg.notFoundLimit,
    });

    req.shield.score = verdict.score;
    req.shield.reasons = verdict.reasons;

    /* 4. Decide. */
    let action = 'allow';
    let reason = null;

    if (verdict.score >= cfg.blockScore) {
      action = 'block';
      reason = verdict.reasons[0] || 'high bot score';
    } else if (count > hardLimit) {
      action = 'block';
      reason = `rate limit exceeded (${count} > ${hardLimit} in ${cfg.windowMs / 1000}s)`;
    } else if (granted && verdict.score < cfg.blockScore) {
      action = 'allow'; // CAPTCHA-passed humans get extra headroom
    } else if (verdict.score >= cfg.challengeScore) {
      action = 'challenge';
      reason = verdict.reasons[0] || 'suspicious traffic pattern';
    } else if (count > softLimit) {
      action = 'challenge';
      reason = `rate limit reached (${count} > ${softLimit} in ${cfg.windowMs / 1000}s)`;
    } else if (count > cfg.warnLimit) {
      action = 'warn';
    }

    /* 5. Escalate repeat offenders to a hard block. */
    if (action === 'challenge') {
      const strikes = await store.bump(ip, cfg.strikeWindowMs);
      if (strikes >= cfg.maxStrikes) {
        action = 'block';
        reason = `${strikes} repeated violations in ${cfg.strikeWindowMs / 60000} min`;
      }
    }

    /* 6. Enforce. */
    if (action === 'block') {
      const until = now + cfg.blockDurationMs;
      await store.setBlock(ip, {
        until,
        reason,
        score: verdict.score,
        count,
        by: 'auto',
      });

      metrics.inc('blocked');
      metrics.markLimited(ip, until);
      req.shield.verdict = 'blocked';

      emit('block', {
        ip,
        method: req.method,
        path: req.path,
        reason,
        score: verdict.score,
        count,
        until,
      });

      return respondChallenge(req, res, {
        status: 403,
        code: 'ip_blocked',
        until,
        reason,
      });
    }

    if (action === 'challenge') {
      metrics.inc('challenged');
      metrics.markLimited(ip, now + cfg.windowMs);
      req.shield.verdict = 'challenged';

      emit('challenge', {
        ip,
        method: req.method,
        path: req.path,
        reason,
        score: verdict.score,
        count,
      });

      return respondChallenge(req, res, {
        status: 429,
        code: 'challenge_required',
        until: now + cfg.windowMs,
        reason,
      });
    }

    if (action === 'warn') {
      metrics.inc('throttled');
      metrics.markLimited(ip, now + cfg.windowMs);
      req.shield.verdict = 'throttled';
      emit('throttle', { ip, method: req.method, path: req.path, count, score: verdict.score });
    } else {
      metrics.inc('allowed');
    }

    logOnFinish(req, res, ip);
    return next();
  }

  /* ------------------------------------------------------- admin routes */

  const router = express.Router();
  router.use(express.json({ limit: '32kb' }));

  const requireAdmin = (req, res, next) => {
    const supplied =
      req.get('x-shield-token') ||
      req.query.token ||
      (req.body && req.body.token) ||
      '';
    if (!cfg.adminToken || !safeEqual(supplied, cfg.adminToken)) {
      return res.status(401).json({ error: 'unauthorized' });
    }
    return next();
  };

  const snapshot = async () => {
    const blocks = await store.listBlocks();
    return {
      uptimeMs: Date.now() - metrics.startedAt,
      counters: { ...metrics.counters },
      rps: metrics.rps(),
      series: metrics.series(60),
      topIps: metrics.topIps(8),
      topPaths: metrics.topPaths(8),
      activeLimited: metrics.activeLimited(),
      blocks: blocks.sort((a, b) => b.until - a.until).slice(0, 100),
      recent: metrics.recent(40),
      config: {
        windowMs: cfg.windowMs,
        warnLimit: cfg.warnLimit,
        softLimit: cfg.softLimit,
        hardLimit: cfg.hardLimit,
        challengeScore: cfg.challengeScore,
        blockScore: cfg.blockScore,
        blockDurationMs: cfg.blockDurationMs,
        grantDurationMs: cfg.grantDurationMs,
      },
    };
  };

  /* --- pages --- */

  router.get('/', (req, res) => {
    res.type('html').send(DASHBOARD_HTML);
  });

  router.get('/challenge', (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.type('html').send(CHALLENGE_HTML);
  });

  /* --- captcha API --- */

  router.get('/api/challenge', async (req, res) => {
    const ip = getClientIp(req, cfg);
    const { count } = await store.recordHit(`cap:${ip}`, Date.now(), 60_000);

    if (count > cfg.maxChallengesPerMinute) {
      return res.status(429).json({ error: 'too_many_challenges', retryAfter: 60 });
    }

    res.setHeader('Cache-Control', 'no-store');
    return res.json(captcha.issue(ip));
  });

  router.post('/api/verify', async (req, res) => {
    const ip = getClientIp(req, cfg);
    const { token, answer, honeypot } = req.body || {};

    if (honeypot) {
      emit('captcha_failed', { ip, reason: 'honeypot' });
      return res.status(400).json({ ok: false, message: 'Verification failed.' });
    }

    const result = captcha.verify(token, answer, ip);

    if (!result.ok) {
      metrics.inc('captchaFailed');
      emit('captcha_failed', { ip, reason: result.reason });
      return res.status(400).json({
        ok: false,
        reason: result.reason,
        message: 'Verification failed — here is a fresh puzzle.',
      });
    }

    const until = Date.now() + cfg.grantDurationMs;
    await store.setGrant(ip, until);
    await store.deleteBlock(ip);
    await store.clearHits(`rl:${ip}`);
    await store.clearHits(`burst:${ip}`);
    await store.clearHits(`cap:${ip}`);
    await store.resetCounter(ip);

    metrics.inc('passed');
    emit('captcha_passed', { ip, until });

    return res.json({ ok: true, until });
  });

  /* --- admin API --- */

  router.get('/api/metrics', requireAdmin, async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.json(await snapshot());
  });

  router.get('/api/events', requireAdmin, async (req, res) => {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.write('retry: 3000\n\n');

    const send = (event, data) => {
      if (res.writableEnded) return;
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    /* 1. Send current metrics snapshot immediately. */
    send('metrics', await snapshot());

    /* 2. Replay recent event history (oldest -> newest) so the log isn't empty. */
    try {
      const recent = metrics.recent(40).reverse();
      for (const evt of recent) send('log', evt);
    } catch { /* never crash the SSE stream */ }

    /* 3. Live event listener with per-second budget for high-volume requests. */
    let requestBudget = 25;
    const budgetTimer = setInterval(() => { requestBudget = 25; }, 1000);

    const onEvent = (event) => {
      if (event.type === 'request') {
        if (requestBudget <= 0) return;
        requestBudget -= 1;
      }
      send('log', event);
    };

    bus.on('event', onEvent);

    /* 4. Periodic metrics refresh every 2 seconds. */
    const metricsTimer = setInterval(async () => {
      try { send('metrics', await snapshot()); } catch { /* ignore */ }
    }, 2000);

    /* 5. Keep-alive ping every 15 seconds to prevent proxy timeouts. */
    const pingTimer = setInterval(() => {
      if (!res.writableEnded) res.write(': ping\n\n');
    }, 15_000);

    /* 6. Cleanup on disconnect. */
    req.on('close', () => {
      clearInterval(budgetTimer);
      clearInterval(metricsTimer);
      clearInterval(pingTimer);
      bus.off('event', onEvent);
    });
  });

  router.post('/api/block', requireAdmin, async (req, res) => {
    const { ip, minutes = 15, reason = 'manual block' } = req.body || {};
    if (!ip || typeof ip !== 'string') {
      return res.status(400).json({ error: 'ip_required' });
    }
    const mins = Math.min(Math.max(Number(minutes) || 15, 1), 60 * 24 * 7);
    const until = Date.now() + mins * 60_000;

    await store.setBlock(ip, { until, reason, by: 'admin', score: null, count: null });
    metrics.inc('blocked');
    emit('block', { ip, reason, until, by: 'admin', manual: true });

    return res.json({ ok: true, ip, until, minutes: mins });
  });

  router.post('/api/unblock', requireAdmin, async (req, res) => {
    const { ip } = req.body || {};
    if (!ip || typeof ip !== 'string') {
      return res.status(400).json({ error: 'ip_required' });
    }

    await store.deleteBlock(ip);
    await store.clearHits(`rl:${ip}`);
    await store.clearHits(`burst:${ip}`);
    await store.resetCounter(ip);
    emit('unblock', { ip, by: 'admin' });

    return res.json({ ok: true, ip });
  });

  router.post('/api/reset', requireAdmin, async (req, res) => {
    const { ip } = req.body || {};
    if (!ip) return res.status(400).json({ error: 'ip_required' });
    await store.clearHits(`rl:${ip}`);
    await store.clearHits(`burst:${ip}`);
    await store.clearHits(`404:${ip}`);
    await store.resetCounter(ip);
    return res.json({ ok: true, ip });
  });

  /* -------------------------------------------------- the middleware */

  function shieldMiddleware(req, res, next) {
    const url = req.originalUrl || req.url || '/';

    if (url === basePath || url.startsWith(basePath + '/') || url.startsWith(basePath + '?')) {
      // Strip the base path so the router sees '/', '/challenge', '/api/metrics', etc.
      const savedUrl = req.url;
      req.url = url.slice(basePath.length) || '/';
      if (req.url === '') req.url = '/';

      return router(req, res, (err) => {
        req.url = savedUrl;
        next(err);
      });
    }

    return Promise.resolve(guard(req, res, next)).catch((err) => {
      // Fail OPEN: a bug in the shield must never take the app down.
      console.error('[shield] guard error:', err);
      next();
    });
  }

  shieldMiddleware.router = router;
  shieldMiddleware.store = store;
  shieldMiddleware.metrics = metrics;
  shieldMiddleware.config = cfg;
  shieldMiddleware.basePath = basePath;
  shieldMiddleware.close = async () => {
    if (typeof store.close === 'function') await store.close();
  };

  return shieldMiddleware;
}

/* --------------------------------------------------- embedded views */

const CHALLENGE_HTML = require('./views/challenge');
const DASHBOARD_HTML = require('./views/dashboard');

module.exports = { createShield, DEFAULTS };
