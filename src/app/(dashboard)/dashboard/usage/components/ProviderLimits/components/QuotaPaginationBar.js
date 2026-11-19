"use client";

import {
  ACCOUNT_PAGE_SIZE_MAX,
  ACCOUNT_PAGE_SIZE_OPTIONS,
  getConnectionsPageRange,
} from "../utils";

export default function QuotaPaginationBar({
  pagination,
  pageSize,
  customPageSizeInput,
  onCustomPageSizeInputChange,
  onPageChange,
  onPageSizeChange,
  connectionsLoading,
  refreshingAll,
}) {
  const { start, end } = getConnectionsPageRange(pagination);
  const connectionsPageSummary =
    pagination.total > 0
      ? `Hiển thị ${start}-${end} trên ${pagination.total} tài khoản`
      : "0 tài khoản";
  const isCustomPageSize = !ACCOUNT_PAGE_SIZE_OPTIONS.includes(pageSize);

  const applyCustomPageSize = () => {
    const parsedValue = Number.parseInt(customPageSizeInput, 10);
    if (!Number.isFinite(parsedValue)) {
      onCustomPageSizeInputChange(String(pageSize));
      return;
    }
    const nextPageSize = Math.min(ACCOUNT_PAGE_SIZE_MAX, Math.max(1, parsedValue));
    onPageChange(1);
    onPageSizeChange(nextPageSize);
    onCustomPageSizeInputChange(String(nextPageSize));
  };

  return (
    <div className="liquid-glass-panel rounded-2xl px-3.5 py-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-medium text-text-muted tabular-nums">
          {connectionsPageSummary}
        </span>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={isCustomPageSize ? "custom" : String(pageSize)}
            onChange={(event) => {
              const nextValue = event.target.value;
              if (nextValue === "custom") return;
              const nextPageSize = Number.parseInt(nextValue, 10);
              if (Number.isFinite(nextPageSize)) {
                onPageChange(1);
                onPageSizeChange(nextPageSize);
                onCustomPageSizeInputChange(String(nextPageSize));
              }
            }}
            className="h-8 rounded-xl border border-black/10 bg-white/60 px-2 text-xs text-text-primary outline-none transition-colors hover:bg-white dark:border-white/10 dark:bg-white/[0.04] dark:hover:bg-white/10"
            aria-label="Số tài khoản mỗi trang"
          >
            {ACCOUNT_PAGE_SIZE_OPTIONS.map((option) => (
              <option key={option} value={String(option)}>
                {option} / trang
              </option>
            ))}
            <option value="custom">Tùy chỉnh</option>
          </select>

          <input
            type="number"
            min="1"
            max={String(ACCOUNT_PAGE_SIZE_MAX)}
            inputMode="numeric"
            value={customPageSizeInput}
            onChange={(event) => onCustomPageSizeInputChange(event.target.value)}
            onBlur={applyCustomPageSize}
            onKeyDown={(event) => {
              if (event.key === "Enter") applyCustomPageSize();
            }}
            className="h-8 w-20 rounded-xl border border-black/10 bg-white/60 px-2 text-xs text-text-primary outline-none transition-colors hover:bg-white dark:border-white/10 dark:bg-white/[0.04] dark:hover:bg-white/10"
            aria-label="Số tài khoản tùy chỉnh mỗi trang"
            placeholder="Custom"
          />

          <span className="text-xs text-text-muted tabular-nums">
            Trang {pagination.page} / {pagination.totalPages}
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => onPageChange(1)}
            disabled={pagination.page <= 1 || connectionsLoading || refreshingAll}
            className="flex h-8 items-center rounded-xl border border-black/10 px-3 text-xs text-text-primary transition-colors hover:bg-black/5 disabled:cursor-not-allowed disabled:opacity-40 dark:border-white/10 dark:hover:bg-white/5 cursor-pointer"
          >
            Trang đầu
          </button>
          <button
            type="button"
            onClick={() => onPageChange((currentPage) => Math.max(1, currentPage - 1))}
            disabled={pagination.page <= 1 || connectionsLoading || refreshingAll}
            className="flex h-8 w-8 items-center justify-center rounded-xl border border-black/10 text-text-primary transition-colors hover:bg-black/5 disabled:cursor-not-allowed disabled:opacity-40 dark:border-white/10 dark:hover:bg-white/5 cursor-pointer"
            aria-label="Trang trước"
          >
            <span className="material-symbols-outlined text-[16px]">
              chevron_left
            </span>
          </button>
          <button
            type="button"
            onClick={() =>
              onPageChange((currentPage) =>
                Math.min(pagination.totalPages, currentPage + 1),
              )
            }
            disabled={
              pagination.page >= pagination.totalPages ||
              connectionsLoading ||
              refreshingAll
            }
            className="flex h-8 w-8 items-center justify-center rounded-xl border border-black/10 text-text-primary transition-colors hover:bg-black/5 disabled:cursor-not-allowed disabled:opacity-40 dark:border-white/10 dark:hover:bg-white/5 cursor-pointer"
            aria-label="Trang sau"
          >
            <span className="material-symbols-outlined text-[16px]">
              chevron_right
            </span>
          </button>
          <button
            type="button"
            onClick={() => onPageChange(pagination.totalPages)}
            disabled={
              pagination.page >= pagination.totalPages ||
              connectionsLoading ||
              refreshingAll
            }
            className="flex h-8 items-center rounded-xl border border-black/10 px-3 text-xs text-text-primary transition-colors hover:bg-black/5 disabled:cursor-not-allowed disabled:opacity-40 dark:border-white/10 dark:hover:bg-white/5 cursor-pointer"
          >
            Trang cuối
          </button>
        </div>
      </div>
    </div>
  );
}
