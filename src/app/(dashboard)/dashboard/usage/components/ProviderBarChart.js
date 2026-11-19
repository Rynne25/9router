"use client";

import { useState, useMemo, useId } from "react";
import PropTypes from "prop-types";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import ProviderIcon from "@/shared/components/ProviderIcon";

const BAR_PALETTE = [
  { start: "#38bdf8", end: "#6366f1", solid: "#38bdf8" },
  { start: "#34d399", end: "#0d9488", solid: "#34d399" },
  { start: "#fbbf24", end: "#f97316", solid: "#fbbf24" },
  { start: "#c084fc", end: "#8b5cf6", solid: "#c084fc" },
  { start: "#f472b6", end: "#e11d48", solid: "#f472b6" },
  { start: "#22d3ee", end: "#0284c7", solid: "#22d3ee" },
];

const fmtTokens = (n) => {
  const val = Number(n) || 0;
  if (val >= 1_000_000_000) return `${(val / 1_000_000_000).toFixed(2)}B`;
  if (val >= 1_000_000) return `${(val / 1_000_000).toFixed(2)}M`;
  if (val >= 1_000) return `${(val / 1_000).toFixed(1)}K`;
  return String(Math.round(val));
};

const fmtRequests = (n) => new Intl.NumberFormat("en-US").format(Math.round(n || 0));

const truncate = (s, max = 14) => (s && s.length > max ? `${s.slice(0, max)}…` : s || "");

function GlassBarTooltip({ active, payload, viewMode }) {
  if (!active || !payload?.length) return null;
  const item = payload[0]?.payload;
  if (!item) return null;
  const fmt = viewMode === "tokens" ? fmtTokens : fmtRequests;

  return (
    <div className="liquid-glass-panel rounded-xl border border-border/80 px-3 py-2 text-xs shadow-2xl backdrop-blur-xl">
      <div className="mb-1 flex items-center gap-1.5 font-semibold text-text-main">
        <span className="size-2 rounded-full" style={{ backgroundColor: item.color }} />
        <span className="max-w-[190px] truncate">{item.fullName}</span>
      </div>
      <div className="flex items-center justify-between gap-4 text-text-muted">
        <span>{viewMode === "tokens" ? "Tokens" : "Requests"}:</span>
        <span className="font-mono font-semibold text-text-main tabular-nums">
          {fmt(item.value)} ({item.pct}%)
        </span>
      </div>
      <div className="mt-0.5 flex items-center justify-between gap-4 text-[11px] text-text-subtle">
        <span>{viewMode === "tokens" ? "Requests" : "Tokens"}:</span>
        <span className="font-mono tabular-nums">
          {viewMode === "tokens" ? fmtRequests(item.requests) : fmtTokens(item.tokens)}
        </span>
      </div>
    </div>
  );
}

GlassBarTooltip.propTypes = {
  active: PropTypes.bool,
  payload: PropTypes.array,
  viewMode: PropTypes.string,
};

export default function ProviderBarChart({ byProvider, byAccount }) {
  const [viewMode, setViewMode] = useState("tokens");
  const [scope, setScope] = useState("provider");
  const [activeIndex, setActiveIndex] = useState(null);
  const rawId = useId();
  const gradPrefix = `provBar-${rawId.replace(/:/g, "")}`;

  const hasAccounts = useMemo(
    () => byAccount && Object.keys(byAccount).length > 0,
    [byAccount]
  );

  const effectiveScope = scope === "account" && hasAccounts ? "account" : "provider";

  const chartData = useMemo(() => {
    let entries = [];

    if (effectiveScope === "account" && byAccount) {
      const accMap = {};
      for (const data of Object.values(byAccount)) {
        const name = data.accountName || `Account ${data.connectionId?.slice(0, 8) || "?"}`;
        if (!accMap[name]) {
          accMap[name] = {
            id: data.provider || name,
            fullName: name,
            providerId: data.provider || "",
            tokens: 0,
            requests: 0,
          };
        }
        accMap[name].tokens += (data.promptTokens || 0) + (data.completionTokens || 0);
        accMap[name].requests += data.requests || 0;
      }
      entries = Object.values(accMap);
    } else if (byProvider) {
      entries = Object.entries(byProvider).map(([id, data]) => ({
        id,
        fullName: id,
        providerId: id,
        tokens: (data.promptTokens || 0) + (data.completionTokens || 0),
        requests: data.requests || 0,
      }));
    }

    const sorted = entries
      .filter((d) => d[viewMode] > 0)
      .sort((a, b) => b[viewMode] - a[viewMode])
      .slice(0, 6);

    const total = sorted.reduce((acc, d) => acc + d[viewMode], 0);
    if (total === 0) return [];

    return sorted.map((d, idx) => {
      const palette = BAR_PALETTE[idx % BAR_PALETTE.length];
      return {
        ...d,
        shortName: truncate(d.fullName, 14),
        value: d[viewMode],
        pct: Math.max(0.1, Number(((d[viewMode] / total) * 100).toFixed(1))),
        color: palette.solid,
        gradStart: palette.start,
        gradEnd: palette.end,
        gradId: `${gradPrefix}-${idx}`,
      };
    });
  }, [byProvider, byAccount, effectiveScope, viewMode, gradPrefix]);

  const fmt = viewMode === "tokens" ? fmtTokens : fmtRequests;

  return (
    <div className="liquid-glass-card flex min-w-0 flex-col gap-4 overflow-hidden rounded-2xl p-4 sm:p-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="flex size-7 items-center justify-center rounded-lg bg-teal-500/12 text-teal-400 border border-teal-500/20">
            <span className="material-symbols-outlined text-[16px]">
              {effectiveScope === "account" ? "manage_accounts" : "hub"}
            </span>
          </span>
          <div className="min-w-0">
            <h3 className="truncate text-sm font-bold tracking-tight text-text-main">
              {effectiveScope === "account" ? "Phân bổ theo Tài khoản" : "Phân bổ Nhà cung cấp"}
            </h3>
            <p className="text-[11px] text-text-muted">
              {effectiveScope === "account" ? "Top tài khoản xử lý lưu lượng" : "Tỷ trọng điều phối giữa các provider"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {hasAccounts && (
            <div className="flex items-center rounded-xl border border-border/80 bg-surface-2/60 p-0.5 backdrop-blur-md">
              <button
                onClick={() => {
                  setScope("provider");
                  setActiveIndex(null);
                }}
                className={`rounded-lg px-2 py-1 text-[11px] font-semibold transition-all ${
                  effectiveScope === "provider"
                    ? "bg-surface-3 text-text-main shadow-sm"
                    : "text-text-muted hover:text-text-main"
                }`}
              >
                Provider
              </button>
              <button
                onClick={() => {
                  setScope("account");
                  setActiveIndex(null);
                }}
                className={`rounded-lg px-2 py-1 text-[11px] font-semibold transition-all ${
                  effectiveScope === "account"
                    ? "bg-surface-3 text-text-main shadow-sm"
                    : "text-text-muted hover:text-text-main"
                }`}
              >
                Tài khoản
              </button>
            </div>
          )}

          <div className="flex items-center rounded-xl border border-border/80 bg-surface-2/60 p-0.5 backdrop-blur-md">
            {[
              { value: "tokens", label: "Tokens" },
              { value: "requests", label: "Reqs" },
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
      </div>

      {!chartData.length ? (
        <div className="flex h-48 flex-col items-center justify-center gap-2 text-text-muted">
          <span className="material-symbols-outlined text-[32px] opacity-40">bar_chart</span>
          <span className="text-xs font-medium">Chưa có dữ liệu nhà cung cấp</span>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {/* Horizontal Gradient Bar Chart */}
          <div className="h-[168px] w-full min-w-0">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={chartData}
                layout="vertical"
                margin={{ top: 2, right: 16, left: 0, bottom: 2 }}
                barCategoryGap="24%"
              >
                <defs>
                  {chartData.map((d) => (
                    <linearGradient key={d.gradId} id={d.gradId} x1="0" y1="0" x2="1" y2="0">
                      <stop offset="0%" stopColor={d.gradStart} stopOpacity={0.95} />
                      <stop offset="100%" stopColor={d.gradEnd} stopOpacity={0.85} />
                    </linearGradient>
                  ))}
                </defs>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="currentColor"
                  strokeOpacity={0.07}
                  horizontal={false}
                />
                <XAxis
                  type="number"
                  tick={{ fontSize: 10, fill: "currentColor", fillOpacity: 0.55 }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={fmt}
                />
                <YAxis
                  type="category"
                  dataKey="shortName"
                  tick={{ fontSize: 11, fill: "currentColor", fillOpacity: 0.8 }}
                  tickLine={false}
                  axisLine={false}
                  width={94}
                />
                <Tooltip
                  cursor={{ fill: "currentColor", fillOpacity: 0.05 }}
                  content={<GlassBarTooltip viewMode={viewMode} />}
                />
                <Bar
                  dataKey="value"
                  radius={[0, 8, 8, 0]}
                  maxBarSize={18}
                  onMouseEnter={(_, idx) => setActiveIndex(idx)}
                  onMouseLeave={() => setActiveIndex(null)}
                >
                  {chartData.map((d, idx) => (
                    <Cell
                      key={d.fullName}
                      fill={`url(#${d.gradId})`}
                      fillOpacity={activeIndex === null || activeIndex === idx ? 1 : 0.35}
                      className="cursor-pointer transition-opacity duration-200"
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Interactive Legend Chips */}
          <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-border-subtle">
            {chartData.map((item, idx) => {
              const isHighlighted = activeIndex === idx;
              return (
                <button
                  key={item.fullName}
                  type="button"
                  onMouseEnter={() => setActiveIndex(idx)}
                  onMouseLeave={() => setActiveIndex(null)}
                  className={`inline-flex items-center gap-1.5 rounded-lg border px-2 py-1 text-[11px] transition-all ${
                    isHighlighted
                      ? "border-primary/40 bg-surface-2 text-text-main shadow-sm"
                      : "border-border-subtle bg-surface-2/40 text-text-muted hover:border-border hover:text-text-main"
                  }`}
                >
                  {effectiveScope === "provider" ? (
                    <ProviderIcon
                      providerId={item.providerId}
                      alt={item.fullName}
                      size={14}
                      className="rounded-sm object-contain"
                      fallbackText={item.fullName.slice(0, 1).toUpperCase()}
                      fallbackColor={item.color}
                    />
                  ) : (
                    <span
                      className="size-2 rounded-full shrink-0"
                      style={{ backgroundColor: item.color }}
                    />
                  )}
                  <span className="max-w-[100px] truncate font-medium">{item.fullName}</span>
                  <span className="font-mono text-[10px] font-semibold text-text-main tabular-nums">
                    {item.pct}%
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

ProviderBarChart.propTypes = {
  byProvider: PropTypes.object,
  byAccount: PropTypes.object,
};
