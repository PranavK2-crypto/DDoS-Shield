// shield/stores/redis.js
'use strict';

const { createClient } = require('redis');

/* ------------------------------------------------------------------ Lua */

const RECORD_HIT = `
local key        = KEYS[1]
local now        = tonumber(ARGV[1])
local window     = tonumber(ARGV[2])
local maxEntries = tonumber(ARGV[3])
local member     = ARGV[4]

redis.call('ZREMRANGEBYSCORE', key, '-inf', now - window)
local count = redis.call('ZCARD', key)
if count < maxEntries then
  redis.call('ZADD', key, now, member)
  count = count + 1
end
redis.call('PEXPIRE', key, window + 5000)
return count
`;

const GET_COUNT = `
local key    = KEYS[1]
local now    = tonumber(ARGV[1])
local window = tonumber(ARGV[2])

redis.call('ZREMRANGEBYSCORE', key, '-inf', now - window)
local count = redis.call('ZCARD', key)
redis.call('PEXPIRE', key, window + 5000)
return count
`;

const BUMP = `
local v = redis.call('INCR', KEYS[1])
if v == 1 then
  redis.call('PEXPIRE', KEYS[1], tonumber(ARGV[1]))
end
return v
`;

/* --------------------------------------------------------------- Store */

class RedisStore {
  constructor(options = {}) {
    const {
      client,
      url = 'redis://127.0.0.1:6379',
      keyPrefix = 'shield:',
      windowMaxEntries = 10_000,
    } = options;

    this.prefix = keyPrefix;
    this.windowMaxEntries = windowMaxEntries;
    this._ownsClient = !client;
    this._seq = 0;
    this._ready = null;

    this.client = client || createClient({ url });
    if (this._ownsClient) {
      this.client.on('error', (err) => console.error('[shield:redis]', err.message));
    }
  }

  async _conn() {
    if (this.client.isOpen) return this.client;
    if (!this._ready) {
      this._ready = this.client.connect().catch((err) => {
        this._ready = null;
        throw err;
      });
    }
    await this._ready;
    return this.client;
  }

  _k(...parts) {
    return this.prefix + parts.join(':');
  }

  /* ------------------------------------------------ sliding window log */

  async recordHit(key, now, windowMs) {
    const c = await this._conn();
    const member = `${now}-${++this._seq}`;
    const count = await c.eval(RECORD_HIT, {
      keys: [this._k('rl', key)],
      arguments: [String(now), String(windowMs), String(this.windowMaxEntries), member],
    });
    return { count: Number(count), firstAt: now };
  }

  async getCount(key, now, windowMs) {
    const c = await this._conn();
    const count = await c.eval(GET_COUNT, {
      keys: [this._k('rl', key)],
      arguments: [String(now), String(windowMs)],
    });
    return Number(count);
  }

  async clearHits(key) {
    const c = await this._conn();
    await c.del(this._k('rl', key));
  }

  /* ------------------------------------------------------------ blocks */

  async setBlock(ip, info) {
    const c = await this._conn();
    const ttl = Math.max(1, info.until - Date.now());
    await c.set(this._k('block', ip), JSON.stringify({ ...info, createdAt: Date.now() }), { PX: ttl });
  }

  async getBlock(ip) {
    const c = await this._conn();
    const raw = await c.get(this._k('block', ip));
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  async deleteBlock(ip) {
    const c = await this._conn();
    return (await c.del(this._k('block', ip))) > 0;
  }

  async listBlocks() {
    const c = await this._conn();
    const pattern = this._k('block', '*');
    const keys = [];
    for await (const key of c.scanIterator({ MATCH: pattern, COUNT: 200 })) {
      keys.push(key);
      if (keys.length >= 500) break;
    }
    if (keys.length === 0) return [];

    const values = await c.mGet(keys);
    const now = Date.now();
    const out = [];
    keys.forEach((key, i) => {
      const raw = values[i];
      if (!raw) return;
      try {
        const parsed = JSON.parse(raw);
        if (parsed.until > now) out.push({ ip: key.slice(this._k('block').length + 1), ...parsed });
      } catch { /* ignore */ }
    });
    return out;
  }

  /* ------------------------------------------------------------ grants */

  async setGrant(ip, expiresAt) {
    const c = await this._conn();
    const ttl = Math.max(1, expiresAt - Date.now());
    await c.set(this._k('grant', ip), '1', { PX: ttl });
  }

  async getGrant(ip) {
    const c = await this._conn();
    const ttl = await c.pTTL(this._k('grant', ip));
    if (ttl <= 0) return null;
    return Date.now() + ttl;
  }

  async deleteGrant(ip) {
    const c = await this._conn();
    await c.del(this._k('grant', ip));
  }

  /* ---------------------------------------------------------- counters */

  async bump(key, ttlMs) {
    const c = await this._conn();
    const v = await c.eval(BUMP, { keys: [this._k('strike', key)], arguments: [String(ttlMs)] });
    return Number(v);
  }

  async getCounter(key) {
    const c = await this._conn();
    const raw = await c.get(this._k('strike', key));
    return raw ? Number(raw) : 0;
  }

  async resetCounter(key) {
    const c = await this._conn();
    await c.del(this._k('strike', key));
  }

  /* -------------------------------------------------------- maintenance */

  async stats() {
    const c = await this._conn();
    const info = await c.info('memory');
    const used = /used_memory_human:(\S+)/.exec(info);
    return { driver: 'redis', usedMemory: used ? used[1] : 'unknown' };
  }

  async close() {
    if (this._ownsClient && this.client.isOpen) await this.client.quit();
  }
}

module.exports = { RedisStore };