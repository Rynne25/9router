"use client";

import { useCallback, useState } from "react";

export function useProxyHealthCheck({
  visiblePools = [],
  selectedIds = [],
  fetchProxyPools,
  setBulkBusy,
  setConfirmState,
  notify,
} = {}) {
  const [healthChecking, setHealthChecking] = useState(false);
  const [healthProgress, setHealthProgress] = useState({ current: 0, total: 0 });

  const handleHealthCheck = useCallback(async () => {
    const targets = selectedIds.length > 0
      ? visiblePools.filter((p) => selectedIds.includes(p.id))
      : visiblePools;
    if (targets.length === 0) return;

    setHealthChecking(true);
    setHealthProgress({ current: 0, total: targets.length });
    let alive = 0;
    const deadIds = [];
    let done = 0;
    const CONCURRENCY = 10;
    const queue = [...targets];

    const worker = async () => {
      while (queue.length > 0) {
        const pool = queue.shift();
        if (!pool) break;
        try {
          const res = await fetch(`/api/proxy-pools/${pool.id}/test`, { method: "POST" });
          const data = await res.json();
          if (res.ok && data.ok) {
            alive += 1;
          } else {
            deadIds.push(pool.id);
          }
        } catch {
          deadIds.push(pool.id);
        } finally {
          done += 1;
          setHealthProgress({ current: done, total: targets.length });
        }
      }
    };

    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, targets.length) }, worker));
    await fetchProxyPools?.();
    setHealthChecking(false);
    setHealthProgress({ current: 0, total: 0 });

    if (deadIds.length > 0) {
      setConfirmState?.({
        title: "Disable Dead Proxies",
        message: `Alive: ${alive}, Dead: ${deadIds.length}.\n\nDisable ${deadIds.length} dead proxies?`,
        onConfirm: async () => {
          setConfirmState?.(null);
          setBulkBusy?.(true);
          try {
            for (const id of deadIds) {
              try {
                await fetch(`/api/proxy-pools/${id}`, {
                  method: "PUT",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ isActive: false }),
                });
              } catch {
                // Ignore failure on disabling individual dead proxy
              }
            }
            await fetchProxyPools?.();
            notify?.success?.(`Disabled ${deadIds.length} dead proxies`);
          } finally {
            setBulkBusy?.(false);
          }
        },
      });
    } else {
      notify?.success?.(`Health check done. Alive: ${alive}, Dead: ${deadIds.length}`);
    }
  }, [visiblePools, selectedIds, fetchProxyPools, setBulkBusy, setConfirmState, notify]);

  return {
    healthChecking,
    healthProgress,
    handleHealthCheck,
  };
}
