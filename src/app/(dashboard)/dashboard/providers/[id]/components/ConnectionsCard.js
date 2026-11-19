"use client";

import PropTypes from "prop-types";
import { Card, NoAuthProxyCard } from "@/shared/components";
import { getScheduleSlotLabels } from "@/shared/services/quotaPingSchedule";
import { cn } from "@/shared/utils/cn";
import ConnectionRow from "../ConnectionRow";
import ConnectionsToolbar from "./ConnectionsToolbar";
import AddConnectionActions from "./AddConnectionActions";
import { AUTO_PING_SETTINGS_KEYS } from "../utils/providerMeta";

/**
 * Render connections card: compact toolbar, Antigravity feedback & tier tabs,
 * selection controls, virtual/scrollable ConnectionRow list, and add actions.
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
    { key: "pro", label: `PRO (${tierCounts.pro})` },
    { key: "pro_jiro", label: `PRO JIRO (${tierCounts.pro_jiro})` },
    { key: "ultra", label: `ULTRA (${tierCounts.ultra})` },
    { key: "enterprise", label: `ENTERPRISE (${tierCounts.enterprise})` },
    { key: "free", label: `MIỄN PHÍ (${tierCounts.free})` },
  ];

  const selectedSet = new Set(selectedConnectionIds);

  return (
    <Card>
      <ConnectionsToolbar
        providerId={providerId}
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
        onRoundRobinToggle={actions.onRoundRobinToggle}
        onStickyLimitChange={actions.onStickyLimitChange}
      />

      {connections.length === 0 ? (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="inline-flex items-center justify-center w-9 h-9 rounded-full bg-primary/10 text-primary shrink-0">
              <span className="material-symbols-outlined text-[18px]">{isOAuth ? "lock" : "key"}</span>
            </div>
            <div className="min-w-0">
              <p className="text-sm text-text-muted">No connections yet</p>
              {hasDualAuthModes && (
                <p className="text-xs text-text-muted">
                  Choose {oauthConnectionLabel} or {apiKeyConnectionLabel}.
                </p>
              )}
            </div>
          </div>
          <div className="flex gap-2">
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
                "mb-3 rounded-lg border p-2.5 text-xs flex items-center justify-between gap-2",
                antigravity.antigravityFeedback.type === "success"
                  ? "border-green-500/20 bg-green-500/10 text-green-600 dark:text-green-400"
                  : "border-red-500/20 bg-red-500/10 text-red-600 dark:text-red-400"
              )}
            >
              <div className="flex items-center gap-1.5">
                <span className="material-symbols-outlined text-[16px]">
                  {antigravity.antigravityFeedback.type === "success" ? "check_circle" : "error"}
                </span>
                <span>{antigravity.antigravityFeedback.message}</span>
              </div>
              <button type="button" onClick={antigravity.clearFeedback} className="hover:opacity-75">
                <span className="material-symbols-outlined text-[14px]">close</span>
              </button>
            </div>
          )}

          {oneByOne.oneByOneSummary && (
            <div className="mb-4 rounded-lg border border-black/10 bg-black/[0.02] px-3 py-2 text-xs text-text-muted dark:border-white/10 dark:bg-white/[0.03]">
              <div className="flex flex-wrap items-center gap-3">
                <span>Total: {oneByOne.oneByOneSummary.total}</span>
                <span>Completed: {oneByOne.oneByOneSummary.completed}</span>
                <span>Passed: {oneByOne.oneByOneSummary.passed}</span>
                <span>Failed: {oneByOne.oneByOneSummary.failed}</span>
                {oneByOne.oneByOneSummary.stopped && (
                  <span className="text-amber-600 dark:text-amber-400">Stopped</span>
                )}
                {oneByOne.oneByOneRunning && oneByOne.oneByOneCurrentConnectionId && (
                  <span>
                    Running:{" "}
                    {connections.find((conn) => conn.id === oneByOne.oneByOneCurrentConnectionId)?.name ||
                      oneByOne.oneByOneCurrentConnectionId}
                  </span>
                )}
              </div>
            </div>
          )}

          {providerId === "antigravity" && connections.length > 0 && (
            <div className="mb-3 flex flex-wrap items-center gap-1.5 border-b border-black/[0.03] dark:border-white/[0.03] pb-2.5">
              {tierTabs.map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setAntigravityTierFilter(tab.key)}
                  className={cn(
                    "px-3 py-1 text-xs rounded-lg font-medium transition-all",
                    antigravityTierFilter === tab.key
                      ? "bg-primary text-white shadow-sm"
                      : "bg-surface-2 text-text-muted hover:text-text-main"
                  )}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          )}

          <div className="mb-3 flex items-center gap-2 border-b border-black/[0.03] pb-2 dark:border-white/[0.03]">
            <label className="flex cursor-pointer items-center gap-1.5 text-xs text-text-muted hover:text-primary">
              <input
                type="checkbox"
                checked={allFilteredSelected}
                onChange={toggleSelectAllConnections}
                className="h-3.5 w-3.5 rounded border-gray-300 text-primary focus:ring-primary"
              />
              Select All
            </label>
          </div>

          <div className="flex min-w-0 flex-col divide-y divide-black/[0.03] dark:divide-white/[0.03] max-h-[500px] overflow-y-auto overscroll-contain touch-pan-y custom-scrollbar pr-1">
            {filteredConnections.length === 0 ? (
              <div className="py-8 text-center text-xs text-text-muted">
                Không có kết nối nào phù hợp với bộ lọc gói.
              </div>
            ) : (
              filteredConnections.map((conn) => {
                const origIndex = connections.findIndex((c) => c.id === conn.id);
                const disablePriorityMove = providerId === "antigravity" && antigravityTierFilter !== "all";
                return (
                  <div key={conn.id} className="flex min-w-0 items-stretch">
                    <div className="flex shrink-0 items-center pl-1 sm:pl-2">
                      <input
                        type="checkbox"
                        checked={selectedSet.has(conn.id)}
                        onChange={() => toggleSelectConnection(conn.id)}
                        className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <ConnectionRow
                        connection={conn}
                        proxyPools={proxyPools}
                        isOAuth={isOAuth}
                        rowIndex={origIndex}
                        isFirst={origIndex <= 0 || disablePriorityMove}
                        isLast={origIndex >= connections.length - 1 || disablePriorityMove}
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
            <div className="mt-4 grid grid-cols-1 gap-2 sm:flex">
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
    </Card>
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
