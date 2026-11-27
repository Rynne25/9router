"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/shared/utils/cn";
import { useHudPrefs } from "@/shared/hooks/useHudPrefs";

export function NumberTicker({
  value,
  suffix = "",
  prefix = "",
  decimals = 0,
  className = "",
}) {
  const { motionPaused } = useHudPrefs();
  const numericTarget = typeof value === "number" && Number.isFinite(value) ? value : 0;

  const [displayValue, setDisplayValue] = useState(numericTarget);
  const currentRef = useRef(numericTarget);

  useEffect(() => {
    if (motionPaused) {
      currentRef.current = numericTarget;
      queueMicrotask(() => setDisplayValue(numericTarget));
      return;
    }

    const startValue = currentRef.current;
    if (Math.abs(numericTarget - startValue) < 1e-6) {
      currentRef.current = numericTarget;
      queueMicrotask(() => setDisplayValue(numericTarget));
      return;
    }

    const duration = 450;
    const startTime = performance.now();
    let rafId = null;

    const tick = (now) => {
      const elapsed = now - startTime;
      const progress = Math.min(1, elapsed / duration);
      // Cubic ease-out
      const eased = 1 - Math.pow(1 - progress, 3);
      const next = startValue + (numericTarget - startValue) * eased;
      currentRef.current = next;
      setDisplayValue(next);

      if (progress < 1) {
        rafId = requestAnimationFrame(tick);
      } else {
        currentRef.current = numericTarget;
        setDisplayValue(numericTarget);
      }
    };

    rafId = requestAnimationFrame(tick);
    return () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
  }, [numericTarget, motionPaused]);

  const formatted =
    decimals > 0
      ? displayValue.toLocaleString(undefined, {
          minimumFractionDigits: decimals,
          maximumFractionDigits: decimals,
        })
      : Math.round(displayValue).toLocaleString();

  return (
    <span className={cn("hud-telemetry-num inline-flex items-baseline", className)}>
      {prefix && <span>{prefix}</span>}
      <span>{formatted}</span>
      {suffix && <span>{suffix}</span>}
    </span>
  );
}

export default NumberTicker;
