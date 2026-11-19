"use client";

import { useState, useCallback, useMemo } from "react";
import { getThinkingLevels } from "open-sse/providers/thinkingLevels.js";
import { translate } from "@/i18n/runtime";
import { useModelCatalogs } from "./useModelCatalogs";

/**
 * Manage provider model actions: thinking mode, enable/disable, custom models,
 * aliases, model reachability testing, and Qoder/Cline live catalog imports.
 */
export function useProviderModels({
  providerId,
  providerMeta,
  connections,
  thinkingMode,
  setThinkingMode,
  setConfirmState,
}) {
  const { providerAlias, providerStorageAlias } = providerMeta;
  const catalogs = useModelCatalogs({ providerId, providerMeta, connections });
  const {
    models,
    kiloFreeModels,
    customModels,
    modelAliases,
    fetchAliases,
    fetchCustomModels,
    fetchDisabledModels,
  } = catalogs;

  const [modelTestResults, setModelTestResults] = useState({});
  const [modelsTestError, setModelsTestError] = useState("");
  const [testingModelIds, setTestingModelIds] = useState(() => new Set());
  const [importingQoderModels, setImportingQoderModels] = useState(false);
  const [importingClineModels, setImportingClineModels] = useState(false);

  const resolveThinkingSuffix = useCallback(
    (modelId) => {
      if (!thinkingMode || thinkingMode === "auto") return null;
      const levels = getThinkingLevels(providerId, modelId);
      return levels && levels.includes(thinkingMode) ? thinkingMode : null;
    },
    [thinkingMode, providerId]
  );

  const providerThinkingLevels = useMemo(() => {
    const set = new Set();
    const seen = new Set();
    const addLevels = (modelId) => {
      if (!modelId || seen.has(modelId)) return;
      seen.add(modelId);
      const lv = getThinkingLevels(providerId, modelId);
      if (lv) lv.forEach((l) => { if (l !== "none") set.add(l); });
    };
    for (const m of models) addLevels(m.id);
    for (const m of kiloFreeModels) addLevels(m.id);
    for (const entry of customModels) {
      if (entry.providerAlias !== providerStorageAlias) continue;
      if ((entry.kind || entry.type || "llm") !== "llm") continue;
      addLevels(entry.id);
    }
    return set.size ? ["auto", ...set] : null;
  }, [providerId, models, kiloFreeModels, customModels, providerStorageAlias]);

  const handleThinkingModeChange = useCallback(async (mode) => {
    setThinkingMode(mode);
    try {
      const settingsRes = await fetch("/api/settings", { cache: "no-store" });
      const settingsData = settingsRes.ok ? await settingsRes.json() : {};
      const current = settingsData.providerThinking || {};
      const updated = { ...current };
      if (!mode || mode === "auto") {
        delete updated[providerId];
      } else {
        updated[providerId] = { mode };
      }
      await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ providerThinking: updated }),
      });
    } catch (error) {
      console.log("Error saving thinking config:", error);
    }
  }, [providerId, setThinkingMode]);

  const handleDisableModel = useCallback(async (modelId) => {
    try {
      const res = await fetch("/api/models/disabled", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ providerAlias: providerStorageAlias, ids: [modelId] }),
      });
      if (res.ok) await fetchDisabledModels();
    } catch (error) {
      console.log("Error disabling model:", error);
    }
  }, [providerStorageAlias, fetchDisabledModels]);

  const handleEnableModel = useCallback(async (modelId) => {
    try {
      const res = await fetch(
        `/api/models/disabled?providerAlias=${encodeURIComponent(providerStorageAlias)}&id=${encodeURIComponent(modelId)}`,
        { method: "DELETE" }
      );
      if (res.ok) await fetchDisabledModels();
    } catch (error) {
      console.log("Error enabling model:", error);
    }
  }, [providerStorageAlias, fetchDisabledModels]);

  const handleDisableAll = useCallback((ids) => {
    if (!ids.length) return;
    setConfirmState({
      title: "Disable All Models",
      message: `Disable all ${ids.length} model(s)?`,
      onConfirm: async () => {
        setConfirmState(null);
        try {
          const res = await fetch("/api/models/disabled", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ providerAlias: providerStorageAlias, ids }),
          });
          if (res.ok) await fetchDisabledModels();
        } catch (error) {
          console.log("Error disabling all models:", error);
        }
      },
    });
  }, [providerStorageAlias, fetchDisabledModels, setConfirmState]);

  const handleEnableAll = useCallback(async () => {
    try {
      const res = await fetch(`/api/models/disabled?providerAlias=${encodeURIComponent(providerStorageAlias)}`, {
        method: "DELETE",
      });
      if (res.ok) await fetchDisabledModels();
    } catch (error) {
      console.log("Error enabling all models:", error);
    }
  }, [providerStorageAlias, fetchDisabledModels]);

  const handleSetAlias = useCallback(async (modelId, alias, providerAliasOverride = providerAlias) => {
    const fullModel = `${providerAliasOverride}/${modelId}`;
    try {
      const res = await fetch("/api/models/alias", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: fullModel, alias }),
      });
      if (res.ok) {
        await fetchAliases();
      } else {
        const data = await res.json();
        alert(data.error || "Failed to set alias");
      }
    } catch (error) {
      console.log("Error setting alias:", error);
    }
  }, [providerAlias, fetchAliases]);

  const handleDeleteAlias = useCallback(async (alias) => {
    try {
      const res = await fetch(`/api/models/alias?alias=${encodeURIComponent(alias)}`, { method: "DELETE" });
      if (res.ok) await fetchAliases();
    } catch (error) {
      console.log("Error deleting alias:", error);
    }
  }, [fetchAliases]);

  const handleAddCustomModel = useCallback(async (modelId, type = "llm", providerAliasOverride = providerStorageAlias, caps, transport) => {
    try {
      const res = await fetch("/api/models/custom", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          providerAlias: providerAliasOverride,
          id: modelId,
          type,
          ...(caps ? { caps } : {}),
          ...(transport ? { transport } : {}),
        }),
      });
      if (res.ok) {
        await fetchCustomModels();
        if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("customModelChanged"));
      } else {
        const data = await res.json();
        alert(data.error || "Failed to add custom model");
      }
    } catch (error) {
      console.log("Error adding custom model:", error);
    }
  }, [providerStorageAlias, fetchCustomModels]);

  const handleDeleteCustomModel = useCallback(async (modelId, type = "llm", providerAliasOverride = providerStorageAlias) => {
    try {
      const params = new URLSearchParams({ providerAlias: providerAliasOverride, id: modelId, type });
      const res = await fetch(`/api/models/custom?${params}`, { method: "DELETE" });
      if (res.ok) {
        await fetchCustomModels();
        if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("customModelChanged"));
      }
    } catch (error) {
      console.log("Error deleting custom model:", error);
    }
  }, [providerStorageAlias, fetchCustomModels]);

  const handleTestModel = useCallback(async (modelId) => {
    if (testingModelIds.has(modelId)) return;
    setTestingModelIds((prev) => new Set(prev).add(modelId));
    try {
      const res = await fetch("/api/models/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: `${providerStorageAlias}/${modelId}` }),
      });
      const data = await res.json();
      setModelTestResults((prev) => ({ ...prev, [modelId]: data.ok ? "ok" : "error" }));
      setModelsTestError(data.ok ? "" : data.error || "Model not reachable");
    } catch {
      setModelTestResults((prev) => ({ ...prev, [modelId]: "error" }));
      setModelsTestError("Network error");
    } finally {
      setTestingModelIds((prev) => {
        const next = new Set(prev);
        next.delete(modelId);
        return next;
      });
    }
  }, [testingModelIds, providerStorageAlias]);

  const importCatalogModels = useCallback(async ({ missingConnMsg, setImporting, normalizeId, replaceAll }) => {
    const activeConnection = connections.find((conn) => conn.isActive !== false);
    if (!activeConnection) {
      alert(translate(missingConnMsg));
      return;
    }
    setImporting(true);
    try {
      const res = await fetch(`/api/providers/${activeConnection.id}/models`);
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || translate("Failed to fetch models"));
        return;
      }
      const returned = data.models || [];
      if (returned.length === 0) {
        alert(translate("No models returned"));
        return;
      }
      if (replaceAll) {
        for (const model of returned) {
          const id = normalizeId(model);
          if (!id) continue;
          const saved = await fetch("/api/models/custom", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ providerAlias: providerStorageAlias, id, type: "llm", name: model.name || id }),
          });
          if (!saved.ok) {
            const err = await saved.json();
            throw new Error(err.error || "Failed to save model");
          }
        }
        await fetchCustomModels();
        window.dispatchEvent(new CustomEvent("customModelChanged"));
        alert(translate("Successfully updated") + ` ${returned.length} ` + translate("models"));
        return;
      }

      let importedCount = 0;
      for (const model of returned) {
        const cleanModelId = normalizeId(model);
        if (!cleanModelId) continue;
        const alreadyExists =
          customModels.some(
            (entry) =>
              entry.providerAlias === providerStorageAlias &&
              entry.id === cleanModelId &&
              (entry.kind || entry.type || "llm") === "llm"
          ) || Object.values(modelAliases).includes(`${providerStorageAlias}/${cleanModelId}`);
        if (alreadyExists) continue;
        await handleAddCustomModel(cleanModelId, "llm", providerStorageAlias);
        importedCount += 1;
      }
      alert(
        importedCount === 0
          ? translate("All models already exist, no new models added")
          : translate("Successfully added") + ` ${importedCount} ` + translate("models")
      );
    } catch (error) {
      console.log("Error importing models:", error);
      alert(translate("Error fetching models") + ": " + error.message);
    } finally {
      setImporting(false);
    }
  }, [connections, providerStorageAlias, customModels, modelAliases, fetchCustomModels, handleAddCustomModel]);

  const handleImportQoderModels = useCallback(() => {
    if (importingQoderModels) return;
    return importCatalogModels({
      missingConnMsg: "Please add an active Qoder connection first",
      setImporting: setImportingQoderModels,
      normalizeId: (m) => (m.id || m.name || "").replace(/^(qoder-cn|qoder)\//, ""),
      replaceAll: providerId === "qoder" || providerId === "qoder-cn",
    });
  }, [importingQoderModels, importCatalogModels, providerId]);

  const handleImportClineModels = useCallback(() => {
    if (importingClineModels) return;
    return importCatalogModels({
      missingConnMsg: "Please add an active Cline connection first",
      setImporting: setImportingClineModels,
      normalizeId: (m) => m.id || m.name || "",
      replaceAll: false,
    });
  }, [importingClineModels, importCatalogModels]);

  return {
    ...catalogs,
    modelTestResults,
    modelsTestError,
    testingModelIds,
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
  };
}
