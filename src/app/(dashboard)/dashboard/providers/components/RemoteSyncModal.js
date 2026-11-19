"use client";

import { useState, useEffect, useCallback } from "react";
import PropTypes from "prop-types";
import { Modal, Button, Input } from "@/shared/components";
import { useNotificationStore } from "@/store/notificationStore";

const POPULAR_PROVIDERS = [
  { id: "gemini", label: "Gemini", keys: ["gemini", "gemini-cli"] },
  { id: "codex", label: "Codex", keys: ["codex"] },
  { id: "antigravity", label: "Antigravity", keys: ["antigravity"] },
  { id: "claude", label: "Claude", keys: ["claude"] },
  { id: "openai", label: "OpenAI", keys: ["openai"] },
];

export default function RemoteSyncModal({ isOpen, onClose, onSyncComplete }) {
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [cloudChecking, setCloudChecking] = useState(false);
  const [peers, setPeers] = useState([]);
  const [showManual, setShowManual] = useState(false);
  const [copiedToken, setCopiedToken] = useState(false);
  const [showToken, setShowToken] = useState(false);
  const addNotification = useNotificationStore((state) => state.addNotification);

  const [config, setConfig] = useState({
    syncRole: "receiver",
    syncToken: "",
    syncEnabled: true,
    syncAutoDiscoveryEnabled: true,
    syncRemotePeerUrl: "",
    syncRemoteToken: "",
    syncAutoIntervalMinutes: 5,
    syncOnPageLoad: true,
    syncFilterProviders: [],
    syncLastRunAt: null,
    syncLastStatus: null,
  });

  const scanPeers = useCallback(async () => {
    setScanning(true);
    try {
      const res = await fetch("/api/sync/peers?scan=true");
      if (res.ok) {
        const data = await res.json();
        setPeers(data.peers || []);
      }
    } catch {
      /* ignore */
    } finally {
      setScanning(false);
    }
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;

    fetch("/api/sync/config")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && data && data.isReceiver) {
          setConfig((prev) => ({
            ...prev,
            ...data,
            syncEnabled: data.syncEnabled ?? true,
          }));
        }
      })
      .catch(() => {});

    (async () => {
      await scanPeers();
    })();

    return () => {
      cancelled = true;
    };
  }, [isOpen, scanPeers]);

  const handleCheckCloudNow = async () => {
    setCloudChecking(true);
    try {
      const res = await fetch("/api/sync/events?check=true");
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.notifications) && data.notifications.length > 0) {
          addNotification({
            type: "success",
            title: "Đồng bộ thành công! 🎉",
            message: `Đã nạp ${data.notifications.length} tài khoản mới từ kênh đám mây!`,
          });
          onSyncComplete?.(data);
        } else {
          addNotification({
            type: "info",
            title: "Đã đồng nhất",
            message: "Không có tài khoản mới nào trên kênh đám mây.",
          });
        }
      }
    } catch (err) {
      addNotification({ type: "error", title: "Lỗi kết nối", message: err.message });
    } finally {
      setCloudChecking(false);
    }
  };

  const handleCopyToken = () => {
    if (!config.syncToken) return;
    navigator.clipboard?.writeText(config.syncToken);
    setCopiedToken(true);
    setTimeout(() => setCopiedToken(false), 2000);
  };

  const handleToggleProvider = (keys) => {
    const current = new Set(config.syncFilterProviders || []);
    const allSelected = keys.every((k) => current.has(k));
    if (allSelected) {
      keys.forEach((k) => current.delete(k));
    } else {
      keys.forEach((k) => current.add(k));
    }
    setConfig({ ...config, syncFilterProviders: Array.from(current) });
  };

  const handleSelectAllProviders = () => {
    setConfig({ ...config, syncFilterProviders: [] });
  };

  const isAllProvidersSelected =
    !config.syncFilterProviders || config.syncFilterProviders.length === 0;

  const handleAutoSyncFromPeer = async (peer) => {
    setSyncing(true);
    try {
      const res = await fetch("/api/sync/pull", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          remoteUrl: peer.url,
          remoteSyncToken: peer.autoSyncToken,
          providers: config.syncFilterProviders,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Đồng bộ thất bại");
      }

      await fetch("/api/sync/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          syncEnabled: true,
          syncRemotePeerUrl: peer.url,
          syncRemoteToken: peer.autoSyncToken,
          syncAutoIntervalMinutes: config.syncAutoIntervalMinutes || 5,
        }),
      });

      setConfig((prev) => ({
        ...prev,
        syncEnabled: true,
        syncRemotePeerUrl: peer.url,
        syncRemoteToken: peer.autoSyncToken,
      }));

      if (data.addedCount > 0) {
        addNotification({
          type: "success",
          title: "Đồng bộ thành công! 🎉",
          message: `Đã nạp ${data.addedCount} tài khoản mới từ "${peer.hostname}"!`,
        });
      } else {
        addNotification({
          type: "info",
          title: "Đã đồng nhất",
          message: `Máy này đã có đủ tài khoản từ "${peer.hostname}".`,
        });
      }

      onSyncComplete?.(data);
    } catch (err) {
      addNotification({
        type: "error",
        title: "Lỗi đồng bộ",
        message: err.message,
      });
    } finally {
      setSyncing(false);
    }
  };

  const handleSaveConfig = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/sync/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          syncEnabled: config.syncEnabled,
          syncRemotePeerUrl: config.syncRemotePeerUrl,
          syncRemoteToken: config.syncRemoteToken,
          syncAutoIntervalMinutes: Number(config.syncAutoIntervalMinutes) || 5,
          syncOnPageLoad: config.syncOnPageLoad,
          syncFilterProviders: config.syncFilterProviders,
        }),
      });
      if (res.ok) {
        addNotification({
          type: "success",
          title: "Đã lưu cấu hình",
          message: "Cài đặt nhận tài khoản 1 chiều đã được cập nhật.",
        });
        onClose?.();
      }
    } catch (err) {
      addNotification({ type: "error", title: "Lỗi", message: err.message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Đồng bộ tài khoản 1 chiều"
      size="lg"
    >
      <div className="flex flex-col gap-3.5">
        {/* 1. Unified Compact Status Banner (Role + Cloud E2EE) */}
        <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/[0.05] p-3.5 flex flex-col gap-2.5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <div className="size-8 rounded-lg bg-emerald-500/15 flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined text-emerald-500 text-[18px]">
                  shield_lock
                </span>
              </div>
              <div className="flex flex-col min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-bold text-text-main">
                    Máy Nhận 1 Chiều (Mặc định)
                  </span>
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/25">
                    <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    E2EE Trực tuyến
                  </span>
                </div>
                <span className="text-[11px] text-text-muted truncate">
                  Chỉ nhận dữ liệu về • Các máy nguồn khác hoạt động ẩn 100%
                </span>
              </div>
            </div>

            <Button
              variant="secondary"
              size="sm"
              loading={cloudChecking}
              onClick={handleCheckCloudNow}
              className="shrink-0 h-7 px-2.5 text-[11px] gap-1"
            >
              <span
                className={`material-symbols-outlined text-[14px] ${
                  cloudChecking ? "animate-spin" : ""
                }`}
              >
                sync
              </span>
              <span>Kiểm tra ngay</span>
            </Button>
          </div>
        </div>

        {/* 2. LAN & Tailscale Discovery */}
        <div className="rounded-xl border border-black/[0.08] dark:border-white/[0.08] bg-black/[0.01] dark:bg-white/[0.01] p-3.5 flex flex-col gap-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <span
                className={`material-symbols-outlined text-[16px] text-sky-500 ${
                  scanning ? "animate-spin" : ""
                }`}
              >
                wifi_tethering
              </span>
              <span className="text-xs font-semibold text-text-main">
                Máy nguồn trong mạng nội bộ (LAN / Tailscale)
              </span>
            </div>

            <button
              type="button"
              onClick={scanPeers}
              disabled={scanning}
              className="inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline cursor-pointer disabled:opacity-50"
            >
              <span
                className={`material-symbols-outlined text-[13px] ${
                  scanning ? "animate-spin" : ""
                }`}
              >
                refresh
              </span>
              <span>{scanning ? "Đang dò..." : "Quét lại"}</span>
            </button>
          </div>

          {peers.length > 0 ? (
            <div className="flex flex-col gap-1.5">
              {peers.map((peer) => (
                <div
                  key={peer.ip}
                  className="rounded-lg border border-emerald-500/25 bg-emerald-500/[0.04] px-3 py-2 flex items-center justify-between gap-2"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="material-symbols-outlined text-emerald-500 text-[16px] shrink-0">
                      computer
                    </span>
                    <div className="flex flex-col min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-semibold text-text-main truncate">
                          {peer.hostname || "Máy nguồn"}
                        </span>
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-black/5 dark:bg-white/5 text-text-muted">
                          {peer.ip}
                        </span>
                      </div>
                      <span className="text-[10px] text-emerald-600 dark:text-emerald-400">
                        {peer.accountsCount} tài khoản khả dụng
                      </span>
                    </div>
                  </div>

                  <Button
                    variant="primary"
                    size="sm"
                    loading={syncing}
                    onClick={() => handleAutoSyncFromPeer(peer)}
                    className="shrink-0 h-7 px-2.5 text-[11px] gap-1 bg-emerald-600 hover:bg-emerald-700 text-white"
                  >
                    <span className="material-symbols-outlined text-[14px]">
                      download
                    </span>
                    <span>Hút về</span>
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-black/10 dark:border-white/10 px-3 py-2.5 flex items-center gap-2.5 text-left">
              <span className="material-symbols-outlined text-[18px] text-text-muted shrink-0">
                {scanning ? "radar" : "cloud_done"}
              </span>
              <span className="text-[11px] text-text-muted leading-snug">
                {scanning
                  ? "Đang dò các máy chạy 9Router trong mạng nội bộ..."
                  : "Chưa có máy cùng WiFi/LAN. Kênh Đám mây E2EE vẫn đang tự động nhận tài khoản xuyên Internet."}
              </span>
            </div>
          )}
        </div>

        {/* 3. Filter & Schedule Preferences */}
        <div className="rounded-xl border border-black/[0.08] dark:border-white/[0.08] bg-black/[0.01] dark:bg-white/[0.01] p-3.5 flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-text-main">
                Loại tài khoản nhận về
              </span>
              <span className="text-[11px] text-text-muted">
                {isAllProvidersSelected
                  ? "Tất cả nhà cung cấp"
                  : `Đã chọn ${config.syncFilterProviders.length} định danh`}
              </span>
            </div>

            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={handleSelectAllProviders}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-medium border transition-all cursor-pointer ${
                  isAllProvidersSelected
                    ? "border-primary bg-primary/10 text-primary font-semibold"
                    : "border-black/[0.08] dark:border-white/[0.08] text-text-muted hover:text-text-main"
                }`}
              >
                Tất cả
              </button>

              {POPULAR_PROVIDERS.map((p) => {
                const isSelected = p.keys.some((k) =>
                  (config.syncFilterProviders || []).includes(k)
                );
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => handleToggleProvider(p.keys)}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-medium border transition-all cursor-pointer ${
                      isSelected && !isAllProvidersSelected
                        ? "border-sky-500 bg-sky-500/10 text-sky-600 dark:text-sky-400 font-semibold"
                        : "border-black/[0.08] dark:border-white/[0.08] text-text-muted hover:text-text-main"
                    }`}
                  >
                    {isSelected && !isAllProvidersSelected ? "✓ " : ""}
                    {p.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex items-center justify-between gap-2 pt-2.5 border-t border-black/[0.06] dark:border-white/[0.06]">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={config.syncOnPageLoad}
                onChange={(e) =>
                  setConfig({ ...config, syncOnPageLoad: e.target.checked })
                }
                className="size-3.5 rounded accent-primary cursor-pointer"
              />
              <span className="text-[11px] text-text-muted">
                Tự kiểm tra khi mở trang
              </span>
            </label>

            <div className="flex items-center gap-1.5 shrink-0">
              <span className="text-[11px] text-text-muted">Chu kỳ quét:</span>
              <select
                value={config.syncAutoIntervalMinutes}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    syncAutoIntervalMinutes: Number(e.target.value),
                  })
                }
                className="rounded-lg border border-border bg-surface px-2 py-1 text-[11px] text-text-main cursor-pointer outline-none"
              >
                <option value={3}>3 phút</option>
                <option value={5}>5 phút</option>
                <option value={15}>15 phút</option>
                <option value={30}>30 phút</option>
              </select>
            </div>
          </div>
        </div>

        {/* 4. Collapsible Manual Connection */}
        <div className="rounded-xl border border-black/[0.08] dark:border-white/[0.08] overflow-hidden">
          <button
            type="button"
            onClick={() => setShowManual(!showManual)}
            className="w-full px-3.5 py-2.5 flex items-center justify-between bg-black/[0.015] dark:bg-white/[0.015] hover:bg-black/[0.03] dark:hover:bg-white/[0.03] transition-colors cursor-pointer"
          >
            <span className="text-[11px] font-medium text-text-muted flex items-center gap-1.5">
              <span className="material-symbols-outlined text-[15px]">tune</span>
              Kết nối máy nguồn thủ công (URL / Token)
            </span>
            <span className="material-symbols-outlined text-[16px] text-text-muted">
              {showManual ? "expand_less" : "expand_more"}
            </span>
          </button>

          {showManual && (
            <div className="p-3.5 flex flex-col gap-2.5 border-t border-black/[0.06] dark:border-white/[0.06]">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] font-medium text-text-muted">
                    Địa chỉ máy nguồn (Remote URL)
                  </label>
                  <Input
                    placeholder="http://192.168.1.50:20128"
                    value={config.syncRemotePeerUrl}
                    onChange={(e) =>
                      setConfig({ ...config, syncRemotePeerUrl: e.target.value })
                    }
                    className="text-xs h-8"
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-[11px] font-medium text-text-muted">
                    Sync Token máy nguồn
                  </label>
                  <Input
                    type="password"
                    placeholder="Nhập mã Token..."
                    value={config.syncRemoteToken}
                    onChange={(e) =>
                      setConfig({ ...config, syncRemoteToken: e.target.value })
                    }
                    className="font-mono text-xs h-8"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-black/[0.05] dark:border-white/[0.05]">
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] text-text-muted">Token máy này:</span>
                  <span className="font-mono text-[11px] text-text-main">
                    {showToken
                      ? config.syncToken
                      : (config.syncToken || "").slice(0, 10) + "..."}
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowToken(!showToken)}
                    className="text-text-muted hover:text-text-main cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-[13px]">
                      {showToken ? "visibility_off" : "visibility"}
                    </span>
                  </button>
                </div>

                <button
                  type="button"
                  onClick={handleCopyToken}
                  className="text-[11px] font-medium text-primary hover:underline cursor-pointer"
                >
                  {copiedToken ? "✓ Đã sao chép" : "Sao chép mã"}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between pt-1">
          <div className="text-[11px] text-text-muted">
            {config.syncLastRunAt ? (
              <span>
                Đồng bộ lúc:{" "}
                <strong className="text-text-main">
                  {new Date(config.syncLastRunAt).toLocaleTimeString("vi-VN")}
                </strong>
                {config.syncLastStatus?.addedCount > 0 && (
                  <span className="ml-1 text-emerald-500 font-semibold">
                    (+{config.syncLastStatus.addedCount})
                  </span>
                )}
              </span>
            ) : (
              <span>Tự động nhận ngầm 24/7</span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={onClose}>
              Đóng
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={handleSaveConfig}
              loading={loading}
              className="gap-1 bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              <span className="material-symbols-outlined text-[15px]">check</span>
              <span>Lưu cài đặt</span>
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}

RemoteSyncModal.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  onSyncComplete: PropTypes.func,
};
