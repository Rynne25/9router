"use client";

import { memo, useState, useEffect, useRef, useCallback, useSyncExternalStore } from "react";
import PropTypes from "prop-types";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/shared/utils/cn";
import { APP_CONFIG, UPDATER_CONFIG } from "@/shared/constants/config";
import { MEDIA_PROVIDER_KINDS } from "@/shared/constants/providers";
import { useCopyToClipboard } from "@/shared/hooks/useCopyToClipboard";
import useSettingsStore from "@/store/settingsStore";
import Button from "./Button";
import { ConfirmModal } from "./Modal";
import AutoUpdateModal from "./AutoUpdateModal";
import ThemeToggle from "./ThemeToggle";
import HeaderLanguage from "./HeaderLanguage";
import HeaderMenu from "./HeaderMenu";

const VISIBLE_MEDIA_KINDS = ["embedding", "image", "video", "tts", "stt", "systemone"];
const COMBINED_WEB_ITEM = {
  id: "web",
  label: "Web Fetch & Search",
  icon: "travel_explore",
  href: "/dashboard/media-providers/web",
};

const CORE_NAV_ITEMS = [
  { href: "/dashboard/endpoint", label: "Endpoint & Key", icon: "api" },
  { href: "/dashboard/providers", label: "Providers", icon: "dns" },
  { href: "/dashboard/combos", label: "Combos", icon: "layers" },
  { href: "/dashboard/quota", label: "Quota Tracker", icon: "data_usage" },
  { href: "/dashboard/mitm", label: "Proxy MITM", icon: "security" },
  { href: "/dashboard/console-log", label: "Console Log", icon: "monitor" },
  { href: "/dashboard/usage", label: "Usage", icon: "bar_chart" },
  { href: "/dashboard/cli-tools", label: "CLI Tools", icon: "terminal" },
];

const ADVANCED_NAV_ITEMS = [
  { href: "/dashboard/token-saver", label: "Token Saver", icon: "savings" },
  { href: "/dashboard/proxy-pools", label: "Proxy Pools", icon: "lan" },
  { href: "/dashboard/skills", label: "Skills", icon: "extension" },
  { href: "/dashboard/translator", label: "Translator", icon: "translate", requiresTranslator: true },
];

const SIDEBAR_COLLAPSE_KEY = "9router-sidebar-collapsed";
const SIDEBAR_COLLAPSE_EVENT = "9router-sidebar-collapse-change";

function subscribeCollapsed(callback) {
  if (typeof window === "undefined") return () => {};
  window.addEventListener("storage", callback);
  window.addEventListener(SIDEBAR_COLLAPSE_EVENT, callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(SIDEBAR_COLLAPSE_EVENT, callback);
  };
}

function getCollapsedSnapshot() {
  try {
    return localStorage.getItem(SIDEBAR_COLLAPSE_KEY) === "true";
  } catch {
    return false;
  }
}

function getCollapsedServerSnapshot() {
  return false;
}

function Sidebar({ onClose }) {
  const pathname = usePathname();
  const router = useRouter();
  const isMobileDrawer = Boolean(onClose);

  const storedCollapsed = useSyncExternalStore(
    subscribeCollapsed,
    getCollapsedSnapshot,
    getCollapsedServerSnapshot
  );
  const [advancedOpenState, setAdvancedOpenState] = useState(false);
  const [mediaOpenState, setMediaOpenState] = useState(false);
  const [isDisconnected, setIsDisconnected] = useState(false);
  const [updateInfo, setUpdateInfo] = useState(null);
  const [showUpdateModal, setShowUpdateModal] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [shutdownCountdown, setShutdownCountdown] = useState(0);
  const [enableTranslator, setEnableTranslator] = useState(false);
  const { copied, copy } = useCopyToClipboard(2000);
  const shutdownTimerRef = useRef(null);

  useEffect(() => {
    return () => {
      if (shutdownTimerRef.current) {
        clearInterval(shutdownTimerRef.current);
        shutdownTimerRef.current = null;
      }
    };
  }, []);

  const INSTALL_CMD = UPDATER_CONFIG.installCmdLatest;
  const isCollapsed = !isMobileDrawer && storedCollapsed;
  const isMediaRoute = Boolean(pathname?.startsWith("/dashboard/media-providers"));
  const isAdvancedRoute =
    isMediaRoute || ADVANCED_NAV_ITEMS.some((item) => pathname?.startsWith(item.href));
  const advancedOpen = advancedOpenState || isAdvancedRoute;
  const mediaOpen = mediaOpenState || isMediaRoute;

  useEffect(() => {
    useSettingsStore.getState().fetchSettings().then((data) => {
      if (data?.enableTranslator) setEnableTranslator(true);
    });
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetch("/api/version")
        .then((res) => res.json())
        .then((data) => {
          if (data.hasUpdate) setUpdateInfo(data);
        })
        .catch(() => {});
    }, 2500);
    return () => clearTimeout(timer);
  }, []);

  const toggleCollapse = () => {
    try {
      localStorage.setItem(SIDEBAR_COLLAPSE_KEY, String(!storedCollapsed));
      window.dispatchEvent(new Event(SIDEBAR_COLLAPSE_EVENT));
    } catch {
      // ignore storage errors
    }
  };

  const isActive = (href) => {
    if (!pathname) return false;
    if (href === "/dashboard/endpoint") {
      return pathname === "/dashboard" || pathname.startsWith("/dashboard/endpoint");
    }
    return pathname.startsWith(href);
  };

  const handleUpdate = () => {
    setShowUpdateModal(false);
    setIsUpdating(true);
  };

  const handleCopyAndShutdown = async () => {
    try {
      await navigator.clipboard.writeText(INSTALL_CMD);
    } catch {
      /* clipboard blocked */
    }
    copy(INSTALL_CMD);
    if (shutdownTimerRef.current) {
      clearInterval(shutdownTimerRef.current);
    }
    let remaining = UPDATER_CONFIG.shutdownCountdownSec;
    setShutdownCountdown(remaining);
    shutdownTimerRef.current = setInterval(() => {
      remaining -= 1;
      setShutdownCountdown(remaining);
      if (remaining <= 0) {
        if (shutdownTimerRef.current) {
          clearInterval(shutdownTimerRef.current);
          shutdownTimerRef.current = null;
        }
        fetch("/api/version/shutdown", { method: "POST" }).catch(() => {});
        setIsDisconnected(true);
      }
    }, 1000);
  };

  const handleCancelUpdate = () => {
    if (shutdownTimerRef.current) {
      clearInterval(shutdownTimerRef.current);
      shutdownTimerRef.current = null;
    }
    setIsUpdating(false);
    setShutdownCountdown(0);
  };

  const handleLogout = async () => {
    try {
      const res = await fetch("/api/auth/logout", { method: "POST" });
      if (res.ok) {
        router.push("/login");
        router.refresh();
      }
    } catch (err) {
      console.error("Failed to logout:", err);
    }
  };

  const prefetchRoute = useCallback(
    (href) => {
      try {
        router.prefetch(href);
      } catch {
        /* ignore prefetch error */
      }
    },
    [router]
  );

  const visibleAdvancedItems = ADVANCED_NAV_ITEMS.filter(
    (item) => !item.requiresTranslator || enableTranslator
  );

  return (
    <>
      <aside
        className={cn(
          "flex flex-col border-r border-border bg-sidebar/95 backdrop-blur-2xl transition-all duration-200 ease-out min-h-full select-none",
          isCollapsed ? "w-[60px]" : "w-[214px]"
        )}
      >
        {/* Brand header */}
        <div
          className={cn(
            "h-11 flex items-center border-b border-border-subtle shrink-0",
            isCollapsed ? "justify-center px-1.5" : "justify-between px-3"
          )}
        >
          <Link
            href="/dashboard"
            onClick={onClose}
            title={isCollapsed ? `${APP_CONFIG.name} v${APP_CONFIG.version}` : undefined}
            className={cn("flex items-center gap-2 min-w-0", isCollapsed && "justify-center")}
          >
            <div className="flex items-center justify-center size-7 shrink-0 rounded-lg bg-gradient-to-br from-brand-500 to-brand-700 shadow-[var(--shadow-warm)]">
              <span className="material-symbols-outlined text-white text-[16px]">hub</span>
            </div>
            {!isCollapsed && (
              <div className="flex items-baseline gap-1.5 min-w-0">
                <span className="text-xs font-bold tracking-tight text-text-main truncate">
                  {APP_CONFIG.name}
                </span>
                <span className="text-[10px] font-mono text-text-subtle shrink-0">
                  v{APP_CONFIG.version}
                </span>
              </div>
            )}
          </Link>

          {isMobileDrawer ? (
            <button
              type="button"
              onClick={onClose}
              aria-label="Close navigation"
              className="p-1.5 rounded-lg text-text-muted hover:text-text-main hover:bg-surface-2 transition-colors"
            >
              <span className="material-symbols-outlined text-[18px]">close</span>
            </button>
          ) : !isCollapsed ? (
            <button
              type="button"
              onClick={toggleCollapse}
              aria-label="Collapse sidebar"
              title="Collapse sidebar"
              className="p-1.5 rounded-lg text-text-muted hover:text-text-main hover:bg-surface-2 transition-colors"
            >
              <span className="material-symbols-outlined text-[18px]">left_panel_close</span>
            </button>
          ) : null}
        </div>

        {/* Expand button when collapsed on desktop */}
        {isCollapsed && (
          <div className="flex justify-center pt-2 pb-1">
            <button
              type="button"
              onClick={toggleCollapse}
              aria-label="Expand sidebar"
              title="Expand sidebar"
              className="p-1.5 rounded-lg text-text-muted hover:text-text-main hover:bg-surface-2 transition-colors"
            >
              <span className="material-symbols-outlined text-[18px]">left_panel_open</span>
            </button>
          </div>
        )}

        {/* Update available banner */}
        {updateInfo && !isCollapsed && (
          <div className="mx-3 mt-3 rounded-lg border border-border bg-surface p-2.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-medium text-emerald-600 dark:text-amber-400 truncate">
                v{updateInfo.latestVersion} available
              </span>
              <button
                type="button"
                onClick={() => setShowUpdateModal(true)}
                className="px-2 py-0.5 rounded-md bg-emerald-600 hover:bg-emerald-700 dark:bg-amber-500 dark:hover:bg-amber-600 text-white text-[11px] font-medium transition-colors shrink-0"
              >
                Update
              </button>
            </div>
            <button
              type="button"
              onClick={() => copy(INSTALL_CMD)}
              title="Copy install command"
              className="mt-1 w-full text-left hover:opacity-80 transition-opacity"
            >
              <code className="block text-[10px] text-text-muted font-mono truncate">
                {copied ? "✓ copied!" : INSTALL_CMD}
              </code>
            </button>
          </div>
        )}

        {/* Navigation */}
        <nav className={cn("flex-1 py-2 space-y-1 overflow-y-auto custom-scrollbar", isCollapsed ? "px-1.5" : "px-2.5")}>
          {/* Core items */}
          <div className="space-y-0.5">
            {CORE_NAV_ITEMS.map((item) => {
              const active = isActive(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  prefetch={true}
                  onMouseEnter={() => prefetchRoute(item.href)}
                  onClick={onClose}
                  title={isCollapsed ? item.label : undefined}
                  className={cn(
                    "relative flex items-center rounded-xl transition-all duration-150 group",
                    isCollapsed ? "justify-center h-8.5 w-full px-0" : "gap-2.5 h-8 px-2.5",
                    active
                      ? "bg-primary/12 dark:bg-primary/15 text-primary border border-primary/25 shadow-xs font-semibold"
                      : "text-text-muted hover:bg-black/5 dark:hover:bg-white/[0.06] hover:text-text-main border border-transparent"
                  )}
                >
                  {active && !isCollapsed && (
                    <span className="absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-r-full bg-primary" />
                  )}
                  <span
                    className={cn(
                      "material-symbols-outlined text-[16px] shrink-0",
                      active ? "fill-1 text-primary" : "text-text-muted group-hover:text-text-main"
                    )}
                  >
                    {item.icon}
                  </span>
                  {!isCollapsed && (
                    <span className="text-xs truncate">{item.label}</span>
                  )}
                </Link>
              );
            })}
          </div>

          {/* Collapsible Advanced / System section */}
          <div className="pt-3 mt-3 border-t border-border-subtle space-y-0.5">
            {!isCollapsed ? (
              <button
                type="button"
                onClick={() => setAdvancedOpenState((v) => !v)}
                className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-[11px] font-semibold uppercase tracking-wider text-text-subtle hover:text-text-muted transition-colors"
              >
                <span className="truncate">
                  <span>Advanced</span>
                  <span> / </span>
                  <span>System</span>
                </span>
                <span
                  className="material-symbols-outlined text-[15px] transition-transform duration-150"
                  style={{ transform: advancedOpen ? "rotate(180deg)" : "rotate(0deg)" }}
                >
                  expand_more
                </span>
              </button>
            ) : null}

            {(advancedOpen || isCollapsed) && (
              <div className="space-y-0.5">
                {/* Media Providers */}
                {isCollapsed ? (
                  <Link
                    href="/dashboard/media-providers/embedding"
                    onClick={onClose}
                    title="Media Providers"
                    className={cn(
                      "flex items-center justify-center h-9 w-full rounded-lg transition-colors duration-150 group",
                      pathname?.startsWith("/dashboard/media-providers")
                        ? "bg-primary/10 text-primary"
                        : "text-text-muted hover:bg-surface-2 hover:text-text-main"
                    )}
                  >
                    <span className="material-symbols-outlined text-[18px]">perm_media</span>
                  </Link>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => setMediaOpenState((v) => !v)}
                      className={cn(
                        "w-full flex items-center gap-2.5 h-8 px-2.5 rounded-lg transition-colors duration-150 group",
                        pathname?.startsWith("/dashboard/media-providers")
                          ? "bg-primary/10 text-primary font-medium"
                          : "text-text-muted hover:bg-surface-2 hover:text-text-main"
                      )}
                    >
                      <span className="material-symbols-outlined text-[18px] shrink-0">perm_media</span>
                      <span className="text-[13px] flex-1 text-left truncate">Media Providers</span>
                      <span
                        className="material-symbols-outlined text-[14px] transition-transform duration-150"
                        style={{ transform: mediaOpen ? "rotate(180deg)" : "rotate(0deg)" }}
                      >
                        expand_more
                      </span>
                    </button>
                    {mediaOpen && (
                      <div className="ml-4 pl-2.5 border-l border-border-subtle space-y-0.5 py-0.5">
                        {MEDIA_PROVIDER_KINDS.filter((k) => VISIBLE_MEDIA_KINDS.includes(k.id)).map((kind) => {
                          const active = pathname?.startsWith(`/dashboard/media-providers/${kind.id}`);
                          return (
                            <Link
                              key={kind.id}
                              href={`/dashboard/media-providers/${kind.id}`}
                              onClick={onClose}
                              className={cn(
                                "flex items-center gap-2 h-7 px-2 rounded-md text-[12.5px] transition-colors",
                                active
                                  ? "bg-primary/10 text-primary font-medium"
                                  : "text-text-muted hover:bg-surface-2 hover:text-text-main"
                              )}
                            >
                              <span className="material-symbols-outlined text-[15px] shrink-0">{kind.icon}</span>
                              <span className="truncate">{kind.label}</span>
                            </Link>
                          );
                        })}
                        <Link
                          key={COMBINED_WEB_ITEM.id}
                          href={COMBINED_WEB_ITEM.href}
                          onClick={onClose}
                          className={cn(
                            "flex items-center gap-2 h-7 px-2 rounded-md text-[12.5px] transition-colors",
                            pathname?.startsWith(COMBINED_WEB_ITEM.href)
                              ? "bg-primary/10 text-primary font-medium"
                              : "text-text-muted hover:bg-surface-2 hover:text-text-main"
                          )}
                        >
                          <span className="material-symbols-outlined text-[15px] shrink-0">
                            {COMBINED_WEB_ITEM.icon}
                          </span>
                          <span className="truncate">{COMBINED_WEB_ITEM.label}</span>
                        </Link>
                      </div>
                    )}
                  </>
                )}

                {visibleAdvancedItems.map((item) => {
                  const active = isActive(item.href);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      prefetch={true}
                      onMouseEnter={() => prefetchRoute(item.href)}
                      onClick={onClose}
                      title={isCollapsed ? item.label : undefined}
                      className={cn(
                        "relative flex items-center rounded-xl transition-all duration-150 group",
                        isCollapsed ? "justify-center h-8.5 w-full px-0" : "gap-2.5 h-8 px-2.5",
                        active
                          ? "bg-primary/12 dark:bg-primary/15 text-primary border border-primary/25 shadow-xs font-semibold"
                          : "text-text-muted hover:bg-black/5 dark:hover:bg-white/[0.06] hover:text-text-main border border-transparent"
                      )}
                    >
                      {active && !isCollapsed && (
                        <span className="absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-r-full bg-primary" />
                      )}
                      <span
                        className={cn(
                          "material-symbols-outlined text-[18px] shrink-0",
                          active ? "fill-1 text-primary" : "text-text-muted group-hover:text-text-main"
                        )}
                      >
                        {item.icon}
                      </span>
                      {!isCollapsed && (
                        <span className="text-[13px] truncate">{item.label}</span>
                      )}
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        </nav>

        {/* Footer: Settings (Full Width) + Bottom Utility Bar */}
        <div
          className={cn(
            "border-t border-border-subtle shrink-0 flex flex-col gap-1.5",
            isCollapsed ? "py-2 px-1.5 items-center" : "py-2 px-2.5"
          )}
        >
          <Link
            href="/dashboard/profile"
            prefetch={true}
            onMouseEnter={() => prefetchRoute("/dashboard/profile")}
            onClick={onClose}
            title={isCollapsed ? "Settings" : undefined}
            className={cn(
              "flex items-center rounded-lg transition-colors duration-150 group",
              isCollapsed ? "justify-center size-8 px-0" : "gap-2 h-7.5 px-2 w-full",
              isActive("/dashboard/profile")
                ? "bg-primary/10 text-primary font-semibold"
                : "text-text-muted hover:bg-surface-2 hover:text-text-main"
            )}
          >
            <span
              className={cn(
                "material-symbols-outlined text-[16px] shrink-0",
                isActive("/dashboard/profile") ? "fill-1 text-primary" : "text-text-muted group-hover:text-text-main"
              )}
            >
              settings
            </span>
            {!isCollapsed && <span className="text-xs font-medium truncate">Settings</span>}
          </Link>

          {/* Quick utility controls */}
          <div
            className={cn(
              "flex items-center pt-1 border-t border-border-subtle/40",
              isCollapsed ? "flex-col gap-1 w-full" : "justify-between w-full"
            )}
          >
            {!isCollapsed && (
              <span className="text-[10px] font-mono text-text-subtle/80 pl-1 select-none">
                v{APP_CONFIG.version}
              </span>
            )}
            <div className={cn("flex items-center", isCollapsed ? "flex-col gap-1" : "gap-1")}>
              <ThemeToggle className="size-7 rounded-lg p-1 text-text-muted hover:text-text-main hover:bg-black/5 dark:hover:bg-white/5 transition-colors" />
              <HeaderLanguage />
              <HeaderMenu onLogout={handleLogout} direction="up" />
            </div>
          </div>
        </div>
      </aside>

      {/* 1-Click Auto Update Modal */}
      <AutoUpdateModal
        isOpen={showUpdateModal}
        onClose={() => setShowUpdateModal(false)}
        latestVersion={updateInfo?.latestVersion}
        currentVersion={APP_CONFIG.version}
      />

      {/* Disconnected / Updating Overlay */}
      {(isDisconnected || isUpdating) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-6">
          {isUpdating ? (
            <ManualUpdatePanel
              latestVersion={updateInfo?.latestVersion}
              installCmd={INSTALL_CMD}
              copied={copied}
              onCopyAndShutdown={handleCopyAndShutdown}
              onCancel={handleCancelUpdate}
              countdown={shutdownCountdown}
              isDisconnected={isDisconnected}
            />
          ) : (
            <div className="text-center p-8">
              <div className="flex items-center justify-center size-16 rounded-full bg-red-500/20 text-red-500 mx-auto mb-4">
                <span className="material-symbols-outlined text-[32px]">power_off</span>
              </div>
              <h2 className="text-xl font-semibold text-white mb-2">Server Disconnected</h2>
              <p className="text-text-muted mb-6">The proxy server has been stopped.</p>
              <Button variant="secondary" onClick={() => globalThis.location.reload()}>
                Reload Page
              </Button>
            </div>
          )}
        </div>
      )}
    </>
  );
}

Sidebar.propTypes = {
  onClose: PropTypes.func,
};

function ManualUpdatePanel({
  latestVersion,
  installCmd,
  copied,
  onCopyAndShutdown,
  onCancel,
  countdown,
  isDisconnected,
}) {
  const isCountingDown = countdown > 0;
  return (
    <div className="w-full max-w-lg rounded-xl bg-neutral-900/95 border border-white/10 p-6 text-white">
      <div className="flex items-center gap-3 mb-4">
        <div className="flex items-center justify-center size-11 rounded-full bg-amber-500/20 text-amber-400">
          <span className="material-symbols-outlined text-[24px]">content_copy</span>
        </div>
        <div>
          <h2 className="text-lg font-semibold">
            Update 9Router{latestVersion ? ` to v${latestVersion}` : ""}
          </h2>
          <p className="text-xs text-white/60">
            {isDisconnected
              ? "Server stopped. Paste the command into a terminal to install."
              : isCountingDown
                ? `Command copied. Server will stop in ${countdown}s...`
                : "Click the button below to copy the install command and shutdown."}
          </p>
        </div>
      </div>

      <p className="text-sm text-white/80 mb-2">Install command:</p>
      <div className="w-full px-3 py-2 rounded bg-white/5 mb-4">
        <code className="text-xs font-mono text-amber-400 break-all">{installCmd}</code>
      </div>

      <ol className="text-xs text-white/70 space-y-1 list-decimal list-inside mb-4">
        <li>
          Click <strong>Copy & Shutdown</strong> below.
        </li>
        <li>Paste the command into your terminal and press Enter.</li>
        <li>
          Run <code className="px-1 rounded bg-white/10 text-green-400">9router</code> again after install.
        </li>
      </ol>

      {isDisconnected ? (
        <Button variant="secondary" fullWidth onClick={() => globalThis.location.reload()}>
          Reload Page
        </Button>
      ) : (
        <div className="flex gap-2">
          <Button variant="secondary" onClick={onCancel} disabled={isCountingDown}>
            Cancel
          </Button>
          <Button variant="primary" fullWidth onClick={onCopyAndShutdown} disabled={isCountingDown}>
            {copied
              ? "✓ Copied — shutting down..."
              : isCountingDown
                ? `Shutting down in ${countdown}s`
                : "Copy & Shutdown"}
          </Button>
        </div>
      )}
    </div>
  );
}

ManualUpdatePanel.propTypes = {
  latestVersion: PropTypes.string,
  installCmd: PropTypes.string.isRequired,
  copied: PropTypes.bool,
  onCopyAndShutdown: PropTypes.func.isRequired,
  onCancel: PropTypes.func.isRequired,
  countdown: PropTypes.number,
  isDisconnected: PropTypes.bool,
};

export default memo(Sidebar);
