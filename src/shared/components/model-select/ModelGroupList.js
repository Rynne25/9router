"use client";

import ProviderIcon from "../ProviderIcon";
import CapacityBadges from "../CapacityBadges";
import { getModelTheme, getAntigravitySubGroups } from "./modelTheme";

function ModelCard({ model, isSelected, isAdded, caps, onSelect }) {
  const isPlaceholder = model.isPlaceholder;
  const theme = getModelTheme(model);

  return (
    <button
      type="button"
      onClick={() => onSelect(model)}
      title={isPlaceholder ? "Select to pre-fill, then edit model ID in the input" : model.value}
      className={`group relative flex flex-col items-start justify-between gap-1.5 p-2.5 rounded-xl border text-left transition-all hover:shadow-md cursor-pointer ${
        isPlaceholder
          ? "border-dashed border-border text-text-muted hover:border-primary/50 hover:text-primary bg-surface italic"
          : isSelected
          ? "bg-primary/25 border-primary text-text-main shadow-md ring-2 ring-primary/60"
          : isAdded
          ? "bg-primary/15 border-primary/60 text-text-main"
          : `${theme.card}`
      }`}
    >
      <div className="flex items-center justify-between gap-1.5 w-full">
        <span className="flex items-center gap-1.5 min-w-0">
          <span className={`material-symbols-outlined text-[16px] shrink-0 ${theme.iconColor}`}>
            {isPlaceholder ? "edit" : theme.icon}
          </span>
          <span className="text-xs sm:text-sm font-bold text-zinc-900 dark:text-zinc-50 truncate">
            {model.name}
          </span>
        </span>
        <span className={`px-1.5 py-0.5 rounded text-[9px] font-mono font-bold shrink-0 ${theme.badge}`}>
          {theme.badgeText}
        </span>
      </div>

      <div className="flex items-center justify-between gap-2 w-full mt-0.5 pt-1.5 border-t border-black/10 dark:border-white/10">
        <code className="text-[10.5px] font-mono font-medium text-zinc-600 dark:text-zinc-300 truncate max-w-[200px]" translate="no">
          {model.value}
        </code>
        <div className="flex items-center gap-1 shrink-0">
          {model.isCustom && (
            <span className="text-[9px] px-1 py-0.2 rounded bg-surface-2 text-text-muted font-normal">custom</span>
          )}
          <CapacityBadges caps={caps} size={11} />
          {(isSelected || isAdded) && !isPlaceholder && (
            <span className="material-symbols-outlined text-primary text-[14px]">check_circle</span>
          )}
        </div>
      </div>
    </button>
  );
}

export default function ModelGroupList({
  filteredGroups,
  selectedModel,
  addedModelValues,
  allowProviderWildcard,
  getCaps,
  onSelect,
}) {
  return Object.entries(filteredGroups).map(([providerId, group]) => {
    const wildcardValue = `${group.alias || providerId}/*`;
    const isWildcardAdded = allowProviderWildcard && addedModelValues.includes(wildcardValue);
    const subGroups = providerId === "antigravity" ? getAntigravitySubGroups(group.models) : null;

    const renderModelCard = (model) => (
      <ModelCard
        key={model.value}
        model={model}
        isSelected={selectedModel === model.value}
        isAdded={addedModelValues.includes(model.value)}
        caps={getCaps(model.value)}
        onSelect={onSelect}
      />
    );

    return (
      <div key={providerId} className="space-y-2">
        <div className="flex items-center gap-2 sticky top-0 bg-white/95 dark:bg-[#11131a]/95 backdrop-blur-md py-1 z-10 border-b border-black/10 dark:border-white/10 pb-1.5">
          <ProviderIcon
            src={`/providers/${providerId}.png`}
            alt={group.name}
            size={16}
            fallbackText={(group.name || providerId).slice(0, 2).toUpperCase()}
            fallbackColor={group.color}
          />
          {allowProviderWildcard ? (
            <button
              type="button"
              onClick={() => onSelect({ value: wildcardValue, name: wildcardValue })}
              title={
                isWildcardAdded
                  ? `Click to remove wildcard ${wildcardValue}`
                  : `Click to allow all models from ${group.name} (${wildcardValue})`
              }
              className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-xs font-bold transition-all cursor-pointer border ${
                isWildcardAdded
                  ? "bg-primary text-white border-primary shadow-2xs hover:bg-primary-hover"
                  : "text-primary border-transparent hover:bg-primary/10 hover:border-primary/20"
              }`}
            >
              {isWildcardAdded && (
                <span className="material-symbols-outlined leading-none text-[12px]">check</span>
              )}
              <span>{group.name}</span>
              <span
                className={`text-[10px] font-mono px-1 py-0.2 rounded font-bold ${
                  isWildcardAdded
                    ? "bg-white/20 text-white"
                    : "text-zinc-600 dark:text-zinc-300 bg-black/5 dark:bg-white/10 border border-black/10 dark:border-white/10"
                }`}
              >
                {wildcardValue}
              </span>
            </button>
          ) : (
            <span className="text-sm font-extrabold text-zinc-900 dark:text-zinc-50">
              {group.name}
            </span>
          )}
          <span className="text-xs px-2 py-0.2 rounded-full bg-black/5 dark:bg-white/10 text-zinc-700 dark:text-zinc-300 font-bold">
            {group.models.length}
          </span>
        </div>

        {subGroups ? (
          <div className="space-y-3 pl-1">
            {subGroups.map((sg) => (
              <div key={sg.key} className="space-y-1.5">
                <div className="flex items-center gap-1.5 px-0.5">
                  <span className={`w-2 h-2 rounded-full ${sg.dotColor} shadow-xs`} />
                  <span className="text-[11px] font-black uppercase tracking-wider text-zinc-900 dark:text-zinc-100">
                    {sg.label}
                  </span>
                  <span className="text-[10px] text-zinc-500 dark:text-zinc-400 font-bold">
                    ({sg.models.length})
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                  {sg.models.map(renderModelCard)}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 pl-1">
            {group.models.map(renderModelCard)}
          </div>
        )}
      </div>
    );
  });
}
