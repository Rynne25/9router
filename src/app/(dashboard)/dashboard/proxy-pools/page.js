"use client";

import { useState } from "react";
import Card from "@/shared/components/Card";
import { CardSkeleton } from "@/shared/components/Loading";
import { ConfirmModal } from "@/shared/components/Modal";
import { useNotificationStore } from "@/store/notificationStore";
import { useProxyPools } from "./hooks/useProxyPools";
import { useProxyHealthCheck } from "./hooks/useProxyHealthCheck";
import { useRelayDeploy } from "./hooks/useRelayDeploy";
import ProxyPoolsToolbar from "./components/ProxyPoolsToolbar";
import ProxyPoolTable from "./components/ProxyPoolTable";
import ProxyPoolFormModal from "./components/ProxyPoolFormModal";
import BatchImportProxyModal from "./components/BatchImportProxyModal";
import RelayDeployModal from "./components/RelayDeployModal";

export default function ProxyPoolsPage() {
  const notify = useNotificationStore();
  const [showBatchImportModal, setShowBatchImportModal] = useState(false);

  const pools = useProxyPools({ notify });
  const refreshProxyPools = () => pools.fetchProxyPools(true);
  const healthCheck = useProxyHealthCheck({
    visiblePools: pools.visiblePools,
    selectedIds: pools.selectedIds,
    fetchProxyPools: refreshProxyPools,
    setBulkBusy: pools.setBulkBusy,
    setConfirmState: pools.setConfirmState,
    notify,
  });
  const relayDeploy = useRelayDeploy({
    onSuccess: refreshProxyPools,
    notify,
  });

  if (pools.loading) {
    return (
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 px-1 sm:gap-6 sm:px-0">
        <CardSkeleton />
        <CardSkeleton />
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 px-1 sm:gap-6 sm:px-0">
      <ProxyPoolsToolbar
        totalCount={pools.proxyPools.length}
        activeCount={pools.activeCount}
        visibleCount={pools.visiblePools.length}
        statusFilter={pools.statusFilter}
        onStatusFilterChange={pools.setStatusFilter}
        allSelected={pools.allSelected}
        onToggleSelectAll={pools.toggleSelectAll}
        selectedCount={pools.selectedIds.length}
        onClearSelection={pools.clearSelection}
        bulkBusy={pools.bulkBusy}
        healthChecking={healthCheck.healthChecking}
        healthProgress={healthCheck.healthProgress}
        onHealthCheck={healthCheck.handleHealthCheck}
        onBulkSetActive={pools.bulkSetActive}
        onBulkDelete={pools.bulkDelete}
        onOpenCreate={pools.openCreateModal}
        onOpenBatchImport={() => setShowBatchImportModal(true)}
        onOpenDeployRelay={relayDeploy.openDeployModal}
        hasVisiblePools={pools.visiblePools.length > 0}
      />

      <Card>
        <ProxyPoolTable
          pools={pools.visiblePools}
          allPoolsCount={pools.proxyPools.length}
          selectedIds={pools.selectedIds}
          onToggleSelect={pools.toggleSelect}
          onToggleActive={pools.handleToggleActive}
          onTest={pools.handleTest}
          testingId={pools.testingId}
          onEdit={pools.openEditModal}
          onDelete={pools.handleDelete}
          onOpenCreate={pools.openCreateModal}
          bulkBusy={pools.bulkBusy}
          healthChecking={healthCheck.healthChecking}
        />
      </Card>

      <ProxyPoolFormModal
        isOpen={pools.showFormModal}
        isEdit={Boolean(pools.editingProxyPool)}
        formData={pools.formData}
        onChange={(field, value) =>
          pools.setFormData((prev) => ({ ...prev, [field]: value }))
        }
        onSave={pools.handleSave}
        onClose={pools.closeFormModal}
        saving={pools.saving}
      />

      <BatchImportProxyModal
        isOpen={showBatchImportModal}
        onClose={() => setShowBatchImportModal(false)}
        proxyPools={pools.proxyPools}
        onSuccess={refreshProxyPools}
      />

      <RelayDeployModal
        provider={relayDeploy.activeProvider}
        form={relayDeploy.currentForm}
        onChange={relayDeploy.updateFormField}
        onDeploy={relayDeploy.handleDeploy}
        onClose={relayDeploy.closeDeployModal}
        deploying={relayDeploy.deploying}
      />

      <ConfirmModal
        isOpen={Boolean(pools.confirmState)}
        onClose={() => pools.setConfirmState(null)}
        onConfirm={pools.confirmState?.onConfirm}
        title={pools.confirmState?.title || "Confirm"}
        message={pools.confirmState?.message}
        variant="danger"
      />
    </div>
  );
}
