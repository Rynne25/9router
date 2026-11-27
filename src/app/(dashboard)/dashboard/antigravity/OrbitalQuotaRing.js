"use client";

import { useId } from "react";
import { NumberTicker } from "@/shared/components/hud";
import { useHudPrefs } from "@/shared/hooks/useHudPrefs";
import { cn } from "@/shared/utils/cn";

function getQuotaTone(percentage, isBlocked) {
  if (isBlocked) {
    return {
      stroke: "#F43F5E",
      glow: "rgba(244, 63, 94, 0.45)",
      text: "text-rose-600 dark:text-rose-400",
      badge: "border-rose-500/30 bg-rose-500/10 text-rose-600 dark:text-rose-400",
    };
  }
  if (percentage === null || percentage === undefined) {
    return {
      stroke: "#06B6D4",
      glow: "rgba(6, 182, 212, 0.35)",
      text: "text-text-muted",
      badge: "border-cyan-500/25 bg-cyan-500/10 text-cyan-600 dark:text-cyan-400",
    };
  }
  if (percentage > 70) {
    return {
      stroke: "#10B981",
      glow: "rgba(16, 185, 129, 0.45)",
      text: "text-emerald-600 dark:text-emerald-400",
      badge: "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    };
  }
  if (percentage >= 30) {
    return {
      stroke: "#F59E0B",
      glow: "rgba(245, 158, 11, 0.45)",
      text: "text-amber-600 dark:text-amber-400",
      badge: "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400",
    };
  }
  return {
    stroke: "#F43F5E",
    glow: "rgba(244, 63, 94, 0.45)",
    text: "text-rose-600 dark:text-rose-400",
    badge: "border-rose-500/30 bg-rose-500/10 text-rose-600 dark:text-rose-400",
  };
}

export default function OrbitalQuotaRing({
  percentage = null,
  size = 64,
  strokeWidth = 5,
  label = "",
  isLoading = false,
  isBlocked = false,
  className = "",
}) {
  const { motionPaused } = useHudPrefs();
  const filterId = useId();

  const hasValue = typeof percentage === "number" && Number.isFinite(percentage);
  const clamped = hasValue ? Math.max(0, Math.min(100, Math.round(percentage))) : 0;
  const tone = getQuotaTone(hasValue ? clamped : null, isBlocked);

  const center = size / 2;
  const radius = Math.max(8, center - strokeWidth - 3);
  const circumference = 2 * Math.PI * radius;
  const dashOffset = hasValue
    ? circumference - (clamped / 100) * circumference
    : circumference * 0.72;

  return (
    <div className={cn("inline-flex flex-col items-center gap-1 shrink-0", className)}>
      <div
        className="relative inline-flex items-center justify-center"
        style={{ width: size, height: size }}
      >
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          className="-rotate-90 overflow-visible"
          aria-hidden="true"
        >
          <defs>
            <filter id={filterId} x="-25%" y="-25%" width="150%" height="150%">
              <feDropShadow dx="0" dy="0" stdDeviation="2.5" floodColor={tone.glow} />
            </filter>
          </defs>

          {/* Outer subtle orbital telemetry track */}
          <circle
            cx={center}
            cy={center}
            r={radius + strokeWidth * 0.65}
            fill="none"
            stroke="currentColor"
            strokeWidth={1}
            strokeDasharray="2 4"
            className="text-cyan-500/25 dark:text-cyan-400/20"
          />

          {/* Base ring */}
          <circle
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            stroke="currentColor"
            strokeWidth={strokeWidth}
            className="text-black/[0.08] dark:text-white/[0.08]"
          />

          {/* Active quota arc */}
          <circle
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            stroke={tone.stroke}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={isBlocked ? circumference * 0.85 : dashOffset}
            filter={!motionPaused && (hasValue || isBlocked) ? `url(#${filterId})` : undefined}
            className={cn(
              !motionPaused && "transition-[stroke-dashoffset,stroke] duration-700 ease-out",
              isLoading && !hasValue && !motionPaused && "animate-pulse"
            )}
          />
        </svg>

        <div className="absolute inset-0 flex items-center justify-center">
          {isBlocked ? (
            <span className="font-mono text-[11px] font-bold tracking-tight text-rose-600 dark:text-rose-400 hud-telemetry-num">
              403
            </span>
          ) : hasValue ? (
            <span
              className={cn(
                "font-mono font-bold tracking-tight hud-telemetry-num",
                size >= 68 ? "text-sm" : size >= 52 ? "text-xs" : "text-[10px]",
                tone.text
              )}
            >
              <NumberTicker value={clamped} suffix="%" />
            </span>
          ) : (
            <span className="font-mono text-[11px] font-semibold text-text-muted hud-telemetry-num">
              {isLoading ? "..." : "--"}
            </span>
          )}
        </div>
      </div>

      {label ? (
        <span className="text-[10px] font-mono uppercase tracking-wider text-text-muted">
          {label}
        </span>
      ) : null}
    </div>
  );
}
