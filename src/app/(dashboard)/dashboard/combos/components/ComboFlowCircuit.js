"use client";

import { useState } from "react";
import { FlowDeck, FlowNode, FlowBeam } from "@/shared/components/hud";
import { playHudSound } from "@/shared/utils/hudAudio";
import { cn } from "@/shared/utils/cn";

const STRATEGY_META = {
  fallback: { label: "Dự phòng tuần tự", beam: "failover", accent: "cyan" },
  "round-robin": { label: "Xoay vòng đều", beam: "luân phiên", accent: "emerald" },
  smart: { label: "Định tuyến Smart", beam: "smart AI", accent: "violet" },
  fusion: { label: "Hợp nhất Fusion", beam: "fusion", accent: "violet" },
};

function splitModelName(modelId) {
  if (!modelId) return { prefix: "", name: "" };
  const slashIdx = String(modelId).indexOf("/");
  if (slashIdx <= 0) return { prefix: "model", name: String(modelId) };
  return {
    prefix: String(modelId).slice(0, slashIdx),
    name: String(modelId).slice(slashIdx + 1),
  };
}

/**
 * Interactive Combo Failover Waterfall Circuit for /dashboard/combos.
 */
export default function ComboFlowCircuit({
  combos = [],
  filteredCombos = [],
  comboStrategies = {},
  copied,
  onCopy,
  onEdit,
}) {
  const [selectedComboId, setSelectedComboId] = useState(null);

  if (!Array.isArray(combos) || combos.length === 0) return null;

  const visibleList = filteredCombos.length > 0 ? filteredCombos : combos;
  const selectedCombo =
    visibleList.find((c) => c.id === selectedComboId) || visibleList[0] || combos[0];

  if (!selectedCombo) return null;

  const strategyKey = comboStrategies?.[selectedCombo.name]?.fallbackStrategy || "fallback";
  const strategyInfo = STRATEGY_META[strategyKey] || STRATEGY_META.fallback;
  const models = Array.isArray(selectedCombo.models) ? selectedCombo.models : [];
  const primary = splitModelName(models[0]);
  const second = splitModelName(models[1]);
  const third = splitModelName(models[2]);
  const extraCount = Math.max(0, models.length - 3);

  const switcherPills = visibleList.slice(0, 5);

  return (
    <FlowDeck
      storageKey="combos"
      title="THÁC ĐỊNH TUYẾN COMBO"
      badge={strategyInfo.label.toUpperCase()}
      statusLabel={`${models.length} MODEL`}
      statusAccent={models.length > 0 ? "emerald" : "amber"}
      accent="cyan"
      borderBeam={models.length > 1}
      headerRight={
        switcherPills.length > 1 ? (
          <div className="hidden xl:flex items-center gap-1 rounded-lg border border-border-subtle bg-surface-2/75 p-0.5">
            {switcherPills.map((combo) => {
              const active = combo.id === selectedCombo.id;
              return (
                <button
                  key={combo.id}
                  type="button"
                  data-cursor-target="true"
                  onClick={() => {
                    playHudSound("click");
                    setSelectedComboId(combo.id);
                  }}
                  className={cn(
                    "max-w-[130px] truncate rounded px-2 py-0.5 font-mono text-[10px] font-semibold transition-colors cursor-pointer",
                    active
                      ? "bg-cyan-500 text-slate-950 shadow-2xs"
                      : "text-text-muted hover:text-text-main hover:bg-cyan-500/10"
                  )}
                  title={combo.name}
                >
                  {combo.name}
                </button>
              );
            })}
          </div>
        ) : null
      }
    >
      {({ hoveredIndex, setHoveredIndex }) => {
        const isHighlighted = (idx) => hoveredIndex !== null && Math.abs(hoveredIndex - idx) <= 1;
        const isDimmed = (idx) => hoveredIndex !== null && Math.abs(hoveredIndex - idx) > 1;

        return (
          <div className="space-y-2.5">
            {/* Compact selector strip on screens < xl when multiple combos exist */}
            {switcherPills.length > 1 && (
              <div className="flex xl:hidden items-center gap-1.5 overflow-x-auto pb-0.5">
                <span className="font-mono text-[10px] uppercase tracking-wider text-text-muted shrink-0">
                  Xem combo:
                </span>
                {switcherPills.map((combo) => {
                  const active = combo.id === selectedCombo.id;
                  return (
                    <button
                      key={combo.id}
                      type="button"
                      data-cursor-target="true"
                      onClick={() => {
                        playHudSound("click");
                        setSelectedComboId(combo.id);
                      }}
                      className={cn(
                        "max-w-[140px] truncate rounded-md border px-2 py-0.5 font-mono text-[10px] font-semibold transition-colors cursor-pointer shrink-0",
                        active
                          ? "border-cyan-500/60 bg-cyan-500/15 text-cyan-700 dark:text-cyan-300"
                          : "border-border-subtle bg-surface/60 text-text-muted hover:text-text-main"
                      )}
                    >
                      {combo.name}
                    </button>
                  );
                })}
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_48px_minmax(0,1fr)_48px_minmax(0,1fr)_48px_minmax(0,1fr)] items-stretch gap-1 md:gap-0">
              <FlowNode
                step="01"
                eyebrow="YÊU CẦU"
                title={selectedCombo.name}
                subtitle={strategyInfo.label}
                icon="layers"
                status="standby"
                badge="COMBO"
                highlighted={isHighlighted(0)}
                dimmed={isDimmed(0)}
                onHoverStart={() => setHoveredIndex(0)}
                onHoverEnd={() => setHoveredIndex(null)}
                footer={
                  <div className="flex items-center justify-between gap-2 w-full">
                    <span className="text-text-subtle truncate">Tên gọi API</span>
                    <button
                      type="button"
                      data-cursor-target="true"
                      onClick={() => {
                        playHudSound("click");
                        onCopy?.(selectedCombo.name, `combo-flow-${selectedCombo.id}`);
                      }}
                      className="inline-flex items-center gap-1 font-semibold text-cyan-600 dark:text-cyan-400 hover:underline cursor-pointer whitespace-nowrap shrink-0"
                    >
                      <span className="material-symbols-outlined text-[13px]">
                        {copied === `combo-flow-${selectedCombo.id}` ? "check" : "content_copy"}
                      </span>
                      <span>
                        {copied === `combo-flow-${selectedCombo.id}` ? "Đã chép" : "Chép tên"}
                      </span>
                    </button>
                  </div>
                }
              />

              <FlowBeam
                compact
                active={models.length > 0}
                highlighted={hoveredIndex === 0 || hoveredIndex === 1}
                dimmed={hoveredIndex !== null && hoveredIndex > 2}
                accent={models.length > 0 ? "emerald" : "amber"}
                label="chính"
              />

              <FlowNode
                step="02"
                eyebrow="ƯU TIÊN #1"
                title={models[0] ? primary.name : "Chưa có model"}
                subtitle={models[0] ? `Provider: ${primary.prefix}` : "Cần thêm ít nhất 1 model"}
                icon="bolt"
                status={models[0] ? "live" : "warning"}
                badge="#1"
                highlighted={isHighlighted(1)}
                dimmed={isDimmed(1)}
                onHoverStart={() => setHoveredIndex(1)}
                onHoverEnd={() => setHoveredIndex(null)}
                footer={
                  <span className="text-text-subtle truncate">
                    {models[0] ? "Tiếp nhận yêu cầu đầu tiên" : "Nhấp chỉnh sửa để thêm"}
                  </span>
                }
              />

              <FlowBeam
                compact
                active={models.length > 1}
                highlighted={hoveredIndex === 1 || hoveredIndex === 2}
                dimmed={hoveredIndex !== null && (hoveredIndex < 1 || hoveredIndex > 3)}
                accent={models.length > 1 ? strategyInfo.accent : "cyan"}
                label={strategyInfo.beam}
              />

              <FlowNode
                step="03"
                eyebrow="DỰ PHÒNG #2"
                title={models[1] ? second.name : "+ Thêm dự phòng"}
                subtitle={models[1] ? `Provider: ${second.prefix}` : "Chưa cấu hình model #2"}
                icon={models[1] ? "alt_route" : "add_circle"}
                status={models[1] ? "standby" : "idle"}
                badge={models[1] ? "#2" : "TRỐNG"}
                highlighted={isHighlighted(2)}
                dimmed={isDimmed(2)}
                onHoverStart={() => setHoveredIndex(2)}
                onHoverEnd={() => setHoveredIndex(null)}
                onClick={() => {
                  playHudSound("click");
                  onEdit?.(selectedCombo);
                }}
                footer={
                  <span className="text-cyan-600 dark:text-cyan-400 font-semibold whitespace-nowrap">
                    {models[1] ? "Kích hoạt khi #1 lỗi/hết quota" : "Nhấp để thêm model #2"}
                  </span>
                }
              />

              <FlowBeam
                compact
                active={models.length > 2}
                highlighted={hoveredIndex === 2 || hoveredIndex === 3}
                dimmed={hoveredIndex !== null && hoveredIndex < 2}
                accent={models.length > 2 ? strategyInfo.accent : "cyan"}
                label={extraCount > 0 ? `+${extraCount}` : ""}
              />

              <FlowNode
                step="04"
                eyebrow="TẦNG CUỐI"
                title={models[2] ? third.name : "Mở rộng chuỗi"}
                subtitle={
                  models[2]
                    ? extraCount > 0
                      ? `${third.prefix} (+${extraCount} model nữa)`
                      : `Provider: ${third.prefix}`
                    : `${models.length} model trong chuỗi`
                }
                icon="shield"
                status={models[2] ? (strategyKey === "smart" || strategyKey === "fusion" ? "violet" : "standby") : "idle"}
                badge={extraCount > 0 ? `+${extraCount}` : models[2] ? "#3" : "SỬA"}
                highlighted={isHighlighted(3)}
                dimmed={isDimmed(3)}
                onHoverStart={() => setHoveredIndex(3)}
                onHoverEnd={() => setHoveredIndex(null)}
                footer={
                  <div className="flex items-center justify-between gap-2 w-full">
                    <span className="text-text-subtle truncate">Tuyến cuối</span>
                    <button
                      type="button"
                      data-cursor-target="true"
                      onClick={() => {
                        playHudSound("click");
                        onEdit?.(selectedCombo);
                      }}
                      className="inline-flex items-center gap-0.5 font-semibold text-cyan-600 dark:text-cyan-400 hover:underline cursor-pointer whitespace-nowrap shrink-0"
                    >
                      <span>Chỉnh sửa</span>
                      <span className="material-symbols-outlined text-[12px]">edit</span>
                    </button>
                  </div>
                }
              />
            </div>
          </div>
        );
      }}
    </FlowDeck>
  );
}
