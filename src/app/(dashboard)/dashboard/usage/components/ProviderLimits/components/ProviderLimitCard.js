"use client";

import { memo } from "react";
import { HudFrame } from "@/shared/components/hud";
import { cn } from "@/shared/utils/cn";
import {
  filterQuotasByVisibility,
  getConnectionHealthStatus,
  getHiddenQuotaRows,
} from "../utils";
import ProviderLimitHeader from "./ProviderLimitHeader";
import QuotaRow from "./QuotaRow";

const CARD_RING_BY_HEALTH = {
  healthy: "[&>.hud-frame]:border-emerald-500/35 hover:[&>.hud-frame]:border-emerald-400/65 dark:[&>.hud-frame]:border-emerald-400/30 dark:hover:[&>.hud-frame]:border-emerald-400/60",
  healthyAntigravity: "[&>.hud-frame]:border-cyan-500/45 hover:[&>.hud-frame]:border-cyan-400/80 dark:[&>.hud-frame]:border-cyan-400/40 dark:hover:[&>.hud-frame]:border-cyan-300/75 shadow-[0_0_24px_-12px_rgba(34,211,238,0.45)]",
  low: "[&>.hud-frame]:border-amber-500/40 hover:[&>.hud-frame]:border-amber-400/70 dark:[&>.hud-frame]:border-amber-400/35 dark:hover:[&>.hud-frame]:border-amber-400/65",
  exhausted: "[&>.hud-frame]:border-rose-500/40 hover:[&>.hud-frame]:border-rose-400/70 dark:[&>.hud-frame]:border-rose-400/35 dark:hover:[&>.hud-frame]:border-rose-400/65",
  blocked: "[&>.hud-frame]:border-rose-500/50 hover:[&>.hud-frame]:border-rose-400/80 dark:[&>.hud-frame]:border-rose-500/50 dark:hover:[&>.hud-frame]:border-rose-400/80",
  error: "[&>.hud-frame]:border-rose-500/45 hover:[&>.hud-frame]:border-rose-400/70 dark:[&>.hud-frame]:border-rose-400/40 dark:hover:[&>.hud-frame]:border-rose-400/70",
  disabled: "opacity-65 [&>.hud-frame]:border-slate-400/30 dark:[&>.hud-frame]:border-slate-600/35",
  loading: "[&>.hud-frame]:border-cyan-500/25 hover:[&>.hud-frame]:border-cyan-400/50",
};

const HUD_ACCENT_BY_HEALTH = {
  healthy: "emerald",
  healthyAntigravity: "cyan",
  low: "amber",
  exhausted: "rose",
  blocked: "rose",
  error: "rose",
  disabled: "cyan",
  loading: "cyan",
};

function ProviderLimitCard({
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
  const isAntigravity = conn.provider === "antigravity";
  const isHealthy = healthStatus === "healthy";
  const isAntigravityHealthy = isAntigravity && isHealthy;
  const ringKey = isAntigravityHealthy ? "healthyAntigravity" : healthStatus;

  return (
    <HudFrame
      chamfer="sm"
      accent={HUD_ACCENT_BY_HEALTH[ringKey] || "cyan"}
      padding="none"
      spotlight={true}
      tilt={false}
      borderBeam={false}
      className={cn(
        "min-w-0 [content-visibility:auto] [contain-intrinsic-size:auto_220px] transition-colors duration-200 flex flex-col [&>div:last-child]:flex-1 [&>div:last-child]:flex [&>div:last-child]:flex-col",
        isAntigravity && !isInactive && "bg-cyan-500/[0.02] dark:bg-cyan-500/[0.03]",
        CARD_RING_BY_HEALTH[ringKey] || "",
      )}
    >
      <div
        className={cn(
          "flex flex-col flex-1 min-w-0 overflow-hidden",
          isListMode && "lg:grid lg:grid-cols-[minmax(280px,1.05fr)_minmax(0,2fr)] lg:items-stretch",
        )}
      >
        {isAntigravity && (
          <div
            aria-hidden="true"
            className={cn(
              "h-[2px] w-full shrink-0",
              isListMode && "lg:col-span-2",
              isHealthy
                ? "bg-gradient-to-r from-cyan-400/80 via-sky-400/60 to-transparent"
                : "bg-gradient-to-r from-cyan-500/40 via-cyan-500/15 to-transparent",
            )}
          />
        )}
        <div
          className={cn(
            isListMode && "lg:border-r lg:border-cyan-500/15 dark:lg:border-cyan-400/15 flex flex-col justify-between",
          )}
        >
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
      </div>
    </HudFrame>
  );
}

export default memo(ProviderLimitCard);
