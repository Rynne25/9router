"use client";

const cacheStore = new Map();
const inFlightStore = new Map();
const subscribersStore = new Map();

/**
 * Read cached data synchronously for instant initial state on tab switches.
 * @param {string} key
 * @param {number} [maxAgeMs=Infinity]
 * @returns {any}
 */
export function getCachedData(key, maxAgeMs = Infinity) {
  const entry = cacheStore.get(key);
  if (!entry) return undefined;
  if (Number.isFinite(maxAgeMs) && Date.now() - entry.updatedAt > maxAgeMs) {
    return undefined;
  }
  return entry.data;
}

/**
 * Check whether the cached entry exists and is within ttlMs.
 * @param {string} key
 * @param {number} [ttlMs=30000]
 * @returns {boolean}
 */
export function hasFreshCache(key, ttlMs = 30000) {
  const entry = cacheStore.get(key);
  return Boolean(entry && Date.now() - entry.updatedAt < ttlMs);
}

/**
 * Write data to the shared in-memory cache and notify subscribers.
 * @param {string} key
 * @param {any} data
 */
export function setCachedData(key, data) {
  cacheStore.set(key, { data, updatedAt: Date.now() });
  const listeners = subscribersStore.get(key);
  if (listeners) {
    for (const listener of listeners) {
      try {
        listener(data);
      } catch {
        /* ignore subscriber error */
      }
    }
  }
}

/**
 * Invalidate exact cache key or all keys matching a prefix.
 * @param {string} keyOrPrefix
 * @param {{ prefix?: boolean }} [options]
 */
export function invalidateCache(keyOrPrefix, { prefix = false } = {}) {
  if (!prefix) {
    cacheStore.delete(keyOrPrefix);
    return;
  }
  for (const key of cacheStore.keys()) {
    if (key.startsWith(keyOrPrefix)) {
      cacheStore.delete(key);
    }
  }
}

/**
 * Clear all cached entries and in-flight entries (primarily for tests).
 */
export function clearSwrCache() {
  cacheStore.clear();
  inFlightStore.clear();
}

/**
 * Subscribe to updates for a given cache key.
 * @param {string} key
 * @param {(data: any) => void} listener
 * @returns {() => void}
 */
export function subscribeCache(key, listener) {
  let set = subscribersStore.get(key);
  if (!set) {
    set = new Set();
    subscribersStore.set(key, set);
  }
  set.add(listener);
  return () => {
    set.delete(listener);
    if (set.size === 0) subscribersStore.delete(key);
  };
}

/**
 * Fetch and cache with in-flight request deduplication and TTL freshness.
 * @param {string} key
 * @param {() => Promise<any>} fetcher
 * @param {{ ttlMs?: number, force?: boolean }} [options]
 * @returns {Promise<any>}
 */
export async function fetchWithCache(key, fetcher, { ttlMs = 30000, force = false } = {}) {
  if (!force && hasFreshCache(key, ttlMs)) {
    return cacheStore.get(key).data;
  }
  if (inFlightStore.has(key)) {
    return inFlightStore.get(key);
  }

  const promise = new Promise((resolve) => resolve(fetcher()))
    .then((data) => {
      if (data !== undefined) {
        setCachedData(key, data);
      }
      return data;
    })
    .finally(() => {
      inFlightStore.delete(key);
    });

  inFlightStore.set(key, promise);
  return promise;
}

/**
 * Convenience JSON fetcher for GET endpoints.
 * @param {string} url
 * @param {RequestInit} [init]
 * @returns {Promise<any>}
 */
export async function fetchJson(url, init) {
  const res = await fetch(url, init);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
  return res.json();
}
