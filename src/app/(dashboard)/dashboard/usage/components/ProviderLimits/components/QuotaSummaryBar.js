"use client";

import ProviderIcon from "@/shared/components/ProviderIcon";
import { cn } from "@/shared/utils/cn";

function getAvgColorClass(avgPct) {
  if (avgPct === null || avgPct === undefined) return "text-text-muted";
  if (avgPct > 70) return "text-emerald-600 dark:text-emerald-400";
  if (avgPct >= 30) return "text-amber-600 dark:text-amber-400";
  return "text-rose-600 dark:text-rose-400";
}

function getAvgBarClass(avgPct) {
  if (avgPct === null || avgPct === undefined) return "bg-surface-3";
  if (avgPct > 70) return "bg-gradient-to-r from-emerald-500 to-teal-400";
  if (avgPct >= 30) return "bg-gradient-to-r from-amber-500 to-yellow-400";
  return "bg-gradient-to-r from-rose-500 to-red-500";
}

export default function QuotaSummaryBar({
  summaryStats,
  isInitialLoading,
  isRevalidating,
  providerFilter,
  onSelectProvider,
  lastUpdated,
}) {
  if (isInitialLoading) {
    return (
      <div className="liquid-glass-panel rounded-2xl px-3.5 py-2 flex items-center justify-between gap-3 animate-pulse">
        <div className="h-4 w-40 rounded bg-black/10 dark:bg-white/10" />
        <div className="h-4 w-48 rounded bg-black/10 dark:bg-white/10" />
        <div className="h-4 w-28 rounded bg-black/10 dark:bg-white/10" />
      </div>
    );
  }

  const {
    totalAccounts = 0,
    activeCount = 0,
    disabledCount = 0,
    healthyCount = 0,
    lowCount = 0,
    exhaustedCount = 0,
    blockedCount = 0,
    avgRemainingPct = null,
    providerBreakdown = [],
  } = summaryStats || {};

  return (
    <div className="liquid-glass-panel rounded-2xl px-3.5 py-2 flex flex-wrap items-center justify-between gap-2.5 text-xs">
      {/* Metrics Strip */}
      <div className="flex flex-wrap items-center gap-2 sm:gap-3 min-w-0">
        {/* Total & Active */}
        <div className="flex items-center gap-1.5 font-medium text-text-primary">
          <span className="material-symbols-outlined text-[15px] text-primary">group</span>
          <span>Tổng:</span>
          <span className="font-bold tabular-nums text-text-main">{totalAccounts}</span>
          <span className="text-[11px] text-text-muted">
            ({activeCount} bật{disabledCount > 0 ? `, ${disabledCount} tắt` : ""})
          </span>
        </div>

        <span className="text-black/20 dark:text-white/20">|</span>

        {/* Healthy Count */}
        <div className="inline-flex items-center gap-1 font-medium text-emerald-600 dark:text-emerald-400">
          <span className="size-2 rounded-full bg-emerald-500 shadow-xs" />
          <span>Sẵn sàng:</span>
          <span className="font-bold tabular-nums">{healthyCount}</span>
        </div>

        {/* Low Count */}
        {lowCount > 0 && (
          <div className="inline-flex items-center gap-1 font-medium text-amber-600 dark:text-amber-400">
            <span className="size-2 rounded-full bg-amber-500 shadow-xs" />
            <span>Sắp hết:</span>
            <span className="font-bold tabular-nums">{lowCount}</span>
          </div>
        )}

        {/* Exhausted Count */}
        {exhaustedCount > 0 && (
          <div className="inline-flex items-center gap-1 font-medium text-rose-600 dark:text-rose-400">
            <span className="size-2 rounded-full bg-rose-500 shadow-xs" />
            <span>Cạn kiệt:</span>
            <span className="font-bold tabular-nums">{exhaustedCount}</span>
          </div>
        )}

        {/* Blocked / Verification Count */}
        {blockedCount > 0 && (
          <div className="inline-flex items-center gap-1 font-medium text-red-600 dark:text-red-400">
            <span className="material-symbols-outlined text-[14px]">warning</span>
            <span>Bị chặn:</span>
            <span className="font-bold tabular-nums">{blockedCount}</span>
          </div>
        )}
      </div>

      {/* Average Quota Gauge & Provider Breakdown */}
      <div className="flex flex-wrap items-center gap-3 ml-auto">
        {avgRemainingPct !== null && (
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-text-muted">Hạn mức TB:</span>
            <div className="h-2 w-16 sm:w-20 rounded-full bg-black/10 dark:bg-white/10 overflow-hidden">
              <div
                className={cn("h-full transition-all duration-300", getAvgBarClass(avgRemainingPct))}
                style={{ width: `${Math.max(0, Math.min(100, avgRemainingPct))}%` }}
              />
            </div>
            <span className={cn("font-bold tabular-nums text-xs", getAvgColorClass(avgRemainingPct))}>
              {avgRemainingPct}%
            </span>
          </div>
        )}

        {/* Provider Breakdown Mini Chips */}
        {providerBreakdown.length > 1 && (
          <div className="hidden lg:flex items-center gap-1">
            {providerBreakdown.map((item) => (
              <button
                key={item.provider}
                type="button"
                onClick={() => onSelectProvider?.(item.provider)}
                className={cn(
                  "inline-flex items-center gap-1 rounded-lg px-1.5 py-0.5 text-[10.5px] transition-all cursor-pointer",
                  providerFilter === item.provider
                    ? "bg-primary/15 font-semibold text-primary"
                    : "text-text-muted hover:text-text-primary hover:bg-black/5 dark:hover:bg-white/5",
                )}
                title={`Xem ${item.total} tài khoản ${item.provider}`}
              >
                <ProviderIcon
                  src={`/providers/${item.provider}.png`}
                  alt={item.provider}
                  size={12}
                  className="size-3 rounded-xs object-contain"
                  fallbackText={item.provider.slice(0, 1).toUpperCase()}
                />
                <span className="tabular-nums font-medium">{item.total}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
