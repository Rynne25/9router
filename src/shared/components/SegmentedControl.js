"use client";

import { cn } from "@/shared/utils/cn";
import { playHudSound } from "@/shared/utils/hudAudio";

export default function SegmentedControl({
  options = [],
  value,
  onChange,
  size = "md",
  className,
}) {
  const sizes = {
    sm: "h-7 text-xs",
    md: "h-9 text-sm",
    lg: "h-11 text-base",
  };

  return (
    <div
      className={cn(
        "inline-flex items-center p-1 rounded-[10px] overflow-x-auto",
        "bg-surface-2 border border-border-subtle",
        className
      )}
    >
      {options.map((option) => {
        const active = value === option.value;
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => {
              if (!active) playHudSound("toggle");
              onChange(option.value);
            }}
            className={cn(
              "shrink-0 px-4 rounded-[8px] font-medium transition-all border inline-flex items-center justify-center",
              sizes[size] || sizes.md,
              active
                ? "bg-surface text-cyan-700 dark:text-cyan-300 border-cyan-500/35 shadow-[0_0_12px_-4px_rgba(6,182,212,0.35)]"
                : "border-transparent text-text-muted hover:text-text-main hover:bg-surface/40"
            )}
          >
            {option.icon && (
              <span className="material-symbols-outlined text-[16px] mr-1.5">
                {option.icon}
              </span>
            )}
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
