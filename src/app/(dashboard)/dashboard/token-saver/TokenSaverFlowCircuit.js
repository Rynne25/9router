"use client";

import { FlowDeck, FlowNode, FlowBeam } from "@/shared/components/hud";
import { playHudSound } from "@/shared/utils/hudAudio";
import { cn } from "@/shared/utils/cn";

/**
 * 5-stage Live Token Compression Pipeline for /dashboard/token-saver.
 * Clicking stage nodes toggles RTK, Headroom, and Caveman directly.
 */
export default function TokenSaverFlowCircuit({
  rtkEnabled = true,
  onToggleRtk,
  headroomEnabled = false,
  headroomRunning = false,
  onToggleHeadroom,
  cavemanEnabled = false,
  cavemanLevel = "full",
  onToggleCaveman,
  ponytailEnabled = false,
  ponytailLevel = "full",
  customPromptEnabled = false,
  claudeCacheTtl = "5m",
  motionPaused = false,
}) {
  let ratio = 100;
  if (rtkEnabled) ratio *= 0.55;
  if (headroomEnabled) ratio *= 0.65;
  if (cavemanEnabled) ratio *= 0.5;
  else if (ponytailEnabled) ratio *= 0.72;
  if (customPromptEnabled) ratio *= 0.92;

  const estimatedPct = Math.max(15, Math.round(ratio));
  const savedPct = Math.max(0, 100 - estimatedPct);
  const outputEnabled = Boolean(cavemanEnabled || ponytailEnabled);
  const activeCount = [rtkEnabled, headroomEnabled, cavemanEnabled, ponytailEnabled, customPromptEnabled].filter(Boolean).length;

  const outputSubtitle = cavemanEnabled && ponytailEnabled
    ? `Caveman (${cavemanLevel}) + Ponytail`
    : cavemanEnabled
      ? `Caveman · ${cavemanLevel.toUpperCase()}`
      : ponytailEnabled
        ? `Ponytail · ${ponytailLevel.toUpperCase()}`
        : "Nhấp để bật Caveman";

  return (
    <FlowDeck
      storageKey="token-saver"
      title="SƠ ĐỒ NÉN TOKEN TRỰC TIẾP"
      badge="NHẤP NODE ĐỂ BẬT / TẮT"
      statusLabel={savedPct > 0 ? `GIẢM ~${savedPct}%` : "CHƯA NÉN"}
      statusAccent={savedPct >= 45 ? "emerald" : savedPct > 0 ? "cyan" : "amber"}
      accent={savedPct >= 45 ? "emerald" : "cyan"}
      borderBeam={activeCount > 0}
    >
      {({ hoveredIndex, setHoveredIndex }) => {
        const isHighlighted = (idx) => hoveredIndex !== null && Math.abs(hoveredIndex - idx) <= 1;
        const isDimmed = (idx) => hoveredIndex !== null && Math.abs(hoveredIndex - idx) > 1;

        return (
          <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_38px_minmax(0,1fr)_38px_minmax(0,1fr)_38px_minmax(0,1fr)_38px_minmax(0,1.1fr)] items-stretch gap-1 md:gap-0">
            <FlowNode
              step="01"
              eyebrow="ĐẦU VÀO"
              title="Prompt gốc"
              subtitle="100% ngữ cảnh & log"
              icon="input"
              status="standby"
              badge="100%"
              highlighted={isHighlighted(0)}
              dimmed={isDimmed(0)}
              onHoverStart={() => setHoveredIndex(0)}
              onHoverEnd={() => setHoveredIndex(null)}
              footer={<span className="text-text-subtle truncate">Luồng đầu vào chuẩn</span>}
            />

            <FlowBeam
              compact
              active={rtkEnabled || activeCount > 0}
              paused={motionPaused}
              highlighted={hoveredIndex === 0 || hoveredIndex === 1}
              dimmed={hoveredIndex !== null && hoveredIndex > 2}
              accent={rtkEnabled ? "emerald" : "cyan"}
              label={rtkEnabled ? "-45%" : ""}
            />

            <FlowNode
              step="02"
              eyebrow="LỌC LỆNH"
              title="RTK Filter"
              subtitle={rtkEnabled ? "Đang lọc git/grep/logs" : "Nhấp để kích hoạt"}
              icon="terminal"
              status={rtkEnabled ? "live" : "idle"}
              badge={rtkEnabled ? "BẬT" : "TẮT"}
              active={rtkEnabled}
              highlighted={isHighlighted(1)}
              dimmed={isDimmed(1)}
              onHoverStart={() => setHoveredIndex(1)}
              onHoverEnd={() => setHoveredIndex(null)}
              onClick={() => {
                playHudSound("toggle");
                onToggleRtk?.(!rtkEnabled);
              }}
              footer={
                <span className="text-cyan-600 dark:text-cyan-400 font-semibold whitespace-nowrap">
                  {rtkEnabled ? "Đang giảm ~60–90% CLI" : "Nhấp để bật RTK"}
                </span>
              }
            />

            <FlowBeam
              compact
              active={headroomEnabled || outputEnabled}
              paused={motionPaused}
              highlighted={hoveredIndex === 1 || hoveredIndex === 2}
              dimmed={hoveredIndex !== null && (hoveredIndex < 1 || hoveredIndex > 3)}
              accent={headroomEnabled ? (headroomRunning ? "emerald" : "amber") : "cyan"}
              label={headroomEnabled ? "-35%" : ""}
            />

            <FlowNode
              step="03"
              eyebrow="NGỮ CẢNH"
              title="Headroom"
              subtitle={
                headroomEnabled
                  ? headroomRunning
                    ? "Proxy /v1/compress ON"
                    : "Bật (Proxy chưa chạy)"
                  : "Nhấp để kích hoạt"
              }
              icon="compress"
              status={headroomEnabled ? (headroomRunning ? "live" : "warning") : "idle"}
              badge={headroomEnabled ? (headroomRunning ? "ONLINE" : "CHỜ") : "TẮT"}
              active={headroomEnabled}
              highlighted={isHighlighted(2)}
              dimmed={isDimmed(2)}
              onHoverStart={() => setHoveredIndex(2)}
              onHoverEnd={() => setHoveredIndex(null)}
              onClick={() => {
                playHudSound("toggle");
                onToggleHeadroom?.(!headroomEnabled);
              }}
              footer={
                <span className="text-cyan-600 dark:text-cyan-400 font-semibold whitespace-nowrap">
                  {headroomEnabled ? "Nén ngữ cảnh dài" : "Nhấp để bật Headroom"}
                </span>
              }
            />

            <FlowBeam
              compact
              active={outputEnabled || savedPct > 0}
              paused={motionPaused}
              highlighted={hoveredIndex === 2 || hoveredIndex === 3}
              dimmed={hoveredIndex !== null && hoveredIndex < 2}
              accent={outputEnabled ? "emerald" : "cyan"}
              label={cavemanEnabled ? "-50%" : ponytailEnabled ? "-28%" : ""}
            />

            <FlowNode
              step="04"
              eyebrow="ĐẦU RA"
              title="Caveman / Ponytail"
              subtitle={outputSubtitle}
              icon="psychology_alt"
              status={outputEnabled ? "live" : "idle"}
              badge={outputEnabled ? "BẬT" : "TẮT"}
              active={outputEnabled}
              highlighted={isHighlighted(3)}
              dimmed={isDimmed(3)}
              onHoverStart={() => setHoveredIndex(3)}
              onHoverEnd={() => setHoveredIndex(null)}
              onClick={() => {
                playHudSound("toggle");
                onToggleCaveman?.(!cavemanEnabled);
              }}
              footer={
                <span className="text-cyan-600 dark:text-cyan-400 font-semibold whitespace-nowrap">
                  {cavemanEnabled ? "Cô đọng phản hồi" : "Nhấp để bật Caveman"}
                </span>
              }
            />

            <FlowBeam
              compact
              active={savedPct > 0}
              paused={motionPaused}
              highlighted={hoveredIndex === 3 || hoveredIndex === 4}
              dimmed={hoveredIndex !== null && hoveredIndex < 3}
              accent={savedPct >= 45 ? "emerald" : "cyan"}
            />

            <FlowNode
              step="05"
              eyebrow="ƯỚC TÍNH"
              title={`Đầu ra ~${estimatedPct}%`}
              subtitle={`Tiết kiệm ~${savedPct}% · TTL ${claudeCacheTtl.toUpperCase()}`}
              icon="speed"
              status={savedPct >= 45 ? "live" : savedPct > 0 ? "standby" : "idle"}
              badge={`-${savedPct}%`}
              highlighted={isHighlighted(4)}
              dimmed={isDimmed(4)}
              onHoverStart={() => setHoveredIndex(4)}
              onHoverEnd={() => setHoveredIndex(null)}
              footer={
                <div className="w-full space-y-1">
                  <div className="h-1.5 w-full rounded-full bg-black/10 dark:bg-white/10 overflow-hidden">
                    <div
                      className={cn(
                        "h-full rounded-full transition-all duration-300",
                        savedPct >= 45
                          ? "bg-gradient-to-r from-emerald-500 to-cyan-400"
                          : "bg-gradient-to-r from-cyan-500 to-amber-400"
                      )}
                      style={{ width: `${estimatedPct}%` }}
                    />
                  </div>
                </div>
              }
            />
          </div>
        );
      }}
    </FlowDeck>
  );
}
