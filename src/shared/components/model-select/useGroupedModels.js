"use client";

import { useMemo, useCallback } from "react";
import { parseSearchQuery, matchesSearch } from "@/shared/utils/modelSearchFilter";
import { buildModelGroups } from "@/shared/utils/selectableModels";

/**
 * Derive grouped models, search-filtered combos/groups, and batch selection lists
 * from selectableModels.buildModelGroups (single source of truth).
 */
export function useGroupedModels({
  filteredActiveProviders,
  effectiveConnections,
  kindFilter,
  capFilter,
  modelAliases,
  providerNodes,
  customModels,
  disabledModels,
  liveModels,
  combos,
  searchQuery,
  addedModelValues,
  allowProviderWildcard,
  getCaps,
}) {
  const groupedModels = useMemo(
    () =>
      buildModelGroups({
        connections: filteredActiveProviders,
        allConnections: effectiveConnections,
        kindFilter,
        modelAliases,
        providerNodes,
        customModels,
        disabledModels,
        liveModels,
      }),
    [
      filteredActiveProviders,
      effectiveConnections,
      kindFilter,
      modelAliases,
      providerNodes,
      customModels,
      disabledModels,
      liveModels,
    ]
  );

  const parsedQuery = useMemo(() => parseSearchQuery(searchQuery), [searchQuery]);

  // Hide combos when kindFilter or capFilter is set — combos are LLM-only by design.
  const filteredCombos = useMemo(() => {
    if (kindFilter || capFilter) return [];
    if (parsedQuery.isEmpty) return combos;
    return combos.filter((c) => matchesSearch(c.name, parsedQuery));
  }, [combos, parsedQuery, kindFilter, capFilter]);

  const sortModels = useCallback(
    (models) => {
      const added = models
        .filter((m) => addedModelValues.includes(m.value))
        .sort((a, b) => a.name.localeCompare(b.name));
      const rest = models
        .filter((m) => !addedModelValues.includes(m.value))
        .sort((a, b) => a.name.localeCompare(b.name));
      return [...added, ...rest];
    },
    [addedModelValues]
  );

  const filteredGroups = useMemo(() => {
    const filtered = {};
    Object.entries(groupedModels).forEach(([providerId, group]) => {
      let models = group.models;
      if (capFilter) {
        models = models.filter((m) => getCaps(m.value)?.[capFilter] === true);
        if (models.length === 0) return;
      }
      if (!parsedQuery.isEmpty) {
        const providerNameMatches = matchesSearch(group.name, parsedQuery);
        const aliasMatches =
          allowProviderWildcard &&
          ((group.alias && matchesSearch(group.alias, parsedQuery)) ||
            (providerId && matchesSearch(providerId, parsedQuery)) ||
            matchesSearch(`${group.alias}/*`, parsedQuery));

        models = models.filter((m) => {
          if (matchesSearch(m, parsedQuery)) return true;
          if (providerNameMatches || aliasMatches) {
            if (parsedQuery.negativeTerms.length > 0) {
              return matchesSearch(m, { ...parsedQuery, positiveTerms: [] });
            }
            return true;
          }
          return false;
        });

        if (models.length === 0) return;
      }
      filtered[providerId] = {
        ...group,
        models: sortModels(models),
      };
    });

    return filtered;
  }, [groupedModels, parsedQuery, allowProviderWildcard, capFilter, getCaps, sortModels]);

  const visibleModels = useMemo(() => {
    const list = [];
    Object.values(filteredGroups).forEach((group) => {
      group.models.forEach((m) => {
        if (!m.isPlaceholder) list.push(m);
      });
    });
    return list;
  }, [filteredGroups]);

  const visibleUnadded = useMemo(
    () => visibleModels.filter((m) => !addedModelValues.includes(m.value)),
    [visibleModels, addedModelValues]
  );

  const visibleAdded = useMemo(
    () => visibleModels.filter((m) => addedModelValues.includes(m.value)),
    [visibleModels, addedModelValues]
  );

  return {
    parsedQuery,
    filteredCombos,
    filteredGroups,
    visibleModels,
    visibleUnadded,
    visibleAdded,
  };
}
