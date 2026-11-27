"use client";

import Link from "next/link";
import { FlowDeck, FlowNode, FlowBeam } from "@/shared/components/hud";
import { playHudSound } from "@/shared/utils/hudAudio";
import { cn } from "@/shared/utils/cn";

const TIER_PILLS = [
  { id: "all", label: "Tất cả" },
  { id: "pro", label: "PRO" },
  { id: "ultra", label: "ULTRA" },
  { id: "plus", label: "PLUS" },
  { id: "free", label: "FREE" },
];

/**
 * 4-stage Live Account Rotation Circuit for /dashboard/providers/antigravity.
 */
export default function AntigravityRotationCircuit({
  connections = [],
  tierCounts = {},
  antigravityTierFilter = "all",
  onSelectTierFilter,
  providerStrategy = null,
  onToggleRoundRobin,
}) {
  const activeConnections = connections.filter((c) => c.isActive !== false);
  const healthyCount = activeConnections.filter(
    (c) =>
      !c.validationBlocked &&
      !c.providerSpecificData?.validationBlocked &&
      c.testStatus !== "error" &&
      c.testStatus !== "unavailable"
  ).length;
  const issueCount = activeConnections.length - healthyCount;

  const isRoundRobin = providerStrategy === "round-robin";
  const isSoonestReset = providerStrategy === "soonest-reset";
  const strategyTitle = isRoundRobin
    ? "Round-Robin"
    : isSoonestReset
      ? "Sắp reset trước"
      : "Ưu tiên mặc định";

  return (
    <FlowDeck
      storageKey="provider-antigravity"
      title="SƠ ĐỒ XOAY VÒNG TÀI KHOẢN ANTIGRAVITY"
      badge={`${activeConnections.length}/${connections.length} ĐANG BẬT`}
      statusLabel={strategyTitle.toUpperCase()}
      statusAccent={healthyCount > 0 ? "emerald" : issueCount > 0 ? "rose" : "cyan"}
      accent="cyan"
      borderBeam={healthyCount > 0}
    >
      {({ hoveredIndex, setHoveredIndex }) => {
        const isHighlighted = (idx) => hoveredIndex !== null && Math.abs(hoveredIndex - idx) <= 1;
        const isDimmed = (idx) => hoveredIndex !== null && Math.abs(hoveredIndex - idx) > 1;

        return (
          <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_48px_minmax(0,1fr)_48px_minmax(0,1.15fr)_48px_minmax(0,1fr)] items-stretch gap-1 md:gap-0">
            <FlowNode
              step="01"
              eyebrow="LƯU LƯỢNG"
              title="Yêu cầu Antigravity"
              subtitle={`${connections.length} hồ sơ đã liên kết`}
              icon="bolt"
              status={activeConnections.length > 0 ? "live" : "idle"}
              badge={`${activeConnections.length} ON`}
              highlighted={isHighlighted(0)}
              dimmed={isDimmed(0)}
              onHoverStart={() => setHoveredIndex(0)}
              onHoverEnd={() => setHoveredIndex(null)}
              footer={<span className="text-text-subtle truncate">Phân phối tự động theo pool</span>}
            />

            <FlowBeam
              compact
              active={activeConnections.length > 0}
              highlighted={hoveredIndex === 0 || hoveredIndex === 1}
              dimmed={hoveredIndex !== null && hoveredIndex > 2}
              accent={isRoundRobin ? "emerald" : "cyan"}
              label={isRoundRobin ? "RR" : "ưu tiên"}
            />

            <FlowNode
              step="02"
              eyebrow="ĐIỀU PHỐI"
              title={strategyTitle}
              subtitle={isRoundRobin ? "Đang bật xoay vòng đều" : "Nhấp để bật Round-Robin"}
              icon="sync_alt"
              status={isRoundRobin || isSoonestReset ? "live" : "standby"}
              badge={isRoundRobin ? "RR ON" : isSoonestReset ? "RESET" : "AUTO"}
              active={isRoundRobin}
              highlighted={isHighlighted(1)}
              dimmed={isDimmed(1)}
              onHoverStart={() => setHoveredIndex(1)}
              onHoverEnd={() => setHoveredIndex(null)}
              onClick={() => {
                playHudSound("toggle");
                onToggleRoundRobin?.();
              }}
              footer={
                <span className="text-cyan-600 dark:text-cyan-400 font-semibold whitespace-nowrap">
                  {isRoundRobin ? "Nhấp để về mặc định" : "Nhấp để bật Round-Robin"}
                </span>
              }
            />

            <FlowBeam
              compact
              active={activeConnections.length > 0}
              highlighted={hoveredIndex === 1 || hoveredIndex === 2}
              dimmed={hoveredIndex !== null && (hoveredIndex < 1 || hoveredIndex > 3)}
              accent="cyan"
              label={antigravityTierFilter === "all" ? "tất cả" : antigravityTierFilter.toUpperCase()}
            />

            <FlowNode
              step="03"
              eyebrow="PHÂN TẦNG"
              title="Lọc nhanh theo gói"
              icon="workspace_premium"
              status={antigravityTierFilter !== "all" ? "live" : "standby"}
              badge={antigravityTierFilter.toUpperCase()}
              highlighted={isHighlighted(2)}
              dimmed={isDimmed(2)}
              onHoverStart={() => setHoveredIndex(2)}
              onHoverEnd={() => setHoveredIndex(null)}
            >
              <div className="flex flex-wrap items-center gap-1">
                {TIER_PILLS.map((tier) => {
                  const count = tierCounts?.[tier.id] ?? 0;
                  if (tier.id !== "all" && count === 0) return null;
                  const active = antigravityTierFilter === tier.id;
                  return (
                    <button
                      key={tier.id}
                      type="button"
                      data-cursor-target="true"
                      onClick={() => {
                        playHudSound("click");
                        onSelectTierFilter?.(tier.id);
                      }}
                      className={cn(
                        "inline-flex items-center gap-1 rounded border px-1.5 py-0.5 font-mono text-[10px] font-semibold transition-colors cursor-pointer whitespace-nowrap",
                        active
                          ? "border-cyan-500/60 bg-cyan-500/20 text-cyan-700 dark:text-cyan-200"
                          : "border-border-subtle bg-surface/70 text-text-muted hover:text-text-main hover:border-cyan-500/35"
                      )}
                    >
                      <span>{tier.label}</span>
                      <span className="opacity-75 hud-telemetry-num">{count}</span>
                    </button>
                  );
                })}
              </div>
            </FlowNode>

            <FlowBeam
              compact
              active={healthyCount > 0}
              highlighted={hoveredIndex === 2 || hoveredIndex === 3}
              dimmed={hoveredIndex !== null && hoveredIndex < 2}
              accent={healthyCount > 0 ? "emerald" : issueCount > 0 ? "rose" : "cyan"}
            />

            <FlowNode
              step="04"
              eyebrow="TÌNH TRẠNG"
              title={`Sẵn sàng: ${healthyCount}`}
              subtitle={issueCount > 0 ? `${issueCount} lỗi / bị chặn 403` : "Tất cả tài khoản ổn định"}
              icon="verified"
              status={healthyCount > 0 ? "live" : issueCount > 0 ? "error" : "idle"}
              badge={issueCount > 0 ? `${issueCount} LỖI` : "TỐT"}
              highlighted={isHighlighted(3)}
              dimmed={isDimmed(3)}
              onHoverStart={() => setHoveredIndex(3)}
              onHoverEnd={() => setHoveredIndex(null)}
              footer={
                <div className="flex items-center justify-between gap-2 w-full">
                  <span className="text-text-subtle truncate">Xem chi tiết</span>
                  <Link
                    href="/dashboard/quota?provider=antigravity"
                    data-cursor-target
                    onClick={() => playHudSound("click")}
                    className="inline-flex items-center gap-0.5 font-semibold text-cyan-600 dark:text-cyan-400 hover:underline whitespace-nowrap shrink-0"
                  >
                    <span>Bảng Quota</span>
                    <span className="material-symbols-outlined text-[12px]">arrow_forward</span>
                  </Link>
                </div>
              }
            />
          </div>
        );
      }}
    </FlowDeck>
  );
}
