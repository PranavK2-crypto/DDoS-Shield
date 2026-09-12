// shield/metrics.js
'use strict';

const MAX_TRACKED_KEYS = 5000;

class Metrics {
  constructor({ maxEvents = 400 } = {}) {
    this.startedAt = Date.now();
    this.maxEvents = maxEvents;

    this.counters = {
      total: 0,
      allowed: 0,
      throttled: 0,
      challenged: 0,
      blocked: 0,
      passed: 0,
      captchaFailed: 0,
    };

    this._events = [];
    this._ips = new Map();
    this._paths = new Map();
    this._buckets = new Map(); // epochSecond -> request count
    this._limited = new Map(); // ip -> expiresAt
  }

  inc(key, n = 1) {
    this.counters[key] = (this.counters[key] || 0) + n;
  }

  trackRequest(pathname, ip) {
    if (this._ips.size > MAX_TRACKED_KEYS) this._ips.clear();
    if (this._paths.size > MAX_TRACKED_KEYS) this._paths.clear();

    this._ips.set(ip, (this._ips.get(ip) || 0) + 1);
    this._paths.set(pathname, (this._paths.get(pathname) || 0) + 1);

    const sec = Math.floor(Date.now() / 1000);
    this._buckets.set(sec, (this._buckets.get(sec) || 0) + 1);
    if (this._buckets.size > 180) {
      for (const key of this._buckets.keys()) {
        if (key < sec - 179) this._buckets.delete(key);
      }
    }
  }

  markLimited(ip, expiresAt) {
    this._limited.set(ip, expiresAt);
  }

  activeLimited() {
    const now = Date.now();
    const out = [];
    for (const [ip, exp] of this._limited) {
      if (exp > now) out.push(ip);
      else this._limited.delete(ip);
    }
    return out;
  }

  rps() {
    const sec = Math.floor(Date.now() / 1000);
    return this._buckets.get(sec - 1) || this._buckets.get(sec) || 0;
  }

  series(seconds = 60) {
    const sec = Math.floor(Date.now() / 1000);
    const out = new Array(seconds);
    for (let i = 0; i < seconds; i++) out[i] = this._buckets.get(sec - (seconds - 1 - i)) || 0;
    return out;
  }

  topIps(n = 10) {
    return [...this._ips.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, n)
      .map(([ip, count]) => ({ ip, count }));
  }

  topPaths(n = 10) {
    return [...this._paths.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, n)
      .map(([path, count]) => ({ path, count }));
  }

  record(event) {
    this._events.push(event);
    if (this._events.length > this.maxEvents) this._events.shift();
  }

  recent(n = 40) {
    return this._events.slice(-n).reverse();
  }
}

module.exports = { Metrics };