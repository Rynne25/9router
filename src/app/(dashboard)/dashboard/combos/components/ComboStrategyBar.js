"use client";

import { Button } from "@/shared/components";

const STRATEGY_BADGES = [
  { name: "Priority Fallback", desc: "exhaust all accounts on #1 first", primary: true },
  { name: "Fallback", desc: "try in order" },
  { name: "Round Robin", desc: "rotate load" },
  { name: "Smart", desc: "System One router" },
  { name: "Fusion", desc: "panel + judge" },
];

export default function ComboStrategyBar({
  searchQuery,
  onSearchChange,
  onCreateClick,
  presetLoading,
  onGeneratePresets,
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <p className="text-sm text-text-muted">
          Group models under one endpoint name and choose a routing strategy per combo.
        </p>
        <div className="mt-2.5 flex flex-wrap items-center gap-1.5 text-xs">
          {STRATEGY_BADGES.map((item) => (
            <span
              key={item.name}
              className={
                item.primary
                  ? "inline-flex items-center gap-1 rounded-md bg-primary/10 px-2 py-0.5 text-primary ring-1 ring-primary/20"
                  : "inline-flex items-center gap-1 rounded-md bg-black/[0.03] px-2 py-0.5 text-text-muted dark:bg-white/[0.04]"
              }
            >
              <span className={item.primary ? "font-medium" : "font-medium text-text-main"}>{item.name}</span>
              <span className={item.primary ? "text-text-muted" : undefined}>· {item.desc}</span>
            </span>
          ))}
        </div>
      </div>

      <div className="flex w-full flex-col gap-2 sm:w-auto sm:items-stretch">
        <div className="relative w-full sm:w-64">
          <span className="material-symbols-outlined pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[18px] text-text-muted">
            search
          </span>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search combos…"
            aria-label="Search combos"
            className="w-full rounded-[10px] border border-transparent bg-surface-2 py-2 pl-10 pr-9 text-sm text-text-main transition-all duration-150 ease-out placeholder-text-muted/70 focus:border-brand-500/40 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => onSearchChange("")}
              aria-label="Clear search"
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-text-muted transition-colors hover:text-text-main"
            >
              <span className="material-symbols-outlined text-[16px]">close</span>
            </button>
          )}
        </div>

        <Button icon="add" onClick={onCreateClick} className="w-full sm:w-auto whitespace-nowrap">
          Create Combo
        </Button>

        <div className="hidden">
          <Button
            variant="secondary"
            size="sm"
            icon="edit_note"
            loading={presetLoading === "cursor"}
            disabled={!!presetLoading}
            onClick={() => onGeneratePresets("cursor")}
            className="w-full whitespace-nowrap"
          >
            Cursor Default
          </Button>
          <Button
            variant="secondary"
            size="sm"
            icon="smart_toy"
            loading={presetLoading === "claude"}
            disabled={!!presetLoading}
            onClick={() => onGeneratePresets("claude")}
            className="w-full whitespace-nowrap"
          >
            Claude Default
          </Button>
        </div>
      </div>
    </div>
  );
}
