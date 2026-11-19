"use client";

import Modal from "../Modal";
import ComboSelectSection from "./ComboSelectSection";
import ModelGroupList from "./ModelGroupList";

export default function ModelSelectModalView({
  isOpen,
  onClose,
  title,
  size,
  allowProviderWildcard,
  searchQuery,
  onSearchChange,
  parsedQuery,
  closeOnSelect,
  visibleModels,
  visibleUnadded,
  visibleAdded,
  addedModelValues,
  onSelectAllVisible,
  onDeselectAllVisible,
  filteredCombos,
  filteredGroups,
  selectedModel,
  getCaps,
  onSelect,
}) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      size={size}
      className="p-4! bg-white dark:bg-[#0f1118] border-black/15 dark:border-white/15 shadow-2xl"
      footer={null}
    >
      {/* Info bar */}
      <div className="flex items-center gap-2 mb-3 px-2.5 py-2 bg-primary/10 border border-primary/25 rounded-lg text-xs text-zinc-700 dark:text-zinc-300 font-medium">
        <span className="material-symbols-outlined text-primary shrink-0" style={{ fontSize: "14px" }}>info</span>
        <span>
          {allowProviderWildcard
            ? "Click to add/remove a model, or click a provider name for wildcard (e.g. provider/*). Search supports exclusions (e.g. claude -haiku) and RegEx (/pattern/)."
            : "Click to add, click again to remove. Search supports exclusions (e.g. claude -haiku) and RegEx (/pattern/)."}
        </span>
      </div>

      {/* Search & batch actions */}
      <div className="mb-3 space-y-2">
        <div className="relative">
          <span className="material-symbols-outlined absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted text-[16px]">
            search
          </span>
          <input
            type="text"
            placeholder={
              allowProviderWildcard
                ? "Search models (e.g. claude -haiku, oc/*, /regex/)..."
                : "Search models (e.g. claude -haiku, !embed, /regex/)..."
            }
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full pl-8 pr-20 py-2 bg-white/90 dark:bg-zinc-900/95 border border-black/20 dark:border-white/20 rounded-lg text-xs font-semibold text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-primary/50 shadow-xs"
          />
          <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
            {parsedQuery.isRegex && (
              <span className="text-[10px] px-1 py-0.2 rounded bg-primary/10 text-primary font-mono font-medium">
                regex
              </span>
            )}
            {parsedQuery.negativeTerms.length > 0 && !parsedQuery.isRegex && (
              <span className="text-[10px] px-1 py-0.2 rounded bg-amber-500/10 text-amber-500 font-mono font-medium">
                !exclude
              </span>
            )}
            {searchQuery && (
              <button
                type="button"
                onClick={() => onSearchChange("")}
                className="text-text-muted hover:text-text-main cursor-pointer p-0.5 rounded"
                title="Clear search"
              >
                <span className="material-symbols-outlined text-[14px] leading-none">close</span>
              </button>
            )}
          </div>
        </div>

        {!closeOnSelect && visibleModels.length > 0 && (
          <div className="flex items-center justify-between px-1 text-[11px] text-text-muted">
            <span className="flex items-center gap-1.5">
              <span>{visibleModels.length} models</span>
              {addedModelValues.length > 0 && (
                <span className="text-primary font-medium">({addedModelValues.length} selected)</span>
              )}
            </span>
            <div className="flex items-center gap-1.5">
              {visibleUnadded.length > 0 && (
                <button
                  type="button"
                  onClick={onSelectAllVisible}
                  className="px-2 py-0.5 rounded text-[11px] font-medium bg-primary/10 text-primary hover:bg-primary/20 transition-colors cursor-pointer"
                  title="Select all filtered models"
                >
                  Select All ({visibleUnadded.length})
                </button>
              )}
              {visibleAdded.length > 0 && (
                <button
                  type="button"
                  onClick={onDeselectAllVisible}
                  className="px-2 py-0.5 rounded text-[11px] font-medium bg-border/40 text-text-muted hover:text-text-main hover:bg-border/60 transition-colors cursor-pointer"
                  title="Deselect all filtered models"
                >
                  Deselect All ({visibleAdded.length})
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Models grouped by provider */}
      <div className="max-h-[68vh] overflow-y-auto space-y-4 pr-1">
        <ComboSelectSection
          combos={filteredCombos}
          selectedModel={selectedModel}
          addedModelValues={addedModelValues}
          onSelect={onSelect}
        />

        <ModelGroupList
          filteredGroups={filteredGroups}
          selectedModel={selectedModel}
          addedModelValues={addedModelValues}
          allowProviderWildcard={allowProviderWildcard}
          getCaps={getCaps}
          onSelect={onSelect}
        />

        {Object.keys(filteredGroups).length === 0 && filteredCombos.length === 0 && (
          <div className="text-center py-6 text-text-muted">
            <span className="material-symbols-outlined text-3xl mb-1 block">search_off</span>
            <p className="text-xs">No models found</p>
          </div>
        )}
      </div>
    </Modal>
  );
}
