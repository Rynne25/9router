"use client";

import { useState, useCallback, useRef, useEffect } from "react";

/**
 * Manage Antigravity batch operations (Refresh All, Warmup All, Export JSON),
 * active client status (2.0 / IDE / CLI), feedback banner state, and modal triggers.
 * @param {{ providerId?: string, fetchConnections: () => Promise<void> }} params
 */
export function useAntigravityActions({ providerId, fetchConnections }) {
  const [showBulkImportAntigravity, setShowBulkImportAntigravity] = useState(false);
  const [antigravityExporting, setAntigravityExporting] = useState(false);
  const [antigravityRefreshingAll, setAntigravityRefreshingAll] = useState(false);
  const [showAntigravityWarmupConfirm, setShowAntigravityWarmupConfirm] = useState(false);
  const [antigravityWarmingUpAll, setAntigravityWarmingUpAll] = useState(false);
  const [antigravityFeedback, setAntigravityFeedback] = useState(null);
  const [showAgRiskModal, setShowAgRiskModal] = useState(false);
  const [activeClients, setActiveClients] = useState(null);
  const feedbackTimerRef = useRef(null);

  const refreshActiveClients = useCallback(async () => {
    if (providerId !== "antigravity") return;
    try {
      const res = await fetch("/api/oauth/antigravity/active-clients", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        setActiveClients(data);
      }
    } catch {
      // Non-fatal
    }
  }, [providerId]);

  useEffect(() => {
    if (providerId !== "antigravity") {
      return undefined;
    }
    let cancelled = false;
    fetch("/api/oauth/antigravity/active-clients", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && data) setActiveClients(data);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [providerId]);

  const effectiveActiveClients = providerId === "antigravity" ? activeClients : null;

  useEffect(() => {
    return () => {
      if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current);
    };
  }, []);

  const showTimedFeedback = useCallback((feedback) => {
    if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current);
    setAntigravityFeedback(feedback);
    if (feedback?.type === "success") {
      feedbackTimerRef.current = setTimeout(() => {
        setAntigravityFeedback(null);
        feedbackTimerRef.current = null;
      }, 4000);
    }
  }, []);

  const clearFeedback = useCallback(() => {
    if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current);
    setAntigravityFeedback(null);
  }, []);

  const handleExportAntigravity = useCallback(async () => {
    setAntigravityExporting(true);
    clearFeedback();
    try {
      const res = await fetch("/api/oauth/antigravity/export");
      const data = await res.json();
      if (!res.ok) {
        showTimedFeedback({ type: "error", message: data?.error || "Xuất token thất bại" });
        return;
      }

      const rawExport = data.accounts || data;
      const jsonStr = JSON.stringify(rawExport, null, 2);

      try {
        await navigator.clipboard.writeText(jsonStr);
      } catch {
        // Ignore clipboard write failure
      }

      const blob = new Blob([jsonStr], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `antigravity-tokens-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      const count = Array.isArray(rawExport) ? rawExport.length : 0;
      showTimedFeedback({
        type: "success",
        message: `Đã xuất ${count} tài khoản ra file JSON và sao chép vào bộ nhớ tạm!`,
      });
    } catch (err) {
      showTimedFeedback({ type: "error", message: err.message || "Lỗi khi xuất token" });
    } finally {
      setAntigravityExporting(false);
    }
  }, [clearFeedback, showTimedFeedback]);

  const handleRefreshAllAntigravity = useCallback(async () => {
    setAntigravityRefreshingAll(true);
    clearFeedback();
    try {
      const res = await fetch("/api/oauth/antigravity/refresh-all", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        showTimedFeedback({ type: "error", message: data?.error || "Làm mới hạn mức thất bại" });
      } else {
        showTimedFeedback({
          type: "success",
          message: data.message || "Đã làm mới thông tin quota và tier cho tất cả tài khoản thành công!",
        });
        await fetchConnections();
        await refreshActiveClients();
      }
    } catch (err) {
      showTimedFeedback({ type: "error", message: err.message || "Lỗi khi làm mới quota" });
    } finally {
      setAntigravityRefreshingAll(false);
    }
  }, [clearFeedback, showTimedFeedback, fetchConnections, refreshActiveClients]);

  const handleWarmupAllAntigravity = useCallback(async () => {
    setAntigravityWarmingUpAll(true);
    setShowAntigravityWarmupConfirm(false);
    clearFeedback();
    try {
      const res = await fetch("/api/oauth/antigravity/warmup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ all: true }),
      });
      const data = await res.json();
      if (!res.ok) {
        showTimedFeedback({ type: "error", message: data?.error || "Làm nóng tài khoản thất bại" });
      } else {
        showTimedFeedback({
          type: "success",
          message: data.message || `Đã làm nóng thành công ${data.success ?? "tất cả"} tài khoản Antigravity!`,
        });
        await fetchConnections();
        await refreshActiveClients();
      }
    } catch (err) {
      showTimedFeedback({ type: "error", message: err.message || "Lỗi khi gửi yêu cầu warmup" });
    } finally {
      setAntigravityWarmingUpAll(false);
    }
  }, [clearFeedback, showTimedFeedback, fetchConnections, refreshActiveClients]);

  return {
    showBulkImportAntigravity,
    setShowBulkImportAntigravity,
    antigravityExporting,
    antigravityRefreshingAll,
    showAntigravityWarmupConfirm,
    setShowAntigravityWarmupConfirm,
    antigravityWarmingUpAll,
    antigravityFeedback,
    clearFeedback,
    showAgRiskModal,
    setShowAgRiskModal,
    activeClients: effectiveActiveClients,
    setActiveClients,
    refreshActiveClients,
    handleExportAntigravity,
    handleRefreshAllAntigravity,
    handleWarmupAllAntigravity,
  };
}
