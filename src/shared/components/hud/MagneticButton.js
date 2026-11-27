"use client";

import { useCallback, useEffect, useRef } from "react";
import { useHudPrefs } from "@/shared/hooks/useHudPrefs";
import { cn } from "@/shared/utils/cn";

export function MagneticButton({
  children,
  strength = 5,
  className = "",
  as = "div",
  style,
  onPointerMove,
  onPointerLeave,
  ...props
}) {
  const elRef = useRef(null);
  const { motionPaused } = useHudPrefs();

  useEffect(() => {
    const el = elRef.current;
    if (!el) return;
    if (motionPaused) {
      el.style.transform = "";
    }
  }, [motionPaused]);

  const handlePointerMove = useCallback(
    (e) => {
      onPointerMove?.(e);
      if (motionPaused) return;
      if (typeof window === "undefined") return;
      if (!window.matchMedia("(pointer: fine)").matches) return;
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

      const el = elRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;

      const relX = ((e.clientX - rect.left) / rect.width - 0.5) * 2;
      const relY = ((e.clientY - rect.top) / rect.height - 0.5) * 2;
      const clampedX = Math.max(-1, Math.min(1, relX));
      const clampedY = Math.max(-1, Math.min(1, relY));

      const tx = (clampedX * strength).toFixed(2);
      const ty = (clampedY * strength).toFixed(2);
      el.style.transition = "transform 110ms cubic-bezier(0.22, 1, 0.36, 1)";
      el.style.transform = `translate3d(${tx}px, ${ty}px, 0)`;
    },
    [motionPaused, onPointerMove, strength]
  );

  const handlePointerLeave = useCallback(
    (e) => {
      onPointerLeave?.(e);
      const el = elRef.current;
      if (!el) return;
      el.style.transition = "transform 280ms cubic-bezier(0.22, 1, 0.36, 1)";
      el.style.transform = "translate3d(0px, 0px, 0)";
    },
    [onPointerLeave]
  );

  const Component = as;

  return (
    <Component
      ref={elRef}
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
      className={cn("inline-block will-change-transform", className)}
      style={style}
      {...props}
    >
      {children}
    </Component>
  );
}

export default MagneticButton;
