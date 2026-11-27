"use client";

import { useState, useMemo } from "react";
import PropTypes from "prop-types";
import { Button } from "@/shared/components";
import { HudFrame, NumberTicker, MagneticButton } from "@/shared/components/hud";
import { translate } from "@/i18n/runtime";
import ModelRow from "../ModelRow";
import CompatibleModelsSection from "../CompatibleModelsSection";
import ModelSeriesGroupList from "./ModelSeriesGroupList";

function ChinaRegionHelpLink({ error }) {
  if (!/RegionError|hosted in China|regionNotAllowed/i.test(error)) return null;
  const str = typeof error === "string" ? error : JSON.stringify(error);
  const linkMatch = str.match(/https:\/\/opencode\.ai\/workspace\/[^\s"')]+/);
  const wrkMatch = str.match(/wrk_[0-9A-Za-z]+/);
  const targetUrl = linkMatch
    ? linkMatch[0].endsWith("/go")
      ? linkMatch[0]
      : `${linkMatch[0]}/go`
    : wrkMatch
      ? `https://opencode.ai/workspace/${wrkMatch[0]}/go`
      : "https://opencode.ai";

  return (
    <div className="mt-1.5">
      <a
        href={targetUrl}
        target="_blank"
        rel="noreferrer"
        data-cursor-target
        className="inline-flex items-center gap-1 rounded-md bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-600 transition-colors hover:bg-amber-500/20 dark:text-amber-400"
      >
        <span>Cho phép model máy chủ Trung Quốc</span>
        <span className="material-symbols-outlined text-[13px]">open_in_new</span>
      </a>
    </div>
  );
}

ChinaRegionHelpLink.propTypes = {
  error: PropTypes.oneOfType([PropTypes.string, PropTypes.object]).isRequired,
};

/**
 * Render provider available models card in Cyber-Bento surface:
 * thinking level selector, quick search, Disable/Active All, custom models,
 * built-in model families, Qoder/Cline importers, suggested & disabled models.
 */
export default function ProviderModelsCard({
  providerId,
  providerMeta,
  connections,
  copied,
  onCopy,
  getCaps,
  modelsState,
  thinkingMode,
  onOpenAddCustomModel,
}) {
  const [searchQuery, setSearchQuery] = useState("");
  const { providerStorageAlias, providerDisplayAlias, isCompatible, isAnthropicCompatible, isFreeNoAuth } = providerMeta;
  const {
    models,
    allLlmModels,
    displayModels,
    disabledDisplayModels,
    customModelRows,
    suggestedModels,
    modelAliases,
    customModels,
    disabledModelIds,
    modelTestResults,
    modelsTestError,
    testingModelIds,
    liveModelsError,
    providerThinkingLevels,
    resolveThinkingSuffix,
    handleThinkingModeChange,
    handleDisableModel,
    handleEnableModel,
    handleDisableAll,
    handleEnableAll,
    handleSetAlias,
    handleDeleteAlias,
    handleAddCustomModel,
    handleDeleteCustomModel,
    handleTestModel,
    importingQoderModels,
    handleImportQoderModels,
    importingClineModels,
    handleImportClineModels,
  } = modelsState;

  const canTest = connections.length > 0 || isFreeNoAuth;
  const activeIds = allLlmModels.map((m) => m.id).filter((id) => !disabledModelIds.includes(id));
  const hasActiveConnection = connections.some((conn) => conn.isActive !== false);

  const normalizedQuery = searchQuery.trim().toLowerCase();

  const filteredDisplayModels = useMemo(() => {
    if (!normalizedQuery) return displayModels;
    return displayModels.filter((m) => {
      const id = String(m.id || "").toLowerCase();
      const name = String(m.name || "").toLowerCase();
      return id.includes(normalizedQuery) || name.includes(normalizedQuery);
    });
  }, [displayModels, normalizedQuery]);

  const filteredCustomModelRows = useMemo(() => {
    if (!normalizedQuery) return customModelRows;
    return customModelRows.filter((m) => {
      const id = String(m.id || "").toLowerCase();
      const name = String(m.name || "").toLowerCase();
      const alias = String(m.alias || "").toLowerCase();
      return id.includes(normalizedQuery) || name.includes(normalizedQuery) || alias.includes(normalizedQuery);
    });
  }, [customModelRows, normalizedQuery]);

  const filteredDisabledModels = useMemo(() => {
    if (!normalizedQuery) return disabledDisplayModels;
    return disabledDisplayModels.filter((m) => String(m.id || "").toLowerCase().includes(normalizedQuery));
  }, [disabledDisplayModels, normalizedQuery]);

  const renderSuggestedModels = () => {
    if (suggestedModels.length === 0) return null;
    const addedFullModels = new Set([
      ...Object.values(modelAliases),
      ...customModelRows.map((model) => model.fullModel),
    ]);
    const hardcodedIds = new Set(models.map((m) => m.id));
    const notAdded = suggestedModels.filter(
      (m) => !addedFullModels.has(`${providerStorageAlias}/${m.id}`) && !hardcodedIds.has(m.id)
    );
    if (notAdded.length === 0) return null;
    return (
      <div className="mt-2 w-full">
        <p className="mb-2 text-xs text-text-muted">Model miễn phí gợi ý (≥200k context):</p>
        <div className="flex flex-wrap gap-2">
          {notAdded.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => handleAddCustomModel(m.id, "llm", providerStorageAlias)}
              data-cursor-target
              className="flex items-center gap-1 rounded-lg border border-black/10 px-2.5 py-1.5 text-xs text-text-muted transition-colors hover:border-cyan-500/40 hover:bg-cyan-500/5 hover:text-cyan-600 dark:border-white/10 dark:hover:text-cyan-300"
              title={`${m.name} · ${(m.contextLength / 1000).toFixed(0)}k ctx`}
            >
              <span className="material-symbols-outlined text-[13px]">add</span>
              {m.id.split("/").pop()}
            </button>
          ))}
        </div>
      </div>
    );
  };

  return (
    <HudFrame
      chamfer="md"
      accent="cyan"
      padding="md"
      spotlight
      header="DANH MỤC MODEL & ALIAS // MODEL MATRIX"
    >
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-2.5">
          <h2 className="text-lg font-semibold tracking-tight">Danh sách Model</h2>
          {!isCompatible && (
            <span className="inline-flex items-center gap-1 rounded-md border border-cyan-500/30 bg-cyan-500/10 px-2 py-0.5 font-mono text-[11px] font-semibold text-cyan-700 dark:text-cyan-300">
              <NumberTicker value={activeIds.length + customModelRows.length} />
              <span>khả dụng</span>
            </span>
          )}
          {providerThinkingLevels && (
            <select
              value={thinkingMode}
              onChange={(e) => handleThinkingModeChange(e.target.value)}
              title="Tự động thêm hậu tố (level) khi sao chép tên model"
              className="rounded-lg border border-border bg-background px-2.5 py-1 font-mono text-xs focus:border-cyan-500 focus:outline-none"
            >
              {providerThinkingLevels.map((opt) => (
                <option key={opt} value={opt}>{`Thinking: ${opt.charAt(0).toUpperCase() + opt.slice(1)}`}</option>
              ))}
            </select>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {!isCompatible && (displayModels.length > 0 || customModelRows.length > 0 || disabledDisplayModels.length > 0) && (
            <div className="relative flex-1 sm:flex-initial">
              <span className="material-symbols-outlined pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[15px] text-text-muted">
                search
              </span>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Tìm nhanh model..."
                aria-label="Tìm nhanh model"
                className="h-8 w-full rounded-lg border border-black/10 bg-black/[0.02] pl-8 pr-7 font-mono text-xs text-text-main placeholder:text-text-muted/70 focus:border-cyan-500/50 focus:outline-none dark:border-white/10 dark:bg-white/[0.03] sm:w-52"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  aria-label="Xóa từ khóa tìm model"
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-text-muted hover:text-text-main"
                >
                  <span className="material-symbols-outlined text-[14px]">close</span>
                </button>
              )}
            </div>
          )}

          {!isCompatible && (
            <div className="flex flex-wrap items-center gap-2">
              {disabledModelIds.length > 0 && (
                <Button
                  size="sm"
                  variant="secondary"
                  icon="restart_alt"
                  onClick={handleEnableAll}
                  data-cursor-target
                >
                  Bật tất cả
                </Button>
              )}
              {activeIds.length > 0 && (
                <Button
                  size="sm"
                  variant="secondary"
                  icon="block"
                  onClick={() => handleDisableAll(activeIds)}
                  data-cursor-target
                >
                  Tắt tất cả
                </Button>
              )}
            </div>
          )}
        </div>
      </div>

      {!!modelsTestError && (
        <div className="mb-3 rounded-lg border border-rose-500/30 bg-rose-500/10 p-2.5">
          <p className="break-words text-xs text-rose-600 dark:text-rose-400">{modelsTestError}</p>
          <ChinaRegionHelpLink error={modelsTestError} />
        </div>
      )}

      {providerId === "zed" && !!liveModelsError && (
        <p className="mb-3 break-words text-xs text-red-500">{liveModelsError}</p>
      )}

      {isCompatible ? (
        <CompatibleModelsSection
          providerStorageAlias={providerStorageAlias}
          providerDisplayAlias={providerDisplayAlias}
          modelAliases={modelAliases}
          customModels={customModels}
          copied={copied}
          onCopy={onCopy}
          onSetAlias={handleSetAlias}
          onDeleteAlias={handleDeleteAlias}
          onAddCustomModel={(modelId) => handleAddCustomModel(modelId, "llm", providerStorageAlias)}
          onDeleteCustomModel={(modelId) => handleDeleteCustomModel(modelId, "llm", providerStorageAlias)}
          connections={connections}
          isAnthropic={isAnthropicCompatible}
        />
      ) : (
        <div className="flex flex-wrap gap-3">
          {filteredCustomModelRows.map((model) => (
            <ModelRow
              key={`${model.source}-${model.fullModel}`}
              model={{ id: model.id, name: model.name }}
              fullModel={`${providerDisplayAlias}/${model.id}`}
              alias={model.alias}
              copied={copied}
              onCopy={onCopy}
              onSetAlias={() => {}}
              onDeleteAlias={() => {
                if (model.source === "custom") {
                  handleDeleteCustomModel(model.id, "llm", providerStorageAlias);
                } else {
                  handleDeleteAlias(model.alias);
                }
              }}
              testStatus={modelTestResults[model.id]}
              onTest={canTest ? () => handleTestModel(model.id) : undefined}
              isTesting={testingModelIds.has(model.id)}
              isCustom
              isFree={false}
              caps={getCaps(`${providerId}/${model.id}`)}
              thinkingSuffix={resolveThinkingSuffix(model.id)}
            />
          ))}

          {filteredDisplayModels.length > 0 && (
            <ModelSeriesGroupList
              providerId={providerId}
              providerStorageAlias={providerStorageAlias}
              providerDisplayAlias={providerDisplayAlias}
              displayModels={filteredDisplayModels}
              modelAliases={modelAliases}
              copied={copied}
              onCopy={onCopy}
              onSetAlias={handleSetAlias}
              onDeleteAlias={handleDeleteAlias}
              modelTestResults={modelTestResults}
              onTest={canTest ? handleTestModel : undefined}
              testingModelIds={testingModelIds}
              onDisable={handleDisableModel}
              getCaps={getCaps}
              resolveThinkingSuffix={resolveThinkingSuffix}
            />
          )}

          {normalizedQuery &&
            filteredDisplayModels.length === 0 &&
            filteredCustomModelRows.length === 0 &&
            filteredDisabledModels.length === 0 && (
              <div className="flex w-full items-center justify-between rounded-xl border border-dashed border-black/15 bg-black/[0.015] px-4 py-4 text-xs text-text-muted dark:border-white/15 dark:bg-white/[0.02]">
                <span>Không tìm thấy model phù hợp với từ khóa &ldquo;{searchQuery.trim()}&rdquo;.</span>
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="font-medium text-cyan-600 hover:underline dark:text-cyan-300"
                >
                  Xóa bộ lọc
                </button>
              </div>
            )}

          <MagneticButton strength={4} className="w-full sm:w-auto">
            <button
              type="button"
              onClick={onOpenAddCustomModel}
              data-cursor-target
              className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-cyan-500/45 bg-cyan-500/[0.04] px-3.5 py-2 text-xs font-medium text-cyan-700 transition-colors hover:border-cyan-500 hover:bg-cyan-500/10 dark:text-cyan-300 sm:w-auto"
            >
              <span className="material-symbols-outlined text-sm">add</span>
              <span>Thêm Model</span>
            </button>
          </MagneticButton>

          {(providerId === "qoder" || providerId === "qoder-cn") && hasActiveConnection && (
            <button
              type="button"
              onClick={handleImportQoderModels}
              disabled={importingQoderModels}
              data-cursor-target
              className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-blue-500/40 px-3 py-2 text-xs text-blue-600 transition-colors hover:border-blue-500 hover:bg-blue-500/5 disabled:cursor-not-allowed disabled:opacity-50 dark:text-blue-400 sm:w-auto"
            >
              <span
                className="material-symbols-outlined text-sm"
                style={importingQoderModels ? { animation: "spin 1s linear infinite" } : undefined}
              >
                {importingQoderModels ? "progress_activity" : "download"}
              </span>
              {importingQoderModels ? translate("Fetching...") : translate("Fetch Qoder Models")}
            </button>
          )}

          {(providerId === "cline" || providerId === "clinepass") && hasActiveConnection && (
            <button
              type="button"
              onClick={handleImportClineModels}
              disabled={importingClineModels}
              data-cursor-target
              className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-blue-500/40 px-3 py-2 text-xs text-blue-600 transition-colors hover:border-blue-500 hover:bg-blue-500/5 disabled:cursor-not-allowed disabled:opacity-50 dark:text-blue-400 sm:w-auto"
            >
              <span
                className="material-symbols-outlined text-sm"
                style={importingClineModels ? { animation: "spin 1s linear infinite" } : undefined}
              >
                {importingClineModels ? "progress_activity" : "download"}
              </span>
              {importingClineModels ? translate("Fetching...") : translate("Import from /models")}
            </button>
          )}

          {renderSuggestedModels()}

          {filteredDisabledModels.length > 0 && (
            <div className="mt-2 w-full border-t border-black/[0.05] pt-3 dark:border-white/[0.06]">
              <p className="mb-2 text-xs text-text-muted">
                <span>Model đã tắt</span> ({filteredDisabledModels.length}):
              </p>
              <div className="flex flex-wrap gap-2">
                {filteredDisabledModels.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => handleEnableModel(m.id)}
                    data-cursor-target
                    className="flex items-center gap-1 rounded-lg border border-dashed border-black/15 px-2.5 py-1.5 font-mono text-xs text-text-muted transition-colors hover:border-cyan-500/45 hover:bg-cyan-500/5 hover:text-cyan-600 dark:border-white/15 dark:hover:text-cyan-300"
                    title="Khôi phục model"
                  >
                    <span className="material-symbols-outlined text-[13px]">add</span>
                    {m.id}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </HudFrame>
  );
}

ProviderModelsCard.propTypes = {
  providerId: PropTypes.string.isRequired,
  providerMeta: PropTypes.object.isRequired,
  connections: PropTypes.array.isRequired,
  copied: PropTypes.string,
  onCopy: PropTypes.func.isRequired,
  getCaps: PropTypes.func.isRequired,
  modelsState: PropTypes.object.isRequired,
  thinkingMode: PropTypes.string.isRequired,
  onOpenAddCustomModel: PropTypes.func.isRequired,
};
