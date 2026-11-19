"use client";

import Card from "@/shared/components/Card";
import { cn } from "@/shared/utils/cn";
import {
  filterQuotasByVisibility,
  getConnectionHealthStatus,
  getHiddenQuotaRows,
} from "../utils";
import ProviderLimitHeader from "./ProviderLimitHeader";
import QuotaRow from "./QuotaRow";

const CARD_RING_BY_HEALTH = {
  healthy: "hover:border-emerald-500/35",
  low: "border-amber-500/25 hover:border-amber-500/45",
  exhausted: "border-rose-500/25 hover:border-rose-500/45",
  blocked: "border-red-500/35 hover:border-red-500/55",
  error: "border-red-500/30 hover:border-red-500/50",
  disabled: "opacity-65",
  loading: "",
};

export default function ProviderLimitCard({
  conn,
  quota,
  isLoading,
  error,
  quotaVisibility,
  quotaSortMode,
  layoutMode = "3",
  deletingId,
  togglingId,
  resettingLimitId,
  warmingUpIds,
  warmupFeedback,
  onClearWarmupFeedback,
  autoPingConfigs,
  copied,
  onCopy,
  onWarmup,
  onOpenResetConfirm,
  onViewResetCredits,
  onOpenSchedule,
  onRefresh,
  onEdit,
  onDelete,
  onToggleActive,
  onHideQuota,
  onShowQuota,
}) {
  const isInactive = conn.isActive === false;
  const isDeleting = deletingId === conn.id;
  const isResettingLimit = resettingLimitId === conn.id;
  const isWarmingUp = Boolean(warmingUpIds?.[conn.id]);
  const cardWarmupFeedback = warmupFeedback?.[conn.id] || null;
  const rowBusy = isDeleting || togglingId === conn.id || isResettingLimit;
  const rawQuotas = quota?.quotas || [];
  const visibleQuotas = filterQuotasByVisibility(conn.provider, rawQuotas, quotaVisibility);
  const hiddenQuotaRows = getHiddenQuotaRows(conn.provider, rawQuotas, quotaVisibility);
  const healthStatus = getConnectionHealthStatus(conn, quota, error);
  const isListMode = layoutMode === "list";

  return (
    <Card
      padding="none"
      className={cn(
        "min-w-0 overflow-hidden transition-all duration-200 flex flex-col",
        isListMode && "lg:grid lg:grid-cols-[minmax(280px,1.05fr)_minmax(0,2fr)] lg:items-stretch",
        CARD_RING_BY_HEALTH[healthStatus] || "",
      )}
    >
      <div className={cn(isListMode && "lg:border-r lg:border-black/[0.06] dark:lg:border-white/[0.08] flex flex-col justify-between")}>
        <ProviderLimitHeader
          conn={conn}
          quota={quota}
          error={error}
          isLoading={isLoading}
          isInactive={isInactive}
          isDeleting={isDeleting}
          isResettingLimit={isResettingLimit}
          isWarmingUp={isWarmingUp}
          rowBusy={rowBusy}
          autoPingConfigs={autoPingConfigs}
          copied={copied}
          onCopy={onCopy}
          onWarmup={onWarmup}
          onOpenResetConfirm={onOpenResetConfirm}
          onViewResetCredits={onViewResetCredits}
          onOpenSchedule={onOpenSchedule}
          onRefresh={onRefresh}
          onEdit={onEdit}
          onDelete={onDelete}
          onToggleActive={onToggleActive}
        />
      </div>

      <QuotaRow
        conn={conn}
        provider={conn.provider}
        quota={quota}
        visibleQuotas={visibleQuotas}
        hiddenQuotaRows={hiddenQuotaRows}
        isLoading={isLoading}
        error={error}
        quotaSortMode={quotaSortMode}
        compact={layoutMode === "4"}
        warmupFeedback={cardWarmupFeedback}
        onClearWarmupFeedback={onClearWarmupFeedback}
        onHideQuota={onHideQuota}
        onShowQuota={onShowQuota}
      />
    </Card>
  );
}
