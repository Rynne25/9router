"use client";

import { memo, useState, useEffect, useCallback, useMemo } from "react";
import { Button, Input, ModelSelectModal } from "@/shared/components";
import { HudFrame, MagneticButton } from "@/shared/components/hud";
import { playHudSound } from "@/shared/utils/hudAudio";
import { TOOL_HOSTS } from "@/shared/constants/mitmToolHosts";
import { getCachedData, setCachedData, fetchWithCache, fetchJson } from "@/shared/utils/swrCache";
import Image from "next/image";

/**
 * Per-tool MITM card — shows DNS status + model mappings in Tactical Orbital HUD layout.
 * - Auto-saves model mapping on blur, modal select, or batch action
 * - Allows editing and saving model mappings anytime (even when DNS or Server is off)
 * - Direct DNS toggle in card header for 1-click access
 */
function MitmToolCard({
  tool,
  isExpanded,
  onToggle,
  serverRunning,
  dnsActive,
  hasCachedPassword,
  needsSudoPassword,
  isWin,
  activeProviders,
  hasActiveProviders,
  modelAliases = {},
  combos = [],
  onDnsChange,
}) {
  const [loading, setLoading] = useState(false);
  const [warning, setWarning] = useState(null);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [sudoPassword, setSudoPassword] = useState("");
  const [pendingDnsAction, setPendingDnsAction] = useState(null);
  const [modalError, setModalError] = useState(null);
  const aliasCacheKey = `/api/cli-tools/antigravity-mitm/alias?tool=${tool.id}`;
  const [modelMappings, setModelMappings] = useState(() => getCachedData(aliasCacheKey)?.aliases || {});
  const [modalOpen, setModalOpen] = useState(false);
  const [currentEditingAlias, setCurrentEditingAlias] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [copiedHosts, setCopiedHosts] = useState(false);
  const [savedNotice, setSavedNotice] = useState(false);

  const isAntigravity = tool.id === "antigravity";
  const mitmHosts = TOOL_HOSTS[tool.id] ?? [];
  const canRunWithoutPassword = isWin || hasCachedPassword || needsSudoPassword === false;
  const defaultModels = useMemo(() => tool.defaultModels || [], [tool.defaultModels]);

  const saveMappings = useCallback(async (mappings) => {
    setCachedData(aliasCacheKey, { aliases: mappings });
    try {
      const res = await fetch("/api/cli-tools/antigravity-mitm/alias", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tool: tool.id, mappings }),
      });
      if (res.ok) {
        setSavedNotice(true);
        playHudSound("confirm");
        setTimeout(() => setSavedNotice(false), 1800);
      }
    } catch { /* ignore */ }
  }, [tool.id, aliasCacheKey]);

  useEffect(() => {
    let cancelled = false;
    fetchWithCache(aliasCacheKey, () => fetchJson(aliasCacheKey), { ttlMs: 30000 })
      .then((data) => {
        if (!cancelled && data?.aliases && typeof data.aliases === "object") {
          const loaded = { ...data.aliases };
          // Auto-backfill newly added Antigravity models (e.g. gemini-pro-orchestrator-g1-pro)
          // when the user already has their Antigravity models mapped
          if (tool.id === "antigravity" && Object.keys(loaded).length >= 20) {
            const values = Object.values(loaded).filter(Boolean);
            const allSameCombo =
              values.length > 0 &&
              values.every((v) => v === values[0] && !v.startsWith("ag/"));
            let backfilled = false;
            defaultModels.forEach((m) => {
              if (!loaded[m.alias]) {
                loaded[m.alias] = allSameCombo ? values[0] : `ag/${m.alias}`;
                backfilled = true;
              }
            });
            if (backfilled) {
              saveMappings(loaded);
            }
          }
          setModelMappings(loaded);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [aliasCacheKey, tool.id, defaultModels, saveMappings]);

  const handleMappingBlur = (alias, value) => {
    saveMappings({ ...modelMappings, [alias]: value });
  };

  const handleModelMappingChange = (alias, value) => {
    setModelMappings((prev) => ({ ...prev, [alias]: value }));
  };

  const assignSingleAlias = (alias, targetValue) => {
    const updated = { ...modelMappings, [alias]: targetValue };
    setModelMappings(updated);
    saveMappings(updated);
  };

  const openModelSelector = (alias) => {
    playHudSound("click");
    setCurrentEditingAlias(alias);
    setModalOpen(true);
  };

  const handleModelSelect = (model) => {
    if (!currentEditingAlias || model.isPlaceholder) return;
    const updated = { ...modelMappings, [currentEditingAlias]: model.value };
    setModelMappings(updated);
    saveMappings(updated);
  };

  const doDnsAction = async (action, password) => {
    setLoading(true);
    setWarning(null);
    try {
      const res = await fetch("/api/cli-tools/antigravity-mitm", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tool: tool.id, action, sudoPassword: password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Không thể bật/tắt DNS");

      // Smart Passthrough active: no application restart required
      playHudSound("toggle");
      setShowPasswordModal(false);
      setSudoPassword("");
      onDnsChange?.(data);
    } catch (err) {
      playHudSound("alert");
      if (showPasswordModal) {
        setModalError(err.message || "Không thể bật/tắt DNS");
      } else {
        setWarning(err.message || "Không thể bật/tắt DNS");
      }
    } finally {
      setLoading(false);
      setPendingDnsAction(null);
    }
  };

  const handleDnsToggle = (e) => {
    if (e) e.stopPropagation();
    if (!serverRunning) return;
    playHudSound("click");
    const action = dnsActive ? "disable" : "enable";
    if (canRunWithoutPassword) {
      doDnsAction(action, "");
    } else {
      setPendingDnsAction(action);
      setShowPasswordModal(true);
      setModalError(null);
    }
  };

  const handleConfirmPassword = () => {
    if (!sudoPassword.trim()) {
      setModalError("Vui lòng nhập mật khẩu sudo");
      return;
    }
    doDnsAction(pendingDnsAction, sudoPassword);
  };

  const handleCopyHosts = () => {
    if (!mitmHosts.length || typeof navigator === "undefined") return;
    const text = mitmHosts.map((h) => `127.0.0.1 ${h}`).join("\n");
    navigator.clipboard?.writeText(text);
    playHudSound("confirm");
    setCopiedHosts(true);
    setTimeout(() => setCopiedHosts(false), 2000);
  };

  const getDefaultTargetForAlias = (alias) => {
    if (tool.id === "antigravity") {
      return `ag/${alias}`;
    }
    if (tool.id === "kiro") {
      if (alias === "auto" || alias === "simple-task") return "kiro/claude-sonnet-4";
      return `kiro/${alias}`;
    }
    return `ag/${alias}`;
  };

  const fillModelsDefault = (modelsList = defaultModels) => {
    const next = { ...modelMappings };
    modelsList.forEach((m) => {
      next[m.alias] = getDefaultTargetForAlias(m.alias);
    });
    setModelMappings(next);
    saveMappings(next);
  };

  const assignModelsToTarget = (targetValue, modelsList = defaultModels) => {
    if (!targetValue) return;
    const next = { ...modelMappings };
    modelsList.forEach((m) => {
      next[m.alias] = targetValue;
    });
    setModelMappings(next);
    saveMappings(next);
  };

  const clearModelsMappings = (modelsList = defaultModels) => {
    const next = { ...modelMappings };
    modelsList.forEach((m) => {
      next[m.alias] = "";
    });
    setModelMappings(next);
    saveMappings(next);
  };

  const totalModelsCount = defaultModels.length;
  const totalMappedCount = defaultModels.filter((m) => (modelMappings[m.alias] || "").trim()).length;

  const filteredModels = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return defaultModels;
    return defaultModels.filter((m) => {
      const target = (modelMappings[m.alias] || "").toLowerCase();
      return (
        m.name.toLowerCase().includes(q) ||
        m.alias.toLowerCase().includes(q) ||
        target.includes(q)
      );
    });
  }, [defaultModels, modelMappings, searchQuery]);

  const modelGroups = useMemo(() => {
    if (tool.id === "antigravity") {
      const g1Pro = filteredModels.filter(
        (m) => m.alias.includes("orchestrator") || m.alias.startsWith("gemini-pro")
      );
      const g4 = filteredModels.filter((m) => m.alias.startsWith("gemini-4"));
      const g3 = filteredModels.filter((m) => m.alias.startsWith("gemini-3"));
      const claude = filteredModels.filter((m) => m.alias.startsWith("claude"));
      const used = new Set([...g1Pro, ...g4, ...g3, ...claude].map((m) => m.alias));
      const others = filteredModels.filter((m) => !used.has(m.alias));

      return [
        {
          key: "g1pro",
          label: "Dòng Gemini Pro & Orchestrator (G1 Pro)",
          icon: "hub",
          iconColor: "text-purple-500",
          accentBorder: "border-l-4 border-l-purple-500",
          models: g1Pro,
        },
        {
          key: "g4",
          label: "Dòng Gemini 4 (Argon & Hydrogen)",
          icon: "auto_awesome",
          iconColor: "text-cyan-500",
          accentBorder: "border-l-4 border-l-cyan-500",
          models: g4,
        },
        {
          key: "g3",
          label: "Dòng Gemini 3.x (Flash, Lite & Ảnh)",
          icon: "bolt",
          iconColor: "text-sky-500",
          accentBorder: "border-l-4 border-l-sky-500",
          models: g3,
        },
        {
          key: "cl",
          label: "Dòng Claude (Opus & Sonnet)",
          icon: "psychology",
          iconColor: "text-orange-500",
          accentBorder: "border-l-4 border-l-orange-500",
          models: claude,
        },
        {
          key: "other",
          label: "Dòng Model khác",
          icon: "smart_toy",
          iconColor: "text-primary",
          accentBorder: "border-l-4 border-l-primary",
          models: others,
        },
      ].filter((g) => g.models.length > 0);
    }

    // Uniform grouping for Kiro and other IDE tools
    const agentSlots = filteredModels.filter((m) => m.alias === "auto" || m.alias === "simple-task");
    const claudeSlots = filteredModels.filter((m) => m.alias.startsWith("claude"));
    const used = new Set([...agentSlots, ...claudeSlots].map((m) => m.alias));
    const otherSlots = filteredModels.filter((m) => !used.has(m.alias));

    return [
      {
        key: "kiro-agent",
        label: "Luồng Tác vụ Tự động (Auto & Sub-task)",
        icon: "hub",
        iconColor: "text-purple-500",
        accentBorder: "border-l-4 border-l-purple-500",
        models: agentSlots,
      },
      {
        key: "kiro-claude",
        label: "Dòng Claude (Sonnet & Haiku)",
        icon: "psychology",
        iconColor: "text-orange-500",
        accentBorder: "border-l-4 border-l-orange-500",
        models: claudeSlots,
      },
      {
        key: "kiro-other",
        label: "Dòng GPT, DeepSeek & MiniMax",
        icon: "bolt",
        iconColor: "text-sky-500",
        accentBorder: "border-l-4 border-l-sky-500",
        models: otherSlots,
      },
    ].filter((g) => g.models.length > 0);
  }, [filteredModels, tool.id]);

  const getMitmModelTheme = (alias) => {
    if (alias.includes("orchestrator") || alias.includes("g1-pro") || alias === "auto") {
      return {
        border: "border-purple-500/30 hover:border-purple-500/60",
        bg: "bg-purple-500/[0.04] hover:bg-purple-500/[0.08]",
        icon: "hub",
        iconColor: "text-purple-500",
      };
    }
    if (alias.startsWith("gemini-4")) {
      return {
        border: "border-cyan-500/30 hover:border-cyan-500/60",
        bg: "bg-cyan-500/[0.04] hover:bg-cyan-500/[0.08]",
        icon: "auto_awesome",
        iconColor: "text-cyan-500",
      };
    }
    if (alias.startsWith("gemini-3")) {
      return {
        border: "border-sky-500/30 hover:border-sky-500/60",
        bg: "bg-sky-500/[0.04] hover:bg-sky-500/[0.08]",
        icon: "bolt",
        iconColor: "text-sky-500",
      };
    }
    if (alias.startsWith("claude")) {
      return {
        border: "border-orange-500/30 hover:border-orange-500/60",
        bg: "bg-orange-500/[0.04] hover:bg-orange-500/[0.08]",
        icon: "psychology",
        iconColor: "text-orange-500",
      };
    }
    return {
      border: "border-black/10 dark:border-white/10 hover:border-cyan-500/50",
      bg: "bg-white/40 dark:bg-white/[0.02] hover:bg-white/60 dark:hover:bg-white/[0.04]",
      icon: "smart_toy",
      iconColor: "text-primary",
    };
  };

  const getModelDisplayInfo = (model) => {
    const alias = (model.alias || "").toLowerCase();
    const name = model.name || model.alias || "";

    // 1. Prominent reasoning / thinking level badge
    let badge = null;
    let badgeStyle = "";

    if (alias.includes("xhigh") || alias.includes("x-high") || name.toLowerCase().includes("x-high")) {
      badge = "X-High";
      badgeStyle = "bg-rose-500/20 text-rose-600 dark:text-rose-300 border-rose-500/40 ring-1 ring-rose-500/30";
    } else if (alias.includes("high") || name.toLowerCase().includes("(high)")) {
      badge = "High";
      badgeStyle = "bg-purple-500/20 text-purple-600 dark:text-purple-300 border-purple-500/40 ring-1 ring-purple-500/30";
    } else if (alias.includes("medium") || name.toLowerCase().includes("(medium)")) {
      badge = "Medium";
      badgeStyle = "bg-sky-500/20 text-sky-600 dark:text-sky-300 border-sky-500/40 ring-1 ring-sky-500/30";
    } else if (alias.includes("tiered") || name.toLowerCase().includes("(tiered)")) {
      badge = "Tiered";
      badgeStyle = "bg-amber-500/20 text-amber-600 dark:text-amber-300 border-amber-500/40 ring-1 ring-amber-500/30";
    } else if (alias.includes("low") || name.toLowerCase().includes("(low)")) {
      badge = "Low";
      badgeStyle = "bg-emerald-500/20 text-emerald-600 dark:text-emerald-300 border-emerald-500/40 ring-1 ring-emerald-500/30";
    } else if (alias.includes("thinking") || name.toLowerCase().includes("thinking")) {
      badge = "Thinking";
      badgeStyle = "bg-violet-500/20 text-violet-600 dark:text-violet-300 border-violet-500/40 ring-1 ring-violet-500/30";
    } else if (alias.includes("image") || name.toLowerCase().includes("image")) {
      badge = "Image";
      badgeStyle = "bg-pink-500/20 text-pink-600 dark:text-pink-300 border-pink-500/40";
    } else if (alias.includes("lite") || name.toLowerCase().includes("lite")) {
      badge = "Lite";
      badgeStyle = "bg-teal-500/20 text-teal-600 dark:text-teal-300 border-teal-500/40";
    } else if (alias.includes("orchestrator") || alias.includes("g1-pro")) {
      badge = "G1 Pro";
      badgeStyle = "bg-purple-600/25 text-purple-600 dark:text-purple-200 border-purple-500/50 font-black";
    }

    // 2. Short concise display name
    let shortName = name;
    if (alias.includes("argon")) {
      shortName = "Argon";
    } else if (alias.includes("hydrogen")) {
      shortName = "Hydrogen";
    } else if (alias.includes("orchestrator") || alias.includes("g1-pro")) {
      shortName = "Orchestrator";
    } else if (alias.startsWith("gemini-3.8")) {
      shortName = "Flash 3.8";
    } else if (alias.startsWith("gemini-3.5")) {
      shortName = "Flash 3.5";
    } else if (alias.startsWith("gemini-3.1")) {
      shortName = "Flash 3.1";
    } else if (alias.startsWith("claude-opus-5-5")) {
      shortName = "Opus 5.5";
    } else if (alias.startsWith("claude-sonnet-5-5")) {
      shortName = "Sonnet 5.5";
    } else if (alias.startsWith("claude-opus-4-6")) {
      shortName = "Opus 4.6";
    } else if (alias.startsWith("claude-sonnet-4-6")) {
      shortName = "Sonnet 4.6";
    } else if (alias.startsWith("claude-sonnet-5")) {
      shortName = "Sonnet 5";
    } else if (alias.startsWith("claude-sonnet-4")) {
      shortName = "Sonnet 4";
    } else if (alias.startsWith("claude-haiku")) {
      shortName = "Haiku";
    } else {
      shortName = name.replace(/\s*\([^)]*\)\s*/g, " ").replace(/\s*\/\s*Default/gi, "").trim();
    }

    return { shortName, badge, badgeStyle };
  };

  const renderModelRow = (model) => {
    const theme = getMitmModelTheme(model.alias);
    const displayInfo = getModelDisplayInfo(model);
    const currentVal = (modelMappings[model.alias] || "").trim();
    const isMapped = Boolean(currentVal);

    return (
      <div
        key={model.alias}
        className={`flex flex-col sm:flex-row sm:items-center justify-between gap-2 rounded-lg border px-2.5 py-2 transition-all ${theme.border} ${theme.bg} ${
          isMapped ? "ring-1 ring-cyan-500/20" : ""
        }`}
      >
        {/* Left: Status Dot + Short Model Name + Level Badge + Monospace Alias ID */}
        <div
          className="flex flex-col gap-0.5 sm:w-[230px] md:w-[255px] shrink-0 min-w-0"
          title={`${model.name} (${model.alias})`}
        >
          <div className="flex items-center gap-1.5 min-w-0">
            <span
              className={`size-1.5 rounded-full shrink-0 ${
                isMapped
                  ? "bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.7)]"
                  : "bg-black/20 dark:bg-white/20"
              }`}
            />
            <span className={`material-symbols-outlined text-[14px] shrink-0 ${theme.iconColor}`}>
              {theme.icon}
            </span>
            <span className="text-[11.5px] font-bold text-text-main truncate">
              {displayInfo.shortName}
            </span>
            {displayInfo.badge && (
              <span
                className={`inline-flex items-center rounded px-1.5 py-0.5 font-mono text-[9px] font-extrabold uppercase tracking-tight leading-none border shrink-0 ${displayInfo.badgeStyle}`}
              >
                {displayInfo.badge}
              </span>
            )}
          </div>
          <code
            className="pl-3 font-mono text-[10px] text-text-muted/80 truncate"
            data-i18n-skip="true"
          >
            {model.alias}
          </code>
        </div>

        {/* Right: Target Input + Target Pill Selectors */}
        <div className="flex items-center gap-1.5 flex-1 min-w-0">
          <div className="relative flex-1 min-w-0">
            <input
              type="text"
              value={modelMappings[model.alias] || ""}
              onChange={(e) => handleModelMappingChange(model.alias, e.target.value)}
              onBlur={(e) => handleMappingBlur(model.alias, e.target.value)}
              placeholder={getDefaultTargetForAlias(model.alias)}
              className="w-full min-w-0 h-7 pl-2.5 pr-6 bg-white/80 dark:bg-[#060C19]/80 rounded-md border border-black/10 dark:border-cyan-500/20 text-[11px] font-mono text-text-main placeholder:text-text-muted/45 focus:outline-none focus:ring-1 focus:ring-cyan-500/50 focus:border-cyan-500 transition-all"
            />
            {modelMappings[model.alias] && (
              <button
                type="button"
                onClick={() => assignSingleAlias(model.alias, "")}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 p-0.5 text-text-muted hover:text-rose-500 rounded transition-colors cursor-pointer"
                title="Xóa ánh xạ này"
              >
                <span className="material-symbols-outlined text-[13px]">close</span>
              </button>
            )}
          </div>

          {combos?.length > 0 && (
            <button
              type="button"
              onClick={() => assignSingleAlias(model.alias, combos[0].name)}
              title={`Gán nhanh vào Combo "${combos[0].name}"`}
              aria-label={`Gán nhanh vào Combo ${combos[0].name}`}
              className={`inline-flex h-7 items-center justify-center gap-1 rounded-full border px-2 text-[10px] font-mono font-bold shrink-0 transition-all cursor-pointer ${
                currentVal === combos[0].name
                  ? "bg-purple-500/25 border-purple-500 text-purple-700 dark:text-purple-300 shadow-2xs ring-1 ring-purple-500/40"
                  : "bg-purple-500/10 border-purple-500/25 text-purple-700 dark:text-purple-300 hover:bg-purple-500/20 hover:border-purple-500/45"
              }`}
            >
              <span className="material-symbols-outlined text-[13px]">layers</span>
              <span className="hidden xl:inline max-w-[68px] truncate">{combos[0].name}</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => openModelSelector(model.alias)}
            disabled={!hasActiveProviders}
            title="Chọn model đích"
            aria-label="Chọn model đích"
            className={`inline-flex h-7 items-center justify-center gap-1 rounded-full border px-2.5 text-[10px] font-mono font-bold shrink-0 transition-all ${
              hasActiveProviders
                ? "bg-primary text-white border-cyan-500/50 hover:bg-primary-hover shadow-2xs cursor-pointer active:scale-95"
                : "opacity-50 cursor-not-allowed border-border text-text-muted bg-surface"
            }`}
          >
            <span className="material-symbols-outlined text-[13px]">ads_click</span>
            <span className="hidden sm:inline">Chọn</span>
          </button>
        </div>
      </div>
    );
  };

  return (
    <>
      <HudFrame
        chamfer="md"
        accent={isAntigravity ? "cyan" : dnsActive ? "emerald" : "cyan"}
        borderBeam={isAntigravity}
        spotlight={true}
        padding="none"
        className={isAntigravity ? "hud-glow-cyan" : ""}
      >
        {/* Tool Header Bar — Orbital Target Strip */}
        <div
          className="px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-2 cursor-pointer select-none hover:bg-cyan-500/[0.04] transition-colors"
          onClick={onToggle}
        >
          <div className="flex min-w-0 items-center gap-2.5">
            <div
              className={`size-8 rounded-lg border flex items-center justify-center shrink-0 ${
                isAntigravity
                  ? "bg-cyan-500/12 border-cyan-500/35"
                  : "bg-white/70 dark:bg-white/[0.06] border-black/[0.08] dark:border-white/[0.1]"
              }`}
            >
              <Image
                src={tool.image}
                alt={tool.name}
                width={20}
                height={20}
                className="size-5 object-contain rounded"
                sizes="20px"
                onError={(e) => { e.target.style.display = "none"; }}
                loading="lazy"
                decoding="async"
              />
            </div>
            <div className="flex flex-wrap items-center gap-1.5 min-w-0">
              <h3 className="font-bold text-xs sm:text-sm text-text-main">{tool.name}</h3>

              {isAntigravity && (
                <span
                  className="inline-flex items-center gap-1 rounded border border-cyan-500/45 bg-cyan-500/15 px-2 py-0.5 font-mono text-[9.5px] font-extrabold uppercase tracking-wider text-cyan-700 dark:text-cyan-300"
                  data-i18n-skip="true"
                >
                  <span className="material-symbols-outlined text-[11px]">my_location</span>
                  <span>ƯU TIÊN CHÍNH</span>
                </span>
              )}

              {!serverRunning ? (
                <span className="inline-flex items-center rounded-full border border-black/10 dark:border-white/10 bg-black/[0.04] dark:bg-white/[0.05] px-2 py-0.5 font-mono text-[10px] font-semibold text-text-muted">
                  SERVER ĐANG TẮT
                </span>
              ) : dnsActive ? (
                <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/35 bg-emerald-500/15 px-2 py-0.5 font-mono text-[10px] font-bold text-emerald-700 dark:text-emerald-300">
                  <span className="size-1.5 rounded-full bg-emerald-500" />
                  <span>Đang định tuyến DNS</span>
                </span>
              ) : (
                <span className="inline-flex items-center rounded-full border border-amber-500/35 bg-amber-500/15 px-2 py-0.5 font-mono text-[10px] font-bold text-amber-700 dark:text-amber-300">
                  DNS đang tắt
                </span>
              )}

              <span
                className={`px-2 py-0.5 rounded-full font-mono text-[10px] font-bold border hud-telemetry-num ${
                  totalMappedCount > 0
                    ? "bg-cyan-500/12 border-cyan-500/30 text-cyan-700 dark:text-cyan-300"
                    : "bg-black/5 dark:bg-white/5 border-transparent text-text-muted"
                }`}
              >
                {totalMappedCount}/{totalModelsCount} đã gán
              </span>

              {tool.mitmDomain && (
                <code
                  className="hidden md:inline text-[10px] font-mono px-1.5 py-0.5 rounded border border-black/[0.06] dark:border-white/[0.08] bg-black/[0.04] dark:bg-white/[0.04] text-text-muted"
                  data-i18n-skip="true"
                >
                  {tool.mitmDomain}
                </code>
              )}

              {savedNotice && (
                <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/35 bg-emerald-500/15 px-2 py-0.5 font-mono text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
                  <span className="material-symbols-outlined text-[12px]">check_circle</span>
                  <span>Đã lưu</span>
                </span>
              )}
            </div>
          </div>

          {/* Right Header Controls: Direct DNS Toggle + Expand Chevron */}
          <div className="flex items-center gap-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
            <MagneticButton strength={!serverRunning || loading ? 0 : 4}>
              <button
                type="button"
                data-cursor-target="true"
                onClick={handleDnsToggle}
                disabled={!serverRunning || loading}
                title={!serverRunning ? "Khởi động MITM Server ở trên trước khi bật DNS" : undefined}
                className={`inline-flex h-7 items-center gap-1 rounded-lg border px-2.5 text-[11px] font-bold transition-all ${
                  !serverRunning
                    ? "opacity-45 cursor-not-allowed border-black/10 dark:border-white/10 text-text-muted bg-black/[0.02] dark:bg-white/[0.02]"
                    : dnsActive
                      ? "border-rose-500/40 bg-rose-500/15 text-rose-700 dark:text-rose-300 hover:bg-rose-500/25 cursor-pointer"
                      : "border-emerald-500/40 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/25 cursor-pointer"
                }`}
              >
                <span className="material-symbols-outlined text-[14px]">
                  {dnsActive ? "link_off" : "add_link"}
                </span>
                <span>{dnsActive ? "Tắt DNS" : "Bật DNS"}</span>
              </button>
            </MagneticButton>

            <button
              type="button"
              data-cursor-target="true"
              onClick={onToggle}
              aria-label="Thu gọn hoặc mở rộng chi tiết công cụ"
              className="flex size-7 items-center justify-center rounded-lg border border-cyan-500/20 bg-white/50 dark:bg-white/[0.04] text-text-muted hover:text-text-main hover:border-cyan-500/40 transition-colors cursor-pointer"
            >
              <span className={`material-symbols-outlined text-[17px] transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`}>
                expand_more
              </span>
            </button>
          </div>
        </div>

        {isExpanded && (
          <div className="px-3.5 pb-3.5 pt-2.5 border-t border-cyan-500/15 flex flex-col gap-2.5">
            {/* Warning after toggling DNS */}
            {warning && (
              <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/25 text-[11px] text-amber-700 dark:text-amber-300">
                <span className="material-symbols-outlined text-[14px]">info</span>
                <span>{warning}</span>
              </div>
            )}

            {/* Tactical Batch Assign & Search Toolbar */}
            <div className="rounded-xl border border-cyan-500/25 bg-white/60 dark:bg-[#070D1B]/75 backdrop-blur-md px-3 py-2 flex flex-wrap items-center justify-between gap-2 shadow-2xs">
              {/* Search Filter */}
              <div className="relative flex-1 min-w-[180px] max-w-sm">
                <span className="material-symbols-outlined text-[14px] text-cyan-600 dark:text-cyan-400 absolute left-2 top-1/2 -translate-y-1/2 pointer-events-none">
                  search
                </span>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={`Tìm nhanh trong ${totalModelsCount} model...`}
                  className="w-full h-7 pl-7 pr-6 rounded-lg border border-black/10 dark:border-cyan-500/25 bg-white/85 dark:bg-black/40 text-[11px] font-mono text-text-main placeholder:text-text-muted/60 focus:outline-none focus:ring-1 focus:ring-cyan-500/45 focus:border-cyan-500 transition-all"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery("")}
                    aria-label="Xóa từ khóa tìm kiếm"
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-main cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-[13px]">close</span>
                  </button>
                )}
              </div>

              {/* Batch Action Buttons */}
              <div className="flex flex-wrap items-center gap-1.5">
                {combos?.map((combo) => (
                  <button
                    key={combo.id || combo.name}
                    type="button"
                    data-cursor-target="true"
                    onClick={() => assignModelsToTarget(combo.name, filteredModels)}
                    title={`Gán toàn bộ model đang hiển thị vào Combo "${combo.name}"`}
                    className="inline-flex h-7 items-center gap-1 rounded-lg border border-purple-500/35 bg-purple-500/15 px-2.5 text-[11px] font-bold text-purple-700 dark:text-purple-300 hover:bg-purple-500/25 transition-all cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-[13px]">layers</span>
                    <span>Gán tất cả ➔ {combo.name}</span>
                  </button>
                ))}

                <button
                  type="button"
                  data-cursor-target="true"
                  onClick={() => fillModelsDefault(filteredModels)}
                  className="inline-flex h-7 items-center gap-1 rounded-lg border border-cyan-500/40 bg-cyan-500/15 px-2.5 text-[11px] font-bold text-cyan-700 dark:text-cyan-300 hover:bg-cyan-500/25 transition-all cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[13px]">auto_fix_high</span>
                  <span>Gán mặc định ({tool.id === "kiro" ? "kiro/*" : "ag/*"})</span>
                </button>

                {mitmHosts.length > 0 && (
                  <button
                    type="button"
                    data-cursor-target="true"
                    onClick={handleCopyHosts}
                    title={mitmHosts.map((h) => `127.0.0.1 ${h}`).join("\n")}
                    className="inline-flex h-7 items-center gap-1 rounded-lg border border-black/10 dark:border-white/10 bg-white/60 dark:bg-white/[0.04] px-2 font-mono text-[11px] font-medium text-text-muted hover:text-text-main hover:border-cyan-500/35 transition-all cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-[13px]">
                      {copiedHosts ? "check" : "content_copy"}
                    </span>
                    <span>{copiedHosts ? "Đã chép" : "Hosts"}</span>
                  </button>
                )}

                <button
                  type="button"
                  data-cursor-target="true"
                  onClick={() => clearModelsMappings(filteredModels)}
                  className="inline-flex h-7 items-center gap-1 rounded-lg border border-black/10 dark:border-white/10 bg-white/60 dark:bg-white/[0.04] px-2 text-[11px] font-medium text-text-muted hover:text-rose-500 hover:border-rose-500/35 hover:bg-rose-500/10 transition-all cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[13px]">delete_sweep</span>
                  <span>Xóa hết</span>
                </button>
              </div>
            </div>

            {/* Grouped Symmetrical Model Matrix */}
            {modelGroups.length > 0 ? (
              <div className="flex flex-col gap-2">
                {modelGroups.map((grp) => {
                  const mappedCount = grp.models.filter((m) => (modelMappings[m.alias] || "").trim()).length;
                  return (
                    <details
                      key={grp.key}
                      open
                      className="group rounded-xl border border-black/[0.08] dark:border-cyan-500/20 bg-white/40 dark:bg-[#070D1B]/50 backdrop-blur-xs overflow-hidden transition-colors open:border-cyan-500/30"
                    >
                      <summary
                        className={`flex flex-wrap items-center justify-between gap-2 px-3 py-2 cursor-pointer select-none bg-white/70 dark:bg-white/[0.03] hover:bg-cyan-500/[0.06] transition-colors ${grp.accentBorder}`}
                      >
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className={`material-symbols-outlined text-[16px] ${grp.iconColor}`}>
                            {grp.icon}
                          </span>
                          <span className="text-xs font-bold text-text-main tracking-tight">
                            {grp.label}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            data-cursor-target="true"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              fillModelsDefault(grp.models);
                            }}
                            className="rounded-md border border-cyan-500/35 bg-cyan-500/12 px-2 py-0.5 font-mono text-[9.5px] font-semibold text-cyan-700 dark:text-cyan-300 hover:bg-cyan-500/22 transition-colors cursor-pointer"
                          >
                            Gán nhóm
                          </button>
                          <span
                            className={`px-2 py-0.5 rounded-full font-mono text-[10px] font-bold hud-telemetry-num border ${
                              mappedCount === grp.models.length
                                ? "border-emerald-500/30 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                                : mappedCount > 0
                                  ? "border-amber-500/30 bg-amber-500/15 text-amber-700 dark:text-amber-300"
                                  : "border-transparent bg-black/5 dark:bg-white/5 text-text-muted"
                            }`}
                          >
                            {mappedCount}/{grp.models.length}
                          </span>
                          <span className="material-symbols-outlined text-[16px] text-text-muted transition-transform group-open:rotate-180">
                            expand_more
                          </span>
                        </div>
                      </summary>
                      <div className="p-2.5 grid grid-cols-1 xl:grid-cols-2 gap-2 border-t border-cyan-500/12 bg-black/[0.015] dark:bg-black/20">
                        {grp.models.map(renderModelRow)}
                      </div>
                    </details>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-4 text-xs text-text-muted">
                Không tìm thấy model nào khớp với từ khóa &ldquo;{searchQuery}&rdquo;.
              </div>
            )}
          </div>
        )}
      </HudFrame>

      {/* Password Modal */}
      {showPasswordModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 backdrop-blur-sm">
          <div className="mx-4 flex w-full max-w-sm flex-col gap-4 rounded-xl border border-cyan-500/30 bg-surface p-5 shadow-xl sm:p-6">
            <h3 className="font-semibold text-text-main">Yêu cầu mật khẩu Sudo</h3>
            <div className="flex items-start gap-3 p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg">
              <span className="material-symbols-outlined text-amber-500 text-[20px]">warning</span>
              <p className="text-xs text-text-muted">Cần quyền sudo để cập nhật tệp /etc/hosts và làm mới bộ nhớ đệm DNS</p>
            </div>
            <Input
              type="password"
              placeholder="Nhập mật khẩu sudo"
              value={sudoPassword}
              onChange={(e) => setSudoPassword(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !loading) handleConfirmPassword(); }}
            />
            {modalError && (
              <div className="flex items-center gap-2 px-2 py-1.5 rounded text-xs bg-rose-500/10 text-rose-600 dark:text-rose-400">
                <span className="material-symbols-outlined text-[14px]">error</span>
                <span>{modalError}</span>
              </div>
            )}
            <div className="flex items-center justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => { setShowPasswordModal(false); setSudoPassword(""); setModalError(null); }} disabled={loading}>
                Hủy
              </Button>
              <Button variant="primary" size="sm" onClick={handleConfirmPassword} loading={loading}>
                Xác nhận
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Model Select Modal */}
      {modalOpen && (
        <ModelSelectModal
          isOpen={modalOpen}
          onClose={() => setModalOpen(false)}
          onSelect={handleModelSelect}
          selectedModel={currentEditingAlias ? modelMappings[currentEditingAlias] : null}
          activeProviders={activeProviders}
          modelAliases={modelAliases}
          title={`Chọn model đích cho ${currentEditingAlias}`}
        />
      )}
    </>
  );
}

export default memo(MitmToolCard);
