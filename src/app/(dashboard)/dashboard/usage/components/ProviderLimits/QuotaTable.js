"use client";

import { useMemo, useState } from "react";
import { formatResetTime, getRemainingPercentage, pairQuotasByFamily } from "./utils";

const PAGE_SIZE = 10;

function formatResetTimeDisplay(resetTime) {
  if (!resetTime) return null;

  try {
    const date = new Date(resetTime);
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    let dayStr = "";
    if (date >= today && date < tomorrow) {
      dayStr = "Hôm nay";
    } else if (date >= tomorrow && date < new Date(tomorrow.getTime() + 24 * 60 * 60 * 1000)) {
      dayStr = "Ngày mai";
    } else {
      dayStr = date.toLocaleDateString("vi-VN", { month: "short", day: "numeric" });
    }

    const timeStr = date.toLocaleTimeString("vi-VN", {
      hour: "2-digit",
      minute: "2-digit",
    });

    return `${dayStr}, ${timeStr}`;
  } catch {
    return null;
  }
}

function getColorClasses(remainingPercentage) {
  if (remainingPercentage > 70) {
    return {
      text: "text-emerald-600 dark:text-emerald-400",
      bg: "bg-gradient-to-r from-emerald-500 to-teal-400 text-emerald-400",
      dot: "bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.75)]",
    };
  }

  if (remainingPercentage >= 30) {
    return {
      text: "text-amber-600 dark:text-amber-400",
      bg: "bg-gradient-to-r from-amber-500 to-yellow-400 text-amber-400",
      dot: "bg-amber-400 shadow-[0_0_6px_rgba(251,191,36,0.75)]",
    };
  }

  return {
    text: "text-rose-600 dark:text-rose-400",
    bg: "bg-gradient-to-r from-rose-500 to-red-500 text-rose-400",
    dot: "bg-rose-500 shadow-[0_0_6px_rgba(244,63,94,0.75)]",
  };
}

function sortQuotas(quotas, sortMode) {
  if (sortMode === "remaining-asc") {
    return [...quotas].sort((a, b) => a.remaining - b.remaining || a.name.localeCompare(b.name));
  }

  if (sortMode === "remaining-desc") {
    return [...quotas].sort((a, b) => b.remaining - a.remaining || a.name.localeCompare(b.name));
  }

  return quotas;
}

export default function QuotaTable({
  quotas = [],
  sortMode = "default",
  showSortLabel = false,
  compact = false,
  onHideQuota = null,
}) {
  const [page, setPage] = useState(1);
  const [prevSortMode, setPrevSortMode] = useState(sortMode);

  if (prevSortMode !== sortMode) {
    setPrevSortMode(sortMode);
    setPage(1);
  }

  const normalizedQuotas = useMemo(
    () =>
      quotas.map((quota, index) => ({
        ...quota,
        index,
        remaining: getRemainingPercentage(quota),
      })),
    [quotas],
  );

  const sortedQuotas = useMemo(
    () => sortQuotas(normalizedQuotas, sortMode),
    [normalizedQuotas, sortMode],
  );

  const totalPages = Math.max(1, Math.ceil(sortedQuotas.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);

  if (!quotas || quotas.length === 0) {
    return null;
  }

  const currentPageRows = sortedQuotas.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  const { items: orderedItems } = pairQuotasByFamily(currentPageRows);
  const pageStart = sortedQuotas.length === 0 ? 0 : (safePage - 1) * PAGE_SIZE + 1;
  const pageEnd = Math.min(safePage * PAGE_SIZE, sortedQuotas.length);
  const hasHideAction = typeof onHideQuota === "function";

  const renderInlineCell = (quota, badgeLabel) => {
    const isUnlimited = quota.unlimited === true;
    const isCreditBalance = quota.isCreditBalance === true;
    const colors = isCreditBalance
      ? {
          text: "text-sky-600 dark:text-sky-400",
          bg: "bg-gradient-to-r from-sky-500 to-blue-400 text-sky-400",
          dot: "bg-sky-400",
        }
      : getColorClasses(quota.colorPercentage ?? quota.remaining);

    const countdown = quota.neverExpires ? "-" : formatResetTime(quota.resetAt);
    const resetDisplay = formatResetTimeDisplay(quota.resetAt);
    const isWeeklyBadge = /tuần|weekly|7d/i.test(badgeLabel || "");
    const isG1Badge = /g1 pro/i.test(badgeLabel || "");

    const badgeClasses = isWeeklyBadge
      ? "border-violet-500/30 bg-violet-500/12 text-violet-600 dark:text-violet-300"
      : isG1Badge
        ? "border-purple-500/35 bg-purple-500/15 text-purple-600 dark:text-purple-300"
        : "border-sky-500/30 bg-sky-500/12 text-sky-600 dark:text-sky-300";

    const usageTooltip = isUnlimited
      ? `${quota.used.toLocaleString()} đã dùng · Không giới hạn`
      : isCreditBalance
        ? `Số dư credit: ${quota.total.toFixed(2)} ${quota.currency || ""}`
        : `${quota.used.toLocaleString()} / ${quota.total > 0 ? quota.total.toLocaleString() : "∞"}${
            resetDisplay ? ` • Reset: ${resetDisplay}` : ""
          }`;

    return (
      <div
        key={`${quota.name}-${quota.index}`}
        className="group/cell flex flex-col justify-center gap-1.5 min-w-0"
        title={usageTooltip}
      >
        <div className="flex items-center justify-between gap-1.5 min-w-0 leading-none">
          <div className="flex items-center gap-1.5 min-w-0">
            {badgeLabel && (
              <span
                className={`inline-flex items-center rounded-md border px-1.5 py-0.5 text-[9.5px] font-bold leading-none tracking-tight shrink-0 ${badgeClasses}`}
              >
                {badgeLabel}
              </span>
            )}
            {countdown !== "-" && (
              <span
                className="inline-flex items-center gap-0.5 text-[10px] text-text-muted tabular-nums truncate"
                title={resetDisplay ? `Reset lúc ${resetDisplay}` : undefined}
              >
                <span className="material-symbols-outlined text-[11px] opacity-70">schedule</span>
                <span>{countdown}</span>
              </span>
            )}
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <span
              className={`text-[11.5px] font-extrabold tabular-nums ${
                isUnlimited
                  ? "text-emerald-600 dark:text-emerald-400"
                  : isCreditBalance
                    ? "text-sky-600 dark:text-sky-400"
                    : colors.text
              }`}
            >
              {isUnlimited ? "∞" : isCreditBalance ? `${quota.total.toFixed(1)}` : `${quota.remaining}%`}
            </span>
            {hasHideAction && (
              <button
                type="button"
                onClick={() => onHideQuota(quota)}
                className="opacity-0 group-hover/cell:opacity-100 focus:opacity-100 inline-flex size-4 shrink-0 items-center justify-center rounded text-text-muted/70 transition-all hover:text-text-primary cursor-pointer"
                title={`Ẩn dòng ${quota.name}`}
                aria-label={`Hide quota ${quota.name}`}
              >
                <span className="material-symbols-outlined text-[12px]">visibility_off</span>
              </button>
            )}
          </div>
        </div>

        {!isUnlimited && !isCreditBalance && (
          <div className="liquid-glass-tube h-[6px] w-full">
            <div
              className={`liquid-glass-fill h-full transition-all duration-500 ${colors.bg}`}
              style={{ width: `${Math.min(Math.max(quota.remaining, 0), 100)}%` }}
            />
          </div>
        )}
      </div>
    );
  };

  return (
    <div className={compact ? "space-y-1.5" : "space-y-1.5"}>
      {showSortLabel && (
        <div className="flex justify-end px-0.5">
          <span className="rounded-md border border-black/10 bg-black/[0.02] px-2 py-0.5 text-[10px] text-text-muted dark:border-white/10 dark:bg-white/[0.03]">
            Đang sắp theo % còn lại
          </span>
        </div>
      )}

      {/* Unified Family-Ordered Rows (Gemini -> G1 Pro / Argon -> Claude -> Standalone) */}
      {orderedItems.map((item) => {
        if (item.kind === "paired") {
          const { pair } = item;
          const minRemaining = Math.min(pair.daily.remaining ?? 100, pair.weekly.remaining ?? 100);
          const familyColors = getColorClasses(minRemaining);
          return (
            <div
              key={pair.familyKey}
              className={`rounded-xl border border-black/[0.06] bg-white/45 dark:border-white/[0.08] dark:bg-white/[0.025] ${
                compact ? "px-2 py-1.5 space-y-1" : "px-2.5 py-1.5 space-y-1.5"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className={`size-1.5 rounded-full shrink-0 ${familyColors.dot}`} />
                  <span className="text-[11px] font-bold text-text-primary truncate" title={pair.title}>
                    {pair.title}
                  </span>
                </div>
              </div>
              <div className={compact ? "grid grid-cols-1 gap-1.5" : "grid grid-cols-1 sm:grid-cols-2 gap-2"}>
                {renderInlineCell(pair.daily, "5h")}
                {renderInlineCell(pair.weekly, "Tuần")}
              </div>
            </div>
          );
        }

        const { quota } = item;
        const colors = getColorClasses(quota.colorPercentage ?? quota.remaining);
        const title = quota.cleanTitle || quota.name;
        return (
          <div
            key={`${quota.name}-${quota.index}`}
            className={`rounded-xl border border-black/[0.06] bg-white/45 dark:border-white/[0.08] dark:bg-white/[0.025] ${
              compact ? "px-2 py-1.5 space-y-1" : "px-2.5 py-1.5 space-y-1.5"
            }`}
          >
            <div className="flex items-center gap-1.5 min-w-0">
              <span className={`size-1.5 rounded-full shrink-0 ${colors.dot}`} />
              <span className="text-[11px] font-bold text-text-primary truncate" title={title}>
                {title}
              </span>
            </div>
            {renderInlineCell(quota, quota.cycleBadge || "Tuần")}
          </div>
        );
      })}

      {totalPages > 1 && (
        <div className="flex items-center justify-between rounded-lg border border-black/10 bg-black/[0.02] px-2.5 py-1 text-[10.5px] text-text-muted dark:border-white/10 dark:bg-white/[0.03]">
          <span>
            {pageStart}-{pageEnd} / {sortedQuotas.length}
          </span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setPage((currentPage) => Math.max(1, currentPage - 1))}
              disabled={page === 1}
              className="rounded border border-black/10 px-1.5 py-0.5 text-[10px] text-text-primary hover:bg-black/5 disabled:opacity-40 dark:border-white/10 dark:hover:bg-white/5 cursor-pointer"
            >
              Trước
            </button>
            <button
              type="button"
              onClick={() => setPage((currentPage) => Math.min(totalPages, currentPage + 1))}
              disabled={page === totalPages}
              className="rounded border border-black/10 px-1.5 py-0.5 text-[10px] text-text-primary hover:bg-black/5 disabled:opacity-40 dark:border-white/10 dark:hover:bg-white/5 cursor-pointer"
            >
              Sau
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
