"use client";

import PropTypes from "prop-types";
import { Button, Toggle } from "@/shared/components";
import { MagneticButton } from "@/shared/components/hud";

/**
 * Compact Cyber-Bento connections toolbar with magnetic quick actions, proxy,
 * bulk delete, Test All (One-by-One), Antigravity batch actions, and routing strategy toggles.
 */
export default function ConnectionsToolbar({
  providerId,
  isOAuth = false,
  isCompatible = false,
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
  onTriggerOAuth,
  onTriggerAdd,
  onRoundRobinToggle,
  onSoonestResetToggle,
  onStickyLimitChange,
}) {
  const isAntigravity = providerId === "antigravity";

  return (
    <div className="mb-4 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
      <div className="flex flex-wrap items-center gap-2.5">
        <h2 className="text-lg font-semibold tracking-tight">Kết nối</h2>
        {!isCompatible && isOAuth && typeof onTriggerOAuth === "function" && (
          <MagneticButton strength={4}>
            <Button
              size="xs"
              variant="primary"
              icon="lock"
              onClick={onTriggerOAuth}
              data-cursor-target
              className="whitespace-nowrap"
              title="Kết nối tài khoản mới qua OAuth"
            >
              Kết nối OAuth
            </Button>
          </MagneticButton>
        )}
        {!isCompatible && !isOAuth && typeof onTriggerAdd === "function" && (
          <MagneticButton strength={4}>
            <Button
              size="xs"
              variant="primary"
              icon="add"
              onClick={onTriggerAdd}
              data-cursor-target
              className="whitespace-nowrap"
              title="Thêm kết nối mới"
            >
              Thêm kết nối
            </Button>
          </MagneticButton>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2.5 sm:gap-3">
        {connectionsCount > 0 && proxyPoolsCount > 0 && (
          <Button
            size="sm"
            variant="secondary"
            icon="lan"
            onClick={onOpenBulkProxy}
            data-cursor-target
            className="whitespace-nowrap"
          >
            Gán Proxy
          </Button>
        )}

        {connectionsCount > 0 && (
          <>
            {selectedCount > 0 && (
              <Button
                size="sm"
                variant="danger"
                icon="delete"
                onClick={onBulkDelete}
                data-cursor-target
                className="whitespace-nowrap"
              >
                Xóa đã chọn ({selectedCount})
              </Button>
            )}

            <div className="flex flex-wrap items-center gap-1 rounded-xl border border-black/10 bg-black/[0.02] p-1 backdrop-blur-sm dark:border-white/10 dark:bg-white/[0.03]">
              <MagneticButton strength={4}>
                <Button
                  size="xs"
                  variant="ghost"
                  icon="sync"
                  onClick={onRunOneByOneTest}
                  disabled={oneByOneRunning}
                  data-cursor-target
                  className="h-7 whitespace-nowrap px-2.5 text-xs hover:bg-cyan-500/10 hover:text-cyan-600 dark:hover:text-cyan-300"
                  title="Kiểm tra kết nối tuần tự từng tài khoản (One-by-One)"
                >
                  {oneByOneRunning ? "Đang test..." : "Test All"}
                </Button>
              </MagneticButton>

              {oneByOneRunning && (
                <Button
                  size="xs"
                  variant="ghost"
                  icon="stop"
                  onClick={onStopOneByOneTest}
                  disabled={oneByOneStopping}
                  data-cursor-target
                  className="h-7 whitespace-nowrap px-2 text-xs text-rose-500 hover:bg-rose-500/10"
                  title="Dừng kiểm tra"
                >
                  {oneByOneStopping ? "Đang dừng..." : "Dừng"}
                </Button>
              )}

              {isAntigravity && (
                <>
                  <div className="mx-0.5 hidden h-4 w-px bg-black/10 dark:bg-white/10 sm:block" />
                  <Button
                    size="xs"
                    variant="ghost"
                    icon="refresh"
                    onClick={onRefreshAllAntigravity}
                    disabled={antigravityRefreshingAll}
                    data-cursor-target
                    className="h-7 whitespace-nowrap px-2.5 text-xs hover:bg-cyan-500/10 hover:text-cyan-600 dark:hover:text-cyan-300"
                    title="Làm mới tất cả Quota và thông tin tài khoản"
                  >
                    {antigravityRefreshingAll ? "Đang làm mới..." : "Làm mới"}
                  </Button>

                  <MagneticButton strength={4}>
                    <Button
                      size="xs"
                      variant="ghost"
                      icon="local_fire_department"
                      onClick={onOpenWarmupConfirm}
                      disabled={antigravityWarmingUpAll}
                      data-cursor-target
                      className="h-7 whitespace-nowrap px-2.5 text-xs text-amber-600 hover:bg-amber-500/10 hover:text-amber-500 dark:text-amber-400"
                      title="Làm nóng (Warmup) tất cả tài khoản"
                    >
                      {antigravityWarmingUpAll ? "Đang Warmup..." : "Warmup"}
                    </Button>
                  </MagneticButton>

                  <Button
                    size="xs"
                    variant="ghost"
                    icon="file_download"
                    onClick={onExportAntigravity}
                    disabled={antigravityExporting}
                    data-cursor-target
                    className="h-7 whitespace-nowrap px-2.5 text-xs hover:bg-cyan-500/10 hover:text-cyan-600 dark:hover:text-cyan-300"
                    title="Xuất toàn bộ Token ra file JSON"
                  >
                    {antigravityExporting ? "Đang xuất..." : "Xuất Token"}
                  </Button>

                  <MagneticButton strength={4}>
                    <Button
                      size="xs"
                      variant="ghost"
                      icon="playlist_add"
                      onClick={onOpenBulkImportAntigravity}
                      data-cursor-target
                      className="h-7 whitespace-nowrap px-2.5 text-xs text-cyan-700 hover:bg-cyan-500/15 hover:text-cyan-600 dark:text-cyan-300 dark:hover:text-cyan-200"
                      title="Nhập hàng loạt tài khoản từ JSON hoặc DB IDE"
                    >
                      Bulk Import
                    </Button>
                  </MagneticButton>
                </>
              )}
            </div>
          </>
        )}

        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-black/10 bg-black/[0.02] px-2.5 py-1.5 dark:border-white/10 dark:bg-white/[0.03]">
          <div className="flex items-center gap-2">
            <span className="whitespace-nowrap text-xs font-medium text-text-muted">Round Robin</span>
            <Toggle checked={providerStrategy === "round-robin"} onChange={onRoundRobinToggle} />
          </div>
          <div
            className="flex items-center gap-2 border-l border-black/10 pl-2.5 dark:border-white/10"
            title="Ưu tiên tài khoản có cửa sổ Quota reset sớm nhất; tài khoản cạn Quota xếp cuối"
          >
            <span className="whitespace-nowrap text-xs font-medium text-text-muted">Reset sớm nhất</span>
            <Toggle checked={providerStrategy === "soonest-reset"} onChange={onSoonestResetToggle} />
          </div>
          {providerStrategy === "round-robin" && (
            <div className="flex items-center gap-1.5 border-l border-black/10 pl-2.5 dark:border-white/10">
              <span className="text-xs text-text-muted">Sticky:</span>
              <input
                type="number"
                min={1}
                value={providerStickyLimit}
                onChange={(e) => onStickyLimitChange(e.target.value)}
                placeholder="1"
                className="w-14 rounded-md border border-border bg-background px-2 py-1 font-mono text-xs focus:border-cyan-500 focus:outline-none"
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
  isOAuth: PropTypes.bool,
  isCompatible: PropTypes.bool,
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
  onTriggerOAuth: PropTypes.func,
  onTriggerAdd: PropTypes.func,
  onRoundRobinToggle: PropTypes.func.isRequired,
  onSoonestResetToggle: PropTypes.func,
  onStickyLimitChange: PropTypes.func.isRequired,
};
