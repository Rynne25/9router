"use client";

import { useState } from "react";
import PropTypes from "prop-types";
import ModelRow from "../ModelRow";

const TIER_SUFFIX_RE = /-(xhigh|high|medium|low|tiered|thinking)$/;
const TIER_LABELS = {
  base: "Default",
  high: "High",
  xhigh: "X-High",
  medium: "Med",
  low: "Low",
  tiered: "Tiered",
  thinking: "Thinking",
};
const TIER_ORDER = { base: 0, thinking: 1, low: 2, medium: 3, high: 4, xhigh: 5, tiered: 6 };

function splitModelFamily(model) {
  const m = model.id.match(TIER_SUFFIX_RE);
  const tierKey = m ? m[1] : "base";
  const familyId = m ? model.id.slice(0, -m[0].length) : model.id;
  const familyName = (model.name || model.id)
    .replace(/\s*\((High|Medium|Low|X-High|Tiered|Thinking)\)\s*$/i, "")
    .trim();
  return { familyId, familyName, tierKey, tierLabel: TIER_LABELS[tierKey] || tierKey };
}

/**
 * Group models sharing a base ID with thinking/effort tier suffixes into families.
 * @param {Array<object>} models
 */
export function buildModelFamilies(models) {
  const map = new Map();
  for (const model of models) {
    const info = splitModelFamily(model);
    if (!map.has(info.familyId)) {
      map.set(info.familyId, {
        familyId: info.familyId,
        label: info.familyName || info.familyId,
        variants: [],
      });
    }
    map.get(info.familyId).variants.push({ ...info, model });
  }
  return Array.from(map.values()).map((fam) => {
    fam.variants.sort((a, b) => (TIER_ORDER[a.tierKey] ?? 99) - (TIER_ORDER[b.tierKey] ?? 99));
    return fam;
  });
}

/**
 * Render a model family card with variant tier pills, or a plain ModelRow if single-variant.
 */
export default function ModelFamilyCard({
  family,
  providerStorageAlias,
  providerDisplayAlias,
  providerId,
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
  const [selectedId, setSelectedId] = useState(
    () => (family.variants.find((v) => v.tierKey === "high" || v.tierKey === "medium") || family.variants[0])?.model.id
  );
  const activeVariant = family.variants.find((v) => v.model.id === selectedId) || family.variants[0];
  const activeModel = activeVariant.model;
  const fullModel = `${providerStorageAlias}/${activeModel.id}`;
  const oldFormatModel = `${providerId}/${activeModel.id}`;
  const existingAlias = Object.entries(modelAliases).find(
    ([, m]) => m === fullModel || m === oldFormatModel
  )?.[0];

  const row = (
    <ModelRow
      key={activeModel.id}
      model={activeModel}
      fullModel={`${providerDisplayAlias}/${activeModel.id}`}
      alias={existingAlias}
      copied={copied}
      onCopy={onCopy}
      onSetAlias={(alias) => onSetAlias(activeModel.id, alias, providerStorageAlias)}
      onDeleteAlias={() => onDeleteAlias(existingAlias)}
      testStatus={modelTestResults[activeModel.id]}
      onTest={onTest ? () => onTest(activeModel.id) : undefined}
      isTesting={testingModelIds.has(activeModel.id)}
      isFree={activeModel.isFree}
      onDisable={() => onDisable(activeModel.id)}
      caps={getCaps(`${providerId}/${activeModel.id}`)}
      thinkingSuffix={resolveThinkingSuffix(activeModel.id)}
    />
  );

  if (family.variants.length <= 1) return row;

  return (
    <div className="w-full min-w-0 rounded-lg border border-border/80 bg-surface/30 p-2 flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-1.5 px-1">
        <span className="text-xs font-semibold text-text-main truncate">{family.label}</span>
        <div className="flex flex-wrap items-center gap-1">
          {family.variants.map((v) => {
            const active = v.model.id === activeModel.id;
            const status = modelTestResults[v.model.id];
            return (
              <button
                key={v.model.id}
                type="button"
                onClick={() => setSelectedId(v.model.id)}
                className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium border transition-colors ${
                  active
                    ? "bg-primary text-white border-primary"
                    : "bg-surface border-border text-text-muted hover:text-text-main hover:border-primary/40"
                }`}
              >
                {status && (
                  <span className={`w-1.5 h-1.5 rounded-full ${status === "ok" ? "bg-emerald-400" : "bg-red-400"}`} />
                )}
                {v.tierLabel}
              </button>
            );
          })}
        </div>
      </div>
      {row}
    </div>
  );
}

ModelFamilyCard.propTypes = {
  family: PropTypes.object.isRequired,
  providerStorageAlias: PropTypes.string.isRequired,
  providerDisplayAlias: PropTypes.string.isRequired,
  providerId: PropTypes.string.isRequired,
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
