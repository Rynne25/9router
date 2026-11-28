"use client";

import { useMemo, useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import PropTypes from "prop-types";
import { useHeaderSearchStore } from "@/store/headerSearchStore";
import { OAUTH_PROVIDERS, APIKEY_PROVIDERS } from "@/shared/constants/config";
import { MEDIA_PROVIDER_KINDS, AI_PROVIDERS } from "@/shared/constants/providers";
import { getProviderIconSrc } from "@/shared/utils/providerIcon";
import { fetchWithCache, fetchJson, subscribeCache } from "@/shared/utils/swrCache";
import { useHudPrefs } from "@/shared/hooks/useHudPrefs";
import { playHudSound } from "@/shared/utils/hudAudio";
import { cn } from "@/shared/utils/cn";
import { translate } from "@/i18n/runtime";

const CURSOR_PRESET_META = {
  reticle: { label: "Chuột: Ngắm", icon: "my_location" },
  fluid: { label: "Chuột: Khói lỏng", icon: "water_drop" },
  magnetic: { label: "Chuột: Nam châm", icon: "adjust" },
  off: { label: "Chuột: Tắt", icon: "mouse" },
};

const MITM_STATUS_KEY = "/api/cli-tools/antigravity-mitm";
const MITM_STATUS_TTL_MS = 30000;
const HEADROOM_STATUS_KEY = "/api/headroom/status";
const HEADROOM_STATUS_TTL_MS = 60000;

const getPageInfo = (pathname) => {
  if (!pathname) return { title: "", description: "", breadcrumbs: [] };

  // Media provider detail: /dashboard/media-providers/[kind]/[id]
  const mediaDetailMatch = pathname.match(/\/media-providers\/([^/]+)\/([^/]+)$/);
  if (mediaDetailMatch) {
    const kindId = mediaDetailMatch[1];
    const providerId = mediaDetailMatch[2];
    const kindConfig = MEDIA_PROVIDER_KINDS.find((k) => k.id === kindId);
    const provider = AI_PROVIDERS[providerId];
    return {
      title: provider?.name || providerId,
      description: "",
      icon: kindConfig?.icon || "perm_media",
      breadcrumbs: [
        { label: "Media Providers", href: `/dashboard/media-providers/${kindId}` },
        { label: kindConfig?.label || kindId, href: `/dashboard/media-providers/${kindId}` },
        { label: provider?.name || providerId, image: getProviderIconSrc(providerId) },
      ],
    };
  }

  // Media provider kind: /dashboard/media-providers/[kind]
  const mediaKindMatch = pathname.match(/\/media-providers\/([^/]+)$/);
  if (mediaKindMatch) {
    const kindId = mediaKindMatch[1];
    const kindConfig = MEDIA_PROVIDER_KINDS.find((k) => k.id === kindId);
    return {
      title: kindConfig?.label || kindId,
      description: `Manage your ${kindConfig?.label || kindId} providers`,
      icon: kindConfig?.icon || "perm_media",
      breadcrumbs: [],
    };
  }

  // Provider detail page: /dashboard/providers/[id]
  const providerMatch = pathname.match(/\/providers\/([^/]+)$/);
  if (providerMatch) {
    const providerId = providerMatch[1];
    const providerInfo =
      OAUTH_PROVIDERS[providerId] || APIKEY_PROVIDERS[providerId];
    if (providerInfo) {
      return {
        title: providerInfo.name,
        description: "",
        icon: providerId === "antigravity" ? "manage_accounts" : "dns",
        breadcrumbs: [
          { label: "Providers", href: "/dashboard/providers" },
          {
            label: providerInfo.name,
            image: getProviderIconSrc(providerInfo.id),
          },
        ],
      };
    }
  }

  if (pathname.includes("/providers") && !pathname.includes("/media-providers"))
    return {
      title: "Providers",
      description: "Manage your AI provider connections",
      icon: "dns",
      breadcrumbs: [],
    };
  if (pathname.includes("/combos"))
    return {
      title: "Combos",
      description: "Model combos with fallback",
      icon: "layers",
      breadcrumbs: [],
    };
  if (pathname.includes("/usage"))
    return {
      title: "Usage & Analytics",
      description:
        "Monitor your API usage, token consumption, and request logs",
      icon: "bar_chart",
      breadcrumbs: [],
    };
  if (pathname.includes("/auth-files"))
    return {
      title: "Tệp xác thực",
      description: "Ánh xạ thông tin xác thực nhà cung cấp trong cơ sở dữ liệu nội bộ",
      icon: "vpn_key",
      breadcrumbs: [],
    };
  if (pathname.includes("/quota"))
    return {
      title: "Bảng Quota",
      description: "Theo dõi và quản lý giới hạn hạn mức API",
      icon: "data_usage",
      breadcrumbs: [],
    };
  if (pathname.includes("/mitm"))
    return {
      title: "Proxy MITM",
      description: "Chặn lưu lượng công cụ CLI và định tuyến qua 9Router",
      icon: "security",
      breadcrumbs: [],
    };
  if (pathname.includes("/token-saver"))
    return {
      title: "Tiết kiệm Token",
      description: "Nén prompt và phản hồi để giảm tối đa chi phí token",
      icon: "savings",
      breadcrumbs: [],
    };
  if (pathname.includes("/cli-tools"))
    return {
      title: "Công cụ CLI",
      description: "Cấu hình tích hợp cho các công cụ CLI",
      icon: "terminal",
      breadcrumbs: [],
    };
  if (pathname.includes("/proxy-pools"))
    return {
      title: "Proxy Pool",
      description: "Quản lý cấu hình nhóm proxy luân phiên",
      icon: "lan",
      breadcrumbs: [],
    };
  if (pathname.includes("/skills"))
    return {
      title: "Kỹ năng Agent",
      description: "Sao chép liên kết và dán vào AI để dùng 9Router không cần cài đặt",
      icon: "extension",
      breadcrumbs: [],
    };
  if (pathname.includes("/endpoint"))
    return {
      title: "Endpoint & Khóa API",
      description: "Cấu hình cổng API và danh sách khóa xác thực",
      icon: "api",
      breadcrumbs: [],
    };
  if (pathname.includes("/profile"))
    return {
      title: "Cài đặt",
      description: "Quản lý tùy chọn hệ thống và giao diện",
      icon: "settings",
      breadcrumbs: [],
    };
  if (pathname.includes("/translator"))
    return {
      title: "Trình dịch",
      description: "Kiểm tra luồng chuyển đổi định dạng API",
      icon: "translate",
      breadcrumbs: [],
    };
  if (pathname.includes("/console-log"))
    return {
      title: "Nhật ký Console",
      description: "Theo dõi log máy chủ theo thời gian thực",
      icon: "monitor",
      breadcrumbs: [],
    };
  if (pathname === "/dashboard")
    return {
      title: "Trung tâm Antigravity",
      description: "Giám sát luồng proxy, MITM passthrough và nhóm tài khoản",
      icon: "rocket_launch",
      breadcrumbs: [],
    };
  return { title: "", description: "", breadcrumbs: [] };
};

export default function Header({ onMenuClick, showMenuButton = true }) {
  const pathname = usePathname();
  const searchVisible = useHeaderSearchStore((s) => s.visible);
  const {
    motionPaused,
    toggleMotionPaused,
    soundEnabled,
    toggleSoundEnabled,
    cursorPreset,
    cycleCursorPreset,
    openCommandPalette,
  } = useHudPrefs();
  const [mitmStatus, setMitmStatus] = useState(null);
  const [headroomStatus, setHeadroomStatus] = useState(null);

  useEffect(() => {
    let mounted = true;
    const loadMitm = (force = false) => {
      fetchWithCache(MITM_STATUS_KEY, () => fetchJson(MITM_STATUS_KEY), {
        ttlMs: MITM_STATUS_TTL_MS,
        force,
      })
        .then((data) => {
          if (mounted && data) setMitmStatus(data);
        })
        .catch(() => {});
    };

    const loadHeadroom = (force = false) => {
      fetchWithCache(HEADROOM_STATUS_KEY, () => fetchJson(HEADROOM_STATUS_KEY), {
        ttlMs: HEADROOM_STATUS_TTL_MS,
        force,
      })
        .then((data) => {
          if (mounted && data) setHeadroomStatus(data);
        })
        .catch(() => {});
    };

    loadMitm(false);
    loadHeadroom(false);
    const unsubMitm = subscribeCache(MITM_STATUS_KEY, (data) => {
      if (mounted) setMitmStatus(data);
    });
    const unsubHeadroom = subscribeCache(HEADROOM_STATUS_KEY, (data) => {
      if (mounted) setHeadroomStatus(data);
    });
    const mitmTimer = setInterval(() => {
      if (!document.hidden) loadMitm(true);
    }, MITM_STATUS_TTL_MS);
    const headroomTimer = setInterval(() => {
      if (!document.hidden) loadHeadroom(true);
    }, HEADROOM_STATUS_TTL_MS);

    return () => {
      mounted = false;
      unsubMitm();
      unsubHeadroom();
      clearInterval(mitmTimer);
      clearInterval(headroomTimer);
    };
  }, []);

  // Memoize page info to prevent unnecessary recalculations
  const pageInfo = useMemo(() => getPageInfo(pathname), [pathname]);
  const { title, icon, breadcrumbs } = pageInfo;
  const mitmLive = Boolean(mitmStatus?.running);
  const headroomLive = Boolean(headroomStatus?.running);
  const showHeadroomPill = headroomLive || Boolean(headroomStatus?.installed && !headroomStatus?.running);
  const motionLabel = motionPaused ? "Bật hiệu ứng" : "Tạm dừng hiệu ứng";
  const soundLabel = soundEnabled ? "Tắt âm thanh HUD" : "Bật âm thanh HUD";
  const cursorMeta = CURSOR_PRESET_META[cursorPreset] || CURSOR_PRESET_META.reticle;
  const cursorTitle = motionPaused && cursorPreset !== "off"
    ? `${cursorMeta.label} (đang tạm dừng hiệu ứng HUD — bấm để đổi chế độ)`
    : `${cursorMeta.label} — Bấm để đổi chế độ con trỏ`;

  return (
    <>
      {/* Mobile-only top bar (< lg) */}
      <header className="lg:hidden shrink-0 h-11 flex items-center justify-between gap-2 px-3 border-b border-cyan-500/15 bg-sidebar/85 backdrop-blur-xl z-20">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {showMenuButton && (
            <button
              type="button"
              onClick={onMenuClick}
              aria-label="Open navigation"
              className="flex items-center justify-center size-7 rounded-lg text-text-muted hover:text-cyan-600 dark:hover:text-cyan-300 hover:bg-cyan-500/10 transition-colors shrink-0"
            >
              <span className="material-symbols-outlined text-[18px]">menu</span>
            </button>
          )}
          {title && (
            <div className="flex items-center gap-1.5 min-w-0">
              {icon && (
                <span className="material-symbols-outlined text-cyan-600 dark:text-cyan-400 text-[16px] shrink-0">
                  {icon}
                </span>
              )}
              <h1 className="text-xs font-bold text-text-main tracking-tight truncate">
                {translate(title)}
              </h1>
            </div>
          )}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <HeaderSearch />
          <button
            type="button"
            onClick={() => {
              playHudSound("click");
              openCommandPalette();
            }}
            aria-label="Open Command Palette"
            className="flex items-center justify-center size-7 rounded-lg border border-border bg-surface/60 text-text-muted hover:text-cyan-600 dark:hover:text-cyan-300 hover:border-cyan-500/35 transition-colors"
          >
            <span className="material-symbols-outlined text-[16px]">terminal</span>
          </button>
        </div>
      </header>

      {/* Ultra-slim Desktop Orbital Telemetry Bar (lg+) */}
      <header className="hidden lg:flex shrink-0 h-11 items-center justify-between gap-3 px-5 border-b border-cyan-500/15 dark:border-cyan-400/15 bg-sidebar/75 backdrop-blur-xl z-20">
        {/* Left: Route Icon + Title / Breadcrumbs */}
        <div className="flex items-center gap-2.5 min-w-0">
          {icon && (
            <div className="flex items-center justify-center size-6 rounded-md bg-cyan-500/10 border border-cyan-500/25 text-cyan-600 dark:text-cyan-400 shrink-0">
              <span className="material-symbols-outlined text-[15px]">{icon}</span>
            </div>
          )}
          {breadcrumbs && breadcrumbs.length > 0 ? (
            <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-xs min-w-0">
              {breadcrumbs.map((crumb, idx) => {
                const isLast = idx === breadcrumbs.length - 1;
                return (
                  <span key={`${crumb.label}-${idx}`} className="flex items-center gap-1.5 min-w-0">
                    {idx > 0 && (
                      <span className="text-text-subtle/70 font-mono text-[11px]">/</span>
                    )}
                    {crumb.href && !isLast ? (
                      <Link
                        href={crumb.href}
                        onClick={() => playHudSound("click")}
                        className="text-text-muted hover:text-cyan-600 dark:hover:text-cyan-300 transition-colors truncate"
                      >
                        {translate(crumb.label)}
                      </Link>
                    ) : (
                      <span className="font-semibold text-text-main tracking-tight truncate">
                        {translate(crumb.label)}
                      </span>
                    )}
                  </span>
                );
              })}
            </nav>
          ) : (
            <div className="flex items-center gap-2 min-w-0">
              <h1 className="text-xs font-semibold tracking-tight text-text-main truncate">
                {translate(title || "Antigravity Command Center")}
              </h1>
              {pathname === "/dashboard" && (
                <span className="px-1.5 py-0.5 rounded bg-cyan-500/10 border border-cyan-500/25 text-[10px] font-mono font-semibold uppercase tracking-wider text-cyan-700 dark:text-cyan-300 shrink-0">
                  HUD
                </span>
              )}
            </div>
          )}
        </div>

        {/* Right: Search (when active) + Telemetry & HUD Controls */}
        <div className="flex items-center gap-2 shrink-0">
          {searchVisible && <HeaderSearch />}

          {/* Live MITM :443 Status Badge */}
          <Link
            href="/dashboard/mitm"
            onClick={() => playHudSound("click")}
            title={mitmLive ? "MITM Proxy active on :443" : "MITM Proxy in standby — click to configure"}
            className={cn(
              "inline-flex items-center gap-1.5 h-7 px-2.5 rounded-lg border text-[11px] font-mono font-semibold tracking-tight transition-all",
              mitmLive
                ? "border-emerald-500/35 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 hover:border-emerald-400/60 shadow-[0_0_12px_-4px_rgba(16,185,129,0.45)]"
                : "border-border bg-surface-2/80 text-text-muted hover:text-text-main hover:border-cyan-500/35"
            )}
          >
            <span
              className={cn(
                "size-1.5 rounded-full",
                mitmLive
                  ? cn("bg-emerald-500", !motionPaused && "animate-pulse")
                  : "bg-slate-400 dark:bg-slate-500"
              )}
              aria-hidden="true"
            />
            <span className="hud-telemetry-num">{mitmLive ? ":443 ĐANG CHẠY" : ":443 CHỜ"}</span>
          </Link>

          {/* Live Headroom :8787 Status Pill */}
          {showHeadroomPill && (
            <Link
              href="/dashboard/token-saver"
              onClick={() => playHudSound("click")}
              title={
                headroomLive
                  ? "Headroom Proxy đang chạy trên :8787"
                  : "Headroom Proxy :8787 đang tắt — bấm để cấu hình"
              }
              className={cn(
                "inline-flex items-center gap-1.5 h-7 px-2.5 rounded-lg border text-[11px] font-mono font-semibold tracking-tight transition-all",
                headroomLive
                  ? "border-emerald-500/35 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 hover:border-emerald-400/60 shadow-[0_0_12px_-4px_rgba(16,185,129,0.45)]"
                  : "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300 hover:border-amber-400/55"
              )}
            >
              <span
                className={cn(
                  "size-1.5 rounded-full",
                  headroomLive
                    ? cn("bg-emerald-500", !motionPaused && "animate-pulse")
                    : "bg-amber-500/80"
                )}
                aria-hidden="true"
              />
              <span className="hud-telemetry-num">
                {headroomLive ? ":8787 CHẠY" : ":8787 TẮT"}
              </span>
            </Link>
          )}

          {/* Command Palette Trigger */}
          <button
            type="button"
            onClick={() => {
              playHudSound("click");
              openCommandPalette();
            }}
            aria-label="Mở bảng lệnh nhanh"
            title="Bảng lệnh nhanh (Ctrl+K / Cmd+K)"
            className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-lg border border-border bg-surface-2/80 text-xs text-text-muted hover:text-cyan-700 dark:hover:text-cyan-300 hover:border-cyan-500/40 hover:bg-cyan-500/[0.08] transition-all"
          >
            <span className="material-symbols-outlined text-[15px]">search</span>
            <span className="text-[11px] font-medium">Lệnh nhanh</span>
            <kbd className="px-1 py-0.5 rounded bg-surface border border-border-subtle text-[10px] font-mono text-text-subtle leading-none">
              ⌘K
            </kbd>
          </button>

          {/* Cursor Preset Cycle Button */}
          <button
            type="button"
            onClick={() => {
              const nextPreset = cycleCursorPreset();
              playHudSound(nextPreset === "off" ? "toggle" : "click");
            }}
            aria-label={cursorMeta.label}
            title={cursorTitle}
            className={cn(
              "inline-flex items-center gap-1 h-7 px-2 rounded-lg border text-[11px] font-mono transition-all",
              cursorPreset !== "off" && !motionPaused
                ? "border-cyan-500/35 bg-cyan-500/10 text-cyan-700 dark:text-cyan-300 hover:border-cyan-400/60"
                : "border-border bg-surface-2/80 text-text-muted hover:text-cyan-700 dark:hover:text-cyan-300 hover:border-cyan-500/35"
            )}
          >
            <span className="material-symbols-outlined text-[15px]">
              {cursorMeta.icon}
            </span>
            <span>{cursorMeta.label}</span>
          </button>

          {/* WCAG 2.2.2 Motion Pause/Play Toggle (label flips, NO aria-pressed) */}
          <button
            type="button"
            onClick={() => {
              toggleMotionPaused();
              playHudSound("toggle");
            }}
            aria-label={motionLabel}
            title={motionLabel}
            className={cn(
              "inline-flex items-center gap-1 h-7 px-2 rounded-lg border text-[11px] font-mono transition-all",
              motionPaused
                ? "border-amber-500/35 bg-amber-500/10 text-amber-700 dark:text-amber-300 hover:border-amber-400/60"
                : "border-border bg-surface-2/80 text-text-muted hover:text-cyan-700 dark:hover:text-cyan-300 hover:border-cyan-500/35"
            )}
          >
            <span className="material-symbols-outlined text-[15px]">
              {motionPaused ? "play_circle" : "pause_circle"}
            </span>
            <span className="hidden xl:inline">{motionLabel}</span>
          </button>

          {/* HUD Audio Toggle */}
          <button
            type="button"
            onClick={() => {
              toggleSoundEnabled();
              playHudSound("toggle");
            }}
            aria-label={soundLabel}
            title={soundLabel}
            className={cn(
              "inline-flex items-center justify-center size-7 rounded-lg border transition-all",
              soundEnabled
                ? "border-cyan-500/35 bg-cyan-500/12 text-cyan-700 dark:text-cyan-300 shadow-[0_0_10px_-3px_rgba(6,182,212,0.45)]"
                : "border-border bg-surface-2/80 text-text-muted hover:text-text-main hover:border-cyan-500/35"
            )}
          >
            <span className="material-symbols-outlined text-[16px]">
              {soundEnabled ? "volume_up" : "volume_off"}
            </span>
          </button>
        </div>
      </header>
    </>
  );
}

function HeaderSearch() {
  const visible = useHeaderSearchStore((s) => s.visible);
  const query = useHeaderSearchStore((s) => s.query);
  const placeholder = useHeaderSearchStore((s) => s.placeholder);
  const setQuery = useHeaderSearchStore((s) => s.setQuery);

  if (!visible) return null;

  return (
    <div className="relative w-[160px] sm:w-[220px]">
      <span className="material-symbols-outlined absolute left-2 top-1/2 -translate-y-1/2 text-text-muted text-[16px] pointer-events-none">
        search
      </span>
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={placeholder}
        className="w-full h-7 pl-7 pr-7 rounded-lg border border-border bg-surface/70 text-xs focus:outline-none focus:border-cyan-500/60 focus:ring-2 focus:ring-cyan-500/20 transition-all"
      />
      {query && (
        <button
          type="button"
          onClick={() => setQuery("")}
          className="absolute right-1 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-main p-0.5 rounded"
          aria-label="Clear search"
        >
          <span className="material-symbols-outlined text-[16px]">close</span>
        </button>
      )}
    </div>
  );
}

Header.propTypes = {
  onMenuClick: PropTypes.func,
  showMenuButton: PropTypes.bool,
};
