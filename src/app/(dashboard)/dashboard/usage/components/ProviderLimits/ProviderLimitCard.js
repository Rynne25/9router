"use client";

import { useState } from "react";
import Card from "@/shared/components/Card";
import ProviderIcon from "@/shared/components/ProviderIcon";
import Badge from "@/shared/components/Badge";
import QuotaProgressBar from "./QuotaProgressBar";
import { getRemainingPercentage, pairQuotasByFamily } from "./utils";

const planVariants = {
  free: "default",
  pro: "primary",
  ultra: "success",
  enterprise: "info",
};

export default function ProviderLimitCard({
  provider,
  name,
  plan,
  quotas = [],
  message = null,
  loading = false,
  error = null,
  onRefresh,
}) {
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = async () => {
    if (!onRefresh || refreshing) return;

    setRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setRefreshing(false);
    }
  };

  // Get provider info from config
  const getProviderColor = () => {
    const colors = {
      github: "#000000",
      antigravity: "#4285F4",
      codex: "#10A37F",
      kiro: "#FF9900",
      qoder: "#EC4899",
      "qoder-cn": "#EC4899",
      claude: "#D97757",
    };
    return colors[provider?.toLowerCase()] || "#6B7280";
  };

  const providerColor = getProviderColor();
  const planVariant = planVariants[plan?.toLowerCase()] || "default";

  return (
    <Card padding="md" className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {/* Provider Logo */}
          <div
            className="size-10 rounded-lg flex items-center justify-center p-1.5"
            style={{ backgroundColor: `${providerColor}15` }}
          >
            <ProviderIcon
              src={`/providers/${provider}.png`}
              alt={provider || "Provider"}
              size={40}
              className="object-contain rounded-lg"
              fallbackText={provider?.slice(0, 2).toUpperCase() || "PR"}
              fallbackColor={providerColor}
            />
          </div>

          <div>
            <h3 className="font-semibold text-text-primary">
              {name || provider}
            </h3>
            {plan && (
              <Badge
                variant={planVariants[plan?.toLowerCase()] || "default"}
                size="xs"
              >
                {plan}
              </Badge>
            )}
          </div>
        </div>

        {/* Refresh Button */}
        <button
          onClick={handleRefresh}
          disabled={refreshing || loading}
          className="p-2 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          title="Refresh quota"
        >
          <span
            className={`material-symbols-outlined text-[20px] text-text-muted ${
              refreshing || loading ? "animate-spin" : ""
            }`}
          >
            refresh
          </span>
        </button>
      </div>

      {/* Loading State */}
      {loading && (
        <div className="space-y-4">
          <div className="space-y-2">
            <div className="h-4 bg-black/5 dark:bg-white/5 rounded animate-pulse" />
            <div className="h-2 bg-black/5 dark:bg-white/5 rounded animate-pulse" />
          </div>
          <div className="space-y-2">
            <div className="h-4 bg-black/5 dark:bg-white/5 rounded animate-pulse" />
            <div className="h-2 bg-black/5 dark:bg-white/5 rounded animate-pulse" />
          </div>
        </div>
      )}

      {/* Error State */}
      {!loading && error && (
        <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/20">
          <div className="flex items-start gap-2">
            <span className="material-symbols-outlined text-red-500 text-[20px]">
              error
            </span>
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          </div>
        </div>
      )}

      {/* Info Message (for providers without API) */}
      {!loading && !error && message && (
        <div className="p-4 rounded-lg bg-blue-500/10 border border-blue-500/20">
          <div className="flex items-start gap-2">
            <span className="material-symbols-outlined text-blue-500 text-[20px]">
              info
            </span>
            <p className="text-sm text-blue-600 dark:text-blue-400">
              {message}
            </p>
          </div>
        </div>
      )}

      {/* Quota Progress Bars (Dual-Bar family pairing + standalone) */}
      {!loading && !error && !message && quotas?.length > 0 && (() => {
        const { paired: pairedRows = [], singles: singleRows = [] } = pairQuotasByFamily(quotas);

        return (
          <div className="space-y-3">
            {pairedRows.length > 0 && (
              <div className="liquid-glass-panel rounded-xl p-2.5 space-y-2.5">
                <div className="flex items-center justify-between border-b border-black/[0.06] pb-1.5 dark:border-white/[0.08]">
                  <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-text-muted">
                    <span className="material-symbols-outlined text-[13px] text-primary">
                      view_column_2
                    </span>
                    <span>Gộp theo dòng Model (5h / Ngày • Tuần)</span>
                  </div>
                  <span className="text-[10px] tabular-nums text-text-muted/70">
                    {pairedRows.length} dòng
                  </span>
                </div>
                <div className="space-y-2.5">
                  {pairedRows.map((row) => (
                    <div
                      key={row.familyKey}
                      className="rounded-xl border border-black/[0.06] bg-white/40 p-2.5 dark:border-white/[0.08] dark:bg-white/[0.02] space-y-2"
                    >
                      <div className="flex items-center gap-1.5 text-xs font-semibold text-text-primary">
                        <span className="material-symbols-outlined text-[15px] text-primary">
                          {row.icon || "layers"}
                        </span>
                        <span>{row.title || row.familyLabel}</span>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {row.daily && (
                          <QuotaProgressBar
                            label="5h / Ngày"
                            used={row.daily.used}
                            total={row.daily.total}
                            percentage={getRemainingPercentage(row.daily)}
                            unlimited={row.daily.unlimited === true || row.daily.total === 0 || row.daily.total === null}
                            resetTime={row.daily.resetAt}
                            recurring={row.daily.recurring !== false}
                          />
                        )}
                        {row.weekly && (
                          <QuotaProgressBar
                            label="Tuần"
                            used={row.weekly.used}
                            total={row.weekly.total}
                            percentage={getRemainingPercentage(row.weekly)}
                            unlimited={row.weekly.unlimited === true || row.weekly.total === 0 || row.weekly.total === null}
                            resetTime={row.weekly.resetAt}
                            recurring={row.weekly.recurring !== false}
                          />
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {singleRows.length > 0 && (
              <div className="liquid-glass-panel rounded-xl p-2.5 space-y-2.5">
                {pairedRows.length > 0 && (
                  <div className="flex items-center justify-between border-b border-black/[0.06] pb-1.5 dark:border-white/[0.08]">
                    <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-text-muted">
                      <span className="material-symbols-outlined text-[13px] text-sky-500">
                        tune
                      </span>
                      <span>Model đơn lẻ & Chuyên biệt</span>
                    </div>
                    <span className="text-[10px] tabular-nums text-text-muted/70">
                      {singleRows.length}
                    </span>
                  </div>
                )}
                <div className="space-y-2.5">
                  {singleRows.map((quota, index) => {
                    const percentage = getRemainingPercentage(quota);
                    const unlimited = quota.unlimited === true || quota.total === 0 || quota.total === null;

                    return (
                      <QuotaProgressBar
                        key={`${quota.modelKey || quota.name}-${index}`}
                        label={quota.cleanTitle || quota.name}
                        used={quota.used}
                        total={quota.total}
                        percentage={percentage}
                        unlimited={unlimited}
                        resetTime={quota.resetAt}
                        recurring={quota.recurring !== false}
                      />
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        );
      })()}

      {/* Empty State */}
      {!loading && !error && !message && quotas?.length === 0 && (
        <div className="text-center py-8 text-text-muted">
          <span className="material-symbols-outlined text-[48px] opacity-20">
            data_usage
          </span>
          <p className="text-sm mt-2">No quota data available</p>
        </div>
      )}
    </Card>
  );
}
