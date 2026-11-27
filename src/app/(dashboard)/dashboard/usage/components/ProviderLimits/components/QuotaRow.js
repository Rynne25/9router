"use client";

import { useState } from "react";
import { cn } from "@/shared/utils/cn";
import QuotaTable from "../QuotaTable";
import {
  getConnectionValidationUrl,
  getQuotaVisibilityKey,
  isConnectionValidationBlocked,
} from "../utils";

export default function QuotaRow({
  conn,
  provider,
  quota,
  visibleQuotas,
  hiddenQuotaRows,
  isLoading,
  error,
  quotaSortMode,
  compact = false,
  warmupFeedback,
  onClearWarmupFeedback,
  onHideQuota,
  onShowQuota,
}) {
  const [copiedVerifyUrl, setCopiedVerifyUrl] = useState(false);

  const isBlocked =
    provider === "antigravity" && isConnectionValidationBlocked(conn);
  const connValidationUrl = getConnectionValidationUrl(conn);
  const effectiveValidationUrl =
    warmupFeedback?.validationUrl || connValidationUrl;

  const showStoredBlockedBanner =
    isBlocked && !warmupFeedback;

  const handleCopyVerifyUrl = async (url) => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopiedVerifyUrl(true);
      setTimeout(() => setCopiedVerifyUrl(false), 2000);
    } catch {
      // Ignore clipboard error
    }
  };

  return (
    <div
      className={cn(
        "px-3 py-2.5 space-y-2 flex-1 min-w-0",
        "[&_.liquid-glass-tube]:h-[7px] [&_.liquid-glass-tube]:rounded-full [&_.liquid-glass-tube]:bg-slate-900/12 dark:[&_.liquid-glass-tube]:bg-cyan-950/60 [&_.liquid-glass-tube]:border [&_.liquid-glass-tube]:border-cyan-500/20",
        "[&_.liquid-glass-fill]:rounded-full",
      )}
    >

      {/* Inline Warmup Feedback Banner */}
      {warmupFeedback && (
        <div
          className={cn(
            "rounded-xl border px-2.5 py-2 text-[11px] flex flex-col gap-1.5",
            warmupFeedback.ok
              ? "border-emerald-500/35 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
              : "border-rose-500/35 bg-rose-500/10 text-rose-700 dark:text-rose-300",
          )}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-start gap-1.5 min-w-0">
              <span className="material-symbols-outlined text-[15px] shrink-0 mt-0.5">
                {warmupFeedback.ok ? "check_circle" : "error"}
              </span>
              <span className="leading-snug break-words">{warmupFeedback.message}</span>
            </div>
            {typeof onClearWarmupFeedback === "function" && (
              <button
                type="button"
                onClick={() => onClearWarmupFeedback(conn.id)}
                className="shrink-0 opacity-70 hover:opacity-100 cursor-pointer"
                aria-label="Đóng thông báo làm nóng"
              >
                <span className="material-symbols-outlined text-[14px]">close</span>
              </button>
            )}
          </div>

          {effectiveValidationUrl && !warmupFeedback.ok && (
            <div className="flex flex-wrap items-center gap-1.5 pl-5">
              <a
                href={effectiveValidationUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 rounded-lg bg-rose-600 px-2.5 py-1 font-mono text-[10.5px] font-semibold text-white hover:bg-rose-700 transition-colors"
              >
                <span className="material-symbols-outlined text-[13px]">open_in_new</span>
                <span>Mở trang xác minh</span>
              </a>
              <button
                type="button"
                onClick={() => handleCopyVerifyUrl(effectiveValidationUrl)}
                className="inline-flex items-center gap-1 rounded-lg border border-rose-500/35 bg-white/70 px-2 py-1 font-mono text-[10.5px] font-medium text-rose-700 hover:bg-white dark:bg-white/10 dark:text-rose-200 cursor-pointer"
              >
                <span className="material-symbols-outlined text-[12px]">
                  {copiedVerifyUrl ? "check" : "content_copy"}
                </span>
                <span>{copiedVerifyUrl ? "Đã sao chép" : "Sao chép link"}</span>
              </button>
            </div>
          )}
        </div>
      )}

      {/* Persistent 403 Verification Alert when account is validationBlocked */}
      {showStoredBlockedBanner && (
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-2.5 py-2 text-[11px] text-amber-800 dark:text-amber-200 space-y-1.5">
          <div className="flex items-start gap-1.5">
            <span className="material-symbols-outlined text-[15px] text-amber-500 shrink-0 mt-0.5">
              gpp_maybe
            </span>
            <span className="leading-snug">
              <span className="mr-1.5 inline-flex items-center rounded border border-amber-500/40 bg-amber-500/15 px-1 py-0.2 font-mono text-[9.5px] font-bold uppercase">
                HTTP 403
              </span>
              Tài khoản đang bị chặn xác minh Google.{" "}
              {effectiveValidationUrl
                ? "Hoàn thành xác minh rồi nhấn Làm nóng để mở khóa."
                : "Nhấn Làm nóng để kiểm tra lại hoặc lấy link xác minh."}
            </span>
          </div>
          {effectiveValidationUrl && (
            <div className="flex flex-wrap items-center gap-1.5 pl-5">
              <a
                href={effectiveValidationUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 rounded-lg bg-amber-600 px-2.5 py-1 font-mono text-[10.5px] font-semibold text-white hover:bg-amber-700 transition-colors"
              >
                <span className="material-symbols-outlined text-[13px]">open_in_new</span>
                <span>Xác minh ngay</span>
              </a>
              <button
                type="button"
                onClick={() => handleCopyVerifyUrl(effectiveValidationUrl)}
                className="inline-flex items-center gap-1 rounded-lg border border-amber-500/35 bg-white/70 px-2 py-1 font-mono text-[10.5px] font-medium text-amber-800 hover:bg-white dark:bg-white/10 dark:text-amber-200 cursor-pointer"
              >
                <span className="material-symbols-outlined text-[12px]">
                  {copiedVerifyUrl ? "check" : "content_copy"}
                </span>
                <span>{copiedVerifyUrl ? "Đã sao chép" : "Sao chép link"}</span>
              </button>
            </div>
          )}
        </div>
      )}

      {/* Main Quota Bars / Loading / Error */}
      {!quota && isLoading ? (
        <div className="space-y-2 py-2 animate-pulse">
          <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/[0.03] p-2.5 space-y-2">
            <div className="flex justify-between">
              <div className="h-3 w-16 rounded bg-cyan-500/15" />
              <div className="h-3 w-10 rounded bg-cyan-500/15" />
            </div>
            <div className="h-2 w-full rounded-full bg-cyan-500/15" />
          </div>
        </div>
      ) : error ? (
        <div className="rounded-xl border border-rose-500/35 bg-rose-500/10 p-3 flex items-start gap-2 text-rose-700 dark:text-rose-300">
          <span className="material-symbols-outlined text-[18px] shrink-0">error</span>
          <p className="font-mono text-[11px] leading-relaxed break-words">{error}</p>
        </div>
      ) : visibleQuotas.length === 0 && quota?.message ? (
        <div className="rounded-xl border border-cyan-500/25 bg-cyan-500/10 p-3 flex items-start gap-2 text-cyan-700 dark:text-cyan-300">
          <span className="material-symbols-outlined text-[18px] shrink-0">info</span>
          <p className="text-xs leading-relaxed">{quota.message}</p>
        </div>
      ) : visibleQuotas.length === 0 ? (
        <div className="rounded-xl border border-cyan-500/15 bg-black/[0.02] dark:bg-white/[0.02] py-4 text-center font-mono text-xs text-text-muted">
          Chưa có dữ liệu hạn mức chi tiết
        </div>
      ) : (
        <QuotaTable
          quotas={visibleQuotas}
          sortMode="default"
          compact={compact}
          showSortLabel={provider === "codex" && quotaSortMode !== "default"}
          onHideQuota={(quotaRow) => onHideQuota(provider, quotaRow)}
        />
      )}

      {quota?.message && visibleQuotas.length > 0 && !error && !isLoading && (
        <p className="px-1 font-mono text-[10.5px] leading-relaxed text-text-muted">
          {quota.message}
        </p>
      )}

      {hiddenQuotaRows.length > 0 && (
        <div className="mt-1.5 flex min-w-0 items-center gap-1.5 border-t border-cyan-500/15 pt-1.5 font-mono text-[10px] text-text-muted">
          <span className="material-symbols-outlined shrink-0 text-[13px]">
            visibility_off
          </span>
          <span className="shrink-0">Đang ẩn:</span>
          <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto whitespace-nowrap">
            {hiddenQuotaRows.map((quotaRow) => (
              <button
                key={getQuotaVisibilityKey(quotaRow)}
                type="button"
                onClick={() => onShowQuota(provider, quotaRow)}
                className="shrink-0 rounded-md border border-cyan-500/25 bg-cyan-500/[0.06] px-1.5 py-0.5 transition-colors hover:bg-cyan-500/15 hover:text-cyan-700 dark:hover:text-cyan-300 cursor-pointer"
                title="Hiện lại dòng hạn mức này"
              >
                {quotaRow.name}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
