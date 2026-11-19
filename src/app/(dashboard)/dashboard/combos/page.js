"use client";

import { Card, Button, CardSkeleton, ConfirmModal, ComboFormModal } from "@/shared/components";
import { useCombosPage } from "./hooks/useCombosPage";
import ComboStrategyBar from "./components/ComboStrategyBar";
import ComboSelectionToolbar from "./components/ComboSelectionToolbar";
import ComboCard from "./components/ComboCard";
import CapacityAdapterSection from "./components/CapacityAdapterSection";

export default function CombosPage() {
  const {
    combos,
    loading,
    showCreateModal,
    setShowCreateModal,
    editingCombo,
    setEditingCombo,
    activeProviders,
    comboStrategies,
    capacityAdapter,
    confirmState,
    setConfirmState,
    presetLoading,
    selectedIds,
    bulkBusy,
    searchQuery,
    setSearchQuery,
    someSelected,
    normalizedQuery,
    filteredCombos,
    comboByName,
    allSelected,
    getCaps,
    copied,
    copy,
    toggleSelect,
    toggleSelectAll,
    clearSelection,
    handleGeneratePresets,
    handleSetCapacityAdapter,
    handleCreate,
    handleUpdate,
    handleDelete,
    handleBulkDelete,
    handleSetComboStrategy,
    handleBulkSetStrategy,
  } = useCombosPage();

  if (loading) {
    return (
      <div className="flex flex-col gap-6">
        <CardSkeleton />
        <CardSkeleton />
      </div>
    );
  }

  return (
    <div className="flex min-w-0 flex-col gap-6 px-1 sm:px-0">
      <ComboStrategyBar
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onCreateClick={() => setShowCreateModal(true)}
        presetLoading={presetLoading}
        onGeneratePresets={handleGeneratePresets}
      />

      {combos.length === 0 ? (
        <Card>
          <div className="text-center py-12">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 text-primary mb-4">
              <span className="material-symbols-outlined text-[32px]">layers</span>
            </div>
            <p className="text-text-main font-medium mb-1">No combos yet</p>
            <p className="text-sm text-text-muted mb-4">Create model combos with fallback support</p>
            <Button icon="add" onClick={() => setShowCreateModal(true)} className="w-full sm:w-auto">
              Create Combo
            </Button>
          </div>
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          <ComboSelectionToolbar
            allSelected={allSelected}
            someSelected={someSelected}
            selectedCount={selectedIds.length}
            filteredCount={filteredCombos.length}
            totalCount={combos.length}
            normalizedQuery={normalizedQuery}
            bulkBusy={bulkBusy}
            onToggleSelectAll={toggleSelectAll}
            onBulkSetStrategy={handleBulkSetStrategy}
            onBulkDelete={handleBulkDelete}
            onClearSelection={clearSelection}
          />

          <div className="flex flex-col gap-3">
            {filteredCombos.length === 0 ? (
              <Card>
                <div className="text-center py-10">
                  <p className="text-text-main font-medium mb-1">No combos match “{searchQuery.trim()}”</p>
                  <p className="text-sm text-text-muted mb-4">
                    Try a shorter query, or clear the search to see all {combos.length} combos.
                  </p>
                  <Button variant="secondary" onClick={() => setSearchQuery("")}>
                    Clear search
                  </Button>
                </div>
              </Card>
            ) : (
              filteredCombos.map((combo) => (
                <ComboCard
                  key={combo.id}
                  combo={combo}
                  getCaps={getCaps}
                  comboByName={comboByName}
                  activeProviders={activeProviders}
                  copied={copied}
                  onCopy={copy}
                  onEdit={() => setEditingCombo(combo)}
                  onDelete={() => handleDelete(combo.id)}
                  strategy={comboStrategies[combo.name] || {}}
                  onSetStrategy={(patch) => handleSetComboStrategy(combo.name, patch)}
                  selected={selectedIds.includes(combo.id)}
                  onToggleSelect={() => toggleSelect(combo.id)}
                />
              ))
            )}
          </div>
        </div>
      )}

      <CapacityAdapterSection
        capacityAdapter={capacityAdapter}
        onChange={handleSetCapacityAdapter}
        activeProviders={activeProviders}
        getCaps={getCaps}
      />

      {showCreateModal && (
        <ComboFormModal
          key="create"
          isOpen={showCreateModal}
          onClose={() => setShowCreateModal(false)}
          onSave={handleCreate}
          activeProviders={activeProviders}
        />
      )}

      {editingCombo && (
        <ComboFormModal
          key={editingCombo.id}
          isOpen={!!editingCombo}
          combo={editingCombo}
          onClose={() => setEditingCombo(null)}
          onSave={(data) => handleUpdate(editingCombo.id, data)}
          activeProviders={activeProviders}
        />
      )}

      <ConfirmModal
        isOpen={!!confirmState}
        onClose={() => !confirmState?.loading && setConfirmState(null)}
        onConfirm={confirmState?.onConfirm}
        title={confirmState?.title || "Confirm"}
        message={confirmState?.message}
        confirmText={confirmState?.confirmText || "Confirm"}
        variant={confirmState?.variant || "danger"}
        loading={!!confirmState?.loading}
      />
    </div>
  );
}
