"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Button, Input, Modal, Toggle, ConfirmModal } from "@/shared/components";
import { HudFrame, NumberTicker, MagneticButton } from "@/shared/components/hud";
import { useHudPrefs } from "@/shared/hooks/useHudPrefs";
import { playHudSound } from "@/shared/utils/hudAudio";
import { useCopyToClipboard } from "@/shared/hooks/useCopyToClipboard";
import { getCachedData, setCachedData } from "@/shared/utils/swrCache";
import { getCurrentLocale, onLocaleChange } from "@/i18n/runtime";
import TokenSaverFlowCircuit from "./TokenSaverFlowCircuit";
import {
  WENYAN_LOCALES,
  CAVEMAN_LEVELS,
  PONYTAIL_LEVELS,
  CLAUDE_CACHE_TTLS,
} from "../endpoint/endpointConstants";

const MODULE_META = {
  rtk: {
    id: "rtk",
    title: "Nén kết quả lệnh & công cụ",
    shortName: "RTK",
    href: "https://github.com/rtk-ai/rtk",
    icon: "terminal",
    savingsLabel: "-60–90% input",
    description: "Nén đầu ra git/grep/ls/tree/logs trước khi nạp vào ngữ cảnh",
    compatibility: "antigravity",
  },
  headroom: {
    id: "headroom",
    title: "Nén ngữ cảnh hội thoại",
    shortName: "Headroom",
    href: "https://github.com/chopratejas/headroom",
    icon: "compress",
    savingsLabel: "Nén ngữ cảnh",
    description: "Nén prompt qua /v1/compress trước khi gửi tới model",
    compatibility: "antigravity",
  },
  caveman: {
    id: "caveman",
    title: "Nén phản hồi LLM",
    shortName: "Caveman",
    href: "https://github.com/JuliusBrussee/caveman",
    icon: "psychology_alt",
    savingsLabel: "-65% output",
    description:
      "Tiêm chỉ thị trả lời cô đọng, cắt từ thừa → giảm ~65% token đầu ra (tối đa 87%)",
    compatibility: "antigravity",
  },
  ponytail: {
    id: "ponytail",
    title: "Code tối giản kiểu Senior",
    shortName: "Ponytail",
    href: "https://github.com/DietrichGebert/ponytail",
    icon: "code_blocks",
    savingsLabel: "Code tối giản",
    description:
      "Định hướng model viết code tối giản: YAGNI, tận dụng stdlib, hạn chế dư thừa",
    compatibility: "antigravity",
  },
  customPrompt: {
    id: "customPrompt",
    title: "System prompt tùy chỉnh",
    shortName: "Tùy chỉnh",
    href: null,
    icon: "edit_note",
    savingsLabel: "Prompt tùy chỉnh",
    description:
      "Tự động chèn chỉ thị riêng của bạn vào mọi yêu cầu, độc lập với các bộ tiết kiệm khác",
    compatibility: "antigravity",
  },
};

const MODULE_ORDER = ["rtk", "headroom", "caveman", "ponytail", "customPrompt"];

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

function SavingsBadge({ label, active, emerald = false }) {
  const toneClass = active
    ? emerald
      ? "border-emerald-500/45 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
      : "border-cyan-500/45 bg-cyan-500/15 text-cyan-700 dark:text-cyan-300"
    : "border-black/10 dark:border-white/15 bg-black/[0.03] dark:bg-white/[0.04] text-text-muted";

  return (
    <span
      className={`inline-flex items-center gap-1 rounded border px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider ${toneClass}`}
      data-i18n-skip="true"
    >
      {label}
    </span>
  );
}

function LevelSelectorPills({ levels, value, onChange, compact = false }) {
  const activeDesc = levels.find((lvl) => lvl.id === value)?.desc;

  return (
    <div className="space-y-1.5">
      <div className="inline-flex flex-wrap items-center rounded-lg border border-cyan-500/25 bg-black/[0.03] dark:bg-black/35 p-0.5 gap-0.5">
        {levels.map((lvl) => (
          <button
            key={lvl.id}
            type="button"
            data-cursor-target="true"
            onClick={() => onChange(lvl.id)}
            className={`${compact ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-1 text-xs"} rounded-md font-mono font-bold transition-all cursor-pointer ${
              value === lvl.id
                ? "bg-primary text-white shadow-2xs"
                : "text-text-muted hover:text-text-main hover:bg-white/40 dark:hover:bg-white/[0.06]"
            }`}
            title={lvl.desc}
          >
            {lvl.label}
          </button>
        ))}
      </div>
      {activeDesc && (
        <p className="text-xs text-cyan-700 dark:text-cyan-300 leading-snug">
          {activeDesc}
        </p>
      )}
    </div>
  );
}

export default function TokenSaverClient({ initialSettings = null }) {
  const seedSettings = initialSettings ?? getCachedData("/api/settings") ?? null;

  const [rtkEnabled, setRtkEnabledState] = useState(() =>
    seedSettings ? seedSettings.rtkEnabled !== false : true
  );
  const [headroomEnabled, setHeadroomEnabled] = useState(() =>
    Boolean(seedSettings?.headroomEnabled)
  );
  const [headroomUrl, setHeadroomUrl] = useState(
    () => seedSettings?.headroomUrl || "http://localhost:8787"
  );
  const [headroomTimeoutMs, setHeadroomTimeoutMs] = useState(() =>
    typeof seedSettings?.headroomTimeoutMs === "number"
      ? seedSettings.headroomTimeoutMs
      : 3000
  );
  const [codeAware, setCodeAware] = useState(
    () => seedSettings?.headroomCodeAware === true
  );
  const [kompress, setKompress] = useState(() =>
    seedSettings ? seedSettings.headroomKompress !== false : true
  );
  const [cavemanEnabled, setCavemanEnabled] = useState(() =>
    Boolean(seedSettings?.cavemanEnabled)
  );
  const [cavemanLevel, setCavemanLevel] = useState(
    () => seedSettings?.cavemanLevel || "full"
  );
  const [ponytailEnabled, setPonytailEnabled] = useState(() =>
    Boolean(seedSettings?.ponytailEnabled)
  );
  const [ponytailLevel, setPonytailLevel] = useState(
    () => seedSettings?.ponytailLevel || "full"
  );
  const [customPromptEnabled, setCustomPromptEnabled] = useState(() =>
    Boolean(seedSettings?.customPromptEnabled)
  );
  const [customPrompt, setCustomPrompt] = useState(() =>
    typeof seedSettings?.customPrompt === "string"
      ? seedSettings.customPrompt
      : ""
  );
  const [claudeCacheTtl, setClaudeCacheTtl] = useState(() =>
    seedSettings?.claudeCacheTtl === "1h" ? "1h" : "5m"
  );

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
  const [restartingProxy, setRestartingProxy] = useState(false);
  const [promptSavedHint, setPromptSavedHint] = useState(false);

  const logPollRef = useRef(null);
  const logRequestRef = useRef(0);
  const [locale, setLocale] = useState("vi");

  const { copied, copy } = useCopyToClipboard();
  const { motionPaused } = useHudPrefs();

  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (active) setLocale(getCurrentLocale());
    });
    const unsubscribe = onLocaleChange(() => setLocale(getCurrentLocale()));
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  const isWenyanLocale = WENYAN_LOCALES.includes(locale);
  const visibleCavemanLevels = isWenyanLocale
    ? CAVEMAN_LEVELS
    : CAVEMAN_LEVELS.filter((lvl) => !lvl.wenyan);

  const patchSetting = useCallback(
    async (patch) => {
      const existing = getCachedData("/api/settings");
      const base =
        existing && typeof existing === "object" ? existing : initialSettings;
      if (base && typeof base === "object") {
        setCachedData("/api/settings", { ...base, ...patch });
      }
      try {
        const res = await fetch("/api/settings", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patch),
        });
        if (res.ok) {
          const updated = await res.json().catch(() => null);
          if (updated && typeof updated === "object") {
            setCachedData("/api/settings", updated);
          }
          return true;
        }
        return false;
      } catch (error) {
        console.log("Error updating setting:", error);
        return false;
      }
    },
    [initialSettings]
  );

  useEffect(() => {
    const current = CAVEMAN_LEVELS.find((lvl) => lvl.id === cavemanLevel);
    if (current?.wenyan && !isWenyanLocale) {
      queueMicrotask(() => {
        setCavemanLevel("ultra");
        patchSetting({ cavemanLevel: "ultra" });
      });
    }
  }, [isWenyanLocale, cavemanLevel, patchSetting]);

  const handleRtkEnabled = async (value) => {
    const prev = rtkEnabled;
    setRtkEnabledState(value);
    const ok = await patchSetting({ rtkEnabled: value });
    if (!ok) {
      setRtkEnabledState(prev);
    }
  };

  const handleCavemanEnabled = (value) => {
    setCavemanEnabled(value);
    patchSetting({ cavemanEnabled: value });
  };

  const handleHeadroomEnabled = (value) => {
    const nextUrl = headroomUrl.trim() || "http://localhost:8787";
    setHeadroomUrl(nextUrl);
    setHeadroomEnabled(value);
    patchSetting({ headroomEnabled: value, headroomUrl: nextUrl });
  };

  const handleEnableRecommended = () => {
    playHudSound("confirm");
    setRtkEnabledState(true);
    setCavemanEnabled(true);
    patchSetting({ rtkEnabled: true, cavemanEnabled: true });
  };

  const refreshHeadroomStatus = useCallback(async () => {
    setHeadroomStatus((s) => (s.loading ? s : { ...s, loading: true }));
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
      if (!res.ok) throw new Error(data.error || "Không thể khởi động proxy");
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
      if (requestId === logRequestRef.current && typeof d.log === "string") {
        setInstallLog(d.log);
      }
    } catch {
      /* ignore transient poll errors */
    }
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
      if (!res.ok) throw new Error(data.error || "Cài đặt thất bại");
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

  const removeExtraConfirmed = useCallback(
    async (extra) => {
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
        if (!res.ok) throw new Error(data.error || "Gỡ cài đặt thất bại");
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
    },
    [startLogPolling, stopLogPolling, refreshInstallLog]
  );

  const handleInstallExtras = useCallback(() => {
    if (pendingExtras.length === 0) return;
    // Warn about the heavy ~1GB torch download before installing [ml].
    if (pendingExtras.includes("ml")) {
      setExtrasConfirm({
        title: "Cài đặt [ml]",
        message:
          "Gói [ml] cần tải khoảng ~1 GB (torch + huggingface-hub). Tiếp tục cài đặt?",
        confirmText: "Cài đặt",
        variant: "primary",
        onConfirm: installExtrasConfirmed,
      });
      return;
    }
    installExtrasConfirmed();
  }, [pendingExtras, installExtrasConfirmed]);

  const handleRemoveExtra = useCallback(
    (extra) => {
      setExtrasConfirm({
        title: `Gỡ cài đặt [${extra}]`,
        message: `Gỡ bỏ gói [${extra}] và các thư viện đi kèm?`,
        confirmText: "Gỡ bỏ",
        variant: "danger",
        onConfirm: () => removeExtraConfirmed(extra),
      });
    },
    [removeExtraConfirmed]
  );

  // Toggle an extra's active state (persist setting), then restart the proxy so
  // the new --code-aware / --disable-kompress flags take effect.
  const toggleExtraActive = useCallback(
    async (extra, value) => {
      setExtrasActionError("");
      if (extra === "code") setCodeAware(value);
      if (extra === "ml") setKompress(value);
      const key = extra === "code" ? "headroomCodeAware" : "headroomKompress";
      await patchSetting({ [key]: value });
      if (
        !headroomStatus.running ||
        !headroomStatus.managedPid ||
        headroomStatus.localUrl === false
      ) {
        return;
      }
      setRestartingProxy(true);
      try {
        const res = await fetch("/api/headroom/restart", { method: "POST" });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "Khởi động lại thất bại");
        await refreshHeadroomStatus();
      } catch (e) {
        setExtrasActionError(e.message);
      } finally {
        setRestartingProxy(false);
      }
    },
    [
      headroomStatus.running,
      headroomStatus.managedPid,
      headroomStatus.localUrl,
      patchSetting,
      refreshHeadroomStatus,
    ]
  );

  const handleCavemanLevel = (level) => {
    playHudSound("click");
    setCavemanLevel(level);
    patchSetting({ cavemanLevel: level });
  };

  const handlePonytailEnabled = (value) => {
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
    setCustomPromptEnabled(value);
    patchSetting({ customPromptEnabled: value });
  };

  const handleCustomPromptSave = async () => {
    const ok = await patchSetting({ customPrompt });
    if (ok) {
      setPromptSavedHint(true);
      setTimeout(() => setPromptSavedHint(false), 1800);
    }
  };

  const handleHeadroomTimeoutBlur = () => {
    const raw = Math.round(Number(headroomTimeoutMs));
    const next = Number.isFinite(raw) && raw > 0 ? raw : 3000;
    setHeadroomTimeoutMs(next);
    patchSetting({ headroomTimeoutMs: next });
  };

  // Non-blocking mount: Headroom status + silent background /api/settings refresh
  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) refreshHeadroomStatus();
    });

    const loadSettings = async () => {
      try {
        const res = await fetch("/api/settings", {
          headers: { "Cache-Control": "no-store" },
        });
        if (!res.ok || cancelled) return;
        const data = await res.json();
        if (cancelled || !data || typeof data !== "object") return;
        setCachedData("/api/settings", data);
        setRtkEnabledState(data.rtkEnabled !== false);
        setHeadroomEnabled(Boolean(data.headroomEnabled));
        setHeadroomUrl(data.headroomUrl || "http://localhost:8787");
        if (typeof data.headroomTimeoutMs === "number") {
          setHeadroomTimeoutMs(data.headroomTimeoutMs);
        }
        setCodeAware(data.headroomCodeAware === true);
        setKompress(data.headroomKompress !== false);
        setCavemanEnabled(Boolean(data.cavemanEnabled));
        setCavemanLevel(data.cavemanLevel || "full");
        setPonytailEnabled(Boolean(data.ponytailEnabled));
        setPonytailLevel(data.ponytailLevel || "full");
        setCustomPromptEnabled(Boolean(data.customPromptEnabled));
        setCustomPrompt(
          typeof data.customPrompt === "string" ? data.customPrompt : ""
        );
        setClaudeCacheTtl(data.claudeCacheTtl === "1h" ? "1h" : "5m");
      } catch {
        // Keep initial SSR/cached values intact on transient network failure
      }
    };

    loadSettings();
    return () => {
      cancelled = true;
    };
  }, [refreshHeadroomStatus]);

  const headroomRunning = Boolean(headroomStatus.running);
  const headroomLocalUrl = headroomStatus.localUrl !== false;
  const headroomCanStart = Boolean(headroomStatus.canStart);
  const headroomManaged = headroomLocalUrl && Boolean(headroomStatus.managedPid);
  const headroomStatusLabel = headroomStatus.loading
    ? "Đang kiểm tra…"
    : headroomRunning
      ? headroomManaged
        ? "Đang chạy (9Router quản lý)"
        : "Đang chạy (bên ngoài)"
      : headroomLocalUrl && !headroomStatus.installed
        ? "Chưa cài đặt"
        : headroomLocalUrl
          ? "Đang tắt"
          : "Bên ngoài";

  const moduleStateMap = {
    rtk: { enabled: rtkEnabled, onToggle: handleRtkEnabled },
    headroom: { enabled: headroomEnabled, onToggle: handleHeadroomEnabled },
    caveman: { enabled: cavemanEnabled, onToggle: handleCavemanEnabled },
    ponytail: { enabled: ponytailEnabled, onToggle: handlePonytailEnabled },
    customPrompt: {
      enabled: customPromptEnabled,
      onToggle: handleCustomPromptEnabled,
    },
  };

  const activeModules = MODULE_ORDER.filter((id) => moduleStateMap[id].enabled);
  const inactiveModules = MODULE_ORDER.filter(
    (id) => !moduleStateMap[id].enabled
  );
  const armedAgSaversCount = activeModules.length;

  const outputCompressionLabel =
    cavemanEnabled && ponytailEnabled
      ? `CAVEMAN + PONYTAIL`
      : cavemanEnabled
        ? `CAVEMAN:${cavemanLevel.toUpperCase()}`
        : ponytailEnabled
          ? `PONYTAIL:${ponytailLevel.toUpperCase()}`
          : "MẶC ĐỊNH";

  const renderHeadroomExtras = () => {
    if (!headroomStatus.installed) return null;

    return (
      <div className="mt-3 pt-3 border-t border-cyan-500/15 space-y-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-mono text-[11px] font-semibold text-text-muted">
            Gói nén mở rộng
            {headroomExtras.version ? ` · v${headroomExtras.version}` : ""}:
          </span>
          {headroomExtras.available.map((extra) => {
            const installed = Boolean(headroomExtras.extras[extra]);
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
                  className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-md border border-emerald-500/40 bg-emerald-500/10 text-text-main"
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
                    className="ml-1 font-mono text-[11px] text-rose-600 dark:text-rose-400 underline hover:opacity-80 disabled:opacity-50 cursor-pointer"
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
            <MagneticButton data-cursor-target="true">
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
            </MagneticButton>
          )}
        </div>

        {extrasActionError && (
          <p className="text-xs text-rose-600 dark:text-rose-400">
            {extrasActionError}
          </p>
        )}
        {restartingProxy && (
          <p className="font-mono text-xs text-cyan-600 dark:text-cyan-400">
            Đang khởi động lại proxy…
          </p>
        )}
        {installLog && (
          <div className="overflow-hidden rounded-lg border border-cyan-500/30 bg-[#050A15] shadow-inner">
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
        <p className="text-[11.5px] text-text-muted leading-relaxed">
          Cài đặt chỉ tải gói; gạt nút <code>bật</code>/<code>tắt</code> để
          kích hoạt (tự khởi động lại proxy). Mặc định chỉ có{" "}
          <code>[proxy]</code> (SmartCrusher JSON); thêm <code>[code]</code> để
          nén AST mã nguồn và <code>[ml]</code> cho mô hình Kompress-v2 (~1 GB).
        </p>
      </div>
    );
  };

  const renderModuleCard = (moduleId, isActive) => {
    const meta = MODULE_META[moduleId];
    const { enabled, onToggle } = moduleStateMap[moduleId];
    const isEmerald = isActive && moduleId === "headroom" && headroomRunning;
    const accent = isEmerald ? "emerald" : "cyan";

    const spanClass =
      moduleId === "customPrompt" && isActive
        ? "md:col-span-2 xl:col-span-3"
        : moduleId === "headroom" && isActive && headroomStatus.installed
          ? "md:col-span-2"
          : "";

    const activeGlowClass = isActive
      ? isEmerald
        ? "hud-glow-emerald"
        : "hud-glow-cyan"
      : "";

    return (
      <HudFrame
        key={moduleId}
        id={moduleId === "rtk" ? "rtk" : undefined}
        chamfer="sm"
        accent={accent}
        padding="md"
        borderBeam={isActive}
        tilt={isActive}
        data-cursor-target={isActive ? "true" : undefined}
        className={`h-full ${spanClass} ${activeGlowClass}`}
      >
        <div className="flex h-full flex-col justify-between gap-3">
          <div className="space-y-3">
            {/* Header row */}
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-2.5 min-w-0 flex-1">
                <div
                  className={`size-9 rounded-lg border flex items-center justify-center shrink-0 mt-0.5 ${
                    isActive
                      ? isEmerald
                        ? "border-emerald-500/40 bg-emerald-500/12 text-emerald-600 dark:text-emerald-300"
                        : "border-cyan-500/40 bg-cyan-500/12 text-cyan-600 dark:text-cyan-300"
                      : "border-border bg-surface-2 text-text-muted"
                  }`}
                >
                  <span className="material-symbols-outlined text-[19px]">
                    {meta.icon}
                  </span>
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-semibold text-sm sm:text-[15px] text-text-main leading-snug">
                      {meta.title}{" "}
                      {meta.href ? (
                        <a
                          href={meta.href}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs font-mono font-normal text-primary underline hover:opacity-80"
                        >
                          ({meta.shortName})
                        </a>
                      ) : null}
                    </h3>
                  </div>

                  <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
                    <SavingsBadge
                      label={meta.savingsLabel}
                      active={isActive}
                      emerald={isEmerald}
                    />
                    <CompatibilityBadge type={meta.compatibility} />
                    {isActive && (
                      <span
                        className={`inline-flex items-center gap-1 font-mono text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${
                          isEmerald
                            ? "text-emerald-700 dark:text-emerald-300 bg-emerald-500/10"
                            : "text-cyan-700 dark:text-cyan-300 bg-cyan-500/10"
                        }`}
                      >
                        <span
                          className={`size-1.5 rounded-full ${
                            isEmerald ? "bg-emerald-500" : "bg-cyan-500"
                          } ${motionPaused ? "" : "animate-pulse"}`}
                        />
                        ĐANG BẬT
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="shrink-0 pt-0.5" data-cursor-target="true">
                <Toggle
                  checked={enabled}
                  onChange={(nextVal) => onToggle(nextVal)}
                />
              </div>
            </div>

            <p className="text-xs sm:text-[13px] text-text-muted leading-relaxed">
              {meta.description}
            </p>

            {/* Module-specific inline controls */}
            {moduleId === "headroom" && (
              <div className="space-y-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <span
                    className={`font-mono text-[11px] font-semibold px-2 py-0.5 rounded border ${
                      headroomStatus.loading
                        ? "border-cyan-500/35 bg-cyan-500/10 text-cyan-700 dark:text-cyan-300"
                        : headroomRunning
                          ? "border-emerald-500/35 bg-emerald-500/12 text-emerald-700 dark:text-emerald-300"
                          : "border-amber-500/35 bg-amber-500/12 text-amber-700 dark:text-amber-300"
                    }`}
                  >
                    {headroomStatusLabel}
                  </span>
                  <MagneticButton data-cursor-target="true">
                    <button
                      type="button"
                      onClick={() => {
                        playHudSound("click");
                        setShowHeadroomInstallModal(true);
                      }}
                      className="font-mono text-xs font-semibold text-primary underline hover:opacity-80 cursor-pointer"
                    >
                      {headroomRunning ? "Quản lý proxy" : "Cài đặt / Cấu hình"}
                    </button>
                  </MagneticButton>
                </div>
                {renderHeadroomExtras()}
              </div>
            )}

            {moduleId === "caveman" && (
              <div className="pt-1">
                <div className="mb-1 font-mono text-[10px] font-bold uppercase tracking-wider text-text-muted">
                  Mức độ nén đầu ra
                </div>
                <LevelSelectorPills
                  levels={visibleCavemanLevels}
                  value={cavemanLevel}
                  onChange={handleCavemanLevel}
                  compact={!isActive}
                />
              </div>
            )}

            {moduleId === "ponytail" && (
              <div className="pt-1">
                <div className="mb-1 font-mono text-[10px] font-bold uppercase tracking-wider text-text-muted">
                  Mức độ tối giản code
                </div>
                <LevelSelectorPills
                  levels={PONYTAIL_LEVELS}
                  value={ponytailLevel}
                  onChange={handlePonytailLevel}
                  compact={!isActive}
                />
              </div>
            )}

            {moduleId === "customPrompt" && (
              <div className="space-y-1.5 pt-1">
                <div className="flex items-center justify-between gap-2">
                  <label
                    htmlFor={`custom-prompt-${isActive ? "active" : "idle"}`}
                    className="font-mono text-[10px] font-bold uppercase tracking-wider text-text-muted"
                  >
                    Nội dung chỉ thị hệ thống
                  </label>
                  <div className="flex items-center gap-2">
                    {promptSavedHint && (
                      <span className="font-mono text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
                        Đã lưu
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        playHudSound("confirm");
                        handleCustomPromptSave();
                      }}
                      className="font-mono text-[11px] font-semibold text-primary underline hover:opacity-80 cursor-pointer"
                    >
                      Lưu nhanh
                    </button>
                  </div>
                </div>
                <textarea
                  id={`custom-prompt-${isActive ? "active" : "idle"}`}
                  aria-label="System prompt tùy chỉnh"
                  value={customPrompt}
                  onChange={(e) => setCustomPrompt(e.target.value)}
                  onBlur={handleCustomPromptSave}
                  rows={isActive ? 4 : 3}
                  placeholder="Ví dụ: Ưu tiên sửa trực tiếp file hiện có thay vì tạo file mới."
                  className="w-full rounded-lg border border-cyan-500/25 bg-white/60 dark:bg-[#060C19]/80 p-2.5 font-mono text-xs text-text-main focus:outline-none focus:border-cyan-500"
                />
                <p className="text-[11.5px] text-text-muted">
                  Áp dụng cho mọi nhà cung cấp và model. Tự động lưu khi rời ô
                  hoặc nhấn Lưu nhanh.
                </p>
              </div>
            )}
          </div>
        </div>
      </HudFrame>
    );
  };

  return (
    <div className="space-y-6 p-4 sm:p-6">
      {/* Top Telemetry Hero Strip */}
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
          <div
            className="grid grid-cols-2 sm:grid-cols-4 gap-2 font-mono text-[11px]"
            data-i18n-skip="true"
          >
            <div className="rounded-lg border border-cyan-500/25 bg-white/55 dark:bg-[#070D1B]/75 px-3 py-1.5">
              <div className="text-[9.5px] uppercase tracking-wider text-text-muted">
                Mô-đun đang bật
              </div>
              <div className="text-sm font-bold text-cyan-700 dark:text-cyan-300 hud-telemetry-num">
                <NumberTicker value={armedAgSaversCount} /> / 5
              </div>
            </div>

            <div className="rounded-lg border border-black/10 dark:border-white/10 bg-white/55 dark:bg-[#070D1B]/75 px-3 py-1.5">
              <div className="text-[9.5px] uppercase tracking-wider text-text-muted">
                Headroom Proxy
              </div>
              <div className="flex items-center gap-1.5 text-xs font-bold">
                <span
                  className={`size-1.5 rounded-full shrink-0 ${
                    headroomStatus.loading
                      ? "bg-cyan-500 animate-pulse"
                      : headroomRunning
                        ? `bg-emerald-500 ${motionPaused ? "" : "animate-pulse"}`
                        : "bg-amber-500"
                  }`}
                />
                <span
                  className={
                    headroomStatus.loading
                      ? "text-cyan-600 dark:text-cyan-400"
                      : headroomRunning
                        ? "text-emerald-600 dark:text-emerald-400"
                        : "text-amber-600 dark:text-amber-400"
                  }
                >
                  {headroomStatus.loading
                    ? "ĐANG KIỂM TRA…"
                    : headroomRunning
                      ? "ĐANG CHẠY"
                      : "ĐANG TẮT"}
                </span>
              </div>
            </div>

            <div className="rounded-lg border border-black/10 dark:border-white/10 bg-white/55 dark:bg-[#070D1B]/75 px-3 py-1.5">
              <div className="text-[9.5px] uppercase tracking-wider text-text-muted">
                Nén đầu ra
              </div>
              <div className="text-xs font-bold text-text-main truncate">
                {outputCompressionLabel}
              </div>
            </div>

            <div className="rounded-lg border border-amber-500/25 bg-white/55 dark:bg-[#070D1B]/75 px-3 py-1.5">
              <div className="text-[9.5px] uppercase tracking-wider text-text-muted">
                Bộ nhớ đệm Claude
              </div>
              <div className="text-xs font-bold text-amber-700 dark:text-amber-300">
                TTL {claudeCacheTtl.toUpperCase()}
              </div>
            </div>
          </div>
        </div>
      </HudFrame>

      {/* Live Token Compression Pipeline Circuit */}
      <TokenSaverFlowCircuit
        rtkEnabled={rtkEnabled}
        onToggleRtk={handleRtkEnabled}
        headroomEnabled={headroomEnabled}
        headroomRunning={headroomRunning}
        onToggleHeadroom={handleHeadroomEnabled}
        cavemanEnabled={cavemanEnabled}
        cavemanLevel={cavemanLevel}
        onToggleCaveman={handleCavemanEnabled}
        ponytailEnabled={ponytailEnabled}
        ponytailLevel={ponytailLevel}
        customPromptEnabled={customPromptEnabled}
        claudeCacheTtl={claudeCacheTtl}
        motionPaused={motionPaused}
      />

      {/* ZONE 1: Active Command Deck */}
      <section aria-labelledby="active-deck-heading" className="space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2.5">
            <span
              className={`size-2 rounded-full ${
                armedAgSaversCount > 0
                  ? `bg-emerald-500 ${motionPaused ? "" : "animate-pulse"} shadow-[0_0_8px_rgba(16,185,129,0.75)]`
                  : "bg-amber-500"
              }`}
            />
            <h2
              id="active-deck-heading"
              className="text-sm sm:text-base font-bold uppercase tracking-wider font-mono text-text-main"
            >
              Đang kích hoạt
            </h2>
            <span className="rounded border border-cyan-500/30 bg-cyan-500/10 px-2 py-0.5 font-mono text-[11px] font-bold text-cyan-700 dark:text-cyan-300">
              {armedAgSaversCount} / 5 mô-đun
            </span>
          </div>
          <p className="text-xs text-text-muted">
            Các mô-đun đang trực tiếp nén &amp; tối ưu luồng prompt/phản hồi
          </p>
        </div>

        {activeModules.length === 0 ? (
          <HudFrame chamfer="sm" accent="amber" padding="md">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="space-y-1">
                <p className="font-semibold text-text-main">
                  Chưa có mô-đun tiết kiệm token nào đang kích hoạt
                </p>
                <p className="text-xs sm:text-sm text-text-muted">
                  Bật nhanh bộ đôi RTK &amp; Caveman để tự động giảm 60–90%
                  token đầu vào từ terminal/tool và ~65% token đầu ra.
                </p>
              </div>
              <MagneticButton className="shrink-0" data-cursor-target="true">
                <Button
                  variant="primary"
                  icon="bolt"
                  onClick={handleEnableRecommended}
                >
                  Bật RTK &amp; Caveman gợi ý
                </Button>
              </MagneticButton>
            </div>
          </HudFrame>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {activeModules.map((id) => renderModuleCard(id, true))}
          </div>
        )}
      </section>

      {/* ZONE 2: Inactive Modules & Additional Configuration Bento Grid */}
      <section aria-labelledby="inactive-bento-heading" className="space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2.5">
            <span className="size-2 rounded-full bg-cyan-500/60" />
            <h2
              id="inactive-bento-heading"
              className="text-sm sm:text-base font-bold uppercase tracking-wider font-mono text-text-main"
            >
              {inactiveModules.length > 0
                ? "Chưa kích hoạt & Cấu hình"
                : "Cấu hình bổ sung"}
            </h2>
            {inactiveModules.length > 0 && (
              <span className="rounded border border-black/10 dark:border-white/15 bg-black/[0.03] dark:bg-white/[0.04] px-2 py-0.5 font-mono text-[11px] font-bold text-text-muted">
                {inactiveModules.length} mô-đun tắt
              </span>
            )}
          </div>
          <p className="text-xs text-text-muted">
            Bật nhanh các bộ lọc chưa kích hoạt và tinh chỉnh bộ nhớ đệm
            Anthropic
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {inactiveModules.map((id) => renderModuleCard(id, false))}

          {/* Dedicated Claude Cache TTL Card */}
          <HudFrame
            chamfer="sm"
            accent="amber"
            padding="md"
            className={inactiveModules.length % 2 === 0 ? "lg:col-span-2" : ""}
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="min-w-0 flex-1 space-y-1.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="size-8 rounded-lg border border-amber-500/35 bg-amber-500/12 text-amber-600 dark:text-amber-300 flex items-center justify-center shrink-0">
                    <span className="material-symbols-outlined text-[18px]">
                      cached
                    </span>
                  </div>
                  <h3 className="font-semibold text-sm sm:text-[15px] text-text-main">
                    Thời hạn bộ nhớ đệm (Claude)
                  </h3>
                  <CompatibilityBadge type="claude" />
                </div>
                <p className="text-xs sm:text-[13px] text-text-muted leading-relaxed">
                  Thời gian giữ cache hội thoại trên các provider chuẩn
                  Anthropic. System prompt và tools luôn được lưu cố định 1 giờ.
                </p>
              </div>

              <div className="flex flex-col sm:items-end gap-1.5 shrink-0">
                <div className="inline-flex items-center rounded-lg border border-amber-500/30 bg-black/[0.03] dark:bg-black/35 p-0.5 gap-0.5">
                  {CLAUDE_CACHE_TTLS.map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      data-cursor-target="true"
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
                  {
                    CLAUDE_CACHE_TTLS.find((opt) => opt.id === claudeCacheTtl)
                      ?.desc
                  }
                </p>
              </div>
            </div>
          </HudFrame>
        </div>
      </section>

      {/* Headroom Management / Setup Modal (100% Vietnamese) */}
      <Modal
        isOpen={showHeadroomInstallModal}
        title={headroomRunning ? "Quản lý Headroom" : "Cài đặt Headroom"}
        onClose={() => setShowHeadroomInstallModal(false)}
      >
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between text-sm">
            <span>Trạng thái</span>
            <span
              className={`font-mono font-semibold ${
                headroomRunning ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"
              }`}
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
              Dùng proxy nội bộ để Bật/Tắt nhanh, hoặc dùng sidecar Docker bên
              ngoài như http://headroom:8787.
            </p>
          </div>
          <div className="flex flex-col gap-1">
            <p className="text-sm font-medium">Thời gian chờ (ms)</p>
            <Input
              value={String(headroomTimeoutMs)}
              onChange={(e) => setHeadroomTimeoutMs(e.target.value)}
              onBlur={handleHeadroomTimeoutBlur}
              placeholder="3000"
              className="font-mono text-sm"
            />
            <p className="text-xs text-text-muted">
              Giới hạn thời gian chờ mỗi yêu cầu (mili-giây). Mặc định 3000 ms.
            </p>
          </div>
          {headroomManaged ? (
            <Button
              onClick={handleHeadroomStop}
              variant="ghost"
              fullWidth
              disabled={headroomActionLoading}
            >
              {headroomActionLoading ? "Đang dừng…" : "Dừng Headroom"}
            </Button>
          ) : headroomRunning ? (
            <p className="text-sm text-emerald-600 dark:text-emerald-400">
              Headroom proxy đã kết nối. Bạn có thể bật tính năng tiết kiệm
              token.
            </p>
          ) : headroomCanStart ? (
            <Button
              onClick={handleHeadroomStart}
              fullWidth
              disabled={headroomActionLoading}
            >
              {headroomActionLoading
                ? "Đang khởi động…"
                : "Khởi động Headroom"}
            </Button>
          ) : !headroomLocalUrl ? (
            <p className="text-sm text-amber-600 dark:text-amber-400">
              Hãy khởi chạy Headroom riêng tại URL đã cấu hình, sau đó nhấn Kiểm
              tra lại.
            </p>
          ) : !headroomStatus.python ? (
            <p className="text-sm text-amber-600 dark:text-amber-400">
              Cần Python ≥ 3.10 để chạy chế độ tự quản lý. Hãy cài Python trước
              hoặc dùng URL proxy bên ngoài.
            </p>
          ) : (
            <div className="flex flex-col gap-1">
              <p className="text-sm font-medium">
                Cài đặt rồi nhấn Khởi động:
              </p>
              <div className="flex items-center gap-2">
                <pre className="flex-1 rounded bg-black/5 dark:bg-white/5 p-2 text-xs font-mono overflow-x-auto">
                  {`pip install "headroom-ai[proxy]"`}
                </pre>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => copy(`pip install "headroom-ai[proxy]"`)}
                >
                  {copied ? "Đã chép" : "Chép"}
                </Button>
              </div>
            </div>
          )}
          {headroomActionError && (
            <p className="text-sm text-amber-600 dark:text-amber-400">
              {headroomActionError}
            </p>
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

      <ConfirmModal
        isOpen={Boolean(extrasConfirm)}
        onClose={() => setExtrasConfirm(null)}
        onConfirm={() => {
          const fn = extrasConfirm?.onConfirm;
          setExtrasConfirm(null);
          fn?.();
        }}
        title={extrasConfirm?.title}
        message={extrasConfirm?.message}
        confirmText={extrasConfirm?.confirmText}
        cancelText="Hủy"
        variant={extrasConfirm?.variant}
      />
    </div>
  );
}
