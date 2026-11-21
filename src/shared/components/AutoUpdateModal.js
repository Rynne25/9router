"use client";

import { useState, useRef, useEffect } from "react";
import PropTypes from "prop-types";
import { Modal, Button } from "@/shared/components";

export default function AutoUpdateModal({
  isOpen,
  onClose,
  latestVersion,
  currentVersion,
}) {
  const [phase, setPhase] = useState("idle"); // idle | updating | restarting | success | error
  const [progress, setProgress] = useState(0);
  const [statusMessage, setStatusMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const abortControllerRef = useRef(null);
  const pollTimerRef = useRef(null);

  useEffect(() => {
    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
      if (abortControllerRef.current) abortControllerRef.current.abort();
    };
  }, []);

  const beginReconnectPolling = () => {
    setPhase("restarting");
    setProgress(95);
    setStatusMessage("Server đang khởi động lại... Đang tự động kết nối lại");

    let attempts = 0;
    if (pollTimerRef.current) clearInterval(pollTimerRef.current);

    pollTimerRef.current = setInterval(async () => {
      attempts++;
      try {
        const r = await fetch("/api/health", { cache: "no-store" });
        if (r.ok) {
          clearInterval(pollTimerRef.current);
          pollTimerRef.current = null;
          setPhase("success");
          setProgress(100);
          setStatusMessage("Cập nhật thành công! Đang tải lại trang...");
          setTimeout(() => {
            window.location.reload();
          }, 1200);
        }
      } catch {
        if (attempts > 60) {
          clearInterval(pollTimerRef.current);
          setPhase("error");
          setErrorMessage("Không thể kết nối lại sau 60 giây. Vui lòng F5 hoặc kiểm tra terminal.");
        }
      }
    }, 1500);
  };

  const startUpdate = async () => {
    setPhase("updating");
    setProgress(5);
    setStatusMessage("Đang bắt đầu quá trình cập nhật...");
    setErrorMessage("");

    try {
      abortControllerRef.current = new AbortController();
      const downloadUrl = latestVersion
        ? `https://github.com/Rynne25/9router/releases/download/v${latestVersion}/9router-${latestVersion}.tgz`
        : null;
      const res = await fetch("/api/version/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ latestVersion, downloadUrl }),
        signal: abortControllerRef.current.signal,
      });

      if (!res.ok) {
        throw new Error(`Server returned ${res.status}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const data = JSON.parse(line.slice(6));
            if (data.progress !== undefined) setProgress(data.progress);
            if (data.message) setStatusMessage(data.message);
            if (data.phase) setPhase(data.phase);
            if (data.error) {
              setPhase("error");
              setErrorMessage(data.error);
            }
          } catch { /* ignore parse error */ }
        }
      }

      // Stream ended normally, now wait for server to restart
      beginReconnectPolling();
    } catch (err) {
      // If error occurred during fetch/stream
      if (phase !== "restarting" && phase !== "success") {
        setPhase("error");
        setErrorMessage(err.message || "Không thể hoàn thành cập nhật");
      } else {
        // Fetch failed because server exited to restart - this is expected!
        beginReconnectPolling();
      }
    }
  };

  const handleClose = () => {
    if (phase === "updating" || phase === "restarting") return;
    onClose();
    // Reset state after close
    setTimeout(() => {
      setPhase("idle");
      setProgress(0);
      setStatusMessage("");
      setErrorMessage("");
    }, 200);
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="Cập nhật 9Router Tự Động (1-Click)"
      maxWidth="md"
    >
      <div className="flex flex-col gap-4 py-1">
        {/* Version Badge Row */}
        <div className="flex items-center justify-between rounded-xl border border-black/[0.08] dark:border-white/[0.08] bg-black/[0.02] dark:bg-white/[0.02] p-3">
          <div className="flex items-center gap-2">
            <div className="size-8 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-500 flex items-center justify-center">
              <span className="material-symbols-outlined text-[18px]">system_update_alt</span>
            </div>
            <div>
              <div className="text-xs font-bold text-text-main">Bản cập nhật mới</div>
              <div className="text-[11px] text-text-muted">
                Phiên bản hiện tại: <span className="font-mono font-medium">v{currentVersion}</span>
              </div>
            </div>
          </div>
          <span className="px-2.5 py-1 rounded-full text-xs font-bold font-mono bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">
            v{latestVersion}
          </span>
        </div>

        {/* Stepper Status Indicator */}
        <div className="grid grid-cols-3 gap-2">
          <div className={`flex flex-col items-center justify-center rounded-lg border p-2 text-center transition-colors ${
            progress >= 40
              ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
              : progress > 0
                ? "border-primary/40 bg-primary/10 text-primary"
                : "border-black/[0.06] dark:border-white/[0.06] text-text-muted"
          }`}>
            <span className="material-symbols-outlined text-[16px]">cloud_download</span>
            <span className="text-[10px] font-semibold mt-1">1. Kéo mã nguồn</span>
          </div>
          <div className={`flex flex-col items-center justify-center rounded-lg border p-2 text-center transition-colors ${
            progress >= 85
              ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
              : progress >= 40
                ? "border-primary/40 bg-primary/10 text-primary"
                : "border-black/[0.06] dark:border-white/[0.06] text-text-muted"
          }`}>
            <span className="material-symbols-outlined text-[16px]">build</span>
            <span className="text-[10px] font-semibold mt-1">2. Biên dịch App</span>
          </div>
          <div className={`flex flex-col items-center justify-center rounded-lg border p-2 text-center transition-colors ${
            phase === "success"
              ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
              : progress >= 85
                ? "border-primary/40 bg-primary/10 text-primary"
                : "border-black/[0.06] dark:border-white/[0.06] text-text-muted"
          }`}>
            <span className="material-symbols-outlined text-[16px]">restart_alt</span>
            <span className="text-[10px] font-semibold mt-1">3. Khởi động lại</span>
          </div>
        </div>

        {/* Progress Bar & Status Text */}
        {phase !== "idle" && (
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-text-main flex items-center gap-1.5 truncate">
                {phase === "updating" || phase === "restarting" ? (
                  <span className="inline-block size-3 rounded-full border-2 border-primary border-t-transparent animate-spin" />
                ) : phase === "success" ? (
                  <span className="material-symbols-outlined text-emerald-500 text-[16px]">check_circle</span>
                ) : (
                  <span className="material-symbols-outlined text-red-500 text-[16px]">error</span>
                )}
                <span>{statusMessage || "Đang xử lý..."}</span>
              </span>
              <span className="font-mono font-bold text-text-muted">{progress}%</span>
            </div>
            <div className="h-2 w-full rounded-full bg-black/10 dark:bg-white/10 overflow-hidden">
              <div
                className={`h-full transition-all duration-300 rounded-full ${
                  phase === "error"
                    ? "bg-red-500"
                    : phase === "success"
                      ? "bg-emerald-500"
                      : "bg-gradient-to-r from-brand-500 to-emerald-500"
                }`}
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}

        {/* Error Callout if any */}
        {phase === "error" && errorMessage && (
          <div className="p-3 rounded-lg border border-red-500/30 bg-red-500/10 text-xs text-red-600 dark:text-red-400">
            <div className="font-bold flex items-center gap-1 mb-0.5">
              <span className="material-symbols-outlined text-[14px]">warning</span>
              Quá trình cập nhật gặp lỗi:
            </div>
            <div className="font-mono text-[11px] whitespace-pre-wrap break-all">{errorMessage}</div>
          </div>
        )}

        {/* Footer Actions */}
        <div className="flex items-center justify-end gap-2 pt-2 border-t border-black/[0.06] dark:border-white/[0.08]">
          {phase === "idle" ? (
            <>
              <Button variant="ghost" size="sm" onClick={handleClose}>
                Để sau
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={startUpdate}
                className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                <span className="material-symbols-outlined text-[15px]">bolt</span>
                <span>Bắt đầu Cập nhật (1-Click)</span>
              </Button>
            </>
          ) : phase === "error" ? (
            <>
              <Button variant="ghost" size="sm" onClick={handleClose}>
                Đóng
              </Button>
              <Button variant="primary" size="sm" onClick={startUpdate}>
                Thử lại
              </Button>
            </>
          ) : phase === "success" ? (
            <Button variant="primary" size="sm" disabled loading>
              Đang hoàn tất...
            </Button>
          ) : (
            <Button variant="ghost" size="sm" disabled loading>
              Đang xử lý, vui lòng chờ...
            </Button>
          )}
        </div>
      </div>
    </Modal>
  );
}

AutoUpdateModal.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  latestVersion: PropTypes.string,
  currentVersion: PropTypes.string,
};
