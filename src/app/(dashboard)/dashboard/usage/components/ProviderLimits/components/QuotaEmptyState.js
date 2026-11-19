"use client";

import Card from "@/shared/components/Card";

export default function QuotaEmptyState({ icon, title, description, actionLabel, onAction }) {
  return (
    <Card padding="lg">
      <div className="text-center py-10">
        <span className="material-symbols-outlined text-[56px] text-text-muted opacity-25">
          {icon}
        </span>
        <h3 className="mt-3 text-base font-bold text-text-primary">
          {title}
        </h3>
        <p className="mt-1.5 text-sm text-text-muted max-w-md mx-auto">
          {description}
        </p>
        {actionLabel && typeof onAction === "function" && (
          <button
            type="button"
            onClick={onAction}
            className="mt-4 inline-flex items-center gap-1.5 rounded-xl border border-primary/30 bg-primary/10 px-4 py-2 text-xs font-semibold text-primary hover:bg-primary/20 transition-colors cursor-pointer"
          >
            <span className="material-symbols-outlined text-[15px]">filter_alt_off</span>
            <span>{actionLabel}</span>
          </button>
        )}
      </div>
    </Card>
  );
}
