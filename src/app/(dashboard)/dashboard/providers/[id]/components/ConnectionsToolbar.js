"use client";

import PropTypes from "prop-types";
import { Button, Toggle } from "@/shared/components";

/**
 * Compact 1-line connections toolbar with proxy, bulk delete, One-by-One testing,
 * Antigravity batch actions, and Round Robin strategy toggle.
 */
export default function ConnectionsToolbar({
  providerId,
  connectionsCount,
  proxyPoolsCount,
  selectedCount,
  providerStrategy,
  providerStickyLimit,
  oneByOneRunning,
  oneByOneStopping,
  antigravityRefreshingAll,
  antigravityWarmingUpAll,
  antigravityExporting,
  onOpenBulkProxy,
  onBulkDelete,
  onRunOneByOneTest,
  onStopOneByOneTest,
  onRefreshAllAntigravity,
  onOpenWarmupConfirm,
  onExportAntigravity,
  onOpenBulkImportAntigravity,
  onRoundRobinToggle,
  onStickyLimitChange,
}) {
  return (
    <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <h2 className="text-lg font-semibold">Connections</h2>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
        {connectionsCount > 0 && proxyPoolsCount > 0 && (
          <Button size="sm" variant="secondary" icon="lan" onClick={onOpenBulkProxy}>
            Apply Proxy
          </Button>
        )}
        {connectionsCount > 0 && (
          <>
            {selectedCount > 0 && (
              <Button size="sm" variant="danger" icon="delete" onClick={onBulkDelete}>
                Delete Selected ({selectedCount})
              </Button>
            )}
            <div className="flex flex-wrap items-center gap-1 rounded-lg border border-black/10 bg-black/[0.02] p-1 dark:border-white/10 dark:bg-white/[0.03]">
              <Button
                size="xs"
                variant="ghost"
                icon="sync"
                onClick={onRunOneByOneTest}
                disabled={oneByOneRunning}
                className="whitespace-nowrap h-7 px-2.5 text-xs hover:bg-surface-3"
                title="Kiểm tra kết nối tuần tự từng tài khoản (One-by-One)"
              >
                {oneByOneRunning ? "Đang test..." : "One-by-One"}
              </Button>
              {oneByOneRunning && (
                <Button
                  size="xs"
                  variant="ghost"
                  icon="stop"
                  onClick={onStopOneByOneTest}
                  disabled={oneByOneStopping}
                  className="whitespace-nowrap h-7 px-2 text-xs text-red-500 hover:bg-red-500/10"
                  title="Dừng kiểm tra"
                >
                  {oneByOneStopping ? "Stopping..." : "Stop"}
                </Button>
              )}
              {providerId === "antigravity" && (
                <>
                  <div className="h-4 w-px bg-black/10 dark:bg-white/10 mx-0.5" />
                  <Button
                    size="xs"
                    variant="ghost"
                    icon="refresh"
                    onClick={onRefreshAllAntigravity}
                    disabled={antigravityRefreshingAll}
                    className="whitespace-nowrap h-7 px-2.5 text-xs hover:bg-surface-3"
                    title="Làm mới tất cả quota và thông tin tài khoản"
                  >
                    {antigravityRefreshingAll ? "Đang làm mới..." : "Làm mới"}
                  </Button>
                  <Button
                    size="xs"
                    variant="ghost"
                    icon="local_fire_department"
                    onClick={onOpenWarmupConfirm}
                    disabled={antigravityWarmingUpAll}
                    className="whitespace-nowrap h-7 px-2.5 text-xs hover:bg-surface-3 text-amber-500 hover:text-amber-400"
                    title="Làm nóng (Warmup) tất cả tài khoản"
                  >
                    {antigravityWarmingUpAll ? "Đang làm nóng..." : "Làm nóng"}
                  </Button>
                  <Button
                    size="xs"
                    variant="ghost"
                    icon="file_download"
                    onClick={onExportAntigravity}
                    disabled={antigravityExporting}
                    className="whitespace-nowrap h-7 px-2.5 text-xs hover:bg-surface-3"
                    title="Xuất toàn bộ Token ra file JSON"
                  >
                    {antigravityExporting ? "Đang xuất..." : "Xuất Token"}
                  </Button>
                  <Button
                    size="xs"
                    variant="ghost"
                    icon="playlist_add"
                    onClick={onOpenBulkImportAntigravity}
                    className="whitespace-nowrap h-7 px-2.5 text-xs hover:bg-surface-3 text-primary hover:text-primary"
                    title="Thêm nhanh nhiều tài khoản từ JSON hoặc DB IDE"
                  >
                    Bulk Add
                  </Button>
                </>
              )}
            </div>
          </>
        )}
        <div className="flex items-center gap-2 pl-2 border-l border-black/10 dark:border-white/10">
          <span className="text-xs text-text-muted font-medium whitespace-nowrap">Round Robin</span>
          <Toggle checked={providerStrategy === "round-robin"} onChange={onRoundRobinToggle} />
          {providerStrategy === "round-robin" && (
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-text-muted">Sticky:</span>
              <input
                type="number"
                min={1}
                value={providerStickyLimit}
                onChange={(e) => onStickyLimitChange(e.target.value)}
                placeholder="1"
                className="w-14 px-2 py-1 text-xs border border-border rounded-md bg-background focus:outline-none focus:border-primary"
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

ConnectionsToolbar.propTypes = {
  providerId: PropTypes.string.isRequired,
  connectionsCount: PropTypes.number.isRequired,
  proxyPoolsCount: PropTypes.number.isRequired,
  selectedCount: PropTypes.number.isRequired,
  providerStrategy: PropTypes.string,
  providerStickyLimit: PropTypes.string.isRequired,
  oneByOneRunning: PropTypes.bool.isRequired,
  oneByOneStopping: PropTypes.bool.isRequired,
  antigravityRefreshingAll: PropTypes.bool.isRequired,
  antigravityWarmingUpAll: PropTypes.bool.isRequired,
  antigravityExporting: PropTypes.bool.isRequired,
  onOpenBulkProxy: PropTypes.func.isRequired,
  onBulkDelete: PropTypes.func.isRequired,
  onRunOneByOneTest: PropTypes.func.isRequired,
  onStopOneByOneTest: PropTypes.func.isRequired,
  onRefreshAllAntigravity: PropTypes.func.isRequired,
  onOpenWarmupConfirm: PropTypes.func.isRequired,
  onExportAntigravity: PropTypes.func.isRequired,
  onOpenBulkImportAntigravity: PropTypes.func.isRequired,
  onRoundRobinToggle: PropTypes.func.isRequired,
  onStickyLimitChange: PropTypes.func.isRequired,
};
