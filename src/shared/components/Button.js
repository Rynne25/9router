"use client";

import { cn } from "@/shared/utils/cn";
import { playHudSound } from "@/shared/utils/hudAudio";

const variants = {
  primary:
    "bg-cyan-600 hover:bg-cyan-500 dark:bg-cyan-500 dark:hover:bg-cyan-400 text-white dark:text-slate-950 border border-cyan-400/40 shadow-[0_4px_16px_-4px_rgba(6,182,212,0.5)] disabled:bg-surface-3 disabled:text-text-muted disabled:border-transparent disabled:shadow-none",
  secondary:
    "bg-surface-2 hover:bg-surface-3 text-text-main border border-border hover:border-cyan-500/35 disabled:opacity-50",
  outline:
    "border border-border text-text-main hover:bg-cyan-500/10 hover:border-cyan-500/45 hover:text-cyan-700 dark:hover:text-cyan-300",
  ghost: "text-text-muted hover:bg-cyan-500/[0.07] hover:text-text-main",
  danger:
    "bg-rose-600 hover:bg-rose-500 text-white border border-rose-400/35 shadow-[0_4px_14px_-4px_rgba(244,63,94,0.45)] disabled:bg-surface-3 disabled:text-text-muted disabled:border-transparent disabled:shadow-none",
  success:
    "bg-emerald-600 hover:bg-emerald-500 text-white border border-emerald-400/35 shadow-[0_4px_14px_-4px_rgba(16,185,129,0.45)] disabled:bg-surface-3 disabled:text-text-muted disabled:border-transparent disabled:shadow-none",
};

const sizes = {
  xs: "h-6 px-2.5 text-[11px] rounded-md gap-1.5",
  sm: "h-7 px-3 text-xs rounded-lg",
  md: "h-9 px-4 text-sm rounded-lg",
  lg: "h-10 px-5 text-sm rounded-lg",
};

export default function Button({
  children,
  variant = "primary",
  size = "md",
  icon,
  iconRight,
  disabled = false,
  loading = false,
  fullWidth = false,
  className,
  onClick,
  ...props
}) {
  const handleClick = (e) => {
    if (!disabled && !loading) {
      playHudSound(variant === "danger" ? "confirm" : "click");
    }
    onClick?.(e);
  };

  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-2 font-semibold transition-all duration-150 ease-out cursor-pointer",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/50",
        "active:scale-[0.97] disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100",
        variants[variant] || variants.primary,
        sizes[size] || sizes.md,
        fullWidth && "w-full",
        className
      )}
      disabled={disabled || loading}
      onClick={handleClick}
      {...props}
    >
      {loading ? (
        <span
          className={cn(
            "material-symbols-outlined animate-spin",
            size === "xs" ? "text-[14px]" : "text-[18px]"
          )}
        >
          progress_activity
        </span>
      ) : icon ? (
        <span
          className={cn(
            "material-symbols-outlined",
            size === "xs" ? "text-[14px]" : "text-[18px]"
          )}
        >
          {icon}
        </span>
      ) : null}
      {children}
      {iconRight && !loading && (
        <span
          className={cn(
            "material-symbols-outlined",
            size === "xs" ? "text-[14px]" : "text-[18px]"
          )}
        >
          {iconRight}
        </span>
      )}
    </button>
  );
}
