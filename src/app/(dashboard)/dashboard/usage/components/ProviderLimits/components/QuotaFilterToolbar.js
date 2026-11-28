"use client";

import { useState } from "react";
import ProviderIcon from "@/shared/components/ProviderIcon";
import { cn } from "@/shared/utils/cn";
import { providerLabel, shouldResetPage } from "../utils";

export default function QuotaFilterToolbar({
  sortedCount,
  totalCount,
  isInitialLoading,
  isRevalidating,
  providerFilter,
  onProviderFilterChange,
  providerOptions = [],
  autoRefresh,
  onToggleAutoRefresh,
  countdown,
  refreshingAll,
  onRefreshAll,
  warmingUpAll,
  onWarmupAll,
  onResetPage,
  layoutMode = "3",
  onLayoutModeChange,
  hasAntigravity = true,
}) {
  const [providerMenuOpen, setProviderMenuOpen] = useState(false);

  const selectedProviderLabel =
    providerFilter === "all" ? "Tất cả provider" : providerLabel(providerFilter);

  const selectProvider = (nextProvider) => {
    if (shouldResetPage(providerFilter, nextProvider)) {
      onResetPage?.();
    }
    onProviderFilterChange?.(nextProvider);
    setProviderMenuOpen(false);
  };

  const countBadgeText = isInitialLoading
    ? "Đang tải..."
    : sortedCount !== totalCount
      ? `${sortedCount}/${totalCount} tài khoản`
      : `${sortedCount} tài khoản`;

  return (
    <div
      className="liquid-glass-panel rounded-2xl px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-2.5"
      suppressHydrationWarning
    >
      {/* Left: Brand Title & Count Badge */}
      <div className="flex flex-wrap items-center gap-2.5 min-w-0">
        <div className="size-7.5 rounded-xl bg-gradient-to-br from-primary/20 to-amber-500/15 border border-primary/25 flex items-center justify-center shrink-0">
          <span className="material-symbols-outlined text-[17px] text-primary">
            data_usage
          </span>
        </div>
        <div className="flex items-center gap-2">
          <h1 className="text-sm font-bold tracking-tight text-text-main">
            Theo dõi hạn mức
          </h1>
          <span
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold tabular-nums",
              isInitialLoading
                ? "border-sky-500/25 bg-sky-500/10 text-sky-600 dark:text-sky-400"
                : "border-primary/25 bg-primary/10 text-primary",
            )}
          >
            {(isInitialLoading || isRevalidating) && (
              <span className="size-1.5 rounded-full bg-current animate-ping" />
            )}
            <span>{countBadgeText}</span>
          </span>
          {isRevalidating && !isInitialLoading && (
            <span className="hidden md:inline-flex items-center gap-1 text-[11px] text-text-muted">
              <span className="material-symbols-outlined text-[12px] animate-spin">
                sync
              </span>
              Đồng bộ
            </span>
          )}
        </div>

        {/* Provider Dropdown (The only filter kept per user request) */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setProviderMenuOpen((prev) => !prev)}
            className="flex h-7.5 items-center justify-between gap-1.5 rounded-xl border border-black/10 bg-white/60 px-2.5 text-xs font-medium text-text-primary transition-all hover:bg-white dark:border-white/10 dark:bg-white/[0.05] dark:hover:bg-white/10 cursor-pointer"
            aria-haspopup="menu"
            aria-expanded={providerMenuOpen}
            title="Lọc theo Provider"
          >
            <span className="flex min-w-0 items-center gap-1.5">
              {providerFilter === "all" ? (
                <span className="material-symbols-outlined text-[15px] text-primary">
                  apps
                </span>
              ) : (
                <ProviderIcon
                  src={`/providers/${providerFilter}.png`}
                  alt={providerFilter}
                  size={15}
                  className="size-3.5 rounded object-contain"
                  fallbackText={providerFilter.slice(0, 2).toUpperCase()}
                />
              )}
              <span className="truncate max-w-[120px]">{selectedProviderLabel}</span>
            </span>
            <span className="material-symbols-outlined text-[14px] text-text-muted">
              expand_more
            </span>
          </button>

          {providerMenuOpen && (
            <>
              <button
                type="button"
                className="fixed inset-0 z-30 bg-transparent"
                aria-label="Đóng menu provider"
                onClick={() => setProviderMenuOpen(false)}
              />
              <div className="absolute left-0 z-40 mt-1.5 w-60 overflow-hidden rounded-2xl border border-black/10 bg-bg/95 p-1.5 shadow-xl shadow-black/15 backdrop-blur-xl dark:border-white/15">
                <button
                  type="button"
                  onClick={() => selectProvider("all")}
                  className={cn(
                    "flex w-full items-center gap-2.5 rounded-xl px-2.5 py-1.5 text-left text-xs transition-colors cursor-pointer",
                    providerFilter === "all"
                      ? "bg-primary/12 text-primary font-semibold"
                      : "text-text-primary hover:bg-black/5 dark:hover:bg-white/10",
                  )}
                >
                  <span className="material-symbols-outlined text-[18px]">apps</span>
                  <span>Tất cả provider</span>
                  {providerFilter === "all" && (
                    <span className="material-symbols-outlined ml-auto text-[16px]">
                      check
                    </span>
                  )}
                </button>
                <div className="my-1 h-px bg-black/10 dark:bg-white/10" />
                <div className="max-h-64 overflow-y-auto pr-1 space-y-0.5">
                  {providerOptions.map((provider) => (
                    <button
                      key={provider}
                      type="button"
                      onClick={() => selectProvider(provider)}
                      className={cn(
                        "flex w-full items-center gap-2.5 rounded-xl px-2.5 py-1.5 text-left text-xs transition-colors cursor-pointer",
                        providerFilter === provider
                          ? "bg-primary/12 text-primary font-semibold"
                          : "text-text-primary hover:bg-black/5 dark:hover:bg-white/10",
                      )}
                    >
                      <ProviderIcon
                        src={`/providers/${provider}.png`}
                        alt={provider}
                        size={18}
                        className="size-4.5 rounded-md object-contain"
                        fallbackText={provider.slice(0, 2).toUpperCase()}
                      />
                      <span>{providerLabel(provider)}</span>
                      {providerFilter === provider && (
                        <span className="material-symbols-outlined ml-auto text-[16px]">
                          check
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Right: Actions & Layout Density Selector */}
      <div className="flex flex-wrap items-center gap-1.5 ml-auto">
        <button
          type="button"
          onClick={onRefreshAll}
          disabled={refreshingAll || isInitialLoading}
          className="flex h-7.5 shrink-0 items-center gap-1.5 rounded-xl border border-black/10 bg-white/60 px-2.5 text-xs font-semibold text-text-primary transition-all hover:bg-white dark:border-white/10 dark:bg-white/[0.06] dark:hover:bg-white/[0.12] disabled:opacity-50 cursor-pointer"
          title="Làm mới token & hạn mức tất cả tài khoản"
        >
          <span
            className={cn(
              "material-symbols-outlined text-[14px]",
              refreshingAll && "animate-spin text-primary",
            )}
          >
            refresh
          </span>
          <span>{refreshingAll ? "Đang làm mới..." : "Làm mới"}</span>
        </button>

        {hasAntigravity && (
          <button
            type="button"
            onClick={onWarmupAll}
            disabled={warmingUpAll || isInitialLoading}
            className="flex h-7.5 shrink-0 items-center gap-1.5 rounded-xl border border-amber-500/35 bg-gradient-to-r from-amber-500/15 to-orange-500/15 px-2.5 text-xs font-semibold text-amber-700 transition-all hover:from-amber-500/25 hover:to-orange-500/25 dark:text-amber-300 disabled:opacity-50 cursor-pointer"
            title="Làm nóng (Warmup) kích hoạt hạn mức tuần cho tất cả tài khoản Antigravity"
          >
            <span
              className={cn(
                "material-symbols-outlined text-[14px] text-amber-500",
                warmingUpAll && "animate-spin",
              )}
            >
              {warmingUpAll ? "progress_activity" : "local_fire_department"}
            </span>
            <span>{warmingUpAll ? "Đang nóng..." : "Làm nóng"}</span>
          </button>
        )}

        <button
          type="button"
          onClick={onToggleAutoRefresh}
          className={cn(
            "flex h-7.5 shrink-0 items-center gap-1 rounded-xl border px-2 text-xs font-medium transition-all cursor-pointer",
            autoRefresh
              ? "border-primary/30 bg-primary/10 text-primary"
              : "border-black/10 bg-white/40 text-text-muted hover:text-text-primary dark:border-white/10 dark:bg-white/[0.04]",
          )}
          title={autoRefresh ? "Tắt tự động làm mới (60s)" : "Bật tự động làm mới (60s)"}
        >
          <span className="material-symbols-outlined text-[15px]">
            {autoRefresh ? "toggle_on" : "toggle_off"}
          </span>
          <span className="hidden sm:inline">Tự động</span>
          {autoRefresh && (
            <span className="rounded-md bg-primary/15 px-1 py-0.2 text-[9.5px] font-bold tabular-nums">
              {countdown}s
            </span>
          )}
        </button>

        {/* Layout Selector: ICON ONLY with Tooltip per user request */}
        {typeof onLayoutModeChange === "function" && (
          <div
            className="flex h-7.5 shrink-0 items-center rounded-xl border border-black/10 bg-black/[0.04] p-0.5 dark:border-white/10 dark:bg-white/[0.05]"
            title="Chế độ hiển thị lưới"
          >
            {[
              { id: "2", icon: "grid_view", label: "2 cột" },
              { id: "3", icon: "view_column", label: "3 cột" },
              { id: "4", icon: "view_module", label: "4 cột (Tổng quan)" },
              { id: "list", icon: "view_agenda", label: "Danh sách" },
            ].map((mode) => (
              <button
                key={mode.id}
                type="button"
                onClick={() => onLayoutModeChange(mode.id)}
                className={cn(
                  "flex size-6.5 items-center justify-center rounded-lg text-xs font-semibold transition-all cursor-pointer",
                  layoutMode === mode.id
                    ? "bg-primary text-white shadow-xs"
                    : "text-text-muted hover:text-text-primary hover:bg-black/5 dark:hover:bg-white/5",
                )}
                title={`Chế độ ${mode.label}`}
                aria-label={mode.label}
              >
                <span className="material-symbols-outlined text-[15px]">{mode.icon}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
