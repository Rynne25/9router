"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/shared/utils/cn";
import { useTheme } from "@/shared/hooks/useTheme";
import { useHudPrefs } from "@/shared/hooks/useHudPrefs";
import { playHudSound } from "@/shared/utils/hudAudio";

const ROUTE_ITEMS = [
  { id: "nav-dashboard", label: "Command Center", hint: "/dashboard", icon: "radar", group: "Navigate", path: "/dashboard" },
  { id: "nav-mitm", label: "MITM Telemetry", hint: "/dashboard/mitm", icon: "security", group: "Navigate", path: "/dashboard/mitm" },
  { id: "nav-quota", label: "Quota Monitor", hint: "/dashboard/quota", icon: "speed", group: "Navigate", path: "/dashboard/quota" },
  { id: "nav-antigravity", label: "Antigravity Fleet", hint: "/dashboard/providers/antigravity", icon: "satellite_alt", group: "Navigate", path: "/dashboard/providers/antigravity" },
  { id: "nav-token-saver", label: "Token Saver", hint: "/dashboard/token-saver", icon: "compress", group: "Navigate", path: "/dashboard/token-saver" },
  { id: "nav-endpoint", label: "API Endpoint", hint: "/dashboard/endpoint", icon: "api", group: "Navigate", path: "/dashboard/endpoint" },
  { id: "nav-providers", label: "Providers", hint: "/dashboard/providers", icon: "dns", group: "Navigate", path: "/dashboard/providers" },
  { id: "nav-combos", label: "Model Combos", hint: "/dashboard/combos", icon: "hub", group: "Navigate", path: "/dashboard/combos" },
  { id: "nav-console", label: "Console Log", hint: "/dashboard/console-log", icon: "terminal", group: "Navigate", path: "/dashboard/console-log" },
  { id: "nav-usage", label: "Usage Analytics", hint: "/dashboard/usage", icon: "monitoring", group: "Navigate", path: "/dashboard/usage" },
  { id: "nav-cli-tools", label: "CLI Tools", hint: "/dashboard/cli-tools", icon: "build", group: "Navigate", path: "/dashboard/cli-tools" },
];

export function CommandPalette() {
  const router = useRouter();
  const dialogRef = useRef(null);
  const inputRef = useRef(null);
  const pointerDownOutsideRef = useRef(false);

  const { isDark, toggleTheme } = useTheme();
  const {
    motionPaused,
    toggleMotionPaused,
    soundEnabled,
    toggleSoundEnabled,
    commandPaletteOpen,
    setCommandPaletteOpen,
    closeCommandPalette,
  } = useHudPrefs();

  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [busyId, setBusyId] = useState(null);
  const [feedback, setFeedback] = useState(null);

  const handleDialogClose = useCallback(() => {
    setQuery("");
    setSelectedIndex(0);
    setFeedback(null);
    closeCommandPalette();
  }, [closeCommandPalette]);

  // Global Ctrl+K / Cmd+K shortcut
  useEffect(() => {
    const handleGlobalKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        playHudSound("click");
        setCommandPaletteOpen((prev) => !prev);
      }
    };
    window.addEventListener("keydown", handleGlobalKeyDown);
    return () => window.removeEventListener("keydown", handleGlobalKeyDown);
  }, [setCommandPaletteOpen]);

  // Sync native <dialog> top-layer state
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (commandPaletteOpen) {
      if (!dialog.open) {
        try {
          dialog.showModal();
        } catch {
          // Ignore if already open or detached
        }
      }
      requestAnimationFrame(() => {
        inputRef.current?.focus();
      });
    } else if (dialog.open) {
      dialog.close();
    }
  }, [commandPaletteOpen]);

  // Progressive outside-bounds backdrop dismissal fallback when closedBy is unsupported
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (typeof HTMLDialogElement !== "undefined" && "closedBy" in HTMLDialogElement.prototype) {
      return;
    }

    const isOutside = (event) => {
      if (event.target !== dialog) return false;
      const rect = dialog.getBoundingClientRect();
      return (
        event.clientX < rect.left ||
        event.clientX > rect.right ||
        event.clientY < rect.top ||
        event.clientY > rect.bottom
      );
    };

    const onPointerDown = (e) => {
      pointerDownOutsideRef.current = isOutside(e);
    };

    const onPointerUp = (e) => {
      if (pointerDownOutsideRef.current && isOutside(e)) {
        closeCommandPalette();
      }
      pointerDownOutsideRef.current = false;
    };

    dialog.addEventListener("pointerdown", onPointerDown);
    dialog.addEventListener("pointerup", onPointerUp);
    return () => {
      dialog.removeEventListener("pointerdown", onPointerDown);
      dialog.removeEventListener("pointerup", onPointerUp);
    };
  }, [closeCommandPalette]);

  const items = useMemo(() => {
    const actionItems = [
      {
        id: "act-mitm-dns",
        label: "Toggle Antigravity MITM DNS",
        hint: "PATCH /api/cli-tools/antigravity-mitm",
        icon: "dns",
        group: "Actions",
        type: "mitm-dns",
      },
      {
        id: "act-ag-warmup",
        label: "Warmup All Antigravity",
        hint: "POST /api/oauth/antigravity/warmup",
        icon: "bolt",
        group: "Actions",
        type: "ag-warmup",
      },
      {
        id: "act-theme",
        label: `Switch Theme (${isDark ? "Light" : "Dark"})`,
        hint: isDark ? "Switch to Tactical Daylight" : "Switch to Deep Orbital",
        icon: isDark ? "light_mode" : "dark_mode",
        group: "Preferences",
        type: "theme",
      },
      {
        id: "act-motion",
        label: motionPaused ? "Resume HUD Motion" : "Pause HUD Motion",
        hint: motionPaused ? "Enable orbital shader & counters" : "Freeze shader & counters",
        icon: motionPaused ? "play_circle" : "pause_circle",
        group: "Preferences",
        type: "motion",
      },
      {
        id: "act-sound",
        label: soundEnabled ? "Mute HUD Sound" : "Enable HUD Sound",
        hint: soundEnabled ? "Disable Web Audio cues" : "Enable subtle Web Audio cues",
        icon: soundEnabled ? "volume_off" : "volume_up",
        group: "Preferences",
        type: "sound",
      },
    ];

    const allItems = [...ROUTE_ITEMS, ...actionItems];
    const q = query.trim().toLowerCase();
    if (!q) return allItems;
    return allItems.filter(
      (item) =>
        item.label.toLowerCase().includes(q) ||
        item.hint.toLowerCase().includes(q) ||
        item.group.toLowerCase().includes(q)
    );
  }, [query, isDark, motionPaused, soundEnabled]);

  const safeSelectedIndex = items.length > 0 ? Math.min(selectedIndex, items.length - 1) : 0;

  const executeItem = useCallback(
    async (item) => {
      if (!item || busyId) return;

      if (item.path) {
        playHudSound("confirm");
        closeCommandPalette();
        router.push(item.path);
        return;
      }

      if (item.type === "theme") {
        playHudSound("toggle");
        toggleTheme();
        closeCommandPalette();
        return;
      }

      if (item.type === "motion") {
        playHudSound("toggle");
        toggleMotionPaused();
        closeCommandPalette();
        return;
      }

      if (item.type === "sound") {
        const willEnable = !soundEnabled;
        toggleSoundEnabled();
        if (willEnable) {
          playHudSound("confirm");
        }
        closeCommandPalette();
        return;
      }

      if (item.type === "mitm-dns") {
        setBusyId(item.id);
        setFeedback(null);
        try {
          const statusRes = await fetch("/api/cli-tools/antigravity-mitm");
          const statusData = await statusRes.json().catch(() => ({}));
          const isCurrentlyEnabled = Boolean(statusData?.dnsStatus?.antigravity);
          const action = isCurrentlyEnabled ? "disable" : "enable";

          const patchRes = await fetch("/api/cli-tools/antigravity-mitm", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ tool: "antigravity", action }),
          });
          const patchData = await patchRes.json().catch(() => ({}));
          if (!patchRes.ok) {
            throw new Error(patchData.error || "Failed to toggle Antigravity MITM DNS");
          }
          playHudSound("confirm");
          setFeedback({
            ok: true,
            text: `Antigravity MITM DNS ${action === "enable" ? "enabled" : "disabled"}.`,
          });
        } catch (err) {
          playHudSound("alert");
          setFeedback({ ok: false, text: err.message || "MITM DNS toggle failed" });
        } finally {
          setBusyId(null);
        }
        return;
      }

      if (item.type === "ag-warmup") {
        setBusyId(item.id);
        setFeedback(null);
        try {
          const res = await fetch("/api/oauth/antigravity/warmup", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ all: true }),
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) {
            throw new Error(data.error || "Antigravity warmup failed");
          }
          playHudSound("confirm");
          setFeedback({
            ok: true,
            text: data.message || `Warmup complete (${data.activatedCount ?? 0} activated).`,
          });
        } catch (err) {
          playHudSound("alert");
          setFeedback({ ok: false, text: err.message || "Warmup failed" });
        } finally {
          setBusyId(null);
        }
      }
    },
    [
      busyId,
      closeCommandPalette,
      router,
      soundEnabled,
      toggleMotionPaused,
      toggleSoundEnabled,
      toggleTheme,
    ]
  );

  const handleKeyDown = (e) => {
    if (items.length === 0) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      playHudSound("click");
      setSelectedIndex((prev) => (prev + 1) % items.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      playHudSound("click");
      setSelectedIndex((prev) => (prev - 1 + items.length) % items.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      executeItem(items[safeSelectedIndex]);
    }
  };

  return (
    <dialog
      ref={dialogRef}
      closedby="any"
      aria-label="Command Palette"
      onClose={handleDialogClose}
      onKeyDown={handleKeyDown}
      className={cn(
        "hud-command-dialog m-auto w-[min(92vw,620px)] max-h-[78vh] rounded-2xl p-0",
        "bg-[var(--color-surface)] text-[var(--color-text-main)] border border-[var(--color-border)]",
        "shadow-[var(--shadow-elevated)] backdrop-blur-xl overflow-hidden",
        "backdrop:bg-slate-950/65 backdrop:backdrop-blur-sm"
      )}
    >
      {/* Search bar */}
      <div className="flex items-center gap-3 px-4 py-3.5 border-b border-[var(--color-border)] bg-[var(--color-surface-2)]">
        <span className="material-symbols-outlined text-[20px] text-[var(--color-primary)]">
          terminal
        </span>
        <input
          ref={inputRef}
          type="text"
          autoFocus
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setSelectedIndex(0);
          }}
          placeholder="Type a route, command, or HUD toggle..."
          aria-label="Filter commands"
          className="w-full bg-transparent text-sm text-[var(--color-text-main)] placeholder:text-[var(--color-text-subtle)] focus:outline-none"
        />
        <kbd className="hidden sm:inline-flex items-center px-1.5 py-0.5 rounded border border-[var(--color-border)] font-mono text-[10px] text-[var(--color-text-muted)]">
          ESC
        </kbd>
      </div>

      {/* Feedback banner for async actions */}
      {feedback && (
        <div
          className={cn(
            "px-4 py-2 text-xs font-mono border-b border-[var(--color-border)] flex items-center justify-between gap-2",
            feedback.ok
              ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-300"
              : "bg-rose-500/10 text-rose-600 dark:text-rose-300"
          )}
        >
          <span className="truncate">{feedback.text}</span>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="text-[11px] opacity-75 hover:opacity-100"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Results list */}
      <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-1">
        {items.length === 0 ? (
          <div className="py-10 text-center text-sm text-[var(--color-text-muted)] font-mono">
            No matching routes or tactical commands.
          </div>
        ) : (
          items.map((item, idx) => {
            const isActive = idx === safeSelectedIndex;
            const isBusy = busyId === item.id;
            return (
              <button
                key={item.id}
                type="button"
                disabled={Boolean(busyId)}
                onMouseEnter={() => setSelectedIndex(idx)}
                onClick={() => executeItem(item)}
                className={cn(
                  "w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl text-left transition-colors",
                  isActive
                    ? "bg-[var(--color-primary)]/12 border border-[var(--color-primary)]/35 text-[var(--color-text-main)]"
                    : "border border-transparent hover:bg-[var(--color-surface-2)] text-[var(--color-text-main)]"
                )}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span
                    className={cn(
                      "material-symbols-outlined text-[18px] shrink-0",
                      isActive ? "text-[var(--color-primary)]" : "text-[var(--color-text-muted)]",
                      isBusy && "animate-spin"
                    )}
                  >
                    {isBusy ? "progress_activity" : item.icon}
                  </span>
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">{item.label}</div>
                    <div className="text-[11px] font-mono text-[var(--color-text-subtle)] truncate">
                      {item.hint}
                    </div>
                  </div>
                </div>
                <span className="shrink-0 px-2 py-0.5 rounded-md bg-[var(--color-surface-2)] border border-[var(--color-border-subtle)] font-mono text-[10px] uppercase tracking-wider text-[var(--color-text-muted)]">
                  {item.group}
                </span>
              </button>
            );
          })
        )}
      </div>

      {/* Footer hints */}
      <div className="flex items-center justify-between px-4 py-2 border-t border-[var(--color-border)] bg-[var(--color-surface-2)] font-mono text-[11px] text-[var(--color-text-subtle)]">
        <div className="flex items-center gap-3">
          <span>↑↓ Navigate</span>
          <span>↵ Execute</span>
        </div>
        <span>Ctrl/Cmd + K</span>
      </div>
    </dialog>
  );
}

export default CommandPalette;
