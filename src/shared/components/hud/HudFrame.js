"use client";

import { useCallback, useEffect, useRef } from "react";
import { useHudPrefs } from "@/shared/hooks/useHudPrefs";
import { cn } from "@/shared/utils/cn";

const ACCENT_MAP = {
  cyan: {
    bracket: "border-cyan-500/50 dark:border-cyan-400/55",
    dot: "bg-cyan-500 dark:bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.65)]",
    glow: "rgba(34, 211, 238, 0.14)",
    borderHover: "group-hover/hud:border-cyan-500/35 dark:group-hover/hud:border-cyan-400/35",
    beamStart: "rgba(34, 211, 238, 0.92)",
    beamEnd: "rgba(56, 189, 248, 0.55)",
  },
  amber: {
    bracket: "border-amber-500/55 dark:border-amber-400/55",
    dot: "bg-amber-500 dark:bg-amber-400 shadow-[0_0_8px_rgba(245,158,11,0.65)]",
    glow: "rgba(245, 158, 11, 0.14)",
    borderHover: "group-hover/hud:border-amber-500/35 dark:group-hover/hud:border-amber-400/35",
    beamStart: "rgba(245, 158, 11, 0.92)",
    beamEnd: "rgba(251, 191, 36, 0.55)",
  },
  emerald: {
    bracket: "border-emerald-500/55 dark:border-emerald-400/55",
    dot: "bg-emerald-500 dark:bg-emerald-400 shadow-[0_0_8px_rgba(16,185,129,0.65)]",
    glow: "rgba(16, 185, 129, 0.14)",
    borderHover: "group-hover/hud:border-emerald-500/35 dark:group-hover/hud:border-emerald-400/35",
    beamStart: "rgba(16, 185, 129, 0.92)",
    beamEnd: "rgba(52, 211, 153, 0.55)",
  },
  rose: {
    bracket: "border-rose-500/55 dark:border-rose-400/55",
    dot: "bg-rose-500 dark:bg-rose-400 shadow-[0_0_8px_rgba(244,63,94,0.65)]",
    glow: "rgba(244, 63, 94, 0.14)",
    borderHover: "group-hover/hud:border-rose-500/35 dark:group-hover/hud:border-rose-400/35",
    beamStart: "rgba(244, 63, 94, 0.92)",
    beamEnd: "rgba(251, 113, 133, 0.55)",
  },
};

const PADDING_MAP = {
  none: "p-0",
  sm: "p-3",
  md: "p-5",
  lg: "p-6",
};

const CHAMFER_CLASS = {
  none: "rounded-xl",
  sm: "hud-chamfer-sm",
  md: "hud-chamfer-md",
};

export function HudFrame({
  children,
  chamfer = "md",
  accent = "cyan",
  spotlight = true,
  borderBeam = false,
  tilt = false,
  padding = "md",
  header,
  statusDot,
  className = "",
  style,
  onMouseMove,
  onMouseLeave,
  ...props
}) {
  const containerRef = useRef(null);
  const { motionPaused } = useHudPrefs();

  const palette = ACCENT_MAP[accent] || ACCENT_MAP.cyan;
  const chamferClass = CHAMFER_CLASS[chamfer] ?? CHAMFER_CLASS.md;
  const paddingClass = PADDING_MAP[padding] ?? PADDING_MAP.md;

  const tiltEnabled = Boolean(tilt && !motionPaused);
  const beamEnabled = Boolean(borderBeam && !motionPaused);
  const trackPointer = Boolean(spotlight || tiltEnabled);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || tiltEnabled) return;
    el.style.setProperty("--tilt-x", "0deg");
    el.style.setProperty("--tilt-y", "0deg");
  }, [tiltEnabled]);

  const handleMouseMove = useCallback(
    (e) => {
      onMouseMove?.(e);
      if (!trackPointer || !containerRef.current) return;
      const el = containerRef.current;
      const rect = el.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;

      const xPct = ((e.clientX - rect.left) / rect.width) * 100;
      const yPct = ((e.clientY - rect.top) / rect.height) * 100;
      el.style.setProperty("--mouse-x", `${xPct.toFixed(2)}%`);
      el.style.setProperty("--mouse-y", `${yPct.toFixed(2)}%`);
      el.style.setProperty("--hud-spotlight-opacity", "1");

      if (tiltEnabled && typeof window !== "undefined" && window.matchMedia("(pointer: fine)").matches) {
        const normX = Math.max(-1, Math.min(1, ((e.clientX - rect.left) / rect.width - 0.5) * 2));
        const normY = Math.max(-1, Math.min(1, ((e.clientY - rect.top) / rect.height - 0.5) * 2));
        el.style.setProperty("--tilt-x", `${(-normY * 2.2).toFixed(3)}deg`);
        el.style.setProperty("--tilt-y", `${(normX * 2.2).toFixed(3)}deg`);
      }
    },
    [onMouseMove, tiltEnabled, trackPointer]
  );

  const handleMouseLeave = useCallback(
    (e) => {
      onMouseLeave?.(e);
      const el = containerRef.current;
      if (!el) return;
      el.style.setProperty("--hud-spotlight-opacity", "0");
      el.style.setProperty("--tilt-x", "0deg");
      el.style.setProperty("--tilt-y", "0deg");
    },
    [onMouseLeave]
  );

  const rootStyle = tiltEnabled
    ? {
        transform:
          "perspective(900px) rotateX(var(--tilt-x, 0deg)) rotateY(var(--tilt-y, 0deg))",
        ...style,
      }
    : style;

  return (
    <div
      ref={containerRef}
      onMouseMove={trackPointer || onMouseMove ? handleMouseMove : undefined}
      onMouseLeave={trackPointer || onMouseLeave ? handleMouseLeave : undefined}
      className={cn(
        "relative group/hud",
        tiltEnabled && "transition-transform duration-200 ease-out will-change-transform",
        className
      )}
      style={rootStyle}
      {...props}
    >
      {/* Inner visual & chamfered surface layer — kept separate so outer focus rings are never clipped */}
      <div
        aria-hidden="true"
        className={cn(
          "pointer-events-none absolute inset-0 overflow-hidden hud-frame transition-colors duration-200",
          chamferClass,
          palette.borderHover
        )}
      >
        {spotlight && (
          <div
            className="absolute inset-0 transition-opacity duration-300"
            style={{
              opacity: "var(--hud-spotlight-opacity, 0)",
              background: `radial-gradient(360px circle at var(--mouse-x, 50%) var(--mouse-y, 50%), ${palette.glow}, transparent 68%)`,
            }}
          />
        )}
        {tiltEnabled && (
          <div
            className="absolute inset-0 transition-opacity duration-300"
            style={{
              opacity: "var(--hud-spotlight-opacity, 0)",
              background:
                "radial-gradient(280px circle at var(--mouse-x, 50%) var(--mouse-y, 50%), rgba(224, 247, 255, 0.11), transparent 62%)",
            }}
          />
        )}
        {beamEnabled && (
          <div
            className="pointer-events-none absolute inset-0 hud-border-beam"
            style={{
              "--hud-beam-color": palette.beamStart,
              "--hud-beam-color-end": palette.beamEnd,
            }}
          />
        )}
      </div>

      {/* Subtle corner HUD brackets */}
      <span
        aria-hidden="true"
        className={cn("pointer-events-none absolute top-0 left-0 w-2.5 h-2.5 border-t border-l", palette.bracket)}
      />
      <span
        aria-hidden="true"
        className={cn("pointer-events-none absolute top-0 right-0 w-2.5 h-2.5 border-t border-r", palette.bracket)}
      />
      <span
        aria-hidden="true"
        className={cn("pointer-events-none absolute bottom-0 left-0 w-2.5 h-2.5 border-b border-l", palette.bracket)}
      />
      <span
        aria-hidden="true"
        className={cn("pointer-events-none absolute bottom-0 right-0 w-2.5 h-2.5 border-b border-r", palette.bracket)}
      />

      {/* Content layer */}
      <div className={cn("relative z-10", paddingClass)}>
        {(header || statusDot) && (
          <div className="flex items-center justify-between gap-2 mb-3 pb-2 border-b border-[var(--color-border-subtle)]">
            <div className="flex items-center gap-2 min-w-0">
              {statusDot && (
                <span
                  aria-hidden="true"
                  className={cn("inline-block w-2 h-2 rounded-full shrink-0", palette.dot)}
                />
              )}
              {typeof header === "string" ? (
                <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--color-text-muted)] truncate">
                  {header}
                </span>
              ) : (
                header
              )}
            </div>
          </div>
        )}
        {children}
      </div>
    </div>
  );
}

export default HudFrame;
