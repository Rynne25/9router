"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Button from "@/shared/components/Button";
import Input from "@/shared/components/Input";
import Modal, { ConfirmModal } from "@/shared/components/Modal";
import Toggle from "@/shared/components/Toggle";
import HudFrame from "@/shared/components/hud/HudFrame";
import NumberTicker from "@/shared/components/hud/NumberTicker";
import MagneticButton from "@/shared/components/hud/MagneticButton";
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
  toon: {
    id: "toon",
    title: "Nén JSON dạng bảng TOON",
    shortName: "TOON",
    href: null,
    icon: "table_chart",
    savingsLabel: "-30–60% JSON",
    description:
      "Chuyển mảng JSON đồng nhất trong kết quả tool sang định dạng bảng [TOON] cô đọng (Pure-JS, fail-open)",
    compatibility: "antigravity",
  },
  toolDedup: {
    id: "toolDedup",
    title: "Khử trùng lặp kết quả Tool",
    shortName: "Tool Dedup",
    href: null,
    icon: "content_copy",
    savingsLabel: "-15–40% lặp lại",
    description:
      "Thay thế các lần đọc file / output công cụ giống hệt nhau bằng tham chiếu ngắn SHA-256",
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

const MODULE_ORDER = [
  "rtk",
  "toon",
  "toolDedup",
  "headroom",
  "caveman",
  "ponytail",
  "customPrompt",
];

const TOOL_DEDUP_MODES = [
  {
    id: "cache-safe",
    label: "Giữ Cache (Cache-Safe)",
    desc: "Giữ nguyên lần đọc đầu tiên để bảo toàn Prompt Cache prefix; thay thế các lần lặp sau.",
  },
  {
    id: "recency",
    label: "Ưu tiên mới nhất (Recency)",
    desc: "Giữ kết quả mới nhất ở cuối hội thoại; thay thế các bản trùng lặp cũ hơn bằng tham chiếu.",
  },
];

const SMART_PRESETS = [
  {
    id: "balanced",
    label: "Cân bằng & Giữ Cache",
    badge: "Khuyên dùng",
    icon: "balance",
    desc: "Bật đủ tầng 1 (RTK + TOON + Dedup Cache-Safe) + Caveman Full + Ponytail Full.",
    patch: {
      rtkEnabled: true,
      toonEnabled: true,
      toolDedupEnabled: true,
      toolDedupMode: "cache-safe",
      cavemanEnabled: true,
      cavemanLevel: "full",
      ponytailEnabled: true,
      ponytailLevel: "full",
    },
  },
  {
    id: "max",
    label: "Tiết kiệm tối đa",
    badge: "Nén sâu nhất",
    icon: "local_fire_department",
    desc: "Dedup Recency + Caveman Ultra + Ponytail Full — cắt giảm tối đa token.",
    patch: {
      rtkEnabled: true,
      toonEnabled: true,
      toolDedupEnabled: true,
      toolDedupMode: "recency",
      cavemanEnabled: true,
      cavemanLevel: "ultra",
      ponytailEnabled: true,
      ponytailLevel: "full",
    },
  },
  {
    id: "lossless",
    label: "An toàn tuyệt đối",
    badge: "0% đổi văn phong",
    icon: "verified_user",
    desc: "Chỉ bật RTK + TOON + Tool Dedup (Cache-Safe), tắt Caveman & Ponytail.",
    patch: {
      rtkEnabled: true,
      toonEnabled: true,
      toolDedupEnabled: true,
      toolDedupMode: "cache-safe",
      cavemanEnabled: false,
      ponytailEnabled: false,
    },
  },
];

const PLUGIN_FALLBACK_DESC = {
  "agy-dart": "Bộ tối ưu ngữ cảnh & token cho Antigravity trên Node >= 22.16 (thay thế agy-fast & context-mode).",
  "agy-fast": "Plugin tăng tốc & nén ngữ cảnh Antigravity tương thích Node >= 20.",
  "context-mode": "Nén và cô đọng context window cho Antigravity IDE.",
  codegraph: "MCP Server lập chỉ mục đồ thị mã nguồn giúp giảm đọc file dư thừa.",
  "codebase-memory-mcp": "MCP Server bộ nhớ codebase dạng đồ thị hiệu năng cao.",
  mcptoon: "Cổng MCP nén payload JSON sang định dạng TOON (yêu cầu Python).",
};

function detectTokenSaverPreset(cfg) {
  for (const preset of SMART_PRESETS) {
    const p = preset.patch;
    const matchesCore =
      Boolean(cfg.rtkEnabled) === p.rtkEnabled &&
      Boolean(cfg.toonEnabled) === p.toonEnabled &&
      Boolean(cfg.toolDedupEnabled) === p.toolDedupEnabled &&
      cfg.toolDedupMode === p.toolDedupMode &&
      Boolean(cfg.cavemanEnabled) === p.cavemanEnabled &&
      Boolean(cfg.ponytailEnabled) === p.ponytailEnabled;
    if (!matchesCore) continue;
    if (p.cavemanEnabled && cfg.cavemanLevel !== p.cavemanLevel) continue;
    if (p.ponytailEnabled && cfg.ponytailLevel !== p.ponytailLevel) continue;
    return preset.id;
  }
  return "custom";
}

function getHeadroomPortLabel(url) {
  try {
    const parsed = new URL(url || "http://localhost:8787");
    const port = parsed.port || (parsed.protocol === "https:" ? "443" : "8787");
    return `:${port}`;
  } catch {
    return ":8787";
  }
}

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
  const [toonEnabled, setToonEnabled] = useState(() =>
    seedSettings ? seedSettings.toonEnabled !== false : true
  );
  const [toolDedupEnabled, setToolDedupEnabled] = useState(() =>
    seedSettings ? seedSettings.toolDedupEnabled !== false : true
  );
  const [toolDedupMode, setToolDedupMode] = useState(() =>
    seedSettings?.toolDedupMode === "recency" ? "recency" : "cache-safe"
  );
  const [tokenSaverPreset, setTokenSaverPreset] = useState(() =>
    ["balanced", "max", "lossless", "custom"].includes(seedSettings?.tokenSaverPreset)
      ? seedSettings.tokenSaverPreset
      : "balanced"
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
  const [headroomMode, setHeadroomMode] = useState(() =>
    seedSettings?.headroomMode === "token" ? "token" : "cache"
  );
  const [headroomTargetRatio, setHeadroomTargetRatio] = useState(() =>
    typeof seedSettings?.headroomTargetRatio === "number"
      ? String(seedSettings.headroomTargetRatio)
      : ""
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

  const [headroomStatus, setHeadroomStatus] = useState(() => {
    const cached = getCachedData("/api/headroom/status");
    if (cached && typeof cached === "object") {
      return { ...cached, loading: false };
    }
    return {
      installed: false,
      running: false,
      python: null,
      loading: true,
    };
  });
  const [showHeadroomInstallModal, setShowHeadroomInstallModal] =
    useState(false);
  const [headroomActionLoading, setHeadroomActionLoading] = useState(false);
  const [headroomActionError, setHeadroomActionError] = useState("");
  const [headroomExtras, setHeadroomExtras] = useState(() => {
    const cached = getCachedData("/api/headroom/status");
    return {
      version: cached?.version ?? null,
      extras: cached?.extras || { code: false, ml: false },
      available: ["code", "ml"],
      loading: false,
    };
  });
  const [pendingExtras, setPendingExtras] = useState([]);
  const [extrasActionLoading, setExtrasActionLoading] = useState(false);
  const [extrasActionError, setExtrasActionError] = useState("");
  const [removingExtra, setRemovingExtra] = useState(null);
  const [installLog, setInstallLog] = useState("");
  const [extrasConfirm, setExtrasConfirm] = useState(null);
  const [restartingProxy, setRestartingProxy] = useState(false);
  const [promptSavedHint, setPromptSavedHint] = useState(false);
  const [pluginState, setPluginState] = useState({
    loading: true,
    env: null,
    smartPackIds: [],
    smartPackNote: "",
    plugins: [],
    installing: false,
    currentPluginId: null,
    logTail: "",
  });
  const [pluginActionBusy, setPluginActionBusy] = useState(false);
  const [pluginFeedback, setPluginFeedback] = useState(null);
  const [showPluginLog, setShowPluginLog] = useState(false);

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

  const buildPresetPatch = useCallback(
    (overrides) => {
      const merged = {
        rtkEnabled,
        toonEnabled,
        toolDedupEnabled,
        toolDedupMode,
        cavemanEnabled,
        cavemanLevel,
        ponytailEnabled,
        ponytailLevel,
        ...overrides,
      };
      const matchedPreset = detectTokenSaverPreset(merged);
      setTokenSaverPreset(matchedPreset);
      return { ...overrides, tokenSaverPreset: matchedPreset };
    },
    [
      rtkEnabled,
      toonEnabled,
      toolDedupEnabled,
      toolDedupMode,
      cavemanEnabled,
      cavemanLevel,
      ponytailEnabled,
      ponytailLevel,
    ]
  );

  const handleRtkEnabled = async (value) => {
    const prev = rtkEnabled;
    const prevPreset = tokenSaverPreset;
    setRtkEnabledState(value);
    const ok = await patchSetting(buildPresetPatch({ rtkEnabled: value }));
    if (!ok) {
      setRtkEnabledState(prev);
      setTokenSaverPreset(prevPreset);
    }
  };

  const handleToonEnabled = async (value) => {
    const prev = toonEnabled;
    const prevPreset = tokenSaverPreset;
    setToonEnabled(value);
    const ok = await patchSetting(buildPresetPatch({ toonEnabled: value }));
    if (!ok) {
      setToonEnabled(prev);
      setTokenSaverPreset(prevPreset);
    }
  };

  const handleToolDedupEnabled = async (value) => {
    const prev = toolDedupEnabled;
    const prevPreset = tokenSaverPreset;
    setToolDedupEnabled(value);
    const ok = await patchSetting(buildPresetPatch({ toolDedupEnabled: value }));
    if (!ok) {
      setToolDedupEnabled(prev);
      setTokenSaverPreset(prevPreset);
    }
  };

  const handleToolDedupMode = (mode) => {
    const normalized = mode === "recency" ? "recency" : "cache-safe";
    playHudSound("click");
    setToolDedupMode(normalized);
    patchSetting(buildPresetPatch({ toolDedupMode: normalized }));
  };

  const handleApplyPreset = async (preset) => {
    playHudSound("confirm");
    const p = preset.patch;
    setRtkEnabledState(p.rtkEnabled);
    setToonEnabled(p.toonEnabled);
    setToolDedupEnabled(p.toolDedupEnabled);
    setToolDedupMode(p.toolDedupMode);
    setCavemanEnabled(p.cavemanEnabled);
    if (p.cavemanLevel) setCavemanLevel(p.cavemanLevel);
    setPonytailEnabled(p.ponytailEnabled);
    if (p.ponytailLevel) setPonytailLevel(p.ponytailLevel);
    setTokenSaverPreset(preset.id);
    await patchSetting({ ...p, tokenSaverPreset: preset.id });
  };

  const handleCavemanEnabled = (value) => {
    setCavemanEnabled(value);
    patchSetting(buildPresetPatch({ cavemanEnabled: value }));
  };

  const handleEnableRecommended = () => {
    const balanced = SMART_PRESETS[0];
    handleApplyPreset(balanced);
  };

  const refreshHeadroomStatus = useCallback(async ({ force = false } = {}) => {
    if (force || !getCachedData("/api/headroom/status")) {
      setHeadroomStatus((s) => (s.loading ? s : { ...s, loading: true }));
    }
    try {
      const res = await fetch(`/api/headroom/status${force ? "?refresh=1" : ""}`, {
        headers: { "Cache-Control": "no-store" },
      });
      const data = await res.json();
      setCachedData("/api/headroom/status", data);
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
      if (data.extras && typeof data.extras === "object") {
        setHeadroomExtras((s) => ({
          ...s,
          version: data.version ?? null,
          extras: data.extras,
          available: ["code", "ml"],
          loading: false,
        }));
        setPendingExtras([]);
        return;
      }
      try {
        const er = await fetch(`/api/headroom/extras${force ? "?refresh=1" : ""}`, {
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

  const handleHeadroomStart = useCallback(async () => {
    setHeadroomActionError("");
    setHeadroomActionLoading(true);
    try {
      const res = await fetch("/api/headroom/start", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Không thể khởi động proxy");
      playHudSound("confirm");
      await refreshHeadroomStatus({ force: true });
    } catch (e) {
      playHudSound("alert");
      setHeadroomActionError(e.message);
    } finally {
      setHeadroomActionLoading(false);
    }
  }, [refreshHeadroomStatus]);

  const handleHeadroomStop = useCallback(async () => {
    setHeadroomActionError("");
    setHeadroomActionLoading(true);
    try {
      const res = await fetch("/api/headroom/stop", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Không thể dừng proxy");
      playHudSound("toggle");
      await refreshHeadroomStatus({ force: true });
    } catch (e) {
      playHudSound("alert");
      setHeadroomActionError(e.message);
    } finally {
      setHeadroomActionLoading(false);
    }
  }, [refreshHeadroomStatus]);

  const handleHeadroomEnabled = async (value) => {
    const nextUrl = headroomUrl.trim() || "http://localhost:8787";
    setHeadroomUrl(nextUrl);
    setHeadroomEnabled(value);
    await patchSetting({ headroomEnabled: value, headroomUrl: nextUrl });
    const isLocal = headroomStatus.localUrl !== false;
    const canStart = Boolean(headroomStatus.canStart);
    const isRunning = Boolean(headroomStatus.running);
    if (value === true && isLocal && canStart && !isRunning && !headroomActionLoading) {
      await handleHeadroomStart();
    }
  };

  const handleHeadroomUrlBlur = async () => {
    const next = headroomUrl.trim() || "http://localhost:8787";
    setHeadroomUrl(next);
    await patchSetting({ headroomUrl: next });
    refreshHeadroomStatus();
  };

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

  const restartManagedProxyIfRunning = useCallback(async () => {
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
  }, [
    headroomStatus.running,
    headroomStatus.managedPid,
    headroomStatus.localUrl,
    refreshHeadroomStatus,
  ]);

  // Toggle an extra's active state (persist setting), then restart the proxy so
  // the new --code-aware / --disable-kompress flags take effect.
  const toggleExtraActive = useCallback(
    async (extra, value) => {
      setExtrasActionError("");
      if (extra === "code") setCodeAware(value);
      if (extra === "ml") setKompress(value);
      const key = extra === "code" ? "headroomCodeAware" : "headroomKompress";
      await patchSetting({ [key]: value });
      await restartManagedProxyIfRunning();
    },
    [patchSetting, restartManagedProxyIfRunning]
  );

  const handleHeadroomMode = useCallback(
    async (nextMode) => {
      const normalized = nextMode === "token" ? "token" : "cache";
      if (normalized === headroomMode) return;
      playHudSound("click");
      setExtrasActionError("");
      setHeadroomMode(normalized);
      await patchSetting({ headroomMode: normalized });
      await restartManagedProxyIfRunning();
    },
    [headroomMode, patchSetting, restartManagedProxyIfRunning]
  );

  const handleHeadroomTargetRatioBlur = useCallback(async () => {
    const trimmed = String(headroomTargetRatio).trim();
    if (!trimmed) {
      setHeadroomTargetRatio("");
      await patchSetting({ headroomTargetRatio: null });
      await restartManagedProxyIfRunning();
      return;
    }
    const num = Number(trimmed);
    if (!Number.isFinite(num) || num < 0.1 || num > 0.95) {
      setHeadroomTargetRatio("");
      await patchSetting({ headroomTargetRatio: null });
      return;
    }
    const rounded = Math.round(num * 100) / 100;
    setHeadroomTargetRatio(String(rounded));
    await patchSetting({ headroomTargetRatio: rounded });
    await restartManagedProxyIfRunning();
  }, [headroomTargetRatio, patchSetting, restartManagedProxyIfRunning]);

  const handleCavemanLevel = (level) => {
    playHudSound("click");
    setCavemanLevel(level);
    patchSetting(buildPresetPatch({ cavemanLevel: level }));
  };

  const handlePonytailEnabled = (value) => {
    setPonytailEnabled(value);
    patchSetting(buildPresetPatch({ ponytailEnabled: value }));
  };

  const handlePonytailLevel = (level) => {
    playHudSound("click");
    setPonytailLevel(level);
    patchSetting(buildPresetPatch({ ponytailLevel: level }));
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

  const refreshAntigravityPlugins = useCallback(async () => {
    try {
      const res = await fetch("/api/antigravity/plugins", {
        headers: { "Cache-Control": "no-store" },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setPluginState({
        loading: false,
        env: data.env || null,
        smartPackIds: Array.isArray(data.smartPackIds) ? data.smartPackIds : [],
        smartPackNote: data.smartPackNote || "",
        plugins: Array.isArray(data.plugins) ? data.plugins : [],
        installing: Boolean(data.installing),
        currentPluginId: data.currentPluginId || null,
        logTail: typeof data.logTail === "string" ? data.logTail : "",
      });
    } catch {
      setPluginState((s) => ({ ...s, loading: false }));
    }
  }, []);

  const handlePluginAction = useCallback(
    async (action, pluginId = null) => {
      if (pluginActionBusy) return;
      playHudSound("click");
      setPluginActionBusy(true);
      setPluginFeedback(null);
      setShowPluginLog(true);
      try {
        const res = await fetch("/api/antigravity/plugins/install", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action,
            ...(pluginId ? { pluginId } : {}),
            autoResolveConflicts: true,
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || data.ok === false) {
          throw new Error(data.error || `Thao tác thất bại (${res.status})`);
        }
        if (data.status && typeof data.status === "object") {
          setPluginState({
            loading: false,
            env: data.status.env || null,
            smartPackIds: Array.isArray(data.status.smartPackIds) ? data.status.smartPackIds : [],
            smartPackNote: data.status.smartPackNote || "",
            plugins: Array.isArray(data.status.plugins) ? data.status.plugins : [],
            installing: Boolean(data.status.installing),
            currentPluginId: data.status.currentPluginId || null,
            logTail:
              typeof data.logTail === "string"
                ? data.logTail
                : typeof data.status.logTail === "string"
                  ? data.status.logTail
                  : "",
          });
        } else {
          await refreshAntigravityPlugins();
        }
        playHudSound("confirm");
        const results = Array.isArray(data.results) ? data.results : [];
        const summaryMsg =
          action === "doctor"
            ? "Đã hoàn tất kiểm tra sức khỏe (Doctor)"
            : action === "install-smart-pack"
              ? "Đã cài đặt xong gói Plugin thông minh"
              : action === "uninstall"
                ? `Đã gỡ cài đặt ${pluginId}`
                : `Đã cài đặt ${pluginId}`;
        setPluginFeedback({
          ok: true,
          message: summaryMsg,
          results,
        });
      } catch (e) {
        playHudSound("alert");
        setPluginFeedback({
          ok: false,
          message: e?.message || "Lỗi xử lý plugin Antigravity",
          results: [],
        });
        await refreshAntigravityPlugins();
      } finally {
        setPluginActionBusy(false);
      }
    },
    [pluginActionBusy, refreshAntigravityPlugins]
  );

  // Non-blocking mount: Headroom status + Antigravity plugins + silent background /api/settings refresh
  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) {
        refreshHeadroomStatus();
        refreshAntigravityPlugins();
      }
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
        setToonEnabled(data.toonEnabled !== false);
        setToolDedupEnabled(data.toolDedupEnabled !== false);
        setToolDedupMode(data.toolDedupMode === "recency" ? "recency" : "cache-safe");
        setTokenSaverPreset(
          ["balanced", "max", "lossless", "custom"].includes(data.tokenSaverPreset)
            ? data.tokenSaverPreset
            : "balanced"
        );
        setHeadroomEnabled(Boolean(data.headroomEnabled));
        setHeadroomUrl(data.headroomUrl || "http://localhost:8787");
        if (typeof data.headroomTimeoutMs === "number") {
          setHeadroomTimeoutMs(data.headroomTimeoutMs);
        }
        setCodeAware(data.headroomCodeAware === true);
        setKompress(data.headroomKompress !== false);
        setHeadroomMode(data.headroomMode === "token" ? "token" : "cache");
        setHeadroomTargetRatio(
          typeof data.headroomTargetRatio === "number"
            ? String(data.headroomTargetRatio)
            : ""
        );
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
  }, [refreshHeadroomStatus, refreshAntigravityPlugins]);

  // Poll Antigravity plugin status & logTail while an install action is running
  useEffect(() => {
    if (!pluginActionBusy && !pluginState.installing) return;
    const timer = setInterval(() => {
      if (!document.hidden) {
        refreshAntigravityPlugins();
      }
    }, 1500);
    return () => clearInterval(timer);
  }, [pluginActionBusy, pluginState.installing, refreshAntigravityPlugins]);

  const headroomRunning = Boolean(headroomStatus.running);
  const headroomLocalUrl = headroomStatus.localUrl !== false;
  const headroomCanStart = Boolean(headroomStatus.canStart);
  const headroomManaged = headroomLocalUrl && Boolean(headroomStatus.managedPid);
  const headroomStarting = headroomLocalUrl && !headroomRunning && Boolean(headroomStatus.managedPid);
  const headroomPortLabel = getHeadroomPortLabel(headroomUrl);
  const headroomStatusLabel = headroomStatus.loading
    ? "Đang kiểm tra Proxy…"
    : headroomRunning
      ? headroomManaged
        ? `Proxy ${headroomPortLabel} đang chạy (9Router)`
        : `Proxy ${headroomPortLabel} đang chạy (bên ngoài)`
      : headroomStarting
        ? `Proxy ${headroomPortLabel} đang khởi động…`
        : headroomLocalUrl && !headroomStatus.installed
          ? "Chưa cài Headroom"
          : headroomLocalUrl
            ? `Proxy ${headroomPortLabel} đang tắt`
            : `Proxy ngoài (${headroomPortLabel}) chưa kết nối`;

  // Poll briefly while Headroom proxy spawns and loads ML/Tree-sitter models
  useEffect(() => {
    if (!headroomStarting) return;
    const timer = setInterval(() => {
      if (!document.hidden) {
        refreshHeadroomStatus();
      }
    }, 3000);
    return () => clearInterval(timer);
  }, [headroomStarting, refreshHeadroomStatus]);

  const moduleStateMap = {
    rtk: { enabled: rtkEnabled, onToggle: handleRtkEnabled },
    toon: { enabled: toonEnabled, onToggle: handleToonEnabled },
    toolDedup: { enabled: toolDedupEnabled, onToggle: handleToolDedupEnabled },
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
      <div className="rounded-xl border border-cyan-500/18 bg-black/[0.025] dark:bg-[#050A15]/70 p-3 space-y-2.5">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono text-[11px] font-semibold uppercase tracking-wider text-text-muted">
              Gói mở rộng{headroomExtras.version ? ` · v${headroomExtras.version}` : ""}
            </span>
            {headroomExtras.available.map((extra) => {
              const installed = Boolean(headroomExtras.extras[extra]);
              const pending = pendingExtras.includes(extra);
              const extraTitle =
                extra === "code"
                  ? "Nén AST bằng tree-sitter cho phản hồi code (tự restart proxy khi bật/tắt)"
                  : "Mô hình Kompress-v2 HF cho văn bản dài/agent ~1 GB (tự restart proxy khi bật/tắt)";

              if (installed) {
                const active = extra === "code" ? codeAware : kompress;
                return (
                  <div
                    key={extra}
                    className="inline-flex items-center gap-1.5 text-xs pl-2 pr-1.5 py-0.5 rounded-md border border-emerald-500/35 bg-emerald-500/10 text-text-main"
                    title={extraTitle}
                  >
                    <Toggle
                      size="sm"
                      checked={active}
                      disabled={restartingProxy}
                      onChange={() => toggleExtraActive(extra, !active)}
                    />
                    <span className="font-mono text-[11px] font-semibold">[{extra}]</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveExtra(extra)}
                      disabled={removingExtra === extra}
                      className="inline-flex items-center justify-center size-4 rounded text-rose-600/80 dark:text-rose-400/80 hover:text-rose-500 hover:bg-rose-500/15 disabled:opacity-50 cursor-pointer transition-colors"
                      aria-label={`Gỡ cài đặt [${extra}]`}
                      title={`Gỡ cài đặt [${extra}]`}
                    >
                      <span className="material-symbols-outlined text-[13px]">
                        {removingExtra === extra ? "progress_activity" : "close"}
                      </span>
                    </button>
                  </div>
                );
              }

              return (
                <label
                  key={extra}
                  className={`inline-flex items-center gap-1.5 text-xs px-2 py-0.5 rounded-md border cursor-pointer transition-colors ${
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
                  <span className="font-mono text-[11px] font-semibold">[{extra}]</span>
                </label>
              );
            })}
          </div>
          {pendingExtras.length > 0 && (
            <MagneticButton data-cursor-target="true">
              <button
                type="button"
                onClick={handleInstallExtras}
                disabled={extrasActionLoading}
                className="font-mono text-[11px] font-bold px-2.5 py-1 rounded-md bg-primary text-white hover:opacity-90 disabled:opacity-50 cursor-pointer"
              >
                {extrasActionLoading
                  ? "Đang cài…"
                  : `Cài [proxy,${pendingExtras.join(",")}]`}
              </button>
            </MagneticButton>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 flex-wrap pt-2 border-t border-cyan-500/10">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono text-[11px] font-semibold uppercase tracking-wider text-text-muted">
              Chế độ
            </span>
            <div className="inline-flex items-center rounded-md border border-cyan-500/25 bg-black/[0.03] dark:bg-black/35 p-0.5 gap-0.5">
              {[
                { id: "cache", label: "Cache (mặc định)", title: "Giữ prefix-cache tối đa cho lượt trước" },
                { id: "token", label: "Token (nén sâu)", title: "Nén lại các lượt trước để giảm tối đa token (--mode token)" },
              ].map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  disabled={restartingProxy}
                  onClick={() => handleHeadroomMode(opt.id)}
                  title={opt.title}
                  data-cursor-target="true"
                  className={`px-2 py-0.5 rounded font-mono text-[11px] font-semibold transition-all cursor-pointer disabled:opacity-50 ${
                    headroomMode === opt.id
                      ? "bg-primary text-white shadow-2xs"
                      : "text-text-muted hover:text-text-main hover:bg-white/40 dark:hover:bg-white/[0.06]"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            {headroomTargetRatio && (
              <span className="font-mono text-[11px] text-cyan-700 dark:text-cyan-300">
                ratio {headroomTargetRatio}
              </span>
            )}
          </div>
          <span
            className="inline-flex items-center gap-1 rounded border border-emerald-500/25 bg-emerald-500/8 px-2 py-0.5 font-mono text-[10px] font-semibold text-emerald-700 dark:text-emerald-400"
            title="HEADROOM_BEACON=off & HEADROOM_TELEMETRY=off"
          >
            <span className="material-symbols-outlined text-[12px]">verified_user</span>
            Beacon tắt mặc định
          </span>
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
      </div>
    );
  };

  const renderModuleCard = (moduleId, isActive) => {
    const meta = MODULE_META[moduleId];
    const { enabled, onToggle } = moduleStateMap[moduleId];
    const isEmerald = isActive && moduleId === "headroom" && headroomRunning;
    const accent = isEmerald ? "emerald" : "cyan";
    const isHorizontalHeadroom = isActive && moduleId === "headroom";

    const activeGlowClass = isActive
      ? isEmerald
        ? "hud-glow-emerald"
        : "hud-glow-cyan"
      : "";

    const renderHeadroomControls = () => (
      <div className="space-y-1.5">
        <div className="flex items-center gap-2 flex-wrap">
          <span
            className={`font-mono text-[11px] font-semibold px-2 py-0.5 rounded border ${
              headroomStatus.loading || headroomStarting
                ? "border-cyan-500/35 bg-cyan-500/10 text-cyan-700 dark:text-cyan-300"
                : headroomRunning
                  ? "border-emerald-500/35 bg-emerald-500/12 text-emerald-700 dark:text-emerald-300"
                  : "border-amber-500/35 bg-amber-500/12 text-amber-700 dark:text-amber-300"
            }`}
          >
            {headroomStatusLabel}
          </span>
          {!headroomStatus.loading && (
            headroomRunning && headroomManaged ? (
              <Button
                size="xs"
                variant="danger"
                icon="stop_circle"
                loading={headroomActionLoading}
                onClick={handleHeadroomStop}
                data-cursor-target="true"
              >
                {headroomActionLoading ? "Đang dừng…" : "Dừng Proxy"}
              </Button>
            ) : headroomStarting ? (
              <Button
                size="xs"
                variant="danger"
                icon="cancel"
                loading={headroomActionLoading}
                onClick={handleHeadroomStop}
                data-cursor-target="true"
              >
                {headroomActionLoading ? "Đang hủy…" : "Hủy khởi động"}
              </Button>
            ) : !headroomRunning && headroomLocalUrl && headroomCanStart ? (
              <Button
                size="xs"
                variant="primary"
                icon="play_arrow"
                loading={headroomActionLoading}
                onClick={handleHeadroomStart}
                data-cursor-target="true"
              >
                {headroomActionLoading ? "Đang khởi động…" : "Khởi động Proxy"}
              </Button>
            ) : null
          )}
          <MagneticButton data-cursor-target="true">
            <button
              type="button"
              onClick={() => {
                playHudSound("click");
                setShowHeadroomInstallModal(true);
              }}
              className="font-mono text-xs font-semibold text-primary underline hover:opacity-80 cursor-pointer"
            >
              {headroomRunning || headroomStarting ? "Quản lý proxy" : "Cài đặt / Cấu hình"}
            </button>
          </MagneticButton>
        </div>
        {headroomActionError && (
          <p className="text-xs text-rose-600 dark:text-rose-400">
            {headroomActionError}
          </p>
        )}
      </div>
    );

    const renderCardHeader = () => (
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
            <div className="mt-1 flex items-center gap-1.5 flex-wrap">
              <SavingsBadge
                label={meta.savingsLabel}
                active={isActive}
                emerald={isEmerald}
              />
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
    );

    if (isHorizontalHeadroom) {
      return (
        <HudFrame
          key={moduleId}
          chamfer="sm"
          accent={accent}
          padding="md"
          borderBeam={true}
          data-cursor-target="true"
          className={activeGlowClass}
        >
          <div className="flex flex-col gap-3">
            {renderCardHeader()}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-3.5 items-center">
              <div className="lg:col-span-5 space-y-2.5">
                <p className="text-xs sm:text-[13px] text-text-muted leading-relaxed">
                  {meta.description}
                </p>
                {renderHeadroomControls()}
              </div>
              <div className="lg:col-span-7">
                {renderHeadroomExtras()}
              </div>
            </div>
          </div>
        </HudFrame>
      );
    }

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
        className={`h-full ${activeGlowClass}`}
      >
        <div className="flex h-full flex-col justify-between gap-3.5">
          <div className="space-y-2.5">
            {renderCardHeader()}
            <p className="text-xs sm:text-[13px] text-text-muted leading-relaxed">
              {meta.description}
            </p>
          </div>

          {moduleId === "rtk" && (
            <div className="pt-2.5 border-t border-cyan-500/12 space-y-1.5">
              <div className="font-mono text-[10px] font-bold uppercase tracking-wider text-text-muted">
                Bộ lọc đang bật (20)
              </div>
              <div className="flex flex-wrap items-center gap-1.5 font-mono text-[11px] text-text-muted">
                {["Git", "Pytest / Cargo / Go", "TS / Mypy / Ruff", "Logs"].map((tag) => (
                  <span
                    key={tag}
                    className="rounded border border-cyan-500/20 bg-cyan-500/[0.06] px-2 py-0.5 text-cyan-700 dark:text-cyan-300"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          )}

          {moduleId === "toon" && (
            <div className="pt-2.5 border-t border-cyan-500/12 space-y-1.5">
              <div className="font-mono text-[10px] font-bold uppercase tracking-wider text-text-muted">
                Cơ chế nén bảng TOON
              </div>
              <div className="flex flex-wrap items-center gap-1.5 font-mono text-[11px] text-text-muted">
                {["Mảng JSON ≥ 3 phần tử", "≥ 400 ký tự", "Fail-open an toàn"].map((tag) => (
                  <span
                    key={tag}
                    className="rounded border border-cyan-500/20 bg-cyan-500/[0.06] px-2 py-0.5 text-cyan-700 dark:text-cyan-300"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          )}

          {moduleId === "toolDedup" && (
            <div className="pt-2.5 border-t border-cyan-500/12">
              <div className="mb-1.5 font-mono text-[10px] font-bold uppercase tracking-wider text-text-muted">
                Chế độ khử trùng lặp
              </div>
              <LevelSelectorPills
                levels={TOOL_DEDUP_MODES}
                value={toolDedupMode}
                onChange={handleToolDedupMode}
                compact={!isActive}
              />
            </div>
          )}

          {moduleId === "headroom" && (
            <div className="pt-2.5 border-t border-cyan-500/12 space-y-2">
              {renderHeadroomControls()}
              {renderHeadroomExtras()}
            </div>
          )}

          {moduleId === "caveman" && (
            <div className="pt-2.5 border-t border-cyan-500/12">
              <div className="mb-1.5 font-mono text-[10px] font-bold uppercase tracking-wider text-text-muted">
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
            <div className="pt-2.5 border-t border-cyan-500/12">
              <div className="mb-1.5 font-mono text-[10px] font-bold uppercase tracking-wider text-text-muted">
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
            <div className="space-y-1.5 pt-2.5 border-t border-cyan-500/12">
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
      </HudFrame>
    );
  };

  const hasActiveHeadroom = activeModules.includes("headroom");
  const hasActiveCustomPrompt = activeModules.includes("customPrompt");
  const activeCompactModules = activeModules.filter(
    (id) => id !== "headroom" && id !== "customPrompt"
  );
  const compactGridClass =
    activeCompactModules.length === 1
      ? "grid grid-cols-1 gap-3.5"
      : activeCompactModules.length === 2
        ? "grid grid-cols-1 md:grid-cols-2 gap-3.5"
        : "grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3.5";

  const nodeVersionLabel =
    pluginState.env?.nodeVersion ||
    pluginState.env?.node?.version ||
    (typeof pluginState.env?.node === "string" ? pluginState.env.node : null);
  const pythonVersionLabel =
    pluginState.env?.pythonVersion ||
    pluginState.env?.python?.version ||
    (pluginState.env?.pythonAvailable ? "Sẵn sàng" : null);
  const installedPluginIds = new Set(
    pluginState.plugins.filter((p) => p.installed).map((p) => p.id)
  );
  const isPluginActionRunning = pluginActionBusy || pluginState.installing;

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
                  {MODULE_ORDER.length} MÔ-ĐUN ANTIGRAVITY
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
                <NumberTicker value={armedAgSaversCount} /> / {MODULE_ORDER.length}
              </div>
            </div>

            <div className="rounded-lg border border-black/10 dark:border-white/10 bg-white/55 dark:bg-[#070D1B]/75 px-3 py-1.5">
              <div className="text-[9.5px] uppercase tracking-wider text-text-muted">
                Headroom Proxy
              </div>
              <div className="flex items-center gap-1.5 text-xs font-bold">
                <span
                  className={`size-1.5 rounded-full shrink-0 ${
                    headroomStatus.loading || headroomStarting
                      ? "bg-cyan-500 animate-pulse"
                      : headroomRunning
                        ? `bg-emerald-500 ${motionPaused ? "" : "animate-pulse"}`
                        : "bg-amber-500"
                  }`}
                />
                <span
                  className={
                    headroomStatus.loading || headroomStarting
                      ? "text-cyan-600 dark:text-cyan-400"
                      : headroomRunning
                        ? "text-emerald-600 dark:text-emerald-400"
                        : "text-amber-600 dark:text-amber-400"
                  }
                >
                  {headroomStatus.loading
                    ? "ĐANG KIỂM TRA…"
                    : headroomStarting
                      ? "ĐANG KHỞI ĐỘNG…"
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

      {/* 3 Smart Presets Strip */}
      <section aria-label="Cấu hình mẫu thông minh" className="space-y-2">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <span className="font-mono text-[11px] font-bold uppercase tracking-wider text-text-muted">
              Cấu hình nhanh (Smart Presets)
            </span>
            {tokenSaverPreset === "custom" && (
              <span className="rounded border border-amber-500/40 bg-amber-500/12 px-2 py-0.5 font-mono text-[10px] font-bold uppercase text-amber-700 dark:text-amber-300">
                Tùy chỉnh
              </span>
            )}
          </div>
          <span className="text-xs text-text-muted">
            Áp dụng đồng bộ cho RTK, TOON, Tool Dedup, Caveman &amp; Ponytail
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {SMART_PRESETS.map((preset) => {
            const active = tokenSaverPreset === preset.id;
            return (
              <button
                key={preset.id}
                type="button"
                data-cursor-target="true"
                onClick={() => handleApplyPreset(preset)}
                className={`text-left rounded-xl border p-3 transition-all cursor-pointer ${
                  active
                    ? "border-cyan-500/60 bg-cyan-500/10 shadow-[0_0_18px_rgba(6,182,212,0.16)]"
                    : "border-border bg-surface-2/60 hover:border-cyan-500/35 hover:bg-surface-2"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className={`material-symbols-outlined text-[18px] ${
                        active ? "text-cyan-600 dark:text-cyan-300" : "text-text-muted"
                      }`}
                    >
                      {preset.icon}
                    </span>
                    <span className="text-xs sm:text-sm font-bold text-text-main truncate">
                      {preset.label}
                    </span>
                  </div>
                  <span
                    className={`shrink-0 rounded border px-1.5 py-0.5 font-mono text-[9.5px] font-bold uppercase ${
                      active
                        ? "border-emerald-500/45 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                        : "border-border bg-surface text-text-muted"
                    }`}
                  >
                    {active ? "Đang chọn" : preset.badge}
                  </span>
                </div>
                <p className="mt-1.5 text-[11.5px] text-text-muted leading-snug">
                  {preset.desc}
                </p>
              </button>
            );
          })}
        </div>
      </section>

      {/* Live Token Compression Pipeline Circuit */}
      <TokenSaverFlowCircuit
        rtkEnabled={rtkEnabled}
        onToggleRtk={handleRtkEnabled}
        toonEnabled={toonEnabled}
        onToggleToon={handleToonEnabled}
        toolDedupEnabled={toolDedupEnabled}
        toolDedupMode={toolDedupMode}
        onToggleToolDedup={handleToolDedupEnabled}
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
              {armedAgSaversCount} / {MODULE_ORDER.length} mô-đun
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
          <div className="space-y-3.5">
            {hasActiveHeadroom && renderModuleCard("headroom", true)}
            {activeCompactModules.length > 0 && (
              <div className={compactGridClass}>
                {activeCompactModules.map((id) => renderModuleCard(id, true))}
              </div>
            )}
            {hasActiveCustomPrompt && renderModuleCard("customPrompt", true)}
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

      {/* ZONE 3: Antigravity Plugin Center (Layer-2 1-Click Auto-Setup) */}
      <section
        id="antigravity-plugins"
        aria-labelledby="antigravity-plugins-heading"
        className="space-y-3 scroll-mt-6"
      >
        <HudFrame chamfer="md" accent="cyan" padding="md">
          <div className="flex flex-col gap-4">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-3 border-b border-cyan-500/15">
              <div className="space-y-1.5 min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="size-2 rounded-full bg-cyan-500" />
                  <h2
                    id="antigravity-plugins-heading"
                    className="text-sm sm:text-base font-bold uppercase tracking-wider font-mono text-text-main"
                  >
                    TRUNG TÂM PLUGIN ANTIGRAVITY (1-CLICK AUTO-SETUP)
                  </h2>
                </div>
                <p className="text-xs text-text-muted leading-relaxed">
                  Tự động nhận diện môi trường, cài đặt các plugin &amp; MCP tiết kiệm token cho Antigravity IDE và tự động xử lý xung đột giữa các gói.
                </p>

                {/* Runtime & Smart Pack recommendation badges */}
                <div className="flex flex-wrap items-center gap-1.5 pt-1 font-mono text-[10.5px]">
                  <span className="inline-flex items-center gap-1 rounded border border-cyan-500/30 bg-cyan-500/10 px-2 py-0.5 font-semibold text-cyan-700 dark:text-cyan-300">
                    <span className="material-symbols-outlined text-[13px]">memory</span>
                    {nodeVersionLabel ? `Node v${String(nodeVersionLabel).replace(/^v/i, "")}` : "Đang dò Node…"}
                  </span>
                  <span
                    className={`inline-flex items-center gap-1 rounded border px-2 py-0.5 font-semibold ${
                      pythonVersionLabel
                        ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                        : "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300"
                    }`}
                  >
                    <span className="material-symbols-outlined text-[13px]">code</span>
                    {pythonVersionLabel
                      ? `Python ${String(pythonVersionLabel).replace(/^Python\s+/i, "")}`
                      : "Không có Python"}
                  </span>
                  {pluginState.smartPackIds.length > 0 && (
                    <span className="inline-flex items-center gap-1 rounded border border-emerald-500/35 bg-emerald-500/12 px-2 py-0.5 font-bold text-emerald-700 dark:text-emerald-300">
                      Smart Pack: {pluginState.smartPackIds.join(" + ")}
                    </span>
                  )}
                  {pluginState.smartPackNote && (
                    <span className="text-[11px] font-sans text-text-muted">
                      {pluginState.smartPackNote}
                    </span>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <MagneticButton data-cursor-target="true">
                  <Button
                    variant="primary"
                    size="sm"
                    loading={isPluginActionRunning}
                    onClick={() => handlePluginAction("install-smart-pack")}
                    data-cursor-target="true"
                  >
                    ⚡ Cài trọn gói thông minh (1-Click)
                  </Button>
                </MagneticButton>
                <Button
                  variant="outline"
                  size="sm"
                  icon="health_and_safety"
                  disabled={isPluginActionRunning}
                  onClick={() => handlePluginAction("doctor")}
                  data-cursor-target="true"
                >
                  Kiểm tra sức khỏe (Doctor)
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  icon="refresh"
                  disabled={pluginState.loading || isPluginActionRunning}
                  onClick={() => {
                    playHudSound("click");
                    refreshAntigravityPlugins();
                  }}
                  title="Làm mới trạng thái plugin"
                />
              </div>
            </div>

            {pluginFeedback && (
              <div
                className={`rounded-lg border px-3 py-2 text-xs font-mono ${
                  pluginFeedback.ok
                    ? "border-emerald-500/35 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                    : "border-rose-500/35 bg-rose-500/10 text-rose-700 dark:text-rose-300"
                }`}
              >
                <div className="font-bold">{pluginFeedback.message}</div>
                {Array.isArray(pluginFeedback.results) && pluginFeedback.results.length > 0 && (
                  <div className="mt-1 flex flex-wrap gap-2 text-[11px]">
                    {pluginFeedback.results.map((r, idx) => (
                      <span
                        key={`${r.pluginId || r.id || idx}`}
                        className="rounded border border-current/25 px-1.5 py-0.5"
                      >
                        {r.pluginId || r.id || "item"}: {r.ok === false ? `Lỗi (${r.error || "failed"})` : r.status || "OK"}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Plugin Cards */}
            {pluginState.loading && pluginState.plugins.length === 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
                {[1, 2, 3].map((idx) => (
                  <div
                    key={idx}
                    className="h-36 rounded-xl border border-border bg-surface-2/60 animate-pulse"
                  />
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
                {pluginState.plugins.map((plugin) => {
                  const isSmart = pluginState.smartPackIds.includes(plugin.id) || Boolean(plugin.recommended);
                  const activeConflicts = Array.isArray(plugin.activeConflicts)
                    ? plugin.activeConflicts
                    : (plugin.conflictsWith || []).filter(
                        (cid) => installedPluginIds.has(cid) && cid !== plugin.id
                      );
                  const isCurrentBusy =
                    isPluginActionRunning && pluginState.currentPluginId === plugin.id;
                  const missingPython = Boolean(plugin.requiresPython && !pythonVersionLabel);
                  const incompatible = plugin.supported === false || missingPython;
                  const desc =
                    plugin.summary ||
                    plugin.description ||
                    PLUGIN_FALLBACK_DESC[plugin.id] ||
                    "Plugin tối ưu ngữ cảnh & token cho Antigravity.";

                  return (
                    <div
                      key={plugin.id}
                      className={`flex flex-col justify-between gap-3 rounded-xl border p-3.5 transition-all ${
                        plugin.installed
                          ? "border-emerald-500/40 bg-emerald-500/[0.05]"
                          : isSmart
                            ? "border-cyan-500/35 bg-cyan-500/[0.04]"
                            : "border-border bg-surface-2/50"
                      }`}
                    >
                      <div className="space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <h3 className="font-mono text-xs sm:text-sm font-bold text-text-main truncate">
                                {plugin.name || plugin.id}
                              </h3>
                              {plugin.installed && (
                                <span className="rounded border border-emerald-500/40 bg-emerald-500/15 px-1.5 py-0.5 font-mono text-[9.5px] font-bold uppercase text-emerald-700 dark:text-emerald-300">
                                  Đã cài
                                </span>
                              )}
                              {isSmart && !plugin.installed && (
                                <span className="rounded border border-cyan-500/40 bg-cyan-500/12 px-1.5 py-0.5 font-mono text-[9.5px] font-bold uppercase text-cyan-700 dark:text-cyan-300">
                                  Smart Pack
                                </span>
                              )}
                            </div>
                            {plugin.repo && (
                              <p className="font-mono text-[10px] text-text-subtle truncate">
                                {plugin.repo}
                              </p>
                            )}
                          </div>

                          {plugin.slot && (
                            <span className="shrink-0 rounded border border-border bg-surface px-1.5 py-0.5 font-mono text-[9.5px] uppercase text-text-muted">
                              {plugin.slot}
                            </span>
                          )}
                        </div>

                        <p className="text-xs text-text-muted leading-snug">
                          {desc}
                        </p>

                        <div className="flex flex-wrap items-center gap-1.5 font-mono text-[10px] text-text-muted">
                          {typeof plugin.stars === "number" && (
                            <span className="rounded border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-amber-700 dark:text-amber-300">
                              ★ {plugin.stars.toLocaleString()}
                            </span>
                          )}
                          {plugin.license && (
                            <span className="rounded border border-border bg-surface px-1.5 py-0.5">
                              {plugin.license}
                            </span>
                          )}
                          {plugin.version && (
                            <span className="rounded border border-border bg-surface px-1.5 py-0.5">
                              v{String(plugin.version).replace(/^v/i, "")}
                            </span>
                          )}
                        </div>

                        {activeConflicts.length > 0 && !plugin.installed && (
                          <div className="rounded-md border border-amber-500/35 bg-amber-500/10 px-2 py-1 text-[11px] text-amber-700 dark:text-amber-300">
                            Xung đột với: <strong>{activeConflicts.join(", ")}</strong> (sẽ tự gỡ khi cài)
                          </div>
                        )}

                        {incompatible && (
                          <div className="rounded-md border border-rose-500/30 bg-rose-500/10 px-2 py-1 text-[11px] text-rose-700 dark:text-rose-300">
                            {missingPython
                              ? "Yêu cầu Python để cài đặt"
                              : plugin.unsupportedReason ||
                                plugin.reason ||
                                "Không tương thích phiên bản Node hiện tại"}
                          </div>
                        )}
                      </div>

                      <div className="flex items-center justify-end pt-2 border-t border-border-subtle">
                        <Button
                          size="xs"
                          variant={plugin.installed ? "danger" : isSmart ? "primary" : "outline"}
                          loading={isCurrentBusy}
                          disabled={isPluginActionRunning || (!plugin.installed && incompatible)}
                          onClick={() =>
                            handlePluginAction(
                              plugin.installed ? "uninstall" : "install",
                              plugin.id
                            )
                          }
                          data-cursor-target="true"
                        >
                          {plugin.installed ? "Gỡ cài đặt" : "Cài đặt"}
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Collapsible live logTail viewer */}
            <div className="pt-1">
              <button
                type="button"
                onClick={() => {
                  playHudSound("click");
                  setShowPluginLog((v) => !v);
                }}
                className="inline-flex items-center gap-1.5 font-mono text-[11px] font-semibold text-cyan-700 dark:text-cyan-300 hover:underline cursor-pointer"
              >
                <span className="material-symbols-outlined text-[15px]">
                  {showPluginLog ? "expand_less" : "terminal"}
                </span>
                <span>
                  {showPluginLog ? "Ẩn nhật ký cài đặt (logTail)" : "Xem nhật ký cài đặt (logTail)"}
                </span>
              </button>

              {showPluginLog && (
                <div className="mt-2 overflow-hidden rounded-lg border border-cyan-500/30 bg-[#050A15] shadow-inner">
                  <div className="flex items-center justify-between border-b border-cyan-500/20 bg-[#0A1326] px-3 py-1 font-mono text-[10px] text-cyan-300">
                    <span className="flex items-center gap-1.5 font-bold uppercase tracking-wider">
                      <span
                        className={`size-1.5 rounded-full ${
                          isPluginActionRunning ? "bg-emerald-400 animate-pulse" : "bg-cyan-400"
                        }`}
                      />
                      ANTIGRAVITY PLUGINS // INSTALL LOG
                    </span>
                    <span className="text-cyan-400/70">
                      {isPluginActionRunning ? "ĐANG CHẠY…" : "LOG TAIL"}
                    </span>
                  </div>
                  <pre className="max-h-48 overflow-auto p-2.5 font-mono text-[10.5px] leading-relaxed text-cyan-100/90 whitespace-pre-wrap">
                    {pluginState.logTail || "Chưa có nhật ký cài đặt nào."}
                  </pre>
                </div>
              )}
            </div>
          </div>
        </HudFrame>
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
                headroomRunning
                  ? "text-emerald-600 dark:text-emerald-400"
                  : headroomStarting
                    ? "text-cyan-600 dark:text-cyan-400"
                    : "text-amber-600 dark:text-amber-400"
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
          <div className="flex flex-col gap-1">
            <p className="text-sm font-medium">Tỉ lệ giữ lại Kompress (--target-ratio)</p>
            <Input
              value={headroomTargetRatio}
              onChange={(e) => setHeadroomTargetRatio(e.target.value)}
              onBlur={handleHeadroomTargetRatioBlur}
              placeholder="Tự động (hoặc 0.4 = giữ ~40%)"
              className="font-mono text-sm"
            />
            <p className="text-xs text-text-muted">
              Giá trị từ 0.1 đến 0.95 (càng nhỏ nén càng mạnh); để trống để Headroom tự quyết định. Beacon telemetry mặc định đã tắt.
            </p>
          </div>
          {headroomStatus.loading ? (
            <p className="text-sm text-cyan-600 dark:text-cyan-400">
              Đang kiểm tra môi trường Python &amp; Headroom…
            </p>
          ) : headroomRunning && headroomManaged ? (
            <Button
              onClick={handleHeadroomStop}
              variant="ghost"
              fullWidth
              disabled={headroomActionLoading}
            >
              {headroomActionLoading ? "Đang dừng…" : "Dừng Headroom"}
            </Button>
          ) : headroomStarting ? (
            <div className="space-y-2">
              <p className="text-sm text-cyan-600 dark:text-cyan-400">
                Proxy đang nạp mô hình và mở cổng {headroomPortLabel}…
              </p>
              <Button
                onClick={handleHeadroomStop}
                variant="danger"
                fullWidth
                disabled={headroomActionLoading}
              >
                {headroomActionLoading ? "Đang hủy…" : "Hủy khởi động"}
              </Button>
            </div>
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
              onClick={() => refreshHeadroomStatus({ force: true })}
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
