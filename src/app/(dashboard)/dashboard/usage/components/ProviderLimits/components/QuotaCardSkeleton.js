"use client";

export default function QuotaCardSkeleton({ count = 6, gridClass = "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3" }) {
  return (
    <div className={gridClass} aria-label="Đang tải danh sách hạn mức tài khoản">
      {Array.from({ length: count }).map((_, idx) => (
        <div
          key={idx}
          className="liquid-glass-card rounded-2xl p-3.5 space-y-3 animate-pulse"
        >
          {/* Card Header Skeleton */}
          <div className="flex items-center justify-between gap-2 pb-2.5 border-b border-black/[0.06] dark:border-white/[0.08]">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="size-9 rounded-xl bg-black/10 dark:bg-white/10 shrink-0" />
              <div className="space-y-1.5">
                <div className="h-3.5 w-32 rounded bg-black/10 dark:bg-white/10" />
                <div className="h-2.5 w-20 rounded bg-black/[0.07] dark:bg-white/[0.07]" />
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="h-7 w-16 rounded-lg bg-black/10 dark:bg-white/10" />
              <div className="size-7 rounded-lg bg-black/10 dark:bg-white/10" />
              <div className="h-5 w-9 rounded-full bg-black/10 dark:bg-white/10" />
            </div>
          </div>

          {/* Model Pills Skeleton */}
          <div className="flex items-center gap-1.5">
            <div className="h-4 w-14 rounded-full bg-black/[0.07] dark:bg-white/[0.08]" />
            <div className="h-4 w-12 rounded-full bg-black/[0.07] dark:bg-white/[0.08]" />
            <div className="h-4 w-16 rounded-full bg-black/[0.07] dark:bg-white/[0.08]" />
          </div>

          {/* Quota Bars Skeleton */}
          <div className="space-y-2.5">
            <div className="rounded-xl border border-black/[0.05] dark:border-white/[0.06] p-2.5 space-y-2">
              <div className="flex justify-between">
                <div className="h-3 w-16 rounded bg-black/10 dark:bg-white/10" />
                <div className="h-3 w-10 rounded bg-black/10 dark:bg-white/10" />
              </div>
              <div className="h-1.5 w-full rounded-full bg-black/10 dark:bg-white/10" />
            </div>
            <div className="rounded-xl border border-black/[0.05] dark:border-white/[0.06] p-2.5 space-y-2">
              <div className="flex justify-between">
                <div className="h-3 w-20 rounded bg-black/10 dark:bg-white/10" />
                <div className="h-3 w-10 rounded bg-black/10 dark:bg-white/10" />
              </div>
              <div className="h-1.5 w-full rounded-full bg-black/10 dark:bg-white/10" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
