"use client";

import PropTypes from "prop-types";
import ModelRow from "../ModelRow";
import ModelFamilyCard, { buildModelFamilies } from "./ModelFamilyCard";

/**
 * Render built-in provider models either as flat ModelRows, a 2-column grid of ModelFamilyCards,
 * or collapsible series groups (Gemini 4, Gemini 3.x, Claude, Other) for large catalogs.
 */
export default function ModelSeriesGroupList({
  providerId,
  providerStorageAlias,
  providerDisplayAlias,
  displayModels,
  modelAliases,
  copied,
  onCopy,
  onSetAlias,
  onDeleteAlias,
  modelTestResults,
  onTest,
  testingModelIds,
  onDisable,
  getCaps,
  resolveThinkingSuffix,
}) {
  const families = buildModelFamilies(displayModels);
  const hasMultiVariant = families.some((f) => f.variants.length > 1);

  const renderFam = (fam) => (
    <ModelFamilyCard
      key={fam.familyId}
      family={fam}
      providerStorageAlias={providerStorageAlias}
      providerDisplayAlias={providerDisplayAlias}
      providerId={providerId}
      modelAliases={modelAliases}
      copied={copied}
      onCopy={onCopy}
      onSetAlias={onSetAlias}
      onDeleteAlias={onDeleteAlias}
      modelTestResults={modelTestResults}
      onTest={onTest}
      testingModelIds={testingModelIds}
      onDisable={onDisable}
      getCaps={getCaps}
      resolveThinkingSuffix={resolveThinkingSuffix}
    />
  );

  if (!hasMultiVariant) {
    return displayModels.map((model) => {
      const fullModel = `${providerStorageAlias}/${model.id}`;
      const oldFormatModel = `${providerId}/${model.id}`;
      const existingAlias = Object.entries(modelAliases).find(
        ([, m]) => m === fullModel || m === oldFormatModel
      )?.[0];
      return (
        <ModelRow
          key={model.id}
          model={model}
          fullModel={`${providerDisplayAlias}/${model.id}`}
          alias={existingAlias}
          copied={copied}
          onCopy={onCopy}
          onSetAlias={(alias) => onSetAlias(model.id, alias, providerStorageAlias)}
          onDeleteAlias={() => onDeleteAlias(existingAlias)}
          testStatus={modelTestResults[model.id]}
          onTest={onTest ? () => onTest(model.id) : undefined}
          isTesting={testingModelIds.has(model.id)}
          isFree={model.isFree}
          onDisable={() => onDisable(model.id)}
          caps={getCaps(`${providerId}/${model.id}`)}
          thinkingSuffix={resolveThinkingSuffix(model.id)}
        />
      );
    });
  }

  if (providerId === "antigravity" || displayModels.length > 10) {
    const g4 = families.filter((f) => f.familyId.startsWith("gemini-4"));
    const g3 = families.filter((f) => f.familyId.startsWith("gemini-3"));
    const cl = families.filter((f) => f.familyId.startsWith("claude"));
    const rest = families.filter(
      (f) => !f.familyId.startsWith("gemini-4") && !f.familyId.startsWith("gemini-3") && !f.familyId.startsWith("claude")
    );
    const seriesGroups = [
      { key: "g4", label: "Gemini 4 Series (Argon & Hydrogen)", fams: g4 },
      { key: "g3", label: "Gemini 3.x (Flash & Lite)", fams: g3 },
      { key: "cl", label: "Claude Series (Opus & Sonnet)", fams: cl },
      { key: "other", label: "Other Models", fams: rest },
    ].filter((g) => g.fams.length > 0);

    if (seriesGroups.length > 1) {
      return (
        <div className="w-full flex flex-col gap-2.5">
          {seriesGroups.map((sg) => {
            const totalModels = sg.fams.reduce((acc, f) => acc + f.variants.length, 0);
            return (
              <details key={sg.key} open className="group rounded-lg border border-border bg-surface/20 overflow-hidden">
                <summary className="flex items-center justify-between px-3 py-2 cursor-pointer select-none bg-surface/50 hover:bg-surface transition-colors">
                  <span className="text-xs font-semibold text-text-main">{sg.label}</span>
                  <div className="flex items-center gap-2">
                    <span className="px-1.5 py-0.5 rounded bg-primary/10 text-primary text-[10px] font-medium">
                      {sg.fams.length} / {totalModels}
                    </span>
                    <span className="material-symbols-outlined text-[16px] text-text-muted transition-transform group-open:rotate-180">
                      expand_more
                    </span>
                  </div>
                </summary>
                <div className="p-2.5 grid grid-cols-1 lg:grid-cols-2 gap-2.5 border-t border-border/60">
                  {sg.fams.map(renderFam)}
                </div>
              </details>
            );
          })}
        </div>
      );
    }
  }

  return <div className="w-full grid grid-cols-1 lg:grid-cols-2 gap-2.5">{families.map(renderFam)}</div>;
}

ModelSeriesGroupList.propTypes = {
  providerId: PropTypes.string.isRequired,
  providerStorageAlias: PropTypes.string.isRequired,
  providerDisplayAlias: PropTypes.string.isRequired,
  displayModels: PropTypes.array.isRequired,
  modelAliases: PropTypes.object.isRequired,
  copied: PropTypes.string,
  onCopy: PropTypes.func.isRequired,
  onSetAlias: PropTypes.func.isRequired,
  onDeleteAlias: PropTypes.func.isRequired,
  modelTestResults: PropTypes.object.isRequired,
  onTest: PropTypes.func,
  testingModelIds: PropTypes.object.isRequired,
  onDisable: PropTypes.func.isRequired,
  getCaps: PropTypes.func.isRequired,
  resolveThinkingSuffix: PropTypes.func.isRequired,
};
