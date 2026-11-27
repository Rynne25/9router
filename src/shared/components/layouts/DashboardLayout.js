"use client";

import { useState, useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useNotificationStore } from "@/store/notificationStore";
import { fetchWithCache, fetchJson } from "@/shared/utils/swrCache";
import useSettingsStore from "@/store/settingsStore";
import { OrbitalShaderBg, CommandPalette, CursorEngine } from "@/shared/components/hud";
import Sidebar from "../Sidebar";
import Header from "../Header";

const PREFETCH_ROUTES = [
  "/dashboard/endpoint",
  "/dashboard/providers",
  "/dashboard/providers/antigravity",
  "/dashboard/combos",
  "/dashboard/quota",
  "/dashboard/mitm",
  "/dashboard/token-saver",
  "/dashboard/console-log",
  "/dashboard/usage",
  "/dashboard/cli-tools",
];

function getToastStyle(type) {
  if (type === "success") {
    return {
      wrapper:
        "border-emerald-500/35 bg-surface/95 text-emerald-700 dark:text-emerald-300 shadow-[0_12px_32px_-8px_rgba(16,185,129,0.25)]",
      rail: "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.75)]",
      icon: "check_circle",
    };
  }
  if (type === "error") {
    return {
      wrapper:
        "border-rose-500/35 bg-surface/95 text-rose-700 dark:text-rose-300 shadow-[0_12px_32px_-8px_rgba(244,63,94,0.25)]",
      rail: "bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.75)]",
      icon: "error",
    };
  }
  if (type === "warning") {
    return {
      wrapper:
        "border-amber-500/35 bg-surface/95 text-amber-700 dark:text-amber-300 shadow-[0_12px_32px_-8px_rgba(245,158,11,0.25)]",
      rail: "bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.75)]",
      icon: "warning",
    };
  }
  return {
    wrapper:
      "border-cyan-500/35 bg-surface/95 text-cyan-700 dark:text-cyan-300 shadow-[0_12px_32px_-8px_rgba(6,182,212,0.25)]",
    rail: "bg-cyan-500 shadow-[0_0_8px_rgba(6,182,212,0.75)]",
    icon: "info",
  };
}

export default function DashboardLayout({ children }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const notifications = useNotificationStore((state) => state.notifications);
  const removeNotification = useNotificationStore((state) => state.removeNotification);

  // Preload heavy usage charts, route chunks, and shared API data in background when browser is idle
  useEffect(() => {
    const preload = () => {
      for (const route of PREFETCH_ROUTES) {
        try {
          router.prefetch(route);
        } catch {
          /* ignore prefetch error */
        }
      }
      useSettingsStore.getState().fetchSettings().catch(() => {});
      fetchWithCache("/api/settings", () => fetchJson("/api/settings"), { ttlMs: 30000 }).catch(() => {});
      fetchWithCache("/api/providers", () => fetchJson("/api/providers"), { ttlMs: 30000 }).catch(() => {});
      fetchWithCache("/api/keys", () => fetchJson("/api/keys"), { ttlMs: 30000 }).catch(() => {});
      fetchWithCache("/api/combos", () => fetchJson("/api/combos"), { ttlMs: 30000 }).catch(() => {});
      import("@/shared/components/UsageStats").catch(() => {});
      import("@/app/(dashboard)/dashboard/usage/components/UsageChart").catch(() => {});
      import("@/app/(dashboard)/dashboard/usage/components/ProviderBarChart").catch(() => {});
      import("@/app/(dashboard)/dashboard/usage/components/TopModelsChart").catch(() => {});
    };
    if (typeof window !== "undefined") {
      if ("requestIdleCallback" in window) {
        const id = window.requestIdleCallback(preload, { timeout: 2500 });
        return () => window.cancelIdleCallback(id);
      }
      const timer = setTimeout(preload, 1200);
      return () => clearTimeout(timer);
    }
  }, [router]);

  const isBasicChat = pathname === "/dashboard/basic-chat";
  const isConsoleLog = pathname?.startsWith("/dashboard/console-log");
  const isBoundedViewport = isBasicChat || isConsoleLog;

  return (
    <div className="flex h-screen w-full overflow-hidden liquid-aurora-canvas relative">
      {/* Tactical Orbital Shader Background, Cursor Engine & Global Command Palette */}
      <OrbitalShaderBg />
      <CursorEngine />
      <CommandPalette />

      {/* Ambient Orbital Top Spotlight */}
      <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden" aria-hidden="true">
        <div className="absolute -top-40 left-1/2 -translate-x-1/2 h-[340px] w-[780px] rounded-full bg-cyan-500/[0.06] dark:bg-cyan-400/[0.09] blur-[120px]" />
      </div>

      {/* Chamfered HUD Toast Stack */}
      <div className="fixed top-14 right-4 z-[80] flex w-[min(92vw,380px)] flex-col gap-2">
        {notifications.map((n) => {
          const style = getToastStyle(n.type);
          return (
            <div
              key={n.id}
              className={`relative overflow-hidden rounded-xl border pl-4 pr-3.5 py-2.5 backdrop-blur-xl transition-all ${style.wrapper}`}
            >
              <span
                className={`absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-r-full ${style.rail}`}
                aria-hidden="true"
              />
              <div className="flex items-start gap-2.5">
                <span className="material-symbols-outlined text-[18px] leading-5 shrink-0">{style.icon}</span>
                <div className="min-w-0 flex-1">
                  {n.title ? <p className="text-xs font-semibold tracking-tight mb-0.5">{n.title}</p> : null}
                  <p className="text-xs whitespace-pre-wrap break-words opacity-90">{n.message}</p>
                </div>
                {n.dismissible ? (
                  <button
                    type="button"
                    onClick={() => removeNotification(n.id)}
                    className="text-current/70 hover:text-current transition-colors shrink-0"
                    aria-label="Dismiss notification"
                  >
                    <span className="material-symbols-outlined text-[16px]">close</span>
                  </button>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>

      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-950/55 backdrop-blur-sm lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar - Desktop */}
      <div className="hidden lg:flex shrink-0 relative z-20">
        <Sidebar />
      </div>

      {/* Sidebar - Mobile */}
      <div
        className={`fixed inset-y-0 left-0 z-50 transform lg:hidden transition-transform duration-200 ease-out ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <Sidebar onClose={() => setSidebarOpen(false)} />
      </div>

      {/* Main content */}
      <main className="flex flex-col flex-1 h-full min-w-0 relative z-10 bg-transparent transition-colors duration-200 isolate">
        <Header onMenuClick={() => setSidebarOpen(true)} />
        <div
          className={`flex-1 min-h-0 overscroll-contain touch-pan-y custom-scrollbar ${
            isBasicChat ? "" : "p-3 sm:p-4 lg:p-5"
          } ${isBoundedViewport ? "flex flex-col overflow-hidden" : "overflow-y-auto"}`}
        >
          <div
            className={
              isBasicChat
                ? "flex-1 w-full h-full flex flex-col"
                : isConsoleLog
                  ? "w-full max-w-[1920px] mx-auto flex-1 min-h-0 flex flex-col"
                  : "w-full max-w-[1920px] mx-auto"
            }
          >
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}
