"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Button, Input, Modal, Toggle, ConfirmModal } from "@/shared/components";
import { HudFrame, NumberTicker } from "@/shared/components/hud";
import { useHudPrefs } from "@/shared/hooks/useHudPrefs";
import { playHudSound } from "@/shared/utils/hudAudio";
import { useCopyToClipboard } from "@/shared/hooks/useCopyToClipboard";
import { getCurrentLocale, onLocaleChange } from "@/i18n/runtime";
import {
  WENYAN_LOCALES,
  CAVEMAN_LEVELS,
  PONYTAIL_LEVELS,
  CLAUDE_CACHE_TTLS,
} from "../endpoint/endpointConstants";

function CompatibilityBadge({ type }) {
  if (type === "claude") {
    return (
      <span
        className="inline-flex items-center gap-1 rounded border border-amber-500/40 bg-amber-500/12 px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-300"
        data-i18n-skip="true"
      >
        <span className="material-symbols-outlined text-[12px]">deployed_code</span>
        <span>Chỉ Claude / Anthropic</span>
      </span>
    );
  }
  return (
    <span
      className="inline-flex items-center gap-1 rounded border border-cyan-500/40 bg-cyan-500/12 px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider text-cyan-700 dark:text-cyan-300"
      data-i18n-skip="true"
    >
      <span className="material-symbols-outlined text-[12px]">rocket_launch</span>
      <span>Tương thích Antigravity</span>
    </span>
  );
}

export default function TokenSaverClient() {
  const [rtkEnabled, setRtkEnabledState] = useState(true);
  const [headroomEnabled, setHeadroomEnabled] = useState(false);
  const [headroomUrl, setHeadroomUrl] = useState("http://localhost:8787");
  const [headroomTimeoutMs, setHeadroomTimeoutMs] = useState(3000);
  const [headroomStatus, setHeadroomStatus] = useState({
    installed: false,
    running: false,
    python: null,
    loading: true,
  });
  const [showHeadroomInstallModal, setShowHeadroomInstallModal] =
    useState(false);
  const [headroomActionLoading, setHeadroomActionLoading] = useState(false);
  const [headroomActionError, setHeadroomActionError] = useState("");
  const [headroomExtras, setHeadroomExtras] = useState({
    version: null,
    extras: { code: false, ml: false },
    available: ["code", "ml"],
    loading: false,
  });
  const [pendingExtras, setPendingExtras] = useState([]);
  const [extrasActionLoading, setExtrasActionLoading] = useState(false);
  const [extrasActionError, setExtrasActionError] = useState("");
  const [removingExtra, setRemovingExtra] = useState(null);
  const [installLog, setInstallLog] = useState("");
  const [extrasConfirm, setExtrasConfirm] = useState(null);
  const [codeAware, setCodeAware] = useState(false);
  const [kompress, setKompress] = useState(true);
  const [restartingProxy, setRestartingProxy] = useState(false);
  const logPollRef = useRef(null);
  const logRequestRef = useRef(0);
  const [cavemanEnabled, setCavemanEnabled] = useState(false);
  const [cavemanLevel, setCavemanLevel] = useState("full");
  const [ponytailEnabled, setPonytailEnabled] = useState(false);
  const [ponytailLevel, setPonytailLevel] = useState("full");
  const [customPromptEnabled, setCustomPromptEnabled] = useState(false);
  const [customPrompt, setCustomPrompt] = useState("");
  const [pxpipeEnabled, setPxpipeEnabled] = useState(false);
  const [pxpipeMinChars, setPxpipeMinChars] = useState(25000);
  const [claudeCacheTtl, setClaudeCacheTtl] = useState("5m");
  const [pxpipeStatus, setPxpipeStatus] = useState({
    installed: false,
    installing: false,
    running: false,
    version: null,
    loading: true,
  });
  const [pxpipeHealth, setPxpipeHealth] = useState(null);
  const [showPxpipeModal, setShowPxpipeModal] = useState(false);
  const [pxpipeActionLoading, setPxpipeActionLoading] = useState(false);
  const [pxpipeActionError, setPxpipeActionError] = useState("");
  const [locale, setLocale] = useState("vi");

  const { copied, copy } = useCopyToClipboard();
  const { motionPaused } = useHudPrefs();

  useEffect(() => {
    return onLocaleChange(() => setLocale(getCurrentLocale()));
  }, []);

  const isWenyanLocale = WENYAN_LOCALES.includes(locale);
  const visibleCavemanLevels = isWenyanLocale
    ? CAVEMAN_LEVELS
    : CAVEMAN_LEVELS.filter((lvl) => !lvl.wenyan);

  const patchSetting = async (patch) => {
    try {
      await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
    } catch (error) {
      console.log("Error updating setting:", error);
    }
  };

  useEffect(() => {
    const current = CAVEMAN_LEVELS.find((lvl) => lvl.id === cavemanLevel);
    if (current?.wenyan && !isWenyanLocale) {
      queueMicrotask(() => {
        setCavemanLevel("ultra");
        patchSetting({ cavemanLevel: "ultra" });
      });
    }
  }, [isWenyanLocale, cavemanLevel]);

  const handleRtkEnabled = async (value) => {
    playHudSound("toggle");
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rtkEnabled: value }),
      });
      if (res.ok) setRtkEnabledState(value);
    } catch (error) {
      console.log("Error updating rtkEnabled:", error);
    }
  };

  const handleCavemanEnabled = (value) => {
    playHudSound("toggle");
    setCavemanEnabled(value);
    patchSetting({ cavemanEnabled: value });
  };

  const handleHeadroomEnabled = (value) => {
    playHudSound("toggle");
    const nextUrl = headroomUrl.trim() || "http://localhost:8787";
    setHeadroomUrl(nextUrl);
    setHeadroomEnabled(value);
    patchSetting({ headroomEnabled: value, headroomUrl: nextUrl });
  };

  const refreshHeadroomStatus = useCallback(async () => {
    setHeadroomStatus((s) => ({ ...s, loading: true }));
    try {
      const res = await fetch("/api/headroom/status", {
        headers: { "Cache-Control": "no-store" },
      });
      const data = await res.json();
      setHeadroomStatus({ ...data, loading: false });
      if (!data?.installed) {
        setHeadroomExtras({
          version: null,
          extras: { code: false, ml: false },
          available: ["code", "ml"],
          loading: false,
        });
        setPendingExtras([]);
        return;
      }
      try {
        const er = await fetch("/api/headroom/extras", {
          headers: { "Cache-Control": "no-store" },
        });
        if (!er.ok) throw new Error("extras status failed");
        const ed = await er.json();
        setHeadroomExtras((s) => ({
          ...s,
          version: ed.version ?? null,
          extras: ed.extras || { code: false, ml: false },
          available: ed.available || ["code", "ml"],
          loading: false,
        }));
        setPendingExtras([]);
      } catch {
        setHeadroomExtras({
          version: null,
          extras: { code: false, ml: false },
          available: ["code", "ml"],
          loading: false,
        });
        setPendingExtras([]);
      }
    } catch {
      setHeadroomStatus({
        installed: false,
        running: false,
        python: null,
        loading: false,
      });
      setHeadroomExtras({
        version: null,
        extras: { code: false, ml: false },
        available: ["code", "ml"],
        loading: false,
      });
      setPendingExtras([]);
    }
  }, []);

  const handleHeadroomUrlBlur = async () => {
    const next = headroomUrl.trim() || "http://localhost:8787";
    setHeadroomUrl(next);
    await patchSetting({ headroomUrl: next });
    refreshHeadroomStatus();
  };

  const handleHeadroomStart = useCallback(async () => {
    setHeadroomActionError("");
    setHeadroomActionLoading(true);
    try {
      const res = await fetch("/api/headroom/start", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to start proxy");
      playHudSound("confirm");
      await refreshHeadroomStatus();
    } catch (e) {
      playHudSound("alert");
      setHeadroomActionError(e.message);
    } finally {
      setHeadroomActionLoading(false);
    }
  }, [refreshHeadroomStatus]);

  const handleHeadroomStop = useCallback(async () => {
    setHeadroomActionLoading(true);
    try {
      await fetch("/api/headroom/stop", { method: "POST" });
      playHudSound("toggle");
      await refreshHeadroomStatus();
    } finally {
      setHeadroomActionLoading(false);
    }
  }, [refreshHeadroomStatus]);

  const togglePendingExtra = (extra) => {
    playHudSound("click");
    setPendingExtras((cur) =>
      cur.includes(extra) ? cur.filter((e) => e !== extra) : [...cur, extra]
    );
  };

  const refreshInstallLog = useCallback(async () => {
    const requestId = ++logRequestRef.current;
    try {
      const r = await fetch("/api/headroom/extras?log=1", {
        headers: { "Cache-Control": "no-store" },
      });
      const d = await r.json().catch(() => ({}));
      if (requestId === logRequestRef.current && typeof d.log === "string") setInstallLog(d.log);
    } catch { /* ignore transient poll errors */ }
  }, []);

  // Poll while running, and retain the final log after the action completes.
  const startLogPolling = useCallback(() => {
    setInstallLog("");
    if (logPollRef.current) clearInterval(logPollRef.current);
    refreshInstallLog();
    logPollRef.current = setInterval(refreshInstallLog, 1500);
  }, [refreshInstallLog]);

  const stopLogPolling = useCallback(() => {
    // Discard responses from polls started before the final refresh or unmount.
    logRequestRef.current++;
    if (logPollRef.current) {
      clearInterval(logPollRef.current);
      logPollRef.current = null;
    }
  }, []);

  useEffect(() => () => stopLogPolling(), [stopLogPolling]);

  const installExtrasConfirmed = useCallback(async () => {
    if (pendingExtras.length === 0) return;
    setExtrasActionLoading(true);
    setExtrasActionError("");
    startLogPolling();
    let readFinalLog = false;
    try {
      const res = await fetch("/api/headroom/extras", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ extras: pendingExtras }),
      });
      const data = await res.json().catch(() => ({}));
      readFinalLog = res.ok || data.code === "INSTALL_FAILED";
      if (!res.ok) throw new Error(data.error || "Install failed");
      setHeadroomExtras((s) => ({
        ...s,
        version: data.version ?? s.version,
        extras: data.extras || s.extras,
      }));
      setPendingExtras([]);
      playHudSound("confirm");
    } catch (e) {
      playHudSound("alert");
      setExtrasActionError(e.message);
    } finally {
      stopLogPolling();
      setExtrasActionLoading(false);
      if (readFinalLog) await refreshInstallLog();
      else setInstallLog("");
    }
  }, [pendingExtras, startLogPolling, stopLogPolling, refreshInstallLog]);

  const removeExtraConfirmed = useCallback(async (extra) => {
    setRemovingExtra(extra);
    setExtrasActionError("");
    startLogPolling();
    let readFinalLog = false;
    try {
      const res = await fetch("/api/headroom/extras", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ extras: [extra] }),
      });
      const data = await res.json().catch(() => ({}));
      readFinalLog = res.ok || data.code === "UNINSTALL_FAILED";
      if (!res.ok) throw new Error(data.error || "Remove failed");
      setHeadroomExtras((s) => ({
        ...s,
        version: data.version ?? s.version,
        extras: data.extras || s.extras,
      }));
      playHudSound("confirm");
    } catch (e) {
      playHudSound("alert");
      setExtrasActionError(e.message);
    } finally {
      stopLogPolling();
      setRemovingExtra(null);
      if (readFinalLog) await refreshInstallLog();
      else setInstallLog("");
    }
  }, [startLogPolling, stopLogPolling, refreshInstallLog]);

  const handleInstallExtras = useCallback(() => {
    if (pendingExtras.length === 0) return;
    // Warn about the heavy ~1GB torch download before installing [ml].
    if (pendingExtras.includes("ml")) {
      setExtrasConfirm({
        title: "Install [ml]",
        message: "[ml] downloads ~1 GB (torch + huggingface-hub). Continue?",
        confirmText: "Install",
        variant: "primary",
        onConfirm: installExtrasConfirmed,
      });
      return;
    }
    installExtrasConfirmed();
  }, [pendingExtras, installExtrasConfirmed]);

  const handleRemoveExtra = useCallback((extra) => {
    setExtrasConfirm({
      title: `Remove [${extra}]`,
      message: `Remove [${extra}] and its packages?`,
      confirmText: "Remove",
      variant: "danger",
      onConfirm: () => removeExtraConfirmed(extra),
    });
  }, [removeExtraConfirmed]);

  // Toggle an extra's active state (persist setting), then restart the proxy so
  // the new --code-aware / --disable-kompress flags take effect.
  const toggleExtraActive = useCallback(async (extra, value) => {
    playHudSound("toggle");
    setExtrasActionError("");
    if (extra === "code") setCodeAware(value);
    if (extra === "ml") setKompress(value);
    const key = extra === "code" ? "headroomCodeAware" : "headroomKompress";
    await patchSetting({ [key]: value });
    if (!headroomStatus.running || !headroomStatus.managedPid || headroomStatus.localUrl === false) return;
    setRestartingProxy(true);
    try {
      const res = await fetch("/api/headroom/restart", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Restart failed");
      await refreshHeadroomStatus();
    } catch (e) {
      setExtrasActionError(e.message);
    } finally {
      setRestartingProxy(false);
    }
  }, [headroomStatus.running, headroomStatus.managedPid, headroomStatus.localUrl, refreshHeadroomStatus]);

  const handleCavemanLevel = (level) => {
    playHudSound("click");
    setCavemanLevel(level);
    patchSetting({ cavemanLevel: level });
  };

  const handlePonytailEnabled = (value) => {
    playHudSound("toggle");
    setPonytailEnabled(value);
    patchSetting({ ponytailEnabled: value });
  };

  const handlePonytailLevel = (level) => {
    playHudSound("click");
    setPonytailLevel(level);
    patchSetting({ ponytailLevel: level });
  };

  const handleClaudeCacheTtl = (ttl) => {
    playHudSound("click");
    setClaudeCacheTtl(ttl);
    patchSetting({ claudeCacheTtl: ttl });
  };

  const handleCustomPromptEnabled = (value) => {
    playHudSound("toggle");
    setCustomPromptEnabled(value);
    patchSetting({ customPromptEnabled: value });
  };

  const handleCustomPromptBlur = () => {
    patchSetting({ customPrompt });
  };

  const refreshPxpipeStatus = useCallback(async () => {
    setPxpipeStatus((s) => ({ ...s, loading: true }));
    try {
      const res = await fetch("/api/pxpipe/status", {
        headers: { "Cache-Control": "no-store" },
      });
      const data = await res.json();
      setPxpipeStatus({ ...data, loading: false });
      if (typeof data.minChars === "number") setPxpipeMinChars(data.minChars);
    } catch {
      setPxpipeStatus({ installed: false, installing: false, running: false, version: null, loading: false });
    }
  }, []);

  const runPxpipeHealth = useCallback(async () => {
    try {
      const res = await fetch("/api/pxpipe/health", { method: "POST" });
      setPxpipeHealth(await res.json());
    } catch (e) {
      setPxpipeHealth({ healthy: false, checks: [], error: e.message });
    }
  }, []);

  const pxpipeAction = useCallback(
    async (endpoint) => {
      setPxpipeActionError("");
      setPxpipeActionLoading(true);
      try {
        const res = await fetch(`/api/pxpipe/${endpoint}`, { method: "POST" });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || `PXPIPE ${endpoint} failed`);
        await refreshPxpipeStatus();
        await runPxpipeHealth();
      } catch (e) {
        setPxpipeActionError(e.message);
      } finally {
        setPxpipeActionLoading(false);
      }
    },
    [refreshPxpipeStatus, runPxpipeHealth]
  );

  const handlePxpipeEnabled = (value) => {
    setPxpipeEnabled(value);
    patchSetting({ pxpipeEnabled: value });
  };

  const handlePxpipeMinCharsBlur = () => {
    const next = Math.max(0, Number(pxpipeMinChars) || 25000);
    setPxpipeMinChars(next);
    patchSetting({ pxpipeMinChars: next });
  };

  const handleHeadroomTimeoutBlur = () => {
    const raw = Math.round(Number(headroomTimeoutMs));
    const next = Number.isFinite(raw) && raw > 0 ? raw : 3000;
    setHeadroomTimeoutMs(next);
    patchSetting({ headroomTimeoutMs: next });
  };

  useEffect(() => {
    const loadSettings = async () => {
      try {
        const res = await fetch("/api/settings");
        if (res.ok) {
          const data = await res.json();
          setRtkEnabledState(data.rtkEnabled !== false);
          setHeadroomEnabled(!!data.headroomEnabled);
          setHeadroomUrl(data.headroomUrl || "http://localhost:8787");
          if (typeof data.headroomTimeoutMs === "number") setHeadroomTimeoutMs(data.headroomTimeoutMs);
          setCodeAware(data.headroomCodeAware === true);
          setKompress(data.headroomKompress !== false);
          setCavemanEnabled(!!data.cavemanEnabled);
          setCavemanLevel(data.cavemanLevel || "full");
          setPonytailEnabled(!!data.ponytailEnabled);
          setPonytailLevel(data.ponytailLevel || "full");
          setCustomPromptEnabled(!!data.customPromptEnabled);
          setCustomPrompt(data.customPrompt || "");
          setPxpipeEnabled(!!data.pxpipeEnabled);
          if (typeof data.pxpipeMinChars === "number") setPxpipeMinChars(data.pxpipeMinChars);
          setClaudeCacheTtl(data.claudeCacheTtl === "1h" ? "1h" : "5m");
          refreshHeadroomStatus();
          // PRD: run the PXPIPE health check automatically when the page opens
          refreshPxpipeStatus().then(runPxpipeHealth);
        }
      } catch {}
    };
    loadSettings();
  }, [refreshHeadroomStatus, refreshPxpipeStatus, runPxpipeHealth]);

  const headroomRunning = !!headroomStatus.running;
  const headroomLocalUrl = headroomStatus.localUrl !== false;
  const headroomCanStart = !!headroomStatus.canStart;
  const headroomManaged = headroomLocalUrl && !!headroomStatus.managedPid;
  const headroomStatusLabel = headroomStatus.loading
    ? "Đang kiểm tra…"
    : headroomRunning
      ? (headroomManaged ? "Đang chạy (9Router quản lý)" : "Đang chạy (bên ngoài)")
      : headroomStatus.localUrl !== false && !headroomStatus.installed
        ? "Chưa cài đặt"
        : headroomStatus.localUrl !== false
          ? "Đang tắt"
          : "Bên ngoài";

  const pxpipeHealthy = pxpipeHealth?.healthy === true;
  const pxpipeStatusLabel = pxpipeStatus.loading
    ? "Đang kiểm tra…"
    : pxpipeStatus.installing
      ? "Đang cài đặt…"
      : !pxpipeStatus.installed
        ? "Chưa cài đặt"
        : pxpipeHealthy
          ? "Khỏe mạnh"
          : pxpipeStatus.running
            ? "Đang chạy"
            : "Đang tắt";
  const pxpipeChipClass =
    pxpipeHealthy || pxpipeStatus.running
      ? "bg-success/15 text-success"
      : "bg-warning/15 text-warning";

  const armedAgSaversCount = [
    rtkEnabled,
    headroomEnabled,
    cavemanEnabled,
    ponytailEnabled,
    customPromptEnabled,
  ].filter(Boolean).length;

  return (
    <div className="space-y-4 p-4 sm:p-6">
      {/* HUD Telemetry Summary Strip */}
      <HudFrame
        chamfer="md"
        accent={headroomRunning ? "emerald" : "cyan"}
        padding="sm"
      >
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <div className="size-9 rounded-lg border border-cyan-500/35 bg-cyan-500/12 text-cyan-600 dark:text-cyan-400 flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined text-[20px]">bolt</span>
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-cyan-600 dark:text-cyan-400">
                  MA TRẬN TIẾT KIỆM TOKEN
                </span>
                <span className="inline-flex items-center gap-1 rounded border border-cyan-500/30 bg-cyan-500/10 px-1.5 py-0.5 font-mono text-[10px] font-bold text-cyan-700 dark:text-cyan-300">
                  5 MÔ-ĐUN ANTIGRAVITY
                </span>
              </div>
              <h1 className="text-base sm:text-lg font-bold text-text-main tracking-tight">
                Tiết kiệm Token
              </h1>
            </div>
          </div>

          {/* Live Telemetry Readouts */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 font-mono text-[11px]" data-i18n-skip="true">
            <div className="rounded-lg border border-cyan-500/25 bg-white/55 dark:bg-[#070D1B]/75 px-3 py-1.5">
              <div className="text-[9.5px] uppercase tracking-wider text-text-muted">Mô-đun đang bật</div>
              <div className="text-sm font-bold text-cyan-700 dark:text-cyan-300 hud-telemetry-num">
                <NumberTicker value={armedAgSaversCount} /> / 5
              </div>
            </div>

            <div className="rounded-lg border border-black/10 dark:border-white/10 bg-white/55 dark:bg-[#070D1B]/75 px-3 py-1.5">
              <div className="text-[9.5px] uppercase tracking-wider text-text-muted">Headroom Proxy</div>
              <div className="flex items-center gap-1.5 text-xs font-bold">
                <span
                  className={`size-1.5 rounded-full shrink-0 ${
                    headroomRunning
                      ? `bg-emerald-500 ${motionPaused ? "" : "animate-pulse"}`
                      : "bg-amber-500"
                  }`}
                />
                <span className={headroomRunning ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"}>
                  {headroomStatus.loading ? "ĐANG KIỂM TRA" : headroomRunning ? "ĐANG CHẠY" : "ĐANG CHỜ"}
                </span>
              </div>
            </div>

            <div className="rounded-lg border border-black/10 dark:border-white/10 bg-white/55 dark:bg-[#070D1B]/75 px-3 py-1.5">
              <div className="text-[9.5px] uppercase tracking-wider text-text-muted">Nén đầu ra</div>
              <div className="text-xs font-bold text-text-main truncate">
                {cavemanEnabled ? `CAVEMAN:${cavemanLevel.toUpperCase()}` : ponytailEnabled ? `PONYTAIL:${ponytailLevel.toUpperCase()}` : "MẶC ĐỊNH"}
              </div>
            </div>

            <div className="rounded-lg border border-amber-500/25 bg-white/55 dark:bg-[#070D1B]/75 px-3 py-1.5">
              <div className="text-[9.5px] uppercase tracking-wider text-text-muted">Bộ nhớ đệm Claude</div>
              <div className="text-xs font-bold text-amber-700 dark:text-amber-300">
                TTL {claudeCacheTtl.toUpperCase()}
              </div>
            </div>
          </div>
        </div>
      </HudFrame>

      {/* Main Tactical Orbital HUD Matrix Card */}
      <HudFrame id="rtk" chamfer="md" accent="cyan" padding="md">
        <div className="space-y-4">
          {/* 1. RTK — Antigravity Ready */}
          <div className="flex items-center justify-between pb-4 border-b border-cyan-500/15 gap-4">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="font-semibold text-text-main">
                  Nén kết quả lệnh &amp; công cụ{" "}
                  <a
                    href="https://github.com/rtk-ai/rtk"
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs font-mono font-normal text-primary underline hover:opacity-80"
                  >
                    (RTK)
                  </a>
                </p>
                <CompatibilityBadge type="antigravity" />
              </div>
              <p className="text-sm text-text-muted mt-0.5">
                git/grep/ls/tree/logs → giảm 60-90% token đầu vào
              </p>
            </div>
            <Toggle
              checked={rtkEnabled}
              onChange={() => handleRtkEnabled(!rtkEnabled)}
            />
          </div>

          {/* 2. Headroom — Antigravity Ready */}
          <div className="flex items-center justify-between pb-2 gap-4 flex-wrap">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="font-semibold text-text-main">
                  Nén ngữ cảnh hội thoại{" "}
                  <a
                    href="https://github.com/chopratejas/headroom"
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs font-mono font-normal text-primary underline hover:opacity-80"
                  >
                    (Headroom)
                  </a>
                </p>
                <CompatibilityBadge type="antigravity" />
                <span
                  className={`font-mono text-[11px] font-semibold px-2 py-0.5 rounded border ${
                    headroomRunning
                      ? "border-emerald-500/35 bg-emerald-500/12 text-emerald-700 dark:text-emerald-300"
                      : "border-amber-500/35 bg-amber-500/12 text-amber-700 dark:text-amber-300"
                  }`}
                >
                  {headroomStatusLabel}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    playHudSound("click");
                    setShowHeadroomInstallModal(true);
                  }}
                  className="font-mono text-xs font-semibold text-primary underline hover:opacity-80 cursor-pointer"
                >
                  {headroomRunning ? "Quản lý" : "Cài đặt"}
                </button>
              </div>
              <p className="text-sm text-text-muted mt-1">
                Nén prompt qua <code className="font-mono text-xs">/v1/compress</code> trước khi gửi tới model
              </p>
            </div>
            <Toggle
              checked={headroomEnabled}
              onChange={() => handleHeadroomEnabled(!headroomEnabled)}
            />
          </div>

          {headroomStatus.installed && (
            <div className="mb-2 ml-1 pl-3 pb-4 border-l-2 border-cyan-500/35">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-mono text-xs text-text-muted">
                  Gói nén mở rộng
                  {headroomExtras.version ? ` · v${headroomExtras.version}` : ""}:
                </span>
                {headroomExtras.available.map((extra) => {
                  const installed = !!headroomExtras.extras[extra];
                  const pending = pendingExtras.includes(extra);
                  const extraTitle =
                    extra === "code"
                      ? "Nén AST bằng tree-sitter cho phản hồi code"
                      : "Mô hình Kompress-v2 HF cho văn bản dài/agent (~+1GB)";

                  if (installed) {
                    const active = extra === "code" ? codeAware : kompress;
                    return (
                      <div
                        key={extra}
                        className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-md border border-emerald-500/40 bg-emerald-500/10 text-text"
                        title={extraTitle}
                      >
                        <Toggle
                          size="sm"
                          checked={active}
                          disabled={restartingProxy}
                          onChange={() => toggleExtraActive(extra, !active)}
                        />
                        <span className="font-mono font-semibold">[{extra}]</span>
                        <button
                          type="button"
                          onClick={() => handleRemoveExtra(extra)}
                          disabled={removingExtra === extra}
                          className="ml-1 font-mono text-[11px] text-error underline hover:opacity-80 disabled:opacity-50 cursor-pointer"
                          title={`Gỡ cài đặt [${extra}]`}
                        >
                          {removingExtra === extra ? "Đang gỡ…" : "Gỡ bỏ"}
                        </button>
                      </div>
                    );
                  }

                  return (
                    <label
                      key={extra}
                      className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-md border cursor-pointer transition-colors ${
                        pending
                          ? "border-cyan-500 bg-cyan-500/12 text-cyan-700 dark:text-cyan-300"
                          : "border-border text-text-muted hover:bg-surface-2"
                      }`}
                      title={extraTitle}
                    >
                      <input
                        type="checkbox"
                        className="w-3 h-3"
                        checked={pending}
                        onChange={() => togglePendingExtra(extra)}
                      />
                      <span className="font-mono font-semibold">[{extra}]</span>
                      <span className="opacity-70">chưa cài</span>
                    </label>
                  );
                })}
                {pendingExtras.length > 0 && (
                  <button
                    type="button"
                    onClick={handleInstallExtras}
                    disabled={extrasActionLoading}
                    className="font-mono text-xs font-bold px-2.5 py-1 rounded-md bg-primary text-white hover:opacity-90 disabled:opacity-50 cursor-pointer"
                  >
                    {extrasActionLoading
                      ? "Đang cài…"
                      : `Cài đặt [proxy,${pendingExtras.join(",")}]`}
                  </button>
                )}
              </div>
              {extrasActionError && (
                <p className="text-xs text-error mt-1.5">{extrasActionError}</p>
              )}
              {restartingProxy && (
                <p className="font-mono text-xs text-cyan-600 dark:text-cyan-400 mt-1.5">
                  Đang khởi động lại proxy…
                </p>
              )}
              {installLog && (
                <div className="mt-2.5 overflow-hidden rounded-lg border border-cyan-500/30 bg-[#050A15] shadow-inner">
                  <div className="flex items-center justify-between border-b border-cyan-500/20 bg-[#0A1326] px-3 py-1 font-mono text-[10px] text-cyan-300">
                    <span className="flex items-center gap-1.5 font-bold uppercase tracking-wider">
                      <span className="size-1.5 rounded-full bg-cyan-400" />
                      HEADROOM // LUỒNG CÀI ĐẶT PIPX
                    </span>
                    <span className="text-cyan-400/70">LOG TRỰC TIẾP</span>
                  </div>
                  <pre className="max-h-36 overflow-auto p-2.5 font-mono text-[10.5px] leading-relaxed text-cyan-100/90 whitespace-pre-wrap">
                    {installLog}
                  </pre>
                </div>
              )}
              <p className="text-xs text-text-muted mt-1.5">
                Cài đặt chỉ tải gói; gạt nút <code>bật</code>/<code>tắt</code>{" "}
                để kích hoạt (sẽ khởi động lại proxy). Mặc định chỉ cài{" "}
                <code>[proxy]</code> (SmartCrusher cho JSON). Thêm{" "}
                <code>[code]</code> để nén AST cho mã nguồn
                (Python/JS/TS/Go/Rust/Java/C/C++/Perl). Thêm <code>[ml]</code>{" "}
                bật mô hình Kompress-v2 HF nhưng tốn thêm ~1 GB dung lượng.
              </p>
            </div>
          )}

          {/* 3. Caveman — Antigravity Ready */}
          <div className="flex items-center justify-between pt-4 border-t border-cyan-500/15 gap-4 flex-wrap">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="font-semibold text-text-main">
                  Nén phản hồi LLM{" "}
                  <a
                    href="https://github.com/JuliusBrussee/caveman"
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs font-mono font-normal text-primary underline hover:opacity-80"
                  >
                    (Caveman)
                  </a>
                </p>
                <CompatibilityBadge type="antigravity" />
              </div>
              <p className="text-sm text-text-muted mt-0.5">
                Tiêm chỉ thị trả lời cô đọng → giảm ~65% token đầu ra (tối đa 87%)
              </p>
            </div>
            <div className="flex items-center gap-3 shrink-0 flex-wrap">
              {cavemanEnabled && (
                <div className="flex flex-col items-end gap-1">
                  <div className="inline-flex items-center rounded-lg border border-cyan-500/25 bg-black/[0.03] dark:bg-black/30 p-0.5 gap-0.5">
                    {visibleCavemanLevels.map((lvl) => (
                      <button
                        key={lvl.id}
                        type="button"
                        onClick={() => handleCavemanLevel(lvl.id)}
                        className={`px-2.5 py-1 rounded-md font-mono text-xs font-bold transition-all cursor-pointer ${
                          cavemanLevel === lvl.id
                            ? "bg-primary text-white shadow-2xs"
                            : "text-text-muted hover:text-text-main hover:bg-white/40 dark:hover:bg-white/[0.06]"
                        }`}
                        title={lvl.desc}
                      >
                        {lvl.label}
                      </button>
                    ))}
                  </div>
                  <p className="text-xs text-primary">
                    {
                      CAVEMAN_LEVELS.find((lvl) => lvl.id === cavemanLevel)
                        ?.desc
                    }
                  </p>
                </div>
              )}
              <Toggle
                checked={cavemanEnabled}
                onChange={() => handleCavemanEnabled(!cavemanEnabled)}
              />
            </div>
          </div>

          {/* 4. Ponytail — Antigravity Ready */}
          <div className="flex items-center justify-between pt-4 border-t border-cyan-500/15 gap-4 flex-wrap">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="font-semibold text-text-main">
                  Code tối giản kiểu Senior{" "}
                  <a
                    href="https://github.com/DietrichGebert/ponytail"
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs font-mono font-normal text-primary underline hover:opacity-80"
                  >
                    (Ponytail)
                  </a>
                </p>
                <CompatibilityBadge type="antigravity" />
              </div>
              <p className="text-sm text-text-muted mt-0.5">
                Định hướng model viết code tối giản: YAGNI, tận dụng stdlib, hạn chế dư thừa
              </p>
            </div>
            <div className="flex items-center gap-3 shrink-0 flex-wrap">
              {ponytailEnabled && (
                <div className="flex flex-col items-end gap-1">
                  <div className="inline-flex items-center rounded-lg border border-cyan-500/25 bg-black/[0.03] dark:bg-black/30 p-0.5 gap-0.5">
                    {PONYTAIL_LEVELS.map((lvl) => (
                      <button
                        key={lvl.id}
                        type="button"
                        onClick={() => handlePonytailLevel(lvl.id)}
                        className={`px-2.5 py-1 rounded-md font-mono text-xs font-bold transition-all cursor-pointer ${
                          ponytailLevel === lvl.id
                            ? "bg-primary text-white shadow-2xs"
                            : "text-text-muted hover:text-text-main hover:bg-white/40 dark:hover:bg-white/[0.06]"
                        }`}
                        title={lvl.desc}
                      >
                        {lvl.label}
                      </button>
                    ))}
                  </div>
                  <p className="text-xs text-primary">
                    {
                      PONYTAIL_LEVELS.find((lvl) => lvl.id === ponytailLevel)
                        ?.desc
                    }
                  </p>
                </div>
              )}
              <Toggle
                checked={ponytailEnabled}
                onChange={() => handlePonytailEnabled(!ponytailEnabled)}
              />
            </div>
          </div>

          {/* 5. Custom System Prompt — Antigravity Ready */}
          <div className="flex items-center justify-between pt-4 border-t border-cyan-500/15 gap-4 flex-wrap">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="font-semibold text-text-main">System prompt tùy chỉnh</p>
                <CompatibilityBadge type="antigravity" />
              </div>
              <p className="text-sm text-text-muted mt-0.5">
                Tự động chèn chỉ thị riêng của bạn vào mọi yêu cầu, độc lập với các bộ tiết kiệm trên
              </p>
            </div>
            <Toggle
              checked={customPromptEnabled}
              onChange={() => handleCustomPromptEnabled(!customPromptEnabled)}
            />
          </div>
          {customPromptEnabled && (
            <div className="pt-1">
              <textarea
                id="custom-prompt"
                aria-label="System prompt tùy chỉnh"
                value={customPrompt}
                onChange={(e) => setCustomPrompt(e.target.value)}
                onBlur={handleCustomPromptBlur}
                rows={4}
                placeholder="Ví dụ: Ưu tiên sửa trực tiếp file hiện có thay vì tạo file mới."
                className="w-full rounded-lg border border-cyan-500/25 bg-white/60 dark:bg-[#060C19]/80 p-2.5 font-mono text-xs text-text-main focus:outline-none focus:border-cyan-500"
              />
              <p className="text-xs text-text-muted mt-1">
                Áp dụng cho mọi nhà cung cấp và model. Gửi nguyên văn lên upstream; để trống nếu không muốn chèn thêm.
              </p>
            </div>
          )}

          {/* 6. Prompt Cache TTL (Claude) — Claude / Anthropic Only */}
          <div className="flex items-center justify-between pt-4 border-t border-cyan-500/15 gap-4 flex-wrap">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="font-semibold text-text-main">Thời hạn bộ nhớ đệm (Claude)</p>
                <CompatibilityBadge type="claude" />
              </div>
              <p className="text-sm text-text-muted mt-0.5">
                Thời gian giữ cache hội thoại trên các provider chuẩn Anthropic. System prompt và tools luôn được lưu 1 giờ
              </p>
            </div>
            <div className="flex flex-col items-end gap-1 shrink-0">
              <div className="inline-flex items-center rounded-lg border border-amber-500/25 bg-black/[0.03] dark:bg-black/30 p-0.5 gap-0.5">
                {CLAUDE_CACHE_TTLS.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => handleClaudeCacheTtl(opt.id)}
                    className={`px-3 py-1 rounded-md font-mono text-xs font-bold transition-all cursor-pointer ${
                      claudeCacheTtl === opt.id
                        ? "bg-amber-500 text-slate-950 shadow-2xs"
                        : "text-text-muted hover:text-text-main hover:bg-white/40 dark:hover:bg-white/[0.06]"
                    }`}
                    title={opt.desc}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              <p className="text-xs text-amber-600 dark:text-amber-400">
                {CLAUDE_CACHE_TTLS.find((opt) => opt.id === claudeCacheTtl)?.desc}
              </p>
            </div>
          </div>

          {/* PXPIPE hidden from UI — experimental, not exposed to users yet */}
          {false && (
            <div className="flex items-center justify-between pt-4 mt-4 border-t border-border gap-4 flex-wrap">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-3 flex-wrap">
                  <p className="font-medium">
                    Compress prompts as images{" "}
                    <a
                      href="https://github.com/teamchong/pxpipe"
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs font-normal text-primary underline hover:opacity-80"
                    >
                      (PXPIPE)
                    </a>
                  </p>
                  <span className={`text-xs px-2 py-0.5 rounded ${pxpipeChipClass}`}>
                    {pxpipeStatusLabel}
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowPxpipeModal(true)}
                    className="text-xs text-primary underline hover:opacity-80"
                  >
                    {pxpipeStatus.installed ? "Manage" : "Setup"}
                  </button>
                  <a
                    href="/dashboard/pxpipe"
                    className="text-xs text-primary underline hover:opacity-80"
                  >
                    Dashboard
                  </a>
                </div>
                <p className="text-sm text-text-muted mt-1">
                  Transforms large textual context into optimized images before
                  sending to the LLM. Ideal for huge prompts, tool outputs and long
                  conversations.
                </p>
              </div>
              <Toggle
                checked={pxpipeEnabled}
                disabled={!pxpipeStatus.installed}
                onChange={() => handlePxpipeEnabled(!pxpipeEnabled)}
              />
            </div>
          )}
        </div>
      </HudFrame>

      <Modal
        isOpen={showHeadroomInstallModal}
        title={headroomRunning ? "Quản lý Headroom" : "Cài đặt Headroom"}
        onClose={() => setShowHeadroomInstallModal(false)}
      >
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between text-sm">
            <span>Trạng thái</span>
            <span
              className={`font-mono font-semibold ${headroomRunning ? "text-success" : "text-warning"}`}
            >
              {headroomStatusLabel}
            </span>
          </div>
          {headroomRunning && (
            <a
              href="/api/headroom/proxy/dashboard"
              target="_blank"
              rel="noreferrer"
              className="w-full rounded border border-border px-4 py-2 text-center text-sm hover:bg-surface-2"
            >
              Mở bảng điều khiển Headroom
            </a>
          )}
          <div className="flex flex-col gap-1">
            <p className="text-sm font-medium">URL Proxy</p>
            <Input
              value={headroomUrl}
              onChange={(e) => setHeadroomUrl(e.target.value)}
              onBlur={handleHeadroomUrlBlur}
              placeholder="http://localhost:8787"
              className="font-mono text-sm"
            />
            <p className="text-xs text-text-muted">
              Dùng proxy nội bộ để Bật/Tắt nhanh, hoặc dùng sidecar Docker bên ngoài như http://headroom:8787.
            </p>
          </div>
          <div className="flex flex-col gap-1">
            <p className="text-sm font-medium">Timeout (ms)</p>
            <Input
              value={String(headroomTimeoutMs)}
              onChange={(e) => setHeadroomTimeoutMs(e.target.value)}
              onBlur={handleHeadroomTimeoutBlur}
              placeholder="3000"
              className="font-mono text-sm"
            />
            <p className="text-xs text-text-muted">
              Request timeout in milliseconds. Defaults to 3000 ms.
            </p>
          </div>
          {headroomManaged ? (
            <Button
              onClick={handleHeadroomStop}
              variant="ghost"
              fullWidth
              disabled={headroomActionLoading}
            >
              {headroomActionLoading ? "Stopping…" : "Stop Headroom"}
            </Button>
          ) : headroomRunning ? (
            <p className="text-sm text-success">
              Headroom proxy đã kết nối. Bạn có thể bật tính năng tiết kiệm token.
            </p>
          ) : headroomCanStart ? (
            <Button
              onClick={handleHeadroomStart}
              fullWidth
              disabled={headroomActionLoading}
            >
              {headroomActionLoading ? "Đang khởi động…" : "Khởi động Headroom"}
            </Button>
          ) : !headroomLocalUrl ? (
            <p className="text-sm text-warning">
              Hãy khởi chạy Headroom riêng tại URL đã cấu hình, sau đó nhấn Kiểm tra lại.
            </p>
          ) : !headroomStatus.python ? (
            <p className="text-sm text-warning">
              Cần Python ≥ 3.10 để chạy chế độ tự quản lý. Hãy cài Python trước hoặc dùng URL proxy bên ngoài.
            </p>
          ) : (
            <div className="flex flex-col gap-1">
              <p className="text-sm font-medium">Cài đặt rồi nhấn Khởi động:</p>
              <div className="flex items-center gap-2">
                <pre className="flex-1 rounded bg-black/5 dark:bg-white/5 p-2 text-xs font-mono overflow-x-auto">
                  {`pip install "headroom-ai[proxy]"`}
                </pre>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    copy(`pip install "headroom-ai[proxy]"`)
                  }
                >
                  {copied ? "Đã chép" : "Chép"}
                </Button>
              </div>
            </div>
          )}
          {headroomActionError && (
            <p className="text-sm text-warning">{headroomActionError}</p>
          )}
          <div className="flex gap-2">
            <Button
              onClick={() => refreshHeadroomStatus()}
              variant="ghost"
              fullWidth
            >
              Kiểm tra lại
            </Button>
            <Button
              onClick={() => setShowHeadroomInstallModal(false)}
              fullWidth
            >
              Xong
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={false}
        title={pxpipeStatus.installed ? "PXPIPE" : "Setup PXPIPE"}
        onClose={() => setShowPxpipeModal(false)}
      >
        <div className="flex flex-col gap-4">
          <p className="text-sm text-text-muted">
            Compress prompts using multimodal encoding. Runs in-process — no
            extra server or environment variables required.
          </p>
          <div className="flex items-center justify-between text-sm">
            <span>Status</span>
            <span className={pxpipeHealthy || pxpipeStatus.running ? "text-success" : "text-warning"}>
              {pxpipeStatusLabel}
              {pxpipeStatus.version ? ` · v${pxpipeStatus.version}` : ""}
            </span>
          </div>
          {pxpipeHealth?.checks?.length > 0 && (
            <div className="flex flex-col gap-1 rounded border border-border p-3">
              <p className="text-sm font-medium mb-1">Health check</p>
              {pxpipeHealth.checks.map((check) => (
                <div key={check.id} className="flex items-center justify-between text-xs">
                  <span className={check.ok ? "text-success" : "text-warning"}>
                    {check.ok ? "●" : "○"} {check.label}
                  </span>
                  {check.detail && (
                    <span className="text-text-muted font-mono truncate max-w-[50%]">{check.detail}</span>
                  )}
                </div>
              ))}
              {pxpipeHealth.error && (
                <p className="text-xs text-warning mt-1">{pxpipeHealth.error}</p>
              )}
            </div>
          )}
          {!pxpipeStatus.installed ? (
            <div className="flex flex-col gap-2">
              <p className="text-sm text-warning">PXPIPE is not installed.</p>
              <Button
                onClick={() => pxpipeAction("install")}
                fullWidth
                disabled={pxpipeActionLoading || pxpipeStatus.installing}
              >
                {pxpipeActionLoading || pxpipeStatus.installing ? "Installing…" : "Install"}
              </Button>
              <p className="text-xs text-text-muted">
                Installs the npm package <code className="font-mono">pxpipe-proxy</code> into
                the 9Router data directory. May take a few minutes.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {pxpipeStatus.running ? (
                <>
                  <Button onClick={() => pxpipeAction("restart")} variant="ghost" disabled={pxpipeActionLoading}>
                    Restart
                  </Button>
                  <Button onClick={() => pxpipeAction("stop")} variant="ghost" disabled={pxpipeActionLoading}>
                    Stop
                  </Button>
                </>
              ) : (
                <Button onClick={() => pxpipeAction("start")} disabled={pxpipeActionLoading}>
                  {pxpipeActionLoading ? "Starting…" : "Start"}
                </Button>
              )}
              <Button onClick={() => pxpipeAction("install")} variant="ghost" disabled={pxpipeActionLoading}>
                Repair
              </Button>
              <a
                href="/dashboard/pxpipe#logs"
                className="col-span-2 rounded border border-border px-4 py-2 text-center text-sm hover:bg-surface-2"
              >
                Open Logs
              </a>
            </div>
          )}
          <div className="flex flex-col gap-1">
            <p className="text-sm font-medium">Minimum prompt size (chars)</p>
            <Input
              value={String(pxpipeMinChars)}
              onChange={(e) => setPxpipeMinChars(e.target.value)}
              onBlur={handlePxpipeMinCharsBlur}
              placeholder="25000"
              className="font-mono text-sm"
            />
            <p className="text-xs text-text-muted">
              Requests smaller than this bypass PXPIPE and are sent as-is.
            </p>
          </div>
          {pxpipeActionError && (
            <p className="text-sm text-warning">{pxpipeActionError}</p>
          )}
          <div className="flex gap-2">
            <Button
              onClick={() => refreshPxpipeStatus().then(runPxpipeHealth)}
              variant="ghost"
              fullWidth
            >
              Recheck
            </Button>
            <Button onClick={() => setShowPxpipeModal(false)} fullWidth>
              Done
            </Button>
          </div>
        </div>
      </Modal>

      <ConfirmModal
        isOpen={!!extrasConfirm}
        onClose={() => setExtrasConfirm(null)}
        onConfirm={() => {
          const fn = extrasConfirm?.onConfirm;
          setExtrasConfirm(null);
          fn?.();
        }}
        title={extrasConfirm?.title}
        message={extrasConfirm?.message}
        confirmText={extrasConfirm?.confirmText}
        variant={extrasConfirm?.variant}
      />
    </div>
  );
}
