"use client";

import PropTypes from "prop-types";
import { Card, Button } from "@/shared/components";
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
        className="inline-flex items-center gap-1 rounded-md bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-600 hover:bg-amber-500/20 dark:text-amber-400 transition-colors"
      >
        <span>Allow China-hosted models</span>
        <span className="material-symbols-outlined text-[13px]">open_in_new</span>
      </a>
    </div>
  );
}

ChinaRegionHelpLink.propTypes = {
  error: PropTypes.oneOfType([PropTypes.string, PropTypes.object]).isRequired,
};

/**
 * Render provider available models card: thinking level selector, Disable/Active All,
 * custom models, built-in model families, Qoder/Cline importers, suggested & disabled models.
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
      <div className="w-full mt-2">
        <p className="text-xs text-text-muted mb-2">Suggested free models (≥200k context):</p>
        <div className="flex flex-wrap gap-2">
          {notAdded.map((m) => (
            <button
              key={m.id}
              onClick={() => handleAddCustomModel(m.id, "llm", providerStorageAlias)}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-black/10 dark:border-white/10 text-xs text-text-muted hover:text-primary hover:border-primary/40 hover:bg-primary/5 transition-colors"
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
    <Card>
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold">Available Models</h2>
          {providerThinkingLevels && (
            <select
              value={thinkingMode}
              onChange={(e) => handleThinkingModeChange(e.target.value)}
              title="Appends (level) suffix to copied model names"
              className="rounded-md border border-border bg-background px-2 py-1 text-xs focus:border-primary focus:outline-none"
            >
              {providerThinkingLevels.map((opt) => (
                <option key={opt} value={opt}>{`Thinking: ${opt.charAt(0).toUpperCase() + opt.slice(1)}`}</option>
              ))}
            </select>
          )}
        </div>
        {!isCompatible && (
          <div className="flex gap-2">
            {disabledModelIds.length > 0 && (
              <Button size="sm" variant="secondary" icon="restart_alt" onClick={handleEnableAll}>
                Active All
              </Button>
            )}
            {activeIds.length > 0 && (
              <Button size="sm" variant="secondary" icon="block" onClick={() => handleDisableAll(activeIds)}>
                Disable All
              </Button>
            )}
          </div>
        )}
      </div>

      {!!modelsTestError && (
        <div className="mb-3">
          <p className="text-xs text-red-500 break-words">{modelsTestError}</p>
          <ChinaRegionHelpLink error={modelsTestError} />
        </div>
      )}

      {providerId === "zed" && !!liveModelsError && (
        <p className="text-xs text-red-500 mb-3 break-words">{liveModelsError}</p>
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
          {customModelRows.map((model) => (
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

          <ModelSeriesGroupList
            providerId={providerId}
            providerStorageAlias={providerStorageAlias}
            providerDisplayAlias={providerDisplayAlias}
            displayModels={displayModels}
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

          <button
            onClick={onOpenAddCustomModel}
            className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-primary/40 px-3 py-2 text-xs text-primary transition-colors hover:border-primary hover:bg-primary/5 sm:w-auto"
          >
            <span className="material-symbols-outlined text-sm">add</span>
            Add Model
          </button>

          {(providerId === "qoder" || providerId === "qoder-cn") && hasActiveConnection && (
            <button
              onClick={handleImportQoderModels}
              disabled={importingQoderModels}
              className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-blue-500/40 px-3 py-2 text-xs text-blue-600 dark:text-blue-400 transition-colors hover:border-blue-500 hover:bg-blue-500/5 sm:w-auto disabled:opacity-50 disabled:cursor-not-allowed"
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
              onClick={handleImportClineModels}
              disabled={importingClineModels}
              className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-blue-500/40 px-3 py-2 text-xs text-blue-600 dark:text-blue-400 transition-colors hover:border-blue-500 hover:bg-blue-500/5 sm:w-auto disabled:opacity-50 disabled:cursor-not-allowed"
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

          {disabledDisplayModels.length > 0 && (
            <div className="w-full mt-2">
              <p className="text-xs text-text-muted mb-2">
                <span>Disabled models</span> ({disabledDisplayModels.length}):
              </p>
              <div className="flex flex-wrap gap-2">
                {disabledDisplayModels.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => handleEnableModel(m.id)}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-dashed border-black/10 dark:border-white/10 text-xs text-text-muted hover:text-primary hover:border-primary/40 hover:bg-primary/5 transition-colors"
                    title="Restore model"
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
    </Card>
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
