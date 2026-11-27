"use client";

import { useState, useEffect, useCallback } from "react";
import { Button, Input } from "@/shared/components";
import { HudFrame, MagneticButton } from "@/shared/components/hud";
import { useHudPrefs } from "@/shared/hooks/useHudPrefs";
import { playHudSound } from "@/shared/utils/hudAudio";
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
  const { motionPaused } = useHudPrefs();

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
          playHudSound("alert");
          return;
        }
        const actionLabel =
          action === "start" ? "khởi động" : action === "stop" ? "dừng" : "tin cậy chứng chỉ";
        setActionError(data.error || `Không thể ${actionLabel} máy chủ MITM`);
        playHudSound("alert");
        return;
      }
      setShowPasswordModal(false);
      setSudoPassword("");
      setPort443Conflict(null);
      playHudSound("confirm");
      invalidateCache(MITM_STATUS_CACHE_KEY);
      await fetchStatus({ force: true });
    } catch (e) {
      setActionError(e.message || "Lỗi kết nối mạng");
      playHudSound("alert");
    } finally {
      setLoading(false);
      setPendingAction(null);
    }
  };

  const handleAction = (action) => {
    setActionError(null);
    // Wait for status to load before deciding whether to show sudo modal
    if (!status) return;
    playHudSound("click");
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
      setModalError("Vui lòng nhập mật khẩu sudo");
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
      <HudFrame
        chamfer="md"
        accent={isRunning ? "emerald" : "cyan"}
        borderBeam={isRunning}
        spotlight={true}
        padding="sm"
        className="relative"
      >
        <div className="flex flex-col gap-2.5">
          {/* Top Header Row — Orbital Telemetry & Server Controls */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-cyan-500/15 pb-2.5">
            <div className="flex flex-wrap items-center gap-2 min-w-0">
              <div
                className={`size-7 rounded-lg flex items-center justify-center shrink-0 border transition-colors ${
                  isRunning
                    ? "bg-emerald-500/15 border-emerald-500/35 text-emerald-500"
                    : "bg-cyan-500/12 border-cyan-500/30 text-cyan-600 dark:text-cyan-400"
                }`}
              >
                <span className="material-symbols-outlined text-[16px]">security</span>
              </div>
              <h2 className="text-xs sm:text-sm font-bold text-text-main tracking-tight">
                Máy chủ Proxy MITM
              </h2>

              {/* Orbital Telemetry Status Badges */}
              <div className="flex flex-wrap items-center gap-1.5" data-i18n-skip="true">
                {isRunning ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 border border-emerald-500/35 px-2 py-0.5 font-mono text-[10px] font-bold text-emerald-700 dark:text-emerald-300">
                    <span
                      className={`size-1.5 rounded-full bg-emerald-500 ${
                        motionPaused ? "" : "animate-pulse"
                      }`}
                    />
                    <span>:443 ĐANG CHẠY</span>
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-black/[0.04] dark:bg-white/[0.05] border border-black/10 dark:border-white/10 px-2 py-0.5 font-mono text-[10px] font-bold text-text-muted">
                    <span className="size-1.5 rounded-full bg-slate-400" />
                    <span>:443 ĐANG CHỜ</span>
                  </span>
                )}

                <span
                  className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 font-mono text-[10px] font-semibold ${
                    certTrusted
                      ? "border-emerald-500/30 bg-emerald-500/12 text-emerald-700 dark:text-emerald-300"
                      : "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300"
                  }`}
                >
                  <span className="material-symbols-outlined text-[12px]">
                    {certTrusted ? "verified_user" : "workspace_premium"}
                  </span>
                  <span>{certTrusted ? "CHỨNG CHỈ TIN CẬY" : "CHƯA TIN CẬY CA"}</span>
                </span>

                <span className="hidden sm:inline-flex items-center gap-1 rounded-md border border-cyan-500/30 bg-cyan-500/10 px-2 py-0.5 font-mono text-[10px] font-semibold text-cyan-700 dark:text-cyan-300">
                  <span className="material-symbols-outlined text-[12px]">alt_route</span>
                  <span>CHUYỂN TIẾP THÔNG MINH</span>
                </span>
              </div>

              {/* Glassmorphic Pipeline Telemetry (1.CA -> 2.TLS:443 -> 3.DNS) */}
              <div
                className="hidden lg:flex items-center gap-1.5 ml-1 rounded-lg border border-cyan-500/20 bg-white/60 dark:bg-[#070D1B]/75 backdrop-blur-md px-2.5 py-1 font-mono text-[10px] shadow-2xs"
                data-i18n-skip="true"
              >
                <span
                  className={`inline-flex items-center gap-1 rounded px-1 py-0.5 ${
                    certTrusted
                      ? "text-emerald-600 dark:text-emerald-400 font-semibold"
                      : "text-text-muted"
                  }`}
                >
                  <span
                    className={`size-1.5 rounded-full ${
                      certTrusted ? "bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.75)]" : "bg-amber-400/70"
                    }`}
                  />
                  <span>1.CA</span>
                </span>
                <span className="text-cyan-500/50">→</span>
                <span
                  className={`inline-flex items-center gap-1 rounded px-1 py-0.5 ${
                    isRunning
                      ? "text-emerald-600 dark:text-emerald-400 font-semibold"
                      : "text-text-muted"
                  }`}
                >
                  <span
                    className={`size-1.5 rounded-full ${
                      isRunning ? "bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.75)]" : "bg-slate-400/60"
                    }`}
                  />
                  <span>2.TLS:443</span>
                </span>
                <span className="text-cyan-500/50">→</span>
                <span
                  className={`inline-flex items-center gap-1 rounded px-1 py-0.5 hud-telemetry-num ${
                    activeDnsToolsCount > 0
                      ? "text-cyan-600 dark:text-cyan-400 font-bold"
                      : "text-text-muted"
                  }`}
                >
                  <span
                    className={`size-1.5 rounded-full ${
                      activeDnsToolsCount > 0 ? "bg-cyan-400 shadow-[0_0_6px_rgba(34,211,238,0.8)]" : "bg-slate-400/60"
                    }`}
                  />
                  <span>3.DNS({activeDnsToolsCount})</span>
                </span>
              </div>
            </div>

            {/* Primary Server Actions */}
            <div className="flex items-center gap-1.5 shrink-0" data-i18n-skip="true">
              <button
                type="button"
                data-cursor-target="true"
                onClick={() => {
                  playHudSound("click");
                  fetchStatus({ force: true });
                }}
                disabled={loading}
                title="Làm mới trạng thái MITM"
                className="flex size-7 items-center justify-center rounded-lg border border-cyan-500/20 bg-white/60 text-text-muted transition-all hover:border-cyan-500/45 hover:text-cyan-600 dark:bg-white/[0.04] dark:hover:text-cyan-300 disabled:opacity-50 cursor-pointer"
              >
                <span className={`material-symbols-outlined text-[15px] ${loading ? "animate-spin" : ""}`}>
                  refresh
                </span>
              </button>

              {certExists && !certTrusted && (
                <MagneticButton strength={loading ? 0 : 4}>
                  <button
                    type="button"
                    data-cursor-target="true"
                    onClick={() => handleAction("trust-cert")}
                    disabled={loading}
                    className="inline-flex h-7 items-center justify-center gap-1 rounded-lg border border-amber-500/40 bg-amber-500/15 px-2.5 text-[11px] font-bold text-amber-700 dark:text-amber-300 transition-all hover:bg-amber-500/25 disabled:opacity-50 cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-[14px]">verified_user</span>
                    <span>Tin cậy CA</span>
                  </button>
                </MagneticButton>
              )}

              {isRunning ? (
                <MagneticButton strength={loading ? 0 : 4}>
                  <button
                    type="button"
                    data-cursor-target="true"
                    onClick={() => handleAction("stop")}
                    disabled={loading}
                    className="inline-flex h-7 items-center justify-center gap-1 rounded-lg border border-rose-500/40 bg-rose-500/15 px-3 text-[11px] font-bold text-rose-700 dark:text-rose-300 transition-all hover:bg-rose-500/25 disabled:opacity-50 cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-[14px]">stop_circle</span>
                    <span>Dừng Server</span>
                  </button>
                </MagneticButton>
              ) : (
                <MagneticButton strength={loading || !status || noPrivilege ? 0 : 4}>
                  <button
                    type="button"
                    data-cursor-target="true"
                    onClick={() => handleAction("start")}
                    disabled={loading || !status || noPrivilege}
                    title={serverIsWindows && !isAdmin ? "Cần quyền Administrator" : undefined}
                    className="inline-flex h-7 items-center justify-center gap-1 rounded-lg border border-cyan-500/50 bg-primary text-white px-3 text-[11px] font-bold shadow-[0_0_12px_-3px_rgba(6,182,212,0.5)] transition-all hover:bg-primary-hover active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-[14px]">play_circle</span>
                    <span>Khởi động Server</span>
                  </button>
                </MagneticButton>
              )}
            </div>
          </div>

          {/* Crisp Inline DNS/Router Config Inputs */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            <div className="flex items-center gap-2 rounded-lg border border-cyan-500/20 bg-white/55 dark:bg-[#070D1B]/75 px-2.5 py-1.5 transition-colors focus-within:border-cyan-500/50">
              <span className="material-symbols-outlined text-[14px] text-cyan-600 dark:text-cyan-400 shrink-0">lan</span>
              <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-text-muted shrink-0">
                URL Router
              </span>
              <input
                type="text"
                value={mitmRouterBaseUrl}
                onChange={(e) => setMitmRouterBaseUrl(e.target.value)}
                placeholder={DEFAULT_MITM_ROUTER_BASE}
                disabled={isRunning}
                className="flex-1 min-w-0 h-6 px-2 bg-white/80 dark:bg-black/40 rounded border border-black/10 dark:border-cyan-500/20 text-[11px] font-mono text-text-main focus:outline-none focus:border-cyan-500 disabled:opacity-60"
              />
            </div>

            <div className="flex items-center gap-2 rounded-lg border border-cyan-500/20 bg-white/55 dark:bg-[#070D1B]/75 px-2.5 py-1.5 transition-colors focus-within:border-cyan-500/50">
              <span className="material-symbols-outlined text-[14px] text-cyan-600 dark:text-cyan-400 shrink-0">vpn_key</span>
              <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-text-muted shrink-0">
                Khóa API
              </span>
              <input
                type="text"
                list="mitm-api-keys"
                value={effectiveApiKey}
                onChange={(e) => setSelectedApiKey(e.target.value)}
                disabled={isRunning}
                placeholder={cloudEnabled ? "Nhập hoặc chọn API key" : "sk_9router (mặc định)"}
                className="flex-1 min-w-0 h-6 px-2 bg-white/80 dark:bg-black/40 rounded border border-black/10 dark:border-cyan-500/20 text-[11px] font-mono text-text-main focus:outline-none focus:border-cyan-500 disabled:opacity-60"
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
            <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] bg-rose-500/10 text-rose-700 dark:text-rose-300 border border-rose-500/25">
              <span className="material-symbols-outlined text-[14px] shrink-0">error</span>
              <span>{actionError}</span>
            </div>
          )}

          {/* Windows admin warning */}
          {serverIsWindows && !isAdmin && (
            <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/25">
              <span className="material-symbols-outlined text-[14px] shrink-0">shield_lock</span>
              <span>Cần chạy 9Router bằng quyền Quản trị viên (Run as Administrator) khi muốn bật cổng 443. Bạn vẫn có thể cấu hình và lưu ánh xạ Model bình thường.</span>
            </div>
          )}
        </div>
      </HudFrame>

      {/* Password Modal */}
      {showPasswordModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 backdrop-blur-sm">
          <div className="mx-4 flex w-full max-w-sm flex-col gap-4 rounded-xl border border-cyan-500/30 bg-surface p-5 shadow-xl sm:p-6">
            <h3 className="font-semibold text-text-main">Yêu cầu mật khẩu Sudo</h3>
            <div className="flex items-start gap-3 p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg">
              <span className="material-symbols-outlined text-amber-500 text-[20px]">warning</span>
              <p className="text-xs text-text-muted">Cần quyền sudo để cài chứng chỉ SSL và khởi động máy chủ</p>
            </div>
            <Input
              type="password"
              placeholder="Nhập mật khẩu sudo"
              value={sudoPassword}
              onChange={(e) => setSudoPassword(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !loading) handleConfirmPassword(); }}
            />
            {modalError && (
              <div className="flex items-center gap-2 px-2 py-1.5 rounded text-xs bg-rose-500/10 text-rose-600 dark:text-rose-400">
                <span className="material-symbols-outlined text-[14px]">error</span>
                <span>{modalError}</span>
              </div>
            )}
            <div className="flex items-center justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => { setShowPasswordModal(false); setSudoPassword(""); setModalError(null); }} disabled={loading}>
                Hủy
              </Button>
              <Button variant="primary" size="sm" onClick={handleConfirmPassword} loading={loading}>
                Xác nhận
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Port 443 Conflict Modal */}
      {port443Conflict && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 backdrop-blur-sm">
          <div className="mx-4 flex w-full max-w-md flex-col gap-4 rounded-xl border border-cyan-500/30 bg-surface p-5 shadow-xl sm:p-6">
            <h3 className="font-semibold text-text-main">Cổng 443 đang bị chiếm dụng</h3>
            <div className="flex items-start gap-3 p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg">
              <span className="material-symbols-outlined text-amber-500 text-[20px]">warning</span>
              <div className="flex flex-col gap-1 text-xs text-text-muted">
                <p>Cổng 443 hiện đang được sử dụng bởi tiến trình khác:</p>
                <p className="font-mono text-text-main" data-i18n-skip="true">
                  {port443Conflict.owner.name} (PID {port443Conflict.owner.pid})
                </p>
                <p>Bạn có muốn tắt tiến trình này để bật MITM Server không?</p>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => { setPort443Conflict(null); setLoading(false); }} disabled={loading}>
                Hủy
              </Button>
              <Button variant="primary" size="sm" onClick={handleKillAndStart} loading={loading}>
                Tắt &amp; Khởi động
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
