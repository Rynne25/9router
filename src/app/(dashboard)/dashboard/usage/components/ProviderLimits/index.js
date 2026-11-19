"use client";

import { useState, useCallback, useMemo, useSyncExternalStore } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { ConfirmModal, EditConnectionModal } from "@/shared/components";
import AutoPingScheduleModal from "@/app/(dashboard)/dashboard/providers/[id]/AutoPingScheduleModal";
import { useCopyToClipboard } from "@/shared/hooks/useCopyToClipboard";
import { useNotificationStore } from "@/store/notificationStore";
import {
  VIEW_PREFS_STORAGE_KEY,
  formatClaudeResetClears,
  formatCreditDate,
  getConnectionLabel,
  getConnectionsEmptyMessage,
} from "./utils";
import { useProviderLimitsData } from "./hooks/useProviderLimitsData";
import { useQuotaAutoRefresh } from "./hooks/useQuotaAutoRefresh";
import { useConnectionQuickActions } from "./hooks/useConnectionQuickActions";
import QuotaSummaryBar from "./components/QuotaSummaryBar";
import QuotaCardSkeleton from "./components/QuotaCardSkeleton";
import QuotaEmptyState from "./components/QuotaEmptyState";
import QuotaFilterToolbar from "./components/QuotaFilterToolbar";
import ProviderLimitCard from "./components/ProviderLimitCard";
import QuotaPaginationBar from "./components/QuotaPaginationBar";
import ResetCreditsModal from "./components/ResetCreditsModal";

const layoutListeners = new Set();

function readLayoutStorage() {
  if (typeof window === "undefined") return "3";
  try {
    const saved = window.localStorage.getItem(VIEW_PREFS_STORAGE_KEY);
    if (saved === "2" || saved === "3" || saved === "4" || saved === "list") return saved;
    const legacy = window.localStorage.getItem("9r_quota_cols");
    return legacy === "2" ? "2" : legacy === "4" ? "4" : "3";
  } catch {
    return "3";
  }
}

function subscribeLayout(listener) {
  layoutListeners.add(listener);
  if (typeof window === "undefined") return () => layoutListeners.delete(listener);
  const onStorage = (event) => {
    if (event.key === VIEW_PREFS_STORAGE_KEY || event.key === "9r_quota_cols") listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    layoutListeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

function writeLayoutStorage(next) {
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(VIEW_PREFS_STORAGE_KEY, next);
    } catch {
      /* ignore storage write error */
    }
  }
  layoutListeners.forEach((l) => l());
}

export default function ProviderLimits() {
  const { copied, copy } = useCopyToClipboard();
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  // Initialize providerFilter from URL ?provider= param so the page
  // can be bookmarked / deep-linked to a specific provider (#4217).
  const [providerFilter, _setProviderFilter] = useState(
    () => searchParams?.get("provider") || "all",
  );

  // Wrapper: keeps URL in sync with the selected provider so the view can be
  // bookmarked. Replaces the URL without adding to browser history.
  const setProviderFilter = useCallback(
    (value) => {
      _setProviderFilter(value);
      try {
        const params = new URLSearchParams(searchParams?.toString() || "");
        if (value === "all") {
          params.delete("provider");
        } else {
          params.set("provider", value);
        }
        const newUrl = params.toString() ? `${pathname}?${params.toString()}` : pathname;
        router.replace(newUrl, { scroll: false });
      } catch {
        /* non-fatal: URL sync is best-effort */
      }
    },
    [pathname, router, searchParams],
  );

  const data = useProviderLimitsData({ providerFilter });

  const {
    autoRefresh,
    setAutoRefresh,
    refreshingAll,
    countdown,
    refreshAll,
  } = useQuotaAutoRefresh({
    fetchConnections: data.fetchConnections,
    fetchQuota: data.fetchQuota,
    page: data.page,
    setLoading: data.setLoading,
    setErrors: data.setErrors,
    setQuotaData: data.setQuotaData,
    markUpdated: data.markUpdated,
  });

  const actions = useConnectionQuickActions({
    sortedConnections: data.sortedConnections,
    quotaData: data.quotaData,
    errors: data.errors,
    setErrors: data.setErrors,
    autoPingConfigs: data.autoPingConfigs,
    setAutoPingConfigs: data.setAutoPingConfigs,
    page: data.page,
    fetchConnections: data.fetchConnections,
    fetchQuota: data.fetchQuota,
    refreshConnectionAndQuota: data.refreshConnectionAndQuota,
    removeConnectionState: data.removeConnectionState,
    markUpdated: data.markUpdated,
  });

  const notify = useNotificationStore();
  const [warmingUpAll, setWarmingUpAll] = useState(false);
  const [refreshingWithTokens, setRefreshingWithTokens] = useState(false);
  const layoutMode = useSyncExternalStore(
    subscribeLayout,
    readLayoutStorage,
    () => "3",
  );

  const handleLayoutModeChange = useCallback((val) => {
    const next = val === "2" || val === "4" || val === "list" ? val : "3";
    writeLayoutStorage(next);
  }, []);

  const gridClass = useMemo(() => {
    if (layoutMode === "list") return "grid grid-cols-1 gap-2";
    if (layoutMode === "2") return "grid grid-cols-1 md:grid-cols-2 gap-2.5";
    if (layoutMode === "4") return "grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2";
    return "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5";
  }, [layoutMode]);

  const handleWarmupAll = useCallback(async () => {
    if (warmingUpAll) return;
    setWarmingUpAll(true);
    try {
      const res = await fetch("/api/oauth/antigravity/warmup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ all: true }),
      });
      const result = await res.json().catch(() => ({}));
      if (res.ok) {
        notify.success(result.message || "Làm nóng (Warmup) kích hoạt hạn mức tuần thành công!");
        await refreshAll(true);
      } else {
        notify.error(result.error || "Làm nóng tất cả tài khoản thất bại");
      }
    } catch (err) {
      notify.error(err.message || "Lỗi khi gửi yêu cầu làm nóng");
    } finally {
      setWarmingUpAll(false);
    }
  }, [notify, refreshAll, warmingUpAll]);

  const handleRefreshAllWithTokens = useCallback(async () => {
    if (refreshingWithTokens || refreshingAll) return;
    setRefreshingWithTokens(true);
    try {
      if (providerFilter === "all" || providerFilter === "antigravity") {
        await fetch("/api/oauth/antigravity/refresh-all", { method: "POST" }).catch(() => {});
      }
      await refreshAll(true);
      notify.success("Đã làm mới thông tin hạn mức và token tất cả tài khoản!");
    } catch (err) {
      notify.error(err.message || "Lỗi khi làm mới hạn mức");
    } finally {
      setRefreshingWithTokens(false);
    }
  }, [notify, providerFilter, refreshAll, refreshingAll, refreshingWithTokens]);

  const hasActiveFilters = Boolean(
    providerFilter !== "all" ||
      data.accountFilter !== "all" ||
      data.searchQuery.trim() !== "" ||
      data.tierFilter !== "all" ||
      data.healthFilter !== "all" ||
      data.quotaSortMode !== "default" ||
      data.expiringFirst,
  );

  const handleResetAllFilters = useCallback(() => {
    setProviderFilter("all");
    data.setAccountFilter("all");
    data.setSearchQuery("");
    data.setTierFilter("all");
    data.setHealthFilter("all");
    data.setQuotaSortMode("default");
    data.setExpiringFirst(false);
    data.setPage(1);
  }, [data, setProviderFilter]);

  const hasAntigravity = useMemo(
    () =>
      data.providerOptions.includes("antigravity") ||
      data.connections.some((c) => c.provider === "antigravity"),
    [data.connections, data.providerOptions],
  );

  const hasEligibleConnections = data.totals.eligibleConnections > 0 || data.connections.length > 0;
  const hasVisibleConnections = data.sortedConnections.length > 0;

  if (!data.connectionsLoading && !hasEligibleConnections) {
    return (
      <QuotaEmptyState
        icon="cloud_off"
        title="Chưa có tài khoản kết nối nào"
        description="Hãy kết nối các nhà cung cấp (OAuth / API Key) trong mục Providers để theo dõi hạn mức và sử dụng tại đây."
      />
    );
  }

  const resetConn = actions.resetConfirmState?.connection;
  const isResetClaude = resetConn?.provider === "claude";
  const claudeResetCredits = resetConn ? data.quotaData[resetConn.id]?.raw?.resetCredits : null;

  const emptyMessage = !data.isInitialLoading && !hasVisibleConnections
    ? hasActiveFilters
      ? {
          icon: "search_off",
          title: "Không tìm thấy tài khoản phù hợp",
          description:
            "Không có tài khoản nào khớp với từ khóa tìm kiếm hoặc bộ lọc hiện tại.",
        }
      : getConnectionsEmptyMessage(data.totals, providerFilter, data.accountFilter)
    : null;

  return (
    <div className="space-y-3.5">
      <QuotaSummaryBar
        summaryStats={data.summaryStats}
        isInitialLoading={data.isInitialLoading}
        isRevalidating={data.isRevalidating}
        providerFilter={providerFilter}
        onSelectProvider={(next) => {
          data.setPage(1);
          setProviderFilter(next);
        }}
        lastUpdated={data.lastUpdated}
      />

      <QuotaFilterToolbar
        sortedCount={data.sortedConnections.length}
        totalCount={data.connections.length}
        isInitialLoading={data.isInitialLoading}
        isRevalidating={data.isRevalidating}
        providerFilter={providerFilter}
        onProviderFilterChange={setProviderFilter}
        providerOptions={data.providerOptions}
        accountFilter={data.accountFilter}
        onAccountFilterChange={data.setAccountFilter}
        searchQuery={data.searchQuery}
        onSearchQueryChange={data.setSearchQuery}
        tierFilter={data.tierFilter}
        onTierFilterChange={data.setTierFilter}
        healthFilter={data.healthFilter}
        onHealthFilterChange={data.setHealthFilter}
        quotaSortMode={data.quotaSortMode}
        onQuotaSortModeChange={data.setQuotaSortMode}
        expiringFirst={data.expiringFirst}
        onToggleExpiringFirst={() => data.setExpiringFirst((prev) => !prev)}
        autoRefresh={autoRefresh}
        onToggleAutoRefresh={() => setAutoRefresh((prev) => !prev)}
        countdown={countdown}
        refreshingAll={refreshingAll || refreshingWithTokens}
        onRefreshAll={handleRefreshAllWithTokens}
        warmingUpAll={warmingUpAll}
        onWarmupAll={handleWarmupAll}
        onResetPage={() => data.setPage(1)}
        layoutMode={layoutMode}
        onLayoutModeChange={handleLayoutModeChange}
        hasAntigravity={hasAntigravity}
        hasActiveFilters={hasActiveFilters}
        onResetAllFilters={handleResetAllFilters}
      />

      {data.expiringFirst && !data.isInitialLoading && (
        <div className="rounded-xl border border-amber-500/25 bg-amber-500/10 px-3.5 py-2 text-xs text-amber-700 dark:text-amber-300 flex items-center gap-2">
          <span className="material-symbols-outlined text-[16px]">info</span>
          <span>
            Chế độ &quot;Sắp reset&quot; đang sắp xếp lại các tài khoản trong trang hiện tại.
          </span>
        </div>
      )}

      {data.isInitialLoading ? (
        <QuotaCardSkeleton count={6} gridClass={gridClass} />
      ) : emptyMessage ? (
        <QuotaEmptyState
          icon={emptyMessage.icon}
          title={emptyMessage.title}
          description={emptyMessage.description}
          actionLabel={hasActiveFilters ? "Xóa bộ lọc" : undefined}
          onAction={hasActiveFilters ? handleResetAllFilters : undefined}
        />
      ) : (
        <div className={gridClass}>
          {data.sortedConnections.map((conn) => (
            <ProviderLimitCard
              key={conn.id}
              conn={conn}
              quota={data.quotaData[conn.id]}
              isLoading={data.loading[conn.id]}
              error={data.errors[conn.id]}
              quotaVisibility={data.quotaVisibility}
              quotaSortMode={data.quotaSortMode}
              layoutMode={layoutMode}
              deletingId={actions.deletingId}
              togglingId={actions.togglingId}
              resettingLimitId={actions.resettingLimitId}
              warmingUpIds={actions.warmingUpIds}
              warmupFeedback={actions.warmupFeedback}
              onClearWarmupFeedback={actions.clearWarmupFeedback}
              autoPingConfigs={data.autoPingConfigs}
              copied={copied}
              onCopy={copy}
              onWarmup={actions.handleWarmupConnection}
              onOpenResetConfirm={actions.setResetConfirmState}
              onViewResetCredits={(connection, claudeReset) =>
                connection.provider === "codex"
                  ? actions.handleViewCodexResetCredits(connection)
                  : actions.handleViewClaudeResets(connection, claudeReset)
              }
              onOpenSchedule={actions.setScheduleConnection}
              onRefresh={data.refreshProvider}
              onEdit={(connection) => {
                actions.setSelectedConnection(connection);
                actions.setShowEditModal(true);
              }}
              onDelete={actions.handleDeleteConnection}
              onToggleActive={actions.handleToggleConnectionActive}
              onHideQuota={data.handleHideQuota}
              onShowQuota={data.handleShowQuota}
            />
          ))}
        </div>
      )}

      {!data.isInitialLoading && (
        <QuotaPaginationBar
          pagination={data.pagination}
          pageSize={data.pageSize}
          customPageSizeInput={data.customPageSizeInput}
          onCustomPageSizeInputChange={data.setCustomPageSizeInput}
          onPageChange={data.setPage}
          onPageSizeChange={data.setPageSize}
          connectionsLoading={data.connectionsLoading}
          refreshingAll={refreshingAll || refreshingWithTokens}
        />
      )}

      <ConfirmModal
        isOpen={Boolean(actions.resetConfirmState)}
        onClose={() => {
          if (!actions.resettingLimitId) actions.setResetConfirmState(null);
        }}
        onConfirm={async () => {
          if (!resetConn) return;
          await actions.handleResetCodexLimit(resetConn.id, resetConn.provider);
          actions.setResetConfirmState(null);
        }}
        title={isResetClaude ? "Reset Claude limits?" : "Reset Codex limit?"}
        message={
          isResetClaude
            ? `Refills your ${formatClaudeResetClears(claudeResetCredits?.clears)} now for ${getConnectionLabel(resetConn) || "this account"} · your weekly reset day stays ${formatCreditDate(claudeResetCredits?.weeklyResetsAt)}. This cannot be undone. Resets left: ${actions.resetConfirmState?.resetCreditCount ?? 0}.`
            : `Use 1 Codex reset credit for ${getConnectionLabel(resetConn || {}) || "this account"}. This cannot be undone. Remaining credits: ${actions.resetConfirmState?.resetCreditCount ?? 0}.`
        }
        confirmText="Reset limit"
        cancelText="Cancel"
        variant="danger"
        loading={Boolean(actions.resettingLimitId)}
      />

      <ResetCreditsModal
        resetCreditsState={actions.resetCreditsState}
        onClose={() => actions.setResetCreditsState(null)}
      />

      <EditConnectionModal
        isOpen={actions.showEditModal}
        connection={actions.selectedConnection}
        proxyPools={data.proxyPools}
        onSave={actions.handleUpdateConnection}
        onClose={() => {
          actions.setShowEditModal(false);
          actions.setSelectedConnection(null);
        }}
      />

      {actions.scheduleConnection && (
        <AutoPingScheduleModal
          isOpen={Boolean(actions.scheduleConnection)}
          onClose={() => actions.setScheduleConnection(null)}
          connection={actions.scheduleConnection}
          reactive={
            data.autoPingConfigs[actions.scheduleConnection.provider]?.connections?.[
              actions.scheduleConnection.id
            ] === true
          }
          schedule={
            data.autoPingConfigs[actions.scheduleConnection.provider]?.schedules?.[
              actions.scheduleConnection.id
            ] || null
          }
          onSave={(result) =>
            actions.handleSaveAutoPing(
              actions.scheduleConnection.id,
              actions.scheduleConnection.provider,
              result,
            )
          }
        />
      )}
    </div>
  );
}
