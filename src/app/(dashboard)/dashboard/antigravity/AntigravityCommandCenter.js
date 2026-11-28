"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import Image from "next/image";
import { Button, Badge } from "@/shared/components";
import { HudFrame, NumberTicker, MagneticButton } from "@/shared/components/hud";
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
  isQuotaCacheFresh,
  QUOTA_FRESH_TTL_MS,
} from "@/app/(dashboard)/dashboard/usage/components/ProviderLimits/utils/connectionFilterUtils";
import {
  getConnectionAverageRemaining,
  getConnectionHealthStatus,
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
  toonEnabled: true,
  toolDedupEnabled: true,
  headroomEnabled: false,
  cavemanEnabled: false,
  ponytailEnabled: false,
};

async function runWithConcurrency(items, concurrency, worker, signal) {
  if (!Array.isArray(items) || items.length === 0) return;
  let index = 0;
  const workerCount = Math.min(concurrency, items.length);
  const runners = Array.from({ length: workerCount }, async () => {
    while (index < items.length) {
      if (signal?.aborted) return;
      const current = items[index];
      index += 1;
      await worker(current);
    }
  });
  await Promise.all(runners);
}

function getStatusBadgeProps(healthStatus) {
  switch (healthStatus) {
    case "healthy":
      return { variant: "success", label: "HOẠT ĐỘNG" };
    case "low":
      return { variant: "warning", label: "QUOTA THẤP" };
    case "exhausted":
      return { variant: "error", label: "CẠN KIỆT" };
    case "blocked":
      return { variant: "error", label: "XÁC MINH 403" };
    case "error":
      return { variant: "error", label: "LỖI" };
    case "disabled":
      return { variant: "default", label: "ĐANG TẮT" };
    default:
      return { variant: "primary", label: "ĐANG ĐỒNG BỘ" };
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
      toonEnabled: cached.toonEnabled !== false,
      toolDedupEnabled: cached.toolDedupEnabled !== false,
      headroomEnabled: Boolean(cached.headroomEnabled),
      cavemanEnabled: Boolean(cached.cavemanEnabled),
      ponytailEnabled: Boolean(cached.ponytailEnabled),
    };
  });
  const [savingSettingKey, setSavingSettingKey] = useState(null);
  const [headroomStatus, setHeadroomStatus] = useState(
    () => getCachedData(HEADROOM_CACHE_KEY) || { running: false, installed: false }
  );
  const [pluginSummary, setPluginSummary] = useState({
    loading: true,
    plugins: [],
    smartPackIds: [],
    smartPackNote: "",
    installing: false,
  });
  const [installingSmartPack, setInstallingSmartPack] = useState(false);

  const [warmingUpAll, setWarmingUpAll] = useState(false);
  const [refreshingAll, setRefreshingAll] = useState(false);
  const [actionBanner, setActionBanner] = useState(null);

  const agConnections = useMemo(
    () => connections.filter((c) => c.provider === "antigravity"),
    [connections]
  );

  const fetchQuotasForConnections = useCallback(async (agList, { force = false, signal } = {}) => {
    const activeTargets = agList.filter((c) => c.isActive !== false);
    if (activeTargets.length === 0 || signal?.aborted) return;

    const cachedQuotaMap = getQuotaCache();
    const initialMap = {};
    const needLoading = {};
    const staleTargets = [];
    for (const conn of agList) {
      const cachedEntry = cachedQuotaMap[conn.id];
      if (cachedEntry) {
        initialMap[conn.id] = cachedEntry;
      } else if (conn.isActive !== false) {
        needLoading[conn.id] = true;
      }
      if (conn.isActive !== false && (force || !isQuotaCacheFresh(cachedEntry, QUOTA_FRESH_TTL_MS))) {
        staleTargets.push(conn);
      }
    }
    if (Object.keys(initialMap).length > 0) {
      setQuotaData((prev) => ({ ...initialMap, ...prev }));
    }
    if (staleTargets.length === 0) return;

    if (Object.keys(needLoading).length > 0 || force) {
      setQuotaLoadingIds((prev) => {
        const next = { ...prev };
        for (const t of staleTargets) {
          if (force || !cachedQuotaMap[t.id]) next[t.id] = true;
        }
        return next;
      });
    }

    await runWithConcurrency(staleTargets, 3, async (conn) => {
      try {
        const url = `/api/usage/${conn.id}${force ? "?force=1" : ""}`;
        const res = await fetch(url, { signal });
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
        if (err?.name === "AbortError") return;
        setQuotaErrors((prev) => ({ ...prev, [conn.id]: err?.message || "Không thể tải quota" }));
      } finally {
        setQuotaLoadingIds((prev) => {
          if (!prev[conn.id]) return prev;
          const next = { ...prev };
          delete next[conn.id];
          return next;
        });
      }
    }, signal);
  }, []);

  const loadAllTelemetry = useCallback(
    async ({ force = false, signal } = {}) => {
      try {
        const [providersRes, mitmRes, settingsRes, headroomRes, pluginsRes] = await Promise.allSettled([
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
          fetch("/api/antigravity/plugins", {
            headers: { "Cache-Control": "no-store" },
            signal,
          }).then((r) => (r.ok ? r.json() : null)),
        ]);
        if (signal?.aborted) return;

        if (providersRes.status === "fulfilled" && providersRes.value) {
          const allConns = providersRes.value.connections || [];
          setConnections(allConns);
          setProvidersLoading(false);
          const agOnly = allConns.filter((c) => c.provider === "antigravity");
          fetchQuotasForConnections(agOnly, { force, signal });
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
            toonEnabled: s.toonEnabled !== false,
            toolDedupEnabled: s.toolDedupEnabled !== false,
            headroomEnabled: Boolean(s.headroomEnabled),
            cavemanEnabled: Boolean(s.cavemanEnabled),
            ponytailEnabled: Boolean(s.ponytailEnabled),
          });
        }

        if (headroomRes.status === "fulfilled" && headroomRes.value) {
          setHeadroomStatus(headroomRes.value);
        }

        if (pluginsRes.status === "fulfilled" && pluginsRes.value) {
          const p = pluginsRes.value;
          setPluginSummary({
            loading: false,
            plugins: Array.isArray(p.plugins) ? p.plugins : [],
            smartPackIds: Array.isArray(p.smartPackIds) ? p.smartPackIds : [],
            smartPackNote: p.smartPackNote || "",
            installing: Boolean(p.installing),
          });
        } else {
          setPluginSummary((prev) => ({ ...prev, loading: false }));
        }
      } catch {
        setProvidersLoading(false);
        setMitmLoading(false);
      }
    },
    [fetchQuotasForConnections]
  );

  useEffect(() => {
    const controller = new AbortController();
    const cachedQuotaMap = getQuotaCache();
    if (Object.keys(cachedQuotaMap).length > 0) {
      queueMicrotask(() => {
        if (!controller.signal.aborted) {
          setQuotaData((prev) => ({ ...cachedQuotaMap, ...prev }));
        }
      });
    }
    queueMicrotask(() => {
      if (!controller.signal.aborted) {
        loadAllTelemetry({ signal: controller.signal });
      }
    });
    return () => {
      controller.abort();
    };
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
      savers.toonEnabled,
      savers.toolDedupEnabled,
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
          setDnsError("Yêu cầu mật khẩu sudo trên macOS/Linux");
        } else {
          setDnsError(msg);
        }
        playHudSound("alert");
        setActionBanner({
          tone: "error",
          text: msg,
          href: "/dashboard/mitm",
          hrefLabel: "Mở bảng MITM",
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
          ? "Đã bật chặn DNS Antigravity (Không cần khởi động lại IDE)"
          : "Đã chuyển Antigravity sang chế độ Passthrough thông minh";
      notify.success(msg);
      setActionBanner({ tone: "success", text: msg });
    } catch (err) {
      const msg = err?.message || "Không thể bật/tắt DNS Antigravity";
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
    setActionBanner({ tone: "info", text: "Đang làm nóng toàn bộ tài khoản Antigravity..." });

    try {
      const res = await fetch("/api/oauth/antigravity/warmup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ all: true }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || `Làm nóng thất bại (${res.status})`);
      }
      const results = Array.isArray(data.results) ? data.results : [];
      const okCount = results.filter((r) => r.ok).length;
      const msg =
        results.length > 0
          ? `Hoàn tất làm nóng: ${okCount}/${results.length} tài khoản hoạt động`
          : data.message || "Đã hoàn tất làm nóng";
      playHudSound("confirm");
      notify.success(msg);
      setActionBanner({ tone: "success", text: msg });
      invalidateCache(PROVIDERS_CACHE_KEY);
      await loadAllTelemetry({ force: true });
    } catch (err) {
      const msg = err?.message || "Làm nóng thất bại";
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
    setActionBanner({ tone: "info", text: "Đang làm mới OAuth token & quota Antigravity..." });

    try {
      const res = await fetch("/api/oauth/antigravity/refresh-all", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || `Làm mới thất bại (${res.status})`);
      }
      const msg = data.message || `Đã làm mới ${data.refreshedCount ?? 0}/${data.total ?? 0} token`;
      playHudSound("confirm");
      notify.success(msg);
      setActionBanner({ tone: "success", text: msg });
      invalidateCache(PROVIDERS_CACHE_KEY);
      await loadAllTelemetry({ force: true });
    } catch (err) {
      const msg = err?.message || "Làm mới token thất bại";
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
          text: `${label}: ${nextVal ? "Đã bật" : "Đã tắt"}`,
        });
      } catch (err) {
        setSavers((prev) => ({ ...prev, [key]: prevVal }));
        playHudSound("alert");
        notify.error(`Lỗi cập nhật ${label}: ${err?.message || "Lỗi mạng"}`);
      } finally {
        setSavingSettingKey(null);
      }
    },
    [notify, savers, savingSettingKey]
  );

  const handleInstallSmartPack = useCallback(async () => {
    if (installingSmartPack) return;
    playHudSound("click");
    setInstallingSmartPack(true);
    setActionBanner({
      tone: "info",
      text: "Đang cài trọn gói Plugin Antigravity thông minh...",
    });
    try {
      const res = await fetch("/api/antigravity/plugins/install", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "install-smart-pack",
          autoResolveConflicts: true,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.ok === false) {
        throw new Error(data.error || `Cài đặt thất bại (${res.status})`);
      }
      if (data.status && typeof data.status === "object") {
        setPluginSummary({
          loading: false,
          plugins: Array.isArray(data.status.plugins) ? data.status.plugins : [],
          smartPackIds: Array.isArray(data.status.smartPackIds) ? data.status.smartPackIds : [],
          smartPackNote: data.status.smartPackNote || "",
          installing: Boolean(data.status.installing),
        });
      }
      playHudSound("confirm");
      const msg = "Đã cài đặt xong gói Plugin Antigravity thông minh";
      notify.success(msg);
      setActionBanner({ tone: "success", text: msg });
    } catch (err) {
      const msg = err?.message || "Không thể cài gói Plugin Antigravity";
      playHudSound("alert");
      notify.error(msg);
      setActionBanner({ tone: "error", text: msg });
    } finally {
      setInstallingSmartPack(false);
    }
  }, [installingSmartPack, notify]);

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
      label: "Bộ lọc RTK",
      code: "RTK",
      desc: "Nén kết quả CLI/công cụ trước khi đưa vào ngữ cảnh Antigravity.",
      statusText: savers.rtkEnabled ? "ĐANG BẬT" : "ĐANG CHỜ",
    },
    {
      key: "toonEnabled",
      label: "Nén bảng TOON",
      code: "TOON",
      desc: "Chuyển mảng JSON đồng nhất trong tool output sang bảng cô đọng.",
      statusText: savers.toonEnabled ? "ĐANG BẬT" : "ĐANG CHỜ",
    },
    {
      key: "toolDedupEnabled",
      label: "Khử lặp Tool (Dedup)",
      code: "DEDUP",
      desc: "Thay thế các lần đọc file / output trùng lặp bằng tham chiếu SHA-256.",
      statusText: savers.toolDedupEnabled ? "ĐANG BẬT" : "ĐANG CHỜ",
    },
    {
      key: "headroomEnabled",
      label: "Headroom Sidecar",
      code: "HEADROOM",
      desc: "Proxy nén ngữ cảnh ngữ nghĩa cho các phiên IDE dài.",
      statusText: headroomStatus?.running
        ? "ĐANG CHẠY"
        : headroomStatus?.installed
          ? "ĐÃ CÀI ĐẶT"
          : "CHƯA CÀI",
      statusLive: Boolean(headroomStatus?.running),
    },
    {
      key: "cavemanEnabled",
      label: "Nén đầu ra Caveman",
      code: "CAVEMAN",
      desc: "Chèn chỉ thị trả lời ngắn gọn, giảm lượng token phản hồi thừa.",
      statusText: savers.cavemanEnabled ? "ĐANG TIÊM" : "ĐANG CHỜ",
    },
    {
      key: "ponytailEnabled",
      label: "Tối giản Ponytail",
      code: "PONYTAIL",
      desc: "Loại bỏ nhiễu dư thừa khi agent chạy vòng lặp nhiều bước.",
      statusText: savers.ponytailEnabled ? "ĐANG TỐI ƯU" : "ĐANG CHỜ",
    },
  ];

  const installedPluginsCount = pluginSummary.plugins.filter((p) => p.installed).length;
  const totalPluginsCount = pluginSummary.plugins.length;
  const missingSmartCount = pluginSummary.smartPackIds.filter(
    (id) => !pluginSummary.plugins.some((p) => p.id === id && p.installed)
  ).length;

  const activeRatioPct =
    telemetrySummary.totalCount > 0
      ? Math.round((telemetrySummary.activeCount / telemetrySummary.totalCount) * 100)
      : 0;
  const saverRatioPct = Math.round((telemetrySummary.armedSaversCount / 6) * 100);

  return (
    <div className="flex flex-col gap-5 pb-6">
      {/* 1. HERO TELEMETRY STRIP */}
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="inline-flex items-center gap-2 rounded-md border border-cyan-500/35 bg-cyan-500/10 px-3 py-1 font-mono text-[11px] font-bold uppercase tracking-[0.16em] text-cyan-700 dark:text-cyan-300 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
              <span
                className={cn(
                  "size-2 rounded-full bg-cyan-500 shadow-[0_0_8px_rgba(6,182,212,0.9)]",
                  !motionPaused && "animate-pulse"
                )}
              />
              TRUNG TÂM ĐIỀU KHIỂN ANTIGRAVITY
            </span>
            {machineId ? (
              <span className="hidden sm:inline-flex items-center gap-1 rounded border border-border bg-surface-2/80 px-2 py-0.5 font-mono text-[10px] text-text-muted">
                MÁY {machineId.slice(0, 8).toUpperCase()}
              </span>
            ) : null}
          </div>

          <div className="flex items-center gap-2">
            <MagneticButton strength={4}>
              <Button
                variant="outline"
                size="sm"
                icon="sync"
                data-cursor-target
                onClick={() => {
                  playHudSound("click");
                  loadAllTelemetry({ force: true });
                }}
                loading={providersLoading}
              >
                Đồng bộ Telemetry
              </Button>
            </MagneticButton>
          </div>
        </div>

        {/* 4 KPI Readouts */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
          <HudFrame accent="cyan" padding="sm" chamfer="sm" tilt={true}>
            <div className="flex items-center justify-between gap-2">
              <span className="font-mono text-[10px] font-semibold uppercase tracking-wider text-text-muted">
                Tài khoản AG đang bật
              </span>
              <span className="flex size-7 shrink-0 items-center justify-center rounded-lg border border-cyan-500/30 bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
                <span className="material-symbols-outlined text-[15px]">groups</span>
              </span>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="font-mono text-2xl font-bold text-text-main hud-telemetry-num">
                <NumberTicker value={telemetrySummary.activeCount} />
              </span>
              <span className="font-mono text-xs text-text-muted hud-telemetry-num">
                / {telemetrySummary.totalCount} tổng
              </span>
            </div>
            <div className="mt-2.5 h-1 w-full overflow-hidden rounded-full bg-surface-3/80">
              <div
                className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-sky-400 transition-all duration-500"
                style={{ width: `${activeRatioPct}%` }}
              />
            </div>
          </HudFrame>

          <HudFrame
            accent={avgQuotaAccent}
            padding="sm"
            chamfer="sm"
            tilt={true}
            borderBeam={telemetrySummary.healthyCount > 0}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="font-mono text-[10px] font-semibold uppercase tracking-wider text-text-muted">
                Quota trung bình
              </span>
              <span
                className={cn(
                  "flex size-7 shrink-0 items-center justify-center rounded-lg border shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]",
                  telemetrySummary.avgQuotaPct !== null && telemetrySummary.avgQuotaPct < 30
                    ? "border-rose-500/30 bg-rose-500/10 text-rose-600 dark:text-rose-400"
                    : telemetrySummary.avgQuotaPct !== null && telemetrySummary.avgQuotaPct <= 70
                      ? "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400"
                      : "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                )}
              >
                <span className="material-symbols-outlined text-[15px]">donut_large</span>
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
                {telemetrySummary.healthyCount} sẵn sàng
              </span>
            </div>
            <div className="mt-2.5 h-1 w-full overflow-hidden rounded-full bg-surface-3/80">
              <div
                className={cn(
                  "h-full rounded-full transition-all duration-500",
                  telemetrySummary.avgQuotaPct === null
                    ? "bg-cyan-500/40"
                    : telemetrySummary.avgQuotaPct > 70
                      ? "bg-gradient-to-r from-emerald-500 to-teal-400"
                      : telemetrySummary.avgQuotaPct >= 30
                        ? "bg-gradient-to-r from-amber-500 to-yellow-400"
                        : "bg-gradient-to-r from-rose-500 to-orange-400"
                )}
                style={{ width: `${telemetrySummary.avgQuotaPct ?? 0}%` }}
              />
            </div>
          </HudFrame>

          <HudFrame
            accent={mitmStatus?.running ? "emerald" : "amber"}
            padding="sm"
            chamfer="sm"
            tilt={true}
            borderBeam={Boolean(mitmStatus?.running)}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="font-mono text-[10px] font-semibold uppercase tracking-wider text-text-muted">
                Trạng thái MITM
              </span>
              <span
                className={cn(
                  "flex size-7 shrink-0 items-center justify-center rounded-lg border shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]",
                  mitmStatus?.running
                    ? "border-emerald-500/35 bg-emerald-500/12 text-emerald-600 dark:text-emerald-400"
                    : "border-amber-500/35 bg-amber-500/12 text-amber-600 dark:text-amber-400"
                )}
              >
                <span className="material-symbols-outlined text-[15px]">security</span>
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
                    ? "ĐANG CHẶN DNS"
                    : "PASSTHROUGH"
                  : "ĐANG CHỜ"}
              </span>
            </div>
            <div className="mt-2.5 h-1 w-full overflow-hidden rounded-full bg-surface-3/80">
              <div
                className={cn(
                  "h-full rounded-full transition-all duration-500",
                  mitmStatus?.running
                    ? "bg-gradient-to-r from-emerald-500 to-cyan-400"
                    : "bg-amber-500/55"
                )}
                style={{ width: mitmStatus?.running ? "100%" : "28%" }}
              />
            </div>
          </HudFrame>

          <HudFrame accent="cyan" padding="sm" chamfer="sm" tilt={true}>
            <div className="flex items-center justify-between gap-2">
              <span className="font-mono text-[10px] font-semibold uppercase tracking-wider text-text-muted">
                Tiết kiệm Token
              </span>
              <span className="flex size-7 shrink-0 items-center justify-center rounded-lg border border-cyan-500/30 bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
                <span className="material-symbols-outlined text-[15px]">bolt</span>
              </span>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="font-mono text-2xl font-bold text-cyan-600 dark:text-cyan-400 hud-telemetry-num">
                <NumberTicker value={telemetrySummary.armedSaversCount} suffix="/6" />
              </span>
              <span className="font-mono text-xs text-text-muted">
                {headroomStatus?.running ? "HEADROOM CHẠY" : "ĐÃ BẬT"}
              </span>
            </div>
            <div className="mt-2.5 h-1 w-full overflow-hidden rounded-full bg-surface-3/80">
              <div
                className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-indigo-400 transition-all duration-500"
                style={{ width: `${saverRatioPct}%` }}
              />
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
          header="Thao tác nhanh"
          statusDot="cyan"
        >
          <div className="flex flex-col gap-2.5">
            <div className="grid grid-cols-2 gap-2">
              <MagneticButton className="block w-full" strength={4}>
                <Button
                  variant="primary"
                  size="sm"
                  icon="local_fire_department"
                  data-cursor-target
                  loading={warmingUpAll}
                  disabled={refreshingAll || agConnections.length === 0}
                  onClick={handleWarmupAll}
                  fullWidth
                >
                  Làm nóng tất cả
                </Button>
              </MagneticButton>
              <MagneticButton className="block w-full" strength={4}>
                <Button
                  variant="secondary"
                  size="sm"
                  icon="key"
                  data-cursor-target
                  loading={refreshingAll}
                  disabled={warmingUpAll || agConnections.length === 0}
                  onClick={handleRefreshAll}
                  fullWidth
                >
                  Làm mới Token
                </Button>
              </MagneticButton>
            </div>

            <div className="flex flex-col gap-1.5 pt-1">
              <Link
                href="/dashboard/mitm"
                data-cursor-target
                onClick={() => playHudSound("click")}
                className="group flex items-center justify-between rounded-lg border border-border-subtle bg-gradient-to-r from-surface-2/80 to-surface/60 px-3 py-2 text-xs font-medium text-text-main hover:border-cyan-500/45 hover:bg-surface-3/70 hover:shadow-[0_4px_14px_-6px_rgba(6,182,212,0.2)] transition-all duration-200"
              >
                <span className="flex items-center gap-2">
                  <span className="flex size-6 items-center justify-center rounded-md border border-cyan-500/25 bg-cyan-500/10 text-cyan-600 dark:text-cyan-400">
                    <span className="material-symbols-outlined text-[14px]">tune</span>
                  </span>
                  <span>Ánh xạ Model MITM</span>
                </span>
                <span className="font-mono text-[10px] text-text-muted group-hover:text-cyan-500 transition-colors">
                  /mitm →
                </span>
              </Link>

              <Link
                href="/dashboard/endpoint"
                data-cursor-target
                onClick={() => playHudSound("click")}
                className="group flex items-center justify-between rounded-lg border border-border-subtle bg-gradient-to-r from-surface-2/80 to-surface/60 px-3 py-2 text-xs font-medium text-text-main hover:border-cyan-500/45 hover:bg-surface-3/70 hover:shadow-[0_4px_14px_-6px_rgba(6,182,212,0.2)] transition-all duration-200"
              >
                <span className="flex items-center gap-2">
                  <span className="flex size-6 items-center justify-center rounded-md border border-cyan-500/25 bg-cyan-500/10 text-cyan-600 dark:text-cyan-400">
                    <span className="material-symbols-outlined text-[14px]">api</span>
                  </span>
                  <span>Endpoint &amp; Khóa API</span>
                </span>
                <span className="font-mono text-[10px] text-text-muted group-hover:text-cyan-500 transition-colors">
                  /v1 →
                </span>
              </Link>

              <Link
                href="/dashboard/console-log"
                data-cursor-target
                onClick={() => playHudSound("click")}
                className="group flex items-center justify-between rounded-lg border border-border-subtle bg-gradient-to-r from-surface-2/80 to-surface/60 px-3 py-2 text-xs font-medium text-text-main hover:border-cyan-500/45 hover:bg-surface-3/70 hover:shadow-[0_4px_14px_-6px_rgba(6,182,212,0.2)] transition-all duration-200"
              >
                <span className="flex items-center gap-2">
                  <span className="flex size-6 items-center justify-center rounded-md border border-cyan-500/25 bg-cyan-500/10 text-cyan-600 dark:text-cyan-400">
                    <span className="material-symbols-outlined text-[14px]">monitoring</span>
                  </span>
                  <span>Nhật ký Console trực tiếp</span>
                </span>
                <span className="font-mono text-[10px] text-text-muted group-hover:text-cyan-500 transition-colors">
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
                  <Link href={actionBanner.href} data-cursor-target className="underline font-semibold">
                    {actionBanner.hrefLabel || "Mở"}
                  </Link>
                ) : null}
                <button
                  type="button"
                  data-cursor-target
                  onClick={() => setActionBanner(null)}
                  className="opacity-70 hover:opacity-100 cursor-pointer"
                  aria-label="Đóng thông báo"
                >
                  <span className="material-symbols-outlined text-[14px]">close</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="rounded-lg border border-border-subtle bg-surface/60 px-2.5 py-2 font-mono text-[10.5px] text-text-muted">
              Sẵn sàng làm nóng Antigravity, làm mới token và định tuyến trực tiếp.
            </div>
          )}
        </HudFrame>
      </div>

      {/* 3. LOWER SPLIT GRID: Account Pool (Left) + Token Saver Matrix (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
        {/* LEFT: Antigravity Account Pool */}
        <HudFrame className="lg:col-span-7" accent="cyan" padding="md" chamfer="md">
          <div className="flex flex-wrap items-center justify-between gap-2 pb-3 mb-3.5 border-b border-border-subtle">
            <div className="flex items-center gap-2.5">
              <div className="flex size-8 items-center justify-center rounded-lg border border-cyan-500/30 bg-cyan-500/10 overflow-hidden shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
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
                  Nhóm tài khoản Antigravity
                </h2>
                <p className="font-mono text-[10.5px] text-text-muted">
                  Theo dõi quota OAuth theo thời gian thực
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Link
                href="/dashboard/quota?provider=antigravity"
                data-cursor-target
                onClick={() => playHudSound("click")}
                className="inline-flex items-center gap-1 rounded-md border border-border bg-surface-2 px-2.5 py-1 font-mono text-[10.5px] font-semibold text-text-main hover:border-cyan-500/45 hover:shadow-[0_0_12px_rgba(6,182,212,0.14)] transition-all"
              >
                <span>Bảng Quota</span>
                <span className="material-symbols-outlined text-[13px]">open_in_new</span>
              </Link>
              <Link
                href="/dashboard/providers/antigravity"
                data-cursor-target
                onClick={() => playHudSound("click")}
                className="inline-flex items-center gap-1 rounded-md border border-cyan-500/35 bg-cyan-500/10 px-2.5 py-1 font-mono text-[10.5px] font-semibold text-cyan-700 dark:text-cyan-300 hover:bg-cyan-500/20 hover:shadow-[0_0_12px_rgba(6,182,212,0.18)] transition-all"
              >
                <span>Quản lý</span>
                <span className="material-symbols-outlined text-[13px]">arrow_forward</span>
              </Link>
            </div>
          </div>

          {providersLoading && agConnections.length === 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
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
                  Chưa kết nối tài khoản Antigravity
                </p>
                <p className="mt-1 text-xs text-text-muted">
                  Kết nối tài khoản Antigravity OAuth để dùng Gemini 4, Claude và tự động chuyển mạch dự phòng.
                </p>
              </div>
              <MagneticButton strength={4}>
                <Link
                  href="/dashboard/providers/antigravity"
                  data-cursor-target
                  onClick={() => playHudSound("click")}
                >
                  <Button variant="primary" size="sm" icon="add_circle" data-cursor-target>
                    Kết nối tài khoản Antigravity
                  </Button>
                </Link>
              </MagneticButton>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
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
                const breakdown = extractFamilyBreakdown(quotaEntry);
                const accountLabel =
                  conn.email || conn.displayName || conn.name || conn.id.slice(0, 10);

                return (
                  <div
                    key={conn.id}
                    className={cn(
                      "flex items-center gap-3.5 rounded-xl border p-3.5 transition-all duration-200",
                      "bg-gradient-to-br from-surface-2/85 via-surface-2/70 to-surface/60 backdrop-blur-sm",
                      "hover:-translate-y-0.5",
                      blocked || healthStatus === "exhausted" || healthStatus === "error"
                        ? "border-rose-500/35 hover:border-rose-500/55 hover:shadow-[0_6px_20px_-6px_rgba(244,63,94,0.22)]"
                        : healthStatus === "low"
                          ? "border-amber-500/35 hover:border-amber-500/55 hover:shadow-[0_6px_20px_-6px_rgba(245,158,11,0.22)]"
                          : conn.isActive === false
                            ? "border-border opacity-70"
                            : "border-border hover:border-cyan-500/45 hover:shadow-[0_6px_20px_-6px_rgba(6,182,212,0.2)]"
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

                      <div className="flex flex-wrap items-center gap-1.5">
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

                      {breakdown.length > 0 ? (
                        <div className="flex items-center gap-3 font-mono text-[10px] text-text-muted hud-telemetry-num">
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
                          data-cursor-target
                          className="font-mono text-[10px] text-rose-600 dark:text-rose-400 underline truncate"
                        >
                          Xác minh tài khoản Google →
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
          <div className="flex flex-wrap items-center justify-between gap-2 pb-3 mb-3.5 border-b border-border-subtle">
            <div>
              <h2 className="text-sm font-bold text-text-main tracking-tight">
                Ma trận Tiết kiệm Token
              </h2>
              <p className="font-mono text-[10.5px] text-text-muted">
                Đang bật {telemetrySummary.armedSaversCount}/6 lớp nén
              </p>
            </div>
            <Link
              href="/dashboard/token-saver"
              data-cursor-target
              onClick={() => playHudSound("click")}
              className="inline-flex items-center gap-1 rounded-md border border-cyan-500/35 bg-cyan-500/10 px-2.5 py-1 font-mono text-[10.5px] font-semibold text-cyan-700 dark:text-cyan-300 hover:bg-cyan-500/20 hover:shadow-[0_0_12px_rgba(6,182,212,0.18)] transition-all"
            >
              <span>Xem tất cả</span>
              <span className="material-symbols-outlined text-[13px]">arrow_forward</span>
            </Link>
          </div>

          <div className="flex flex-col gap-3">
            {saverRows.map((item) => {
              const checked = Boolean(savers[item.key]);
              const busy = savingSettingKey === item.key;

              return (
                <div
                  key={item.key}
                  className={cn(
                    "flex items-center justify-between gap-3.5 rounded-xl border p-3.5 transition-all duration-200",
                    checked
                      ? "border-cyan-500/35 bg-gradient-to-r from-cyan-500/[0.08] via-surface-2/75 to-surface/60 hover:border-cyan-500/55 hover:shadow-[0_4px_18px_-6px_rgba(6,182,212,0.22)]"
                      : "border-border-subtle bg-gradient-to-r from-surface-2/70 to-surface/55 hover:border-cyan-500/30 hover:shadow-[0_4px_14px_-6px_rgba(6,182,212,0.12)]"
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
                    aria-label={`Bật / Tắt ${item.label}`}
                    data-cursor-target
                    disabled={busy}
                    onClick={() => handleToggleSaver(item.key, item.label)}
                    className={cn(
                      "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors cursor-pointer",
                      "focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/60",
                      checked
                        ? "border-cyan-500/60 bg-cyan-500 shadow-[0_0_10px_rgba(6,182,212,0.35)]"
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

          {/* Compact Layer-2 Antigravity Plugin Pack Bar */}
          <div className="mt-3.5 pt-3.5 border-t border-border-subtle">
            <div className="flex flex-wrap items-center justify-between gap-2.5 rounded-xl border border-cyan-500/25 bg-cyan-500/[0.06] px-3 py-2.5">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="material-symbols-outlined text-[15px] text-cyan-600 dark:text-cyan-400">
                    extension
                  </span>
                  <span className="text-xs font-bold text-text-main">
                    Gói Plugin Antigravity
                  </span>
                  <span className="rounded border border-cyan-500/30 bg-cyan-500/10 px-1.5 py-0.2 font-mono text-[9.5px] font-bold text-cyan-700 dark:text-cyan-300">
                    {pluginSummary.loading
                      ? "ĐANG QUÉT…"
                      : `${installedPluginsCount}/${totalPluginsCount || 6} ĐÃ CÀI`}
                  </span>
                </div>
                <p className="mt-0.5 font-mono text-[10.5px] text-text-muted truncate">
                  {pluginSummary.loading
                    ? "Đang kiểm tra plugin tầng 2 (agy-dart / codegraph)…"
                    : missingSmartCount === 0 && pluginSummary.smartPackIds.length > 0
                      ? `Đã đủ Smart Pack (${pluginSummary.smartPackIds.join(" + ")})`
                      : pluginSummary.smartPackIds.length > 0
                        ? `Gợi ý: ${pluginSummary.smartPackIds.join(" + ")}`
                        : "Cài đặt plugin tiết kiệm token cho Antigravity IDE"}
                </p>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                {!pluginSummary.loading && missingSmartCount > 0 && (
                  <Button
                    variant="primary"
                    size="xs"
                    icon="bolt"
                    loading={installingSmartPack || pluginSummary.installing}
                    onClick={handleInstallSmartPack}
                    data-cursor-target
                  >
                    Cài gói thông minh
                  </Button>
                )}
                <Link
                  href="/dashboard/token-saver#antigravity-plugins"
                  data-cursor-target
                  onClick={() => playHudSound("click")}
                  className="inline-flex items-center gap-1 rounded-md border border-cyan-500/35 bg-surface/80 px-2 py-1 font-mono text-[10px] font-semibold text-cyan-700 dark:text-cyan-300 hover:bg-cyan-500/15 transition-colors"
                >
                  <span>Chi tiết</span>
                  <span className="material-symbols-outlined text-[12px]">arrow_forward</span>
                </Link>
              </div>
            </div>
          </div>
        </HudFrame>
      </div>
    </div>
  );
}
