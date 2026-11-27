"use client";

import PropTypes from "prop-types";
import { NoAuthProxyCard } from "@/shared/components";
import { HudFrame } from "@/shared/components/hud";
import { getScheduleSlotLabels } from "@/shared/services/quotaPingSchedule";
import { cn } from "@/shared/utils/cn";
import ConnectionRow from "../ConnectionRow";
import ConnectionsToolbar from "./ConnectionsToolbar";
import AddConnectionActions from "./AddConnectionActions";
import { AUTO_PING_SETTINGS_KEYS } from "../utils/providerMeta";

/**
 * Render connections card: compact Cyber-Bento toolbar, Antigravity feedback & tier tabs,
 * selection controls, scrollable ConnectionRow list, and add actions.
 */
export default function ConnectionsCard({
  providerId,
  providerMeta,
  connections,
  filteredConnections,
  proxyPools,
  tierCounts,
  antigravityTierFilter,
  setAntigravityTierFilter,
  selectedConnectionIds,
  allFilteredSelected,
  toggleSelectConnection,
  toggleSelectAllConnections,
  providerStrategy,
  providerStickyLimit,
  autoPing,
  oneByOne,
  antigravity,
  actions,
}) {
  const { isOAuth, isFreeNoAuth, isCompatible, hasDualAuthModes, oauthConnectionLabel, apiKeyConnectionLabel } =
    providerMeta;

  if (isFreeNoAuth) {
    return <NoAuthProxyCard providerId={providerId} />;
  }

  const tierTabs = [
    { key: "all", label: `Tất cả (${tierCounts.all})` },
    { key: "pro", label: `PRO (${tierCounts.pro || 0})` },
    { key: "plus", label: `PLUS (${tierCounts.plus || 0})` },
    { key: "pro_jiro", label: `PRO JIRO (${tierCounts.pro_jiro || 0})` },
    { key: "ultra", label: `ULTRA (${tierCounts.ultra || 0})` },
    { key: "enterprise", label: `ENTERPRISE (${tierCounts.enterprise || 0})` },
    { key: "free", label: `MIỄN PHÍ (${tierCounts.free || 0})` },
  ];

  const selectedSet = new Set(selectedConnectionIds);
  const isAntigravity = providerId === "antigravity";
  const isLongList = filteredConnections.length > 20;

  return (
    <HudFrame
      chamfer="md"
      accent="cyan"
      padding="md"
      spotlight
      statusDot={isAntigravity}
      header={
        isAntigravity
          ? "POOL TÀI KHOẢN ANTIGRAVITY // ROUTING MATRIX"
          : "POOL KẾT NỐI // ROUTING MATRIX"
      }
    >
      <ConnectionsToolbar
        providerId={providerId}
        isOAuth={isOAuth}
        isCompatible={isCompatible}
        connectionsCount={connections.length}
        proxyPoolsCount={proxyPools.length}
        selectedCount={selectedConnectionIds.length}
        providerStrategy={providerStrategy}
        providerStickyLimit={providerStickyLimit}
        oneByOneRunning={oneByOne.oneByOneRunning}
        oneByOneStopping={oneByOne.oneByOneStopping}
        antigravityRefreshingAll={antigravity.antigravityRefreshingAll}
        antigravityWarmingUpAll={antigravity.antigravityWarmingUpAll}
        antigravityExporting={antigravity.antigravityExporting}
        onOpenBulkProxy={actions.onOpenBulkProxy}
        onBulkDelete={actions.onBulkDelete}
        onRunOneByOneTest={oneByOne.handleRunOneByOneTest}
        onStopOneByOneTest={oneByOne.handleStopOneByOneTest}
        onRefreshAllAntigravity={antigravity.handleRefreshAllAntigravity}
        onOpenWarmupConfirm={() => antigravity.setShowAntigravityWarmupConfirm(true)}
        onExportAntigravity={antigravity.handleExportAntigravity}
        onOpenBulkImportAntigravity={() => antigravity.setShowBulkImportAntigravity(true)}
        onTriggerOAuth={actions.onTriggerOAuth}
        onTriggerAdd={actions.onTriggerAdd}
        onRoundRobinToggle={actions.onRoundRobinToggle}
        onSoonestResetToggle={actions.onSoonestResetToggle}
        onStickyLimitChange={actions.onStickyLimitChange}
      />

      {connections.length === 0 ? (
        <div className="flex flex-col gap-3 rounded-xl border border-dashed border-cyan-500/25 bg-black/[0.015] p-4 dark:bg-white/[0.02] sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl border border-cyan-500/30 bg-cyan-500/10 text-cyan-600 dark:text-cyan-300">
              <span className="material-symbols-outlined text-[18px]">{isOAuth ? "lock" : "key"}</span>
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-text-main">Chưa có kết nối nào</p>
              {hasDualAuthModes && (
                <p className="text-xs text-text-muted">
                  Chọn {oauthConnectionLabel} hoặc {apiKeyConnectionLabel}.
                </p>
              )}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <AddConnectionActions
              providerId={providerId}
              isCompatible={isCompatible}
              hasDualAuthModes={hasDualAuthModes}
              oauthConnectionLabel={oauthConnectionLabel}
              apiKeyConnectionLabel={apiKeyConnectionLabel}
              isEmptyState
              onRefresh={actions.onRefresh}
              onTriggerOAuth={actions.onTriggerOAuth}
              onTriggerApiKey={actions.onTriggerApiKey}
              onTriggerAdd={actions.onTriggerAdd}
              onOpenIFlowCookie={actions.onOpenIFlowCookie}
              onOpenBulkCodex={actions.onOpenBulkCodex}
              onOpenBulkGrokCli={actions.onOpenBulkGrokCli}
              onOpenBulkAntigravity={() => antigravity.setShowBulkImportAntigravity(true)}
            />
          </div>
        </div>
      ) : (
        <>
          {antigravity.antigravityFeedback && (
            <div
              className={cn(
                "mb-3 flex items-center justify-between gap-2 rounded-xl border p-2.5 text-xs backdrop-blur-sm",
                antigravity.antigravityFeedback.type === "success"
                  ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                  : "border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300"
              )}
            >
              <div className="flex items-center gap-1.5">
                <span className="material-symbols-outlined text-[16px]">
                  {antigravity.antigravityFeedback.type === "success" ? "check_circle" : "error"}
                </span>
                <span>{antigravity.antigravityFeedback.message}</span>
              </div>
              <button type="button" onClick={antigravity.clearFeedback} className="hover:opacity-75" aria-label="Đóng thông báo">
                <span className="material-symbols-outlined text-[14px]">close</span>
              </button>
            </div>
          )}

          {oneByOne.oneByOneSummary && (
            <div className="mb-4 rounded-xl border border-cyan-500/20 bg-black/[0.02] px-3 py-2 font-mono text-xs text-text-muted dark:bg-white/[0.03]">
              <div className="flex flex-wrap items-center gap-3">
                <span>Tổng: {oneByOne.oneByOneSummary.total}</span>
                <span>Hoàn tất: {oneByOne.oneByOneSummary.completed}</span>
                <span className="text-emerald-600 dark:text-emerald-400">
                  Thành công: {oneByOne.oneByOneSummary.passed}
                </span>
                <span className="text-rose-600 dark:text-rose-400">
                  Thất bại: {oneByOne.oneByOneSummary.failed}
                </span>
                {oneByOne.oneByOneSummary.stopped && (
                  <span className="text-amber-600 dark:text-amber-400">Đã dừng</span>
                )}
                {oneByOne.oneByOneRunning && oneByOne.oneByOneCurrentConnectionId && (
                  <span className="text-cyan-600 dark:text-cyan-300">
                    Đang chạy:{" "}
                    {connections.find((conn) => conn.id === oneByOne.oneByOneCurrentConnectionId)?.name ||
                      oneByOne.oneByOneCurrentConnectionId}
                  </span>
                )}
              </div>
            </div>
          )}

          {isAntigravity && connections.length > 0 && (
            <div className="mb-3 flex flex-wrap items-center gap-1.5 border-b border-black/[0.05] pb-3 dark:border-white/[0.06]">
              {tierTabs.map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  data-cursor-target
                  onClick={() => setAntigravityTierFilter(tab.key)}
                  className={cn(
                    "rounded-lg border px-2.5 py-1 font-mono text-[11px] font-semibold transition-all cursor-pointer",
                    antigravityTierFilter === tab.key
                      ? "border-cyan-500/50 bg-cyan-500/15 text-cyan-700 shadow-[0_0_14px_-4px_rgba(34,211,238,0.5)] dark:text-cyan-200"
                      : "border-black/10 bg-black/[0.02] text-text-muted hover:border-cyan-500/30 hover:text-text-main dark:border-white/10 dark:bg-white/[0.03]"
                  )}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          )}

          <div className="mb-2.5 flex items-center justify-between gap-2 pb-1">
            <label className="flex cursor-pointer items-center gap-2 text-xs font-medium text-text-muted transition-colors hover:text-cyan-600 dark:hover:text-cyan-300">
              <input
                type="checkbox"
                checked={allFilteredSelected}
                onChange={toggleSelectAllConnections}
                className="h-3.5 w-3.5 rounded border-gray-300 text-cyan-600 focus:ring-cyan-500"
              />
              <span>Chọn tất cả</span>
            </label>
            {selectedConnectionIds.length > 0 && (
              <span className="rounded-md border border-cyan-500/30 bg-cyan-500/10 px-2 py-0.5 font-mono text-[11px] font-semibold text-cyan-700 dark:text-cyan-300">
                Đã chọn {selectedConnectionIds.length}
              </span>
            )}
          </div>

          <div className="flex min-w-0 max-h-[540px] flex-col divide-y divide-black/[0.05] overflow-y-auto overscroll-contain touch-pan-y rounded-xl border border-black/10 bg-black/[0.015] p-1.5 custom-scrollbar dark:divide-white/[0.06] dark:border-white/10 dark:bg-slate-950/35">
            {filteredConnections.length === 0 ? (
              <div className="py-8 text-center text-xs text-text-muted">
                Không có kết nối nào phù hợp với bộ lọc gói.
              </div>
            ) : (
              filteredConnections.map((conn) => {
                const origIndex = connections.findIndex((c) => c.id === conn.id);
                const disablePriorityMove = isAntigravity && antigravityTierFilter !== "all";
                return (
                  <div key={conn.id} className="flex min-w-0 items-stretch gap-1 py-0.5">
                    <div className="flex shrink-0 items-center pl-1 sm:pl-2">
                      <input
                        type="checkbox"
                        checked={selectedSet.has(conn.id)}
                        onChange={() => toggleSelectConnection(conn.id)}
                        aria-label={`Chọn ${conn.name || conn.email || "kết nối"}`}
                        className="h-4 w-4 rounded border-gray-300 text-cyan-600 focus:ring-cyan-500"
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <ConnectionRow
                        connection={conn}
                        proxyPools={proxyPools}
                        isOAuth={isOAuth}
                        rowIndex={origIndex}
                        isFirst={origIndex <= 0 || disablePriorityMove}
                        isLast={origIndex >= connections.length - 1 || disablePriorityMove}
                        isLongList={isLongList}
                        onMoveUp={() => origIndex > 0 && actions.onSwapPriority(origIndex, origIndex - 1)}
                        onMoveDown={() =>
                          origIndex < connections.length - 1 && actions.onSwapPriority(origIndex, origIndex + 1)
                        }
                        onToggleActive={(isActive) => actions.onToggleActive(conn.id, isActive)}
                        providerId={providerId}
                        onRefresh={actions.onRefresh}
                        activeClients={antigravity?.activeClients || null}
                        onActiveClientsChange={antigravity?.setActiveClients}
                        autoPing={
                          AUTO_PING_SETTINGS_KEYS[providerId] && conn.authType === "oauth"
                            ? {
                                isActive:
                                  autoPing.connections[conn.id] === true ||
                                  autoPing.schedules?.[conn.id]?.enabled === true,
                                reactiveOn: autoPing.connections[conn.id] === true,
                                provider: providerId,
                                scheduleOn: autoPing.schedules?.[conn.id]?.enabled === true,
                                scheduleSummary: getScheduleSlotLabels(autoPing.schedules?.[conn.id]).join(" / "),
                                onConfigure: () => actions.onConfigureAutoPing(conn),
                              }
                            : null
                        }
                        onUpdateProxy={(proxyPoolId) => actions.onUpdateProxy(conn.id, proxyPoolId)}
                        onEdit={() => actions.onEditConnection(conn)}
                        onDelete={() => actions.onDeleteConnection(conn.id)}
                        oneByOneStatus={oneByOne.oneByOneResults[conn.id] || null}
                      />
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {!isCompatible && (
            <div className="mt-4 grid grid-cols-1 gap-2 sm:flex sm:flex-wrap">
              <AddConnectionActions
                providerId={providerId}
                isCompatible={isCompatible}
                hasDualAuthModes={hasDualAuthModes}
                oauthConnectionLabel={oauthConnectionLabel}
                apiKeyConnectionLabel={apiKeyConnectionLabel}
                isEmptyState={false}
                onRefresh={actions.onRefresh}
                onTriggerOAuth={actions.onTriggerOAuth}
                onTriggerApiKey={actions.onTriggerApiKey}
                onTriggerAdd={actions.onTriggerAdd}
                onOpenIFlowCookie={actions.onOpenIFlowCookie}
                onOpenBulkCodex={actions.onOpenBulkCodex}
                onOpenBulkGrokCli={actions.onOpenBulkGrokCli}
                onOpenBulkAntigravity={() => antigravity.setShowBulkImportAntigravity(true)}
              />
            </div>
          )}
        </>
      )}
    </HudFrame>
  );
}

ConnectionsCard.propTypes = {
  providerId: PropTypes.string.isRequired,
  providerMeta: PropTypes.object.isRequired,
  connections: PropTypes.array.isRequired,
  filteredConnections: PropTypes.array.isRequired,
  proxyPools: PropTypes.array.isRequired,
  tierCounts: PropTypes.object.isRequired,
  antigravityTierFilter: PropTypes.string.isRequired,
  setAntigravityTierFilter: PropTypes.func.isRequired,
  selectedConnectionIds: PropTypes.array.isRequired,
  allFilteredSelected: PropTypes.bool.isRequired,
  toggleSelectConnection: PropTypes.func.isRequired,
  toggleSelectAllConnections: PropTypes.func.isRequired,
  providerStrategy: PropTypes.string,
  providerStickyLimit: PropTypes.string.isRequired,
  autoPing: PropTypes.object.isRequired,
  oneByOne: PropTypes.object.isRequired,
  antigravity: PropTypes.object.isRequired,
  actions: PropTypes.object.isRequired,
};
