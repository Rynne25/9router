"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import { useHudPrefs } from "@/shared/hooks/useHudPrefs";

const TARGET_SELECTOR = 'button, a, [role="switch"], summary, [data-cursor-target]';
const IDLE_TIMEOUT_MS = 1200;

function subscribeFinePointer(callback) {
  if (typeof window === "undefined" || !window.matchMedia) return () => {};
  const mq = window.matchMedia("(pointer: fine)");
  mq.addEventListener("change", callback);
  return () => mq.removeEventListener("change", callback);
}

function getFinePointerSnapshot() {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(pointer: fine)").matches;
}

function getFalseSnapshot() {
  return false;
}

function isInteractiveTarget(el) {
  if (!el || !el.isConnected) return false;
  if (el.disabled) return false;
  if (el.getAttribute("aria-disabled") === "true") return false;
  return true;
}

function drawRoundedRectPath(ctx, x, y, width, height, radius) {
  const r = Math.max(0, Math.min(radius, width / 2, height / 2));
  if (typeof ctx.roundRect === "function") {
    ctx.roundRect(x, y, width, height, r);
    return;
  }
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r);
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

export function CursorEngine() {
  const { cursorPreset, motionPaused } = useHudPrefs();
  const isFinePointer = useSyncExternalStore(
    subscribeFinePointer,
    getFinePointerSnapshot,
    getFalseSnapshot
  );

  const canvasRef = useRef(null);
  const tlRef = useRef(null);
  const trRef = useRef(null);
  const blRef = useRef(null);
  const brRef = useRef(null);
  const dotRef = useRef(null);

  const active = cursorPreset !== "off" && !motionPaused && isFinePointer;

  useEffect(() => {
    if (!active) return;

    let disposed = false;
    let rafId = null;
    let lastActivity = performance.now();
    let lastFrame = lastActivity;

    let pointerVisible = false;
    let pointerX = 0;
    let pointerY = 0;
    let prevPointerX = 0;
    let prevPointerY = 0;
    let isPressed = false;
    let hoveredTarget = null;

    // Reticle state
    let dotX = 0;
    let dotY = 0;
    let boxL = 0;
    let boxT = 0;
    let boxR = 0;
    let boxB = 0;

    // Magnetic state
    let magX = 0;
    let magY = 0;
    let magW = 34;
    let magH = 34;
    let magRadius = 17;
    const clickPulses = [];

    // Fluid state
    const trail = [];
    const particles = [];
    const ripples = [];

    const canvas = canvasRef.current;
    const ctx = canvas && cursorPreset !== "reticle" ? canvas.getContext("2d") : null;
    let dpr = 1;

    const resizeCanvas = () => {
      if (!canvas || !ctx) return;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.max(1, Math.floor(window.innerWidth * dpr));
      const h = Math.max(1, Math.floor(window.innerHeight * dpr));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    if (cursorPreset !== "reticle") {
      resizeCanvas();
    }

    const setReticleOpacity = (val) => {
      const opacity = String(val);
      if (tlRef.current) tlRef.current.style.opacity = opacity;
      if (trRef.current) trRef.current.style.opacity = opacity;
      if (blRef.current) blRef.current.style.opacity = opacity;
      if (brRef.current) brRef.current.style.opacity = opacity;
      if (dotRef.current) dotRef.current.style.opacity = opacity;
    };

    const spawnFluidParticles = (x, y, vx, vy, count, isBurst = false) => {
      const colors = ["#22d3ee", "#38bdf8", "#818cf8"];
      for (let i = 0; i < count; i++) {
        if (particles.length >= 96) particles.shift();
        const angle = isBurst
          ? (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.35
          : Math.random() * Math.PI * 2;
        const speedScale = isBurst ? 75 + Math.random() * 110 : 12 + Math.random() * 32;
        particles.push({
          x,
          y,
          vx: vx * 0.16 + Math.cos(angle) * speedScale,
          vy: vy * 0.16 + Math.sin(angle) * speedScale,
          radius: isBurst ? 4 + Math.random() * 6 : 6 + Math.random() * 10,
          maxRadius: isBurst ? 18 + Math.random() * 16 : 22 + Math.random() * 20,
          life: 0,
          maxLife: isBurst ? 0.55 + Math.random() * 0.25 : 0.45 + Math.random() * 0.35,
          color: colors[i % colors.length],
        });
      }
    };

    const stopLoop = () => {
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
    };

    const tickReticle = (dt) => {
      if (!pointerVisible) {
        setReticleOpacity(0);
        return;
      }

      const dotFactor = 1 - Math.exp(-32 * dt);
      const boxFactor = 1 - Math.exp(-18 * dt);

      dotX += (pointerX - dotX) * dotFactor;
      dotY += (pointerY - dotY) * dotFactor;

      let tL;
      let tT;
      let tR;
      let tB;

      if (isInteractiveTarget(hoveredTarget)) {
        const rect = hoveredTarget.getBoundingClientRect();
        const pad = isPressed ? 1 : 3;
        tL = rect.left - pad;
        tT = rect.top - pad;
        tR = rect.right + pad;
        tB = rect.bottom + pad;
      } else {
        hoveredTarget = null;
        const half = isPressed ? 8 : 11;
        tL = pointerX - half;
        tT = pointerY - half;
        tR = pointerX + half;
        tB = pointerY + half;
      }

      boxL += (tL - boxL) * boxFactor;
      boxT += (tT - boxT) * boxFactor;
      boxR += (tR - boxR) * boxFactor;
      boxB += (tB - boxB) * boxFactor;

      const bracketSize = 10;
      if (tlRef.current) {
        tlRef.current.style.transform = `translate3d(${boxL.toFixed(2)}px, ${boxT.toFixed(2)}px, 0)`;
      }
      if (trRef.current) {
        trRef.current.style.transform = `translate3d(${(boxR - bracketSize).toFixed(2)}px, ${boxT.toFixed(2)}px, 0)`;
      }
      if (blRef.current) {
        blRef.current.style.transform = `translate3d(${boxL.toFixed(2)}px, ${(boxB - bracketSize).toFixed(2)}px, 0)`;
      }
      if (brRef.current) {
        brRef.current.style.transform = `translate3d(${(boxR - bracketSize).toFixed(2)}px, ${(boxB - bracketSize).toFixed(2)}px, 0)`;
      }
      if (dotRef.current) {
        dotRef.current.style.transform = `translate3d(${(dotX - 2).toFixed(2)}px, ${(dotY - 2).toFixed(2)}px, 0)`;
      }
      setReticleOpacity(1);
    };

    const tickFluid = (now, dt) => {
      if (!ctx || !canvas) return;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      ctx.clearRect(0, 0, vw, vh);

      const isDarkMode = document.documentElement.classList.contains("dark");
      ctx.save();
      ctx.globalCompositeOperation = isDarkMode ? "lighter" : "source-over";

      // Prune stale trail nodes (> 340ms)
      while (trail.length > 0 && now - trail[0].t > 340) {
        trail.shift();
      }

      // Draw luminous velocity ribbon
      if (trail.length > 1) {
        for (let i = 1; i < trail.length; i++) {
          const p0 = trail[i - 1];
          const p1 = trail[i];
          const progress = i / trail.length;
          const ageAlpha = Math.max(0, 1 - (now - p1.t) / 340);
          const alpha = progress * ageAlpha * (isDarkMode ? 0.55 : 0.42);
          if (alpha <= 0.01) continue;

          const grad = ctx.createLinearGradient(p0.x, p0.y, p1.x, p1.y);
          grad.addColorStop(0, `rgba(34, 211, 238, ${alpha})`);
          grad.addColorStop(0.5, `rgba(56, 189, 248, ${alpha})`);
          grad.addColorStop(1, `rgba(129, 140, 248, ${alpha})`);

          ctx.strokeStyle = grad;
          ctx.lineCap = "round";
          ctx.lineWidth = Math.max(2, Math.min(18, (4 + p1.speed * 0.018) * progress));
          ctx.beginPath();
          ctx.moveTo(p0.x, p0.y);
          ctx.lineTo(p1.x, p1.y);
          ctx.stroke();
        }
      }

      // Draw smoke particles
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.life += dt;
        if (p.life >= p.maxLife) {
          particles.splice(i, 1);
          continue;
        }
        const t = p.life / p.maxLife;
        p.vx *= Math.exp(-2.8 * dt);
        p.vy *= Math.exp(-2.8 * dt);
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        const r = p.radius + (p.maxRadius - p.radius) * t;
        const alpha = (1 - t) * (1 - t) * (isDarkMode ? 0.24 : 0.18);

        const rg = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
        rg.addColorStop(0, `${p.color}${Math.round(alpha * 255).toString(16).padStart(2, "0")}`);
        rg.addColorStop(0.55, `${p.color}${Math.round(alpha * 0.45 * 255).toString(16).padStart(2, "0")}`);
        rg.addColorStop(1, `${p.color}00`);
        ctx.fillStyle = rg;
        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        ctx.fill();
      }

      // Draw click burst ripples
      for (let i = ripples.length - 1; i >= 0; i--) {
        const rp = ripples[i];
        rp.life += dt;
        if (rp.life >= rp.maxLife) {
          ripples.splice(i, 1);
          continue;
        }
        const t = rp.life / rp.maxLife;
        const radius = 8 + t * 54;
        const alpha = (1 - t) * (isDarkMode ? 0.72 : 0.55);

        const rg = ctx.createRadialGradient(rp.x, rp.y, radius * 0.35, rp.x, rp.y, radius);
        rg.addColorStop(0, "rgba(34, 211, 238, 0)");
        rg.addColorStop(0.7, `rgba(56, 189, 248, ${alpha * 0.45})`);
        rg.addColorStop(1, `rgba(129, 140, 248, 0)`);
        ctx.fillStyle = rg;
        ctx.beginPath();
        ctx.arc(rp.x, rp.y, radius, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = `rgba(34, 211, 238, ${alpha})`;
        ctx.lineWidth = 1.6 * (1 - t * 0.5);
        ctx.beginPath();
        ctx.arc(rp.x, rp.y, radius, 0, Math.PI * 2);
        ctx.stroke();
      }

      // Crisp core glow at pointer
      if (pointerVisible) {
        const coreGrad = ctx.createRadialGradient(pointerX, pointerY, 0, pointerX, pointerY, 14);
        coreGrad.addColorStop(0, "rgba(34, 211, 238, 0.75)");
        coreGrad.addColorStop(0.45, "rgba(56, 189, 248, 0.25)");
        coreGrad.addColorStop(1, "rgba(129, 140, 248, 0)");
        ctx.fillStyle = coreGrad;
        ctx.beginPath();
        ctx.arc(pointerX, pointerY, 14, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.restore();
    };

    const tickMagnetic = (dt) => {
      if (!ctx || !canvas) return;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      ctx.clearRect(0, 0, vw, vh);

      if (!pointerVisible && clickPulses.length === 0) return;

      const dotFactor = 1 - Math.exp(-30 * dt);
      const haloFactor = 1 - Math.exp(-15 * dt);

      dotX += (pointerX - dotX) * dotFactor;
      dotY += (pointerY - dotY) * dotFactor;

      let targetX = pointerX;
      let targetY = pointerY;
      let targetW = isPressed ? 24 : 34;
      let targetH = isPressed ? 24 : 34;
      let targetRadius = targetW / 2;
      let locked = false;

      if (isInteractiveTarget(hoveredTarget)) {
        const rect = hoveredTarget.getBoundingClientRect();
        const pad = isPressed ? 4 : 10;
        targetX = rect.left + rect.width / 2;
        targetY = rect.top + rect.height / 2;
        targetW = rect.width + pad;
        targetH = rect.height + pad;
        targetRadius = Math.min(12, Math.min(targetW, targetH) / 2);
        locked = true;
      } else {
        hoveredTarget = null;
      }

      magX += (targetX - magX) * haloFactor;
      magY += (targetY - magY) * haloFactor;
      magW += (targetW - magW) * haloFactor;
      magH += (targetH - magH) * haloFactor;
      magRadius += (targetRadius - magRadius) * haloFactor;

      if (pointerVisible) {
        const isDarkMode = document.documentElement.classList.contains("dark");
        const x = magX - magW / 2;
        const y = magY - magH / 2;

        ctx.save();
        ctx.beginPath();
        drawRoundedRectPath(ctx, x, y, magW, magH, magRadius);
        ctx.fillStyle = locked
          ? isDarkMode
            ? "rgba(34, 211, 238, 0.11)"
            : "rgba(2, 132, 199, 0.08)"
          : isDarkMode
            ? "rgba(34, 211, 238, 0.06)"
            : "rgba(2, 132, 199, 0.05)";
        ctx.fill();

        ctx.shadowColor = "rgba(34, 211, 238, 0.45)";
        ctx.shadowBlur = locked ? 14 : 10;
        ctx.strokeStyle = locked
          ? isDarkMode
            ? "rgba(34, 211, 238, 0.8)"
            : "rgba(2, 132, 199, 0.72)"
          : isDarkMode
            ? "rgba(34, 211, 238, 0.55)"
            : "rgba(2, 132, 199, 0.48)";
        ctx.lineWidth = locked ? 1.5 : 1.25;
        ctx.stroke();
        ctx.restore();

        // Crisp spring-tracked center dot
        ctx.save();
        ctx.beginPath();
        ctx.arc(dotX, dotY, isPressed ? 2 : 2.6, 0, Math.PI * 2);
        ctx.fillStyle = isDarkMode ? "rgba(103, 232, 249, 0.95)" : "rgba(2, 132, 199, 0.92)";
        ctx.shadowColor = "rgba(34, 211, 238, 0.75)";
        ctx.shadowBlur = 8;
        ctx.fill();
        ctx.restore();
      }

      // Click pulse rings
      for (let i = clickPulses.length - 1; i >= 0; i--) {
        const pulse = clickPulses[i];
        pulse.life += dt;
        if (pulse.life >= pulse.maxLife) {
          clickPulses.splice(i, 1);
          continue;
        }
        const t = pulse.life / pulse.maxLife;
        const r = 10 + t * 34;
        const alpha = (1 - t) * 0.7;
        ctx.save();
        ctx.beginPath();
        ctx.arc(pulse.x, pulse.y, r, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(34, 211, 238, ${alpha})`;
        ctx.lineWidth = 1.6 * (1 - t * 0.5);
        ctx.stroke();
        ctx.restore();
      }
    };

    const tick = (now) => {
      if (disposed) return;
      if (document.visibilityState === "hidden") {
        rafId = null;
        return;
      }

      if (now - lastActivity > IDLE_TIMEOUT_MS) {
        if (cursorPreset !== "reticle" && ctx) {
          ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
          trail.length = 0;
          particles.length = 0;
          ripples.length = 0;
          clickPulses.length = 0;
        }
        rafId = null;
        return;
      }

      const dt = Math.min(0.05, Math.max(0.001, (now - lastFrame) / 1000));
      lastFrame = now;

      if (cursorPreset === "reticle") {
        tickReticle(dt);
      } else if (cursorPreset === "fluid") {
        tickFluid(now, dt);
      } else if (cursorPreset === "magnetic") {
        tickMagnetic(dt);
      }

      rafId = requestAnimationFrame(tick);
    };

    const wakeLoop = () => {
      if (disposed || document.visibilityState === "hidden") return;
      if (rafId === null) {
        lastFrame = performance.now();
        rafId = requestAnimationFrame(tick);
      }
    };

    const handlePointerMove = (e) => {
      if (e.pointerType && e.pointerType !== "mouse" && e.pointerType !== "pen") return;
      const now = performance.now();
      lastActivity = now;

      pointerX = e.clientX;
      pointerY = e.clientY;

      if (!pointerVisible) {
        pointerVisible = true;
        prevPointerX = pointerX;
        prevPointerY = pointerY;
        dotX = pointerX;
        dotY = pointerY;
        boxL = pointerX - 11;
        boxT = pointerY - 11;
        boxR = pointerX + 11;
        boxB = pointerY + 11;
        magX = pointerX;
        magY = pointerY;
      }

      if (cursorPreset === "reticle" || cursorPreset === "magnetic") {
        const rawTarget = e.target instanceof Element ? e.target.closest(TARGET_SELECTOR) : null;
        hoveredTarget = isInteractiveTarget(rawTarget) ? rawTarget : null;
      } else if (cursorPreset === "fluid") {
        const dx = pointerX - prevPointerX;
        const dy = pointerY - prevPointerY;
        const dist = Math.hypot(dx, dy);
        const dtSec = Math.max(0.008, (now - lastFrame) / 1000);
        const vx = dx / dtSec;
        const vy = dy / dtSec;
        const speed = Math.min(1800, dist / dtSec);

        if (trail.length >= 36) trail.shift();
        trail.push({ x: pointerX, y: pointerY, t: now, speed });

        const steps = Math.min(4, Math.max(1, Math.floor(dist / 16)));
        for (let s = 1; s <= steps; s++) {
          const ratio = s / steps;
          const sx = prevPointerX + dx * ratio;
          const sy = prevPointerY + dy * ratio;
          spawnFluidParticles(sx, sy, vx, vy, speed > 320 ? 2 : 1, false);
        }
        prevPointerX = pointerX;
        prevPointerY = pointerY;
      }

      wakeLoop();
    };

    const handlePointerDown = (e) => {
      if (e.pointerType && e.pointerType !== "mouse" && e.pointerType !== "pen") return;
      lastActivity = performance.now();
      isPressed = true;
      pointerX = e.clientX;
      pointerY = e.clientY;

      if (cursorPreset === "fluid") {
        if (ripples.length >= 8) ripples.shift();
        ripples.push({ x: pointerX, y: pointerY, life: 0, maxLife: 0.55 });
        spawnFluidParticles(pointerX, pointerY, 0, 0, 12, true);
      } else if (cursorPreset === "magnetic") {
        if (clickPulses.length >= 6) clickPulses.shift();
        clickPulses.push({ x: pointerX, y: pointerY, life: 0, maxLife: 0.42 });
      }

      wakeLoop();
    };

    const handlePointerUp = () => {
      lastActivity = performance.now();
      isPressed = false;
      wakeLoop();
    };

    const handlePointerLeave = () => {
      pointerVisible = false;
      hoveredTarget = null;
      isPressed = false;
      if (cursorPreset === "reticle") {
        setReticleOpacity(0);
      }
    };

    const handleScroll = () => {
      if (!hoveredTarget && !pointerVisible) return;
      lastActivity = performance.now();
      wakeLoop();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        stopLoop();
      } else if (performance.now() - lastActivity <= IDLE_TIMEOUT_MS) {
        wakeLoop();
      }
    };

    window.addEventListener("pointermove", handlePointerMove, { passive: true });
    window.addEventListener("pointerdown", handlePointerDown, { passive: true });
    window.addEventListener("pointerup", handlePointerUp, { passive: true });
    document.documentElement.addEventListener("pointerleave", handlePointerLeave, { passive: true });
    window.addEventListener("scroll", handleScroll, { passive: true, capture: true });
    window.addEventListener("resize", resizeCanvas, { passive: true });
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      disposed = true;
      stopLoop();
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("pointerup", handlePointerUp);
      document.documentElement.removeEventListener("pointerleave", handlePointerLeave);
      window.removeEventListener("scroll", handleScroll, { capture: true });
      window.removeEventListener("resize", resizeCanvas);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [active, cursorPreset]);

  if (!active) return null;

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-[9999] overflow-hidden"
    >
      {cursorPreset === "reticle" ? (
        <>
          <span
            ref={tlRef}
            className="absolute top-0 left-0 w-2.5 h-2.5 border-t-2 border-l-2 border-cyan-500 dark:border-cyan-400 will-change-transform transition-opacity duration-150"
            style={{ opacity: 0 }}
          />
          <span
            ref={trRef}
            className="absolute top-0 left-0 w-2.5 h-2.5 border-t-2 border-r-2 border-cyan-500 dark:border-cyan-400 will-change-transform transition-opacity duration-150"
            style={{ opacity: 0 }}
          />
          <span
            ref={blRef}
            className="absolute top-0 left-0 w-2.5 h-2.5 border-b-2 border-l-2 border-cyan-500 dark:border-cyan-400 will-change-transform transition-opacity duration-150"
            style={{ opacity: 0 }}
          />
          <span
            ref={brRef}
            className="absolute top-0 left-0 w-2.5 h-2.5 border-b-2 border-r-2 border-cyan-500 dark:border-cyan-400 will-change-transform transition-opacity duration-150"
            style={{ opacity: 0 }}
          />
          <span
            ref={dotRef}
            className="absolute top-0 left-0 w-1 h-1 rounded-full bg-cyan-500 dark:bg-cyan-300 shadow-[0_0_8px_rgba(34,211,238,0.85)] will-change-transform transition-opacity duration-150"
            style={{ opacity: 0 }}
          />
        </>
      ) : (
        <canvas ref={canvasRef} className="w-full h-full block" />
      )}
    </div>
  );
}

export default CursorEngine;
