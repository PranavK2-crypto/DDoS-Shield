// shield/util.js
'use strict';

const crypto = require('crypto');

/** Constant-time string compare that also hides length. */
function safeEqual(a, b) {
  const ba = Buffer.from(String(a ?? ''), 'utf8');
  const bb = Buffer.from(String(b ?? ''), 'utf8');
  if (ba.length !== bb.length) {
    crypto.timingSafeEqual(ba, ba); // burn a comparison anyway
    return false;
  }
  return crypto.timingSafeEqual(ba, bb);
}

/** `::ffff:127.0.0.1` -> `127.0.0.1` */
function normalizeIp(ip) {
  if (!ip) return '0.0.0.0';
  const s = String(ip).trim();
  if (s.startsWith('::ffff:')) return s.slice(7);
  return s;
}

/**
 * Resolve the client IP.
 * X-Forwarded-For is ONLY honoured when `cfg.trustProxy` is true — otherwise a
 * client could spoof the header and bypass every rate limit.
 */
function getClientIp(req, cfg) {
  if (typeof cfg.clientIp === 'function') return normalizeIp(cfg.clientIp(req));

  let ip = null;
  if (cfg.trustProxy) {
    const xff = req.headers['x-forwarded-for'];
    if (xff) ip = String(xff).split(',')[0].trim();
    else if (req.headers['x-real-ip']) ip = String(req.headers['x-real-ip']).trim();
  }
  if (!ip) ip = (req.socket && req.socket.remoteAddress) || req.ip || '0.0.0.0';
  return normalizeIp(ip);
}

/** True when the caller is a browser navigating (wants an HTML page). */
function wantsHtml(req) {
  const accept = req.headers.accept || '';
  return accept.includes('text/html');
}

/** Only allow same-origin relative redirect targets. */
function safeNext(url) {
  if (typeof url !== 'string') return '/';
  if (!url.startsWith('/') || url.startsWith('//')) return '/';
  return url.slice(0, 512);
}

function ipv4ToInt(ip) {
  const parts = String(ip).split('.');
  if (parts.length !== 4) return null;
  let n = 0;
  for (const p of parts) {
    const v = Number(p);
    if (!Number.isInteger(v) || v < 0 || v > 255) return null;
    n = n * 256 + v;
  }
  return n >>> 0;
}

function cidrMatch(ip, cidr) {
  const [net, bitsRaw] = String(cidr).split('/');
  const bits = Number(bitsRaw);
  if (!Number.isInteger(bits) || bits < 0 || bits > 32) return false;
  const a = ipv4ToInt(ip);
  const b = ipv4ToInt(net);
  if (a === null || b === null) return false;
  if (bits === 0) return true;
  const mask = bits === 32 ? 0xffffffff : (~((1 << (32 - bits)) - 1)) >>> 0;
  return ((a & mask) >>> 0) === ((b & mask) >>> 0);
}

/** rules: array of exact IPs, IPv4 CIDRs, or predicate functions. */
function ipMatches(ip, rules) {
  if (!Array.isArray(rules) || rules.length === 0) return false;
  for (const rule of rules) {
    if (typeof rule === 'function') {
      try { if (rule(ip)) return true; } catch { /* ignore */ }
      continue;
    }
    if (typeof rule !== 'string') continue;
    if (rule === ip) return true;
    if (rule.includes('/') && cidrMatch(ip, rule)) return true;
  }
  return false;
}

/** Normalise string|RegExp path matchers into RegExps. */
function toMatchers(list) {
  if (!Array.isArray(list)) return [];
  return list.map((item) => {
    if (item instanceof RegExp) return item;
    if (typeof item === 'string') {
      // treat plain strings as prefix matches
      const esc = item.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      return new RegExp(`^${esc}`, 'i');
    }
    return /$^/; // never matches
  });
}

module.exports = {
  safeEqual,
  normalizeIp,
  getClientIp,
  wantsHtml,
  safeNext,
  ipMatches,
  cidrMatch,
  toMatchers,
};