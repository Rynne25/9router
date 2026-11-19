"use client";

import { Button, Select } from "@/shared/components";
import { STRATEGY_OPTIONS } from "../constants";

export default function ComboSelectionToolbar({
  allSelected,
  someSelected,
  selectedCount,
  filteredCount,
  totalCount,
  normalizedQuery,
  bulkBusy,
  onToggleSelectAll,
  onBulkSetStrategy,
  onBulkDelete,
  onClearSelection,
}) {
  return (
    <div className="flex min-w-0 flex-col gap-2 rounded-lg border border-black/5 bg-black/[0.015] px-3 py-2 dark:border-white/5 dark:bg-white/[0.02] sm:flex-row sm:items-center sm:justify-between">
      <label className="flex cursor-pointer items-center gap-2 text-xs text-text-muted hover:text-primary select-none">
        <input
          type="checkbox"
          checked={allSelected}
          ref={(el) => {
            if (el) el.indeterminate = someSelected && !allSelected;
          }}
          onChange={onToggleSelectAll}
          className="h-3.5 w-3.5 rounded border-gray-300 text-primary focus:ring-primary"
        />
        <span>{someSelected ? `${selectedCount} selected` : `Select all (${filteredCount})`}</span>
      </label>

      <div className="flex min-w-0 flex-wrap items-center gap-2">
        {normalizedQuery && (
          <span className="text-xs text-text-muted">
            {filteredCount} of {totalCount} shown
          </span>
        )}
        {someSelected && (
          <>
            <div className="w-full min-w-[160px] sm:w-[200px]">
              <Select
                options={STRATEGY_OPTIONS}
                value=""
                placeholder="Set strategy…"
                disabled={bulkBusy}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v) onBulkSetStrategy(v);
                }}
                selectClassName="py-1.5 text-xs"
              />
            </div>
            <Button
              size="sm"
              variant="danger"
              icon="delete"
              disabled={bulkBusy}
              loading={bulkBusy}
              onClick={onBulkDelete}
              className="whitespace-nowrap"
            >
              Delete ({selectedCount})
            </Button>
            <Button size="sm" variant="ghost" onClick={onClearSelection} disabled={bulkBusy}>
              Clear
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
