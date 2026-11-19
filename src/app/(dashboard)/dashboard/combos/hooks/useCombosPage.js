"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useCopyToClipboard } from "@/shared/hooks/useCopyToClipboard";
import { useModelCaps } from "@/shared/hooks/useModelCaps";
import useSettingsStore from "@/store/settingsStore";
import {
  getCachedData,
  fetchWithCache,
  fetchJson,
  invalidateCache,
} from "@/shared/utils/swrCache";
import {
  CAPACITY_ADAPTER_CAPS,
  EMPTY_CAPACITY_ADAPTER,
  normalizeCapEntry,
} from "../constants";

const COMBOS_CACHE_KEY = "/api/combos";
const PROVIDERS_CACHE_KEY = "/api/providers";
const COMBOS_TTL_MS = 15000;

function normalizeCapacityAdapter(rawAdapter = {}) {
  const normalized = {};
  for (const cap of CAPACITY_ADAPTER_CAPS) {
    normalized[cap.key] = normalizeCapEntry(rawAdapter[cap.key]);
  }
  return normalized;
}

function formatComboPageData(combosData, providersData, settingsData) {
  return {
    combos: combosData?.combos ? combosData.combos.filter((c) => !c.kind || c.kind === "llm") : null,
    activeProviders: providersData?.connections
      ? providersData.connections.filter((c) => c.isActive !== false)
      : null,
    comboStrategies: settingsData?.comboStrategies || {},
    capacityAdapter: normalizeCapacityAdapter(settingsData?.capacityAdapter || {}),
  };
}

async function loadComboPageData({ force = false } = {}) {
  const [combosData, providersData, settingsData] = await Promise.all([
    fetchWithCache(COMBOS_CACHE_KEY, () => fetchJson(COMBOS_CACHE_KEY), { ttlMs: COMBOS_TTL_MS, force }).catch(() => null),
    fetchWithCache(PROVIDERS_CACHE_KEY, () => fetchJson(PROVIDERS_CACHE_KEY), { ttlMs: COMBOS_TTL_MS, force }).catch(() => null),
    useSettingsStore.getState().fetchSettings({ force }),
  ]);
  return formatComboPageData(combosData, providersData, settingsData || {});
}

export function useCombosPage() {
  const cachedCombos = getCachedData(COMBOS_CACHE_KEY);
  const cachedProviders = getCachedData(PROVIDERS_CACHE_KEY);
  const cachedSettings = useSettingsStore.getState().settings;
  const initialData = cachedCombos
    ? formatComboPageData(cachedCombos, cachedProviders, cachedSettings)
    : null;

  const [combos, setCombos] = useState(() => initialData?.combos || []);
  const [loading, setLoading] = useState(() => initialData === null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingCombo, setEditingCombo] = useState(null);
  const [activeProviders, setActiveProviders] = useState(() => initialData?.activeProviders || []);
  const [comboStrategies, setComboStrategies] = useState(() => initialData?.comboStrategies || {});
  const [capacityAdapter, setCapacityAdapter] = useState(
    () => initialData?.capacityAdapter || EMPTY_CAPACITY_ADAPTER
  );
  const [confirmState, setConfirmState] = useState(null);
  const [presetLoading, setPresetLoading] = useState(null);
  const [selectedIds, setSelectedIds] = useState([]);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const { getCaps } = useModelCaps();
  const { copied, copy } = useCopyToClipboard();

  const applyPageData = useCallback((data) => {
    if (data.combos) {
      const alive = new Set(data.combos.map((c) => c.id));
      setCombos(data.combos);
      setSelectedIds((prev) => prev.filter((id) => alive.has(id)));
    }
    if (data.activeProviders) {
      setActiveProviders(data.activeProviders);
    }
    setComboStrategies(data.comboStrategies);
    setCapacityAdapter(data.capacityAdapter);
  }, []);

  const fetchData = useCallback(async () => {
    try {
      const data = await loadComboPageData({ force: true });
      applyPageData(data);
    } catch (error) {
      console.log("Error fetching data:", error);
    } finally {
      setLoading(false);
    }
  }, [applyPageData]);

  useEffect(() => {
    let cancelled = false;
    loadComboPageData()
      .then((data) => {
        if (!cancelled) applyPageData(data);
      })
      .catch((error) => {
        console.log("Error fetching data:", error);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [applyPageData]);

  const selectedCombos = useMemo(
    () => combos.filter((c) => selectedIds.includes(c.id)),
    [combos, selectedIds]
  );
  const someSelected = selectedIds.length > 0;

  // Case-insensitive search over combo name and its model ids.
  const normalizedQuery = searchQuery.trim().toLowerCase();
  const filteredCombos = useMemo(() => {
    if (!normalizedQuery) return combos;
    return combos.filter((c) => {
      if (String(c.name || "").toLowerCase().includes(normalizedQuery)) return true;
      return (c.models || []).some((m) => String(m).toLowerCase().includes(normalizedQuery));
    });
  }, [combos, normalizedQuery]);

  const comboByName = useMemo(
    () => Object.fromEntries(combos.map((c) => [c.name, c.models])),
    [combos]
  );

  // Select-all follows the search so bulk actions only affect visible combos.
  const allSelected =
    filteredCombos.length > 0 && filteredCombos.every((c) => selectedIds.includes(c.id));

  const toggleSelect = useCallback((id) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }, []);

  const toggleSelectAll = useCallback(() => {
    setSelectedIds(allSelected ? [] : filteredCombos.map((c) => c.id));
  }, [allSelected, filteredCombos]);

  const clearSelection = useCallback(() => setSelectedIds([]), []);

  const pruneStrategiesForNames = useCallback(
    (names, base = comboStrategies) => {
      const updated = { ...base };
      for (const name of names) delete updated[name];
      return updated;
    },
    [comboStrategies]
  );

  const persistComboStrategies = useCallback(async (updated) => {
    await useSettingsStore.getState().patchSettings({ comboStrategies: updated });
    setComboStrategies(updated);
  }, []);

  const handleGeneratePresets = async (source) => {
    const label = source === "cursor" ? "Cursor Default" : "Claude Default";
    setPresetLoading(source);
    try {
      const previewRes = await fetch(`/api/combos/presets?source=${source}`);
      const preview = await previewRes.json();
      if (!previewRes.ok) {
        alert(preview.error || `Failed to preview ${label}`);
        return;
      }

      const toCreate = preview.toCreate ?? (preview.items || []).filter((i) => !i.exists).length;
      const toSkip = preview.toSkip ?? (preview.items || []).filter((i) => i.exists).length;
      const total = (preview.items || []).length;

      if (total === 0) {
        alert(`No ${label} models available to generate.`);
        return;
      }

      if (toCreate === 0) {
        alert(`All ${total} ${label} combos already exist. Nothing to create.`);
        return;
      }

      setConfirmState({
        title: `Generate ${label}`,
        message: `Create ${toCreate} combo${toCreate === 1 ? "" : "s"} named like ${source === "cursor" ? "Cursor" : "Claude"} model IDs (seeded with cu/… or cc/…). ${toSkip} already exist and will be skipped. You can edit any combo afterward to add fallbacks.`,
        confirmText: "Generate",
        variant: "primary",
        onConfirm: async () => {
          setConfirmState((prev) => (prev ? { ...prev, loading: true } : null));
          try {
            const res = await fetch("/api/combos/presets", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ source }),
            });
            const data = await res.json();
            if (!res.ok) {
              alert(data.error || `Failed to generate ${label}`);
              return;
            }
            await fetchData();
            setConfirmState(null);
          } catch (error) {
            console.log(`Error generating ${label}:`, error);
            alert(`Failed to generate ${label}`);
            setConfirmState((prev) => (prev ? { ...prev, loading: false } : null));
          }
        },
      });
    } catch (error) {
      console.log(`Error previewing ${label}:`, error);
      alert(`Failed to preview ${label}`);
    } finally {
      setPresetLoading(null);
    }
  };

  const handleSetCapacityAdapter = async (next) => {
    setCapacityAdapter(next);
    try {
      await useSettingsStore.getState().patchSettings({ capacityAdapter: next });
    } catch (error) {
      console.log("Error updating capacity adapter:", error);
    }
  };

  const handleCreate = async (data) => {
    try {
      const res = await fetch("/api/combos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (res.ok) {
        const created = await res.json().catch(() => null);
        const comboName = created?.name || data?.name;
        if (comboName) {
          await persistComboStrategies({
            ...comboStrategies,
            [comboName]: {
              ...(comboStrategies[comboName] || {}),
              fallbackStrategy: "priority-fallback",
            },
          });
        }
        await fetchData();
        setShowCreateModal(false);
      } else {
        const err = await res.json();
        alert(err.error || "Failed to create combo");
      }
    } catch (error) {
      console.log("Error creating combo:", error);
    }
  };

  const handleUpdate = async (id, data) => {
    try {
      const res = await fetch(`/api/combos/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (res.ok) {
        await fetchData();
        setEditingCombo(null);
      } else {
        const err = await res.json();
        alert(err.error || "Failed to update combo");
      }
    } catch (error) {
      console.log("Error updating combo:", error);
    }
  };

  const handleDelete = (id) => {
    const combo = combos.find((c) => c.id === id);
    setConfirmState({
      title: "Delete Combo",
      message: combo ? `Delete combo "${combo.name}"?` : "Delete this combo?",
      onConfirm: async () => {
        setConfirmState((prev) => (prev ? { ...prev, loading: true } : null));
        try {
          const res = await fetch(`/api/combos/${id}`, { method: "DELETE" });
          if (res.ok) {
            if (combo?.name) {
              await persistComboStrategies(pruneStrategiesForNames([combo.name]));
            }
            setCombos((prev) => prev.filter((c) => c.id !== id));
            setSelectedIds((prev) => prev.filter((x) => x !== id));
            invalidateCache(COMBOS_CACHE_KEY);
          }
          setConfirmState(null);
        } catch (error) {
          console.log("Error deleting combo:", error);
          setConfirmState((prev) => (prev ? { ...prev, loading: false } : null));
        }
      },
    });
  };

  const handleBulkDelete = () => {
    if (selectedCombos.length === 0) return;
    const count = selectedCombos.length;
    setConfirmState({
      title: "Delete Selected Combos",
      message: `Delete ${count} selected combo${count === 1 ? "" : "s"}? This cannot be undone.`,
      confirmText: "Delete",
      variant: "danger",
      onConfirm: async () => {
        setConfirmState((prev) => (prev ? { ...prev, loading: true } : null));
        setBulkBusy(true);
        try {
          const ids = selectedCombos.map((c) => c.id);
          const names = selectedCombos.map((c) => c.name);
          const results = await Promise.all(ids.map((id) => fetch(`/api/combos/${id}`, { method: "DELETE" })));
          const failed = results.filter((r) => !r.ok).length;
          await persistComboStrategies(pruneStrategiesForNames(names));
          setCombos((prev) => prev.filter((c) => !ids.includes(c.id)));
          invalidateCache(COMBOS_CACHE_KEY);
          clearSelection();
          setConfirmState(null);
          if (failed > 0) alert(`Deleted with ${failed} failure${failed === 1 ? "" : "s"}.`);
        } catch (error) {
          console.log("Error bulk deleting combos:", error);
          alert("Failed to delete selected combos");
          setConfirmState((prev) => (prev ? { ...prev, loading: false } : null));
        } finally {
          setBulkBusy(false);
        }
      },
    });
  };

  const handleSetComboStrategy = async (comboName, patch) => {
    try {
      const updated = { ...comboStrategies };
      const next = { ...(updated[comboName] || {}), ...patch };
      // Prune to keep settings clean: default fallback with no extras = no entry.
      if (!next.fallbackStrategy || next.fallbackStrategy === "fallback") {
        delete updated[comboName];
      } else {
        updated[comboName] = next;
      }
      await persistComboStrategies(updated);
    } catch (error) {
      console.log("Error updating combo strategy:", error);
    }
  };

  const handleBulkSetStrategy = async (strategy) => {
    if (selectedCombos.length === 0 || !strategy) return;
    setBulkBusy(true);
    try {
      const updated = { ...comboStrategies };
      for (const combo of selectedCombos) {
        if (strategy === "fallback") {
          delete updated[combo.name];
        } else {
          updated[combo.name] = {
            ...(updated[combo.name] || {}),
            fallbackStrategy: strategy,
          };
        }
      }
      await persistComboStrategies(updated);
    } catch (error) {
      console.log("Error bulk updating combo strategy:", error);
      alert("Failed to update strategy for selected combos");
    } finally {
      setBulkBusy(false);
    }
  };

  return {
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
  };
}
