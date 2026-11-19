import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  getCachedData,
  setCachedData,
  hasFreshCache,
  invalidateCache,
  clearSwrCache,
  subscribeCache,
  fetchWithCache,
} from "../../src/shared/utils/swrCache.js";

describe("swrCache", () => {
  beforeEach(() => {
    clearSwrCache();
  });

  it("caches fetched results within ttlMs and returns synchronously via getCachedData", async () => {
    const fetcher = vi.fn(async () => ({ items: [1, 2, 3] }));

    const first = await fetchWithCache("/api/test", fetcher, { ttlMs: 10000 });
    const second = await fetchWithCache("/api/test", fetcher, { ttlMs: 10000 });

    expect(first).toEqual({ items: [1, 2, 3] });
    expect(second).toEqual({ items: [1, 2, 3] });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(getCachedData("/api/test")).toEqual({ items: [1, 2, 3] });
    expect(hasFreshCache("/api/test", 10000)).toBe(true);
  });

  it("coalesces concurrent in-flight fetches for the same key", async () => {
    let resolveFetch;
    const fetcher = vi.fn(
      () =>
        new Promise((resolve) => {
          resolveFetch = resolve;
        })
    );

    const p1 = fetchWithCache("/api/tunnel/status", fetcher, { ttlMs: 3000 });
    const p2 = fetchWithCache("/api/tunnel/status", fetcher, { ttlMs: 3000 });

    expect(fetcher).toHaveBeenCalledTimes(1);
    resolveFetch({ tunnel: { enabled: true } });

    const [r1, r2] = await Promise.all([p1, p2]);
    expect(r1).toEqual({ tunnel: { enabled: true } });
    expect(r2).toEqual({ tunnel: { enabled: true } });
  });

  it("bypasses fresh cache when force is true", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 2 });

    await fetchWithCache("/api/keys", fetcher, { ttlMs: 30000 });
    const forced = await fetchWithCache("/api/keys", fetcher, {
      ttlMs: 30000,
      force: true,
    });

    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(forced).toEqual({ count: 2 });
  });

  it("notifies subscribers on setCachedData and supports prefix invalidation", () => {
    const listener = vi.fn();
    const unsub = subscribeCache("/api/usage/stats?period=today", listener);

    setCachedData("/api/usage/stats?period=today", { total: 42 });
    setCachedData("/api/usage/stats?period=7d", { total: 100 });

    expect(listener).toHaveBeenCalledWith({ total: 42 });
    unsub();

    invalidateCache("/api/usage/stats", { prefix: true });
    expect(getCachedData("/api/usage/stats?period=today")).toBeUndefined();
    expect(getCachedData("/api/usage/stats?period=7d")).toBeUndefined();
  });

  it("handles object wrapped payload like { keys: [...] } without breaking array consumers", () => {
    setCachedData("/api/keys", { keys: [{ id: "k1", name: "Default" }] });
    const cached = getCachedData("/api/keys");
    const extractedKeys = Array.isArray(cached?.keys)
      ? cached.keys
      : Array.isArray(cached)
        ? cached
        : [];

    expect(Array.isArray(extractedKeys)).toBe(true);
    expect(extractedKeys).toHaveLength(1);
    expect(extractedKeys[0].id).toBe("k1");
  });
});
