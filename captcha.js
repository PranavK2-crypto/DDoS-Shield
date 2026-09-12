// shield/captcha.js
'use strict';

const crypto = require('crypto');

const OPS = [
  { sym: '+', fn: (a, b) => a + b, range: [10, 49] },
  { sym: '−', fn: (a, b) => a - b, range: [10, 49] },
  { sym: '×', fn: (a, b) => a * b, range: [2, 12] },
];

const randInt = (lo, hi) => lo + Math.floor(Math.random() * (hi - lo + 1));

/**
 * Stateless, dependency-free arithmetic CAPTCHA.
 *
 * The answer is never stored: the token carries an HMAC of
 * `ip | answer | expiresAt | issuedAt`. Verification recomputes the HMAC with
 * the submitted answer, so the server needs no session table.
 */
class Captcha {
  constructor({ secret, ttlMs = 120_000, minSolveMs = 600 } = {}) {
    if (!secret) throw new Error('[shield] captcha requires a `secret`');
    this.secret = String(secret);
    this.ttlMs = ttlMs;
    this.minSolveMs = minSolveMs;
  }

  _sign(input) {
    return crypto.createHmac('sha256', this.secret).update(input).digest('hex').slice(0, 32);
  }

  /** @returns {{token:string, question:string, expiresAt:number}} */
  issue(ip) {
    const op = OPS[Math.floor(Math.random() * OPS.length)];
    const [lo, hi] = op.range;
    let a = randInt(lo, hi);
    let b = randInt(lo, hi);
    if (op.sym === '−' && b > a) [a, b] = [b, a];

    const answer = op.fn(a, b);
    const issuedAt = Date.now();
    const expiresAt = issuedAt + this.ttlMs;

    const payload = {
      i: ip,
      e: expiresAt,
      t: issuedAt,
      s: this._sign(`${ip}|${answer}|${expiresAt}|${issuedAt}`),
    };

    return {
      token: Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url'),
      question: `What is ${a} ${op.sym} ${b} ?`,
      expiresAt,
    };
  }

  /** @returns {{ok:boolean, reason?:string}} */
  verify(token, answer, ip) {
    if (typeof token !== 'string' || token.length > 1024) {
      return { ok: false, reason: 'malformed_token' };
    }

    let p;
    try {
      p = JSON.parse(Buffer.from(token, 'base64url').toString('utf8'));
    } catch {
      return { ok: false, reason: 'malformed_token' };
    }

    if (!p || typeof p !== 'object') return { ok: false, reason: 'malformed_token' };
    if (typeof p.s !== 'string' || typeof p.e !== 'number' || typeof p.t !== 'number') {
      return { ok: false, reason: 'malformed_token' };
    }
    if (p.i !== ip) return { ok: false, reason: 'ip_mismatch' };

    const now = Date.now();
    if (p.e < now) return { ok: false, reason: 'expired' };
    if (now - p.t < this.minSolveMs) return { ok: false, reason: 'too_fast' };

    const given = Number(String(answer ?? '').trim().replace(/[^0-9-]/g, ''));
    if (!Number.isFinite(given)) return { ok: false, reason: 'bad_answer' };

    const expected = this._sign(`${ip}|${given}|${p.e}|${p.t}`);
    const a = Buffer.from(expected, 'utf8');
    const b = Buffer.from(p.s, 'utf8');
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      return { ok: false, reason: 'wrong_answer' };
    }

    return { ok: true };
  }
}

module.exports = { Captcha };