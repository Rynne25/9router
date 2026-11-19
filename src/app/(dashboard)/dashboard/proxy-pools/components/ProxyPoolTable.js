"use client";

import { Badge, Button, Toggle } from "@/shared/components";

function getStatusVariant(status) {
  if (status === "active") return "success";
  if (status === "error") return "error";
  return "default";
}

function formatDateTime(value) {
  if (!value) return "Never";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Never";
  return date.toLocaleString();
}

export default function ProxyPoolTable({
  pools = [],
  allPoolsCount = 0,
  selectedIds = [],
  onToggleSelect,
  onToggleActive,
  onTest,
  testingId = null,
  onEdit,
  onDelete,
  onOpenCreate,
  bulkBusy = false,
  healthChecking = false,
}) {
  if (allPoolsCount === 0) {
    return (
      <div className="py-10 text-center">
        <p className="mb-1 font-medium text-text-main">No proxy pool entries yet</p>
        <p className="mb-4 text-sm text-text-muted">
          Create a proxy pool entry, then assign it to connections.
        </p>
        <Button icon="add" onClick={onOpenCreate}>
          Add Proxy Pool
        </Button>
      </div>
    );
  }

  if (pools.length === 0) {
    return (
      <p className="py-10 text-center text-sm text-text-muted">
        No proxy pools match this status.
      </p>
    );
  }

  return (
    <div className="flex flex-col divide-y divide-black/[0.04] dark:divide-white/[0.05]">
      {pools.map((pool) => (
        <div
          key={pool.id}
          className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="flex min-w-0 flex-1 items-start gap-3">
            <input
              type="checkbox"
              checked={selectedIds.includes(pool.id)}
              onChange={(event) =>
                onToggleSelect?.(
                  pool.id,
                  event.target.checked,
                  event.nativeEvent.shiftKey === true
                )
              }
              disabled={bulkBusy || healthChecking}
              aria-label={`Select ${pool.name}`}
              className="mt-1 size-4 shrink-0 rounded border-black/20 dark:border-white/20"
            />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="min-w-0 max-w-full truncate text-sm font-medium sm:max-w-[18rem]">
                  {pool.name}
                </p>
                <Badge variant={getStatusVariant(pool.testStatus)} size="sm" dot>
                  {pool.testStatus || "unknown"}
                </Badge>
                {pool.latencyMs != null && (
                  <Badge
                    variant={
                      pool.latencyMs < 500
                        ? "success"
                        : pool.latencyMs < 1500
                          ? "default"
                          : "warning"
                    }
                    size="sm"
                  >
                    {pool.latencyMs}ms
                  </Badge>
                )}
                <Badge variant={pool.isActive ? "success" : "default"} size="sm">
                  {pool.isActive ? "active" : "inactive"}
                </Badge>
                {pool.type === "vercel" && (
                  <Badge variant="default" size="sm">
                    vercel relay
                  </Badge>
                )}
                {pool.type === "cloudflare" && (
                  <Badge variant="default" size="sm">
                    cloudflare relay
                  </Badge>
                )}
                {pool.type === "deno" && (
                  <Badge variant="default" size="sm">
                    deno relay
                  </Badge>
                )}
                {pool.type === "netlify" && (
                  <Badge variant="default" size="sm">
                    netlify relay
                  </Badge>
                )}
                <Badge variant="default" size="sm">
                  {pool.boundConnectionCount || 0} bound
                </Badge>
              </div>
              <p className="mt-1 truncate text-xs text-text-muted">{pool.proxyUrl}</p>
              {pool.noProxy ? (
                <p className="truncate text-xs text-text-muted">
                  No proxy: {pool.noProxy}
                </p>
              ) : null}
              <p className="mt-1 text-[11px] text-text-muted">
                Last tested: {formatDateTime(pool.lastTestedAt)}
                {pool.lastError ? ` · ${pool.lastError}` : ""}
              </p>
            </div>
          </div>

          <div className="flex items-center justify-end gap-1">
            <Toggle
              size="sm"
              checked={pool.isActive === true}
              onChange={() => onToggleActive?.(pool)}
              title={pool.isActive ? "Disable" : "Enable"}
            />
            <button
              onClick={() => onTest?.(pool.id)}
              className="rounded p-2 text-text-muted hover:bg-black/5 hover:text-primary dark:hover:bg-white/5"
              title="Test proxy"
              disabled={testingId === pool.id}
            >
              <span
                className="material-symbols-outlined text-[18px]"
                style={
                  testingId === pool.id
                    ? { animation: "spin 1s linear infinite" }
                    : undefined
                }
              >
                {testingId === pool.id ? "progress_activity" : "science"}
              </span>
            </button>
            <button
              onClick={() => onEdit?.(pool)}
              className="rounded p-2 text-text-muted hover:bg-black/5 hover:text-primary dark:hover:bg-white/5"
              title="Edit"
            >
              <span className="material-symbols-outlined text-[18px]">edit</span>
            </button>
            <button
              onClick={() => onDelete?.(pool)}
              className="rounded p-2 text-red-500 hover:bg-red-500/10"
              title="Delete"
            >
              <span className="material-symbols-outlined text-[18px]">delete</span>
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
