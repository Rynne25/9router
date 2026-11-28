"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { fetchWithCache, fetchJson } from "@/shared/utils/swrCache";
import useSettingsStore from "@/store/settingsStore";
import {
  CONNECTIONS_PAGE_SIZE,
  QUOTA_CACHE_KEY,
  parseQuotaData,
  getSafePagination,
  getSafeTotals,
  getPaginationPageValue,
  getProviderOptions,
  QUOTA_FRESH_TTL_MS,
  isQuotaCacheFresh,
  getQuotaCache,
  setQuotaCache,
  getQuotaVisibilityKey,
  buildConnectionsCacheKey,
  getMemoryConnectionsCache,
  readConnectionsStorageCache,
  writeConnectionsStorageCache,
  filterConnectionsClientSide,
  sortConnectionsEnhanced,
  computeQuotaSummaryStats,
} from "../utils";

async function runQuotaQueue(items, concurrency, signal, worker) {
  if (!Array.isArray(items) || items.length === 0) return;
  let index = 0;
  const workerCount = Math.min(concurrency, items.length);
  const runners = Array.from({ length: workerCount }, async () => {
    while (index < items.length) {
      if (signal?.aborted) return;
      const current = items[index];
      index += 1;
      await worker(current);
    }
  });
  await Promise.all(runners);
}

function toggleProviderHiddenQuota(previous, provider, quota, shouldHide) {
  const key = getQuotaVisibilityKey(quota);
  if (!provider || !key) return null;

  const providerVisibility = previous[provider] || {};
  const hidden = new Set(providerVisibility.hidden || []);
  if (shouldHide) {
    hidden.add(key);
  } else {
    hidden.delete(key);
  }

  if (provider === "antigravity") {
    const isGeminiFamily = key === "gemini" || key === "gemini_session" || key === "gemini_weekly";
    const isClaudeFamily = key === "claude" || key === "claude_gpt_session" || key === "claude_gpt_weekly";

    if (!shouldHide) {
      if (isGeminiFamily) {
        hidden.delete("gemini");
        hidden.delete("gemini_session");
        hidden.delete("gemini_weekly");
        for (const k of hidden) {
          if (k.startsWith("gemini-") && !k.includes("image")) hidden.delete(k);
        }
      } else if (isClaudeFamily) {
        hidden.delete("claude");
        hidden.delete("claude_gpt_session");
        hidden.delete("claude_gpt_weekly");
        for (const k of hidden) {
          if (k.startsWith("claude-")) hidden.delete(k);
        }
      }
    } else {
      if (isGeminiFamily) {
        hidden.add("gemini");
        hidden.add("gemini_session");
      } else if (isClaudeFamily) {
        hidden.add("claude");
        hidden.add("claude_gpt_session");
      }
    }
  }

  return {
    ...previous,
    [provider]: {
      ...providerVisibility,
      hidden: [...hidden],
    },
  };
}

export function useProviderLimitsData({ providerFilter }) {
  const [accountFilter, setAccountFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [tierFilter, setTierFilter] = useState("all");
  const [healthFilter, setHealthFilter] = useState("all");
  const [quotaSortMode, setQuotaSortMode] = useState("default");
  const [expiringFirst, setExpiringFirst] = useState(false);

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(CONNECTIONS_PAGE_SIZE);
  const [customPageSizeInput, setCustomPageSizeInput] = useState(
    String(CONNECTIONS_PAGE_SIZE),
  );

  const cacheKey = useMemo(
    () => buildConnectionsCacheKey({ providerFilter, accountFilter, page, pageSize }),
    [providerFilter, accountFilter, page, pageSize],
  );

  // Module-level memory cache is empty during SSR and F5 cold load, and populated
  // during client-side tab navigation -> zero hydration mismatch + instant tab switch.
  const initialMemorySnapshot = useMemo(
    () => getMemoryConnectionsCache(cacheKey),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const [connections, setConnections] = useState(
    () => initialMemorySnapshot?.connections || [],
  );
  const [providerOptions, setProviderOptions] = useState(
    () => initialMemorySnapshot?.providerOptions || [],
  );
  const [pagination, setPagination] = useState(
    () =>
      initialMemorySnapshot?.pagination || {
        page: 1,
        pageSize: CONNECTIONS_PAGE_SIZE,
        total: 0,
        totalPages: 1,
      },
  );
  const [totals, setTotals] = useState(
    () =>
      initialMemorySnapshot?.totals || {
        eligibleConnections: 0,
        providerFilteredConnections: 0,
      },
  );

  const [quotaData, setQuotaData] = useState(() => {
    if (!initialMemorySnapshot?.connections?.length) return {};
    const cache = getQuotaCache();
    const initial = {};
    for (const conn of initialMemorySnapshot.connections) {
      if (cache[conn.id]) initial[conn.id] = cache[conn.id];
    }
    return initial;
  });

  const [loading, setLoading] = useState({});
  const [errors, setErrors] = useState({});
  const [autoPingConfigs, setAutoPingConfigs] = useState({ claude: {}, codex: {} });
  const [quotaVisibility, setQuotaVisibility] = useState({});
  const [proxyPools, setProxyPools] = useState([]);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [connectionsLoading, setConnectionsLoading] = useState(
    () => !initialMemorySnapshot,
  );
  const [isRevalidating, setIsRevalidating] = useState(false);

  const markUpdated = useCallback(() => {
    setLastUpdated(new Date());
  }, []);

  const fetchConnections = useCallback(
    async (targetPage = page) => {
      try {
        const params = new URLSearchParams({
          page: String(targetPage),
          pageSize: String(pageSize),
          accountStatus: accountFilter,
          sort: "priority",
        });

        if (providerFilter !== "all") {
          params.set("provider", providerFilter);
        }

        const response = await fetch(`/api/providers/client?${params.toString()}`);
        if (!response.ok) throw new Error("Failed to fetch connections");

        const data = await response.json();
        const connectionList = data.connections || [];
        const nextPagination = getSafePagination(data.pagination, pageSize);
        const nextTotals = getSafeTotals(data.totals, connectionList.length);
        const nextProviderOptions = getProviderOptions(data.providerOptions);

        setConnections(connectionList);
        setProviderOptions(nextProviderOptions);
        setPagination(nextPagination);
        setTotals(nextTotals);
        setPage(getPaginationPageValue(data.pagination, targetPage));

        const targetKey = buildConnectionsCacheKey({
          providerFilter,
          accountFilter,
          page: getPaginationPageValue(data.pagination, targetPage),
          pageSize,
        });
        writeConnectionsStorageCache(targetKey, {
          connections: connectionList,
          providerOptions: nextProviderOptions,
          pagination: nextPagination,
          totals: nextTotals,
        });

        return connectionList;
      } catch (error) {
        console.error("Error fetching connections:", error);
        return null;
      }
    },
    [accountFilter, page, pageSize, providerFilter],
  );

  const fetchQuota = useCallback(async (connectionId, provider, { force = false, silent = false, signal } = {}) => {
    if (signal?.aborted) return;
    if (!silent) {
      setLoading((prev) => ({ ...prev, [connectionId]: true }));
    }
    setErrors((prev) => ({ ...prev, [connectionId]: null }));

    try {
      const url = `/api/usage/${connectionId}${force ? "?force=1" : ""}`;
      const response = await fetch(url, { signal });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMsg = errorData.error || response.statusText;

        if (response.status === 404) {
          return;
        }

        if (response.status === 401) {
          const quotaEntry = { quotas: [], message: errorMsg };
          setQuotaData((prev) => ({ ...prev, [connectionId]: quotaEntry }));
          setQuotaCache(connectionId, quotaEntry);
          return;
        }

        throw new Error(`HTTP ${response.status}: ${errorMsg}`);
      }

      const data = await response.json();
      const quotaEntry = {
        quotas: parseQuotaData(provider, data),
        plan: data.plan || null,
        message: data.message || null,
        raw: data,
      };

      setQuotaData((prev) => ({ ...prev, [connectionId]: quotaEntry }));
      setQuotaCache(connectionId, quotaEntry);
    } catch (error) {
      if (error?.name === "AbortError") return;
      setErrors((prev) => ({
        ...prev,
        [connectionId]: error.message || "Không thể tải hạn mức",
      }));
    } finally {
      setLoading((prev) => ({ ...prev, [connectionId]: false }));
    }
  }, []);

  const refreshProvider = useCallback(
    async (connectionId, provider) => {
      await fetchQuota(connectionId, provider, { force: true });
      markUpdated();
    },
    [fetchQuota, markUpdated],
  );

  const refreshConnectionAndQuota = useCallback(
    async (connectionId, provider) => {
      await Promise.all([
        fetchConnections(page),
        fetchQuota(connectionId, provider, { force: true }),
      ]);
      markUpdated();
    },
    [fetchConnections, fetchQuota, markUpdated, page],
  );

  const removeConnectionState = useCallback((id) => {
    const omitId = (prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    };
    setQuotaData(omitId);
    setLoading(omitId);
    setErrors(omitId);
    setConnections((prev) => prev.filter((c) => c.id !== id));

    if (typeof window !== "undefined") {
      try {
        const cache = getQuotaCache();
        if (cache[id]) {
          delete cache[id];
          window.localStorage.setItem(QUOTA_CACHE_KEY, JSON.stringify(cache));
        }
      } catch (e) {
        console.error("Error deleting cache entry:", e);
      }
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetchWithCache("/api/proxy-pools?isActive=true", () => fetchJson("/api/proxy-pools?isActive=true"), {
      ttlMs: 30000,
    })
      .then((data) => {
        if (!cancelled && data?.proxyPools) {
          setProxyPools(data.proxyPools);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    useSettingsStore
      .getState()
      .fetchSettings()
      .then((s) => {
        if (cancelled) return;
        setAutoPingConfigs({
          claude: s?.claudeAutoPing || {},
          codex: s?.codexAutoPing || {},
        });
        setQuotaVisibility(s?.quotaVisibility || {});
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    const initializeData = async () => {
      // Hydrate synchronously from memory or localStorage SWR cache before network fetch
      const cachedSnapshot = readConnectionsStorageCache(cacheKey);
      const quotaCache = getQuotaCache();

      if (cachedSnapshot?.connections) {
        setConnections(cachedSnapshot.connections);
        setProviderOptions(cachedSnapshot.providerOptions || []);
        setPagination(cachedSnapshot.pagination || getSafePagination(null, pageSize));
        setTotals(cachedSnapshot.totals || getSafeTotals(null, cachedSnapshot.connections.length));
        setConnectionsLoading(false);
        setIsRevalidating(true);

        const cachedQuotas = {};
        for (const conn of cachedSnapshot.connections) {
          if (quotaCache[conn.id]) cachedQuotas[conn.id] = quotaCache[conn.id];
        }
        if (Object.keys(cachedQuotas).length > 0) {
          setQuotaData((prev) => ({ ...prev, ...cachedQuotas }));
        }
      } else {
        setConnectionsLoading(true);
        setIsRevalidating(false);
      }

      const visibleConnections = await fetchConnections(page);
      if (cancelled || controller.signal.aborted) return;

      setConnectionsLoading(false);
      setIsRevalidating(false);

      if (!visibleConnections) {
        return;
      }

      const nextCachedQuotaData = {};
      const needsLoading = {};
      const staleConnections = [];
      for (const conn of visibleConnections) {
        const cachedEntry = quotaCache[conn.id];
        if (cachedEntry) {
          nextCachedQuotaData[conn.id] = cachedEntry;
        } else {
          needsLoading[conn.id] = true;
        }
        if (!isQuotaCacheFresh(cachedEntry, QUOTA_FRESH_TTL_MS)) {
          staleConnections.push(conn);
        }
      }
      if (Object.keys(nextCachedQuotaData).length > 0) {
        setQuotaData((prev) => ({ ...prev, ...nextCachedQuotaData }));
      }
      setLoading(needsLoading);

      if (staleConnections.length === 0) {
        return;
      }

      // Cap concurrency at 3 with AbortController so HTTP/1.1 navigation sockets stay free
      await runQuotaQueue(staleConnections, 3, controller.signal, (conn) =>
        fetchQuota(conn.id, conn.provider, {
          silent: Boolean(quotaCache[conn.id]),
          signal: controller.signal,
        }),
      );
      if (!cancelled && !controller.signal.aborted) {
        markUpdated();
      }
    };

    initializeData();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [cacheKey, fetchConnections, fetchQuota, markUpdated, page, pageSize]);

  const updateQuotaVisibility = useCallback(async (nextVisibility, previousVisibility) => {
    setQuotaVisibility(nextVisibility);
    try {
      const response = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quotaVisibility: nextVisibility }),
      });
      if (!response.ok) throw new Error("Failed to update quota visibility");
    } catch (error) {
      console.error("Error updating quota visibility:", error);
      setQuotaVisibility(previousVisibility);
    }
  }, []);

  const handleHideQuota = useCallback(
    (provider, quota) => {
      const next = toggleProviderHiddenQuota(quotaVisibility, provider, quota, true);
      if (next) updateQuotaVisibility(next, quotaVisibility);
    },
    [quotaVisibility, updateQuotaVisibility],
  );

  const handleShowQuota = useCallback(
    (provider, quota) => {
      const next = toggleProviderHiddenQuota(quotaVisibility, provider, quota, false);
      if (next) updateQuotaVisibility(next, quotaVisibility);
    },
    [quotaVisibility, updateQuotaVisibility],
  );

  const filteredConnections = useMemo(
    () =>
      filterConnectionsClientSide(connections, quotaData, errors, {
        searchQuery,
        tierFilter,
        healthFilter,
      }),
    [connections, quotaData, errors, searchQuery, tierFilter, healthFilter],
  );

  const sortedConnections = useMemo(
    () =>
      sortConnectionsEnhanced(filteredConnections, quotaData, {
        expiringFirst,
        quotaSortMode,
      }),
    [filteredConnections, quotaData, expiringFirst, quotaSortMode],
  );

  const summaryStats = useMemo(
    () =>
      computeQuotaSummaryStats({
        connections,
        filteredConnections: sortedConnections,
        quotaData,
        errors,
        totals,
      }),
    [connections, sortedConnections, quotaData, errors, totals],
  );

  const isInitialLoading = connectionsLoading && connections.length === 0;

  return {
    connections,
    filteredConnections,
    sortedConnections,
    summaryStats,
    quotaData,
    setQuotaData,
    loading,
    setLoading,
    errors,
    setErrors,
    autoPingConfigs,
    setAutoPingConfigs,
    quotaVisibility,
    proxyPools,
    lastUpdated,
    markUpdated,
    connectionsLoading,
    isInitialLoading,
    isRevalidating,
    providerOptions,
    accountFilter,
    setAccountFilter,
    searchQuery,
    setSearchQuery,
    tierFilter,
    setTierFilter,
    healthFilter,
    setHealthFilter,
    quotaSortMode,
    setQuotaSortMode,
    expiringFirst,
    setExpiringFirst,
    page,
    setPage,
    pageSize,
    setPageSize,
    customPageSizeInput,
    setCustomPageSizeInput,
    pagination,
    totals,
    fetchConnections,
    fetchQuota,
    refreshProvider,
    refreshConnectionAndQuota,
    removeConnectionState,
    handleHideQuota,
    handleShowQuota,
  };
}
