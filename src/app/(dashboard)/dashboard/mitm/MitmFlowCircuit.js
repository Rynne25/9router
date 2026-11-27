"use client";

import Link from "next/link";
import { FlowDeck, FlowNode, FlowBeam } from "@/shared/components/hud";
import { playHudSound } from "@/shared/utils/hudAudio";

/**
 * 4-stage Live MITM Intercept Circuit for /dashboard/mitm.
 */
export default function MitmFlowCircuit({
  isRunning = false,
  certTrusted = false,
  activeDnsToolsCount = 0,
  toolsCount = 2,
  antigravityDnsActive = false,
  activeProvidersCount = 0,
  combosCount = 0,
  onFocusTool,
}) {
  const interceptLive = isRunning && activeDnsToolsCount > 0;

  return (
    <FlowDeck
      storageKey="mitm"
      title="MẠCH CHẶN LƯU LƯỢNG MITM"
      badge="HTTPS :443"
      statusLabel={interceptLive ? "ĐANG CHẶN QUA 9ROUTER" : isRunning ? "PASSTHROUGH SẴN SÀNG" : "ĐANG TẮT SERVER"}
      statusAccent={interceptLive ? "emerald" : isRunning ? "cyan" : "amber"}
      accent={interceptLive ? "emerald" : "cyan"}
      borderBeam={isRunning}
    >
      {({ hoveredIndex, setHoveredIndex }) => {
        const isHighlighted = (idx) => hoveredIndex !== null && Math.abs(hoveredIndex - idx) <= 1;
        const isDimmed = (idx) => hoveredIndex !== null && Math.abs(hoveredIndex - idx) > 1;

        return (
          <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_48px_minmax(0,1fr)_48px_minmax(0,1fr)_48px_minmax(0,1fr)] items-stretch gap-1 md:gap-0">
            <FlowNode
              step="01"
              eyebrow="ỨNG DỤNG"
              title="Antigravity IDE & CLI"
              subtitle={`${toolsCount} công cụ mục tiêu`}
              icon="terminal"
              status={antigravityDnsActive && isRunning ? "live" : "standby"}
              badge={antigravityDnsActive ? "AGY ON" : "CHỜ"}
              highlighted={isHighlighted(0)}
              dimmed={isDimmed(0)}
              onHoverStart={() => setHoveredIndex(0)}
              onHoverEnd={() => setHoveredIndex(null)}
              onClick={() => {
                playHudSound("click");
                onFocusTool?.("antigravity");
              }}
              footer={<span className="text-text-subtle truncate">daily-cloudcode-pa.googleapis.com</span>}
            />

            <FlowBeam
              compact
              active={activeDnsToolsCount > 0}
              highlighted={hoveredIndex === 0 || hoveredIndex === 1}
              dimmed={hoveredIndex !== null && hoveredIndex > 2}
              accent={interceptLive ? "emerald" : activeDnsToolsCount > 0 ? "amber" : "cyan"}
              label="DNS"
            />

            <FlowNode
              step="02"
              eyebrow="ĐỊNH TUYẾN DNS"
              title="File Hosts (/etc/hosts)"
              subtitle={`${activeDnsToolsCount}/${toolsCount} công cụ đang trỏ 127.0.0.1`}
              icon="dns"
              status={interceptLive ? "live" : activeDnsToolsCount > 0 ? "warning" : "standby"}
              badge={`${activeDnsToolsCount}/${toolsCount}`}
              highlighted={isHighlighted(1)}
              dimmed={isDimmed(1)}
              onHoverStart={() => setHoveredIndex(1)}
              onHoverEnd={() => setHoveredIndex(null)}
              onClick={() => {
                playHudSound("click");
                onFocusTool?.("antigravity");
              }}
              footer={
                <span className="text-cyan-600 dark:text-cyan-400 font-semibold whitespace-nowrap">
                  {activeDnsToolsCount > 0 ? "Nhấp để chỉnh DNS Antigravity" : "Passthrough thông minh"}
                </span>
              }
            />

            <FlowBeam
              compact
              active={isRunning}
              highlighted={hoveredIndex === 1 || hoveredIndex === 2}
              dimmed={hoveredIndex !== null && (hoveredIndex < 1 || hoveredIndex > 3)}
              accent={isRunning && certTrusted ? "emerald" : isRunning ? "amber" : "cyan"}
              label="TLS :443"
            />

            <FlowNode
              step="03"
              eyebrow="CHỨNG CHỈ & TLS"
              title="Root CA & Cổng :443"
              subtitle={isRunning ? "HTTPS Server đang lắng nghe" : "Cần bật server quyền Admin"}
              icon="verified_user"
              status={isRunning && certTrusted ? "live" : !certTrusted ? "warning" : "standby"}
              badge={certTrusted ? "CA OK" : "CHƯA CA"}
              highlighted={isHighlighted(2)}
              dimmed={isDimmed(2)}
              onHoverStart={() => setHoveredIndex(2)}
              onHoverEnd={() => setHoveredIndex(null)}
              footer={
                <span className="text-text-subtle truncate">
                  {isRunning ? "Sẵn sàng giải mã & chuyển tiếp" : "Chế độ chờ khởi động"}
                </span>
              }
            />

            <FlowBeam
              compact
              active={isRunning || activeProvidersCount > 0}
              highlighted={hoveredIndex === 2 || hoveredIndex === 3}
              dimmed={hoveredIndex !== null && hoveredIndex < 2}
              accent={activeProvidersCount > 0 ? "emerald" : "cyan"}
              label="/v1"
            />

            <FlowNode
              step="04"
              eyebrow="ÁNH XẠ LÕI"
              title="9Router Gateway"
              subtitle={`${activeProvidersCount} kết nối · ${combosCount} combo`}
              icon="hub"
              status={activeProvidersCount > 0 ? "live" : "idle"}
              badge="ROUTER"
              highlighted={isHighlighted(3)}
              dimmed={isDimmed(3)}
              onHoverStart={() => setHoveredIndex(3)}
              onHoverEnd={() => setHoveredIndex(null)}
              footer={
                <div className="flex items-center justify-between gap-2 w-full">
                  <span className="text-text-subtle truncate">Ánh xạ model tự động</span>
                  <Link
                    href="/dashboard/combos"
                    data-cursor-target
                    onClick={() => playHudSound("click")}
                    className="text-cyan-600 dark:text-cyan-400 font-semibold hover:underline whitespace-nowrap shrink-0"
                  >
                    Combo →
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
