"use client";

import PropTypes from "prop-types";
import {
  Button,
  Modal,
  OAuthModal,
  KiroOAuthWrapper,
  CursorAuthModal,
  ZedAuthModal,
  XiaomiMimoAuthModal,
  IFlowCookieModal,
  GitLabAuthModal,
  EditConnectionModal,
  ConfirmModal,
} from "@/shared/components";
import AddApiKeyModal from "../AddApiKeyModal";
import EditCompatibleNodeModal from "../EditCompatibleNodeModal";
import AddCustomModelModal from "../AddCustomModelModal";
import BulkImportCodexModal from "../BulkImportCodexModal";
import BulkImportGrokCliModal from "../BulkImportGrokCliModal";
import BulkImportAntigravityModal from "../BulkImportAntigravityModal";
import AutoPingScheduleModal from "../AutoPingScheduleModal";

function OAuthProviderModal({ providerId, providerInfo, isOpen, onSuccess, onClose }) {
  if (providerId === "kiro") {
    return <KiroOAuthWrapper isOpen={isOpen} providerInfo={providerInfo} onSuccess={onSuccess} onClose={onClose} />;
  }
  if (providerId === "cursor") {
    return <CursorAuthModal isOpen={isOpen} onSuccess={onSuccess} onClose={onClose} />;
  }
  if (providerId === "zed") {
    return <ZedAuthModal isOpen={isOpen} providerInfo={providerInfo} onSuccess={onSuccess} onClose={onClose} />;
  }
  if (providerId === "gitlab") {
    return <GitLabAuthModal isOpen={isOpen} providerInfo={providerInfo} onSuccess={onSuccess} onClose={onClose} />;
  }
  return <OAuthModal isOpen={isOpen} provider={providerId} providerInfo={providerInfo} onSuccess={onSuccess} onClose={onClose} />;
}

OAuthProviderModal.propTypes = {
  providerId: PropTypes.string.isRequired,
  providerInfo: PropTypes.object.isRequired,
  isOpen: PropTypes.bool.isRequired,
  onSuccess: PropTypes.func.isRequired,
  onClose: PropTypes.func.isRequired,
};

/**
 * Render all provider detail modals: bulk proxy, OAuth/API key, edit, bulk imports,
 * Antigravity warmup/risk confirms, auto-ping schedule, custom model, and delete confirmations.
 */
export default function ProviderTestModals({
  providerId,
  providerMeta,
  connections,
  proxyPools,
  providerNode,
  autoPing,
  bulkProxy,
  antigravity,
  modalState,
  onRefresh,
  onSaveApiKey,
  onUpdateConnection,
  onUpdateNode,
  onAddCustomModel,
  onSaveAutoPing,
  onAgRiskConfirm,
}) {
  const { providerInfo, isCompatible, isAnthropicCompatible, providerStorageAlias, providerDisplayAlias } = providerMeta;

  return (
    <>
      <Modal
        isOpen={bulkProxy.showBulkProxyModal}
        onClose={bulkProxy.closeBulkProxyModal}
        title={`Apply Proxy (${connections.length} connections)`}
      >
        <div className="flex flex-col gap-3">
          <div className="flex flex-col">
            <button
              onClick={bulkProxy.handleApplyOneToOne}
              disabled={bulkProxy.bulkUpdatingProxy || bulkProxy.activePools.length === 0}
              className="flex items-center gap-2 rounded-lg px-3 py-2 text-left transition-colors hover:bg-black/[0.04] dark:hover:bg-white/[0.04] disabled:cursor-not-allowed disabled:opacity-50"
            >
              <span className="material-symbols-outlined text-text-muted text-[18px]">sync_alt</span>
              <span className="text-sm text-text-main">One-to-one (rotate)</span>
            </button>
            <button
              onClick={() => bulkProxy.handleApplySinglePool(null)}
              disabled={bulkProxy.bulkUpdatingProxy}
              className="flex items-center gap-2 rounded-lg px-3 py-2 text-left transition-colors hover:bg-black/[0.04] dark:hover:bg-white/[0.04] disabled:cursor-not-allowed disabled:opacity-50"
            >
              <span className="material-symbols-outlined text-text-muted text-[18px]">link_off</span>
              <span className="text-sm text-text-main">None (unbind all)</span>
            </button>
            {proxyPools.map((pool) => (
              <button
                key={pool.id}
                onClick={() => bulkProxy.handleApplySinglePool(pool.id)}
                disabled={bulkProxy.bulkUpdatingProxy || pool.isActive !== true}
                className="flex items-center gap-2 rounded-lg px-3 py-2 text-left transition-colors hover:bg-black/[0.04] dark:hover:bg-white/[0.04] disabled:cursor-not-allowed disabled:opacity-50"
              >
                <span className="material-symbols-outlined text-text-muted text-[18px]">lan</span>
                <span className="truncate text-sm text-text-main">{pool.name}</span>
                {pool.isActive !== true && <span className="text-[10px] text-text-muted">(inactive)</span>}
              </button>
            ))}
          </div>

          {bulkProxy.bulkUpdatingProxy && <p className="text-xs text-text-muted">Applying...</p>}

          <Button onClick={bulkProxy.closeBulkProxyModal} variant="ghost" fullWidth disabled={bulkProxy.bulkUpdatingProxy}>
            Cancel
          </Button>
        </div>
      </Modal>

      <OAuthProviderModal
        providerId={providerId}
        providerInfo={providerInfo}
        isOpen={modalState.showOAuthModal}
        onSuccess={modalState.onOAuthSuccess}
        onClose={() => modalState.setShowOAuthModal(false)}
      />

      <XiaomiMimoAuthModal
        isOpen={modalState.showXiaomiMimoModal}
        onSuccess={modalState.onOAuthSuccess}
        onClose={() => modalState.setShowXiaomiMimoModal(false)}
      />

      {providerId === "iflow" && (
        <IFlowCookieModal
          isOpen={modalState.showIFlowCookieModal}
          onSuccess={modalState.onIFlowCookieSuccess}
          onClose={() => modalState.setShowIFlowCookieModal(false)}
        />
      )}

      <AddApiKeyModal
        isOpen={modalState.showAddApiKeyModal}
        provider={providerId}
        providerName={providerInfo.name}
        isCompatible={isCompatible}
        isAnthropic={isAnthropicCompatible}
        authType={providerInfo?.authType}
        authHint={providerInfo?.authHint}
        website={providerInfo?.website}
        proxyPools={proxyPools}
        error={modalState.addConnectionError}
        existingNames={connections.map((c) => c.name).filter(Boolean)}
        onSave={onSaveApiKey}
        onBulkDone={onRefresh}
        onClose={modalState.onCloseAddApiKey}
      />

      <EditConnectionModal
        isOpen={modalState.showEditModal}
        connection={modalState.selectedConnection}
        proxyPools={proxyPools}
        onSave={onUpdateConnection}
        onClose={() => modalState.setShowEditModal(false)}
      />

      {isCompatible && (
        <EditCompatibleNodeModal
          isOpen={modalState.showEditNodeModal}
          node={providerNode}
          onSave={onUpdateNode}
          onClose={() => modalState.setShowEditNodeModal(false)}
          isAnthropic={isAnthropicCompatible}
        />
      )}

      {!isCompatible && (
        <AddCustomModelModal
          isOpen={modalState.showAddCustomModel}
          providerAlias={providerStorageAlias}
          providerDisplayAlias={providerDisplayAlias}
          onSave={async (modelId, type, caps, transport) => {
            await onAddCustomModel(modelId, type, providerStorageAlias, caps, transport);
            modalState.setShowAddCustomModel(false);
          }}
          onClose={() => modalState.setShowAddCustomModel(false)}
        />
      )}

      {providerId === "codex" && (
        <BulkImportCodexModal
          isOpen={modalState.showBulkImportCodex}
          onClose={() => modalState.setShowBulkImportCodex(false)}
          onSuccess={onRefresh}
        />
      )}

      {providerId === "grok-cli" && (
        <BulkImportGrokCliModal
          isOpen={modalState.showBulkImportGrokCli}
          onClose={() => modalState.setShowBulkImportGrokCli(false)}
          onSuccess={onRefresh}
        />
      )}

      {providerId === "antigravity" && (
        <BulkImportAntigravityModal
          isOpen={antigravity.showBulkImportAntigravity}
          onClose={() => antigravity.setShowBulkImportAntigravity(false)}
          onSuccess={onRefresh}
        />
      )}

      {antigravity.showAntigravityWarmupConfirm && (
        <ConfirmModal
          isOpen={antigravity.showAntigravityWarmupConfirm}
          onClose={() => antigravity.setShowAntigravityWarmupConfirm(false)}
          onConfirm={antigravity.handleWarmupAllAntigravity}
          title="Làm nóng (Warmup) tất cả tài khoản"
          message="Bạn có chắc chắn muốn làm nóng tất cả tài khoản Antigravity? Hệ thống sẽ gửi một prompt nhẹ ('Say hi') tới gemini-3.8-flash-tiered để kích hoạt chu kỳ hạn mức tuần (7-day Weekly Quota Timer)."
          confirmText="Làm nóng ngay"
          cancelText="Hủy"
          variant="primary"
          loading={antigravity.antigravityWarmingUpAll}
        />
      )}

      {modalState.scheduleConnection && (
        <AutoPingScheduleModal
          isOpen={!!modalState.scheduleConnection}
          onClose={() => modalState.setScheduleConnection(null)}
          connection={modalState.scheduleConnection}
          reactive={autoPing.connections[modalState.scheduleConnection.id] === true}
          schedule={autoPing.schedules?.[modalState.scheduleConnection.id] || null}
          onSave={(result) => onSaveAutoPing(modalState.scheduleConnection.id, result)}
        />
      )}

      <ConfirmModal
        isOpen={antigravity.showAgRiskModal}
        onClose={() => antigravity.setShowAgRiskModal(false)}
        onConfirm={onAgRiskConfirm}
        title="Risk Notice"
        message={providerInfo?.deprecationNotice}
        confirmText="I Understand, Continue"
        cancelText="Cancel"
        variant="danger"
      />

      <ConfirmModal
        isOpen={!!modalState.confirmState}
        onClose={() => modalState.setConfirmState(null)}
        onConfirm={modalState.confirmState?.onConfirm}
        title={modalState.confirmState?.title || "Confirm"}
        message={modalState.confirmState?.message}
        variant="danger"
      />
    </>
  );
}

ProviderTestModals.propTypes = {
  providerId: PropTypes.string.isRequired,
  providerMeta: PropTypes.object.isRequired,
  connections: PropTypes.array.isRequired,
  proxyPools: PropTypes.array.isRequired,
  providerNode: PropTypes.object,
  autoPing: PropTypes.object.isRequired,
  bulkProxy: PropTypes.object.isRequired,
  antigravity: PropTypes.object.isRequired,
  modalState: PropTypes.object.isRequired,
  onRefresh: PropTypes.func.isRequired,
  onSaveApiKey: PropTypes.func.isRequired,
  onUpdateConnection: PropTypes.func.isRequired,
  onUpdateNode: PropTypes.func.isRequired,
  onAddCustomModel: PropTypes.func.isRequired,
  onSaveAutoPing: PropTypes.func.isRequired,
  onAgRiskConfirm: PropTypes.func.isRequired,
};
