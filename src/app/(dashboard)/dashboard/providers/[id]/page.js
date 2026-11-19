"use client";

import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { CardSkeleton } from "@/shared/components";
import { useCopyToClipboard } from "@/shared/hooks/useCopyToClipboard";
import { useModelCaps } from "@/shared/hooks/useModelCaps";
import CustomConfigCard from "./CustomConfigCard";
import { useProviderConnections } from "./hooks/useProviderConnections";
import { useOneByOneTest } from "./hooks/useOneByOneTest";
import { useAntigravityActions } from "./hooks/useAntigravityActions";
import { useBulkProxy } from "./hooks/useBulkProxy";
import { useProviderModels } from "./hooks/useProviderModels";
import { useProviderModals } from "./hooks/useProviderModals";
import ProviderDetailHeader from "./components/ProviderDetailHeader";
import ConnectionsCard from "./components/ConnectionsCard";
import ProviderModelsCard from "./components/ProviderModelsCard";
import ProviderTestModals from "./components/ProviderTestModals";

/**
 * Provider detail page orchestrating connection management, Antigravity batch actions,
 * model configuration, and provider-specific modals.
 */
export default function ProviderDetailPage() {
  const params = useParams();
  const router = useRouter();
  const providerId = params.id;
  const { getCaps } = useModelCaps();
  const { copied, copy } = useCopyToClipboard();

  const connState = useProviderConnections({ providerId });
  const { connections, loading, providerNode, proxyPools, providerMeta, confirmState, setConfirmState, fetchConnections } =
    connState;
  const { providerInfo, isOAuth, isOpenAICompatible, isAnthropicCompatible, isCompatible } = providerMeta;

  const oneByOne = useOneByOneTest({ connections });
  const antigravity = useAntigravityActions({ providerId, fetchConnections });
  const bulkProxy = useBulkProxy({ connections, proxyPools, fetchConnections });
  const modelsState = useProviderModels({
    providerId,
    providerMeta,
    connections,
    thinkingMode: connState.thinkingMode,
    setThinkingMode: connState.setThinkingMode,
    setConfirmState,
  });

  const { modalState, triggerApiKeyConnection, triggerOAuthConnection, triggerAddConnection, handleAgRiskConfirm, openEditConnection } =
    useProviderModals({
      providerId,
      isOAuth,
      setShowAgRiskModal: antigravity.setShowAgRiskModal,
      fetchConnections,
      confirmState,
      setConfirmState,
    });

  if (loading) {
    return (
      <div className="flex flex-col gap-8">
        <CardSkeleton />
        <CardSkeleton />
      </div>
    );
  }

  if (!providerInfo) {
    return (
      <div className="text-center py-20">
        <p className="text-text-muted">Provider not found</p>
        <Link href="/dashboard/providers" className="text-primary mt-4 inline-block">
          Back to Providers
        </Link>
      </div>
    );
  }

  return (
    <div className="flex min-w-0 flex-col gap-6 px-1 sm:gap-8 sm:px-0">
      <ProviderDetailHeader
        providerInfo={providerInfo}
        providerNode={providerNode}
        connectionsCount={connections.length}
        isOpenAICompatible={isOpenAICompatible}
        isAnthropicCompatible={isAnthropicCompatible}
        isCompatible={isCompatible}
        onOpenAddApiKey={triggerApiKeyConnection}
        onOpenEditNode={() => modalState.setShowEditNodeModal(true)}
        onDeleteNode={() => connState.handleDeleteNode(isAnthropicCompatible, () => router.push("/dashboard/providers"))}
      />

      <ConnectionsCard
        providerId={providerId}
        providerMeta={providerMeta}
        connections={connections}
        filteredConnections={connState.filteredConnections}
        proxyPools={proxyPools}
        tierCounts={connState.tierCounts}
        antigravityTierFilter={connState.antigravityTierFilter}
        setAntigravityTierFilter={connState.setAntigravityTierFilter}
        selectedConnectionIds={connState.selectedConnectionIds}
        allFilteredSelected={connState.allFilteredSelected}
        toggleSelectConnection={connState.toggleSelectConnection}
        toggleSelectAllConnections={connState.toggleSelectAllConnections}
        providerStrategy={connState.providerStrategy}
        providerStickyLimit={connState.providerStickyLimit}
        autoPing={connState.autoPing}
        oneByOne={oneByOne}
        antigravity={antigravity}
        actions={{
          onOpenBulkProxy: () => bulkProxy.setShowBulkProxyModal(true),
          onBulkDelete: connState.handleBulkDelete,
          onRoundRobinToggle: connState.handleRoundRobinToggle,
          onStickyLimitChange: connState.handleStickyLimitChange,
          onRefresh: fetchConnections,
          onTriggerOAuth: triggerOAuthConnection,
          onTriggerApiKey: triggerApiKeyConnection,
          onTriggerAdd: triggerAddConnection,
          onOpenIFlowCookie: () => modalState.setShowIFlowCookieModal(true),
          onOpenBulkCodex: () => modalState.setShowBulkImportCodex(true),
          onOpenBulkGrokCli: () => modalState.setShowBulkImportGrokCli(true),
          onSwapPriority: connState.handleSwapPriority,
          onToggleActive: connState.handleUpdateConnectionStatus,
          onConfigureAutoPing: modalState.setScheduleConnection,
          onUpdateProxy: connState.handleUpdateConnectionProxy,
          onEditConnection: openEditConnection,
          onDeleteConnection: connState.handleDelete,
        }}
      />

      <CustomConfigCard providerId={providerId} />

      <ProviderModelsCard
        providerId={providerId}
        providerMeta={providerMeta}
        connections={connections}
        copied={copied}
        onCopy={copy}
        getCaps={getCaps}
        modelsState={modelsState}
        thinkingMode={connState.thinkingMode}
        onOpenAddCustomModel={() => modalState.setShowAddCustomModel(true)}
      />

      <ProviderTestModals
        providerId={providerId}
        providerMeta={providerMeta}
        connections={connections}
        proxyPools={proxyPools}
        providerNode={providerNode}
        autoPing={connState.autoPing}
        bulkProxy={bulkProxy}
        antigravity={antigravity}
        modalState={modalState}
        onRefresh={fetchConnections}
        onSaveApiKey={async (formData) => {
          modalState.setAddConnectionError("");
          const result = await connState.handleSaveApiKey(formData);
          if (result.ok) {
            modalState.setShowAddApiKeyModal(false);
          } else {
            modalState.setAddConnectionError(result.error);
          }
        }}
        onUpdateConnection={async (formData) => {
          if (!modalState.selectedConnection) return;
          const ok = await connState.handleUpdateConnection(modalState.selectedConnection.id, formData);
          if (ok) modalState.setShowEditModal(false);
        }}
        onUpdateNode={async (formData) => {
          const ok = await connState.handleUpdateNode(formData);
          if (ok) modalState.setShowEditNodeModal(false);
        }}
        onAddCustomModel={modelsState.handleAddCustomModel}
        onSaveAutoPing={connState.handleSaveAutoPing}
        onAgRiskConfirm={handleAgRiskConfirm}
      />
    </div>
  );
}
