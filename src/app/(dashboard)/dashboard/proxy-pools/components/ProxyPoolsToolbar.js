"use client";

import { useEffect, useRef, useState } from "react";
import { Badge, Button } from "@/shared/components";

export default function ProxyPoolsToolbar({
  totalCount = 0,
  activeCount = 0,
  visibleCount = 0,
  statusFilter = "all",
  onStatusFilterChange,
  allSelected = false,
  onToggleSelectAll,
  selectedCount = 0,
  onClearSelection,
  bulkBusy = false,
  healthChecking = false,
  healthProgress = { current: 0, total: 0 },
  onHealthCheck,
  onBulkSetActive,
  onBulkDelete,
  onOpenCreate,
  onOpenBatchImport,
  onOpenDeployRelay,
  hasVisiblePools = false,
}) {
  const [showRelayMenu, setShowRelayMenu] = useState(false);
  const relayMenuRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (relayMenuRef.current && !relayMenuRef.current.contains(e.target)) {
        setShowRelayMenu(false);
      }
    };
    if (showRelayMenu) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showRelayMenu]);

  return (
    <div className="flex flex-col gap-4">
      {/* Top Header Row */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold sm:text-2xl">Proxy Pools</h1>
        </div>

        <div className="grid grid-cols-1 gap-2 sm:flex sm:items-center">
          <div className="relative" ref={relayMenuRef}>
            <Button
              size="sm"
              variant="secondary"
              icon="rocket_launch"
              onClick={() => setShowRelayMenu(!showRelayMenu)}
            >
              Deploy Relay
              <span className="material-symbols-outlined ml-1 text-[18px]">
                {showRelayMenu ? "expand_less" : "expand_more"}
              </span>
            </Button>

            {showRelayMenu && (
              <div className="absolute left-0 top-full z-50 mt-1 w-48 rounded-xl border border-black/10 bg-white p-1 shadow-xl dark:border-white/10 dark:bg-zinc-900 sm:left-auto sm:right-0">
                <button
                  onClick={() => {
                    onOpenDeployRelay?.("cloudflare");
                    setShowRelayMenu(false);
                  }}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-text-main transition-colors hover:bg-black/5 dark:hover:bg-white/5"
                >
                  <span className="material-symbols-outlined text-[20px] text-orange-500">cloud</span>
                  Cloudflare Relay
                </button>
                <button
                  onClick={() => {
                    onOpenDeployRelay?.("vercel");
                    setShowRelayMenu(false);
                  }}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-text-main transition-colors hover:bg-black/5 dark:hover:bg-white/5"
                >
                  <span className="material-symbols-outlined text-[20px] text-blue-500">cloud_upload</span>
                  Vercel Relay
                </button>
                <button
                  onClick={() => {
                    onOpenDeployRelay?.("deno");
                    setShowRelayMenu(false);
                  }}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-text-main transition-colors hover:bg-black/5 dark:hover:bg-white/5"
                >
                  <span className="material-symbols-outlined text-[20px] text-green-500">terminal</span>
                  Deno Relay
                </button>
                <button
                  onClick={() => {
                    onOpenDeployRelay?.("netlify");
                    setShowRelayMenu(false);
                  }}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-text-main transition-colors hover:bg-black/5 dark:hover:bg-white/5"
                >
                  <span className="material-symbols-outlined text-[20px] text-teal-500">deployed_code</span>
                  Netlify Relay
                </button>
              </div>
            )}
          </div>

          <Button size="sm" variant="secondary" icon="upload" onClick={onOpenBatchImport}>
            Batch Import
          </Button>
          <Button size="sm" icon="add" onClick={onOpenCreate}>
            Add Proxy Pool
          </Button>
        </div>
      </div>

      {/* Filter and Selection Row */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1.5 text-xs text-text-muted">
          <span>Status</span>
          <div className="inline-flex rounded-lg border border-border bg-black/[0.02] dark:bg-white/[0.02] p-0.5">
            {[
              { value: "all", label: "All" },
              { value: "enabled", label: "Enabled" },
              { value: "disabled", label: "Disabled" },
            ].map((tab) => (
              <button
                key={tab.value}
                type="button"
                onClick={() => onStatusFilterChange?.(tab.value)}
                disabled={bulkBusy || healthChecking}
                className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                  statusFilter === tab.value
                    ? "bg-primary text-white shadow-xs"
                    : "text-text-muted hover:text-text-main"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <select
          value={statusFilter}
          disabled={bulkBusy || healthChecking}
          onChange={(event) => onStatusFilterChange?.(event.target.value)}
          className="sr-only"
          aria-label="Filter status selector"
        >
          <option value="all">All</option>
          <option value="enabled">Enabled</option>
          <option value="disabled">Disabled</option>
        </select>

        {hasVisiblePools && (
          <label className="flex cursor-pointer items-center gap-1.5 text-xs text-text-muted">
            <input
              type="checkbox"
              checked={allSelected}
              onChange={onToggleSelectAll}
              disabled={bulkBusy || healthChecking}
              className="size-4 rounded border-black/20 dark:border-white/20"
            />
            {allSelected ? "Unselect visible" : "Select all visible"}
          </label>
        )}
        <Badge variant="default">Total: {totalCount}</Badge>
        <Badge variant="success">Active: {activeCount}</Badge>
        <span className="text-xs text-text-muted">
          Showing {visibleCount} · Shift+click to select a range
        </span>
      </div>

      {/* Bulk Action Bar */}
      {(selectedCount > 0 || healthChecking) && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2">
          <span className="material-symbols-outlined text-[18px] text-primary">checklist</span>
          <span className="text-xs font-medium text-primary">
            {selectedCount > 0 ? `${selectedCount} selected` : "Visible pools"}
          </span>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              icon={healthChecking ? "progress_activity" : "health_and_safety"}
              onClick={onHealthCheck}
              disabled={healthChecking || bulkBusy || !hasVisiblePools}
            >
              {healthChecking ? `Checking ${healthProgress.current}/${healthProgress.total}` : "Health Check"}
            </Button>
            {selectedCount > 0 && (
              <>
                <Button
                  size="sm"
                  variant="secondary"
                  icon="toggle_on"
                  onClick={() => onBulkSetActive?.(true)}
                  disabled={bulkBusy || healthChecking}
                >
                  Activate
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  icon="toggle_off"
                  onClick={() => onBulkSetActive?.(false)}
                  disabled={bulkBusy || healthChecking}
                >
                  Deactivate
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  icon="delete"
                  onClick={onBulkDelete}
                  disabled={bulkBusy || healthChecking}
                >
                  Delete
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={onClearSelection}
                  disabled={bulkBusy || healthChecking}
                >
                  Clear
                </Button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
