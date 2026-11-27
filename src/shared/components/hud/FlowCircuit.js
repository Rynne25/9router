"use client";

import { useId, useState, useCallback, useSyncExternalStore } from "react";
import HudFrame from "./HudFrame";
import { useHudPrefs } from "@/shared/hooks/useHudPrefs";
import { playHudSound } from "@/shared/utils/hudAudio";
import { cn } from "@/shared/utils/cn";

const STORAGE_PREFIX = "9r_flow_deck_";
const collapseListeners = new Set();

function readCollapsedStorage(storageKey, defaultCollapsed) {
  if (!storageKey || typeof window === "undefined") return Boolean(defaultCollapsed);
  try {
    const raw = window.localStorage.getItem(`${STORAGE_PREFIX}${storageKey}`);
    if (raw === "1") return true;
    if (raw === "0") return false;
    return Boolean(defaultCollapsed);
  } catch {
    return Boolean(defaultCollapsed);
  }
}

function writeCollapsedStorage(storageKey, collapsed) {
  if (!storageKey || typeof window === "undefined") return;
  try {
    window.localStorage.setItem(`${STORAGE_PREFIX}${storageKey}`, collapsed ? "1" : "0");
  } catch {
    /* ignore storage write error */
  }
  collapseListeners.forEach((listener) => listener());
}

function subscribeCollapse(listener) {
  collapseListeners.add(listener);
  if (typeof window === "undefined") return () => collapseListeners.delete(listener);
  const onStorage = (event) => {
    if (event.key && event.key.startsWith(STORAGE_PREFIX)) {
      listener();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    collapseListeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

const NODE_STATUS_STYLES = {
  live: {
    border: "border-emerald-500/45 shadow-[0_0_20px_rgba(16,185,129,0.14),inset_0_1px_0_rgba(255,255,255,0.08)]",
    highlightBorder: "border-emerald-400/80 ring-1 ring-emerald-400/45 shadow-[0_0_26px_rgba(16,185,129,0.28)]",
    iconBox: "border-emerald-500/40 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
    dot: "bg-emerald-500 shadow-[0_0_7px_rgba(16,185,129,0.85)]",
    badge: "border-emerald-500/35 bg-emerald-500/12 text-emerald-700 dark:text-emerald-300",
  },
  standby: {
    border: "border-cyan-500/35 hover:border-cyan-500/55 shadow-[0_0_18px_rgba(6,182,212,0.10),inset_0_1px_0_rgba(255,255,255,0.06)]",
    highlightBorder: "border-cyan-400/80 ring-1 ring-cyan-400/45 shadow-[0_0_24px_rgba(34,211,238,0.26)]",
    iconBox: "border-cyan-500/35 bg-cyan-500/12 text-cyan-600 dark:text-cyan-400",
    dot: "bg-cyan-500 shadow-[0_0_6px_rgba(6,182,212,0.8)]",
    badge: "border-cyan-500/35 bg-cyan-500/12 text-cyan-700 dark:text-cyan-300",
  },
  warning: {
    border: "border-amber-500/45 hover:border-amber-500/65 shadow-[0_0_18px_rgba(245,158,11,0.12),inset_0_1px_0_rgba(255,255,255,0.06)]",
    highlightBorder: "border-amber-400/85 ring-1 ring-amber-400/45 shadow-[0_0_24px_rgba(245,158,11,0.26)]",
    iconBox: "border-amber-500/40 bg-amber-500/15 text-amber-600 dark:text-amber-400",
    dot: "bg-amber-500 shadow-[0_0_7px_rgba(245,158,11,0.85)]",
    badge: "border-amber-500/35 bg-amber-500/12 text-amber-700 dark:text-amber-300",
  },
  error: {
    border: "border-rose-500/45 hover:border-rose-500/65 shadow-[0_0_18px_rgba(244,63,94,0.12),inset_0_1px_0_rgba(255,255,255,0.06)]",
    highlightBorder: "border-rose-400/85 ring-1 ring-rose-400/45 shadow-[0_0_24px_rgba(244,63,94,0.26)]",
    iconBox: "border-rose-500/40 bg-rose-500/15 text-rose-600 dark:text-rose-400",
    dot: "bg-rose-500 shadow-[0_0_7px_rgba(244,63,94,0.85)]",
    badge: "border-rose-500/35 bg-rose-500/12 text-rose-700 dark:text-rose-300",
  },
  violet: {
    border: "border-violet-500/40 hover:border-violet-500/60 shadow-[0_0_18px_rgba(139,92,246,0.12),inset_0_1px_0_rgba(255,255,255,0.06)]",
    highlightBorder: "border-violet-400/80 ring-1 ring-violet-400/45 shadow-[0_0_24px_rgba(139,92,246,0.26)]",
    iconBox: "border-violet-500/40 bg-violet-500/15 text-violet-600 dark:text-violet-400",
    dot: "bg-violet-500 shadow-[0_0_7px_rgba(139,92,246,0.85)]",
    badge: "border-violet-500/35 bg-violet-500/12 text-violet-700 dark:text-violet-300",
  },
  idle: {
    border: "border-border hover:border-cyan-500/35 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]",
    highlightBorder: "border-cyan-500/60 ring-1 ring-cyan-500/35 shadow-[0_0_18px_rgba(6,182,212,0.16)]",
    iconBox: "border-border bg-surface-3 text-text-muted",
    dot: "bg-slate-400",
    badge: "border-border bg-surface-3 text-text-muted",
  },
};

const BEAM_COLORS = {
  emerald: { primary: "#10B981", secondary: "#34D399" },
  cyan: { primary: "#06B6D4", secondary: "#38BDF8" },
  amber: { primary: "#F59E0B", secondary: "#FBBF24" },
  rose: { primary: "#F43F5E", secondary: "#FB7185" },
  violet: { primary: "#8B5CF6", secondary: "#A78BFA" },
};

const DECK_DOT_MAP = {
  emerald: "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.85)]",
  cyan: "bg-cyan-500 shadow-[0_0_8px_rgba(6,182,212,0.8)]",
  amber: "bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.85)]",
  rose: "bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.85)]",
};

/**
 * Shared container for visual live circuit diagrams with Blueprint canvas and persisted collapse toggle.
 */
export function FlowDeck({
  storageKey,
  title,
  subtitle,
  badge,
  statusLabel,
  statusAccent = "cyan",
  accent = "cyan",
  borderBeam = false,
  headerRight,
  defaultCollapsed = false,
  className = "",
  children,
}) {
  const { motionPaused } = useHudPrefs();
  const [hoveredIndex, setHoveredIndex] = useState(null);

  const collapsed = useSyncExternalStore(
    subscribeCollapse,
    () => readCollapsedStorage(storageKey, defaultCollapsed),
    () => Boolean(defaultCollapsed)
  );

  const handleToggleCollapse = useCallback(() => {
    playHudSound("click");
    writeCollapsedStorage(storageKey, !collapsed);
  }, [storageKey, collapsed]);

  const frameAccent =
    accent === "emerald" || accent === "amber" || accent === "rose" || accent === "cyan"
      ? accent
      : "cyan";
  const dotClass = DECK_DOT_MAP[statusAccent] || DECK_DOT_MAP.cyan;

  return (
    <HudFrame
      chamfer="md"
      accent={frameAccent}
      borderBeam={borderBeam}
      spotlight={true}
      padding="none"
      className={cn("overflow-hidden", className)}
    >
      <div className="relative z-10">
        {/* Top Control Bar */}
        <div className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2.5 border-b border-border-subtle bg-surface/65 backdrop-blur-sm">
          <div className="flex flex-wrap items-center gap-2 min-w-0">
            <span
              className={cn(
                "inline-flex size-2 shrink-0 rounded-full",
                dotClass,
                !motionPaused && "animate-pulse"
              )}
            />
            <span className="font-mono text-[11px] font-bold uppercase tracking-[0.12em] text-text-main whitespace-nowrap">
              {title}
            </span>
            {badge && (
              <span
                className="inline-flex items-center rounded border border-cyan-500/30 bg-cyan-500/10 px-2 py-0.5 font-mono text-[10px] font-semibold text-cyan-700 dark:text-cyan-300 whitespace-nowrap"
                data-i18n-skip="true"
              >
                {badge}
              </span>
            )}
            {subtitle && (
              <span className="hidden lg:inline text-[11px] text-text-muted truncate max-w-[340px]">
                {subtitle}
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {headerRight}
            {statusLabel && (
              <span className="rounded border border-border-subtle bg-surface-2/80 px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-text-muted whitespace-nowrap">
                {statusLabel}
              </span>
            )}
            <button
              type="button"
              data-cursor-target="true"
              aria-expanded={!collapsed}
              onClick={handleToggleCollapse}
              className="inline-flex items-center gap-1 rounded-md border border-black/10 dark:border-white/15 bg-black/[0.03] dark:bg-white/[0.04] px-2 py-1 font-mono text-[10.5px] font-semibold text-text-muted hover:text-cyan-600 dark:hover:text-cyan-300 hover:border-cyan-500/40 transition-colors cursor-pointer whitespace-nowrap"
              title={collapsed ? "Mở rộng sơ đồ luồng" : "Thu gọn sơ đồ luồng"}
            >
              <span className="material-symbols-outlined text-[14px]">
                {collapsed ? "unfold_more" : "unfold_less"}
              </span>
              <span className="hidden sm:inline">{collapsed ? "Mở sơ đồ" : "Thu gọn"}</span>
            </button>
          </div>
        </div>

        {/* Blueprint Dot-Matrix Circuit Canvas */}
        {!collapsed && (
          <div className="hud-blueprint-canvas p-3 sm:p-3.5">
            {typeof children === "function"
              ? children({ hoveredIndex, setHoveredIndex })
              : children}
          </div>
        )}
      </div>
    </HudFrame>
  );
}

/**
 * Glassmorphic interactive circuit node with status accent, hover illumination, and optional action handling.
 */
export function FlowNode({
  step,
  eyebrow,
  title,
  subtitle,
  icon,
  status = "standby",
  badge,
  active = false,
  highlighted = false,
  dimmed = false,
  onClick,
  onHoverStart,
  onHoverEnd,
  footer,
  children,
  className = "",
  ariaLabel,
}) {
  const { motionPaused } = useHudPrefs();
  const palette = NODE_STATUS_STYLES[status] || NODE_STATUS_STYLES.standby;
  const isClickable = typeof onClick === "function";

  const handleKeyDown = (event) => {
    if (!isClickable) return;
    if (event.target !== event.currentTarget) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onClick(event);
    }
  };

  return (
    <div
      role={isClickable ? "button" : undefined}
      tabIndex={isClickable ? 0 : undefined}
      aria-label={isClickable ? ariaLabel || title : undefined}
      data-cursor-target={isClickable ? "true" : undefined}
      onClick={
        isClickable
          ? (event) => {
              onClick(event);
            }
          : undefined
      }
      onKeyDown={isClickable ? handleKeyDown : undefined}
      onMouseEnter={onHoverStart}
      onMouseLeave={onHoverEnd}
      className={cn(
        "relative flex flex-col justify-between gap-2.5 rounded-xl border p-3 transition-all duration-200 min-w-0",
        "bg-gradient-to-br from-surface-2/95 via-surface-2/80 to-surface/70 backdrop-blur-md",
        highlighted ? palette.highlightBorder : palette.border,
        active && !highlighted && "ring-1 ring-inset ring-cyan-400/25",
        dimmed && "opacity-55",
        isClickable &&
          "cursor-pointer select-none focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/70 hover:-translate-y-0.5",
        className
      )}
    >
      {/* Header row */}
      <div className="flex items-start justify-between gap-2 min-w-0">
        <div className="flex items-center gap-2.5 min-w-0">
          {icon && (
            <div
              className={cn(
                "flex size-8 shrink-0 items-center justify-center rounded-lg border shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]",
                palette.iconBox
              )}
            >
              <span className="material-symbols-outlined text-[18px]">{icon}</span>
            </div>
          )}
          <div className="min-w-0">
            {(step || eyebrow) && (
              <div className="flex items-center gap-1.5 min-w-0">
                <span
                  className={cn(
                    "size-1.5 shrink-0 rounded-full",
                    palette.dot,
                    status === "live" && !motionPaused && "animate-pulse"
                  )}
                />
                <span className="block font-mono text-[9.5px] font-semibold uppercase tracking-[0.1em] text-text-subtle truncate">
                  {step ? (eyebrow ? `${step} · ${eyebrow}` : step) : eyebrow}
                </span>
              </div>
            )}
            <p className="text-xs font-bold text-text-main truncate">{title}</p>
            {subtitle && (
              <p className="font-mono text-[10px] text-text-muted truncate hud-telemetry-num">
                {subtitle}
              </p>
            )}
          </div>
        </div>

        {badge && (
          <span
            className={cn(
              "shrink-0 rounded border px-1.5 py-0.5 font-mono text-[9.5px] font-bold uppercase tracking-wide whitespace-nowrap",
              palette.badge
            )}
          >
            {badge}
          </span>
        )}
      </div>

      {children && <div className="min-w-0">{children}</div>}

      {footer && (
        <div className="flex items-center justify-between gap-2 text-[10px] font-mono min-w-0 pt-0.5">
          {footer}
        </div>
      )}
    </div>
  );
}

/**
 * Dual-layer responsive SVG curved beam connector with moving luminous packet dot.
 */
export function FlowBeam({
  active = false,
  paused = false,
  accent = "cyan",
  highlighted = false,
  dimmed = false,
  label = "",
  compact = false,
}) {
  const { motionPaused } = useHudPrefs();
  const isPaused = Boolean(paused || motionPaused);
  const gradId = useId();
  const vertGradId = useId();
  const filterId = useId();
  const vertFilterId = useId();

  const colors = BEAM_COLORS[accent] || BEAM_COLORS.cyan;
  const viewWidth = compact ? 56 : 84;
  const xEnd = compact ? 54 : 82;
  const cp1 = compact ? 18 : 26;
  const cp2 = compact ? 38 : 58;
  const topCurve = `M 2 32 C ${cp1} 15, ${cp2} 15, ${xEnd} 32`;
  const bottomCurve = `M 2 32 C ${cp1} 49, ${cp2} 49, ${xEnd} 32`;
  const vertLeft = "M 32 2 C 18 12, 18 22, 32 34";
  const vertRight = "M 32 2 C 46 12, 46 22, 32 34";
  const packetDur = highlighted ? "1.05s" : "1.55s";

  return (
    <>
      {/* Desktop horizontal curved beam */}
      <div
        className={cn(
          "hidden md:flex flex-col items-center justify-center w-full select-none pointer-events-none transition-opacity duration-200",
          compact ? "h-16" : "h-24",
          dimmed && "opacity-35"
        )}
        aria-hidden="true"
      >
        <svg viewBox={`0 0 ${viewWidth} 64`} className="w-full h-14 overflow-visible">
          <defs>
            <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor={colors.primary} stopOpacity="0.32" />
              <stop offset="50%" stopColor={colors.secondary} stopOpacity="1" />
              <stop offset="100%" stopColor={colors.primary} stopOpacity="0.38" />
            </linearGradient>
            <filter id={filterId} x="-30%" y="-30%" width="160%" height="160%">
              <feGaussianBlur stdDeviation="2" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          <path
            d={topCurve}
            fill="none"
            stroke="currentColor"
            strokeWidth="1.4"
            className="text-cyan-500/20 dark:text-cyan-400/20"
          />
          <path
            d={bottomCurve}
            fill="none"
            stroke="currentColor"
            strokeWidth="1.4"
            className="text-cyan-500/20 dark:text-cyan-400/20"
          />
          <line
            x1="2"
            y1="32"
            x2={xEnd}
            y2="32"
            stroke="currentColor"
            strokeWidth="1.2"
            strokeDasharray="3 4"
            className="text-cyan-500/25 dark:text-cyan-400/20"
          />

          {(active || highlighted) && (
            <path
              d={topCurve}
              fill="none"
              stroke={colors.primary}
              strokeOpacity={highlighted ? "0.4" : "0.26"}
              strokeWidth={highlighted ? "5.5" : "4.5"}
              strokeLinecap="round"
              filter={`url(#${filterId})`}
            />
          )}

          <path
            d={topCurve}
            fill="none"
            stroke={`url(#${gradId})`}
            strokeWidth={active || highlighted ? "2.5" : "1.45"}
            strokeLinecap="round"
            strokeDasharray="12 16"
            filter={active || highlighted ? `url(#${filterId})` : undefined}
            className={cn(
              (active || highlighted) && !isPaused ? "hud-flow-beam-active" : "opacity-35"
            )}
          />
          <path
            d={bottomCurve}
            fill="none"
            stroke={`url(#${gradId})`}
            strokeWidth={active || highlighted ? "1.9" : "1.2"}
            strokeLinecap="round"
            strokeDasharray="8 20"
            className={cn(
              (active || highlighted) && !isPaused ? "hud-flow-beam-slow" : "opacity-25"
            )}
          />

          {(active || highlighted) && !isPaused && (
            <g className="hud-flow-packet">
              <circle r="4.2" fill={colors.primary} fillOpacity="0.28">
                <animateMotion dur={packetDur} repeatCount="indefinite" path={topCurve} />
              </circle>
              <circle r="2.2" fill={colors.secondary} filter={`url(#${filterId})`}>
                <animateMotion dur={packetDur} repeatCount="indefinite" path={topCurve} />
              </circle>
              <circle r="1.5" fill={colors.primary} fillOpacity="0.82">
                <animateMotion dur="2.1s" repeatCount="indefinite" path={bottomCurve} />
              </circle>
            </g>
          )}

          <circle
            cx="3.5"
            cy="32"
            r="2.8"
            fill={active || highlighted ? colors.primary : "currentColor"}
            className={!active && !highlighted ? "text-text-subtle/50" : undefined}
          />
          <circle
            cx={xEnd - 1.5}
            cy="32"
            r="2.8"
            fill={active || highlighted ? colors.secondary : "currentColor"}
            className={!active && !highlighted ? "text-text-subtle/50" : undefined}
          />
        </svg>
        {label && (
          <span className="-mt-2 rounded bg-surface/85 px-1.5 py-0.2 font-mono text-[9px] font-semibold uppercase tracking-wider text-text-muted border border-border-subtle whitespace-nowrap">
            {label}
          </span>
        )}
      </div>

      {/* Mobile vertical curved beam */}
      <div
        className={cn(
          "flex md:hidden items-center justify-center w-full h-9 select-none pointer-events-none gap-2",
          dimmed && "opacity-35"
        )}
        aria-hidden="true"
      >
        <svg viewBox="0 0 64 36" className="w-16 h-9 overflow-visible">
          <defs>
            <linearGradient id={vertGradId} x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor={colors.primary} stopOpacity="0.32" />
              <stop offset="50%" stopColor={colors.secondary} stopOpacity="1" />
              <stop offset="100%" stopColor={colors.primary} stopOpacity="0.38" />
            </linearGradient>
            <filter id={vertFilterId} x="-30%" y="-30%" width="160%" height="160%">
              <feGaussianBlur stdDeviation="1.8" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
          <path
            d={vertLeft}
            fill="none"
            stroke="currentColor"
            strokeWidth="1.4"
            className="text-cyan-500/20 dark:text-cyan-400/20"
          />
          <path
            d={vertRight}
            fill="none"
            stroke="currentColor"
            strokeWidth="1.4"
            className="text-cyan-500/20 dark:text-cyan-400/20"
          />
          {(active || highlighted) && (
            <path
              d={vertLeft}
              fill="none"
              stroke={colors.primary}
              strokeOpacity="0.25"
              strokeWidth="4.2"
              strokeLinecap="round"
              filter={`url(#${vertFilterId})`}
            />
          )}
          <path
            d={vertLeft}
            fill="none"
            stroke={`url(#${vertGradId})`}
            strokeWidth={active || highlighted ? "2.3" : "1.4"}
            strokeLinecap="round"
            strokeDasharray="10 12"
            filter={active || highlighted ? `url(#${vertFilterId})` : undefined}
            className={cn(
              (active || highlighted) && !isPaused ? "hud-flow-beam-active" : "opacity-35"
            )}
          />
          {(active || highlighted) && !isPaused && (
            <g className="hud-flow-packet">
              <circle r="3.8" fill={colors.primary} fillOpacity="0.28">
                <animateMotion dur="1.45s" repeatCount="indefinite" path={vertLeft} />
              </circle>
              <circle r="2" fill={colors.secondary} filter={`url(#${vertFilterId})`}>
                <animateMotion dur="1.45s" repeatCount="indefinite" path={vertLeft} />
              </circle>
            </g>
          )}
          <circle
            cx="32"
            cy="3"
            r="2.6"
            fill={active || highlighted ? colors.primary : "currentColor"}
            className={!active && !highlighted ? "text-text-subtle/50" : undefined}
          />
          <circle
            cx="32"
            cy="33"
            r="2.6"
            fill={active || highlighted ? colors.secondary : "currentColor"}
            className={!active && !highlighted ? "text-text-subtle/50" : undefined}
          />
        </svg>
        {label && (
          <span className="rounded bg-surface/85 px-1.5 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-wider text-text-muted border border-border-subtle whitespace-nowrap">
            {label}
          </span>
        )}
      </div>
    </>
  );
}
