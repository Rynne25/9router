"use client";

import { memo, useState, useEffect, useCallback, useMemo } from "react";
import { Card, Button, Badge, Input, ModelSelectModal } from "@/shared/components";
import { TOOL_HOSTS } from "@/shared/constants/mitmToolHosts";
import { getCachedData, setCachedData, fetchWithCache, fetchJson } from "@/shared/utils/swrCache";
import Image from "next/image";

/**
 * Per-tool MITM card — shows DNS status + model mappings in a uniform Liquid Glass layout.
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
      if (!res.ok) throw new Error(data.error || "Failed to toggle DNS");

      if (action === "enable") {
        setWarning(`Khởi động lại ${tool.name} để áp dụng định tuyến DNS mới`);
      }

      setShowPasswordModal(false);
      setSudoPassword("");
      onDnsChange?.(data);
    } catch (err) {
      if (showPasswordModal) {
        setModalError(err.message || "Failed to toggle DNS");
      } else {
        setWarning(err.message || "Failed to toggle DNS");
      }
    } finally {
      setLoading(false);
      setPendingDnsAction(null);
    }
  };

  const handleDnsToggle = (e) => {
    if (e) e.stopPropagation();
    if (!serverRunning) return;
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
      setModalError("Sudo password is required");
      return;
    }
    doDnsAction(pendingDnsAction, sudoPassword);
  };

  const handleCopyHosts = () => {
    if (!mitmHosts.length || typeof navigator === "undefined") return;
    const text = mitmHosts.map((h) => `127.0.0.1 ${h}`).join("\n");
    navigator.clipboard?.writeText(text);
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
        badgeText: alias === "auto" ? "Agent Auto" : "G1 Pro",
        badgeColor: "bg-purple-500/15 text-purple-600 dark:text-purple-300 border border-purple-500/30",
      };
    }
    if (alias.startsWith("gemini-4")) {
      return {
        border: "border-cyan-500/30 hover:border-cyan-500/60",
        bg: "bg-cyan-500/[0.04] hover:bg-cyan-500/[0.08]",
        icon: "auto_awesome",
        iconColor: "text-cyan-500",
        badgeText: "Gemini 4",
        badgeColor: "bg-cyan-500/15 text-cyan-600 dark:text-cyan-300 border border-cyan-500/30",
      };
    }
    if (alias.startsWith("gemini-3")) {
      return {
        border: "border-sky-500/30 hover:border-sky-500/60",
        bg: "bg-sky-500/[0.04] hover:bg-sky-500/[0.08]",
        icon: "bolt",
        iconColor: "text-sky-500",
        badgeText: alias.includes("image") ? "Image" : alias.includes("lite") ? "Lite" : "Flash",
        badgeColor: "bg-sky-500/15 text-sky-600 dark:text-sky-300 border border-sky-500/30",
      };
    }
    if (alias.startsWith("claude")) {
      return {
        border: "border-orange-500/30 hover:border-orange-500/60",
        bg: "bg-orange-500/[0.04] hover:bg-orange-500/[0.08]",
        icon: "psychology",
        iconColor: "text-orange-500",
        badgeText: alias.includes("opus") ? "Opus" : alias.includes("haiku") ? "Haiku" : "Sonnet",
        badgeColor: "bg-orange-500/15 text-orange-600 dark:text-orange-300 border border-orange-500/30",
      };
    }
    return {
      border: "border-black/10 dark:border-white/10 hover:border-primary/50",
      bg: "bg-white/40 dark:bg-white/[0.02] hover:bg-white/60 dark:hover:bg-white/[0.04]",
      icon: "smart_toy",
      iconColor: "text-primary",
      badgeText: "Model",
      badgeColor: "bg-primary/10 text-primary border border-primary/25",
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
        className={`flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 sm:gap-2 rounded-lg border px-2.5 py-1.5 transition-all ${theme.border} ${theme.bg} ${
          isMapped ? "ring-1 ring-primary/15" : ""
        }`}
      >
        {/* Left: Status Dot + Clean Short Model Name + Prominent Thinking Badge */}
        <div
          className="flex items-center gap-1.5 sm:w-[195px] md:w-[215px] shrink-0 min-w-0"
          title={`${model.name} (${model.alias})`}
        >
          <span
            className={`size-1.5 rounded-full shrink-0 ${
              isMapped
                ? "bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.6)]"
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
              className={`inline-flex items-center rounded px-1.5 py-0.5 text-[9px] font-extrabold uppercase tracking-tight leading-none border shrink-0 ${displayInfo.badgeStyle}`}
            >
              {displayInfo.badge}
            </span>
          )}
        </div>

        {/* Right: Target Input + Icon-only Quick Combo + Icon-only Select Button */}
        <div className="flex items-center gap-1.5 flex-1 min-w-0">
          <div className="relative flex-1 min-w-0">
            <input
              type="text"
              value={modelMappings[model.alias] || ""}
              onChange={(e) => handleModelMappingChange(model.alias, e.target.value)}
              onBlur={(e) => handleMappingBlur(model.alias, e.target.value)}
              placeholder={getDefaultTargetForAlias(model.alias)}
              className="w-full min-w-0 h-7 pl-2.5 pr-6 bg-white/75 dark:bg-black/30 rounded-md border border-black/10 dark:border-white/10 text-[11px] font-mono text-text-main placeholder:text-text-muted/40 focus:outline-none focus:ring-1 focus:ring-primary/50 focus:border-primary transition-all"
            />
            {modelMappings[model.alias] && (
              <button
                type="button"
                onClick={() => assignSingleAlias(model.alias, "")}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 p-0.5 text-text-muted hover:text-red-500 rounded transition-colors cursor-pointer"
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
              className={`inline-flex size-7 items-center justify-center rounded-md border text-[13px] shrink-0 transition-all cursor-pointer ${
                currentVal === combos[0].name
                  ? "bg-purple-500/25 border-purple-500 text-purple-600 dark:text-purple-300 shadow-2xs ring-1 ring-purple-500/40"
                  : "bg-purple-500/10 border-purple-500/25 text-purple-600 dark:text-purple-300 hover:bg-purple-500/20 hover:border-purple-500/40"
              }`}
            >
              <span className="material-symbols-outlined text-[15px]">layers</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => openModelSelector(model.alias)}
            disabled={!hasActiveProviders}
            title="Chọn model đích"
            aria-label="Chọn model đích"
            className={`inline-flex size-7 items-center justify-center rounded-md border shrink-0 transition-all ${
              hasActiveProviders
                ? "bg-primary text-white border-primary hover:bg-primary-hover shadow-2xs cursor-pointer active:scale-95"
                : "opacity-50 cursor-not-allowed border-border text-text-muted bg-surface"
            }`}
          >
            <span className="material-symbols-outlined text-[15px]">ads_click</span>
          </button>
        </div>
      </div>
    );
  };

  return (
    <>
      <Card padding="none" className="overflow-hidden">
        {/* Tool Header Bar — Compact Single Row */}
        <div
          className="px-3 py-2 flex flex-wrap items-center justify-between gap-2 cursor-pointer select-none hover:bg-white/30 dark:hover:bg-white/[0.02] transition-colors"
          onClick={onToggle}
        >
          <div className="flex min-w-0 items-center gap-2.5">
            <div className="size-7 rounded-lg bg-white/70 dark:bg-white/[0.06] border border-black/[0.06] dark:border-white/[0.08] flex items-center justify-center shrink-0">
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
              {!serverRunning ? (
                <Badge variant="default" size="xs">Server tắt</Badge>
              ) : dnsActive ? (
                <Badge variant="success" size="xs">Đang định tuyến DNS</Badge>
              ) : (
                <Badge variant="warning" size="xs">DNS đang tắt</Badge>
              )}
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                totalMappedCount > 0
                  ? "bg-primary/10 border-primary/25 text-primary"
                  : "bg-black/5 dark:bg-white/5 border-transparent text-text-muted"
              }`}>
                {totalMappedCount}/{totalModelsCount} đã gán
              </span>
              {tool.mitmDomain && (
                <code className="hidden md:inline text-[10px] font-mono px-1.5 py-0.5 rounded bg-black/[0.04] dark:bg-white/[0.05] text-text-muted">
                  {tool.mitmDomain}
                </code>
              )}
              {savedNotice && (
                <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-emerald-500">
                  <span className="material-symbols-outlined text-[12px]">check_circle</span>
                  Đã lưu
                </span>
              )}
            </div>
          </div>

          {/* Right Header Controls: Direct DNS Toggle + Expand Chevron */}
          <div className="flex items-center gap-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              onClick={handleDnsToggle}
              disabled={!serverRunning || loading}
              title={!serverRunning ? "Khởi động MITM Server ở trên trước khi bật DNS" : undefined}
              className={`inline-flex h-7 items-center gap-1 rounded-lg border px-2.5 text-[11px] font-bold transition-all ${
                !serverRunning
                  ? "opacity-45 cursor-not-allowed border-black/10 dark:border-white/10 text-text-muted bg-black/[0.02] dark:bg-white/[0.02]"
                  : dnsActive
                    ? "border-red-500/35 bg-red-500/15 text-red-600 dark:text-red-400 hover:bg-red-500/25 cursor-pointer"
                    : "border-emerald-500/35 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/25 cursor-pointer"
              }`}
            >
              <span className="material-symbols-outlined text-[14px]">
                {dnsActive ? "link_off" : "add_link"}
              </span>
              <span>{dnsActive ? "Tắt DNS" : "Bật DNS"}</span>
            </button>

            <button
              type="button"
              onClick={onToggle}
              aria-label="Toggle tool details"
              className="flex size-7 items-center justify-center rounded-lg border border-black/10 dark:border-white/10 bg-white/40 dark:bg-white/[0.03] text-text-muted hover:text-text-main transition-colors"
            >
              <span className={`material-symbols-outlined text-[17px] transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`}>
                expand_more
              </span>
            </button>
          </div>
        </div>

        {isExpanded && (
          <div className="px-3 pb-3 pt-2 border-t border-black/[0.06] dark:border-white/[0.08] flex flex-col gap-2.5">
            {/* Warning after toggling DNS */}
            {warning && (
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-500/10 border border-amber-500/25 text-[11px] text-amber-600 dark:text-amber-400">
                <span className="material-symbols-outlined text-[14px]">info</span>
                <span>{warning}</span>
              </div>
            )}

            {/* Smart Batch Action & Search Toolbar */}
            <div className="liquid-glass-panel rounded-lg px-2.5 py-1.5 flex flex-wrap items-center justify-between gap-2">
              {/* Search Filter */}
              <div className="relative flex-1 min-w-[180px] max-w-sm">
                <span className="material-symbols-outlined text-[14px] text-text-muted absolute left-2 top-1/2 -translate-y-1/2 pointer-events-none">
                  search
                </span>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={`Tìm nhanh trong ${totalModelsCount} model...`}
                  className="w-full h-7 pl-7 pr-6 rounded-md border border-black/10 dark:border-white/10 bg-white/60 dark:bg-black/20 text-[11px] text-text-main placeholder:text-text-muted/60 focus:outline-none focus:border-primary"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery("")}
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-main"
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
                    onClick={() => assignModelsToTarget(combo.name, filteredModels)}
                    title={`Gán toàn bộ model đang hiển thị vào Combo "${combo.name}"`}
                    className="inline-flex h-7 items-center gap-1 rounded-md border border-purple-500/35 bg-purple-500/15 px-2.5 text-[11px] font-bold text-purple-600 dark:text-purple-300 hover:bg-purple-500/25 transition-all cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-[13px]">layers</span>
                    <span>Gán tất cả ➔ {combo.name}</span>
                  </button>
                ))}

                <button
                  type="button"
                  onClick={() => fillModelsDefault(filteredModels)}
                  className="inline-flex h-7 items-center gap-1 rounded-md border border-primary/35 bg-primary/15 px-2.5 text-[11px] font-bold text-primary hover:bg-primary/25 transition-all cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[13px]">auto_fix_high</span>
                  <span>Gán mặc định (ag/*)</span>
                </button>

                {mitmHosts.length > 0 && (
                  <button
                    type="button"
                    onClick={handleCopyHosts}
                    title={mitmHosts.map((h) => `127.0.0.1 ${h}`).join("\n")}
                    className="inline-flex h-7 items-center gap-1 rounded-md border border-black/10 dark:border-white/10 bg-white/50 dark:bg-white/[0.04] px-2 text-[11px] font-medium text-text-muted hover:text-text-main transition-all cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-[13px]">
                      {copiedHosts ? "check" : "content_copy"}
                    </span>
                    <span>{copiedHosts ? "Đã chép" : "Hosts"}</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => clearModelsMappings(filteredModels)}
                  className="inline-flex h-7 items-center gap-1 rounded-md border border-black/10 dark:border-white/10 bg-white/50 dark:bg-white/[0.04] px-2 text-[11px] font-medium text-text-muted hover:text-red-500 hover:border-red-500/35 hover:bg-red-500/10 transition-all cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[13px]">delete_sweep</span>
                  <span>Xóa hết</span>
                </button>
              </div>
            </div>

            {/* Grouped Symmetrical Model Cards */}
            {modelGroups.length > 0 ? (
              <div className="flex flex-col gap-2">
                {modelGroups.map((grp) => {
                  const mappedCount = grp.models.filter((m) => (modelMappings[m.alias] || "").trim()).length;
                  return (
                    <details
                      key={grp.key}
                      open
                      className="group rounded-xl border border-black/[0.08] dark:border-white/[0.08] bg-white/25 dark:bg-white/[0.015] overflow-hidden"
                    >
                      <summary
                        className={`flex flex-wrap items-center justify-between gap-2 px-3 py-1.5 cursor-pointer select-none bg-white/50 dark:bg-white/[0.03] hover:bg-white/70 dark:hover:bg-white/[0.05] transition-colors ${grp.accentBorder}`}
                      >
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className={`material-symbols-outlined text-[16px] ${grp.iconColor}`}>
                            {grp.icon}
                          </span>
                          <span className="text-xs font-bold text-text-main">
                            {grp.label}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              fillModelsDefault(grp.models);
                            }}
                            className="rounded border border-primary/25 bg-primary/10 px-1.5 py-0.5 text-[9.5px] font-semibold text-primary hover:bg-primary/20 transition-colors cursor-pointer"
                          >
                            Gán nhóm
                          </button>
                          <span
                            className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold tabular-nums ${
                              mappedCount === grp.models.length
                                ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                                : mappedCount > 0
                                  ? "bg-amber-500/15 text-amber-600 dark:text-amber-400"
                                  : "bg-black/5 dark:bg-white/5 text-text-muted"
                            }`}
                          >
                            {mappedCount}/{grp.models.length}
                          </span>
                          <span className="material-symbols-outlined text-[16px] text-text-muted transition-transform group-open:rotate-180">
                            expand_more
                          </span>
                        </div>
                      </summary>
                      <div className="p-2 grid grid-cols-1 xl:grid-cols-2 gap-1.5 border-t border-black/[0.05] dark:border-white/[0.06]">
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
      </Card>

      {/* Password Modal */}
      {showPasswordModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="mx-4 flex w-full max-w-sm flex-col gap-4 rounded-xl border border-border bg-surface p-5 shadow-xl sm:p-6">
            <h3 className="font-semibold text-text-main">Sudo Password Required</h3>
            <div className="flex items-start gap-3 p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
              <span className="material-symbols-outlined text-yellow-500 text-[20px]">warning</span>
              <p className="text-xs text-text-muted">Required to modify /etc/hosts and flush DNS cache</p>
            </div>
            <Input
              type="password"
              placeholder="Enter sudo password"
              value={sudoPassword}
              onChange={(e) => setSudoPassword(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !loading) handleConfirmPassword(); }}
            />
            {modalError && (
              <div className="flex items-center gap-2 px-2 py-1.5 rounded text-xs bg-red-500/10 text-red-600">
                <span className="material-symbols-outlined text-[14px]">error</span>
                <span>{modalError}</span>
              </div>
            )}
            <div className="flex items-center justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => { setShowPasswordModal(false); setSudoPassword(""); setModalError(null); }} disabled={loading}>
                Cancel
              </Button>
              <Button variant="primary" size="sm" onClick={handleConfirmPassword} loading={loading}>
                Confirm
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
