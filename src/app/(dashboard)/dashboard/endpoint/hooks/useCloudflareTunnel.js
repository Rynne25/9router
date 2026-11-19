"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
  TUNNEL_PING_INTERVAL_MS,
  TUNNEL_PING_MAX_MS,
  STATUS_POLL_FAST_MS,
  REACHABLE_MISS_THRESHOLD,
  CLIENT_PING_FAST_MS,
} from "../endpointConstants";
import { clientPingAny } from "../endpointPing";
import {
  getCachedData,
  fetchWithCache,
  fetchJson,
  invalidateCache,
} from "@/shared/utils/swrCache";

const TUNNEL_STATUS_KEY = "/api/tunnel/status";
const TUNNEL_STATUS_TTL_MS = 3000;

export function useCloudflareTunnel() {
  const cachedStatus = getCachedData(TUNNEL_STATUS_KEY);
  const [tunnelChecking, setTunnelChecking] = useState(() => cachedStatus === undefined);
  const [tunnelEnabled, setTunnelEnabled] = useState(
    () => cachedStatus?.tunnel?.settingsEnabled ?? cachedStatus?.tunnel?.enabled ?? false
  );
  const [tunnelReachable, setTunnelReachable] = useState(false);
  const [tunnelUrl, setTunnelUrl] = useState(() => cachedStatus?.tunnel?.tunnelUrl || "");
  const [tunnelPublicUrl, setTunnelPublicUrl] = useState(() => cachedStatus?.tunnel?.publicUrl || "");
  const [tunnelLoading, setTunnelLoading] = useState(false);
  const [tunnelProgress, setTunnelProgress] = useState("");
  const [tunnelStatus, setTunnelStatus] = useState(null);
  const [tunnelEverReachable, setTunnelEverReachable] = useState(false);
  const [showEnableTunnelModal, setShowEnableTunnelModal] = useState(false);
  const [showDisableTunnelModal, setShowDisableTunnelModal] = useState(false);

  const tunnelMissRef = useRef(0);
  const tunnelClientReachableRef = useRef(false);
  const tunnelEverReachableRef = useRef(false);

  const updateReachable = useCallback((isReachable) => {
    if (isReachable) {
      tunnelMissRef.current = 0;
      setTunnelReachable(true);
      if (!tunnelEverReachableRef.current) {
        tunnelEverReachableRef.current = true;
        setTunnelEverReachable(true);
      }
    } else {
      tunnelMissRef.current += 1;
      if (tunnelMissRef.current >= REACHABLE_MISS_THRESHOLD) {
        setTunnelReachable(false);
      }
    }
  }, []);

  const syncTunnelStatus = useCallback(async ({ force = true } = {}) => {
    try {
      const data = await fetchWithCache(
        TUNNEL_STATUS_KEY,
        () => fetchJson(TUNNEL_STATUS_KEY, { cache: "no-store" }),
        { ttlMs: TUNNEL_STATUS_TTL_MS, force }
      );
      if (!data) return;
      const tEnabled = data.tunnel?.settingsEnabled ?? data.tunnel?.enabled ?? false;
      const tUrl = data.tunnel?.tunnelUrl || "";
      setTunnelUrl(tUrl);
      setTunnelPublicUrl(data.tunnel?.publicUrl || "");
      setTunnelEnabled(tEnabled);
      updateReachable(tunnelClientReachableRef.current);
    } catch {
      /* ignore poll errors */
    }
  }, [updateReachable]);

  // Initial load (shared/deduped with useTailscaleTunnel)
  useEffect(() => {
    let ignore = false;
    async function loadInitialStatus() {
      try {
        const data = await fetchWithCache(
          TUNNEL_STATUS_KEY,
          () => fetchJson(TUNNEL_STATUS_KEY, { cache: "no-store" }),
          { ttlMs: TUNNEL_STATUS_TTL_MS }
        );
        if (data && !ignore) {
          const tEnabled = data.tunnel?.settingsEnabled ?? data.tunnel?.enabled ?? false;
          const tUrl = data.tunnel?.tunnelUrl || "";
          setTunnelUrl(tUrl);
          setTunnelPublicUrl(data.tunnel?.publicUrl || "");
          setTunnelEnabled(tEnabled);
          updateReachable(tunnelClientReachableRef.current);
        }
      } catch (error) {
        console.log("Error loading tunnel status:", error);
      } finally {
        if (!ignore) {
          setTunnelChecking(false);
        }
      }
    }
    loadInitialStatus();
    return () => {
      ignore = true;
    };
  }, [updateReachable]);

  // Status poll: only while degraded (not yet reachable). Stop once healthy to avoid spam.
  useEffect(() => {
    if (!tunnelEnabled) return;
    const onVisible = () => {
      if (!document.hidden) syncTunnelStatus();
    };
    document.addEventListener("visibilitychange", onVisible);

    if (tunnelReachable) {
      return () => document.removeEventListener("visibilitychange", onVisible);
    }

    const timer = setInterval(() => {
      if (!document.hidden) syncTunnelStatus();
    }, STATUS_POLL_FAST_MS);

    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [tunnelEnabled, tunnelReachable, syncTunnelStatus]);

  // Browser-side periodic ping: probes tunnel URLs directly
  useEffect(() => {
    const probe = async () => {
      if (document.hidden) return;
      if (tunnelEnabled && (tunnelUrl || tunnelPublicUrl)) {
        const ok = await clientPingAny(tunnelPublicUrl, tunnelUrl);
        tunnelClientReachableRef.current = ok;
        updateReachable(ok);
      } else {
        tunnelClientReachableRef.current = false;
      }
    };

    if (!tunnelEnabled || (!tunnelUrl && !tunnelPublicUrl)) return;
    probe();

    if (tunnelReachable) return;

    const id = setInterval(probe, CLIENT_PING_FAST_MS);
    return () => clearInterval(id);
  }, [tunnelEnabled, tunnelUrl, tunnelPublicUrl, tunnelReachable, updateReachable]);

  // Ping tunnel health until reachable. Race multiple URLs (shortlink + direct)
  const pingTunnelHealth = useCallback(async (...urls) => {
    setTunnelLoading(true);
    setTunnelProgress("Waiting for tunnel ready...");
    const targets = urls.filter(Boolean).map((u) => `${u}/api/health`);
    const start = Date.now();

    while (Date.now() - start < TUNNEL_PING_MAX_MS) {
      await new Promise((r) => setTimeout(r, TUNNEL_PING_INTERVAL_MS));
      const ok = await Promise.any(
        targets.map(async (h) => {
          const p = await fetch(h, { mode: "cors", cache: "no-store" });
          if (p.ok) return true;
          throw new Error("not ready");
        })
      ).catch(() => false);

      if (ok) {
        setTunnelEnabled(true);
        setTunnelLoading(false);
        setTunnelProgress("");
        return true;
      }

      // Every 5 pings (~10s), check if backend process still alive
      if ((Date.now() - start) % 10000 < TUNNEL_PING_INTERVAL_MS) {
        try {
          const statusRes = await fetch("/api/tunnel/status");
          if (statusRes.ok) {
            const status = await statusRes.json();
            if (!status.tunnel?.enabled) {
              setTunnelStatus({
                type: "error",
                message: "Tunnel process stopped unexpectedly.",
              });
              setTunnelLoading(false);
              setTunnelProgress("");
              return false;
            }
          }
        } catch {
          /* ignore */
        }
      }
    }

    setTunnelStatus({
      type: "error",
      message: "Tunnel created but not reachable. Please try again.",
    });
    setTunnelLoading(false);
    setTunnelProgress("");
    return false;
  }, []);

  const handleEnableTunnel = useCallback(async () => {
    setShowEnableTunnelModal(false);
    setTunnelLoading(true);
    setTunnelStatus(null);
    setTunnelProgress("Creating tunnel...");

    let polling = true;
    const pollProgress = async () => {
      while (polling) {
        try {
          const r = await fetch("/api/tunnel/status");
          if (r.ok) {
            const s = await r.json();
            if (s.download?.downloading) {
              setTunnelProgress(
                `Downloading cloudflared... ${s.download.progress}%`
              );
            } else if (polling) {
              setTunnelProgress("Creating tunnel...");
            }
          }
        } catch {
          /* ignore */
        }
        await new Promise((r) => setTimeout(r, 1000));
      }
    };
    pollProgress();

    try {
      const res = await fetch("/api/tunnel/enable", { method: "POST" });
      polling = false;
      const data = await res.json();
      if (!res.ok) {
        setTunnelStatus({
          type: "error",
          message: data.error || "Failed to enable tunnel",
        });
        return;
      }

      const url = data.tunnelUrl;
      if (!url) {
        setTunnelStatus({ type: "error", message: "No tunnel URL returned" });
        return;
      }

      setTunnelUrl(url);
      setTunnelPublicUrl(data.publicUrl || "");
      invalidateCache(TUNNEL_STATUS_KEY);
      await pingTunnelHealth(data.publicUrl, url);
    } catch (error) {
      setTunnelStatus({ type: "error", message: error.message });
    } finally {
      polling = false;
      setTunnelLoading(false);
      setTunnelProgress("");
    }
  }, [pingTunnelHealth]);

  const handleDisableTunnel = useCallback(async () => {
    setTunnelLoading(true);
    setTunnelStatus(null);
    try {
      const res = await fetch("/api/tunnel/disable", { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        setTunnelEnabled(false);
        setTunnelUrl("");
        setShowDisableTunnelModal(false);
        invalidateCache(TUNNEL_STATUS_KEY);
        setTunnelStatus({ type: "success", message: "Tunnel disabled" });
      } else {
        setTunnelStatus({
          type: "error",
          message: data.error || "Failed to disable tunnel",
        });
      }
    } catch (error) {
      setTunnelStatus({ type: "error", message: error.message });
    } finally {
      setTunnelLoading(false);
    }
  }, []);

  return {
    tunnelChecking,
    setTunnelChecking,
    tunnelEnabled,
    tunnelReachable,
    tunnelUrl,
    tunnelPublicUrl,
    tunnelLoading,
    setTunnelLoading,
    tunnelProgress,
    setTunnelProgress,
    tunnelStatus,
    setTunnelStatus,
    tunnelEverReachable,
    showEnableTunnelModal,
    setShowEnableTunnelModal,
    showDisableTunnelModal,
    setShowDisableTunnelModal,
    syncTunnelStatus,
    handleEnableTunnel,
    handleDisableTunnel,
  };
}
