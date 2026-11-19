"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { OAUTH_PROVIDERS, APIKEY_PROVIDERS } from "@/shared/constants/config";
import {
  FREE_PROVIDERS,
  FREE_TIER_PROVIDERS,
  WEB_COOKIE_PROVIDERS,
} from "@/shared/constants/providers";
import { useNotificationStore } from "@/store/notificationStore";
import { useHeaderSearchStore } from "@/store/headerSearchStore";
import {
  computeProviderStats,
  dualAuthTypes,
} from "../utils/providerStats";
import { matchesStatusFilter } from "../utils";
import {
  getCachedData,
  setCachedData,
  fetchWithCache,
  fetchJson,
} from "@/shared/utils/swrCache";

const APIKEY_INITIAL_VISIBLE = 20;
const PROVIDERS_CACHE_KEY = "/api/providers";
const NODES_CACHE_KEY = "/api/provider-nodes";
const PROVIDERS_TTL_MS = 15000;

export function useProvidersOverview() {
  const cachedProviders = getCachedData(PROVIDERS_CACHE_KEY);
  const cachedNodes = getCachedData(NODES_CACHE_KEY);
  const [connections, setConnectionsState] = useState(() => cachedProviders?.connections || []);
  const [providerNodes, setProviderNodesState] = useState(() => cachedNodes?.nodes || []);
  const [loading, setLoading] = useState(() => cachedProviders === undefined && cachedNodes === undefined);
  const [showAllApikey, setShowAllApikey] = useState(false);
  const [showAddCompatibleModal, setShowAddCompatibleModal] = useState(false);
  const [showAddAnthropicCompatibleModal, setShowAddAnthropicCompatibleModal] =
    useState(false);
  const [testingMode, setTestingMode] = useState(null);
  const [testResults, setTestResults] = useState(null);
  const [statusFilter, setStatusFilter] = useState("all");

  const setConnections = useCallback((updater) => {
    setConnectionsState((prev) => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      setCachedData(PROVIDERS_CACHE_KEY, { connections: next });
      return next;
    });
  }, []);

  const setProviderNodes = useCallback((updater) => {
    setProviderNodesState((prev) => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      setCachedData(NODES_CACHE_KEY, { nodes: next });
      return next;
    });
  }, []);

  const notify = useNotificationStore();
  const searchQuery = useHeaderSearchStore((s) => s.query);
  const registerSearch = useHeaderSearchStore((s) => s.register);
  const unregisterSearch = useHeaderSearchStore((s) => s.unregister);

  useEffect(() => {
    registerSearch("Search providers...");
    return () => unregisterSearch();
  }, [registerSearch, unregisterSearch]);

  const matchSearch = useCallback(
    (name) => {
      if (!searchQuery.trim()) return true;
      if (!name) return false;
      return name.toLowerCase().includes(searchQuery.trim().toLowerCase());
    },
    [searchQuery],
  );

  // Pre-index connections by providerId once so stats lookup per card is O(1) instead of O(P * C).
  const connectionsByProvider = useMemo(() => {
    const map = new Map();
    for (const conn of connections) {
      if (!conn?.provider) continue;
      let list = map.get(conn.provider);
      if (!list) {
        list = [];
        map.set(conn.provider, list);
      }
      list.push(conn);
    }
    return map;
  }, [connections]);

  const getProviderStats = useCallback(
    (providerId, authType) => {
      return computeProviderStats(connectionsByProvider.get(providerId) || [], providerId, authType);
    },
    [connectionsByProvider],
  );

  const matchStatus = useCallback(
    (stats, isNoAuth) => {
      return matchesStatusFilter(statusFilter, stats, isNoAuth);
    },
    [statusFilter],
  );

  const sortByPriority = useCallback(
    (entries, authType) =>
      [...entries].sort(([ka, a], [kb, b]) => {
        const pa = a.priority ?? 999;
        const pb = b.priority ?? 999;
        if (pa !== pb) return pa - pb;
        const sa = getProviderStats(ka, authType);
        const sb = getProviderStats(kb, authType);
        const ca = sa.connected > 0 ? 1 : 0;
        const cb = sb.connected > 0 ? 1 : 0;
        if (ca !== cb) return cb - ca;
        return (a.name || "").localeCompare(b.name || "");
      }),
    [getProviderStats],
  );

  useEffect(() => {
    let ignore = false;
    const fetchData = async () => {
      try {
        const [connectionsData, nodesData] = await Promise.all([
          fetchWithCache(PROVIDERS_CACHE_KEY, () => fetchJson(PROVIDERS_CACHE_KEY), { ttlMs: PROVIDERS_TTL_MS }),
          fetchWithCache(NODES_CACHE_KEY, () => fetchJson(NODES_CACHE_KEY), { ttlMs: PROVIDERS_TTL_MS }),
        ]);
        if (ignore) return;
        if (connectionsData?.connections) {
          setConnectionsState(connectionsData.connections);
        }
        if (nodesData?.nodes) {
          setProviderNodesState(nodesData.nodes);
        }
      } catch (error) {
        console.log("Error fetching data:", error);
      } finally {
        if (!ignore) setLoading(false);
      }
    };
    fetchData();
    return () => {
      ignore = true;
    };
  }, []);

  const handleToggleProvider = useCallback(
    async (providerId, authType, newActive) => {
      const authTypes = Array.isArray(authType) ? authType : [authType];
      const matches = (c) =>
        c.provider === providerId && authTypes.includes(c.authType);
      const providerConns = connections.filter(matches);
      setConnections((prev) =>
        prev.map((c) => (matches(c) ? { ...c, isActive: newActive } : c)),
      );
      await Promise.allSettled(
        providerConns.map((c) =>
          fetch(`/api/providers/${c.id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ isActive: newActive }),
          }),
        ),
      );
    },
    [connections, setConnections],
  );

  const handleBatchTest = useCallback(
    async (mode, providerId = null) => {
      if (testingMode) return;
      setTestingMode(mode === "provider" ? providerId : mode);
      setTestResults(null);
      try {
        const res = await fetch("/api/providers/test-batch", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mode, providerId }),
        });
        const data = await res.json();
        setTestResults(data);
        if (data.summary) {
          const { passed, failed, total } = data.summary;
          if (failed === 0) notify.success(`All ${total} tests passed`);
          else notify.warning(`${passed}/${total} passed, ${failed} failed`);
        }
      } catch {
        setTestResults({ error: "Test request failed" });
        notify.error("Provider test failed");
      } finally {
        setTestingMode(null);
      }
    },
    [testingMode, notify],
  );

  const handleAddProviderNode = useCallback((node) => {
    setProviderNodes((prev) => [...prev, node]);
  }, [setProviderNodes]);

  const compatibleProviders = useMemo(
    () =>
      providerNodes
        .filter((node) => node.type === "openai-compatible")
        .map((node) => ({
          id: node.id,
          name: node.name || "OpenAI Compatible",
          color: "#10A37F",
          textIcon: "OC",
          apiType: node.apiType,
        }))
        .filter(
          (p) =>
            matchSearch(p.name) &&
            matchStatus(getProviderStats(p.id, "apikey")),
        ),
    [providerNodes, matchSearch, matchStatus, getProviderStats],
  );

  const anthropicCompatibleProviders = useMemo(
    () =>
      providerNodes
        .filter((node) => node.type === "anthropic-compatible")
        .map((node) => ({
          id: node.id,
          name: node.name || "Anthropic Compatible",
          color: "#D97757",
          textIcon: "AC",
        }))
        .filter(
          (p) =>
            matchSearch(p.name) &&
            matchStatus(getProviderStats(p.id, "apikey")),
        ),
    [providerNodes, matchSearch, matchStatus, getProviderStats],
  );

  const oauthEntries = useMemo(
    () =>
      sortByPriority(
        Object.entries(OAUTH_PROVIDERS).filter(
          ([key, info]) =>
            !info.hidden &&
            matchSearch(info.name) &&
            matchStatus(
              getProviderStats(key, dualAuthTypes(info, key)),
              info.noAuth,
            ),
        ),
        "oauth",
      ),
    [sortByPriority, matchSearch, matchStatus, getProviderStats],
  );

  const freeEntries = useMemo(
    () =>
      Object.entries(FREE_PROVIDERS)
        .filter(
          ([key, info]) =>
            !info.hidden &&
            matchSearch(info.name) &&
            matchStatus(
              getProviderStats(key, dualAuthTypes(info, key)),
              info.noAuth,
            ),
        )
        .sort(([, a], [, b]) => (b.noAuth ? 1 : 0) - (a.noAuth ? 1 : 0)),
    [matchSearch, matchStatus, getProviderStats],
  );

  const freeTierEntries = useMemo(
    () =>
      Object.entries(FREE_TIER_PROVIDERS)
        .filter(
          ([key, info]) =>
            !info.hidden &&
            matchSearch(info.name) &&
            (info.serviceKinds ?? ["llm"]).includes("llm") &&
            matchStatus(
              getProviderStats(key, dualAuthTypes(info, key)),
              info.noAuth,
            ),
        )
        .sort(([ka, a], [kb, b]) => {
          const pa = a.priority ?? 999;
          const pb = b.priority ?? 999;
          if (pa !== pb) return pa - pb;
          const noAuthDiff = (b.noAuth ? 1 : 0) - (a.noAuth ? 1 : 0);
          if (noAuthDiff !== 0) return noAuthDiff;
          const ca =
            getProviderStats(ka, dualAuthTypes(a, ka)).connected > 0 ? 0 : 1;
          const cb =
            getProviderStats(kb, dualAuthTypes(b, kb)).connected > 0 ? 0 : 1;
          if (ca !== cb) return ca - cb;
          return (a.name || "").localeCompare(b.name || "");
        }),
    [matchSearch, matchStatus, getProviderStats],
  );

  const apikeyEntries = useMemo(
    () =>
      Object.entries(APIKEY_PROVIDERS)
        .filter(
          ([key, info]) =>
            !info.hidden &&
            (info.serviceKinds ?? ["llm"]).includes("llm") &&
            matchSearch(info.name) &&
            matchStatus(getProviderStats(key, "apikey"), info.noAuth),
        )
        .sort(([ka, a], [kb, b]) => {
          const ca = getProviderStats(ka, "apikey").total > 0 ? 0 : 1;
          const cb = getProviderStats(kb, "apikey").total > 0 ? 0 : 1;
          if (ca !== cb) return ca - cb;
          return (a.name || "").localeCompare(b.name || "");
        }),
    [matchSearch, matchStatus, getProviderStats],
  );

  const isApikeySearching = !!searchQuery.trim() || statusFilter !== "all";
  const visibleApikeyEntries =
    isApikeySearching || showAllApikey
      ? apikeyEntries
      : apikeyEntries.slice(0, APIKEY_INITIAL_VISIBLE);
  const hiddenApikeyCount = apikeyEntries.length - APIKEY_INITIAL_VISIBLE;

  const webCookieEntries = useMemo(
    () =>
      Object.entries(WEB_COOKIE_PROVIDERS)
        .filter(
          ([key, info]) =>
            !info.hidden &&
            (info.serviceKinds ?? ["llm"]).includes("llm") &&
            matchSearch(info.name) &&
            matchStatus(getProviderStats(key, "cookie"), info.noAuth),
        )
        .sort(([ka, a], [kb, b]) => {
          const ca = getProviderStats(ka, "cookie").total > 0 ? 0 : 1;
          const cb = getProviderStats(kb, "cookie").total > 0 ? 0 : 1;
          if (ca !== cb) return ca - cb;
          return (a.name || "").localeCompare(b.name || "");
        }),
    [matchSearch, matchStatus, getProviderStats],
  );

  const hasAnyResult =
    oauthEntries.length > 0 ||
    freeEntries.length > 0 ||
    freeTierEntries.length > 0 ||
    apikeyEntries.length > 0 ||
    webCookieEntries.length > 0 ||
    compatibleProviders.length > 0 ||
    anthropicCompatibleProviders.length > 0;

  return {
    connections,
    setConnections,
    providerNodes,
    setProviderNodes,
    loading,
    statusFilter,
    setStatusFilter,
    showAllApikey,
    setShowAllApikey,
    testingMode,
    testResults,
    setTestResults,
    showAddCompatibleModal,
    setShowAddCompatibleModal,
    showAddAnthropicCompatibleModal,
    setShowAddAnthropicCompatibleModal,
    getProviderStats,
    handleToggleProvider,
    handleBatchTest,
    handleAddProviderNode,
    compatibleProviders,
    anthropicCompatibleProviders,
    oauthEntries,
    freeEntries,
    freeTierEntries,
    apikeyEntries,
    visibleApikeyEntries,
    hiddenApikeyCount,
    isApikeySearching,
    webCookieEntries,
    hasAnyResult,
  };
}

export default useProvidersOverview;
