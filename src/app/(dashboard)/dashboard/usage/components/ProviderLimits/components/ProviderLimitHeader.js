"use client";

import ProviderIcon from "@/shared/components/ProviderIcon";
import Toggle from "@/shared/components/Toggle";
import Tooltip from "@/shared/components/Tooltip";
import { getScheduleSlotLabels } from "@/shared/services/quotaPingSchedule";
import { cn } from "@/shared/utils/cn";
import {
  AUTO_PING_SETTINGS_KEYS,
  formatClaudeResetClears,
  formatCreditDate,
  getAntigravityEffectiveTier,
  getAntigravityTierBadgeClass,
  getCodexResetCreditCount,
  getConnectionAverageRemaining,
  getConnectionHealthStatus,
  getConnectionLabel,
  getConnectionSecondaryLabel,
  getTierBadgeLabel,
  isConnectionValidationBlocked,
  kiroMethodLabel,
  kiroRegion,
  providerLabel,
} from "../utils";

function KiroConnectionBadges({ conn, isInactive, copied, onCopy }) {
  const statusClass = isInactive
    ? "bg-surface-2 text-text-muted"
    : conn.testStatus === "active" || conn.testStatus === "success"
      ? "bg-green-500/10 text-green-600 dark:text-green-400"
      : conn.testStatus === "error" ||
          conn.testStatus === "expired" ||
          conn.testStatus === "unavailable"
        ? "bg-red-500/10 text-red-600 dark:text-red-400"
        : "bg-surface-2 text-text-muted";

  return (
    <div className="mt-1 flex flex-wrap items-center gap-1">
      <span className="rounded-full bg-brand-500/10 px-2 py-0.5 text-[10px] font-semibold text-brand-600 dark:text-brand-300">
        {kiroMethodLabel(conn)}
      </span>
      {kiroRegion(conn) && (
        <span className="rounded-full bg-blue-500/10 px-2 py-0.5 text-[10px] font-semibold text-blue-600 dark:text-blue-400">
          {kiroRegion(conn)}
        </span>
      )}
      <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${statusClass}`}>
        {isInactive ? "Đã tắt" : conn.testStatus || "unknown"}
      </span>
      {conn.providerSpecificData?.profileArn && (
        <button
          type="button"
          onClick={() => onCopy(conn.providerSpecificData.profileArn, conn.id)}
          title={conn.providerSpecificData.profileArn}
          className="inline-flex max-w-full items-center gap-1 rounded-full border border-border-subtle px-2 py-0.5 text-[10px] text-text-muted transition-colors hover:text-primary"
        >
          <span className="material-symbols-outlined text-[12px]">
            {copied === conn.id ? "check" : "content_copy"}
          </span>
          <code className="truncate font-mono">
            {conn.providerSpecificData.profileArn}
          </code>
        </button>
      )}
    </div>
  );
}

function AutoPingActionButton({ conn, autoPingConfigs, onOpenSchedule }) {
  const cfg = autoPingConfigs[conn.provider] || {};
  const isReactive = cfg.connections?.[conn.id] === true;
  const schedule = cfg.schedules?.[conn.id];
  const isSchedule = schedule?.enabled === true;
  const isActive = isReactive || isSchedule;

  const activeModes = [];
  if (isReactive) activeModes.push("Khi reset");
  if (isSchedule) {
    const summary = getScheduleSlotLabels(schedule).join(" / ");
    activeModes.push(`Đặt lịch (${summary || "bật"})`);
  }

  const tooltipText =
    activeModes.length > 0
      ? `Auto-ping đang bật: ${activeModes.join(" + ")}. Nhấn để cấu hình.`
      : conn.provider === "codex"
        ? "Tự động kích hoạt khung 5h Codex tiếp theo khi reset hoặc theo lịch."
        : "Tự động kích hoạt lại hạn mức khi reset hoặc theo lịch cố định.";

  return (
    <Tooltip text={tooltipText}>
      <button
        type="button"
        onClick={() => onOpenSchedule(conn)}
        aria-label="Cấu hình auto-ping"
        className={cn(
          "flex h-6.5 w-6.5 items-center justify-center rounded-lg border border-transparent transition-colors hover:bg-black/5 dark:hover:bg-white/10 cursor-pointer",
          isActive ? "text-primary bg-primary/10 border-primary/20" : "text-text-muted",
        )}
      >
        <span className="material-symbols-outlined text-[15px]">bolt</span>
      </button>
    </Tooltip>
  );
}

const HEALTH_DOT_STYLES = {
  healthy: "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.75)]",
  low: "bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.75)]",
  exhausted: "bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.75)]",
  blocked: "bg-red-500 animate-pulse shadow-[0_0_8px_rgba(239,68,68,0.85)]",
  error: "bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.75)]",
  disabled: "bg-slate-400",
  loading: "bg-sky-400 animate-pulse",
};

export default function ProviderLimitHeader({
  conn,
  quota,
  error,
  isLoading,
  isInactive,
  isDeleting,
  isResettingLimit,
  isWarmingUp,
  rowBusy,
  autoPingConfigs,
  copied,
  onCopy,
  onWarmup,
  onOpenResetConfirm,
  onViewResetCredits,
  onOpenSchedule,
  onRefresh,
  onEdit,
  onDelete,
  onToggleActive,
}) {
  const isAntigravity = conn.provider === "antigravity";
  const isCodex = conn.provider === "codex";
  const claudeReset = conn.provider === "claude" ? quota?.raw?.resetCredits : null;
  const resetLabel = isCodex ? "Codex reset credit" : "Claude limit reset";
  const resetCreditCount = getCodexResetCreditCount(quota);
  const primaryLabel = getConnectionLabel(conn);
  const secondaryLabel = getConnectionSecondaryLabel(conn);
  const isBlocked = isAntigravity && isConnectionValidationBlocked(conn);

  const effectiveTier = isAntigravity ? getAntigravityEffectiveTier(conn, quota) : null;
  const healthStatus = getConnectionHealthStatus(conn, quota, error);
  const avgRemaining = getConnectionAverageRemaining(quota);

  return (
    <div className="px-2.5 py-2 border-b border-black/[0.06] dark:border-white/[0.08] bg-white/35 dark:bg-white/[0.025] space-y-1.5">
      {/* Row 1: Identity + Tier/Avg Badges */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <div className="relative size-7 shrink-0 rounded-lg bg-white/80 dark:bg-white/[0.08] border border-black/[0.08] dark:border-white/[0.1] shadow-xs flex items-center justify-center">
            <ProviderIcon
              src={`/providers/${conn.provider}.png`}
              alt={conn.provider}
              size={18}
              className="size-4.5 object-contain"
              fallbackText={conn.provider?.slice(0, 2).toUpperCase() || "PR"}
            />
            <span
              className={cn(
                "absolute -bottom-0.5 -right-0.5 size-2 rounded-full ring-2 ring-white dark:ring-[#121726]",
                HEALTH_DOT_STYLES[healthStatus] || HEALTH_DOT_STYLES.loading,
              )}
              title={`Trạng thái: ${healthStatus}`}
            />
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1 min-w-0">
              <h3
                className="text-[12.5px] font-bold text-text-primary truncate leading-tight"
                title={primaryLabel || providerLabel(conn.provider)}
              >
                {primaryLabel || providerLabel(conn.provider)}
              </h3>
              {effectiveTier && (
                <span
                  className={cn(
                    "shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-extrabold uppercase tracking-wider leading-none border",
                    getAntigravityTierBadgeClass(effectiveTier),
                  )}
                >
                  {getTierBadgeLabel(effectiveTier)}
                </span>
              )}
              {isBlocked && (
                <span
                  className="shrink-0 inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[9px] font-bold bg-red-500/15 text-red-500 border border-red-500/30"
                  title={
                    conn.providerSpecificData?.validationReason ||
                    conn.lastError ||
                    "403: Tài khoản cần xác minh danh tính Google"
                  }
                >
                  <span className="material-symbols-outlined text-[10px]">lock</span>
                  403
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Average Remaining Pill */}
        {avgRemaining !== null && !isInactive && (
          <div
            className={cn(
              "shrink-0 rounded-lg border px-1.5 py-0.5 text-right leading-none flex items-center gap-1",
              avgRemaining > 70
                ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                : avgRemaining >= 30
                  ? "border-amber-500/25 bg-amber-500/10 text-amber-600 dark:text-amber-400"
                  : "border-rose-500/25 bg-rose-500/10 text-rose-600 dark:text-rose-400",
            )}
            title="Trung bình hạn mức còn lại của tài khoản"
          >
            <span className="text-[11px] font-extrabold tabular-nums">{avgRemaining}%</span>
          </div>
        )}
      </div>

      {conn.provider === "kiro" && (
        <KiroConnectionBadges
          conn={conn}
          isInactive={isInactive}
          copied={copied}
          onCopy={onCopy}
        />
      )}

      {/* Row 2: Compact Meta + Icon-Only Action Strip (Warmup icon sits next to Refresh) */}
      <div className="flex items-center justify-between gap-1">
        <div className="flex items-center gap-1.5 min-w-0 text-[10.5px] text-text-muted">
          <span className="font-medium text-text-muted/85 truncate">
            {secondaryLabel || providerLabel(conn.provider)}
          </span>
          {isInactive && (
            <span className="shrink-0 rounded bg-black/[0.06] dark:bg-white/[0.08] px-1 py-0.5 text-[9px] font-semibold text-text-muted">
              Đã tắt
            </span>
          )}
          {(isCodex || claudeReset) && (
            <div className="flex items-center gap-1 shrink-0">
              <Tooltip
                text={
                  resetCreditCount > 0
                    ? claudeReset
                      ? `Dùng lượt reset ngay (còn ${resetCreditCount}, hạn ${formatCreditDate(claudeReset.expiresAt)}) · làm đầy ${formatClaudeResetClears(claudeReset.clears)}`
                      : `Dùng 1 ${resetLabel}. Hiện có: ${resetCreditCount}`
                    : `Không có ${resetLabel}`
                }
              >
                <button
                  type="button"
                  onClick={() => onOpenResetConfirm({ connection: conn, resetCreditCount })}
                  disabled={resetCreditCount <= 0 || isLoading || rowBusy}
                  aria-label={
                    resetCreditCount > 0
                      ? `Use one ${resetLabel}. ${resetCreditCount} available.`
                      : `No ${resetLabel}s available`
                  }
                  className={cn(
                    "flex h-6 min-w-8 items-center justify-center gap-0.5 rounded-md border px-1.5 text-[10.5px] font-medium tabular-nums transition-colors disabled:cursor-not-allowed disabled:opacity-60 cursor-pointer",
                    resetCreditCount > 0
                      ? "border-primary/30 bg-primary/10 text-primary hover:bg-primary/20"
                      : "border-black/10 bg-black/[0.02] text-text-muted dark:border-white/10 dark:bg-white/[0.03]",
                  )}
                >
                  <span
                    className={`material-symbols-outlined text-[13px] ${isResettingLimit ? "animate-spin" : ""}`}
                  >
                    {isResettingLimit ? "progress_activity" : "restart_alt"}
                  </span>
                  <span>{resetCreditCount}</span>
                </button>
              </Tooltip>
              <Tooltip
                text={
                  isCodex
                    ? "Xem hạn Codex reset credit"
                    : "Xem hạn Claude Code reset"
                }
              >
                <button
                  type="button"
                  onClick={() => onViewResetCredits(conn, claudeReset)}
                  disabled={isLoading || rowBusy}
                  aria-label={
                    isCodex
                      ? "View Codex reset credit expiry"
                      : "View Claude Code reset expiry"
                  }
                  className="flex h-6 w-6 items-center justify-center rounded-md border border-black/10 text-text-muted transition-colors hover:bg-black/5 hover:text-primary disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/10 dark:hover:bg-white/5 cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[14px]">schedule</span>
                </button>
              </Tooltip>
            </div>
          )}
        </div>

        <div className="flex items-center gap-0.5 shrink-0">
          {AUTO_PING_SETTINGS_KEYS[conn.provider] && conn.authType === "oauth" && (
            <AutoPingActionButton
              conn={conn}
              autoPingConfigs={autoPingConfigs}
              onOpenSchedule={onOpenSchedule}
            />
          )}

          {isAntigravity && (
            <Tooltip text="Làm nóng (Warmup) tài khoản này để kích hoạt hạn mức tuần & kiểm tra trạng thái">
              <button
                type="button"
                onClick={() => onWarmup?.(conn)}
                disabled={Boolean(isWarmingUp) || rowBusy}
                aria-label={`Làm nóng tài khoản ${primaryLabel || conn.id}`}
                className={cn(
                  "flex h-6.5 w-6.5 items-center justify-center rounded-lg transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed",
                  isWarmingUp
                    ? "bg-amber-500/20 text-amber-500"
                    : "text-amber-500/85 hover:bg-amber-500/15 hover:text-amber-500",
                )}
              >
                <span
                  className={cn(
                    "material-symbols-outlined text-[16px]",
                    isWarmingUp && "animate-spin",
                  )}
                >
                  {isWarmingUp ? "progress_activity" : "local_fire_department"}
                </span>
              </button>
            </Tooltip>
          )}

          <Tooltip text="Làm mới hạn mức">
            <button
              type="button"
              onClick={() => onRefresh(conn.id, conn.provider)}
              disabled={isLoading || rowBusy}
              aria-label="Làm mới hạn mức"
              className="flex h-6.5 w-6.5 items-center justify-center rounded-lg text-text-muted hover:bg-black/5 hover:text-text-primary dark:hover:bg-white/10 transition-colors disabled:opacity-50 cursor-pointer"
            >
              <span
                className={`material-symbols-outlined text-[15px] ${isLoading ? "animate-spin text-primary" : ""}`}
              >
                refresh
              </span>
            </button>
          </Tooltip>

          <Tooltip text="Chỉnh sửa kết nối">
            <button
              type="button"
              onClick={() => onEdit(conn)}
              disabled={rowBusy}
              aria-label="Chỉnh sửa kết nối"
              className="flex h-6.5 w-6.5 items-center justify-center rounded-lg text-text-muted hover:bg-black/5 hover:text-primary dark:hover:bg-white/10 transition-colors disabled:opacity-50 cursor-pointer"
            >
              <span className="material-symbols-outlined text-[15px]">edit</span>
            </button>
          </Tooltip>

          <Tooltip text="Xóa kết nối">
            <button
              type="button"
              onClick={() => onDelete(conn.id)}
              disabled={rowBusy}
              aria-label="Xóa kết nối"
              className="flex h-6.5 w-6.5 items-center justify-center rounded-lg text-rose-500/80 hover:bg-rose-500/10 hover:text-rose-500 transition-colors disabled:opacity-50 cursor-pointer"
            >
              <span
                className={`material-symbols-outlined text-[15px] ${isDeleting ? "animate-pulse" : ""}`}
              >
                delete
              </span>
            </button>
          </Tooltip>

          <div
            className="inline-flex items-center pl-0.5"
            title={(conn.isActive ?? true) ? "Tắt tài khoản này" : "Bật tài khoản này"}
          >
            <Toggle
              size="sm"
              checked={conn.isActive ?? true}
              disabled={rowBusy}
              onChange={(nextActive) => onToggleActive(conn.id, nextActive)}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
