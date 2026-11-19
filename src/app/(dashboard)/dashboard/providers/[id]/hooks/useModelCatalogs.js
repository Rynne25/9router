"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { OAUTH_PROVIDERS, APIKEY_PROVIDERS, FREE_PROVIDERS, FREE_TIER_PROVIDERS } from "@/shared/constants/providers";
import { getModelsByProviderId, getModelKind } from "@/shared/constants/models";
import { fetchSuggestedModels } from "@/shared/utils/providerModelsFetcher";
import { applyQoderModelNames, getProviderCustomModelRows } from "@/shared/utils/providerCustomModels";
import { LIVE_MODEL_CATALOG_PROVIDERS } from "../utils/providerMeta";

/**
 * Load and derive static, live, kilo-free, suggested, custom, alias, and disabled model catalogs.
 */
export function useModelCatalogs({ providerId, providerMeta, connections }) {
  const { providerAlias, providerStorageAlias, isCompatible } = providerMeta;

  const [modelAliases, setModelAliases] = useState({});
  const [customModels, setCustomModels] = useState([]);
  const [suggestedModels, setSuggestedModels] = useState([]);
  const [liveModels, setLiveModels] = useState([]);
  const [liveModelsError, setLiveModelsError] = useState(null);
  const [kiloFreeModels, setKiloFreeModels] = useState([]);
  const [disabledModelIds, setDisabledModelIds] = useState([]);

  const staticModels = useMemo(() => getModelsByProviderId(providerId), [providerId]);
  const models = useMemo(
    () =>
      LIVE_MODEL_CATALOG_PROVIDERS.has(providerId) && liveModels.length > 0
        ? liveModels
        : applyQoderModelNames(staticModels, customModels, providerAlias),
    [providerId, liveModels, staticModels, customModels, providerAlias]
  );

  const fetchDisabledModels = useCallback(async () => {
    try {
      const res = await fetch(`/api/models/disabled?providerAlias=${encodeURIComponent(providerStorageAlias)}`, {
        cache: "no-store",
      });
      const data = await res.json();
      if (res.ok) setDisabledModelIds(data.ids || []);
    } catch (error) {
      console.log("Error fetching disabled models:", error);
    }
  }, [providerStorageAlias]);

  const fetchAliases = useCallback(async () => {
    try {
      const res = await fetch("/api/models/alias");
      const data = await res.json();
      if (res.ok) setModelAliases(data.aliases || {});
    } catch (error) {
      console.log("Error fetching aliases:", error);
    }
  }, []);

  const fetchCustomModels = useCallback(async () => {
    try {
      const res = await fetch("/api/models/custom", { cache: "no-store" });
      const data = await res.json();
      if (res.ok) setCustomModels(data.models || []);
    } catch (error) {
      console.log("Error fetching custom models:", error);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    Promise.resolve().then(() => {
      if (!cancelled) {
        fetchAliases();
        fetchCustomModels();
        fetchDisabledModels();
      }
    });
    return () => {
      cancelled = true;
    };
  }, [fetchAliases, fetchCustomModels, fetchDisabledModels]);

  useEffect(() => {
    if (providerId !== "kilocode") return;
    let cancelled = false;
    fetch("/api/providers/kilo/free-models")
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled && data.models?.length) setKiloFreeModels(data.models);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [providerId]);

  useEffect(() => {
    let cancelled = false;
    if (!LIVE_MODEL_CATALOG_PROVIDERS.has(providerId)) {
      Promise.resolve().then(() => {
        if (!cancelled) setLiveModels([]);
      });
      return () => {
        cancelled = true;
      };
    }

    const connection = connections.find((item) => item.isActive !== false);
    if (!connection?.id) {
      Promise.resolve().then(() => {
        if (!cancelled) {
          setLiveModels([]);
          if (providerId === "zed") setLiveModelsError(null);
        }
      });
      return () => {
        cancelled = true;
      };
    }

    Promise.resolve().then(() => {
      if (!cancelled && providerId === "zed") setLiveModelsError(null);
    });
    fetch(`/api/providers/${connection.id}/models`, { cache: "no-store" })
      .then(async (res) => ({ ok: res.ok, data: await res.json().catch(() => null) }))
      .then(({ ok, data }) => {
        if (cancelled) return;
        if (ok && Array.isArray(data?.models) && data.models.length > 0) {
          setLiveModels(data.models);
          if (providerId === "zed" && data?.warning) setLiveModelsError(data.warning);
          return;
        }
        if (providerId === "zed") {
          setLiveModels([]);
          setLiveModelsError(data?.warning || data?.error || "Zed returned no live models.");
        }
      })
      .catch(() => {
        if (!cancelled && providerId === "zed") {
          setLiveModels([]);
          setLiveModelsError("Failed to reach the Zed model catalog.");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [providerId, connections]);

  useEffect(() => {
    const fetcher = (
      OAUTH_PROVIDERS[providerId] ||
      APIKEY_PROVIDERS[providerId] ||
      FREE_PROVIDERS[providerId] ||
      FREE_TIER_PROVIDERS[providerId]
    )?.modelsFetcher;
    if (!fetcher) return;
    let cancelled = false;
    fetchSuggestedModels(fetcher).then((list) => {
      if (!cancelled) setSuggestedModels(list);
    });
    return () => {
      cancelled = true;
    };
  }, [providerId]);

  const allLlmModels = useMemo(
    () =>
      [...models, ...kiloFreeModels.filter((fm) => !models.some((m) => m.id === fm.id))].filter((m) => {
        const k = getModelKind(m);
        return !k || k === "llm";
      }),
    [models, kiloFreeModels]
  );

  const disabledSet = useMemo(() => new Set(disabledModelIds), [disabledModelIds]);
  const displayModels = useMemo(() => allLlmModels.filter((m) => !disabledSet.has(m.id)), [allLlmModels, disabledSet]);
  const disabledDisplayModels = useMemo(() => allLlmModels.filter((m) => disabledSet.has(m.id)), [allLlmModels, disabledSet]);

  const customModelRows = useMemo(
    () =>
      isCompatible
        ? []
        : getProviderCustomModelRows({
            customModels,
            modelAliases,
            providerAlias: providerStorageAlias,
            builtInModels: models,
            type: "llm",
          }),
    [isCompatible, customModels, modelAliases, providerStorageAlias, models]
  );

  return {
    models,
    kiloFreeModels,
    allLlmModels,
    displayModels,
    disabledDisplayModels,
    customModelRows,
    suggestedModels,
    modelAliases,
    customModels,
    disabledModelIds,
    liveModelsError,
    fetchAliases,
    fetchCustomModels,
    fetchDisabledModels,
  };
}
