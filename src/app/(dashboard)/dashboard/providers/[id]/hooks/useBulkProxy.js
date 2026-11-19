"use client";

import { useState, useCallback, useMemo } from "react";

/**
 * Manage bulk proxy pool assignment across provider connections.
 * @param {{ connections: Array<object>, proxyPools: Array<object>, fetchConnections: () => Promise<void> }} params
 */
export function useBulkProxy({ connections, proxyPools, fetchConnections }) {
  const [showBulkProxyModal, setShowBulkProxyModal] = useState(false);
  const [bulkUpdatingProxy, setBulkUpdatingProxy] = useState(false);

  const activePools = useMemo(
    () => proxyPools.filter((p) => p.isActive === true),
    [proxyPools]
  );

  const closeBulkProxyModal = useCallback(() => {
    if (bulkUpdatingProxy) return;
    setShowBulkProxyModal(false);
  }, [bulkUpdatingProxy]);

  const applyProxyAssignments = useCallback(async (assignments) => {
    setBulkUpdatingProxy(true);
    try {
      let failed = 0;
      for (const { connectionId, proxyPoolId } of assignments) {
        try {
          const res = await fetch(`/api/providers/${connectionId}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ proxyPoolId }),
          });
          if (!res.ok) failed += 1;
        } catch (e) {
          console.log("Error applying proxy for", connectionId, e);
          failed += 1;
        }
      }
      if (failed > 0) alert(`Updated with ${failed} failed request(s).`);
      await fetchConnections();
      setShowBulkProxyModal(false);
    } finally {
      setBulkUpdatingProxy(false);
    }
  }, [fetchConnections]);

  const handleApplySinglePool = useCallback((proxyPoolId) => {
    const targets = connections.map((c) => ({ connectionId: c.id, proxyPoolId }));
    return applyProxyAssignments(targets);
  }, [connections, applyProxyAssignments]);

  const handleApplyOneToOne = useCallback(() => {
    if (activePools.length === 0) {
      alert("No active proxy pools available.");
      return;
    }
    const targets = connections.map((c, i) => ({
      connectionId: c.id,
      proxyPoolId: activePools[i % activePools.length].id,
    }));
    return applyProxyAssignments(targets);
  }, [activePools, connections, applyProxyAssignments]);

  return {
    showBulkProxyModal,
    setShowBulkProxyModal,
    bulkUpdatingProxy,
    activePools,
    closeBulkProxyModal,
    handleApplySinglePool,
    handleApplyOneToOne,
  };
}
