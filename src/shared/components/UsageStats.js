"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { FREE_PROVIDERS, AI_PROVIDERS } from "@/shared/constants/providers";
import { getCachedData, fetchWithCache, fetchJson } from "@/shared/utils/swrCache";
import { HudFrame, MagneticButton } from "@/shared/components/hud";
import Badge from "./Badge";
import OverviewCards from "@/app/(dashboard)/dashboard/usage/components/OverviewCards";
import UsageTable, { fmt, fmtTime } from "@/app/(dashboard)/dashboard/usage/components/UsageTable";
import dynamic from "next/dynamic";

// Keep providers without serviceKinds (default LLM) or with "llm" in serviceKinds
function isLLMProvider(id) {
  const p = AI_PROVIDERS[id];
  if (!p?.serviceKinds) return true;
  return p.serviceKinds.includes("llm");
}

function ChartSkeleton({ heightClass = "h-60" }) {
  return (
    <div className={`liquid-glass-card flex ${heightClass} min-w-0 items-center justify-center rounded-2xl p-5`}>
      <div className="flex flex-col items-center gap-2 text-text-muted">
        <span className="material-symbols-outlined animate-spin text-[24px] text-primary">
          progress_activity
        </span>
        <span className="text-xs font-medium">Đang tải biểu đồ...</span>
      </div>
    </div>
  );
}

// Lazy-load: keeps @xyflow/react and recharts out of the initial bundle
const ProviderTopology = dynamic(
  () => import("@/app/(dashboard)/dashboard/usage/components/ProviderTopology"),
  { ssr: false, loading: () => <ChartSkeleton heightClass="h-[460px]" /> }
);
const UsageChart = dynamic(
  () => import("@/app/(dashboard)/dashboard/usage/components/UsageChart"),
  { ssr: false, loading: () => <ChartSkeleton heightClass="h-[310px]" /> }
);
const ProviderBarChart = dynamic(
  () => import("@/app/(dashboard)/dashboard/usage/components/ProviderBarChart"),
  { ssr: false, loading: () => <ChartSkeleton heightClass="h-[280px]" /> }
);
const TopModelsChart = dynamic(
  () => import("@/app/(dashboard)/dashboard/usage/components/TopModelsChart"),
  { ssr: false, loading: () => <ChartSkeleton heightClass="h-[280px]" /> }
);

function KpiSkeletonGrid() {
  return (
    <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
      {Array.from({ length: 5 }).map((_, i) => (
        <div
          key={i}
          className="liquid-glass-card flex h-[116px] animate-pulse flex-col justify-between rounded-2xl p-4"
        >
          <div className="flex items-center justify-between">
            <div className="h-3 w-24 rounded bg-surface-3/80" />
            <div className="size-8 rounded-xl bg-surface-3/80" />
          </div>
          <div className="flex items-end justify-between">
            <div className="space-y-2">
              <div className="h-6 w-20 rounded bg-surface-3/80" />
              <div className="h-3 w-28 rounded bg-surface-3/60" />
            </div>
            <div className="h-8 w-20 rounded bg-surface-3/50" />
          </div>
        </div>
      ))}
    </div>
  );
}

function timeAgo(timestamp) {
  const diff = Math.max(0, Math.floor((Date.now() - new Date(timestamp)) / 1000));
  if (diff < 60) return `${diff}s`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86400)}d`;
}

// Auto-update time display without excessive per-row 1s timers
function TimeAgo({ timestamp }) {
  const [, setTick] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => setTick((t) => t + 1), 10000);
    return () => clearInterval(timer);
  }, []);

  return <>{timeAgo(timestamp)}</>;
}

function RecentRequests({ requests = [], activeCount = 0 }) {
  return (
    <HudFrame
      chamfer="md"
      accent="emerald"
      padding="none"
      spotlight={true}
      className="flex min-w-0 flex-col overflow-hidden [&>div:last-child]:h-full [&>div:last-child]:flex [&>div:last-child]:flex-col"
      style={{ height: 480 }}
    >
      <div className="flex h-full min-w-0 flex-col p-4">
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border-subtle pb-3">
          <div className="flex items-center gap-2">
            <span className="flex size-7 items-center justify-center rounded-lg bg-emerald-500/12 text-emerald-500 dark:text-emerald-400 border border-emerald-500/25">
              <span className="material-symbols-outlined text-[16px]">bolt</span>
            </span>
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-text-main">
                Luồng Requests trực tiếp
              </h3>
              <p className="text-[11px] text-text-muted">Cập nhật thời gian thực</p>
            </div>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-500 dark:text-emerald-400">
            <span className="size-1.5 rounded-full bg-emerald-400 animate-pulse" />
            {activeCount > 0 ? `${activeCount} đang chạy` : "LIVE"}
          </span>
        </div>

        {!requests.length ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 text-text-muted">
            <span className="material-symbols-outlined text-[30px] opacity-40">stream</span>
            <span className="text-xs font-medium">Chưa có request nào gần đây</span>
          </div>
        ) : (
          <div className="custom-scrollbar mt-2 flex-1 overflow-y-auto pr-1">
            <table className="w-full min-w-[270px] border-collapse text-xs">
              <thead className="sticky top-0 z-10 bg-bg/90 backdrop-blur-md">
                <tr className="border-b border-border-subtle text-[10px] uppercase tracking-wider text-text-muted">
                  <th className="w-3 py-2 text-left font-semibold" />
                  <th className="py-2 text-left font-semibold">Model</th>
                  <th className="py-2 text-right font-semibold whitespace-nowrap">Vào / Ra</th>
                  <th className="py-2 text-right font-semibold">Lúc</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle/70">
                {requests.map((r, i) => {
                  const ok = !r.status || r.status === "ok" || r.status === "success";
                  return (
                    <tr
                      key={`${r.timestamp}-${i}`}
                      className="transition-colors hover:bg-surface-2/60"
                    >
                      <td className="py-2">
                        <span
                          className={`block size-2 rounded-full ${
                            ok
                              ? "bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.6)]"
                              : "bg-rose-400 shadow-[0_0_6px_rgba(248,113,113,0.6)]"
                          }`}
                        />
                      </td>
                      <td className="py-2 pr-2">
                        <div
                          className="max-w-[130px] truncate font-mono text-[11px] font-medium text-text-main"
                          title={r.model}
                        >
                          {r.model}
                        </div>
                        {r.provider && (
                          <div className="text-[10px] text-text-subtle truncate max-w-[120px]">
                            {r.provider}
                          </div>
                        )}
                      </td>
                      <td className="py-2 text-right font-mono text-[11px] tabular-nums whitespace-nowrap">
                        <span className="text-indigo-500 dark:text-indigo-400">
                          {fmt(r.promptTokens)}↑
                        </span>{" "}
                        <span className="text-emerald-500 dark:text-emerald-400">
                          {fmt(r.completionTokens)}↓
                        </span>
                      </td>
                      <td className="py-2 pl-2 text-right font-mono text-[10px] text-text-muted tabular-nums whitespace-nowrap">
                        <TimeAgo timestamp={r.timestamp} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </HudFrame>
  );
}

function sortData(dataMap, pendingMap = {}, sortBy, sortOrder) {
  return Object.entries(dataMap || {})
    .map(([key, data]) => {
      const totalTokens = (data.promptTokens || 0) + (data.completionTokens || 0);
      const totalCost = data.cost || 0;
      // ponytail: cost split is a token-share allocation of the (rate-accurate)
      // server total, not a per-rate recompute. cached is a subset of prompt, so
      // peel it out of the input share. Upgrade to a stored per-component cost
      // breakdown if exact cached-rate cost display is needed.
      const cachedTokens = data.cachedTokens || 0;
      const nonCachedInput = Math.max(0, (data.promptTokens || 0) - cachedTokens);
      const inputCost = totalTokens > 0 ? nonCachedInput * (totalCost / totalTokens) : 0;
      const cachedCost = totalTokens > 0 ? cachedTokens * (totalCost / totalTokens) : 0;
      const outputCost = totalTokens > 0 ? (data.completionTokens || 0) * (totalCost / totalTokens) : 0;
      return { ...data, key, totalTokens, totalCost, inputCost, cachedCost, outputCost, pending: pendingMap[key] || 0 };
    })
    .sort((a, b) => {
      let valA = a[sortBy];
      let valB = b[sortBy];
      if (typeof valA === "string") valA = valA.toLowerCase();
      if (typeof valB === "string") valB = valB.toLowerCase();
      if (valA < valB) return sortOrder === "asc" ? -1 : 1;
      if (valA > valB) return sortOrder === "asc" ? 1 : -1;
      return 0;
    });
}

function getGroupKey(item, keyField) {
  switch (keyField) {
    case "rawModel":
      return item.rawModel || "Model không xác định";
    case "accountName":
      return item.accountName || (item.connectionId ? `Tài khoản ${item.connectionId.slice(0, 8)}...` : "Tài khoản không xác định");
    case "keyName":
      return item.apiKeyMasked ? `${item.keyName} (${item.apiKeyMasked})` : item.keyName || "Key không xác định";
    case "endpoint":
      return item.endpoint || "Endpoint không xác định";
    default:
      return item[keyField] || "Không xác định";
  }
}

function groupDataByKey(data, keyField) {
  if (!Array.isArray(data)) return [];
  const groups = {};
  data.forEach((item) => {
    const gk = getGroupKey(item, keyField);
    if (!groups[gk]) {
      groups[gk] = {
        groupKey: gk,
        summary: {
          requests: 0,
          promptTokens: 0,
          completionTokens: 0,
          cachedTokens: 0,
          totalTokens: 0,
          cost: 0,
          inputCost: 0,
          cachedCost: 0,
          outputCost: 0,
          lastUsed: null,
          pending: 0,
        },
        items: [],
      };
    }
    const s = groups[gk].summary;
    s.requests += item.requests || 0;
    s.promptTokens += item.promptTokens || 0;
    s.completionTokens += item.completionTokens || 0;
    s.cachedTokens += item.cachedTokens || 0;
    s.totalTokens += item.totalTokens || 0;
    s.cost += item.cost || 0;
    s.inputCost += item.inputCost || 0;
    s.cachedCost += item.cachedCost || 0;
    s.outputCost += item.outputCost || 0;
    s.pending += item.pending || 0;
    if (item.lastUsed && (!s.lastUsed || new Date(item.lastUsed) > new Date(s.lastUsed))) {
      s.lastUsed = item.lastUsed;
    }
    groups[gk].items.push(item);
  });
  return Object.values(groups);
}

const MODEL_COLUMNS = [
  { field: "rawModel", label: "Model" },
  { field: "provider", label: "Provider" },
  { field: "requests", label: "Requests", align: "right" },
  { field: "lastUsed", label: "Dùng gần nhất", align: "right" },
];

const ACCOUNT_COLUMNS = [
  { field: "rawModel", label: "Model" },
  { field: "provider", label: "Provider" },
  { field: "accountName", label: "Tài khoản" },
  { field: "requests", label: "Requests", align: "right" },
  { field: "lastUsed", label: "Dùng gần nhất", align: "right" },
];

const API_KEY_COLUMNS = [
  { field: "keyName", label: "Tên API Key" },
  { field: "rawModel", label: "Model" },
  { field: "provider", label: "Provider" },
  { field: "requests", label: "Requests", align: "right" },
  { field: "lastUsed", label: "Dùng gần nhất", align: "right" },
];

const ENDPOINT_COLUMNS = [
  { field: "endpoint", label: "Endpoint" },
  { field: "rawModel", label: "Model" },
  { field: "provider", label: "Provider" },
  { field: "requests", label: "Requests", align: "right" },
  { field: "lastUsed", label: "Dùng gần nhất", align: "right" },
];

const TABLE_OPTIONS = [
  { value: "model", label: "Theo Model", icon: "deployed_code" },
  { value: "account", label: "Theo Tài khoản", icon: "manage_accounts" },
  { value: "apiKey", label: "Theo API Key", icon: "key" },
  { value: "endpoint", label: "Theo Endpoint", icon: "api" },
];

const PERIODS = [
  { value: "today", label: "Hôm nay" },
  { value: "24h", label: "24h" },
  { value: "7d", label: "7 ngày" },
  { value: "30d", label: "30 ngày" },
  { value: "60d", label: "60 ngày" },
  { value: "all", label: "Tất cả" },
];

function computeTelemetrySummary(details = []) {
  if (!Array.isArray(details) || !details.length) return null;

  let okCount = 0;
  let latencySum = 0;
  let latencyCount = 0;
  let ttftSum = 0;
  let ttftCount = 0;

  const chronological = [...details].reverse();
  const latencySeries = [];
  const statusSeries = [];

  for (const d of chronological) {
    const isOk = !d.status || d.status === "success" || d.status === "ok" || Number(d.status) === 200;
    if (isOk) okCount++;
    statusSeries.push(isOk ? 100 : 20);

    const totalLat = Number(d.latency?.total);
    if (Number.isFinite(totalLat) && totalLat > 0) {
      latencySum += totalLat;
      latencyCount++;
      latencySeries.push(totalLat);
    }

    const ttft = Number(d.latency?.ttft);
    if (Number.isFinite(ttft) && ttft > 0) {
      ttftSum += ttft;
      ttftCount++;
    }
  }

  return {
    successRate: Number(((okCount / details.length) * 100).toFixed(1)),
    avgLatencyMs: latencyCount > 0 ? Math.round(latencySum / latencyCount) : null,
    avgTtftMs: ttftCount > 0 ? Math.round(ttftSum / ttftCount) : null,
    latencySeries: latencySeries.slice(-14),
    statusSeries: statusSeries.slice(-14),
  };
}

export default function UsageStats({ period: periodProp, setPeriod: setPeriodProp, hidePeriodSelector = false } = {}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const sortBy = searchParams.get("sortBy") || "rawModel";
  const sortOrder = searchParams.get("sortOrder") || "asc";

  const [tableView, setTableView] = useState("model");
  const [viewMode, setViewMode] = useState("costs");
  const [providers, setProviders] = useState([]);
  const [telemetry, setTelemetry] = useState(null);
  const [periodLocal, setPeriodLocal] = useState("today");
  const period = periodProp ?? periodLocal;
  const setPeriod = setPeriodProp ?? setPeriodLocal;
  const statsCacheKey = `/api/usage/stats?period=${period}`;
  const cachedStats = getCachedData(statsCacheKey);
  const [stats, setStats] = useState(() => cachedStats || null);
  const [loading, setLoading] = useState(() => cachedStats === undefined);
  const [fetching, setFetching] = useState(false);
  const isInitialLoad = useRef(cachedStats === undefined);
  const hasLoadedStats = useRef(cachedStats !== undefined);

  // Fetch connected providers once (cached via swrCache)
  useEffect(() => {
    let ignore = false;
    Promise.all([
      fetchWithCache("/api/providers", () => fetchJson("/api/providers"), { ttlMs: 30000 }).catch(() => null),
      fetchWithCache("/api/provider-nodes", () => fetchJson("/api/provider-nodes"), { ttlMs: 30000 }).catch(() => null),
    ])
      .then(([d, nodesData]) => {
        if (ignore) return;
        const nodeNameMap = {};
        for (const node of nodesData?.nodes || []) {
          nodeNameMap[node.id] = node.name;
        }
        const seen = new Set();
        const unique = (d?.connections || [])
          .filter((c) => {
            if (c.isActive === false) return false;
            if (!isLLMProvider(c.provider)) return false;
            if (AI_PROVIDERS[c.provider]?.hidden) return false;
            if (seen.has(c.provider)) return false;
            seen.add(c.provider);
            return true;
          })
          .map((c) => ({
            ...c,
            nodeName: nodeNameMap[c.provider] || null,
          }));
        const noAuthProviders = Object.values(FREE_PROVIDERS)
          .filter((p) => p.noAuth && !p.hidden && !seen.has(p.id) && isLLMProvider(p.id))
          .map((p) => ({ provider: p.id, name: p.name }));
        setProviders([...unique, ...noAuthProviders]);
      })
      .catch(() => {});
    return () => {
      ignore = true;
    };
  }, []);

  // Fetch recent request details sample for accurate avg latency & success rate
  useEffect(() => {
    let ignore = false;
    fetchWithCache(
      "/api/usage/request-details?page=1&pageSize=25",
      () => fetchJson("/api/usage/request-details?page=1&pageSize=25"),
      { ttlMs: 15000 }
    )
      .then((res) => {
        if (!ignore && res?.details) {
          setTelemetry(computeTelemetrySummary(res.details));
        }
      })
      .catch(() => {});
    return () => {
      ignore = true;
    };
  }, [period]);

  // Fetch filtered stats via REST when period changes (SWR cached per period)
  useEffect(() => {
    let ignore = false;
    const cached = getCachedData(statsCacheKey);
    queueMicrotask(() => {
      if (ignore) return;
      if (cached) {
        hasLoadedStats.current = true;
        isInitialLoad.current = false;
        setStats((prev) => ({ ...prev, ...cached }));
        setLoading(false);
        setFetching(true);
      } else if (isInitialLoad.current) {
        isInitialLoad.current = false;
        setLoading(true);
      } else {
        setFetching(true);
      }
    });

    fetchWithCache(statsCacheKey, () => fetchJson(statsCacheKey), { ttlMs: 10000 })
      .then((data) => {
        if (!ignore && data) {
          hasLoadedStats.current = true;
          setStats((prev) => ({ ...prev, ...data }));
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!ignore) {
          setLoading(false);
          setFetching(false);
        }
      });
    return () => {
      ignore = true;
    };
  }, [statsCacheKey]);

  // SSE connection - real-time updates for activeRequests + recentRequests only
  useEffect(() => {
    const es = new EventSource("/api/usage/stream");

    es.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        setStats((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            activeRequests: data.activeRequests,
            recentRequests: data.recentRequests,
            errorProvider: data.errorProvider,
            pending: data.pending,
          };
        });
        if (hasLoadedStats.current) setLoading(false);
      } catch (err) {
        console.error("[SSE CLIENT] parse error:", err);
      }
    };

    es.onerror = () => setLoading(false);

    return () => es.close();
  }, []);

  const toggleSort = useCallback(
    (tableType, field) => {
      const params = new URLSearchParams(searchParams.toString());
      if (params.get("sortBy") === field) {
        params.set("sortOrder", params.get("sortOrder") === "asc" ? "desc" : "asc");
      } else {
        params.set("sortBy", field);
        params.set("sortOrder", "asc");
      }
      router.replace(`?${params.toString()}`, { scroll: false });
    },
    [searchParams, router]
  );

  // Compute active table data
  const activeTableConfig = useMemo(() => {
    if (!stats) return null;
    switch (tableView) {
      case "model": {
        const pendingMap = stats.pending?.byModel || {};
        return {
          columns: MODEL_COLUMNS,
          groupedData: groupDataByKey(sortData(stats.byModel, pendingMap, sortBy, sortOrder), "rawModel"),
          storageKey: "usage-stats:expanded-models",
          emptyMessage: "Chưa có dữ liệu sử dụng model.",
          renderSummaryCells: (group) => (
            <>
              <td className="px-6 py-3 text-text-muted">—</td>
              <td className="px-6 py-3 text-right">{fmt(group.summary.requests)}</td>
              <td className="px-6 py-3 text-right text-text-muted whitespace-nowrap">{fmtTime(group.summary.lastUsed)}</td>
            </>
          ),
          renderDetailCells: (item) => (
            <>
              <td className={`px-6 py-3 font-medium transition-colors ${item.pending > 0 ? "text-primary" : ""}`}>{item.rawModel}</td>
              <td className="px-6 py-3"><Badge variant={item.pending > 0 ? "primary" : "neutral"} size="sm">{item.provider}</Badge></td>
              <td className="px-6 py-3 text-right">{fmt(item.requests)}</td>
              <td className="px-6 py-3 text-right text-text-muted whitespace-nowrap">{fmtTime(item.lastUsed)}</td>
            </>
          ),
        };
      }
      case "account": {
        const pendingMap = {};
        if (stats?.pending?.byAccount) {
          Object.entries(stats.byAccount || {}).forEach(([accountKey, data]) => {
            const connPending = stats.pending.byAccount[data.connectionId];
            if (connPending) {
              const modelKey = data.provider ? `${data.rawModel} (${data.provider})` : data.rawModel;
              pendingMap[accountKey] = connPending[modelKey] || 0;
            }
          });
        }
        return {
          columns: ACCOUNT_COLUMNS,
          groupedData: groupDataByKey(sortData(stats.byAccount, pendingMap, sortBy, sortOrder), "accountName"),
          storageKey: "usage-stats:expanded-accounts",
          emptyMessage: "Chưa có dữ liệu sử dụng theo tài khoản.",
          renderSummaryCells: (group) => (
            <>
              <td className="px-6 py-3 text-text-muted">—</td>
              <td className="px-6 py-3 text-text-muted">—</td>
              <td className="px-6 py-3 text-right">{fmt(group.summary.requests)}</td>
              <td className="px-6 py-3 text-right text-text-muted whitespace-nowrap">{fmtTime(group.summary.lastUsed)}</td>
            </>
          ),
          renderDetailCells: (item) => (
            <>
              <td className={`px-6 py-3 font-medium transition-colors ${item.pending > 0 ? "text-primary" : ""}`}>{item.accountName || (item.connectionId ? `Tài khoản ${item.connectionId.slice(0, 8)}...` : "Tài khoản không xác định")}</td>
              <td className={`px-6 py-3 font-medium transition-colors ${item.pending > 0 ? "text-primary" : ""}`}>{item.rawModel}</td>
              <td className="px-6 py-3"><Badge variant={item.pending > 0 ? "primary" : "neutral"} size="sm">{item.provider}</Badge></td>
              <td className="px-6 py-3 text-right">{fmt(item.requests)}</td>
              <td className="px-6 py-3 text-right text-text-muted whitespace-nowrap">{fmtTime(item.lastUsed)}</td>
            </>
          ),
        };
      }
      case "apiKey": {
        return {
          columns: API_KEY_COLUMNS,
          groupedData: groupDataByKey(sortData(stats.byApiKey, {}, sortBy, sortOrder), "keyName"),
          storageKey: "usage-stats:expanded-apikeys",
          emptyMessage: "Chưa có dữ liệu sử dụng theo API Key.",
          renderSummaryCells: (group) => (
            <>
              <td className="px-6 py-3 text-text-muted">—</td>
              <td className="px-6 py-3 text-text-muted">—</td>
              <td className="px-6 py-3 text-right">{fmt(group.summary.requests)}</td>
              <td className="px-6 py-3 text-right text-text-muted whitespace-nowrap">{fmtTime(group.summary.lastUsed)}</td>
            </>
          ),
          renderDetailCells: (item) => (
            <>
              <td className="px-6 py-3 font-medium font-mono text-xs">{item.apiKeyMasked || item.keyName}</td>
              <td className="px-6 py-3">{item.rawModel}</td>
              <td className="px-6 py-3"><Badge variant="neutral" size="sm">{item.provider}</Badge></td>
              <td className="px-6 py-3 text-right">{fmt(item.requests)}</td>
              <td className="px-6 py-3 text-right text-text-muted whitespace-nowrap">{fmtTime(item.lastUsed)}</td>
            </>
          ),
        };
      }
      case "endpoint":
      default: {
        return {
          columns: ENDPOINT_COLUMNS,
          groupedData: groupDataByKey(sortData(stats.byEndpoint, {}, sortBy, sortOrder), "endpoint"),
          storageKey: "usage-stats:expanded-endpoints",
          emptyMessage: "Chưa có dữ liệu sử dụng theo Endpoint.",
          renderSummaryCells: (group) => (
            <>
              <td className="px-6 py-3 text-text-muted">—</td>
              <td className="px-6 py-3 text-text-muted">—</td>
              <td className="px-6 py-3 text-right">{fmt(group.summary.requests)}</td>
              <td className="px-6 py-3 text-right text-text-muted whitespace-nowrap">{fmtTime(group.summary.lastUsed)}</td>
            </>
          ),
          renderDetailCells: (item) => (
            <>
              <td className="px-6 py-3 font-medium font-mono text-sm">{item.endpoint}</td>
              <td className="px-6 py-3">{item.rawModel}</td>
              <td className="px-6 py-3"><Badge variant="neutral" size="sm">{item.provider}</Badge></td>
              <td className="px-6 py-3 text-right">{fmt(item.requests)}</td>
              <td className="px-6 py-3 text-right text-text-muted whitespace-nowrap">{fmtTime(item.lastUsed)}</td>
            </>
          ),
        };
      }
    }
  }, [stats, tableView, sortBy, sortOrder]);

  if (!stats && !loading) {
    return (
      <HudFrame chamfer="md" accent="rose" padding="lg" spotlight={false}>
        <div className="flex flex-col items-center justify-center gap-2 py-4 text-text-muted">
          <span className="material-symbols-outlined text-[32px] text-rose-400">cloud_off</span>
          <span className="text-sm font-medium">Không thể tải dữ liệu thống kê sử dụng.</span>
        </div>
      </HudFrame>
    );
  }

  const activeCount = (stats?.activeRequests || []).reduce((acc, r) => acc + (r.count || 1), 0);

  return (
    <div className="flex min-w-0 flex-col gap-4 sm:gap-5">
      {/* Period selector (hidden when controlled by parent) */}
      {!hidePeriodSelector && (
        <div className="flex w-full items-center justify-end gap-2">
          {fetching && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border-subtle bg-surface-2/60 px-2.5 py-1 text-[11px] font-medium text-text-muted">
              <span className="material-symbols-outlined animate-spin text-[14px] text-primary">
                progress_activity
              </span>
              Đang đồng bộ...
            </span>
          )}
          <div className="grid flex-1 grid-cols-6 items-center gap-1 rounded-xl border border-border bg-surface-2/60 p-1 backdrop-blur-md sm:flex sm:flex-none">
            {PERIODS.map((p) => (
              <MagneticButton key={p.value} strength={4} className="w-full sm:w-auto">
                <button
                  type="button"
                  data-cursor-target="true"
                  onClick={() => setPeriod(p.value)}
                  disabled={fetching}
                  className={`w-full rounded-lg px-3 py-1 text-xs font-semibold transition-all cursor-pointer ${
                    period === p.value
                      ? "bg-primary text-white shadow-sm shadow-primary/25"
                      : "text-text-muted hover:bg-surface-3/60 hover:text-text-main"
                  }`}
                >
                  {p.label}
                </button>
              </MagneticButton>
            ))}
          </div>
        </div>
      )}

      {/* Row 1: Bento KPI Cards */}
      <div className={`transition-opacity duration-200 ${fetching ? "opacity-80" : "opacity-100"}`}>
        {loading ? (
          <KpiSkeletonGrid />
        ) : (
          <OverviewCards stats={stats} telemetry={telemetry} />
        )}
      </div>

      {/* Row 2: Main Smooth Area Chart */}
      {loading ? (
        <ChartSkeleton heightClass="h-[310px]" />
      ) : (
        <HudFrame
          chamfer="md"
          accent="cyan"
          padding="none"
          spotlight={true}
          className="min-w-0 [&_.liquid-glass-card]:border-transparent [&_.liquid-glass-card]:bg-transparent [&_.liquid-glass-card]:shadow-none [&_.liquid-glass-card]:backdrop-blur-none"
        >
          <UsageChart period={period} />
        </HudFrame>
      )}

      {/* Row 3: Distribution Bento (Models Donut + Provider/Account Gradient Bars) */}
      {!loading && (stats?.byProvider || stats?.byModel) && (
        <div className="grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-2">
          <HudFrame
            chamfer="md"
            accent="cyan"
            padding="none"
            spotlight={true}
            className="min-w-0 [&_.liquid-glass-card]:border-transparent [&_.liquid-glass-card]:bg-transparent [&_.liquid-glass-card]:shadow-none [&_.liquid-glass-card]:backdrop-blur-none"
          >
            <TopModelsChart byModel={stats.byModel} />
          </HudFrame>
          <HudFrame
            chamfer="md"
            accent="cyan"
            padding="none"
            spotlight={true}
            className="min-w-0 [&_.liquid-glass-card]:border-transparent [&_.liquid-glass-card]:bg-transparent [&_.liquid-glass-card]:shadow-none [&_.liquid-glass-card]:backdrop-blur-none"
          >
            <ProviderBarChart byProvider={stats.byProvider} byAccount={stats.byAccount} />
          </HudFrame>
        </div>
      )}

      {/* Row 4: Live Routing Topology + Live Stream */}
      {loading ? (
        <div
          className="grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(300px,1fr)]"
          style={{ contentVisibility: "auto", containIntrinsicSize: "auto 320px" }}
        >
          <ChartSkeleton heightClass="h-[460px]" />
          <ChartSkeleton heightClass="h-[460px]" />
        </div>
      ) : (
        <div
          className="grid min-w-0 grid-cols-1 items-stretch gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(300px,1fr)]"
          style={{ contentVisibility: "auto", containIntrinsicSize: "auto 320px" }}
        >
          <HudFrame
            chamfer="md"
            accent="cyan"
            padding="sm"
            spotlight={true}
            header="Sơ đồ định tuyến Provider"
            statusDot={true}
            className="min-w-0"
          >
            <ProviderTopology
              providers={providers}
              activeRequests={stats.activeRequests || []}
              lastProvider={stats.recentRequests?.[0]?.provider || ""}
              errorProvider={stats.errorProvider || ""}
            />
          </HudFrame>
          <RecentRequests
            requests={stats.recentRequests || []}
            activeCount={activeCount}
          />
        </div>
      )}

      {/* Row 5: Detailed Telemetry Breakdown Table */}
      <div
        className="flex flex-col gap-3"
        style={{ contentVisibility: "auto", containIntrinsicSize: "auto 320px" }}
      >
        <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
          {/* Interactive Pill Tabs */}
          <div className="flex flex-wrap items-center gap-1 rounded-xl border border-border/80 bg-surface-2/60 p-1 backdrop-blur-md">
            {TABLE_OPTIONS.map((opt) => {
              const active = tableView === opt.value;
              return (
                <MagneticButton key={opt.value} strength={4}>
                  <button
                    type="button"
                    data-cursor-target="true"
                    onClick={() => setTableView(opt.value)}
                    className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all cursor-pointer ${
                      active
                        ? "bg-primary text-white shadow-sm shadow-primary/25"
                        : "text-text-muted hover:bg-surface-3/60 hover:text-text-main"
                    }`}
                  >
                    <span className="material-symbols-outlined text-[15px]">{opt.icon}</span>
                    <span>{opt.label}</span>
                  </button>
                </MagneticButton>
              );
            })}
          </div>

          {/* Costs / Tokens Switch */}
          <div className="grid grid-cols-2 items-center gap-1 rounded-xl border border-border/80 bg-surface-2/60 p-1 backdrop-blur-md sm:flex">
            <MagneticButton strength={4} className="w-full sm:w-auto">
              <button
                type="button"
                data-cursor-target="true"
                onClick={() => setViewMode("costs")}
                className={`w-full rounded-lg px-3 py-1.5 text-xs font-semibold transition-all cursor-pointer ${
                  viewMode === "costs"
                    ? "bg-primary text-white shadow-sm shadow-primary/25"
                    : "text-text-muted hover:bg-surface-3/60 hover:text-text-main"
                }`}
              >
                Chi phí
              </button>
            </MagneticButton>
            <MagneticButton strength={4} className="w-full sm:w-auto">
              <button
                type="button"
                data-cursor-target="true"
                onClick={() => setViewMode("tokens")}
                className={`w-full rounded-lg px-3 py-1.5 text-xs font-semibold transition-all cursor-pointer ${
                  viewMode === "tokens"
                    ? "bg-primary text-white shadow-sm shadow-primary/25"
                    : "text-text-muted hover:bg-surface-3/60 hover:text-text-main"
                }`}
              >
                Tokens
              </button>
            </MagneticButton>
          </div>
        </div>

        {loading ? (
          <ChartSkeleton heightClass="h-64" />
        ) : (
          activeTableConfig && (
            <HudFrame
              chamfer="md"
              accent="cyan"
              padding="none"
              spotlight={true}
              className="min-w-0 [&>div:last-child>div]:border-transparent [&>div:last-child>div]:bg-transparent [&>div:last-child>div]:shadow-none"
            >
              <UsageTable
                title=""
                columns={activeTableConfig.columns}
                groupedData={activeTableConfig.groupedData}
                tableType={tableView}
                sortBy={sortBy}
                sortOrder={sortOrder}
                onToggleSort={toggleSort}
                viewMode={viewMode}
                storageKey={activeTableConfig.storageKey}
                renderSummaryCells={activeTableConfig.renderSummaryCells}
                renderDetailCells={activeTableConfig.renderDetailCells}
                emptyMessage={activeTableConfig.emptyMessage}
              />
            </HudFrame>
          )
        )}
      </div>
    </div>
  );
}
