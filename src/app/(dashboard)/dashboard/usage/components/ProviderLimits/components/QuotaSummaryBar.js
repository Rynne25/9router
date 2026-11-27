"use client";

import ProviderIcon from "@/shared/components/ProviderIcon";
import { HudFrame, NumberTicker } from "@/shared/components/hud";
import { cn } from "@/shared/utils/cn";

const SEGMENT_COUNT = 10;

function getAvgColorClass(avgPct) {
  if (avgPct === null || avgPct === undefined) return "text-text-muted";
  if (avgPct > 70) return "text-emerald-600 dark:text-emerald-400";
  if (avgPct >= 30) return "text-amber-600 dark:text-amber-400";
  return "text-rose-600 dark:text-rose-400";
}

function getSegmentActiveClass(avgPct) {
  if (avgPct === null || avgPct === undefined) return "bg-slate-400/50";
  if (avgPct > 70) return "bg-emerald-500 dark:bg-emerald-400 shadow-[0_0_6px_rgba(16,185,129,0.55)]";
  if (avgPct >= 30) return "bg-amber-500 dark:bg-amber-400 shadow-[0_0_6px_rgba(245,158,11,0.5)]";
  return "bg-rose-500 dark:bg-rose-400 shadow-[0_0_6px_rgba(244,63,94,0.55)]";
}

function formatSyncTime(lastUpdated) {
  if (!lastUpdated) return null;
  try {
    const d = lastUpdated instanceof Date ? lastUpdated : new Date(lastUpdated);
    if (Number.isNaN(d.getTime())) return null;
    return d.toLocaleTimeString("vi-VN", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return null;
  }
}

export default function QuotaSummaryBar({
  summaryStats,
  isInitialLoading,
  isRevalidating,
  providerFilter,
  onSelectProvider,
  lastUpdated,
  hasAntigravity = false,
}) {
  if (isInitialLoading) {
    return (
      <HudFrame chamfer="sm" accent="cyan" padding="none" spotlight={false}>
        <div className="px-3.5 py-2.5 flex items-center justify-between gap-3 animate-pulse">
          <div className="h-4 w-44 rounded bg-cyan-500/15" />
          <div className="h-4 w-52 rounded bg-cyan-500/10" />
          <div className="h-4 w-32 rounded bg-cyan-500/15" />
        </div>
      </HudFrame>
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

  const antigravityEntry = providerBreakdown.find((item) => item.provider === "antigravity");
  const showAntigravityQuickPill = Boolean(hasAntigravity || antigravityEntry);
  const clampedAvg = avgRemainingPct !== null && avgRemainingPct !== undefined
    ? Math.max(0, Math.min(100, avgRemainingPct))
    : 0;
  const filledSegments = avgRemainingPct !== null && avgRemainingPct !== undefined
    ? Math.round((clampedAvg / 100) * SEGMENT_COUNT)
    : 0;
  const syncTimeLabel = formatSyncTime(lastUpdated);

  return (
    <HudFrame
      chamfer="sm"
      accent="cyan"
      padding="none"
      spotlight={false}
      className="border-cyan-500/25 dark:border-cyan-400/25"
    >
      <div className="px-3.5 py-2 flex flex-wrap items-center justify-between gap-2.5 text-xs">
        {/* Quick Priority Filter Pills (All + Antigravity) & Monospace Telemetry Counters */}
        <div className="flex flex-wrap items-center gap-2 sm:gap-2.5 min-w-0">
          {showAntigravityQuickPill && (
            <div className="inline-flex items-center gap-1 rounded-lg border border-cyan-500/25 bg-cyan-500/[0.06] p-0.5">
              <button
                type="button"
                onClick={() => onSelectProvider?.("all")}
                className={cn(
                  "inline-flex items-center gap-1 rounded-md px-2 py-0.5 font-mono text-[10.5px] font-semibold uppercase tracking-wider transition-all cursor-pointer",
                  providerFilter === "all"
                    ? "bg-cyan-500 text-slate-950 shadow-xs"
                    : "text-text-muted hover:text-text-main hover:bg-cyan-500/10",
                )}
              >
                <span>Tất cả</span>
              </button>
              <button
                type="button"
                onClick={() => onSelectProvider?.("antigravity")}
                className={cn(
                  "inline-flex items-center gap-1 rounded-md px-2 py-0.5 font-mono text-[10.5px] font-semibold uppercase tracking-wider transition-all cursor-pointer",
                  providerFilter === "antigravity"
                    ? "bg-cyan-500 text-slate-950 shadow-[0_0_10px_rgba(6,182,212,0.45)]"
                    : "text-cyan-700 dark:text-cyan-300 hover:bg-cyan-500/15",
                )}
                title="Ưu tiên lọc nhanh tài khoản Antigravity"
              >
                <ProviderIcon
                  src="/providers/antigravity.png"
                  alt="antigravity"
                  size={12}
                  className="size-3 rounded-xs object-contain"
                  fallbackText="AG"
                />
                <span>Antigravity</span>
                {antigravityEntry && (
                  <span className="tabular-nums opacity-85">
                    ({antigravityEntry.count ?? antigravityEntry.total ?? 0})
                  </span>
                )}
              </button>
            </div>
          )}

          {/* Total & Active */}
          <div className="inline-flex items-center gap-1.5 rounded-lg border border-black/10 dark:border-white/10 bg-black/[0.02] dark:bg-white/[0.03] px-2 py-0.5 font-mono">
            <span className="size-1.5 rounded-full bg-cyan-500 shadow-[0_0_6px_rgba(6,182,212,0.75)]" />
            <span className="text-[10.5px] uppercase tracking-wider text-text-muted">Tổng</span>
            <NumberTicker
              value={totalAccounts}
              className="font-bold tabular-nums text-text-main"
            />
            <span className="text-[10.5px] tabular-nums text-text-muted">
              ({activeCount} bật{disabledCount > 0 ? ` / ${disabledCount} tắt` : ""})
            </span>
          </div>

          {/* Healthy Count */}
          <div className="inline-flex items-center gap-1 rounded-lg border border-emerald-500/25 bg-emerald-500/[0.08] px-2 py-0.5 font-mono text-emerald-700 dark:text-emerald-300">
            <span className="size-1.5 rounded-full bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.75)]" />
            <span className="text-[10.5px] uppercase tracking-wider">Sẵn sàng</span>
            <NumberTicker value={healthyCount} className="font-bold tabular-nums" />
          </div>

          {/* Low Count */}
          {lowCount > 0 && (
            <div className="inline-flex items-center gap-1 rounded-lg border border-amber-500/30 bg-amber-500/[0.09] px-2 py-0.5 font-mono text-amber-700 dark:text-amber-300">
              <span className="size-1.5 rounded-full bg-amber-500 shadow-[0_0_6px_rgba(245,158,11,0.75)]" />
              <span className="text-[10.5px] uppercase tracking-wider">Sắp hết</span>
              <NumberTicker value={lowCount} className="font-bold tabular-nums" />
            </div>
          )}

          {/* Exhausted Count */}
          {exhaustedCount > 0 && (
            <div className="inline-flex items-center gap-1 rounded-lg border border-rose-500/30 bg-rose-500/[0.09] px-2 py-0.5 font-mono text-rose-700 dark:text-rose-300">
              <span className="size-1.5 rounded-full bg-rose-500 shadow-[0_0_6px_rgba(244,63,94,0.75)]" />
              <span className="text-[10.5px] uppercase tracking-wider">Cạn kiệt</span>
              <NumberTicker value={exhaustedCount} className="font-bold tabular-nums" />
            </div>
          )}

          {/* Blocked / Verification Count */}
          {blockedCount > 0 && (
            <div className="inline-flex items-center gap-1 rounded-lg border border-rose-500/40 bg-rose-500/15 px-2 py-0.5 font-mono text-rose-700 dark:text-rose-300">
              <span className="material-symbols-outlined text-[13px]">warning</span>
              <span className="text-[10.5px] uppercase tracking-wider">Bị chặn</span>
              <NumberTicker value={blockedCount} className="font-bold tabular-nums" />
            </div>
          )}
        </div>

        {/* Segmented Average Quota Gauge, Sync Telemetry & Provider Breakdown */}
        <div className="flex flex-wrap items-center gap-2.5 ml-auto">
          {avgRemainingPct !== null && (
            <div className="flex items-center gap-2 rounded-lg border border-cyan-500/20 bg-black/[0.025] dark:bg-white/[0.03] px-2.5 py-1">
              <span className="font-mono text-[10px] uppercase tracking-wider text-text-muted">
                TB Quota
              </span>
              <div
                className="flex items-center gap-0.5"
                role="meter"
                aria-label="Hạn mức trung bình"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={clampedAvg}
              >
                {Array.from({ length: SEGMENT_COUNT }, (_, idx) => {
                  const active = idx < filledSegments;
                  return (
                    <span
                      key={idx}
                      className={cn(
                        "h-2.5 w-1.5 rounded-[2px] transition-all duration-300",
                        active
                          ? getSegmentActiveClass(avgRemainingPct)
                          : "bg-black/10 dark:bg-white/10",
                      )}
                    />
                  );
                })}
              </div>
              <NumberTicker
                value={avgRemainingPct}
                suffix="%"
                className={cn("font-mono font-bold tabular-nums text-xs", getAvgColorClass(avgRemainingPct))}
              />
            </div>
          )}

          {/* Provider Breakdown Mini Chips */}
          {providerBreakdown.length > 1 && (
            <div className="hidden lg:flex items-center gap-1 rounded-lg border border-black/10 dark:border-white/10 bg-black/[0.02] dark:bg-white/[0.02] px-1.5 py-0.5">
              {providerBreakdown.map((item) => {
                const count = item.count ?? item.total ?? 0;
                return (
                  <button
                    key={item.provider}
                    type="button"
                    onClick={() => onSelectProvider?.(item.provider)}
                    className={cn(
                      "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-mono text-[10.5px] transition-all cursor-pointer",
                      providerFilter === item.provider
                        ? "bg-cyan-500/20 border border-cyan-500/40 font-bold text-cyan-700 dark:text-cyan-300"
                        : "border border-transparent text-text-muted hover:text-text-primary hover:bg-black/5 dark:hover:bg-white/5",
                    )}
                    title={`Xem ${count} tài khoản ${item.provider}`}
                  >
                    <ProviderIcon
                      src={`/providers/${item.provider}.png`}
                      alt={item.provider}
                      size={12}
                      className="size-3 rounded-xs object-contain"
                      fallbackText={item.provider.slice(0, 1).toUpperCase()}
                    />
                    <span className="tabular-nums font-semibold">{count}</span>
                  </button>
                );
              })}
            </div>
          )}

          {(isRevalidating || syncTimeLabel) && (
            <div className="hidden xl:inline-flex items-center gap-1 font-mono text-[10px] tabular-nums text-text-muted">
              <span
                className={cn(
                  "size-1.5 rounded-full",
                  isRevalidating
                    ? "bg-cyan-400 animate-ping"
                    : "bg-emerald-500/70",
                )}
              />
              <span>{isRevalidating ? "ĐANG ĐỒNG BỘ" : syncTimeLabel}</span>
            </div>
          )}
        </div>
      </div>
    </HudFrame>
  );
}
