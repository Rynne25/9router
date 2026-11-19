"use client";

import { useState, useCallback } from "react";
import { USAGE_SUPPORTED_PROVIDERS } from "@/shared/constants/providers";
import { useNotificationStore } from "@/store/notificationStore";
import {
  AUTO_PING_SETTINGS_KEYS,
  isConnectionFullyDepleted,
  hasAvailableQuota,
  reconcileConnectionsPage,
  getConnectionLabel,
  parseWarmupApiResponse,
} from "../utils";

export function useConnectionQuickActions({
  sortedConnections,
  quotaData,
  errors,
  setErrors,
  autoPingConfigs,
  setAutoPingConfigs,
  page,
  fetchConnections,
  fetchQuota,
  refreshConnectionAndQuota,
  removeConnectionState,
  markUpdated,
}) {
  const notify = useNotificationStore();
  const [deletingId, setDeletingId] = useState(null);
  const [togglingId, setTogglingId] = useState(null);
  const [resettingLimitId, setResettingLimitId] = useState(null);
  const [warmingUpIds, setWarmingUpIds] = useState({});
  const [warmupFeedback, setWarmupFeedback] = useState({});
  const [bulkToggling, setBulkToggling] = useState(false);

  const [resetConfirmState, setResetConfirmState] = useState(null);
  const [resetCreditsState, setResetCreditsState] = useState(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedConnection, setSelectedConnection] = useState(null);
  const [scheduleConnection, setScheduleConnection] = useState(null);

  const clearWarmupFeedback = useCallback((connectionId) => {
    setWarmupFeedback((prev) => {
      if (!prev[connectionId]) return prev;
      const next = { ...prev };
      delete next[connectionId];
      return next;
    });
  }, []);

  const handleWarmupConnection = useCallback(
    async (connection) => {
      if (!connection?.id || connection.provider !== "antigravity") return;
      if (warmingUpIds[connection.id]) return;

      const connId = connection.id;
      const label = getConnectionLabel(connection) || "tài khoản Antigravity";

      setWarmingUpIds((prev) => ({ ...prev, [connId]: true }));
      clearWarmupFeedback(connId);

      try {
        const res = await fetch("/api/oauth/antigravity/warmup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ connectionId: connId }),
        });
        const data = await res.json().catch(() => ({}));
        const parsed = parseWarmupApiResponse(res.ok, data, connection);

        setWarmupFeedback((prev) => ({
          ...prev,
          [connId]: {
            ...parsed,
            timestamp: Date.now(),
          },
        }));

        if (parsed.ok) {
          notify.success(`${label}: ${parsed.message}`);
          if (typeof refreshConnectionAndQuota === "function") {
            await refreshConnectionAndQuota(connId, connection.provider);
          } else {
            await fetchQuota(connId, connection.provider, { force: true });
            await fetchConnections(page);
            markUpdated();
          }
        } else {
          notify.error(`${label}: ${parsed.message}`);
          await fetchConnections(page);
        }
      } catch (err) {
        const msg = err?.message || "Lỗi mạng khi gửi yêu cầu làm nóng";
        setWarmupFeedback((prev) => ({
          ...prev,
          [connId]: {
            ok: false,
            type: "error",
            message: msg,
            validationUrl: null,
            isVerificationRequired: false,
            timestamp: Date.now(),
          },
        }));
        notify.error(`${label}: ${msg}`);
      } finally {
        setWarmingUpIds((prev) => {
          const next = { ...prev };
          delete next[connId];
          return next;
        });
      }
    },
    [
      clearWarmupFeedback,
      fetchConnections,
      fetchQuota,
      markUpdated,
      notify,
      page,
      refreshConnectionAndQuota,
      warmingUpIds,
    ],
  );

  const handleResetCodexLimit = useCallback(
    async (connectionId, provider) => {
      if ((provider !== "codex" && provider !== "claude") || resettingLimitId) return;

      setResettingLimitId(connectionId);
      setErrors((prev) => ({ ...prev, [connectionId]: null }));

      try {
        const response =
          provider === "claude"
            ? await fetch(`/api/usage/${connectionId}/claude-reset`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  grantId: quotaData[connectionId]?.raw?.resetCredits?.nextGrantId,
                }),
              })
            : await fetch(`/api/usage/${connectionId}/codex-reset-credits`, {
                method: "POST",
              });
        const result = await response.json().catch(() => ({}));

        if (!response.ok) {
          throw new Error(
            result.message || result.error || result.code || "Failed to reset limit",
          );
        }

        await fetchQuota(connectionId, provider, { force: true });
        markUpdated();
      } catch (error) {
        setErrors((prev) => ({
          ...prev,
          [connectionId]: error.message || "Failed to reset limit",
        }));
      } finally {
        setResettingLimitId(null);
      }
    },
    [fetchQuota, markUpdated, quotaData, resettingLimitId, setErrors],
  );

  // Claude grants already arrive with the usage read; no extra fetch
  const handleViewClaudeResets = useCallback((connection, resetCredits) => {
    setResetCreditsState({
      connection,
      loading: false,
      error: null,
      data: { kind: "claude", ...resetCredits },
    });
  }, []);

  const handleViewCodexResetCredits = useCallback(async (connection) => {
    setResetCreditsState({ connection, loading: true, error: null, data: null });
    try {
      const response = await fetch(`/api/usage/${connection.id}/codex-reset-credits`, {
        cache: "no-store",
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(result.error || result.message || "Failed to load Codex reset credits");
      }
      const credits = Array.isArray(result.credits) ? [...result.credits] : [];
      credits.sort((a, b) => {
        const aTime = a.expiresAt ? new Date(a.expiresAt).getTime() : Number.POSITIVE_INFINITY;
        const bTime = b.expiresAt ? new Date(b.expiresAt).getTime() : Number.POSITIVE_INFINITY;
        return aTime - bTime;
      });
      setResetCreditsState({
        connection,
        loading: false,
        error: null,
        data: { ...result, credits },
      });
    } catch (error) {
      setResetCreditsState({
        connection,
        loading: false,
        error: error.message || "Failed to load Codex reset credits",
        data: null,
      });
    }
  }, []);

  const handleDeleteConnection = useCallback(
    async (id) => {
      if (!confirm("Bạn có chắc muốn xóa tài khoản kết nối này?")) return;
      setDeletingId(id);
      try {
        const res = await fetch(`/api/providers/${id}`, { method: "DELETE" });
        if (res.ok) {
          removeConnectionState(id);
          await reconcileConnectionsPage(fetchConnections, page);
          notify.success("Đã xóa tài khoản kết nối");
        }
      } catch (error) {
        console.error("Error deleting connection:", error);
        notify.error(error.message || "Không thể xóa kết nối");
      } finally {
        setDeletingId(null);
      }
    },
    [fetchConnections, notify, page, removeConnectionState],
  );

  const handleToggleConnectionActive = useCallback(
    async (id, isActive) => {
      setTogglingId(id);
      try {
        const res = await fetch(`/api/providers/${id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ isActive }),
        });
        if (res.ok) {
          await reconcileConnectionsPage(fetchConnections, page);
        }
      } catch (error) {
        console.error("Error updating connection status:", error);
      } finally {
        setTogglingId(null);
      }
    },
    [fetchConnections, page],
  );

  const handleUpdateConnection = useCallback(
    async (formData) => {
      if (!selectedConnection?.id) return;
      const connectionId = selectedConnection.id;
      const provider = selectedConnection.provider;
      try {
        const res = await fetch(`/api/providers/${connectionId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(formData),
        });
        if (res.ok) {
          await fetchConnections();
          setShowEditModal(false);
          setSelectedConnection(null);
          if (USAGE_SUPPORTED_PROVIDERS.includes(provider)) {
            await fetchQuota(connectionId, provider);
          }
        }
      } catch (error) {
        console.error("Error saving connection:", error);
      }
    },
    [selectedConnection, fetchConnections, fetchQuota],
  );

  const handleSaveAutoPing = useCallback(
    async (connectionId, provider, { reactive, schedule }) => {
      const settingsKey = AUTO_PING_SETTINGS_KEYS[provider];
      if (!settingsKey) return;

      const previous = autoPingConfigs;
      const prevCfg = autoPingConfigs[provider] || {};
      const nextProviderCfg = {
        ...prevCfg,
        connections: { ...(prevCfg.connections || {}), [connectionId]: reactive },
        schedules: { ...(prevCfg.schedules || {}), [connectionId]: schedule },
      };
      setAutoPingConfigs({ ...autoPingConfigs, [provider]: nextProviderCfg });

      try {
        const r = await fetch("/api/settings", { cache: "no-store" });
        const s = r.ok ? await r.json() : {};
        const fullCfg = {
          ...(s[settingsKey] || {}),
          connections: nextProviderCfg.connections,
          schedules: nextProviderCfg.schedules,
        };
        await fetch("/api/settings", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ [settingsKey]: fullCfg }),
        });
      } catch {
        setAutoPingConfigs(previous);
      }
    },
    [autoPingConfigs, setAutoPingConfigs],
  );

  const bulkSetActive = useCallback(
    async (targetIds, isActive) => {
      if (!targetIds.length || bulkToggling) return;
      setBulkToggling(true);
      try {
        await Promise.all(
          targetIds.map((id) =>
            fetch(`/api/providers/${id}`, {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ isActive }),
            }),
          ),
        );
        await reconcileConnectionsPage(fetchConnections, page);
      } catch (error) {
        console.error("Error bulk toggling connections:", error);
      } finally {
        setBulkToggling(false);
      }
    },
    [bulkToggling, fetchConnections, page],
  );

  const handleDisableDepleted = useCallback(() => {
    const ids = sortedConnections
      .filter((c) => (c.isActive ?? true) && isConnectionFullyDepleted(c, quotaData))
      .map((c) => c.id);
    bulkSetActive(ids, false);
  }, [bulkSetActive, quotaData, sortedConnections]);

  const handleEnableAvailable = useCallback(() => {
    const ids = sortedConnections
      .filter((c) => !(c.isActive ?? true) && hasAvailableQuota(c, quotaData, errors))
      .map((c) => c.id);
    bulkSetActive(ids, true);
  }, [bulkSetActive, errors, quotaData, sortedConnections]);

  return {
    deletingId,
    togglingId,
    resettingLimitId,
    warmingUpIds,
    warmupFeedback,
    clearWarmupFeedback,
    handleWarmupConnection,
    bulkToggling,
    resetConfirmState,
    setResetConfirmState,
    resetCreditsState,
    setResetCreditsState,
    showEditModal,
    setShowEditModal,
    selectedConnection,
    setSelectedConnection,
    scheduleConnection,
    setScheduleConnection,
    handleResetCodexLimit,
    handleViewClaudeResets,
    handleViewCodexResetCredits,
    handleDeleteConnection,
    handleToggleConnectionActive,
    handleUpdateConnection,
    handleSaveAutoPing,
    handleDisableDepleted,
    handleEnableAvailable,
  };
}
