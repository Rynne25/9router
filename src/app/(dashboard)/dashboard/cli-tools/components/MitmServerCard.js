"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, Button, Badge, Input } from "@/shared/components";
import { getCachedData, fetchWithCache, fetchJson, invalidateCache } from "@/shared/utils/swrCache";

const DEFAULT_MITM_ROUTER_BASE = "http://localhost:20128";
const MITM_STATUS_CACHE_KEY = "/api/cli-tools/antigravity-mitm";
const MITM_STATUS_TTL_MS = 5000;

/**
 * Shared MITM infrastructure card — manages SSL cert + server start/stop.
 * DNS per-tool is handled separately in MitmToolCard.
 */
export default function MitmServerCard({ apiKeys, cloudEnabled, onStatusChange }) {
  const cachedStatus = getCachedData(MITM_STATUS_CACHE_KEY);
  const [status, setStatus] = useState(() => cachedStatus || null);
  const [loading, setLoading] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [sudoPassword, setSudoPassword] = useState("");
  const [selectedApiKey, setSelectedApiKey] = useState(() => apiKeys?.[0]?.key || "");
  const [pendingAction, setPendingAction] = useState(null);
  const [modalError, setModalError] = useState(null);
  const [actionError, setActionError] = useState(null);
  const [mitmRouterBaseUrl, setMitmRouterBaseUrl] = useState(
    () => cachedStatus?.mitmRouterBaseUrl || DEFAULT_MITM_ROUTER_BASE
  );
  const [port443Conflict, setPort443Conflict] = useState(null);
  const effectiveApiKey = selectedApiKey || apiKeys?.[0]?.key || "";

  const serverIsWindows = status?.isWin === true;
  const canRunWithoutPassword = serverIsWindows || status?.hasCachedPassword || status?.needsSudoPassword === false;
  const isAdmin = status?.isAdmin !== false;
  // No privilege: not admin/root AND (Win OR no cached sudo password)
  const noPrivilege = !isAdmin && (serverIsWindows || (!status?.hasCachedPassword && status?.needsSudoPassword !== false));

  const fetchStatus = useCallback(async ({ force = false } = {}) => {
    try {
      const data = await fetchWithCache(
        MITM_STATUS_CACHE_KEY,
        () => fetchJson(MITM_STATUS_CACHE_KEY),
        { ttlMs: MITM_STATUS_TTL_MS, force }
      );
      if (data) {
        setStatus(data);
        if (data.mitmRouterBaseUrl) {
          setMitmRouterBaseUrl(data.mitmRouterBaseUrl);
        }
        onStatusChange?.(data);
      }
    } catch {
      setStatus({ running: false, certExists: false, dnsStatus: {} });
    }
  }, [onStatusChange]);

  useEffect(() => {
    queueMicrotask(() => {
      fetchStatus();
    });
  }, [fetchStatus]);

  const doAction = async (action, password, forceKillPort443 = false) => {
    setLoading(true);
    setActionError(null);
    try {
      let res;
      if (action === "trust-cert") {
        res = await fetch("/api/cli-tools/antigravity-mitm", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "trust-cert", sudoPassword: password }),
        });
      } else if (action === "start") {
        const keyToUse = selectedApiKey?.trim()
          || (apiKeys?.length > 0 ? apiKeys[0].key : null)
          || (!cloudEnabled ? "sk_9router" : null);
        res = await fetch("/api/cli-tools/antigravity-mitm", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            apiKey: keyToUse,
            sudoPassword: password,
            mitmRouterBaseUrl: mitmRouterBaseUrl.trim() || DEFAULT_MITM_ROUTER_BASE,
            forceKillPort443,
          }),
        });
      } else {
        res = await fetch("/api/cli-tools/antigravity-mitm", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sudoPassword: password }),
        });
      }
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        if (data.code === "PORT_443_BUSY" && data.portOwner) {
          setShowPasswordModal(false);
          setPort443Conflict({ owner: data.portOwner, password });
          return;
        }
        setActionError(data.error || `Failed to ${action} MITM server`);
        return;
      }
      setShowPasswordModal(false);
      setSudoPassword("");
      setPort443Conflict(null);
      invalidateCache(MITM_STATUS_CACHE_KEY);
      await fetchStatus({ force: true });
    } catch (e) {
      setActionError(e.message || "Network error");
    } finally {
      setLoading(false);
      setPendingAction(null);
    }
  };

  const handleAction = (action) => {
    setActionError(null);
    // Wait for status to load before deciding whether to show sudo modal
    if (!status) return;
    if (canRunWithoutPassword) {
      doAction(action, "");
    } else {
      setPendingAction(action);
      setShowPasswordModal(true);
      setModalError(null);
    }
  };

  const handleKillAndStart = () => {
    const pwd = port443Conflict?.password || "";
    doAction("start", pwd, true);
  };

  const handleConfirmPassword = () => {
    if (!sudoPassword.trim()) {
      setModalError("Sudo password is required");
      return;
    }
    doAction(pendingAction, sudoPassword);
  };

  const isRunning = Boolean(status?.running);
  const certExists = Boolean(status?.certExists);
  const certTrusted = Boolean(status?.certTrusted);
  const activeDnsToolsCount = Object.values(status?.dnsStatus || {}).filter(Boolean).length;

  return (
    <>
      <Card padding="sm" className="relative overflow-hidden">
        <div className="flex flex-col gap-2.5">
          {/* Top Header Row — Compact Single Line */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-black/[0.06] dark:border-white/[0.08] pb-2">
            <div className="flex flex-wrap items-center gap-2 min-w-0">
              <div className={`size-7 rounded-lg flex items-center justify-center shrink-0 border transition-colors ${
                isRunning
                  ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-500"
                  : "bg-primary/15 border-primary/30 text-primary"
              }`}>
                <span className="material-symbols-outlined text-[16px]">security</span>
              </div>
              <h2 className="text-xs sm:text-sm font-bold text-text-main tracking-tight">
                Proxy MITM Server
              </h2>
              {isRunning ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
                  <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  <span>Đang chạy (:443)</span>
                </span>
              ) : (
                <Badge variant="default" size="xs">Đã dừng</Badge>
              )}

              {/* Compact inline pipeline pills */}
              <div className="hidden xl:flex items-center gap-1.5 ml-2 text-[10.5px]" data-i18n-skip="true">
                <span className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 font-medium ${
                  certTrusted
                    ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                    : "border-black/10 dark:border-white/10 text-text-muted"
                }`}>
                  <span className="material-symbols-outlined text-[12px]">
                    {certTrusted ? "verified_user" : "workspace_premium"}
                  </span>
                  <span>1. Root CA {certTrusted ? "OK" : "Chưa Trust"}</span>
                </span>
                <span className="text-text-muted/50">➔</span>
                <span className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 font-medium ${
                  isRunning
                    ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                    : "border-black/10 dark:border-white/10 text-text-muted"
                }`}>
                  <span className="material-symbols-outlined text-[12px]">dns</span>
                  <span>2. HTTPS :443 {isRunning ? "Bật" : "Tắt"}</span>
                </span>
                <span className="text-text-muted/50">➔</span>
                <span className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 font-medium ${
                  activeDnsToolsCount > 0
                    ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                    : "border-black/10 dark:border-white/10 text-text-muted"
                }`}>
                  <span className="material-symbols-outlined text-[12px]">alt_route</span>
                  <span>3. DNS ({activeDnsToolsCount} công cụ)</span>
                </span>
              </div>
            </div>

            {/* Primary Server Actions */}
            <div className="flex items-center gap-1.5 shrink-0" data-i18n-skip="true">
              <button
                type="button"
                onClick={() => fetchStatus({ force: true })}
                disabled={loading}
                title="Làm mới trạng thái MITM"
                className="flex size-7 items-center justify-center rounded-lg border border-black/10 bg-white/50 text-text-muted transition-all hover:bg-white/80 hover:text-text-main dark:border-white/10 dark:bg-white/[0.04] dark:hover:bg-white/10 disabled:opacity-50"
              >
                <span className={`material-symbols-outlined text-[15px] ${loading ? "animate-spin" : ""}`}>
                  refresh
                </span>
              </button>

              {certExists && !certTrusted && (
                <button
                  type="button"
                  onClick={() => handleAction("trust-cert")}
                  disabled={loading}
                  className="inline-flex h-7 items-center justify-center gap-1 rounded-lg border border-amber-500/40 bg-amber-500/15 px-2.5 text-[11px] font-bold text-amber-600 dark:text-amber-400 transition-all hover:bg-amber-500/25 disabled:opacity-50 cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[14px]">verified_user</span>
                  <span>Trust CA</span>
                </button>
              )}

              {isRunning ? (
                <button
                  type="button"
                  onClick={() => handleAction("stop")}
                  disabled={loading}
                  className="inline-flex h-7 items-center justify-center gap-1 rounded-lg border border-red-500/40 bg-red-500/15 px-3 text-[11px] font-bold text-red-600 dark:text-red-400 transition-all hover:bg-red-500/25 disabled:opacity-50 cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[14px]">stop_circle</span>
                  <span>Dừng Server</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => handleAction("start")}
                  disabled={loading || !status || (serverIsWindows && !isAdmin)}
                  title={serverIsWindows && !isAdmin ? "Cần quyền Administrator" : undefined}
                  className="inline-flex h-7 items-center justify-center gap-1 rounded-lg border border-primary/40 bg-primary text-white px-3 text-[11px] font-bold shadow-2xs transition-all hover:bg-primary-hover active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[14px]">play_circle</span>
                  <span>Khởi động Server</span>
                </button>
              )}
            </div>
          </div>

          {/* Symmetrical 2-Column Compact Inline Configuration Inputs */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            <div className="flex items-center gap-2 rounded-lg border border-black/[0.06] dark:border-white/[0.08] bg-white/35 dark:bg-white/[0.02] px-2.5 py-1.5">
              <span className="material-symbols-outlined text-[14px] text-primary shrink-0">lan</span>
              <span className="text-[11px] font-semibold text-text-muted shrink-0">Base URL:</span>
              <input
                type="text"
                value={mitmRouterBaseUrl}
                onChange={(e) => setMitmRouterBaseUrl(e.target.value)}
                placeholder={DEFAULT_MITM_ROUTER_BASE}
                disabled={isRunning}
                className="flex-1 min-w-0 h-6 px-2 bg-white/70 dark:bg-black/25 rounded border border-black/10 dark:border-white/10 text-[11px] font-mono text-text-main focus:outline-none focus:border-primary disabled:opacity-60"
              />
            </div>

            <div className="flex items-center gap-2 rounded-lg border border-black/[0.06] dark:border-white/[0.08] bg-white/35 dark:bg-white/[0.02] px-2.5 py-1.5">
              <span className="material-symbols-outlined text-[14px] text-primary shrink-0">vpn_key</span>
              <span className="text-[11px] font-semibold text-text-muted shrink-0">API Key:</span>
              <input
                type="text"
                list="mitm-api-keys"
                value={effectiveApiKey}
                onChange={(e) => setSelectedApiKey(e.target.value)}
                disabled={isRunning}
                placeholder={cloudEnabled ? "Nhập hoặc chọn API key" : "sk_9router (mặc định)"}
                className="flex-1 min-w-0 h-6 px-2 bg-white/70 dark:bg-black/25 rounded border border-black/10 dark:border-white/10 text-[11px] font-mono text-text-main focus:outline-none focus:border-primary disabled:opacity-60"
              />
              {apiKeys?.length > 0 && (
                <datalist id="mitm-api-keys">
                  {apiKeys.map((key) => (
                    <option key={key.id} value={key.key}>{key.name || key.key}</option>
                  ))}
                </datalist>
              )}
            </div>
          </div>

          {/* Action error */}
          {actionError && (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/20">
              <span className="material-symbols-outlined text-[14px] shrink-0">error</span>
              <span>{actionError}</span>
            </div>
          )}

          {/* Windows admin warning */}
          {serverIsWindows && !isAdmin && (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
              <span className="material-symbols-outlined text-[14px] shrink-0">shield_lock</span>
              <span>Cần chạy 9Router bằng quyền Quản trị viên (Run as Administrator) khi muốn bật cổng 443. Bạn vẫn có thể cấu hình và lưu ánh xạ Model bình thường.</span>
            </div>
          )}
        </div>
      </Card>

      {/* Password Modal */}
      {showPasswordModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="mx-4 flex w-full max-w-sm flex-col gap-4 rounded-xl border border-border bg-surface p-5 shadow-xl sm:p-6">
            <h3 className="font-semibold text-text-main">Sudo Password Required</h3>
            <div className="flex items-start gap-3 p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
              <span className="material-symbols-outlined text-yellow-500 text-[20px]">warning</span>
              <p className="text-xs text-text-muted">Required for SSL certificate and server startup</p>
            </div>
            <Input
              type="password"
              placeholder="Enter sudo password"
              value={sudoPassword}
              onChange={(e) => setSudoPassword(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !loading) handleConfirmPassword(); }}
            />
            {modalError && (
              <div className="flex items-center gap-2 px-2 py-1.5 rounded text-xs bg-red-500/10 text-red-600">
                <span className="material-symbols-outlined text-[14px]">error</span>
                <span>{modalError}</span>
              </div>
            )}
            <div className="flex items-center justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => { setShowPasswordModal(false); setSudoPassword(""); setModalError(null); }} disabled={loading}>
                Cancel
              </Button>
              <Button variant="primary" size="sm" onClick={handleConfirmPassword} loading={loading}>
                Confirm
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Port 443 Conflict Modal */}
      {port443Conflict && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="mx-4 flex w-full max-w-md flex-col gap-4 rounded-xl border border-border bg-surface p-5 shadow-xl sm:p-6">
            <h3 className="font-semibold text-text-main">Port 443 Already In Use</h3>
            <div className="flex items-start gap-3 p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
              <span className="material-symbols-outlined text-yellow-500 text-[20px]">warning</span>
              <div className="flex flex-col gap-1 text-xs text-text-muted">
                <p>Port 443 is currently used by another process:</p>
                <p className="font-mono text-text-main" data-i18n-skip="true">
                  {port443Conflict.owner.name} (PID {port443Conflict.owner.pid})
                </p>
                <p>Kill this process to start MITM Server?</p>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => { setPort443Conflict(null); setLoading(false); }} disabled={loading}>
                Cancel
              </Button>
              <Button variant="primary" size="sm" onClick={handleKillAndStart} loading={loading}>
                Kill & Start
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
