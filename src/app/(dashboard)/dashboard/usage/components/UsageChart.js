"use client";

import { useState, useEffect, useMemo, useId } from "react";
import PropTypes from "prop-types";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

const fmtTokens = (n) => {
  const val = Number(n) || 0;
  if (val >= 1_000_000_000) return `${(val / 1_000_000_000).toFixed(2)}B`;
  if (val >= 1_000_000) return `${(val / 1_000_000).toFixed(2)}M`;
  if (val >= 1_000) return `${(val / 1_000).toFixed(1)}K`;
  return String(Math.round(val));
};

const fmtCost = (n) => {
  const val = Number(n) || 0;
  if (val >= 100) return `$${val.toFixed(1)}`;
  if (val > 0 && val < 0.01) return `$${val.toFixed(4)}`;
  return `$${val.toFixed(2)}`;
};

const fmtRequests = (n) => new Intl.NumberFormat("en-US").format(Math.round(n || 0));

const VIEW_MODES = [
  { value: "tokens", label: "Tokens", icon: "token", color: "#818cf8" },
  { value: "requests", label: "Requests", icon: "swap_horiz", color: "#2dd4bf" },
  { value: "cost", label: "Chi phí", icon: "attach_money", color: "#f59e0b" },
];

const VIEW_CONFIG = {
  tokens: {
    dataKey: "tokens",
    stroke: "#818cf8",
    color: "#6366f1",
    gradFrom: "#818cf8",
    gradTo: "#6366f1",
    formatter: fmtTokens,
    label: "Tokens",
    unit: "tokens",
  },
  requests: {
    dataKey: "requests",
    stroke: "#2dd4bf",
    color: "#14b8a6",
    gradFrom: "#2dd4bf",
    gradTo: "#0d9488",
    formatter: fmtRequests,
    label: "Requests",
    unit: "reqs",
  },
  cost: {
    dataKey: "cost",
    stroke: "#fbbf24",
    color: "#f59e0b",
    gradFrom: "#fbbf24",
    gradTo: "#d97706",
    formatter: fmtCost,
    label: "Chi phí ước tính",
    unit: "USD",
  },
};

function GlassTooltip({ active, payload, label, viewMode }) {
  if (!active || !payload || !payload.length) return null;
  const item = payload[0]?.payload || {};
  const activeCfg = VIEW_CONFIG[viewMode];

  return (
    <div className="liquid-glass-panel rounded-xl border border-border/80 px-3.5 py-2.5 shadow-2xl backdrop-blur-xl">
      <div className="mb-2 flex items-center justify-between gap-3 border-b border-border/50 pb-1.5 text-[11px] font-semibold text-text-muted">
        <span className="flex items-center gap-1 font-mono">
          <span className="material-symbols-outlined text-[14px]">schedule</span>
          {label || item.label || "Thời điểm"}
        </span>
      </div>

      <div className="flex flex-col gap-1.5 text-xs">
        <div className="flex items-center justify-between gap-4 font-semibold">
          <span className="flex items-center gap-1.5" style={{ color: activeCfg.stroke }}>
            <span className="size-2 rounded-full" style={{ backgroundColor: activeCfg.stroke }} />
            {activeCfg.label}:
          </span>
          <span className="font-mono text-text-main tabular-nums">
            {activeCfg.formatter(item[activeCfg.dataKey])}
          </span>
        </div>

        {viewMode !== "tokens" && item.tokens !== undefined && (
          <div className="flex items-center justify-between gap-4 text-[11px] text-text-muted">
            <span className="flex items-center gap-1.5">
              <span className="size-1.5 rounded-full bg-indigo-400/60" />
              Tokens:
            </span>
            <span className="font-mono tabular-nums text-text-subtle">
              {fmtTokens(item.tokens)}
            </span>
          </div>
        )}

        {viewMode !== "requests" && item.requests !== undefined && (
          <div className="flex items-center justify-between gap-4 text-[11px] text-text-muted">
            <span className="flex items-center gap-1.5">
              <span className="size-1.5 rounded-full bg-teal-400/60" />
              Requests:
            </span>
            <span className="font-mono tabular-nums text-text-subtle">
              {fmtRequests(item.requests)}
            </span>
          </div>
        )}

        {viewMode !== "cost" && item.cost !== undefined && item.cost > 0 && (
          <div className="flex items-center justify-between gap-4 text-[11px] text-text-muted">
            <span className="flex items-center gap-1.5">
              <span className="size-1.5 rounded-full bg-amber-400/60" />
              Chi phí:
            </span>
            <span className="font-mono tabular-nums text-text-subtle">
              {fmtCost(item.cost)}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

GlassTooltip.propTypes = {
  active: PropTypes.bool,
  payload: PropTypes.array,
  label: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  viewMode: PropTypes.string,
};

export default function UsageChart({ period = "7d" }) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState("tokens");
  const rawId = useId();
  const baseGradId = `chartGrad-${rawId.replace(/:/g, "")}`;

  useEffect(() => {
    let ignore = false;
    const fetchChart = async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/usage/chart?period=${period}`);
        if (!ignore && res.ok) {
          const json = await res.json();
          setData(Array.isArray(json) ? json : []);
        }
      } catch (err) {
        console.error("[UsageChart] fetch error:", err);
      } finally {
        if (!ignore) setLoading(false);
      }
    };

    fetchChart();
    return () => {
      ignore = true;
    };
  }, [period]);

  const cfg = VIEW_CONFIG[viewMode];
  const hasData = useMemo(
    () => Array.isArray(data) && data.some((d) => (d[cfg.dataKey] || 0) > 0),
    [data, cfg.dataKey]
  );

  const totalInPeriod = useMemo(() => {
    if (!Array.isArray(data)) return 0;
    return data.reduce((acc, d) => acc + (Number(d[cfg.dataKey]) || 0), 0);
  }, [data, cfg.dataKey]);

  const peakInPeriod = useMemo(() => {
    if (!Array.isArray(data) || !data.length) return 0;
    return Math.max(...data.map((d) => Number(d[cfg.dataKey]) || 0));
  }, [data, cfg.dataKey]);

  return (
    <div className="liquid-glass-card flex min-w-0 flex-col gap-4 overflow-hidden rounded-2xl p-4 sm:p-5">
      {/* Top Header Bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="flex size-7 items-center justify-center rounded-lg bg-primary/12 text-primary border border-primary/20">
              <span className="material-symbols-outlined text-[16px]">monitoring</span>
            </span>
            <h3 className="text-sm font-bold tracking-tight text-text-main sm:text-base">
              Lưu lượng & Xu hướng theo thời gian
            </h3>
          </div>
          <p className="mt-1 flex items-center gap-2 text-xs text-text-muted">
            <span>Tổng trong kỳ:</span>
            <span className="font-semibold text-text-main tabular-nums">
              {cfg.formatter(totalInPeriod)}
            </span>
            {peakInPeriod > 0 && (
              <>
                <span className="text-text-subtle">•</span>
                <span>Đỉnh điểm:</span>
                <span className="font-semibold text-text-subtle tabular-nums">
                  {cfg.formatter(peakInPeriod)}
                </span>
              </>
            )}
          </p>
        </div>

        {/* View Switcher Pills */}
        <div className="flex items-center rounded-xl border border-border/80 bg-surface-2/60 p-1 backdrop-blur-md">
          {VIEW_MODES.map((m) => {
            const isActive = viewMode === m.value;
            return (
              <button
                key={m.value}
                onClick={() => setViewMode(m.value)}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1 text-xs font-semibold transition-all duration-200 ${
                  isActive
                    ? "bg-primary text-white shadow-md shadow-primary/20"
                    : "text-text-muted hover:bg-surface-3/50 hover:text-text-main"
                }`}
              >
                <span className="material-symbols-outlined text-[14px]">{m.icon}</span>
                <span>{m.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Chart Canvas / States */}
      <div className="relative min-h-[240px] w-full min-w-0">
        {loading ? (
          <div className="flex h-60 w-full flex-col items-center justify-center gap-2 text-text-muted">
            <span className="material-symbols-outlined animate-spin text-[28px] text-primary">
              progress_activity
            </span>
            <span className="text-xs font-medium">Đang tải biểu đồ lưu lượng...</span>
          </div>
        ) : !hasData ? (
          <div className="flex h-60 w-full flex-col items-center justify-center gap-2 text-text-muted">
            <span className="material-symbols-outlined text-[36px] opacity-40">
              query_stats
            </span>
            <span className="text-xs font-medium">Chưa ghi nhận lưu lượng trong kỳ này</span>
          </div>
        ) : (
          <div className="h-60 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data} margin={{ top: 8, right: 12, left: -10, bottom: 0 }}>
                <defs>
                  <linearGradient id={baseGradId} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={cfg.gradFrom} stopOpacity={0.42} />
                    <stop offset="60%" stopColor={cfg.gradTo} stopOpacity={0.12} />
                    <stop offset="100%" stopColor={cfg.gradTo} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="currentColor"
                  strokeOpacity={0.07}
                  vertical={false}
                />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 10, fill: "currentColor", fillOpacity: 0.6 }}
                  tickLine={false}
                  axisLine={{ stroke: "currentColor", strokeOpacity: 0.1 }}
                  interval="preserveStartEnd"
                  dy={4}
                />
                <YAxis
                  tick={{ fontSize: 10, fill: "currentColor", fillOpacity: 0.6 }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={cfg.formatter}
                  width={48}
                  dx={-4}
                />
                <Tooltip
                  cursor={{ stroke: cfg.stroke, strokeWidth: 1.5, strokeDasharray: "3 3", strokeOpacity: 0.5 }}
                  content={<GlassTooltip viewMode={viewMode} />}
                />
                <Area
                  type="monotone"
                  dataKey={cfg.dataKey}
                  stroke={cfg.stroke}
                  strokeWidth={2.4}
                  fill={`url(#${baseGradId})`}
                  dot={false}
                  activeDot={{
                    r: 5,
                    fill: cfg.stroke,
                    stroke: "var(--color-bg)",
                    strokeWidth: 2,
                    className: "drop-shadow-[0_0_8px_currentColor]",
                  }}
                  isAnimationActive={true}
                  animationDuration={600}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  );
}

UsageChart.propTypes = {
  period: PropTypes.string,
};
