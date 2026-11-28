"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/shared/utils/cn";
import { useTheme } from "@/shared/hooks/useTheme";
import { useHudPrefs } from "@/shared/hooks/useHudPrefs";
import { playHudSound } from "@/shared/utils/hudAudio";
import { setCachedData, invalidateCache } from "@/shared/utils/swrCache";

const ROUTE_ITEMS = [
  { id: "nav-dashboard", label: "Trung tâm Antigravity", hint: "/dashboard", icon: "radar", group: "Điều hướng", path: "/dashboard", shortcut: "G D" },
  { id: "nav-mitm", label: "Proxy MITM", hint: "/dashboard/mitm", icon: "security", group: "Điều hướng", path: "/dashboard/mitm", shortcut: "G M" },
  { id: "nav-quota", label: "Bảng Quota", hint: "/dashboard/quota", icon: "speed", group: "Điều hướng", path: "/dashboard/quota", shortcut: "G Q" },
  { id: "nav-antigravity", label: "Tài khoản Antigravity", hint: "/dashboard/providers/antigravity", icon: "satellite_alt", group: "Điều hướng", path: "/dashboard/providers/antigravity", shortcut: "G A" },
  { id: "nav-token-saver", label: "Tiết kiệm Token", hint: "/dashboard/token-saver", icon: "compress", group: "Điều hướng", path: "/dashboard/token-saver", shortcut: "G T" },
  { id: "nav-endpoint", label: "Endpoint & Khóa API", hint: "/dashboard/endpoint", icon: "api", group: "Điều hướng", path: "/dashboard/endpoint", shortcut: "G E" },
  { id: "nav-providers", label: "Nhà cung cấp", hint: "/dashboard/providers", icon: "dns", group: "Điều hướng", path: "/dashboard/providers", shortcut: "G P" },
  { id: "nav-combos", label: "Kết hợp Model", hint: "/dashboard/combos", icon: "hub", group: "Điều hướng", path: "/dashboard/combos", shortcut: "G C" },
  { id: "nav-console", label: "Nhật ký Console", hint: "/dashboard/console-log", icon: "terminal", group: "Điều hướng", path: "/dashboard/console-log", shortcut: "G L" },
  { id: "nav-usage", label: "Thống kê sử dụng", hint: "/dashboard/usage", icon: "monitoring", group: "Điều hướng", path: "/dashboard/usage", shortcut: "G U" },
  { id: "nav-cli-tools", label: "Công cụ CLI", hint: "/dashboard/cli-tools", icon: "build", group: "Điều hướng", path: "/dashboard/cli-tools" },
  { id: "nav-proxy-pools", label: "Proxy Pool", hint: "/dashboard/proxy-pools", icon: "lan", group: "Điều hướng", path: "/dashboard/proxy-pools" },
  { id: "nav-skills", label: "Kỹ năng Agent", hint: "/dashboard/skills", icon: "extension", group: "Điều hướng", path: "/dashboard/skills" },
  { id: "nav-profile", label: "Cài đặt", hint: "/dashboard/profile", icon: "settings", group: "Điều hướng", path: "/dashboard/profile" },
];

const CHORD_ROUTE_MAP = ROUTE_ITEMS.reduce((acc, item) => {
  if (item.shortcut?.startsWith("G ")) {
    const secondKey = item.shortcut.slice(2).trim().toLowerCase();
    if (secondKey) acc[secondKey] = item.path;
  }
  return acc;
}, {});

export function CommandPalette() {
  const router = useRouter();
  const dialogRef = useRef(null);
  const inputRef = useRef(null);
  const pointerDownOutsideRef = useRef(false);
  const gChordArmedRef = useRef(false);
  const gChordTimerRef = useRef(null);

  const { isDark, toggleTheme } = useTheme();
  const {
    motionPaused,
    toggleMotionPaused,
    soundEnabled,
    toggleSoundEnabled,
    cursorPreset,
    setCursorPreset,
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

  // Global Ctrl+K / Cmd+K shortcut + G two-key chord navigation
  useEffect(() => {
    const clearGChord = () => {
      gChordArmedRef.current = false;
      if (gChordTimerRef.current) {
        clearTimeout(gChordTimerRef.current);
        gChordTimerRef.current = null;
      }
    };

    const handleGlobalKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        clearGChord();
        playHudSound("click");
        setCommandPaletteOpen((prev) => !prev);
        return;
      }

      if (commandPaletteOpen) {
        clearGChord();
        return;
      }

      if (e.ctrlKey || e.metaKey || e.altKey) {
        clearGChord();
        return;
      }

      const target = e.target;
      const isEditable =
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable);
      if (isEditable) {
        clearGChord();
        return;
      }

      const key = e.key.toLowerCase();
      if (gChordArmedRef.current) {
        const dest = CHORD_ROUTE_MAP[key];
        clearGChord();
        if (dest) {
          e.preventDefault();
          playHudSound("click");
          router.push(dest);
        }
        return;
      }

      if (key === "g") {
        gChordArmedRef.current = true;
        gChordTimerRef.current = setTimeout(() => {
          gChordArmedRef.current = false;
          gChordTimerRef.current = null;
        }, 800);
      }
    };

    window.addEventListener("keydown", handleGlobalKeyDown);
    return () => {
      clearGChord();
      window.removeEventListener("keydown", handleGlobalKeyDown);
    };
  }, [commandPaletteOpen, router, setCommandPaletteOpen]);

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
        id: "act-headroom-proxy",
        label: "Bật / Tắt Headroom Proxy (:8787)",
        hint: "POST /api/headroom/start | stop",
        icon: "power_settings_new",
        group: "Thao tác",
        type: "headroom-proxy",
      },
      {
        id: "act-headroom-setting",
        label: "Bật / Tắt nén ngữ cảnh Headroom",
        hint: "PATCH /api/settings (headroomEnabled)",
        icon: "compress",
        group: "Thao tác",
        type: "headroom-setting",
      },
      {
        id: "act-quota-refresh",
        label: "Làm mới toàn bộ Quota ngay",
        hint: "Xóa cache & tải lại /dashboard/quota",
        icon: "refresh",
        group: "Thao tác",
        type: "quota-refresh",
      },
      {
        id: "act-copy-endpoint",
        label: "Sao chép URL API Endpoint local (/v1)",
        hint: "Sao chép đường dẫn OpenAI-compatible /v1",
        icon: "content_copy",
        group: "Thao tác",
        type: "copy-endpoint",
      },
      {
        id: "act-mitm-dns",
        label: "Bật / Tắt DNS Antigravity MITM",
        hint: "PATCH /api/cli-tools/antigravity-mitm",
        icon: "dns",
        group: "Thao tác",
        type: "mitm-dns",
      },
      {
        id: "act-ag-warmup",
        label: "Làm nóng tất cả tài khoản Antigravity",
        hint: "POST /api/oauth/antigravity/warmup",
        icon: "bolt",
        group: "Thao tác",
        type: "ag-warmup",
      },
      {
        id: "act-theme",
        label: `Đổi giao diện (${isDark ? "Sáng" : "Tối"})`,
        hint: isDark ? "Chuyển sang giao diện Sáng" : "Chuyển sang giao diện Tối",
        icon: isDark ? "light_mode" : "dark_mode",
        group: "Tùy chỉnh",
        type: "theme",
      },
      {
        id: "act-motion",
        label: motionPaused ? "Bật hiệu ứng HUD" : "Tạm dừng hiệu ứng HUD",
        hint: motionPaused ? "Kích hoạt lại chuyển động nền & bộ đếm" : "Đóng băng hiệu ứng để đỡ rối mắt",
        icon: motionPaused ? "play_circle" : "pause_circle",
        group: "Tùy chỉnh",
        type: "motion",
      },
      {
        id: "act-cursor-reticle",
        label: `Chuột: Ngắm${cursorPreset === "reticle" ? " (Đang bật)" : ""}`,
        hint: "Khung ngắm HUD bám các nút & mục tiêu tương tác",
        icon: "my_location",
        group: "Chuột",
        type: "cursor",
        preset: "reticle",
      },
      {
        id: "act-cursor-fluid",
        label: `Chuột: Khói lỏng${cursorPreset === "fluid" ? " (Đang bật)" : ""}`,
        hint: "Dải khói neon theo tốc độ con trỏ & sóng nhấn",
        icon: "water_drop",
        group: "Chuột",
        type: "cursor",
        preset: "fluid",
      },
      {
        id: "act-cursor-magnetic",
        label: `Chuột: Nam châm${cursorPreset === "magnetic" ? " (Đang bật)" : ""}`,
        hint: "Vòng hào quang nam châm bám nút bấm & xung nhấn",
        icon: "adjust",
        group: "Chuột",
        type: "cursor",
        preset: "magnetic",
      },
      {
        id: "act-cursor-off",
        label: `Chuột: Tắt${cursorPreset === "off" ? " (Đang bật)" : ""}`,
        hint: "Chỉ sử dụng con trỏ mặc định của hệ thống",
        icon: "mouse",
        group: "Chuột",
        type: "cursor",
        preset: "off",
      },
      {
        id: "act-sound",
        label: soundEnabled ? "Tắt âm thanh HUD" : "Bật âm thanh HUD",
        hint: soundEnabled ? "Tắt âm báo thao tác Web Audio" : "Bật âm báo nhẹ khi thao tác",
        icon: soundEnabled ? "volume_off" : "volume_up",
        group: "Tùy chỉnh",
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
  }, [query, isDark, motionPaused, soundEnabled, cursorPreset]);

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

      if (item.type === "cursor" && item.preset) {
        setCursorPreset(item.preset);
        playHudSound(item.preset === "off" ? "toggle" : "confirm");
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
            throw new Error(patchData.error || "Không thể bật/tắt DNS Antigravity MITM");
          }
          playHudSound("confirm");
          setFeedback({
            ok: true,
            text: `Đã ${action === "enable" ? "bật" : "tắt"} DNS Antigravity MITM.`,
          });
        } catch (err) {
          playHudSound("alert");
          setFeedback({ ok: false, text: err.message || "Đổi trạng thái MITM DNS thất bại" });
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
            throw new Error(data.error || "Làm nóng tài khoản Antigravity thất bại");
          }
          playHudSound("confirm");
          setFeedback({
            ok: true,
            text: `Đã làm nóng xong (${data.activatedCount ?? 0} tài khoản được kích hoạt).`,
          });
        } catch (err) {
          playHudSound("alert");
          setFeedback({ ok: false, text: err.message || "Làm nóng thất bại" });
        } finally {
          setBusyId(null);
        }
        return;
      }

      if (item.type === "headroom-proxy") {
        setBusyId(item.id);
        setFeedback(null);
        try {
          const statusRes = await fetch("/api/headroom/status", {
            headers: { "Cache-Control": "no-store" },
          });
          const statusData = await statusRes.json().catch(() => ({}));
          const isRunning = Boolean(statusData?.running);
          const endpoint = isRunning ? "/api/headroom/stop" : "/api/headroom/start";
          const actionRes = await fetch(endpoint, { method: "POST" });
          const actionData = await actionRes.json().catch(() => ({}));
          if (!actionRes.ok) {
            throw new Error(
              actionData.error ||
                (isRunning
                  ? "Không thể dừng Headroom Proxy"
                  : "Không thể khởi động Headroom Proxy")
            );
          }
          const freshRes = await fetch("/api/headroom/status?refresh=1", {
            headers: { "Cache-Control": "no-store" },
          });
          const freshStatus = await freshRes.json().catch(() => null);
          if (freshStatus && typeof freshStatus === "object") {
            setCachedData("/api/headroom/status", freshStatus);
          }
          playHudSound(freshStatus?.running ? "confirm" : "toggle");
          setFeedback({
            ok: true,
            text: freshStatus?.running
              ? "Đã khởi động Headroom Proxy (:8787)."
              : "Đã dừng Headroom Proxy (:8787).",
          });
        } catch (err) {
          playHudSound("alert");
          setFeedback({ ok: false, text: err.message || "Thao tác Headroom Proxy thất bại" });
        } finally {
          setBusyId(null);
        }
        return;
      }

      if (item.type === "headroom-setting") {
        setBusyId(item.id);
        setFeedback(null);
        try {
          const settingsRes = await fetch("/api/settings", {
            headers: { "Cache-Control": "no-store" },
          });
          const settingsData = await settingsRes.json().catch(() => ({}));
          if (!settingsRes.ok) {
            throw new Error("Không thể đọc cấu hình Headroom");
          }
          const nextEnabled = !Boolean(settingsData?.headroomEnabled);
          const patchRes = await fetch("/api/settings", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ headroomEnabled: nextEnabled }),
          });
          const updated = await patchRes.json().catch(() => null);
          if (!patchRes.ok) {
            throw new Error(updated?.error || "Không thể cập nhật nén ngữ cảnh Headroom");
          }
          if (updated && typeof updated === "object") {
            setCachedData("/api/settings", updated);
          }
          let autoStarted = false;
          if (nextEnabled) {
            const statusRes = await fetch("/api/headroom/status", {
              headers: { "Cache-Control": "no-store" },
            });
            const statusData = await statusRes.json().catch(() => ({}));
            if (statusData?.localUrl !== false && !statusData?.running && statusData?.canStart) {
              const startRes = await fetch("/api/headroom/start", { method: "POST" });
              if (startRes.ok) {
                autoStarted = true;
                const freshRes = await fetch("/api/headroom/status?refresh=1", {
                  headers: { "Cache-Control": "no-store" },
                });
                const freshStatus = await freshRes.json().catch(() => null);
                if (freshStatus && typeof freshStatus === "object") {
                  setCachedData("/api/headroom/status", freshStatus);
                }
              }
            }
          }
          playHudSound("confirm");
          setFeedback({
            ok: true,
            text: nextEnabled
              ? autoStarted
                ? "Đã bật nén ngữ cảnh Headroom và khởi động Proxy (:8787)."
                : "Đã bật nén ngữ cảnh Headroom."
              : "Đã tắt nén ngữ cảnh Headroom.",
          });
        } catch (err) {
          playHudSound("alert");
          setFeedback({ ok: false, text: err.message || "Cập nhật cấu hình Headroom thất bại" });
        } finally {
          setBusyId(null);
        }
        return;
      }

      if (item.type === "quota-refresh") {
        invalidateCache("/api/providers");
        invalidateCache("/api/usage/", { prefix: true });
        playHudSound("confirm");
        router.push("/dashboard/quota");
        router.refresh();
        setFeedback({
          ok: true,
          text: "Đã xóa cache và làm mới dữ liệu Quota.",
        });
        return;
      }

      if (item.type === "copy-endpoint") {
        try {
          const endpointUrl = `${window.location.origin}/v1`;
          await navigator.clipboard.writeText(endpointUrl);
          playHudSound("confirm");
          setFeedback({
            ok: true,
            text: `Đã sao chép URL Endpoint: ${endpointUrl}`,
          });
        } catch {
          playHudSound("alert");
          setFeedback({
            ok: false,
            text: "Không thể sao chép vào clipboard.",
          });
        }
      }
    },
    [
      busyId,
      closeCommandPalette,
      router,
      setCursorPreset,
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
      aria-label="Bảng lệnh nhanh"
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
          placeholder="Nhập trang, lệnh hoặc tùy chọn HUD..."
          aria-label="Lọc lệnh nhanh"
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
            Đóng
          </button>
        </div>
      )}

      {/* Results list */}
      <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-1">
        {items.length === 0 ? (
          <div className="py-10 text-center text-sm text-[var(--color-text-muted)] font-mono">
            Không tìm thấy trang hoặc lệnh phù hợp.
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
                <div className="flex items-center gap-1.5 shrink-0">
                  {item.shortcut && (
                    <kbd className="hidden sm:inline-flex items-center px-1.5 py-0.5 rounded bg-[var(--color-surface)] border border-[var(--color-border)] font-mono text-[10px] text-[var(--color-text-muted)]">
                      {item.shortcut}
                    </kbd>
                  )}
                  <span className="px-2 py-0.5 rounded-md bg-[var(--color-surface-2)] border border-[var(--color-border-subtle)] font-mono text-[10px] uppercase tracking-wider text-[var(--color-text-muted)]">
                    {item.group}
                  </span>
                </div>
              </button>
            );
          })
        )}
      </div>

      {/* Footer hints */}
      <div className="flex items-center justify-between px-4 py-2 border-t border-[var(--color-border)] bg-[var(--color-surface-2)] font-mono text-[11px] text-[var(--color-text-subtle)]">
        <div className="flex items-center gap-3">
          <span>↑↓ Di chuyển</span>
          <span>↵ Thực thi</span>
          <span className="hidden sm:inline">G + phím tắt</span>
        </div>
        <span>Ctrl/Cmd + K</span>
      </div>
    </dialog>
  );
}

export default CommandPalette;
