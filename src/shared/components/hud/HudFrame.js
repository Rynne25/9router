"use client";

import { useCallback, useRef, useState } from "react";
import { cn } from "@/shared/utils/cn";

const ACCENT_MAP = {
  cyan: {
    bracket: "border-cyan-500/50 dark:border-cyan-400/55",
    dot: "bg-cyan-500 dark:bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.65)]",
    glow: "rgba(34, 211, 238, 0.14)",
    borderHover: "group-hover/hud:border-cyan-500/35 dark:group-hover/hud:border-cyan-400/35",
  },
  amber: {
    bracket: "border-amber-500/55 dark:border-amber-400/55",
    dot: "bg-amber-500 dark:bg-amber-400 shadow-[0_0_8px_rgba(245,158,11,0.65)]",
    glow: "rgba(245, 158, 11, 0.14)",
    borderHover: "group-hover/hud:border-amber-500/35 dark:group-hover/hud:border-amber-400/35",
  },
  emerald: {
    bracket: "border-emerald-500/55 dark:border-emerald-400/55",
    dot: "bg-emerald-500 dark:bg-emerald-400 shadow-[0_0_8px_rgba(16,185,129,0.65)]",
    glow: "rgba(16, 185, 129, 0.14)",
    borderHover: "group-hover/hud:border-emerald-500/35 dark:group-hover/hud:border-emerald-400/35",
  },
  rose: {
    bracket: "border-rose-500/55 dark:border-rose-400/55",
    dot: "bg-rose-500 dark:bg-rose-400 shadow-[0_0_8px_rgba(244,63,94,0.65)]",
    glow: "rgba(244, 63, 94, 0.14)",
    borderHover: "group-hover/hud:border-rose-500/35 dark:group-hover/hud:border-rose-400/35",
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
  padding = "md",
  header,
  statusDot,
  className = "",
  ...props
}) {
  const containerRef = useRef(null);
  const [pointer, setPointer] = useState({ x: 50, y: 50, active: false });

  const palette = ACCENT_MAP[accent] || ACCENT_MAP.cyan;
  const chamferClass = CHAMFER_CLASS[chamfer] ?? CHAMFER_CLASS.md;
  const paddingClass = PADDING_MAP[padding] ?? PADDING_MAP.md;

  const handleMouseMove = useCallback(
    (e) => {
      if (!spotlight || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      const x = ((e.clientX - rect.left) / rect.width) * 100;
      const y = ((e.clientY - rect.top) / rect.height) * 100;
      setPointer({ x, y, active: true });
    },
    [spotlight]
  );

  const handleMouseLeave = useCallback(() => {
    if (!spotlight) return;
    setPointer((prev) => (prev.active ? { ...prev, active: false } : prev));
  }, [spotlight]);

  return (
    <div
      ref={containerRef}
      onMouseMove={spotlight ? handleMouseMove : undefined}
      onMouseLeave={spotlight ? handleMouseLeave : undefined}
      className={cn("relative group/hud", className)}
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
              opacity: pointer.active ? 1 : 0,
              background: `radial-gradient(360px circle at ${pointer.x}% ${pointer.y}%, ${palette.glow}, transparent 68%)`,
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
