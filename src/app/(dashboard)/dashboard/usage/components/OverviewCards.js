"use client";

import { useId, useMemo } from "react";
import PropTypes from "prop-types";

const fmtFull = (n) => new Intl.NumberFormat("en-US").format(Math.round(n || 0));

const fmtCompact = (n) => {
  const val = Number(n) || 0;
  if (val >= 1_000_000_000) return `${(val / 1_000_000_000).toFixed(2)}B`;
  if (val >= 1_000_000) return `${(val / 1_000_000).toFixed(2)}M`;
  if (val >= 1_000) return `${(val / 1_000).toFixed(1)}K`;
  return fmtFull(val);
};

const fmtCost = (n) => {
  const val = Number(n) || 0;
  if (val >= 100) return `$${val.toFixed(1)}`;
  if (val > 0 && val < 0.01) return `$${val.toFixed(4)}`;
  return `$${val.toFixed(2)}`;
};

const fmtLatency = (ms) => {
  if (ms === null || ms === undefined || Number.isNaN(ms)) return "—";
  if (ms >= 1000) return `${(ms / 1000).toFixed(2)}s`;
  return `${Math.round(ms)}ms`;
};

function computeTrendPct(series) {
  if (!Array.isArray(series) || series.length < 4) return null;
  const mid = Math.floor(series.length / 2);
  const firstHalf = series.slice(0, mid).reduce((a, b) => a + (Number(b) || 0), 0);
  const secondHalf = series.slice(mid).reduce((a, b) => a + (Number(b) || 0), 0);
  if (firstHalf === 0 && secondHalf === 0) return 0;
  if (firstHalf === 0) return 100;
  return Math.round(((secondHalf - firstHalf) / firstHalf) * 100);
}

function MiniSparkline({ values = [], color = "#38bdf8", height = 34, width = 92 }) {
  const rawId = useId();
  const gradId = `spark-${rawId.replace(/:/g, "")}`;

  const { linePath, areaPath, lastPoint, hasSignal } = useMemo(() => {
    const clean = (values || []).map((v) => (Number.isFinite(Number(v)) ? Number(v) : 0));
    const points = clean.length >= 2 ? clean : [0, 0, 0, 0, 0];
    const max = Math.max(...points);
    const min = Math.min(...points);
    const hasData = max > 0;
    const range = max - min || 1;
    const padY = 4;
    const drawH = height - padY * 2;
    const stepX = width / Math.max(points.length - 1, 1);

    const coords = points.map((val, i) => {
      const x = i * stepX;
      const y = hasData
        ? padY + drawH - ((val - min) / range) * drawH
        : height - padY - 2;
      return { x, y };
    });

    // Smooth cubic bezier path
    let d = `M ${coords[0].x.toFixed(1)} ${coords[0].y.toFixed(1)}`;
    for (let i = 1; i < coords.length; i++) {
      const prev = coords[i - 1];
      const curr = coords[i];
      const cx = ((prev.x + curr.x) / 2).toFixed(1);
      d += ` C ${cx} ${prev.y.toFixed(1)}, ${cx} ${curr.y.toFixed(1)}, ${curr.x.toFixed(1)} ${curr.y.toFixed(1)}`;
    }

    const last = coords[coords.length - 1];
    const area = `${d} L ${last.x.toFixed(1)} ${height} L ${coords[0].x.toFixed(1)} ${height} Z`;

    return { linePath: d, areaPath: area, lastPoint: last, hasSignal: hasData };
  }, [values, height, width]);

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className="overflow-visible shrink-0"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={hasSignal ? 0.34 : 0.12} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={areaPath} fill={`url(#${gradId})`} />
      <path
        d={linePath}
        fill="none"
        stroke={color}
        strokeWidth={hasSignal ? 2 : 1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeOpacity={hasSignal ? 0.95 : 0.35}
        strokeDasharray={hasSignal ? undefined : "3 3"}
      />
      {hasSignal && (
        <circle
          cx={lastPoint.x}
          cy={lastPoint.y}
          r={2.8}
          fill={color}
          className="drop-shadow-[0_0_6px_currentColor]"
        />
      )}
    </svg>
  );
}

MiniSparkline.propTypes = {
  values: PropTypes.arrayOf(PropTypes.number),
  color: PropTypes.string,
  height: PropTypes.number,
  width: PropTypes.number,
};

function TrendBadge({ pct, invert = false }) {
  if (pct === null || pct === undefined) return null;
  const isNeutral = pct === 0;
  const isPositive = invert ? pct < 0 : pct > 0;
  const cls = isNeutral
    ? "bg-surface-2/80 text-text-muted border-border-subtle"
    : isPositive
      ? "bg-emerald-500/12 text-emerald-500 dark:text-emerald-400 border-emerald-500/25"
      : "bg-rose-500/12 text-rose-500 dark:text-rose-400 border-rose-500/25";
  const icon = isNeutral ? "remove" : pct > 0 ? "trending_up" : "trending_down";

  return (
    <span className={`inline-flex items-center gap-0.5 rounded-full border px-1.5 py-0.5 text-[10px] font-semibold tabular-nums ${cls}`}>
      <span className="material-symbols-outlined text-[12px]">{icon}</span>
      {pct > 0 ? `+${pct}%` : `${pct}%`}
    </span>
  );
}

TrendBadge.propTypes = {
  pct: PropTypes.number,
  invert: PropTypes.bool,
};

export default function OverviewCards({ stats, telemetry }) {
  const {
    totalRequests = 0,
    totalPromptTokens = 0,
    totalCompletionTokens = 0,
    totalCachedTokens = 0,
    totalCost = 0,
    last10Minutes = [],
    activeRequests = [],
    recentRequests = [],
    errorProvider = "",
  } = stats || {};

  const totalTokens = totalPromptTokens + totalCompletionTokens;
  const activeCount = activeRequests.reduce((acc, r) => acc + (r.count || 1), 0);

  const reqSeries = useMemo(
    () => last10Minutes.map((b) => b.requests || 0),
    [last10Minutes]
  );
  const tokenSeries = useMemo(
    () => last10Minutes.map((b) => (b.promptTokens || 0) + (b.completionTokens || 0)),
    [last10Minutes]
  );
  const costSeries = useMemo(
    () => last10Minutes.map((b) => b.cost || 0),
    [last10Minutes]
  );

  // Success rate: prefer telemetry from request-details, fallback to recentRequests
  const successRate = useMemo(() => {
    if (telemetry?.successRate !== null && telemetry?.successRate !== undefined) {
      return telemetry.successRate;
    }
    if (!recentRequests.length) return totalRequests > 0 ? 100 : null;
    const okCount = recentRequests.filter(
      (r) => !r.status || r.status === "ok" || r.status === "success"
    ).length;
    return Number(((okCount / recentRequests.length) * 100).toFixed(1));
  }, [telemetry, recentRequests, totalRequests]);

  const successSeries = useMemo(() => {
    if (telemetry?.statusSeries?.length >= 2) return telemetry.statusSeries;
    if (!recentRequests.length) return [100, 100, 100, 100, 100];
    return recentRequests
      .slice(0, 12)
      .reverse()
      .map((r) => (!r.status || r.status === "ok" || r.status === "success" ? 100 : 20));
  }, [telemetry, recentRequests]);

  const avgLatencyMs = telemetry?.avgLatencyMs ?? null;
  const avgTtftMs = telemetry?.avgTtftMs ?? null;
  const latencySeries = useMemo(
    () => (telemetry?.latencySeries?.length ? telemetry.latencySeries : []),
    [telemetry]
  );

  const reqTrend = useMemo(() => computeTrendPct(reqSeries), [reqSeries]);
  const tokenTrend = useMemo(() => computeTrendPct(tokenSeries), [tokenSeries]);
  const cacheHitPct = totalPromptTokens > 0
    ? Math.min(100, Math.round((totalCachedTokens / totalPromptTokens) * 100))
    : 0;

  const isHealthy = (successRate === null || successRate >= 98) && !errorProvider;
  const latencyLabel = avgLatencyMs === null
    ? "Đang đo"
    : avgLatencyMs < 600
      ? "Rất nhanh"
      : avgLatencyMs < 1800
        ? "Ổn định"
        : "Độ trễ cao";
  const latencyBadgeCls = avgLatencyMs === null
    ? "bg-surface-2/80 text-text-muted border-border-subtle"
    : avgLatencyMs < 600
      ? "bg-emerald-500/12 text-emerald-500 dark:text-emerald-400 border-emerald-500/25"
      : avgLatencyMs < 1800
        ? "bg-amber-500/12 text-amber-500 dark:text-amber-400 border-amber-500/25"
        : "bg-rose-500/12 text-rose-500 dark:text-rose-400 border-rose-500/25";

  return (
    <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
      {/* 1. Total Requests */}
      <div className="liquid-glass-card group relative flex min-w-0 flex-col justify-between gap-3 overflow-hidden rounded-2xl p-4 transition-all duration-200 hover:-translate-y-0.5 hover:border-sky-400/35">
        <div className="pointer-events-none absolute -right-6 -top-6 size-24 rounded-full bg-sky-500/10 blur-2xl transition-opacity group-hover:opacity-100 opacity-70" />
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">
            Tổng Requests
          </span>
          <span className="flex size-8 items-center justify-center rounded-xl bg-sky-500/12 text-sky-500 dark:text-sky-400 border border-sky-500/20">
            <span className="material-symbols-outlined text-[18px]">swap_horiz</span>
          </span>
        </div>

        <div className="flex items-end justify-between gap-2">
          <div className="min-w-0">
            <div
              className="truncate text-2xl font-extrabold tracking-tight text-text-main tabular-nums"
              title={fmtFull(totalRequests)}
            >
              {fmtCompact(totalRequests)}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              {activeCount > 0 ? (
                <span className="inline-flex items-center gap-1 rounded-full border border-sky-500/30 bg-sky-500/12 px-1.5 py-0.5 text-[10px] font-semibold text-sky-400">
                  <span className="size-1.5 rounded-full bg-sky-400 animate-pulse" />
                  {activeCount} live
                </span>
              ) : (
                <TrendBadge pct={reqTrend} />
              )}
              <span className="text-[11px] text-text-muted">10p gần nhất</span>
            </div>
          </div>
          <MiniSparkline values={reqSeries} color="#38bdf8" />
        </div>
      </div>

      {/* 2. Total Tokens (In/Out + Cache) */}
      <div className="liquid-glass-card group relative flex min-w-0 flex-col justify-between gap-3 overflow-hidden rounded-2xl p-4 transition-all duration-200 hover:-translate-y-0.5 hover:border-indigo-400/35">
        <div className="pointer-events-none absolute -right-6 -top-6 size-24 rounded-full bg-indigo-500/12 blur-2xl transition-opacity group-hover:opacity-100 opacity-70" />
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">
            Tổng Tokens
          </span>
          <span className="flex size-8 items-center justify-center rounded-xl bg-indigo-500/12 text-indigo-500 dark:text-indigo-400 border border-indigo-500/20">
            <span className="material-symbols-outlined text-[18px]">token</span>
          </span>
        </div>

        <div className="flex items-end justify-between gap-2">
          <div className="min-w-0">
            <div
              className="truncate text-2xl font-extrabold tracking-tight text-text-main tabular-nums"
              title={`In: ${fmtFull(totalPromptTokens)} | Out: ${fmtFull(totalCompletionTokens)} | Cache: ${fmtFull(totalCachedTokens)}`}
            >
              {fmtCompact(totalTokens)}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] font-medium tabular-nums">
              <span className="text-indigo-500 dark:text-indigo-400" title={`Input: ${fmtFull(totalPromptTokens)}`}>
                ↑{fmtCompact(totalPromptTokens)}
              </span>
              <span className="text-text-subtle">/</span>
              <span className="text-emerald-500 dark:text-emerald-400" title={`Output: ${fmtFull(totalCompletionTokens)}`}>
                ↓{fmtCompact(totalCompletionTokens)}
              </span>
              {cacheHitPct > 0 && (
                <span
                  className="rounded-md bg-cyan-500/12 px-1 py-0.2 text-[10px] font-semibold text-cyan-500 dark:text-cyan-400"
                  title={`Cached: ${fmtFull(totalCachedTokens)} tokens`}
                >
                  {cacheHitPct}% cache
                </span>
              )}
              {cacheHitPct === 0 && <TrendBadge pct={tokenTrend} />}
            </div>
          </div>
          <MiniSparkline values={tokenSeries} color="#818cf8" />
        </div>
      </div>

      {/* 3. Success Rate */}
      <div className="liquid-glass-card group relative flex min-w-0 flex-col justify-between gap-3 overflow-hidden rounded-2xl p-4 transition-all duration-200 hover:-translate-y-0.5 hover:border-emerald-400/35">
        <div className="pointer-events-none absolute -right-6 -top-6 size-24 rounded-full bg-emerald-500/12 blur-2xl transition-opacity group-hover:opacity-100 opacity-70" />
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">
            Tỷ lệ thành công
          </span>
          <span className={`flex size-8 items-center justify-center rounded-xl border ${isHealthy ? "bg-emerald-500/12 text-emerald-500 dark:text-emerald-400 border-emerald-500/20" : "bg-amber-500/12 text-amber-500 dark:text-amber-400 border-amber-500/20"}`}>
            <span className="material-symbols-outlined text-[18px]">
              {isHealthy ? "verified" : "warning"}
            </span>
          </span>
        </div>

        <div className="flex items-end justify-between gap-2">
          <div className="min-w-0">
            <div className="truncate text-2xl font-extrabold tracking-tight text-text-main tabular-nums">
              {successRate !== null ? `${successRate}%` : "—"}
            </div>
            <div className="mt-1 flex items-center gap-1.5">
              <span
                className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-semibold ${
                  isHealthy
                    ? "border-emerald-500/25 bg-emerald-500/12 text-emerald-500 dark:text-emerald-400"
                    : "border-amber-500/25 bg-amber-500/12 text-amber-500 dark:text-amber-400"
                }`}
              >
                <span className={`size-1.5 rounded-full ${isHealthy ? "bg-emerald-400" : "bg-amber-400 animate-pulse"}`} />
                {errorProvider ? `Lỗi: ${errorProvider}` : isHealthy ? "Tối ưu" : "Suy giảm"}
              </span>
            </div>
          </div>
          <MiniSparkline values={successSeries} color={isHealthy ? "#34d399" : "#fbbf24"} />
        </div>
      </div>

      {/* 4. Average Latency */}
      <div className="liquid-glass-card group relative flex min-w-0 flex-col justify-between gap-3 overflow-hidden rounded-2xl p-4 transition-all duration-200 hover:-translate-y-0.5 hover:border-amber-400/35">
        <div className="pointer-events-none absolute -right-6 -top-6 size-24 rounded-full bg-amber-500/12 blur-2xl transition-opacity group-hover:opacity-100 opacity-70" />
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">
            Latency trung bình
          </span>
          <span className="flex size-8 items-center justify-center rounded-xl bg-amber-500/12 text-amber-500 dark:text-amber-400 border border-amber-500/20">
            <span className="material-symbols-outlined text-[18px]">speed</span>
          </span>
        </div>

        <div className="flex items-end justify-between gap-2">
          <div className="min-w-0">
            <div
              className="truncate text-2xl font-extrabold tracking-tight text-text-main tabular-nums"
              title={avgTtftMs ? `TTFT trung bình: ${Math.round(avgTtftMs)}ms` : "Thời gian phản hồi trung bình"}
            >
              {fmtLatency(avgLatencyMs)}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              <span className={`inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10px] font-semibold ${latencyBadgeCls}`}>
                {latencyLabel}
              </span>
              {avgTtftMs !== null && avgTtftMs > 0 && (
                <span className="text-[11px] text-text-muted tabular-nums">
                  TTFT {fmtLatency(avgTtftMs)}
                </span>
              )}
            </div>
          </div>
          <MiniSparkline values={latencySeries} color="#fbbf24" />
        </div>
      </div>

      {/* 5. Est. Cost Saved */}
      <div className="liquid-glass-card group relative flex min-w-0 flex-col justify-between gap-3 overflow-hidden rounded-2xl p-4 transition-all duration-200 hover:-translate-y-0.5 hover:border-brand-400/40 sm:col-span-2 lg:col-span-2 xl:col-span-1">
        <div className="pointer-events-none absolute -right-6 -top-6 size-24 rounded-full bg-brand-500/14 blur-2xl transition-opacity group-hover:opacity-100 opacity-75" />
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">
            Chi phí tiết kiệm
          </span>
          <span className="flex size-8 items-center justify-center rounded-xl bg-brand-500/14 text-primary border border-brand-500/25">
            <span className="material-symbols-outlined text-[18px]">savings</span>
          </span>
        </div>

        <div className="flex items-end justify-between gap-2">
          <div className="min-w-0">
            <div
              className="truncate text-2xl font-extrabold tracking-tight text-primary tabular-nums"
              title={`Giá trị API ước tính: ${fmtCost(totalCost)}`}
            >
              ~{fmtCost(totalCost)}
            </div>
            <div className="mt-1 flex items-center gap-1.5">
              <span className="truncate text-[11px] text-text-muted" title="Giá trị ước tính theo bảng giá API tiêu chuẩn">
                {totalCachedTokens > 0
                  ? `Cache ${fmtCompact(totalCachedTokens)} tok`
                  : "Ước tính giá API gốc"}
              </span>
            </div>
          </div>
          <MiniSparkline values={costSeries} color="#ff7654" />
        </div>
      </div>
    </div>
  );
}

OverviewCards.propTypes = {
  stats: PropTypes.object.isRequired,
  telemetry: PropTypes.shape({
    successRate: PropTypes.number,
    avgLatencyMs: PropTypes.number,
    avgTtftMs: PropTypes.number,
    latencySeries: PropTypes.arrayOf(PropTypes.number),
    statusSeries: PropTypes.arrayOf(PropTypes.number),
  }),
};
