// server.js
'use strict';

require('dotenv').config?.();

const express = require('express');
const { createShield } = require('./shield');

const PORT = Number(process.env.PORT) || 3000;
const TRUST_PROXY = process.env.TRUST_PROXY === '1';

/* ------------------------------------------------------------------ store */

let store = null;
if (process.env.REDIS_URL) {
  const { RedisStore } = require('./shield/stores/redis');
  store = new RedisStore({ url: process.env.REDIS_URL });
  console.log('[shield] store: redis @', process.env.REDIS_URL);
} else {
  console.log('[shield] store: in-memory (single process)');
}

/* ----------------------------------------------------------------- shield */

const shield = createShield({
  adminToken: process.env.SHIELD_ADMIN_TOKEN || 'CodeNova2026',
  secret: process.env.SHIELD_SECRET || 'dev-hmac-secret-change-me',
  trustProxy: TRUST_PROXY,
  store,

  windowMs: 60_000,
  warnLimit: 10,
  softLimit: 20,
  hardLimit: 60,

  burstWindowMs: 2_000,
  burstLimit: 15,

  blockDurationMs: 2 * 60_000,   // short, so the demo is easy to replay
  grantDurationMs: 30 * 60_000,

  skip: ['/healthz', '/favicon.ico'],
  allowlist: (process.env.SHIELD_ALLOWLIST || '').split(',').map((s) => s.trim()).filter(Boolean),

  onEvent: (event) => {
    if (event.type === 'block') {
      console.warn('[shield] BLOCK', event.ip, '->', event.reason);
    }
  },
});

/* -------------------------------------------------------------------- app */

const app = express();
app.set('trust proxy', TRUST_PROXY);
app.disable('x-powered-by');

app.use(express.json({ limit: '64kb' }));

// 👇 the only line you need to protect the whole app
app.use(shield);

/* ---------------------------------------------------------------- routes */

app.get('/', (req, res) => {
  res.type('html').send(`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>DDoS Shield · Your Website's Bodyguard</title>
<script src="https://cdn.tailwindcss.com"></script>
<style>
  *, *::before, *::after { box-sizing: border-box; }
  html, body { min-height: 100%; margin: 0; }
  body {
    font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    background: #030617; color: #e2e8f0;
    overflow-x: hidden; position: relative;
  }

  /* ambient background */
  .bg-orbs { position: fixed; inset: 0; overflow: hidden; z-index: 0; pointer-events: none; }
  .orb { position: absolute; border-radius: 50%; filter: blur(100px); opacity: .35; will-change: transform; }
  .orb-a { width: 620px; height: 620px; background: radial-gradient(circle,#0ea5e9 0%,transparent 70%); top:-200px; left:-160px; animation: drift1 22s ease-in-out infinite; }
  .orb-b { width: 520px; height: 520px; background: radial-gradient(circle,#8b5cf6 0%,transparent 70%); bottom:-200px; right:-160px; animation: drift2 26s ease-in-out infinite; }
  .orb-c { width: 420px; height: 420px; background: radial-gradient(circle,#10b981 0%,transparent 70%); top:40%; left:55%; animation: drift3 30s ease-in-out infinite; }
  @keyframes drift1 { 0%,100% { transform: translate(0,0) scale(1);} 50% { transform: translate(60px,40px) scale(1.1);} }
  @keyframes drift2 { 0%,100% { transform: translate(0,0) scale(1);} 50% { transform: translate(-60px,-40px) scale(1.12);} }
  @keyframes drift3 { 0%,100% { transform: translate(0,0) scale(1);} 50% { transform: translate(40px,-60px) scale(.94);} }

  .grid-overlay {
    position: fixed; inset: 0; z-index: 1; pointer-events: none;
    background-image:
      linear-gradient(rgba(148,163,184,.045) 1px, transparent 1px),
      linear-gradient(90deg, rgba(148,163,184,.045) 1px, transparent 1px);
    background-size: 44px 44px;
    -webkit-mask-image: radial-gradient(circle at 50% 0%, black 20%, transparent 85%);
    mask-image: radial-gradient(circle at 50% 0%, black 20%, transparent 85%);
  }

  /* glass card */
  .glass {
    background: rgba(15,23,42,.72);
    border: 1px solid rgba(148,163,184,.16);
    border-radius: 18px;
    backdrop-filter: blur(16px) saturate(140%);
    -webkit-backdrop-filter: blur(16px) saturate(140%);
    box-shadow: 0 10px 40px rgba(0,0,0,.35);
    transition: transform .25s ease, border-color .25s ease, box-shadow .25s ease;
  }
  .glass-hover:hover {
    transform: translateY(-4px);
    border-color: rgba(56,189,248,.4);
    box-shadow: 0 20px 60px rgba(0,0,0,.5), 0 0 40px rgba(56,189,248,.1);
  }

  .enter { animation: enter .7s cubic-bezier(.16,1,.3,1) both; }
  @keyframes enter { from { opacity:0; transform: translateY(24px);} to { opacity:1; transform: translateY(0);} }

  /* hero */
  .hero-badge {
    display:inline-flex; align-items:center; justify-content:center;
    width: 88px; height: 88px; border-radius: 24px;
    background: linear-gradient(135deg, rgba(56,189,248,.2), rgba(139,92,246,.2));
    border: 1px solid rgba(56,189,248,.35);
    font-size: 44px;
    animation: heroPulse 3s ease-in-out infinite;
    margin-bottom: 24px;
  }
  @keyframes heroPulse {
    0%,100% { box-shadow: 0 0 0 0 rgba(56,189,248,.4), 0 0 30px rgba(56,189,248,.3); }
    50%     { box-shadow: 0 0 0 20px rgba(56,189,248,0), 0 0 60px rgba(56,189,248,.6); }
  }

  .hero-title {
    font-size: clamp(32px, 5vw, 56px);
    font-weight: 800;
    letter-spacing: -0.03em;
    line-height: 1.05;
    background: linear-gradient(135deg, #e2e8f0 0%, #7dd3fc 40%, #a78bfa 80%);
    -webkit-background-clip: text; background-clip: text;
    -webkit-text-fill-color: transparent;
    background-size: 200% 200%;
    animation: gradShift 8s ease infinite;
  }
  @keyframes gradShift { 0%,100% { background-position: 0% 50%;} 50% { background-position: 100% 50%;} }

  /* step numbers */
  .step-num {
    display:inline-flex; align-items:center; justify-content:center;
    width: 44px; height: 44px; border-radius: 14px;
    font-weight: 800; font-size: 20px;
    background: linear-gradient(135deg, rgba(56,189,248,.18), rgba(139,92,246,.18));
    border: 1px solid rgba(56,189,248,.35);
    color: #7dd3fc;
    box-shadow: 0 0 20px rgba(56,189,248,.2);
    transition: transform .3s ease;
  }
  .glass-hover:hover .step-num { transform: scale(1.1) rotate(-4deg); }

  .step-icon {
    font-size: 30px;
    display: inline-block;
    transition: transform .3s ease;
  }
  .glass-hover:hover .step-icon { transform: scale(1.15); }

  /* buttons */
  .btn {
    position: relative; overflow: hidden; display: inline-flex; align-items: center; gap: 8px;
    padding: 14px 26px; border-radius: 12px; font-weight: 600; font-size: 15px;
    text-decoration: none; color: white; border: none; cursor: pointer;
    transition: transform .2s ease, box-shadow .25s ease;
  }
  .btn:hover { transform: translateY(-2px); box-shadow: 0 12px 36px rgba(0,0,0,.4); }
  .btn:active { transform: translateY(0); }
  .btn-primary {
    background: linear-gradient(135deg, #0ea5e9, #6366f1);
    background-size: 200% 200%;
    animation: gradMove 6s ease infinite;
    box-shadow: 0 10px 30px rgba(56,189,248,.3);
  }
  .btn-ghost {
    background: rgba(30,41,59,.7);
    border: 1px solid rgba(148,163,184,.25);
  }
  .btn-ghost:hover { border-color: rgba(56,189,248,.5); }
  @keyframes gradMove { 0%,100% { background-position: 0% 50%;} 50% { background-position: 100% 50%;} }

  /* connection pill */
  .live-pill {
    display: inline-flex; align-items: center; gap: 8px;
    padding: 8px 16px; border-radius: 999px;
    background: rgba(15,23,42,.7);
    border: 1px solid rgba(148,163,184,.18);
    font-size: 13px; color: #94a3b8;
  }
  .pulse-dot {
    display: inline-block; width: 8px; height: 8px; border-radius: 50%;
    background: #34d399; box-shadow: 0 0 10px #34d399;
    animation: pulse 1.8s ease-in-out infinite;
  }
  @keyframes pulse { 0%,100% { opacity:1; transform: scale(1);} 50% { opacity:.5; transform: scale(.8);} }

  /* info panel */
  .tip-box {
    background: linear-gradient(135deg, rgba(56,189,248,.08), rgba(139,92,246,.08));
    border: 1px solid rgba(56,189,248,.2);
    border-radius: 14px;
    padding: 18px 22px;
  }

  /* badge chips */
  .chip {
    display: inline-flex; align-items: center; gap: 6px;
    padding: 5px 12px; border-radius: 999px; font-size: 11px;
    font-weight: 600; letter-spacing: .03em;
    background: rgba(56,189,248,.12);
    border: 1px solid rgba(56,189,248,.25);
    color: #7dd3fc;
  }
  .chip-green { background: rgba(52,211,153,.12); border-color: rgba(52,211,153,.3); color: #6ee7b7; }
  .chip-purple{ background: rgba(167,139,250,.12); border-color: rgba(167,139,250,.3); color: #c4b5fd; }
</style>
</head>
<body>

<div class="bg-orbs" aria-hidden="true">
  <div class="orb orb-a"></div>
  <div class="orb orb-b"></div>
  <div class="orb orb-c"></div>
</div>
<div class="grid-overlay" aria-hidden="true"></div>

<main class="relative z-10 max-w-5xl mx-auto px-5 py-14">

  <!-- HERO -->
  <section class="text-center mb-14 enter">
    <div class="hero-badge">🛡️</div>
    <h1 class="hero-title mb-4">DDoS Shield</h1>
    <p class="text-lg md:text-xl text-slate-400 max-w-2xl mx-auto leading-relaxed">
      Your website's invisible bodyguard. It watches every visitor, spots the bad ones, and keeps your app safe — <span class="text-slate-200 font-medium">automatically</span>.
    </p>

    <div class="flex flex-wrap items-center justify-center gap-3 mt-8">
      <span class="chip"><span class="pulse-dot"></span> Active now</span>
      <span class="chip chip-green">✓ Zero configuration</span>
      <span class="chip chip-purple">⚡ Blazing fast</span>
    </div>

    <div class="flex flex-wrap items-center justify-center gap-4 mt-10">
      <a href="${shield.basePath}/" class="btn btn-primary">
        📊 Open Live Dashboard →
      </a>
      <a href="/api/data" class="btn btn-ghost">
        🔌 Test the API
      </a>
    </div>
  </section>

  <!-- YOUR VISITOR CARD -->
  <section class="glass p-6 mb-12 enter" style="animation-delay:.1s">
    <div class="flex items-center justify-between flex-wrap gap-4">
      <div>
        <div class="text-xs uppercase tracking-widest text-slate-500 mb-1">Your visit</div>
        <div class="font-mono text-lg text-slate-200">${req.shield.ip}</div>
      </div>
      <div class="text-right">
        <div class="text-xs uppercase tracking-widest text-slate-500 mb-1">Verdict</div>
        <div class="font-mono text-lg text-emerald-400">${req.shield.verdict}</div>
      </div>
      <div class="text-right">
        <div class="text-xs uppercase tracking-widest text-slate-500 mb-1">Suspicion score</div>
        <div class="font-mono text-lg text-sky-400">${req.shield.score} / 85</div>
      </div>
    </div>
  </section>

  <!-- HOW IT WORKS -->
  <section class="mb-12">
    <div class="text-center mb-10 enter" style="animation-delay:.15s">
      <div class="text-xs uppercase tracking-[0.3em] text-sky-400 mb-3">How it works</div>
      <h2 class="text-3xl md:text-4xl font-bold tracking-tight mb-3">
        Think of it as a <span class="text-sky-400">nightclub bouncer</span> for your website
      </h2>
      <p class="text-slate-400 max-w-2xl mx-auto">
        Every visitor has to pass the bouncer before they can enter. Here's what happens in the 5 steps below — all in a few milliseconds.
      </p>
    </div>

    <div class="grid md:grid-cols-2 lg:grid-cols-3 gap-5">

      <!-- Step 1 -->
      <div class="glass glass-hover p-6 enter" style="animation-delay:.2s">
        <div class="flex items-center gap-3 mb-4">
          <div class="step-num">1</div>
          <div class="step-icon">🔍</div>
        </div>
        <h3 class="font-semibold text-lg mb-2">We watch every request</h3>
        <p class="text-sm text-slate-400 leading-relaxed">
          When someone visits your site, we look at their "ID card" — what browser they use, which headers they send, and where they came from. Real humans look normal. Bots don't.
        </p>
      </div>

      <!-- Step 2 -->
      <div class="glass glass-hover p-6 enter" style="animation-delay:.25s">
        <div class="flex items-center gap-3 mb-4">
          <div class="step-num">2</div>
          <div class="step-icon">🤖</div>
        </div>
        <h3 class="font-semibold text-lg mb-2">We spot the robots</h3>
        <p class="text-sm text-slate-400 leading-relaxed">
          If someone is using a tool like <code class="text-rose-400 text-xs">curl</code>, <code class="text-rose-400 text-xs">sqlmap</code> or a Python script instead of a real browser, we notice. We know over 40 known bot signatures by heart.
        </p>
      </div>

      <!-- Step 3 -->
      <div class="glass glass-hover p-6 enter" style="animation-delay:.3s">
        <div class="flex items-center gap-3 mb-4">
          <div class="step-num">3</div>
          <div class="step-icon">📊</div>
        </div>
        <h3 class="font-semibold text-lg mb-2">We count every visit</h3>
        <p class="text-sm text-slate-400 leading-relaxed">
          A normal user visits a page a few times a minute. An attacker sends <strong class="text-slate-200">hundreds per second</strong>. We keep a live tally of everyone's traffic in memory — no database required.
        </p>
      </div>

      <!-- Step 4 -->
      <div class="glass glass-hover p-6 enter" style="animation-delay:.35s">
        <div class="flex items-center gap-3 mb-4">
          <div class="step-num">4</div>
          <div class="step-icon">🧩</div>
        </div>
        <h3 class="font-semibold text-lg mb-2">We ask: "Are you human?"</h3>
        <p class="text-sm text-slate-400 leading-relaxed">
          If something looks suspicious, we don't just block — we show a <strong class="text-slate-200">simple math puzzle</strong>. A real person solves it in 2 seconds. A bot gets stuck forever. Solve it → you get a 30-minute VIP pass.
        </p>
      </div>

      <!-- Step 5 -->
      <div class="glass glass-hover p-6 enter md:col-span-2 lg:col-span-1" style="animation-delay:.4s">
        <div class="flex items-center gap-3 mb-4">
          <div class="step-num">5</div>
          <div class="step-icon">🚫</div>
        </div>
        <h3 class="font-semibold text-lg mb-2">Repeat offenders get blocked</h3>
        <p class="text-sm text-slate-400 leading-relaxed">
          Fail 3 puzzles? Send more than 60 requests a minute? You're banned for 5 minutes. The ban auto-lifts, so innocent users are never permanently locked out.
        </p>
      </div>

      <!-- Summary card -->
      <div class="glass p-6 enter" style="animation-delay:.45s; background: linear-gradient(135deg, rgba(56,189,248,.08), rgba(139,92,246,.08));">
        <div class="step-icon mb-3">⚡</div>
        <h3 class="font-semibold text-lg mb-2 text-sky-300">All this in &lt; 5 ms</h3>
        <p class="text-sm text-slate-400 leading-relaxed">
          The whole process happens in a few milliseconds, before your app even knows someone knocked. No lag, no downtime, no delay for real users.
        </p>
      </div>
    </div>
  </section>

  <!-- WHO IS IT FOR -->
  <section class="mb-12">
    <div class="text-center mb-8 enter" style="animation-delay:.5s">
      <div class="text-xs uppercase tracking-[0.3em] text-purple-400 mb-2">Real-world protection</div>
      <h2 class="text-2xl md:text-3xl font-bold tracking-tight mb-2">
        What threats does it stop?
      </h2>
    </div>

    <div class="grid md:grid-cols-2 gap-4">
      <div class="glass glass-hover p-5 enter flex items-start gap-4" style="animation-delay:.55s">
        <div class="text-3xl">💥</div>
        <div>
          <h3 class="font-semibold mb-1">DDoS attacks</h3>
          <p class="text-sm text-slate-400">Floods of fake traffic that try to crash your server.</p>
        </div>
      </div>
      <div class="glass glass-hover p-5 enter flex items-start gap-4" style="animation-delay:.6s">
        <div class="text-3xl">🔐</div>
        <div>
          <h3 class="font-semibold mb-1">Brute-force logins</h3>
          <p class="text-sm text-slate-400">Bots trying thousands of passwords on your login page.</p>
        </div>
      </div>
      <div class="glass glass-hover p-5 enter flex items-start gap-4" style="animation-delay:.65s">
        <div class="text-3xl">🔎</div>
        <div>
          <h3 class="font-semibold mb-1">Vulnerability scanners</h3>
          <p class="text-sm text-slate-400">Tools hunting for <code class="text-rose-400 text-xs">.env</code>, <code class="text-rose-400 text-xs">wp-admin</code> and other weak spots.</p>
        </div>
      </div>
      <div class="glass glass-hover p-5 enter flex items-start gap-4" style="animation-delay:.7s">
        <div class="text-3xl">🕷️</div>
        <div>
          <h3 class="font-semibold mb-1">Scrapers &amp; spam bots</h3>
          <p class="text-sm text-slate-400">Programs that steal your content or flood your forms.</p>
        </div>
      </div>
    </div>
  </section>

  <!-- TRY IT -->
  <section class="glass p-8 text-center enter" style="animation-delay:.75s; background: linear-gradient(135deg, rgba(56,189,248,.06), rgba(139,92,246,.06));">
    <div class="text-4xl mb-3">🧪</div>
    <h2 class="text-2xl font-bold mb-2">Want to see it in action?</h2>
    <p class="text-slate-400 mb-6 max-w-xl mx-auto">
      Click the buttons below. The dashboard shows live traffic and blocked IPs. The "Test the API" button sends a real request — repeat it 20 times fast and you'll meet the CAPTCHA.
    </p>
    <div class="flex flex-wrap items-center justify-center gap-4">
      <a href="${shield.basePath}/" class="btn btn-primary">📊 Open Dashboard</a>
      <a href="/api/data" class="btn btn-ghost">🔌 Test the API</a>
    </div>
  </section>

  <footer class="text-center text-xs text-slate-600 mt-14">
    Built with 🛡️ by Team · Node.js + Express · No external dependencies
  </footer>

</main>

</body>
</html>`);
});

app.get('/api/data', (req, res) => {
  res.json({
    ok: true,
    ts: Date.now(),
    ip: req.shield.ip,
    score: req.shield.score,
    verdict: req.shield.verdict,
    data: Array.from({ length: 10 }, (_, i) => ({ id: i, value: Math.random().toFixed(4) })),
  });
});

app.post('/api/auth/login', (req, res) => {
  res.json({ ok: true, token: 'demo-session-token', ip: req.shield.ip });
});

app.get('/healthz', (req, res) => res.json({ ok: true }));

/* ------------------------------------------------------------------ boot */

const server = app.listen(PORT, () => {
  console.log('');
  console.log('  🛡️  DDoS Shield demo running');
  console.log('  ─────────────────────────────────────────────');
  console.log(`  App        : http://localhost:${PORT}/`);
  console.log(`  Dashboard  : http://localhost:${PORT}${shield.basePath}/`);
  console.log(`  Admin token: ${shield.config.adminToken}`);
  console.log('');
});

async function shutdown() {
  server.close();
  await shield.close();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);