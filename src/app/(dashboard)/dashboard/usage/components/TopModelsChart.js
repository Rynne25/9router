"use client";

import { useState, useMemo } from "react";
import PropTypes from "prop-types";
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

const PALETTE = [
  { fill: "#818cf8", gradient: "from-indigo-400 to-violet-500", bg: "bg-indigo-500/15", text: "text-indigo-400" },
  { fill: "#2dd4bf", gradient: "from-teal-400 to-emerald-500", bg: "bg-teal-500/15", text: "text-teal-400" },
  { fill: "#fbbf24", gradient: "from-amber-400 to-orange-500", bg: "bg-amber-500/15", text: "text-amber-400" },
  { fill: "#f472b6", gradient: "from-pink-400 to-rose-500", bg: "bg-pink-500/15", text: "text-pink-400" },
  { fill: "#38bdf8", gradient: "from-sky-400 to-blue-500", bg: "bg-sky-500/15", text: "text-sky-400" },
  { fill: "#a78bfa", gradient: "from-purple-400 to-fuchsia-500", bg: "bg-purple-500/15", text: "text-purple-400" },
];

const fmtTokens = (n) => {
  const val = Number(n) || 0;
  if (val >= 1_000_000_000) return `${(val / 1_000_000_000).toFixed(2)}B`;
  if (val >= 1_000_000) return `${(val / 1_000_000).toFixed(2)}M`;
  if (val >= 1_000) return `${(val / 1_000).toFixed(1)}K`;
  return String(Math.round(val));
};

const fmtRequests = (n) => new Intl.NumberFormat("en-US").format(Math.round(n || 0));

function DonutTooltip({ active, payload, viewMode }) {
  if (!active || !payload?.length) return null;
  const item = payload[0]?.payload;
  if (!item) return null;
  const fmt = viewMode === "tokens" ? fmtTokens : fmtRequests;

  return (
    <div className="liquid-glass-panel rounded-xl border border-border/80 px-3 py-2 text-xs shadow-2xl backdrop-blur-xl">
      <div className="mb-1 flex items-center gap-1.5 font-semibold text-text-main">
        <span className="size-2 rounded-full" style={{ backgroundColor: item.color }} />
        <span className="max-w-[180px] truncate font-mono">{item.fullName}</span>
      </div>
      <div className="flex items-center justify-between gap-4 text-text-muted">
        <span>{viewMode === "tokens" ? "Tokens" : "Requests"}:</span>
        <span className="font-mono font-semibold text-text-main tabular-nums">
          {fmt(item.value)} ({item.pct}%)
        </span>
      </div>
      {item.provider && (
        <div className="mt-0.5 text-[10px] text-text-subtle">
          Provider: {item.provider}
        </div>
      )}
    </div>
  );
}

DonutTooltip.propTypes = {
  active: PropTypes.bool,
  payload: PropTypes.array,
  viewMode: PropTypes.string,
};

export default function TopModelsChart({ byModel }) {
  const [viewMode, setViewMode] = useState("tokens");
  const [activeIndex, setActiveIndex] = useState(null);

  const { chartData, totalValue } = useMemo(() => {
    if (!byModel) return { chartData: [], totalValue: 0 };

    // Aggregate by rawModel across providers so identical models don't duplicate
    const merged = {};
    for (const data of Object.values(byModel)) {
      const key = data.rawModel || "Unknown";
      if (!merged[key]) {
        merged[key] = {
          fullName: key,
          provider: data.provider || "",
          tokens: 0,
          requests: 0,
        };
      }
      merged[key].tokens += (data.promptTokens || 0) + (data.completionTokens || 0);
      merged[key].requests += data.requests || 0;
    }

    const sorted = Object.values(merged)
      .filter((d) => d[viewMode] > 0)
      .sort((a, b) => b[viewMode] - a[viewMode]);

    const total = sorted.reduce((acc, d) => acc + d[viewMode], 0);
    if (total === 0) return { chartData: [], totalValue: 0 };

    const top = sorted.slice(0, 5);
    const rest = sorted.slice(5);
    if (rest.length > 0) {
      top.push({
        fullName: `Khác (${rest.length} model)`,
        provider: "Nhiều nhà cung cấp",
        tokens: rest.reduce((acc, d) => acc + d.tokens, 0),
        requests: rest.reduce((acc, d) => acc + d.requests, 0),
      });
    }

    const items = top.map((item, idx) => {
      const val = item[viewMode];
      const palette = PALETTE[idx % PALETTE.length];
      return {
        ...item,
        value: val,
        pct: Math.max(0.1, Number(((val / total) * 100).toFixed(1))),
        color: palette.fill,
        gradient: palette.gradient,
      };
    });

    return { chartData: items, totalValue: total };
  }, [byModel, viewMode]);

  const fmt = viewMode === "tokens" ? fmtTokens : fmtRequests;
  const activeItem = activeIndex !== null ? chartData[activeIndex] : null;

  return (
    <div className="liquid-glass-card flex min-w-0 flex-col gap-4 overflow-hidden rounded-2xl p-4 sm:p-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="flex size-7 items-center justify-center rounded-lg bg-indigo-500/12 text-indigo-400 border border-indigo-500/20">
            <span className="material-symbols-outlined text-[16px]">deployed_code</span>
          </span>
          <div className="min-w-0">
            <h3 className="truncate text-sm font-bold tracking-tight text-text-main">
              Phân bổ theo Model
            </h3>
            <p className="text-[11px] text-text-muted">Top model tiêu thụ nhiều nhất</p>
          </div>
        </div>

        <div className="flex items-center rounded-xl border border-border/80 bg-surface-2/60 p-0.5 backdrop-blur-md shrink-0">
          {[
            { value: "tokens", label: "Tokens" },
            { value: "requests", label: "Requests" },
          ].map((m) => (
            <button
              key={m.value}
              onClick={() => {
                setViewMode(m.value);
                setActiveIndex(null);
              }}
              className={`rounded-lg px-2.5 py-1 text-[11px] font-semibold transition-all ${
                viewMode === m.value
                  ? "bg-primary text-white shadow-sm shadow-primary/20"
                  : "text-text-muted hover:text-text-main"
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      {!chartData.length ? (
        <div className="flex h-48 flex-col items-center justify-center gap-2 text-text-muted">
          <span className="material-symbols-outlined text-[32px] opacity-40">donut_large</span>
          <span className="text-xs font-medium">Chưa có dữ liệu phân bổ model</span>
        </div>
      ) : (
        <div className="grid grid-cols-1 items-center gap-4 sm:grid-cols-[164px_minmax(0,1fr)]">
          {/* Interactive Donut Chart */}
          <div className="relative mx-auto h-[164px] w-[164px] shrink-0">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={chartData}
                  dataKey="value"
                  nameKey="fullName"
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={72}
                  paddingAngle={3}
                  cornerRadius={6}
                  stroke="none"
                  onMouseEnter={(_, idx) => setActiveIndex(idx)}
                  onMouseLeave={() => setActiveIndex(null)}
                >
                  {chartData.map((entry, idx) => (
                    <Cell
                      key={entry.fullName}
                      fill={entry.color}
                      fillOpacity={activeIndex === null || activeIndex === idx ? 0.92 : 0.28}
                      className="cursor-pointer transition-opacity duration-200 outline-none"
                    />
                  ))}
                </Pie>
                <Tooltip content={<DonutTooltip viewMode={viewMode} />} />
              </PieChart>
            </ResponsiveContainer>

            {/* Center Telemetry Readout */}
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center px-3">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-text-muted truncate max-w-[90px]">
                {activeItem ? `${activeItem.pct}%` : viewMode === "tokens" ? "Tổng Token" : "Tổng Req"}
              </span>
              <span className="text-base font-extrabold tracking-tight text-text-main tabular-nums">
                {fmt(activeItem ? activeItem.value : totalValue)}
              </span>
            </div>
          </div>

          {/* Interactive Ranked Progress Bars */}
          <div className="flex min-w-0 flex-col gap-2.5">
            {chartData.map((item, idx) => {
              const isHighlighted = activeIndex === idx;
              const isDimmed = activeIndex !== null && !isHighlighted;
              return (
                <div
                  key={item.fullName}
                  onMouseEnter={() => setActiveIndex(idx)}
                  onMouseLeave={() => setActiveIndex(null)}
                  className={`group flex flex-col gap-1 rounded-xl px-2 py-1 transition-all duration-150 cursor-pointer ${
                    isHighlighted ? "bg-surface-2/80" : "hover:bg-surface-2/50"
                  } ${isDimmed ? "opacity-50" : "opacity-100"}`}
                >
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <div className="flex min-w-0 items-center gap-2">
                      <span
                        className="size-2 shrink-0 rounded-full"
                        style={{ backgroundColor: item.color }}
                      />
                      <span
                        className="truncate font-mono text-[11px] font-semibold text-text-main"
                        title={item.fullName}
                      >
                        {item.fullName}
                      </span>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5 font-mono text-[11px] tabular-nums">
                      <span className="font-semibold text-text-main">{fmt(item.value)}</span>
                      <span className="w-10 text-right text-[10px] text-text-muted">
                        {item.pct}%
                      </span>
                    </div>
                  </div>
                  <div className="liquid-glass-tube h-1.5 w-full">
                    <div
                      className={`h-full rounded-full bg-gradient-to-r ${item.gradient} transition-all duration-300`}
                      style={{ width: `${Math.max(4, item.pct)}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

TopModelsChart.propTypes = {
  byModel: PropTypes.object,
};
