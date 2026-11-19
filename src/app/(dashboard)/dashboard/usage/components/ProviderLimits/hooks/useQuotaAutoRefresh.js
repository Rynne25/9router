"use client";

import { useState, useEffect, useCallback, useRef, useSyncExternalStore } from "react";
import {
  AUTO_REFRESH_STORAGE_KEY,
  REFRESH_INTERVAL_MS,
  CLAUDE_REFRESH_INTERVAL_MS,
  buildLoadingState,
  filterQuotaStateByConnections,
} from "../utils";

const autoRefreshListeners = new Set();

function readAutoRefreshStorage() {
  if (typeof window === "undefined") return true;
  try {
    const stored = window.localStorage.getItem(AUTO_REFRESH_STORAGE_KEY);
    return stored === null ? true : stored === "true";
  } catch {
    return true;
  }
}

function subscribeAutoRefresh(listener) {
  autoRefreshListeners.add(listener);
  if (typeof window === "undefined") {
    return () => autoRefreshListeners.delete(listener);
  }
  const onStorage = (event) => {
    if (event.key === AUTO_REFRESH_STORAGE_KEY) listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    autoRefreshListeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

function writeAutoRefreshStorage(nextValue) {
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(AUTO_REFRESH_STORAGE_KEY, String(nextValue));
    } catch {
      /* ignore storage write failures */
    }
  }
  autoRefreshListeners.forEach((listener) => listener());
}

const emptySubscribe = () => () => {};

export function useQuotaAutoRefresh({
  fetchConnections,
  fetchQuota,
  page,
  setLoading,
  setErrors,
  setQuotaData,
  markUpdated,
}) {
  const autoRefresh = useSyncExternalStore(
    subscribeAutoRefresh,
    readAutoRefreshStorage,
    () => true,
  );
  const hasHydratedAutoRefresh = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );

  const [refreshingAll, setRefreshingAll] = useState(false);
  const [countdown, setCountdown] = useState(60);

  const intervalRef = useRef(null);
  const countdownRef = useRef(null);
  const tickCountRef = useRef(0);

  const setAutoRefresh = useCallback((updater) => {
    const current = readAutoRefreshStorage();
    const next = typeof updater === "function" ? updater(current) : Boolean(updater);
    writeAutoRefreshStorage(next);
  }, []);

  const clearTimers = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (countdownRef.current) {
      clearInterval(countdownRef.current);
      countdownRef.current = null;
    }
  }, []);

  const refreshAll = useCallback(
    async (force = false) => {
      if (refreshingAll) return;

      setRefreshingAll(true);
      setCountdown(60);

      // Throttle Claude: poll its quota every Nth auto-tick (manual force bypasses)
      const tick = (tickCountRef.current += 1);
      const claudeEvery = Math.round(CLAUDE_REFRESH_INTERVAL_MS / REFRESH_INTERVAL_MS);
      const shouldFetch = (conn) =>
        force || conn.provider !== "claude" || tick % claudeEvery === 0;

      try {
        const visibleConnections = await fetchConnections(page);
        if (!Array.isArray(visibleConnections)) return;

        if (force) {
          setLoading(buildLoadingState(visibleConnections));
        }
        setErrors((prev) => filterQuotaStateByConnections(prev, visibleConnections));
        setQuotaData((prev) => filterQuotaStateByConnections(prev, visibleConnections));

        await Promise.all(
          visibleConnections
            .filter(shouldFetch)
            .map((conn) => fetchQuota(conn.id, conn.provider, { force, silent: !force })),
        );

        markUpdated();
      } catch (error) {
        console.error("Error refreshing all providers:", error);
      } finally {
        setRefreshingAll(false);
      }
    },
    [refreshingAll, fetchConnections, fetchQuota, page, setLoading, setErrors, setQuotaData, markUpdated],
  );

  useEffect(() => {
    if (!hasHydratedAutoRefresh || !autoRefresh) {
      clearTimers();
      return;
    }

    intervalRef.current = setInterval(() => {
      refreshAll();
    }, REFRESH_INTERVAL_MS);

    countdownRef.current = setInterval(() => {
      setCountdown((prev) => (prev <= 1 ? 60 : prev - 1));
    }, 1000);

    return clearTimers;
  }, [autoRefresh, refreshAll, hasHydratedAutoRefresh, clearTimers]);

  // Pause auto-refresh when tab is hidden (Page Visibility API)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        clearTimers();
      } else if (autoRefresh && hasHydratedAutoRefresh) {
        clearTimers();
        intervalRef.current = setInterval(() => refreshAll(), REFRESH_INTERVAL_MS);
        countdownRef.current = setInterval(() => {
          setCountdown((prev) => (prev <= 1 ? 60 : prev - 1));
        }, 1000);
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [autoRefresh, refreshAll, hasHydratedAutoRefresh, clearTimers]);

  return {
    autoRefresh,
    setAutoRefresh,
    refreshingAll,
    countdown,
    refreshAll,
  };
}
