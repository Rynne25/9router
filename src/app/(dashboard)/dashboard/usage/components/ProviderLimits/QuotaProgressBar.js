"use client";

import { cn } from "@/shared/utils/cn";
import { formatResetTime } from "./utils";

// Calculate color based on remaining percentage
const getColorClasses = (remainingPercentage) => {
  if (remainingPercentage > 70) {
    return {
      text: "text-emerald-600 dark:text-emerald-400",
      dot: "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]",
      fill: "bg-gradient-to-r from-emerald-500 to-teal-400 shadow-[0_0_12px_rgba(16,185,129,0.45)]",
      emoji: "🟢"
    };
  }
  
  if (remainingPercentage >= 30) {
    return {
      text: "text-amber-600 dark:text-amber-400",
      dot: "bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.5)]",
      fill: "bg-gradient-to-r from-amber-500 to-yellow-400 shadow-[0_0_12px_rgba(245,158,11,0.45)]",
      emoji: "🟡"
    };
  }
  
  // 0-29% including 0% (out of quota) - show red
  return {
    text: "text-red-600 dark:text-red-400",
    dot: "bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]",
    fill: "bg-gradient-to-r from-red-500 to-rose-400 shadow-[0_0_12px_rgba(239,68,68,0.45)]",
    emoji: "🔴"
  };
};

// Format reset time display
const formatResetTimeDisplay = (resetTime) => {
  if (!resetTime) return null;
  
  try {
    const resetDate = new Date(resetTime);
    const now = new Date();
    const isToday = resetDate.toDateString() === now.toDateString();
    const isTomorrow = resetDate.toDateString() === new Date(now.getTime() + 86400000).toDateString();
    
    const timeStr = resetDate.toLocaleTimeString(undefined, {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
    
    if (isToday) return `Today, ${timeStr}`;
    if (isTomorrow) return `Tomorrow, ${timeStr}`;
    
    return resetDate.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
  } catch {
    return null;
  }
};

export default function QuotaProgressBar({
  percentage = 0,
  label = "",
  used = 0,
  total = 0,
  unlimited = false,
  resetTime = null,
  recurring = true,
}) {
  const colors = getColorClasses(percentage);
  const countdown = formatResetTime(resetTime);
  const resetDisplay = formatResetTimeDisplay(resetTime);

  const resetWord = recurring ? "Reset" : "Expires";
  const remaining = percentage;
  
  return (
    <div className="space-y-1.5">
      {/* Label and percentage */}
      <div className="flex items-center justify-between gap-2 text-xs">
        <div className="flex min-w-0 items-center gap-1.5">
          <span className={cn("size-2 rounded-full shrink-0", colors.dot)} />
          <span className="font-semibold text-text-primary truncate" title={label}>
            {label}
          </span>
        </div>
        <span className={cn("font-bold tabular-nums shrink-0", colors.text)}>
          {unlimited ? "Unlimited" : `${remaining}%`}
        </span>
      </div>

      {/* Liquid Glass Progress tube */}
      {!unlimited && (
        <div className="liquid-glass-tube h-2 rounded-full overflow-hidden">
          <div
            className={cn("liquid-glass-fill h-full transition-all duration-300", colors.fill)}
            style={{ width: `${Math.min(remaining, 100)}%` }}
          />
        </div>
      )}

      {/* Usage details and countdown */}
      <div className="flex items-center justify-between gap-2 text-[11px] text-text-muted">
        <span className="tabular-nums truncate">
          {used.toLocaleString()} / {total.toLocaleString()}
        </span>
        {countdown !== "-" && (
          <span
            className="font-medium tabular-nums shrink-0"
            title={resetDisplay ? `${resetWord} at ${resetDisplay}` : undefined}
          >
            {resetWord} in {countdown}
          </span>
        )}
      </div>
    </div>
  );
}
