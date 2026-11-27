"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import Image from "next/image";
import { Button, Badge } from "@/shared/components";
import { HudFrame, NumberTicker } from "@/shared/components/hud";
import { useHudPrefs } from "@/shared/hooks/useHudPrefs";
import { playHudSound } from "@/shared/utils/hudAudio";
import { cn } from "@/shared/utils/cn";
import {
  getCachedData,
  fetchWithCache,
  fetchJson,
  invalidateCache,
} from "@/shared/utils/swrCache";
import { useNotificationStore } from "@/store/notificationStore";
import { parseQuotaData } from "@/app/(dashboard)/dashboard/usage/components/ProviderLimits/utils/quotaParsers";
import {
  getQuotaCache,
  setQuotaCache,
} from "@/app/(dashboard)/dashboard/usage/components/ProviderLimits/utils/connectionFilterUtils";
import {
  getConnectionAverageRemaining,
  getConnectionHealthStatus,
  extractSupportedModelPills,
  isConnectionValidationBlocked,
  getConnectionValidationUrl,
} from "@/app/(dashboard)/dashboard/usage/components/ProviderLimits/utils/quotaSummaryUtils";
import { getRemainingPercentage } from "@/app/(dashboard)/dashboard/usage/components/ProviderLimits/utils/quotaFormatters";
import {
  getAntigravityEffectiveTier,
  getTierBadgeLabel,
} from "@/shared/utils/antigravityTier";
import { getAntigravityTierBadgeClass } from "@/app/(dashboard)/dashboard/usage/components/ProviderLimits/utils/tierUtils";
import AntigravityFlowBeam from "./AntigravityFlowBeam";
import OrbitalQuotaRing from "./OrbitalQuotaRing";

const PROVIDERS_CACHE_KEY = "/api/providers";
const MITM_CACHE_KEY = "/api/cli-tools/antigravity-mitm";
const SETTINGS_CACHE_KEY = "/api/settings";
const HEADROOM_CACHE_KEY = "/api/headroom/status";

const DEFAULT_MITM_STATUS = {
  running: false,
  certExists: false,
  certTrusted: false,
  dnsStatus: {},
  isWin: false,
  hasCachedPassword: false,
  needsSudoPassword: true,
};

const DEFAULT_SAVERS = {
  rtkEnabled: true,
  headroomEnabled: false,
  cavemanEnabled: false,
  ponytailEnabled: false,
};

async function runWithConcurrency(items, concurrency, worker) {
  if (!Array.isArray(items) || items.length === 0) return;
  let index = 0;
  const workerCount = Math.min(concurrency, items.length);
  const runners = Array.from({ length: workerCount }, async () => {
    while (index < items.length) {
      const current = items[index];
      index += 1;
      await worker(current);
    }
  });
  await Promise.all(runners);
}

function getPillToneClass(tone) {
  switch (tone) {
    case "sky":
      return "border-cyan-500/30 bg-cyan-500/10 text-cyan-700 dark:text-cyan-300";
    case "amber":
      return "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300";
    case "pink":
      return "border-pink-500/30 bg-pink-500/10 text-pink-700 dark:text-pink-300";
    default:
      return "border-border bg-surface-2 text-text-muted";
  }
}

function getStatusBadgeProps(healthStatus) {
  switch (healthStatus) {
    case "healthy":
      return { variant: "success", label: "ACTIVE" };
    case "low":
      return { variant: "warning", label: "LOW QUOTA" };
    case "exhausted":
      return { variant: "error", label: "EXHAUSTED" };
    case "blocked":
      return { variant: "error", label: "VERIFY 403" };
    case "error":
      return { variant: "error", label: "ERROR" };
    case "disabled":
      return { variant: "default", label: "DISABLED" };
    default:
      return { variant: "primary", label: "SYNCING" };
  }
}

function extractFamilyBreakdown(quotaEntry) {
  const quotas = quotaEntry?.quotas;
  if (!Array.isArray(quotas) || quotas.length === 0) return [];
  const geminiRow =
    quotas.find((q) => q.modelKey === "gemini_session") ||
    quotas.find((q) => q.modelKey === "gemini") ||
    quotas.find((q) => q.modelKey === "gemini_weekly");
  const claudeRow =
    quotas.find((q) => q.modelKey === "claude_gpt_session") ||
    quotas.find((q) => q.modelKey === "claude") ||
    quotas.find((q) => q.modelKey === "claude_gpt_weekly");

  const items = [];
  if (geminiRow) {
    items.push({ key: "gemini", label: "Gemini", pct: getRemainingPercentage(geminiRow) });
  }
  if (claudeRow) {
    items.push({ key: "claude", label: "Claude", pct: getRemainingPercentage(claudeRow) });
  }
  return items;
}

export default function AntigravityCommandCenter({ machineId = "" }) {
  const { motionPaused } = useHudPrefs();
  const notify = useNotificationStore();

  const [connections, setConnections] = useState(
    () => getCachedData(PROVIDERS_CACHE_KEY)?.connections || []
  );
  const [providersLoading, setProvidersLoading] = useState(
    () => !getCachedData(PROVIDERS_CACHE_KEY)
  );
  const [quotaData, setQuotaData] = useState({});
  const [quotaLoadingIds, setQuotaLoadingIds] = useState({});
  const [quotaErrors, setQuotaErrors] = useState({});

  const [mitmStatus, setMitmStatus] = useState(
    () => getCachedData(MITM_CACHE_KEY) || DEFAULT_MITM_STATUS
  );
  const [mitmLoading, setMitmLoading] = useState(
    () => !getCachedData(MITM_CACHE_KEY)
  );
  const [dnsBusy, setDnsBusy] = useState(false);
  const [dnsError, setDnsError] = useState(null);

  const [savers, setSavers] = useState(() => {
    const cached = getCachedData(SETTINGS_CACHE_KEY);
    if (!cached) return DEFAULT_SAVERS;
    return {
      rtkEnabled: cached.rtkEnabled !== false,
      headroomEnabled: Boolean(cached.headroomEnabled),
      cavemanEnabled: Boolean(cached.cavemanEnabled),
      ponytailEnabled: Boolean(cached.ponytailEnabled),
    };
  });
  const [savingSettingKey, setSavingSettingKey] = useState(null);
  const [headroomStatus, setHeadroomStatus] = useState(
    () => getCachedData(HEADROOM_CACHE_KEY) || { running: false, installed: false }
  );

  const [warmingUpAll, setWarmingUpAll] = useState(false);
  const [refreshingAll, setRefreshingAll] = useState(false);
  const [actionBanner, setActionBanner] = useState(null);

  const agConnections = useMemo(
    () => connections.filter((c) => c.provider === "antigravity"),
    [connections]
  );

  const fetchQuotasForConnections = useCallback(async (agList, { force = false } = {}) => {
    const targets = agList.filter((c) => c.isActive !== false);
    if (targets.length === 0) return;

    const cachedQuotaMap = getQuotaCache();
    const initialMap = {};
    const needLoading = {};
    for (const conn of agList) {
      if (cachedQuotaMap[conn.id]) {
        initialMap[conn.id] = cachedQuotaMap[conn.id];
      } else if (conn.isActive !== false) {
        needLoading[conn.id] = true;
      }
    }
    if (Object.keys(initialMap).length > 0) {
      setQuotaData((prev) => ({ ...initialMap, ...prev }));
    }
    if (Object.keys(needLoading).length > 0 || force) {
      setQuotaLoadingIds((prev) => {
        const next = { ...prev };
        for (const t of targets) {
          if (force || !cachedQuotaMap[t.id]) next[t.id] = true;
        }
        return next;
      });
    }

    await runWithConcurrency(targets, 4, async (conn) => {
      try {
        const url = `/api/usage/${conn.id}${force ? "?force=1" : ""}`;
        const res = await fetch(url);
        if (!res.ok) {
          const errBody = await res.json().catch(() => ({}));
          const msg = errBody.error || res.statusText;
          if (res.status === 401) {
            const entry = { quotas: [], message: msg };
            setQuotaData((prev) => ({ ...prev, [conn.id]: entry }));
            setQuotaCache(conn.id, entry);
            return;
          }
          if (res.status !== 404) {
            setQuotaErrors((prev) => ({ ...prev, [conn.id]: msg }));
          }
          return;
        }
        const data = await res.json();
        const entry = {
          quotas: parseQuotaData("antigravity", data),
          plan: data.plan || null,
          message: data.message || null,
          raw: data,
        };
        setQuotaData((prev) => ({ ...prev, [conn.id]: entry }));
        setQuotaCache(conn.id, entry);
        setQuotaErrors((prev) => {
          if (!prev[conn.id]) return prev;
          const next = { ...prev };
          delete next[conn.id];
          return next;
        });
      } catch (err) {
        setQuotaErrors((prev) => ({ ...prev, [conn.id]: err?.message || "Quota fetch failed" }));
      } finally {
        setQuotaLoadingIds((prev) => {
          if (!prev[conn.id]) return prev;
          const next = { ...prev };
          delete next[conn.id];
          return next;
        });
      }
    });
  }, []);

  const loadAllTelemetry = useCallback(
    async ({ force = false } = {}) => {
      try {
        const [providersRes, mitmRes, settingsRes, headroomRes] = await Promise.allSettled([
          fetchWithCache(PROVIDERS_CACHE_KEY, () => fetchJson(PROVIDERS_CACHE_KEY), {
            ttlMs: 30000,
            force,
          }),
          fetchWithCache(MITM_CACHE_KEY, () => fetchJson(MITM_CACHE_KEY), {
            ttlMs: 15000,
            force,
          }),
          fetchWithCache(SETTINGS_CACHE_KEY, () => fetchJson(SETTINGS_CACHE_KEY), {
            ttlMs: 30000,
            force,
          }),
          fetchWithCache(HEADROOM_CACHE_KEY, () => fetchJson(HEADROOM_CACHE_KEY), {
            ttlMs: 20000,
            force,
          }),
        ]);

        if (providersRes.status === "fulfilled" && providersRes.value) {
          const allConns = providersRes.value.connections || [];
          setConnections(allConns);
          setProvidersLoading(false);
          const agOnly = allConns.filter((c) => c.provider === "antigravity");
          fetchQuotasForConnections(agOnly, { force });
        } else {
          setProvidersLoading(false);
        }

        if (mitmRes.status === "fulfilled" && mitmRes.value) {
          setMitmStatus(mitmRes.value);
        }
        setMitmLoading(false);

        if (settingsRes.status === "fulfilled" && settingsRes.value) {
          const s = settingsRes.value;
          setSavers({
            rtkEnabled: s.rtkEnabled !== false,
            headroomEnabled: Boolean(s.headroomEnabled),
            cavemanEnabled: Boolean(s.cavemanEnabled),
            ponytailEnabled: Boolean(s.ponytailEnabled),
          });
        }

        if (headroomRes.status === "fulfilled" && headroomRes.value) {
          setHeadroomStatus(headroomRes.value);
        }
      } catch {
        setProvidersLoading(false);
        setMitmLoading(false);
      }
    },
    [fetchQuotasForConnections]
  );

  useEffect(() => {
    const cachedQuotaMap = getQuotaCache();
    if (Object.keys(cachedQuotaMap).length > 0) {
      queueMicrotask(() => {
        setQuotaData((prev) => ({ ...cachedQuotaMap, ...prev }));
      });
    }
    queueMicrotask(() => {
      loadAllTelemetry();
    });
  }, [loadAllTelemetry]);

  const telemetrySummary = useMemo(() => {
    let activeCount = 0;
    let healthyCount = 0;
    let exhaustedCount = 0;
    let quotaSum = 0;
    let quotaSamples = 0;

    for (const conn of agConnections) {
      const isActive = conn.isActive !== false;
      if (isActive) activeCount += 1;
      const entry = quotaData[conn.id] || null;
      const err = quotaErrors[conn.id] || null;
      const health = getConnectionHealthStatus(conn, entry, err);
      if (health === "healthy") healthyCount += 1;
      if (health === "exhausted" || health === "blocked") exhaustedCount += 1;
      if (isActive) {
        const avg = getConnectionAverageRemaining(entry);
        if (avg !== null) {
          quotaSum += avg;
          quotaSamples += 1;
        }
      }
    }

    const avgQuotaPct = quotaSamples > 0 ? Math.round(quotaSum / quotaSamples) : null;
    const armedSaversCount = [
      savers.rtkEnabled,
      savers.headroomEnabled,
      savers.cavemanEnabled,
      savers.ponytailEnabled,
    ].filter(Boolean).length;

    return {
      totalCount: agConnections.length,
      activeCount,
      healthyCount,
      exhaustedCount,
      avgQuotaPct,
      armedSaversCount,
    };
  }, [agConnections, quotaData, quotaErrors, savers]);

  const handleToggleDns = useCallback(async () => {
    if (dnsBusy || !mitmStatus?.running) return;
    const nextAction = mitmStatus?.dnsStatus?.antigravity ? "disable" : "enable";
    setDnsBusy(true);
    setDnsError(null);

    try {
      const res = await fetch("/api/cli-tools/antigravity-mitm", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tool: "antigravity",
          action: nextAction,
          sudoPassword: "",
        }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        const msg = data.error || `HTTP ${res.status}`;
        if (res.status === 400 || /sudo/i.test(msg)) {
          setDnsError("Sudo password required on macOS/Linux");
        } else {
          setDnsError(msg);
        }
        playHudSound("alert");
        setActionBanner({
          tone: "error",
          text: msg,
          href: "/dashboard/mitm",
          hrefLabel: "Open MITM Console",
        });
        return;
      }

      invalidateCache(MITM_CACHE_KEY);
      setMitmStatus((prev) => ({
        ...prev,
        dnsStatus: data.dnsStatus ?? {
          ...(prev.dnsStatus || {}),
          antigravity: nextAction === "enable",
        },
      }));
      playHudSound("confirm");
      const msg =
        nextAction === "enable"
          ? "Antigravity DNS Intercept enabled (Zero IDE Restart)"
          : "Antigravity switched to Smart Passthrough";
      notify.success(msg);
      setActionBanner({ tone: "success", text: msg });
    } catch (err) {
      const msg = err?.message || "Failed to toggle Antigravity DNS";
      setDnsError(msg);
      playHudSound("alert");
      setActionBanner({ tone: "error", text: msg });
    } finally {
      setDnsBusy(false);
    }
  }, [dnsBusy, mitmStatus, notify]);

  const handleWarmupAll = useCallback(async () => {
    if (warmingUpAll) return;
    playHudSound("click");
    setWarmingUpAll(true);
    setActionBanner({ tone: "info", text: "Running Antigravity warmup sweep across all accounts..." });

    try {
      const res = await fetch("/api/oauth/antigravity/warmup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ all: true }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || `Warmup failed (${res.status})`);
      }
      const results = Array.isArray(data.results) ? data.results : [];
      const okCount = results.filter((r) => r.ok).length;
      const msg =
        results.length > 0
          ? `Warmup complete: ${okCount}/${results.length} accounts active`
          : data.message || "Warmup sweep completed";
      playHudSound("confirm");
      notify.success(msg);
      setActionBanner({ tone: "success", text: msg });
      invalidateCache(PROVIDERS_CACHE_KEY);
      await loadAllTelemetry({ force: true });
    } catch (err) {
      const msg = err?.message || "Warmup failed";
      playHudSound("alert");
      notify.error(msg);
      setActionBanner({ tone: "error", text: msg });
    } finally {
      setWarmingUpAll(false);
    }
  }, [loadAllTelemetry, notify, warmingUpAll]);

  const handleRefreshAll = useCallback(async () => {
    if (refreshingAll) return;
    playHudSound("click");
    setRefreshingAll(true);
    setActionBanner({ tone: "info", text: "Refreshing Antigravity OAuth tokens & live quotas..." });

    try {
      const res = await fetch("/api/oauth/antigravity/refresh-all", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || `Refresh failed (${res.status})`);
      }
      const msg = data.message || `Refreshed ${data.refreshedCount ?? 0}/${data.total ?? 0} tokens`;
      playHudSound("confirm");
      notify.success(msg);
      setActionBanner({ tone: "success", text: msg });
      invalidateCache(PROVIDERS_CACHE_KEY);
      await loadAllTelemetry({ force: true });
    } catch (err) {
      const msg = err?.message || "Token refresh failed";
      playHudSound("alert");
      notify.error(msg);
      setActionBanner({ tone: "error", text: msg });
    } finally {
      setRefreshingAll(false);
    }
  }, [loadAllTelemetry, notify, refreshingAll]);

  const handleToggleSaver = useCallback(
    async (key, label) => {
      if (savingSettingKey) return;
      const prevVal = savers[key];
      const nextVal = !prevVal;
      playHudSound("toggle");
      setSavers((prev) => ({ ...prev, [key]: nextVal }));
      setSavingSettingKey(key);

      try {
        const res = await fetch("/api/settings", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ [key]: nextVal }),
        });
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        invalidateCache(SETTINGS_CACHE_KEY);
        setActionBanner({
          tone: "success",
          text: `${label} ${nextVal ? "armed" : "disarmed"}`,
        });
      } catch (err) {
        setSavers((prev) => ({ ...prev, [key]: prevVal }));
        playHudSound("alert");
        notify.error(`Failed to update ${label}: ${err?.message || "Network error"}`);
      } finally {
        setSavingSettingKey(null);
      }
    },
    [notify, savers, savingSettingKey]
  );

  const avgQuotaAccent =
    telemetrySummary.avgQuotaPct === null
      ? "cyan"
      : telemetrySummary.avgQuotaPct > 70
        ? "emerald"
        : telemetrySummary.avgQuotaPct >= 30
          ? "amber"
          : "rose";

  const saverRows = [
    {
      key: "rtkEnabled",
      label: "RTK Tool Filter",
      code: "RTK",
      desc: "Compresses CLI/tool outputs before Antigravity context injection.",
      statusText: savers.rtkEnabled ? "FILTER ARMED" : "STANDBY",
    },
    {
      key: "headroomEnabled",
      label: "Headroom Sidecar",
      code: "HEADROOM",
      desc: "Semantic prompt & turn compression proxy for long IDE sessions.",
      statusText: headroomStatus?.running
        ? "PROXY LIVE"
        : headroomStatus?.installed
          ? "INSTALLED"
          : "NOT INSTALLED",
      statusLive: Boolean(headroomStatus?.running),
    },
    {
      key: "cavemanEnabled",
      label: "Caveman Compression",
      code: "CAVEMAN",
      desc: "Terse directive injection reducing verbose assistant token burn.",
      statusText: savers.cavemanEnabled ? "INJECTING" : "STANDBY",
    },
    {
      key: "ponytailEnabled",
      label: "Ponytail Context",
      code: "PONYTAIL",
      desc: "Trims redundant historical noise across multi-turn agent loops.",
      statusText: savers.ponytailEnabled ? "PRUNING" : "STANDBY",
    },
  ];

  return (
    <div className="flex flex-col gap-5 pb-6">
      {/* 1. HERO TELEMETRY STRIP */}
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="inline-flex items-center gap-2 rounded-md border border-cyan-500/35 bg-cyan-500/10 px-3 py-1 font-mono text-[11px] font-bold uppercase tracking-[0.16em] text-cyan-700 dark:text-cyan-300">
              <span
                className={cn(
                  "size-2 rounded-full bg-cyan-500 shadow-[0_0_8px_rgba(6,182,212,0.9)]",
                  !motionPaused && "animate-pulse"
                )}
              />
              ANTIGRAVITY COMMAND CENTER
            </span>
            {machineId ? (
              <span className="hidden sm:inline-flex items-center gap-1 rounded border border-border bg-surface-2 px-2 py-0.5 font-mono text-[10px] text-text-muted">
                NODE {machineId.slice(0, 8).toUpperCase()}
              </span>
            ) : null}
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              icon="sync"
              onClick={() => {
                playHudSound("click");
                loadAllTelemetry({ force: true });
              }}
              loading={providersLoading}
            >
              Sync Telemetry
            </Button>
          </div>
        </div>

        {/* 4 KPI Readouts */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
          <HudFrame accent="cyan" padding="sm" chamfer="sm">
            <div className="flex items-center justify-between gap-2">
              <span className="font-mono text-[10px] font-semibold uppercase tracking-wider text-text-muted">
                Active AG Accounts
              </span>
              <span className="material-symbols-outlined text-[16px] text-cyan-600 dark:text-cyan-400">
                groups
              </span>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="font-mono text-2xl font-bold text-text-main hud-telemetry-num">
                <NumberTicker value={telemetrySummary.activeCount} />
              </span>
              <span className="font-mono text-xs text-text-muted hud-telemetry-num">
                / {telemetrySummary.totalCount} total
              </span>
            </div>
          </HudFrame>

          <HudFrame accent={avgQuotaAccent} padding="sm" chamfer="sm">
            <div className="flex items-center justify-between gap-2">
              <span className="font-mono text-[10px] font-semibold uppercase tracking-wider text-text-muted">
                Avg Quota
              </span>
              <span className="material-symbols-outlined text-[16px] text-emerald-600 dark:text-emerald-400">
                donut_large
              </span>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span
                className={cn(
                  "font-mono text-2xl font-bold hud-telemetry-num",
                  telemetrySummary.avgQuotaPct === null
                    ? "text-text-main"
                    : telemetrySummary.avgQuotaPct > 70
                      ? "text-emerald-600 dark:text-emerald-400"
                      : telemetrySummary.avgQuotaPct >= 30
                        ? "text-amber-600 dark:text-amber-400"
                        : "text-rose-600 dark:text-rose-400"
                )}
              >
                {telemetrySummary.avgQuotaPct !== null ? (
                  <NumberTicker value={telemetrySummary.avgQuotaPct} suffix="%" />
                ) : (
                  "--"
                )}
              </span>
              <span className="font-mono text-xs text-text-muted hud-telemetry-num">
                {telemetrySummary.healthyCount} healthy
              </span>
            </div>
          </HudFrame>

          <HudFrame
            accent={mitmStatus?.running ? "emerald" : "amber"}
            padding="sm"
            chamfer="sm"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="font-mono text-[10px] font-semibold uppercase tracking-wider text-text-muted">
                MITM Status
              </span>
              <span
                className={cn(
                  "material-symbols-outlined text-[16px]",
                  mitmStatus?.running
                    ? "text-emerald-600 dark:text-emerald-400"
                    : "text-amber-600 dark:text-amber-400"
                )}
              >
                security
              </span>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="font-mono text-2xl font-bold text-text-main hud-telemetry-num">
                <NumberTicker value={mitmStatus?.running ? 443 : 0} prefix=":" />
              </span>
              <span
                className={cn(
                  "font-mono text-[11px] font-bold uppercase",
                  mitmStatus?.running
                    ? "text-emerald-600 dark:text-emerald-400"
                    : "text-text-muted"
                )}
              >
                {mitmStatus?.running
                  ? mitmStatus?.dnsStatus?.antigravity
                    ? "DNS LIVE"
                    : "PASSTHROUGH"
                  : "STANDBY"}
              </span>
            </div>
          </HudFrame>

          <HudFrame accent="cyan" padding="sm" chamfer="sm">
            <div className="flex items-center justify-between gap-2">
              <span className="font-mono text-[10px] font-semibold uppercase tracking-wider text-text-muted">
                Token Savers
              </span>
              <span className="material-symbols-outlined text-[16px] text-cyan-600 dark:text-cyan-400">
                bolt
              </span>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="font-mono text-2xl font-bold text-cyan-600 dark:text-cyan-400 hud-telemetry-num">
                <NumberTicker value={telemetrySummary.armedSaversCount} suffix="/4" />
              </span>
              <span className="font-mono text-xs text-text-muted">
                {headroomStatus?.running ? "HR LIVE" : "ARMED"}
              </span>
            </div>
          </HudFrame>
        </div>
      </div>

      {/* 2. CENTER DECK: Flow Beam (2/3) + Tactical Quick Actions Bay (1/3) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch">
        <HudFrame className="lg:col-span-8" accent="cyan" padding="md" chamfer="md">
          <AntigravityFlowBeam
            mitmStatus={mitmStatus}
            mitmLoading={mitmLoading}
            dnsBusy={dnsBusy}
            dnsError={dnsError}
            onToggleDns={handleToggleDns}
            agAccountsCount={telemetrySummary.totalCount}
            activeAgCount={telemetrySummary.activeCount}
            avgQuotaPct={telemetrySummary.avgQuotaPct}
            healthyCount={telemetrySummary.healthyCount}
            exhaustedCount={telemetrySummary.exhaustedCount}
            tokenSaversCount={telemetrySummary.armedSaversCount}
          />
        </HudFrame>

        <HudFrame
          className="lg:col-span-4 flex flex-col justify-between gap-3"
          accent="cyan"
          padding="md"
          chamfer="md"
          header="Tactical Quick Actions"
          statusDot="cyan"
        >
          <div className="flex flex-col gap-2.5">
            <div className="grid grid-cols-2 gap-2">
              <Button
                variant="primary"
                size="sm"
                icon="local_fire_department"
                loading={warmingUpAll}
                disabled={refreshingAll || agConnections.length === 0}
                onClick={handleWarmupAll}
                fullWidth
              >
                Warmup All
              </Button>
              <Button
                variant="secondary"
                size="sm"
                icon="key"
                loading={refreshingAll}
                disabled={warmingUpAll || agConnections.length === 0}
                onClick={handleRefreshAll}
                fullWidth
              >
                Refresh Tokens
              </Button>
            </div>

            <div className="flex flex-col gap-1.5 pt-1">
              <Link
                href="/dashboard/mitm"
                onClick={() => playHudSound("click")}
                className="group flex items-center justify-between rounded-lg border border-border-subtle bg-surface-2/70 px-3 py-2 text-xs font-medium text-text-main hover:border-cyan-500/40 hover:bg-surface-3/70 transition-colors"
              >
                <span className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-[16px] text-cyan-600 dark:text-cyan-400">
                    tune
                  </span>
                  <span>MITM Mapping</span>
                </span>
                <span className="font-mono text-[10px] text-text-muted group-hover:text-cyan-500">
                  /mitm →
                </span>
              </Link>

              <Link
                href="/dashboard/endpoint"
                onClick={() => playHudSound("click")}
                className="group flex items-center justify-between rounded-lg border border-border-subtle bg-surface-2/70 px-3 py-2 text-xs font-medium text-text-main hover:border-cyan-500/40 hover:bg-surface-3/70 transition-colors"
              >
                <span className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-[16px] text-cyan-600 dark:text-cyan-400">
                    api
                  </span>
                  <span>Endpoint &amp; Keys</span>
                </span>
                <span className="font-mono text-[10px] text-text-muted group-hover:text-cyan-500">
                  /v1 →
                </span>
              </Link>

              <Link
                href="/dashboard/console-log"
                onClick={() => playHudSound("click")}
                className="group flex items-center justify-between rounded-lg border border-border-subtle bg-surface-2/70 px-3 py-2 text-xs font-medium text-text-main hover:border-cyan-500/40 hover:bg-surface-3/70 transition-colors"
              >
                <span className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-[16px] text-cyan-600 dark:text-cyan-400">
                    monitoring
                  </span>
                  <span>Live Console</span>
                </span>
                <span className="font-mono text-[10px] text-text-muted group-hover:text-cyan-500">
                  SSE →
                </span>
              </Link>
            </div>
          </div>

          {actionBanner ? (
            <div
              className={cn(
                "flex items-center justify-between gap-2 rounded-lg border px-2.5 py-2 text-[11px] font-mono",
                actionBanner.tone === "success" &&
                  "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
                actionBanner.tone === "error" &&
                  "border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300",
                actionBanner.tone === "info" &&
                  "border-cyan-500/30 bg-cyan-500/10 text-cyan-700 dark:text-cyan-300"
              )}
            >
              <span className="truncate">{actionBanner.text}</span>
              <div className="flex items-center gap-1.5 shrink-0">
                {actionBanner.href ? (
                  <Link href={actionBanner.href} className="underline font-semibold">
                    {actionBanner.hrefLabel || "Open"}
                  </Link>
                ) : null}
                <button
                  type="button"
                  onClick={() => setActionBanner(null)}
                  className="opacity-70 hover:opacity-100 cursor-pointer"
                  aria-label="Dismiss status message"
                >
                  <span className="material-symbols-outlined text-[14px]">close</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="rounded-lg border border-border-subtle bg-surface/60 px-2.5 py-2 font-mono text-[10.5px] text-text-muted">
              Ready for Antigravity warmup, token refresh &amp; live routing.
            </div>
          )}
        </HudFrame>
      </div>

      {/* 3. LOWER SPLIT GRID: Account Pool (Left) + Token Saver Matrix (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
        {/* LEFT: Antigravity Account Pool */}
        <HudFrame className="lg:col-span-7" accent="cyan" padding="md" chamfer="md">
          <div className="flex flex-wrap items-center justify-between gap-2 pb-3 mb-3 border-b border-border-subtle">
            <div className="flex items-center gap-2.5">
              <div className="flex size-7 items-center justify-center rounded-lg border border-cyan-500/30 bg-cyan-500/10 overflow-hidden">
                <Image
                  src="/providers/antigravity.png"
                  alt="Antigravity"
                  width={18}
                  height={18}
                  className="object-contain"
                />
              </div>
              <div>
                <h2 className="text-sm font-bold text-text-main tracking-tight">
                  Antigravity Account Pool
                </h2>
                <p className="font-mono text-[10.5px] text-text-muted">
                  Live OAuth quota telemetry &amp; model family access
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Link
                href="/dashboard/quota?provider=antigravity"
                onClick={() => playHudSound("click")}
                className="inline-flex items-center gap-1 rounded-md border border-border bg-surface-2 px-2.5 py-1 font-mono text-[10.5px] font-semibold text-text-main hover:border-cyan-500/40 transition-colors"
              >
                <span>Quota Deck</span>
                <span className="material-symbols-outlined text-[13px]">open_in_new</span>
              </Link>
              <Link
                href="/dashboard/providers/antigravity"
                onClick={() => playHudSound("click")}
                className="inline-flex items-center gap-1 rounded-md border border-cyan-500/35 bg-cyan-500/10 px-2.5 py-1 font-mono text-[10.5px] font-semibold text-cyan-700 dark:text-cyan-300 hover:bg-cyan-500/20 transition-colors"
              >
                <span>Manage</span>
                <span className="material-symbols-outlined text-[13px]">arrow_forward</span>
              </Link>
            </div>
          </div>

          {providersLoading && agConnections.length === 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {[1, 2].map((idx) => (
                <div
                  key={idx}
                  className="h-28 rounded-xl border border-border-subtle bg-surface-2/60 animate-pulse"
                />
              ))}
            </div>
          ) : agConnections.length === 0 ? (
            <div className="flex flex-col items-center justify-center text-center py-8 px-4 rounded-xl border border-dashed border-cyan-500/30 bg-surface-2/40 gap-3">
              <div className="flex size-12 items-center justify-center rounded-xl border border-cyan-500/30 bg-cyan-500/10 text-cyan-600 dark:text-cyan-400">
                <span className="material-symbols-outlined text-[26px]">rocket_launch</span>
              </div>
              <div className="max-w-sm">
                <p className="text-sm font-bold text-text-main">
                  No Antigravity Accounts Connected
                </p>
                <p className="mt-1 text-xs text-text-muted">
                  Connect an Antigravity OAuth account to unlock Gemini 4, Claude, and orbital failover pooling.
                </p>
              </div>
              <Link href="/dashboard/providers/antigravity" onClick={() => playHudSound("click")}>
                <Button variant="primary" size="sm" icon="add_circle">
                  Connect Antigravity Account
                </Button>
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {agConnections.map((conn) => {
                const quotaEntry = quotaData[conn.id] || null;
                const err = quotaErrors[conn.id] || null;
                const isLoadingQuota = Boolean(quotaLoadingIds[conn.id]);
                const avgPct = getConnectionAverageRemaining(quotaEntry);
                const healthStatus = getConnectionHealthStatus(conn, quotaEntry, err);
                const blocked = isConnectionValidationBlocked(conn);
                const validationUrl = getConnectionValidationUrl(conn);
                const statusBadge = getStatusBadgeProps(healthStatus);
                const tier = getAntigravityEffectiveTier(conn, quotaEntry);
                const tierLabel = getTierBadgeLabel(tier);
                const tierClass = getAntigravityTierBadgeClass(tier);
                const pills = extractSupportedModelPills(conn, quotaEntry);
                const breakdown = extractFamilyBreakdown(quotaEntry);
                const accountLabel =
                  conn.email || conn.displayName || conn.name || conn.id.slice(0, 10);

                return (
                  <div
                    key={conn.id}
                    className={cn(
                      "flex items-center gap-3 rounded-xl border p-3 transition-colors bg-surface-2/75",
                      blocked || healthStatus === "exhausted" || healthStatus === "error"
                        ? "border-rose-500/35"
                        : healthStatus === "low"
                          ? "border-amber-500/35"
                          : conn.isActive === false
                            ? "border-border opacity-70"
                            : "border-border hover:border-cyan-500/40"
                    )}
                  >
                    <OrbitalQuotaRing
                      percentage={avgPct}
                      size={58}
                      strokeWidth={4.5}
                      isLoading={isLoadingQuota}
                      isBlocked={blocked}
                    />

                    <div className="flex-1 min-w-0 flex flex-col gap-1.5">
                      <div className="flex items-center justify-between gap-1.5">
                        <p
                          className="text-xs font-bold text-text-main truncate"
                          title={accountLabel}
                        >
                          {accountLabel}
                        </p>
                      </div>

                      <div className="flex flex-wrap items-center gap-1">
                        <Badge variant={statusBadge.variant} size="sm" dot>
                          {statusBadge.label}
                        </Badge>
                        {tierLabel ? (
                          <span
                            className={cn(
                              "inline-flex items-center rounded border px-1.5 py-0.2 font-mono text-[9.5px] font-bold uppercase",
                              tierClass
                            )}
                          >
                            {tierLabel}
                          </span>
                        ) : null}
                      </div>

                      {pills.length > 0 ? (
                        <div className="flex flex-wrap items-center gap-1">
                          {pills.map((pill) => (
                            <span
                              key={pill.id}
                              className={cn(
                                "inline-flex items-center rounded border px-1.5 py-0.2 font-mono text-[9.5px] font-medium",
                                getPillToneClass(pill.tone)
                              )}
                            >
                              {pill.label}
                            </span>
                          ))}
                        </div>
                      ) : null}

                      {breakdown.length > 0 ? (
                        <div className="flex items-center gap-2.5 font-mono text-[10px] text-text-muted hud-telemetry-num">
                          {breakdown.map((b) => (
                            <span key={b.key}>
                              {b.label}:{" "}
                              <strong className="text-text-main">{b.pct}%</strong>
                            </span>
                          ))}
                        </div>
                      ) : blocked && validationUrl ? (
                        <a
                          href={validationUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="font-mono text-[10px] text-rose-600 dark:text-rose-400 underline truncate"
                        >
                          Verify Google Account →
                        </a>
                      ) : err ? (
                        <span className="font-mono text-[10px] text-rose-600 dark:text-rose-400 truncate">
                          {err}
                        </span>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </HudFrame>

        {/* RIGHT: Antigravity Token Saver Matrix */}
        <HudFrame className="lg:col-span-5" accent="cyan" padding="md" chamfer="md">
          <div className="flex flex-wrap items-center justify-between gap-2 pb-3 mb-3 border-b border-border-subtle">
            <div>
              <h2 className="text-sm font-bold text-text-main tracking-tight">
                Antigravity Token Saver Matrix
              </h2>
              <p className="font-mono text-[10.5px] text-text-muted">
                {telemetrySummary.armedSaversCount}/4 compression layers armed
              </p>
            </div>
            <Link
              href="/dashboard/token-saver"
              onClick={() => playHudSound("click")}
              className="inline-flex items-center gap-1 rounded-md border border-cyan-500/35 bg-cyan-500/10 px-2.5 py-1 font-mono text-[10.5px] font-semibold text-cyan-700 dark:text-cyan-300 hover:bg-cyan-500/20 transition-colors"
            >
              <span>Full Matrix</span>
              <span className="material-symbols-outlined text-[13px]">arrow_forward</span>
            </Link>
          </div>

          <div className="flex flex-col gap-2.5">
            {saverRows.map((item) => {
              const checked = Boolean(savers[item.key]);
              const busy = savingSettingKey === item.key;

              return (
                <div
                  key={item.key}
                  className={cn(
                    "flex items-center justify-between gap-3 rounded-xl border p-3 transition-colors",
                    checked
                      ? "border-cyan-500/35 bg-cyan-500/[0.05] dark:bg-cyan-500/[0.06]"
                      : "border-border-subtle bg-surface-2/60"
                  )}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-bold text-text-main">
                        {item.label}
                      </span>
                      <span
                        className={cn(
                          "inline-flex items-center gap-1 rounded border px-1.5 py-0.2 font-mono text-[9.5px] font-bold uppercase",
                          item.statusLive || checked
                            ? "border-cyan-500/30 bg-cyan-500/10 text-cyan-700 dark:text-cyan-300"
                            : "border-border bg-surface text-text-muted"
                        )}
                      >
                        {item.statusText}
                      </span>
                    </div>
                    <p className="mt-1 text-[11px] text-text-muted leading-snug">
                      {item.desc}
                    </p>
                  </div>

                  <button
                    type="button"
                    role="switch"
                    aria-checked={checked}
                    aria-label={`Toggle ${item.label}`}
                    disabled={busy}
                    onClick={() => handleToggleSaver(item.key, item.label)}
                    className={cn(
                      "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors cursor-pointer",
                      "focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/60",
                      checked
                        ? "border-cyan-500/60 bg-cyan-500"
                        : "border-border bg-surface-3",
                      busy && "opacity-60 cursor-wait"
                    )}
                  >
                    <span
                      className={cn(
                        "inline-block size-4.5 rounded-full bg-white shadow transition-transform duration-200",
                        checked ? "translate-x-5.5" : "translate-x-0.5"
                      )}
                    />
                  </button>
                </div>
              );
            })}
          </div>
        </HudFrame>
      </div>
    </div>
  );
}
