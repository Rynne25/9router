"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { getAntigravityEffectiveTier } from "@/shared/utils/antigravityTier";
import { getProviderMeta } from "../utils/providerMeta";
import { useProviderSettings } from "./useProviderSettings";

/**
 * Manage provider connections, compatible node config, Antigravity tier filtering,
 * selection state, and connection CRUD operations.
 * @param {{ providerId: string }} params
 */
export function useProviderConnections({ providerId }) {
  const [connections, setConnections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [providerNode, setProviderNode] = useState(null);
  const [proxyPools, setProxyPools] = useState([]);
  const [antigravityTierFilter, setAntigravityTierFilter] = useState("all");
  const [rawSelectedIds, setRawSelectedIds] = useState([]);
  const [confirmState, setConfirmState] = useState(null);

  const settings = useProviderSettings({ providerId });
  const { syncSettingsFromData } = settings;

  const providerMeta = useMemo(
    () => getProviderMeta(providerId, providerNode),
    [providerId, providerNode]
  );
  const { isCompatible } = providerMeta;

  const fetchConnections = useCallback(async () => {
    try {
      const [connectionsRes, nodesRes, proxyPoolsRes, settingsRes] = await Promise.all([
        fetch("/api/providers", { cache: "no-store" }),
        fetch("/api/provider-nodes", { cache: "no-store" }),
        fetch("/api/proxy-pools?isActive=true", { cache: "no-store" }),
        fetch("/api/settings", { cache: "no-store" }),
      ]);
      const connectionsData = await connectionsRes.json();
      const nodesData = await nodesRes.json();
      const proxyPoolsData = await proxyPoolsRes.json();
      const settingsData = settingsRes.ok ? await settingsRes.json() : {};

      if (connectionsRes.ok) {
        setConnections((connectionsData.connections || []).filter((c) => c.provider === providerId));
      }
      if (proxyPoolsRes.ok) {
        setProxyPools(proxyPoolsData.proxyPools || []);
      }

      syncSettingsFromData(settingsData);

      if (nodesRes.ok) {
        let node = (nodesData.nodes || []).find((entry) => entry.id === providerId) || null;
        if (!node && isCompatible) {
          for (let attempt = 0; attempt < 3; attempt += 1) {
            await new Promise((resolve) => setTimeout(resolve, 150));
            const retryRes = await fetch("/api/provider-nodes", { cache: "no-store" });
            if (!retryRes.ok) continue;
            const retryData = await retryRes.json();
            node = (retryData.nodes || []).find((entry) => entry.id === providerId) || null;
            if (node) break;
          }
        }
        setProviderNode(node);
      }
    } catch (error) {
      console.log("Error fetching connections:", error);
    } finally {
      setLoading(false);
    }
  }, [providerId, isCompatible, syncSettingsFromData]);

  useEffect(() => {
    let cancelled = false;
    Promise.resolve().then(() => {
      if (!cancelled) fetchConnections();
    });
    return () => {
      cancelled = true;
    };
  }, [fetchConnections]);

  const handleUpdateNode = useCallback(async (formData) => {
    try {
      const res = await fetch(`/api/provider-nodes/${providerId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });
      const data = await res.json();
      if (res.ok) {
        setProviderNode(data.node);
        await fetchConnections();
        return true;
      }
    } catch (error) {
      console.log("Error updating provider node:", error);
    }
    return false;
  }, [providerId, fetchConnections]);

  const handleDeleteNode = useCallback((isAnthropic, onDeleted) => {
    setConfirmState({
      title: "Delete Compatible Node",
      message: `Delete this ${isAnthropic ? "Anthropic" : "OpenAI"} Compatible node?`,
      onConfirm: async () => {
        setConfirmState(null);
        try {
          const res = await fetch(`/api/provider-nodes/${providerId}`, { method: "DELETE" });
          if (res.ok) onDeleted();
        } catch (error) {
          console.log("Error deleting provider node:", error);
        }
      },
    });
  }, [providerId]);

  const handleDelete = useCallback((id) => {
    setConfirmState({
      title: "Delete Connection",
      message: "Delete this connection?",
      onConfirm: async () => {
        setConfirmState(null);
        try {
          const res = await fetch(`/api/providers/${id}`, { method: "DELETE" });
          if (res.ok) setConnections((prev) => prev.filter((c) => c.id !== id));
        } catch (error) {
          console.log("Error deleting connection:", error);
        }
      },
    });
  }, []);

  const selectedConnectionIds = useMemo(() => {
    const validSet = new Set(connections.map((c) => c.id));
    return rawSelectedIds.filter((id) => validSet.has(id));
  }, [rawSelectedIds, connections]);

  const handleBulkDelete = useCallback(() => {
    const count = selectedConnectionIds.length;
    if (count === 0) return;
    const idsToDelete = [...selectedConnectionIds];
    setConfirmState({
      title: `Delete ${count} Connection${count > 1 ? "s" : ""}`,
      message: `Delete ${count} connection${count > 1 ? "s" : ""}? This cannot be undone.`,
      onConfirm: async () => {
        setConfirmState(null);
        let failed = 0;
        for (const id of idsToDelete) {
          try {
            const res = await fetch(`/api/providers/${id}`, { method: "DELETE" });
            if (!res.ok) failed += 1;
          } catch (error) {
            console.log("Error deleting connection:", error);
            failed += 1;
          }
        }
        setConnections((prev) => prev.filter((c) => !idsToDelete.includes(c.id)));
        setRawSelectedIds([]);
        if (failed > 0) alert(`Deleted ${idsToDelete.length - failed} connection(s), ${failed} failed.`);
      },
    });
  }, [selectedConnectionIds]);

  const handleSaveApiKey = useCallback(async (formData) => {
    try {
      const res = await fetch("/api/providers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: providerId, ...formData }),
      });
      const data = await res.json().catch(() => null);
      if (res.ok) {
        await fetchConnections();
        return { ok: true, error: "" };
      }
      return { ok: false, error: data?.error || "Failed to save connection" };
    } catch (error) {
      console.log("Error saving connection:", error);
      return { ok: false, error: "Failed to save connection" };
    }
  }, [providerId, fetchConnections]);

  const handleUpdateConnection = useCallback(async (connectionId, formData) => {
    try {
      const res = await fetch(`/api/providers/${connectionId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });
      if (res.ok) {
        await fetchConnections();
        return true;
      }
    } catch (error) {
      console.log("Error updating connection:", error);
    }
    return false;
  }, [fetchConnections]);

  const handleUpdateConnectionStatus = useCallback(async (id, isActive) => {
    try {
      const res = await fetch(`/api/providers/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive }),
      });
      if (res.ok) {
        setConnections((prev) => prev.map((c) => (c.id === id ? { ...c, isActive } : c)));
      }
    } catch (error) {
      console.log("Error updating connection status:", error);
    }
  }, []);

  const handleUpdateConnectionProxy = useCallback(async (id, proxyPoolId) => {
    try {
      const res = await fetch(`/api/providers/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ proxyPoolId: proxyPoolId || null }),
      });
      if (res.ok) {
        setConnections((prev) =>
          prev.map((c) =>
            c.id === id
              ? { ...c, providerSpecificData: { ...c.providerSpecificData, proxyPoolId: proxyPoolId || null } }
              : c
          )
        );
      }
    } catch (error) {
      console.log("Error updating proxy:", error);
    }
  }, []);

  const handleSwapPriority = useCallback(async (index1, index2) => {
    const newConnections = [...connections];
    newConnections[index1] = { ...connections[index2], priority: index1 };
    newConnections[index2] = { ...connections[index1], priority: index2 };
    setConnections(newConnections);

    try {
      await Promise.all([
        fetch(`/api/providers/${newConnections[index1].id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ priority: index1 }),
        }),
        fetch(`/api/providers/${newConnections[index2].id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ priority: index2 }),
        }),
      ]);
    } catch (error) {
      console.log("Error swapping priority:", error);
      await fetchConnections();
    }
  }, [connections, fetchConnections]);

  const tierCounts = useMemo(() => {
    const counts = { all: connections.length, pro: 0, pro_jiro: 0, ultra: 0, enterprise: 0, free: 0 };
    for (const c of connections) {
      const t = getAntigravityEffectiveTier(c);
      if (t === "pro") counts.pro += 1;
      else if (t === "pro_jiro") counts.pro_jiro += 1;
      else if (t === "ultra") counts.ultra += 1;
      else if (t === "enterprise") counts.enterprise += 1;
      else counts.free += 1;
    }
    return counts;
  }, [connections]);

  const filteredConnections = useMemo(() => {
    if (providerId !== "antigravity" || antigravityTierFilter === "all") return connections;
    return connections.filter((c) => getAntigravityEffectiveTier(c) === antigravityTierFilter);
  }, [connections, providerId, antigravityTierFilter]);

  const allFilteredSelected =
    filteredConnections.length > 0 &&
    filteredConnections.every((conn) => selectedConnectionIds.includes(conn.id));

  const toggleSelectConnection = useCallback((connectionId) => {
    setRawSelectedIds((prev) =>
      prev.includes(connectionId) ? prev.filter((id) => id !== connectionId) : [...prev, connectionId]
    );
  }, []);

  const toggleSelectAllConnections = useCallback(() => {
    if (allFilteredSelected) {
      const filteredIdSet = new Set(filteredConnections.map((c) => c.id));
      setRawSelectedIds((prev) => prev.filter((id) => !filteredIdSet.has(id)));
      return;
    }
    setRawSelectedIds((prev) => [...new Set([...prev, ...filteredConnections.map((c) => c.id)])]);
  }, [allFilteredSelected, filteredConnections]);

  return {
    connections,
    loading,
    providerNode,
    proxyPools,
    providerMeta,
    ...settings,
    antigravityTierFilter,
    setAntigravityTierFilter,
    tierCounts,
    filteredConnections,
    selectedConnectionIds,
    allFilteredSelected,
    confirmState,
    setConfirmState,
    fetchConnections,
    handleUpdateNode,
    handleDeleteNode,
    handleDelete,
    handleBulkDelete,
    handleSaveApiKey,
    handleUpdateConnection,
    handleUpdateConnectionStatus,
    handleUpdateConnectionProxy,
    handleSwapPriority,
    toggleSelectConnection,
    toggleSelectAllConnections,
  };
}
