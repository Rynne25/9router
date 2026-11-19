"use client";

import { useState, useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useNotificationStore } from "@/store/notificationStore";
import { fetchWithCache, fetchJson } from "@/shared/utils/swrCache";
import useSettingsStore from "@/store/settingsStore";
import Sidebar from "../Sidebar";
import Header from "../Header";

const PREFETCH_ROUTES = [
  "/dashboard/endpoint",
  "/dashboard/providers",
  "/dashboard/combos",
  "/dashboard/quota",
  "/dashboard/mitm",
  "/dashboard/console-log",
  "/dashboard/usage",
  "/dashboard/cli-tools",
];

function getToastStyle(type) {
  if (type === "success") {
    return {
      wrapper: "border-green-500/30 bg-green-500/10 text-green-600 dark:text-green-400",
      icon: "check_circle",
    };
  }
  if (type === "error") {
    return {
      wrapper: "border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400",
      icon: "error",
    };
  }
  if (type === "warning") {
    return {
      wrapper: "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400",
      icon: "warning",
    };
  }
  return {
    wrapper: "border-blue-500/30 bg-blue-500/10 text-blue-600 dark:text-blue-400",
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
      {/* Ambient Liquid Glass Light Orbs */}
      <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden" aria-hidden="true">
        <div
          className="absolute -top-28 -left-24 h-[420px] w-[420px] rounded-full bg-sky-500/15 dark:bg-sky-500/18 blur-[110px] will-change-transform"
          style={{ animation: "auroraFloatSlow 18s ease-in-out infinite" }}
        />
        <div
          className="absolute top-1/4 -right-28 h-[460px] w-[460px] rounded-full bg-violet-500/14 dark:bg-indigo-500/18 blur-[125px] will-change-transform"
          style={{ animation: "auroraFloatSlow 22s ease-in-out infinite reverse" }}
        />
        <div
          className="absolute -bottom-32 left-1/3 h-[400px] w-[480px] rounded-full bg-brand-500/12 dark:bg-brand-500/15 blur-[120px] will-change-transform"
          style={{ animation: "auroraFloatSlow 20s ease-in-out infinite" }}
        />
      </div>

      <div className="fixed top-4 right-4 z-[80] flex w-[min(92vw,380px)] flex-col gap-2">
        {notifications.map((n) => {
          const style = getToastStyle(n.type);
          return (
            <div
              key={n.id}
              className={`rounded-xl border px-3.5 py-2.5 shadow-xl backdrop-blur-xl ${style.wrapper}`}
            >
              <div className="flex items-start gap-2">
                <span className="material-symbols-outlined text-[18px] leading-5">{style.icon}</span>
                <div className="min-w-0 flex-1">
                  {n.title ? <p className="text-xs font-semibold mb-0.5">{n.title}</p> : null}
                  <p className="text-xs whitespace-pre-wrap break-words">{n.message}</p>
                </div>
                {n.dismissible ? (
                  <button
                    type="button"
                    onClick={() => removeNotification(n.id)}
                    className="text-current/70 hover:text-current"
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
          className="fixed inset-0 z-40 bg-black/45 backdrop-blur-sm lg:hidden"
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
