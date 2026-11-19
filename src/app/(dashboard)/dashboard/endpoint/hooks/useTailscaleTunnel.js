"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
  TUNNEL_PING_INTERVAL_MS,
  TUNNEL_PING_MAX_MS,
  STATUS_POLL_FAST_MS,
  REACHABLE_MISS_THRESHOLD,
  CLIENT_PING_FAST_MS,
} from "../endpointConstants";
import { clientPingUrl } from "../endpointPing";
import {
  getCachedData,
  fetchWithCache,
  fetchJson,
  invalidateCache,
} from "@/shared/utils/swrCache";

const TUNNEL_STATUS_KEY = "/api/tunnel/status";
const TUNNEL_STATUS_TTL_MS = 3000;

export function useTailscaleTunnel() {
  const cachedStatus = getCachedData(TUNNEL_STATUS_KEY);
  const [tsEnabled, setTsEnabled] = useState(
    () => cachedStatus?.tailscale?.settingsEnabled ?? cachedStatus?.tailscale?.enabled ?? false
  );
  const [tsReachable, setTsReachable] = useState(false);
  const [tsUrl, setTsUrl] = useState(() => cachedStatus?.tailscale?.tunnelUrl || "");
  const [tsLoading, setTsLoading] = useState(false);
  const [tsProgress, setTsProgress] = useState("");
  const [tsStatus, setTsStatus] = useState(null);
  const [tsAuthUrl, setTsAuthUrl] = useState("");
  const [tsAuthLabel, setTsAuthLabel] = useState("");
  const [tsInstalled, setTsInstalled] = useState(null); // null=checking, true/false
  const [tsInstalling, setTsInstalling] = useState(false);
  const [tsInstallLog, setTsInstallLog] = useState([]);
  const [tsSudoPassword, setTsSudoPassword] = useState("");
  const [tsConnecting, setTsConnecting] = useState(false);
  const [tsEverReachable, setTsEverReachable] = useState(false);
  const [showTsModal, setShowTsModal] = useState(false);
  const [showDisableTsModal, setShowDisableTsModal] = useState(false);

  const tsMissRef = useRef(0);
  const tsClientReachableRef = useRef(false);
  const tsEverReachableRef = useRef(false);
  const tsLogRef = useRef(null);

  const updateReachable = useCallback((isReachable) => {
    if (isReachable) {
      tsMissRef.current = 0;
      setTsReachable(true);
      if (!tsEverReachableRef.current) {
        tsEverReachableRef.current = true;
        setTsEverReachable(true);
      }
    } else {
      tsMissRef.current += 1;
      if (tsMissRef.current >= REACHABLE_MISS_THRESHOLD) {
        setTsReachable(false);
      }
    }
  }, []);

  const syncTailscaleStatus = useCallback(async ({ force = true } = {}) => {
    try {
      const data = await fetchWithCache(
        TUNNEL_STATUS_KEY,
        () => fetchJson(TUNNEL_STATUS_KEY, { cache: "no-store" }),
        { ttlMs: TUNNEL_STATUS_TTL_MS, force }
      );
      if (!data) return;
      const tsEn = data.tailscale?.settingsEnabled ?? data.tailscale?.enabled ?? false;
      const tsUrlVal = data.tailscale?.tunnelUrl || "";
      setTsUrl(tsUrlVal);
      setTsEnabled(tsEn);
      updateReachable(tsClientReachableRef.current);
    } catch {
      /* ignore poll errors */
    }
  }, [updateReachable]);

  // Initial load (shared/deduped with useCloudflareTunnel)
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
          const tsEn = data.tailscale?.settingsEnabled ?? data.tailscale?.enabled ?? false;
          const tsUrlVal = data.tailscale?.tunnelUrl || "";
          setTsUrl(tsUrlVal);
          setTsEnabled(tsEn);
          updateReachable(tsClientReachableRef.current);
        }
      } catch (error) {
        console.log("Error loading tailscale status:", error);
      }
    }
    loadInitialStatus();
    return () => {
      ignore = true;
    };
  }, [updateReachable]);

  // Auto-scroll install log
  useEffect(() => {
    if (tsLogRef.current) {
      tsLogRef.current.scrollTop = tsLogRef.current.scrollHeight;
    }
  }, [tsInstallLog]);

  // Status poll: only while degraded (not yet reachable). Stop once healthy to avoid spam.
  useEffect(() => {
    if (!tsEnabled) return;
    const onVisible = () => {
      if (!document.hidden) syncTailscaleStatus();
    };
    document.addEventListener("visibilitychange", onVisible);

    if (tsReachable) {
      return () => document.removeEventListener("visibilitychange", onVisible);
    }

    const timer = setInterval(() => {
      if (!document.hidden) syncTailscaleStatus();
    }, STATUS_POLL_FAST_MS);

    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [tsEnabled, tsReachable, syncTailscaleStatus]);

  // Browser-side periodic ping: probes tailscale URL directly
  useEffect(() => {
    const probe = async () => {
      if (document.hidden) return;
      if (tsEnabled && tsUrl) {
        const ok = await clientPingUrl(tsUrl);
        tsClientReachableRef.current = ok;
        updateReachable(ok);
      } else {
        tsClientReachableRef.current = false;
      }
    };

    if (!tsEnabled || !tsUrl) return;
    probe();

    if (tsReachable) return;

    const id = setInterval(probe, CLIENT_PING_FAST_MS);
    return () => clearInterval(id);
  }, [tsEnabled, tsUrl, tsReachable, updateReachable]);

  const checkTailscaleInstalled = useCallback(async () => {
    setTsInstalled(null);
    try {
      const res = await fetch("/api/tunnel/tailscale-check");
      if (res.ok) {
        const data = await res.json();
        setTsInstalled(data.installed);
        return data;
      }
    } catch {
      /* ignore */
    }
    setTsInstalled(false);
    return { installed: false };
  }, []);

  const pingTsHealth = useCallback(async (url) => {
    setTsProgress("Waiting for Tailscale ready...");
    const healthUrl = `${url}/api/health`;
    const start = Date.now();
    while (Date.now() - start < TUNNEL_PING_MAX_MS) {
      await new Promise((r) => setTimeout(r, TUNNEL_PING_INTERVAL_MS));
      try {
        const ping = await fetch(healthUrl, { mode: "no-cors", cache: "no-store" });
        if (ping.ok || ping.type === "opaque") return true;
      } catch {
        /* not ready yet */
      }
    }
    return false;
  }, []);

  const requestUserAuth = useCallback((url, label) => {
    setTsAuthUrl(url);
    setTsAuthLabel(label);
  }, []);

  const clearUserAuth = useCallback(() => {
    setTsAuthUrl("");
    setTsAuthLabel("");
  }, []);

  const pollFunnelEnable = useCallback(async (enableUrl) => {
    requestUserAuth(enableUrl, "Open Funnel Settings");
    setTsProgress('Click "Open Funnel Settings" to enable Funnel...');
    for (let i = 0; i < 40; i++) {
      await new Promise((r) => setTimeout(r, 3000));
      try {
        const res = await fetch("/api/tunnel/tailscale-enable", { method: "POST" });
        const data = await res.json();
        if (res.ok && data.success) {
          clearUserAuth();
          setTsUrl(data.tunnelUrl || "");
          const ok3 = await pingTsHealth(data.tunnelUrl);
          setTsEnabled(true);
          setTsStatus(ok3 ? null : { type: "warning", message: "Connected but not reachable yet." });
          return;
        }
        if (data.funnelNotEnabled) continue;
        if (data.error) {
          clearUserAuth();
          setTsStatus({ type: "error", message: data.error });
          return;
        }
      } catch {
        /* retry */
      }
    }
    clearUserAuth();
    setTsStatus({ type: "error", message: "Timed out waiting for Funnel to be enabled." });
  }, [clearUserAuth, pingTsHealth, requestUserAuth]);

  const handleConnectTailscale = useCallback(async () => {
    setShowTsModal(false);
    setTsConnecting(true);
    setTsLoading(true);
    setTsStatus(null);
    setTsProgress("Connecting...");
    clearUserAuth();
    try {
      const res = await fetch("/api/tunnel/tailscale-enable", { method: "POST" });
      const data = await res.json();

      if (res.ok && data.success) {
        setTsUrl(data.tunnelUrl || "");
        invalidateCache(TUNNEL_STATUS_KEY);
        const reachable = await pingTsHealth(data.tunnelUrl);
        setTsEnabled(true);
        setTsStatus(reachable ? null : { type: "warning", message: "Connected but not reachable yet." });
        return;
      }

      if (data.needsLogin && data.authUrl) {
        requestUserAuth(data.authUrl, "Open Login Page");
        setTsProgress('Login required — click "Open Login Page" to continue');
        for (let i = 0; i < 40; i++) {
          await new Promise((r) => setTimeout(r, 3000));
          try {
            const r2 = await fetch("/api/tunnel/tailscale-check");
            if (r2.ok) {
              const check = await r2.json();
              if (check.loggedIn) {
                clearUserAuth();
                setTsProgress("Starting funnel...");
                const res2 = await fetch("/api/tunnel/tailscale-enable", { method: "POST" });
                const data2 = await res2.json();
                if (res2.ok && data2.success) {
                  setTsUrl(data2.tunnelUrl || "");
                  const ok2 = await pingTsHealth(data2.tunnelUrl);
                  setTsEnabled(true);
                  setTsStatus(ok2 ? null : { type: "warning", message: "Connected but not reachable yet." });
                } else if (data2.funnelNotEnabled && data2.enableUrl) {
                  await pollFunnelEnable(data2.enableUrl);
                } else {
                  setTsStatus({ type: "error", message: data2.error || "Failed to start funnel" });
                }
                return;
              }
            }
          } catch {
            /* retry */
          }
        }
        clearUserAuth();
        setTsStatus({ type: "error", message: "Login timed out. Please try again." });
        return;
      }

      if (data.funnelNotEnabled && data.enableUrl) {
        await pollFunnelEnable(data.enableUrl);
        return;
      }

      setTsStatus({ type: "error", message: data.error || "Failed to connect" });
    } catch (error) {
      setTsStatus({ type: "error", message: error.message });
    } finally {
      setTsLoading(false);
      setTsConnecting(false);
      setTsProgress("");
      clearUserAuth();
    }
  }, [clearUserAuth, pingTsHealth, pollFunnelEnable, requestUserAuth]);

  const handleInstallTailscale = useCallback(async () => {
    setTsInstalling(true);
    setTsStatus(null);
    setTsInstallLog([]);
    try {
      const res = await fetch("/api/tunnel/tailscale-install", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sudoPassword: tsSudoPassword }),
      });
      setTsSudoPassword("");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop() || "";
        for (const part of parts) {
          const lines = part.split("\n");
          let event = "progress";
          let data = null;
          for (const line of lines) {
            if (line.startsWith("event: ")) event = line.slice(7).trim();
            if (line.startsWith("data: ")) {
              try {
                data = JSON.parse(line.slice(6));
              } catch {
                /* skip */
              }
            }
          }
          if (!data) continue;
          if (event === "progress") {
            setTsInstallLog((prev) => [...prev.slice(-50), data.message]);
          } else if (event === "done") {
            setTsInstalled(true);
            setTsInstalling(false);
            setShowTsModal(false);
            handleConnectTailscale();
            return;
          } else if (event === "error") {
            setTsStatus({ type: "error", message: data.error || "Install failed" });
          }
        }
      }
    } catch (e) {
      setTsStatus({ type: "error", message: e.message });
    } finally {
      setTsInstalling(false);
    }
  }, [handleConnectTailscale, tsSudoPassword]);

  const handleDisableTailscale = useCallback(async () => {
    setTsLoading(true);
    setTsStatus(null);
    try {
      const res = await fetch("/api/tunnel/tailscale-disable", { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        setTsEnabled(false);
        setTsUrl("");
        setShowDisableTsModal(false);
        invalidateCache(TUNNEL_STATUS_KEY);
        setTsStatus({ type: "success", message: "Tailscale disabled" });
      } else {
        setTsStatus({ type: "error", message: data.error || "Failed to disable Tailscale" });
      }
    } catch (e) {
      setTsStatus({ type: "error", message: e.message });
    } finally {
      setTsLoading(false);
    }
  }, []);

  const handleOpenTsModal = useCallback(async () => {
    setTsStatus(null);
    setTsInstallLog([]);
    const data = await checkTailscaleInstalled();
    if (data?.installed && data?.hasCachedPassword) {
      handleConnectTailscale();
    } else {
      setShowTsModal(true);
    }
  }, [checkTailscaleInstalled, handleConnectTailscale]);

  return {
    tsEnabled,
    tsReachable,
    tsUrl,
    tsLoading,
    tsProgress,
    tsStatus,
    setTsStatus,
    tsAuthUrl,
    tsAuthLabel,
    tsInstalled,
    tsInstalling,
    tsInstallLog,
    tsSudoPassword,
    setTsSudoPassword,
    tsConnecting,
    setTsConnecting,
    setTsLoading,
    setTsProgress,
    tsEverReachable,
    showTsModal,
    setShowTsModal,
    showDisableTsModal,
    setShowDisableTsModal,
    tsLogRef,
    clearUserAuth,
    syncTailscaleStatus,
    checkTailscaleInstalled,
    handleConnectTailscale,
    handleInstallTailscale,
    handleDisableTailscale,
    handleOpenTsModal,
  };
}
