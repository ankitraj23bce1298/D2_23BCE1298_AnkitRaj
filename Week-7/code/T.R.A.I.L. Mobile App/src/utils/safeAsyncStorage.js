// src/utils/safeAsyncStorage.js
// Lightweight safe wrapper: lazy-imports native AsyncStorage if available,
// otherwise uses an in-memory fallback so the app doesn't crash.

let native = null;
let warned = false;

function getNative() {
  if (native) return native;
  try {
    // lazy require: avoids crash at module import-time if native module is missing
    // eslint-disable-next-line global-require
    native = require('@react-native-async-storage/async-storage').default;
    return native;
  } catch (e) {
    if (!warned) {
      // log once so you know fallback is active
      // eslint-disable-next-line no-console
      console.warn('[safeAsyncStorage] Native AsyncStorage not available — using in-memory fallback.');
      warned = true;
    }
    return null;
  }
}

// in-memory fallback store (volatile)
const memoryStore = {};

const safe = {
  async getItem(key) {
    const n = getNative();
    if (n && n.getItem) return n.getItem(key);
    // fallback
    return memoryStore.hasOwnProperty(key) ? memoryStore[key] : null;
  },

  async setItem(key, value) {
    const n = getNative();
    if (n && n.setItem) return n.setItem(key, value);
    memoryStore[key] = value;
    return Promise.resolve();
  },

  async removeItem(key) {
    const n = getNative();
    if (n && n.removeItem) return n.removeItem(key);
    delete memoryStore[key];
    return Promise.resolve();
  },

  // helper to clear fallback memory (not touching native)
  async _clearMemoryFallback() {
    Object.keys(memoryStore).forEach(k => delete memoryStore[k]);
    return Promise.resolve();
  }
};

export default safe;
