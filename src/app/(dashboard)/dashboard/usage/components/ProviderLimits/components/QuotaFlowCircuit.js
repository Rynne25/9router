"use client";

import { FlowDeck, FlowNode, FlowBeam } from "@/shared/components/hud";
import { playHudSound } from "@/shared/utils/hudAudio";
import { cn } from "@/shared/utils/cn";

/**
 * 4-stage Interactive Quota Fuel-Pool Distribution Circuit for /dashboard/quota.
 * Clicking status nodes applies healthFilter directly to the grid below.
 */
export default function QuotaFlowCircuit({
  summaryStats = {},
  healthFilter = "all",
  onSelectHealthFilter,
}) {
  const {
    totalAccounts = 0,
    activeCount = 0,
    healthyCount = 0,
    lowCount = 0,
    exhaustedCount = 0,
    blockedCount = 0,
    avgRemainingPct = null,
  } = summaryStats || {};

  const issueTotal = exhaustedCount + blockedCount;

  const toggleFilter = (next) => {
    playHudSound("click");
    onSelectHealthFilter?.(healthFilter === next ? "all" : next);
  };

  return (
    <FlowDeck
      storageKey="quota"
      title="PHÂN BỔ NHIÊN LIỆU QUOTA"
      badge="NHẤP NODE ĐỂ LỌC NHANH"
      statusLabel={
        avgRemainingPct !== null && avgRemainingPct !== undefined
          ? `TB CÒN ${avgRemainingPct}%`
          : `${activeCount}/${totalAccounts} ĐANG BẬT`
      }
      statusAccent={
        avgRemainingPct === null
          ? "cyan"
          : avgRemainingPct > 70
            ? "emerald"
            : avgRemainingPct >= 30
              ? "amber"
              : "rose"
      }
      accent="cyan"
      borderBeam={healthyCount > 0}
      headerRight={
        healthFilter !== "all" ? (
          <button
            type="button"
            data-cursor-target="true"
            onClick={() => {
              playHudSound("click");
              onSelectHealthFilter?.("all");
            }}
            className="inline-flex items-center gap-1 rounded border border-cyan-500/40 bg-cyan-500/15 px-2 py-0.5 font-mono text-[10px] font-bold text-cyan-700 dark:text-cyan-300 hover:bg-cyan-500/25 transition-colors cursor-pointer whitespace-nowrap"
          >
            <span className="material-symbols-outlined text-[12px]">filter_alt_off</span>
            <span>Xóa lọc</span>
          </button>
        ) : null
      }
    >
      {({ hoveredIndex, setHoveredIndex }) => {
        const isHighlighted = (idx) => hoveredIndex !== null && Math.abs(hoveredIndex - idx) <= 1;
        const isDimmed = (idx) => hoveredIndex !== null && Math.abs(hoveredIndex - idx) > 1;

        return (
          <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_48px_minmax(0,1fr)_48px_minmax(0,1fr)_48px_minmax(0,1.08fr)] items-stretch gap-1 md:gap-0">
            <FlowNode
              step="01"
              eyebrow="TỔNG HỒ SƠ"
              title={`${totalAccounts} tài khoản`}
              subtitle={`${activeCount} kết nối đang bật`}
              icon="groups"
              status="standby"
              badge={avgRemainingPct !== null ? `${avgRemainingPct}%` : "ALL"}
              active={healthFilter === "all"}
              highlighted={isHighlighted(0)}
              dimmed={isDimmed(0)}
              onHoverStart={() => setHoveredIndex(0)}
              onHoverEnd={() => setHoveredIndex(null)}
              onClick={() => {
                playHudSound("click");
                onSelectHealthFilter?.("all");
              }}
              footer={
                <span className="text-cyan-600 dark:text-cyan-400 font-semibold whitespace-nowrap">
                  {healthFilter === "all" ? "Đang hiển thị tất cả" : "Nhấp để xem tất cả"}
                </span>
              }
            />

            <FlowBeam
              compact
              active={healthyCount > 0}
              highlighted={hoveredIndex === 0 || hoveredIndex === 1}
              dimmed={hoveredIndex !== null && hoveredIndex > 2}
              accent="emerald"
              label=">30%"
            />

            <FlowNode
              step="02"
              eyebrow="NHIÊN LIỆU TỐT"
              title={`Sẵn sàng: ${healthyCount}`}
              subtitle="Hạn mức còn trên 30%"
              icon="battery_charging_full"
              status={healthyCount > 0 ? "live" : "idle"}
              badge={healthFilter === "healthy" ? "ĐANG LỌC" : `${healthyCount}`}
              active={healthFilter === "healthy"}
              highlighted={isHighlighted(1)}
              dimmed={isDimmed(1)}
              onHoverStart={() => setHoveredIndex(1)}
              onHoverEnd={() => setHoveredIndex(null)}
              onClick={() => toggleFilter("healthy")}
              footer={
                <span className="text-emerald-600 dark:text-emerald-400 font-semibold whitespace-nowrap">
                  {healthFilter === "healthy" ? "Nhấp để bỏ lọc" : "Nhấp để lọc sẵn sàng"}
                </span>
              }
            />

            <FlowBeam
              compact
              active={lowCount > 0}
              highlighted={hoveredIndex === 1 || hoveredIndex === 2}
              dimmed={hoveredIndex !== null && (hoveredIndex < 1 || hoveredIndex > 3)}
              accent={lowCount > 0 ? "amber" : "cyan"}
              label="≤30%"
            />

            <FlowNode
              step="03"
              eyebrow="CẢNH BÁO THẤP"
              title={`Sắp hết: ${lowCount}`}
              subtitle="Hạn mức còn dưới 30%"
              icon="battery_alert"
              status={lowCount > 0 ? "warning" : "idle"}
              badge={healthFilter === "low" ? "ĐANG LỌC" : `${lowCount}`}
              active={healthFilter === "low"}
              highlighted={isHighlighted(2)}
              dimmed={isDimmed(2)}
              onHoverStart={() => setHoveredIndex(2)}
              onHoverEnd={() => setHoveredIndex(null)}
              onClick={() => toggleFilter("low")}
              footer={
                <span className="text-amber-600 dark:text-amber-400 font-semibold whitespace-nowrap">
                  {healthFilter === "low" ? "Nhấp để bỏ lọc" : "Nhấp để lọc sắp hết"}
                </span>
              }
            />

            <FlowBeam
              compact
              active={issueTotal > 0}
              highlighted={hoveredIndex === 2 || hoveredIndex === 3}
              dimmed={hoveredIndex !== null && hoveredIndex < 2}
              accent={issueTotal > 0 ? "rose" : "cyan"}
              label="0% / 403"
            />

            <FlowNode
              step="04"
              eyebrow="CẦN XỬ LÝ"
              title={`Hết / Chặn: ${issueTotal}`}
              subtitle="Lọc nhanh tài khoản 0% hoặc lỗi 403"
              icon="gpp_maybe"
              status={issueTotal > 0 ? "error" : "idle"}
              badge={`${issueTotal}`}
              active={healthFilter === "exhausted" || healthFilter === "blocked"}
              highlighted={isHighlighted(3)}
              dimmed={isDimmed(3)}
              onHoverStart={() => setHoveredIndex(3)}
              onHoverEnd={() => setHoveredIndex(null)}
            >
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  data-cursor-target="true"
                  onClick={() => toggleFilter("exhausted")}
                  className={cn(
                    "flex-1 inline-flex items-center justify-between rounded border px-2 py-1 font-mono text-[10px] font-semibold transition-colors cursor-pointer whitespace-nowrap",
                    healthFilter === "exhausted"
                      ? "border-rose-500/70 bg-rose-500/20 text-rose-700 dark:text-rose-200"
                      : "border-border-subtle bg-surface/75 text-text-muted hover:text-text-main hover:border-rose-500/40"
                  )}
                >
                  <span>Hết</span>
                  <strong className="hud-telemetry-num">{exhaustedCount}</strong>
                </button>
                <button
                  type="button"
                  data-cursor-target="true"
                  onClick={() => toggleFilter("blocked")}
                  className={cn(
                    "flex-1 inline-flex items-center justify-between rounded border px-2 py-1 font-mono text-[10px] font-semibold transition-colors cursor-pointer whitespace-nowrap",
                    healthFilter === "blocked"
                      ? "border-rose-500/70 bg-rose-500/20 text-rose-700 dark:text-rose-200"
                      : "border-border-subtle bg-surface/75 text-text-muted hover:text-text-main hover:border-rose-500/40"
                  )}
                >
                  <span>Lỗi 403</span>
                  <strong className="hud-telemetry-num">{blockedCount}</strong>
                </button>
              </div>
            </FlowNode>
          </div>
        );
      }}
    </FlowDeck>
  );
}
