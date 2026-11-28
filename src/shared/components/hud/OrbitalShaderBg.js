"use client";

import { useEffect, useRef, useState } from "react";
import { useTheme } from "@/shared/hooks/useTheme";
import { useHudPrefs } from "@/shared/hooks/useHudPrefs";

const VERTEX_SHADER_SRC = `#version 300 es
in vec2 a_position;
out vec2 v_uv;
void main() {
  v_uv = a_position * 0.5 + 0.5;
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

const FRAGMENT_SHADER_SRC = `#version 300 es
precision highp float;

in vec2 v_uv;
out vec4 outColor;

uniform float u_time;
uniform vec2 u_resolution;
uniform float u_dark;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash(i + vec2(0.0, 0.0)), hash(i + vec2(1.0, 0.0)), u.x),
    mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
    u.y
  );
}

void main() {
  vec2 uv = v_uv;
  float aspect = u_resolution.x / max(u_resolution.y, 1.0);
  vec2 centered = (uv - vec2(0.56, 0.42)) * vec2(aspect, 1.0);
  float dist = length(centered);

  // Subtle deep-space noise flow
  float flow = noise(centered * 2.4 + vec2(u_time * 0.035, -u_time * 0.025));
  float flow2 = noise(centered * 4.8 - vec2(u_time * 0.02, u_time * 0.03));
  float field = mix(flow, flow2, 0.45);

  // Soft ambient corner glows (no center distraction)
  float cornerTopGlow = exp(-length((uv - vec2(0.18, 0.85)) * vec2(aspect, 1.0)) * 2.2);
  float cornerBottomGlow = exp(-length((uv - vec2(0.88, 0.14)) * vec2(aspect, 1.0)) * 2.4);

  vec3 baseDark = vec3(0.0196, 0.0314, 0.0667);   // #050811
  vec3 altDark = vec3(0.0353, 0.0588, 0.1176);    // #090F1E
  vec3 cyanGlow = vec3(0.0235, 0.7137, 0.8314);   // #06B6D4
  vec3 skyAccent = vec3(0.1333, 0.8275, 0.9333);  // #22D3EE

  vec3 baseLight = vec3(0.9490, 0.9647, 0.9882);  // #F2F6FC
  vec3 altLight = vec3(0.9020, 0.9333, 0.9765);   // #E6EEF9
  vec3 blueLight = vec3(0.0078, 0.5176, 0.7804);  // #0284C7

  vec3 darkColor = mix(baseDark, altDark, field * 0.65 + (1.0 - uv.y) * 0.35);
  darkColor += cyanGlow * (0.03 * exp(-dist * 1.9) + cornerTopGlow * 0.035);
  darkColor += skyAccent * (cornerBottomGlow * 0.025);

  vec3 lightColor = mix(baseLight, altLight, field * 0.5 + uv.y * 0.35);
  lightColor = mix(lightColor, blueLight, 0.025 * exp(-dist * 1.8) + cornerTopGlow * 0.025);
  lightColor = mix(lightColor, blueLight, cornerBottomGlow * 0.02);

  vec3 finalColor = mix(lightColor, darkColor, u_dark);
  outColor = vec4(finalColor, 1.0);
}
`;

function compileShader(gl, type, source) {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

export default function OrbitalShaderBg() {
  const canvasRef = useRef(null);
  const { isDark } = useTheme();
  const { motionPaused } = useHudPrefs();
  const [webglFailed, setWebglFailed] = useState(false);

  const isDarkRef = useRef(isDark);
  const motionPausedRef = useRef(motionPaused);

  useEffect(() => {
    isDarkRef.current = isDark;
  }, [isDark]);

  useEffect(() => {
    motionPausedRef.current = motionPaused;
  }, [motionPaused]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let gl = null;
    try {
      gl = canvas.getContext("webgl2", {
        alpha: false,
        antialias: false,
        depth: false,
        stencil: false,
        powerPreference: "low-power",
      });
    } catch {
      gl = null;
    }

    if (!gl) {
      queueMicrotask(() => setWebglFailed(true));
      return;
    }

    const vs = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER_SRC);
    const fs = compileShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER_SRC);
    if (!vs || !fs) {
      if (vs) gl.deleteShader(vs);
      if (fs) gl.deleteShader(fs);
      queueMicrotask(() => setWebglFailed(true));
      return;
    }

    const program = gl.createProgram();
    if (!program) {
      gl.deleteShader(vs);
      gl.deleteShader(fs);
      queueMicrotask(() => setWebglFailed(true));
      return;
    }

    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      gl.deleteProgram(program);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
      queueMicrotask(() => setWebglFailed(true));
      return;
    }

    const posLocation = gl.getAttribLocation(program, "a_position");
    const uTimeLoc = gl.getUniformLocation(program, "u_time");
    const uResLoc = gl.getUniformLocation(program, "u_resolution");
    const uDarkLoc = gl.getUniformLocation(program, "u_dark");

    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
      gl.STATIC_DRAW
    );

    gl.useProgram(program);
    gl.enableVertexAttribArray(posLocation);
    gl.vertexAttribPointer(posLocation, 2, gl.FLOAT, false, 0, 0);

    const FRAME_INTERVAL_MS = 66;
    let rafId = null;
    let disposed = false;
    let accumulatedTime = 0;
    let lastTimestamp = performance.now();
    let lastDrawTime = 0;

    const resize = () => {
      if (disposed) return;
      // 0.5x CSS resolution preserves smooth ambient gradients while cutting GPU fragment & blur cost
      const width = Math.max(1, Math.floor(window.innerWidth * 0.5));
      const height = Math.max(1, Math.floor(window.innerHeight * 0.5));
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
        gl.viewport(0, 0, width, height);
      }
    };

    const drawFrame = () => {
      if (disposed || gl.isContextLost()) return;
      gl.useProgram(program);
      gl.uniform1f(uTimeLoc, accumulatedTime);
      gl.uniform2f(uResLoc, canvas.width, canvas.height);
      gl.uniform1f(uDarkLoc, isDarkRef.current ? 1.0 : 0.0);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    };

    const stopLoop = () => {
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
    };

    const tick = (now) => {
      if (disposed) return;
      if (document.hidden || motionPausedRef.current) {
        rafId = null;
        return;
      }
      if (now - lastDrawTime >= FRAME_INTERVAL_MS) {
        const dt = Math.min(0.15, Math.max(0, (now - lastTimestamp) / 1000));
        lastTimestamp = now;
        lastDrawTime = now;
        accumulatedTime += dt;
        drawFrame();
      }
      rafId = requestAnimationFrame(tick);
    };

    const syncLoop = () => {
      if (disposed) return;
      drawFrame();
      if (!document.hidden && !motionPausedRef.current) {
        if (rafId === null) {
          lastTimestamp = performance.now();
          rafId = requestAnimationFrame(tick);
        }
      } else {
        stopLoop();
      }
    };

    const handleResize = () => {
      resize();
      drawFrame();
    };

    const handleVisibility = () => {
      syncLoop();
    };

    const handleContextLost = (e) => {
      e.preventDefault();
      stopLoop();
      setWebglFailed(true);
    };

    const handleSyncEvent = () => {
      syncLoop();
    };

    resize();
    syncLoop();

    window.addEventListener("resize", handleResize, { passive: true });
    document.addEventListener("visibilitychange", handleVisibility);
    canvas.addEventListener("webglcontextlost", handleContextLost);
    window.addEventListener("9router-hud-prefs-change", handleSyncEvent);

    // Observe .dark class changes on <html> so single static frame redraws even when motionPaused
    const observer = new MutationObserver(() => {
      drawFrame();
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });

    return () => {
      disposed = true;
      stopLoop();
      observer.disconnect();
      window.removeEventListener("resize", handleResize);
      document.removeEventListener("visibilitychange", handleVisibility);
      canvas.removeEventListener("webglcontextlost", handleContextLost);
      window.removeEventListener("9router-hud-prefs-change", handleSyncEvent);
      gl.deleteBuffer(buffer);
      gl.deleteProgram(program);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
    };
  }, []);

  if (webglFailed) {
    return (
      <div
        aria-hidden="true"
        className="fixed inset-0 pointer-events-none z-0 liquid-aurora-canvas"
      >
        <div className="absolute inset-0 hud-grid-overlay opacity-75" />
      </div>
    );
  }

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="fixed inset-0 w-full h-full pointer-events-none z-0"
    />
  );
}
