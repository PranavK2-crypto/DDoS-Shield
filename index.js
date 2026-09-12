// shield/index.js
'use strict';

const { createShield } = require('./shield');
const { MemoryStore } = require('./stores/memory');

module.exports = { createShield, MemoryStore };

// Lazy-require Redis so the package has zero hard dependencies.
Object.defineProperty(module.exports, 'RedisStore', {
  enumerable: true,
  get() {
    return require('./stores/redis').RedisStore;
  },
});