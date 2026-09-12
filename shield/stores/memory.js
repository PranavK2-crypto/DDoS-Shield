// shield/stores/memory.js
'use strict';

/**
 * In-memory store — zero dependencies, single process.
 * Swap for RedisStore when running more than one instance.
 */
class MemoryStore {
  constructor(options = {}) {
    this.windowMaxEntries = options.windowMaxEntries ?? 10_000;
    this.staleMs = options.staleMs ?? 15 * 60_000;

    this._hits = new Map();     // key -> ascending number[] of timestamps
    this._blocks = new Map();   // ip  -> { until, reason, score, by, createdAt }
    this._grants = new Map();   // ip  -> expiresAt
    this._counters = new Map(); // key -> { value, expiresAt }

    const sweepMs = options.sweepIntervalMs ?? 30_000;
    this._timer = setInterval(() => this.sweep(), sweepMs);
    if (this._timer.unref) this._timer.unref();
  }

  /* -------------------------------------------------- sliding window log */

  recordHit(key, now, windowMs) {
    let stamps = this._hits.get(key);
    if (!stamps) {
      stamps = [];
      this._hits.set(key, stamps);
    }

    const cutoff = now - windowMs;
    let drop = 0;
    while (drop < stamps.length && stamps[drop] <= cutoff) drop++;
    if (drop > 0) stamps.splice(0, drop);

    // Hard cap prevents a single abusive IP from exhausting memory.
    if (stamps.length < this.windowMaxEntries) stamps.push(now);

    return { count: stamps.length, firstAt: stamps.length ? stamps[0] : now };
  }

  getCount(key, now, windowMs) {
    const stamps = this._hits.get(key);
    if (!stamps || stamps.length === 0) return 0;

    const cutoff = now - windowMs;
    let drop = 0;
    while (drop < stamps.length && stamps[drop] <= cutoff) drop++;
    if (drop > 0) stamps.splice(0, drop);
    if (stamps.length === 0) this._hits.delete(key);

    return stamps.length;
  }

  clearHits(key) {
    this._hits.delete(key);
  }

  /* ------------------------------------------------------------- blocks */

  setBlock(ip, info) {
    this._blocks.set(ip, { ...info, createdAt: Date.now() });
  }

  getBlock(ip) {
    const b = this._blocks.get(ip);
    if (!b) return null;
    if (b.until <= Date.now()) {
      this._blocks.delete(ip);
      return null;
    }
    return b;
  }

  deleteBlock(ip) {
    return this._blocks.delete(ip);
  }

  listBlocks() {
    const now = Date.now();
    const out = [];
    for (const [ip, b] of this._blocks) {
      if (b.until <= now) {
        this._blocks.delete(ip);
        continue;
      }
      out.push({ ip, ...b });
    }
    return out;
  }

  /* ------------------------------------------------------- grants (CAPTCHA) */

  setGrant(ip, expiresAt) {
    this._grants.set(ip, expiresAt);
  }

  getGrant(ip) {
    const exp = this._grants.get(ip);
    if (!exp) return null;
    if (exp <= Date.now()) {
      this._grants.delete(ip);
      return null;
    }
    return exp;
  }

  deleteGrant(ip) {
    return this._grants.delete(ip);
  }

  /* ----------------------------------------------------------- counters */

  bump(key, ttlMs) {
    const now = Date.now();
    let entry = this._counters.get(key);
    if (!entry || entry.expiresAt <= now) entry = { value: 0, expiresAt: now + ttlMs };
    entry.value += 1;
    this._counters.set(key, entry);
    return entry.value;
  }

  getCounter(key) {
    const entry = this._counters.get(key);
    if (!entry || entry.expiresAt <= Date.now()) return 0;
    return entry.value;
  }

  resetCounter(key) {
    this._counters.delete(key);
  }

  /* -------------------------------------------------------- maintenance */

  sweep() {
    const now = Date.now();
    const cutoff = now - this.staleMs;

    for (const [ip, b] of this._blocks) if (b.until <= now) this._blocks.delete(ip);
    for (const [ip, exp] of this._grants) if (exp <= now) this._grants.delete(ip);
    for (const [k, e] of this._counters) if (e.expiresAt <= now) this._counters.delete(k);

    for (const [key, stamps] of this._hits) {
      let drop = 0;
      while (drop < stamps.length && stamps[drop] <= cutoff) drop++;
      if (drop > 0) stamps.splice(0, drop);
      if (stamps.length === 0) this._hits.delete(key);
    }
  }

  stats() {
    return {
      driver: 'memory',
      windows: this._hits.size,
      blocks: this._blocks.size,
      grants: this._grants.size,
      counters: this._counters.size,
    };
  }

  async close() {
    clearInterval(this._timer);
  }
}

module.exports = { MemoryStore };