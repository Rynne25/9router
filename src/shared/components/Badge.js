"use client";

import { cn } from "@/shared/utils/cn";

const variants = {
  default: "bg-surface-2 text-text-muted border border-border-subtle",
  primary: "bg-cyan-500/12 text-cyan-700 dark:text-cyan-300 border border-cyan-500/25",
  success: "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300 border border-emerald-500/25",
  warning: "bg-amber-500/12 text-amber-700 dark:text-amber-300 border border-amber-500/25",
  error: "bg-rose-500/12 text-rose-700 dark:text-rose-300 border border-rose-500/25",
  info: "bg-sky-500/12 text-sky-700 dark:text-sky-300 border border-sky-500/25",
};

const sizes = {
  sm: "px-2 py-0.5 text-[10px]",
  md: "px-2.5 py-1 text-xs",
  lg: "px-3 py-1.5 text-sm",
};

const dotColors = {
  success: "bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.75)]",
  warning: "bg-amber-500 shadow-[0_0_6px_rgba(245,158,11,0.75)]",
  error: "bg-rose-500 shadow-[0_0_6px_rgba(244,63,94,0.75)]",
  info: "bg-sky-500 shadow-[0_0_6px_rgba(56,189,248,0.75)]",
  primary: "bg-cyan-500 shadow-[0_0_6px_rgba(6,182,212,0.75)]",
  default: "bg-slate-400 dark:bg-slate-500",
};

export default function Badge({
  children,
  variant = "default",
  size = "md",
  dot = false,
  icon,
  className,
  ...props
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full font-semibold tracking-tight hud-telemetry-num",
        variants[variant] || variants.default,
        sizes[size] || sizes.md,
        className
      )}
      {...props}
    >
      {dot && (
        <span
          className={cn(
            "size-1.5 rounded-full shrink-0",
            dotColors[variant] || dotColors.default
          )}
          aria-hidden="true"
        />
      )}
      {icon && <span className="material-symbols-outlined text-[14px]">{icon}</span>}
      {children}
    </span>
  );
}
