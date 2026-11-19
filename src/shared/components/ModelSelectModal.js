"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import PropTypes from "prop-types";
import { useModelCaps } from "@/shared/hooks/useModelCaps";
import { AI_PROVIDERS } from "@/shared/constants/providers";
import { useLiveProviderModels } from "./model-select/useLiveProviderModels";
import { useGroupedModels } from "./model-select/useGroupedModels";
import ModelSelectModalView from "./model-select/ModelSelectModalView";

// Providers with per-account live catalogs via /api/providers/[id]/models.
const LIVE_CATALOG_PROVIDERS = ["cursor", "cline", "clinepass", "zed"];

async function fetchJsonSafe(fetcher, pick, fallback, label) {
  try {
    const res = await fetcher();
    if (!res.ok) throw new Error(`Failed to fetch ${label}: ${res.status}`);
    const data = await res.json();
    return pick(data);
  } catch (error) {
    console.error(`Error fetching ${label} in ModelSelectModal:`, error);
    return fallback;
  }
}

export default function ModelSelectModal({
  isOpen,
  onClose,
  onSelect,
  onDeselect,
  onSelectBatch,
  onDeselectBatch,
  selectedModel,
  activeProviders = [],
  title = "Select Model",
  size = "5xl",
  modelAliases = {},
  kindFilter = null,
  capFilter = null,
  addedModelValues = [],
  closeOnSelect = true,
  allowProviderWildcard = false,
}) {
  const { getCaps } = useModelCaps();
  const [fetchedConnections, setFetchedConnections] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [combos, setCombos] = useState([]);
  const [providerNodes, setProviderNodes] = useState([]);
  const [customModels, setCustomModels] = useState([]);
  const [disabledModels, setDisabledModels] = useState({});

  useEffect(() => {
    if (!isOpen) return undefined;
    let cancelled = false;

    Promise.all([
      fetchJsonSafe(() => fetch("/api/providers"), (d) => d.connections || [], [], "providers"),
      fetchJsonSafe(() => fetch("/api/combos"), (d) => d.combos || [], [], "combos"),
      fetchJsonSafe(() => fetch("/api/provider-nodes"), (d) => d.nodes || [], [], "provider nodes"),
      fetchJsonSafe(() => fetch("/api/models/custom"), (d) => d.models || [], [], "custom models"),
      fetchJsonSafe(() => fetch("/api/models/disabled"), (d) => d.disabled || {}, {}, "disabled models"),
    ]).then(([connections, nextCombos, nodes, nextCustom, nextDisabled]) => {
      if (cancelled) return;
      setFetchedConnections(connections);
      setCombos(nextCombos);
      setProviderNodes(nodes);
      setCustomModels(nextCustom);
      setDisabledModels(nextDisabled);
    });

    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  const effectiveConnections = useMemo(
    () => (fetchedConnections !== null ? fetchedConnections : activeProviders || []),
    [fetchedConnections, activeProviders]
  );

  const filteredActiveProviders = useMemo(() => {
    const activeOnly = effectiveConnections.filter((p) => p && p.isActive !== false);
    if (!kindFilter) return activeOnly;
    return activeOnly.filter((p) => {
      const info = AI_PROVIDERS[p.provider];
      const kinds = info?.serviceKinds || ["llm"];
      return kinds.includes(kindFilter);
    });
  }, [effectiveConnections, kindFilter]);

  const liveConnectionIdsByProvider = useMemo(() => {
    const map = Object.fromEntries(LIVE_CATALOG_PROVIDERS.map((id) => [id, []]));
    for (const p of filteredActiveProviders) {
      if (p?.id && Object.prototype.hasOwnProperty.call(map, p.provider)) map[p.provider].push(p.id);
    }
    return map;
  }, [filteredActiveProviders]);

  const cursorConnectionIds = liveConnectionIdsByProvider.cursor;
  const clineConnectionIds = liveConnectionIdsByProvider.cline;
  const clinepassConnectionIds = liveConnectionIdsByProvider.clinepass;
  const zedConnectionIds = liveConnectionIdsByProvider.zed;

  const cursorModels = useLiveProviderModels(isOpen, cursorConnectionIds, "Cursor");
  const clineModels = useLiveProviderModels(isOpen, clineConnectionIds, "Cline");
  const clinepassModels = useLiveProviderModels(isOpen, clinepassConnectionIds, "ClinePass");
  const zedModels = useLiveProviderModels(isOpen, zedConnectionIds, "Zed");

  const liveModels = useMemo(
    () => ({
      cursor: cursorModels,
      cline: clineModels,
      clinepass: clinepassModels,
      zed: zedModels,
    }),
    [cursorModels, clineModels, clinepassModels, zedModels]
  );

  const {
    parsedQuery,
    filteredCombos,
    filteredGroups,
    visibleModels,
    visibleUnadded,
    visibleAdded,
  } = useGroupedModels({
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
  });

  const handleClose = useCallback(() => {
    onClose();
    setSearchQuery("");
  }, [onClose]);

  const handleSelectAllVisible = useCallback(() => {
    if (visibleUnadded.length === 0) return;
    if (onSelectBatch) {
      onSelectBatch(visibleUnadded);
    } else {
      visibleUnadded.forEach((model) => onSelect(model));
    }
  }, [visibleUnadded, onSelectBatch, onSelect]);

  const handleDeselectAllVisible = useCallback(() => {
    if (visibleAdded.length === 0) return;
    if (onDeselectBatch) {
      onDeselectBatch(visibleAdded);
    } else if (onDeselect) {
      visibleAdded.forEach((model) => onDeselect(model));
    }
  }, [visibleAdded, onDeselectBatch, onDeselect]);

  const handleSelect = useCallback(
    (model) => {
      const value = model?.value || model?.name || model;
      const isAdded = addedModelValues.includes(value);

      if (isAdded && onDeselect) {
        onDeselect(model);
      } else {
        onSelect(model);
      }

      if (closeOnSelect) {
        onClose();
        setSearchQuery("");
      }
    },
    [addedModelValues, onDeselect, onSelect, closeOnSelect, onClose]
  );

  return (
    <ModelSelectModalView
      isOpen={isOpen}
      onClose={handleClose}
      title={title}
      size={size}
      allowProviderWildcard={allowProviderWildcard}
      searchQuery={searchQuery}
      onSearchChange={setSearchQuery}
      parsedQuery={parsedQuery}
      closeOnSelect={closeOnSelect}
      visibleModels={visibleModels}
      visibleUnadded={visibleUnadded}
      visibleAdded={visibleAdded}
      addedModelValues={addedModelValues}
      onSelectAllVisible={handleSelectAllVisible}
      onDeselectAllVisible={handleDeselectAllVisible}
      filteredCombos={filteredCombos}
      filteredGroups={filteredGroups}
      selectedModel={selectedModel}
      getCaps={getCaps}
      onSelect={handleSelect}
    />
  );
}

ModelSelectModal.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  onSelect: PropTypes.func.isRequired,
  onDeselect: PropTypes.func,
  onSelectBatch: PropTypes.func,
  onDeselectBatch: PropTypes.func,
  selectedModel: PropTypes.string,
  activeProviders: PropTypes.arrayOf(
    PropTypes.shape({
      provider: PropTypes.string.isRequired,
    })
  ),
  title: PropTypes.string,
  size: PropTypes.string,
  modelAliases: PropTypes.object,
  kindFilter: PropTypes.string,
  capFilter: PropTypes.string,
  addedModelValues: PropTypes.arrayOf(PropTypes.string),
  closeOnSelect: PropTypes.bool,
  allowProviderWildcard: PropTypes.bool,
};
