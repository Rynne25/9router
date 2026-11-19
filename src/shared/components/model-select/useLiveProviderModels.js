"use client";

import { useState, useEffect } from "react";

/**
 * Fetch a provider's account-scoped catalog for every active connection and merge
 * the results. Entries collapse by model id so duplicate connections produce one row.
 * Returns empty array while closed or unavailable so callers keep static fallbacks.
 */
export function useLiveProviderModels(isOpen, connectionIds, label) {
  const [state, setState] = useState({ key: "", models: [] });
  const idsKey = (connectionIds ?? []).join("|");

  useEffect(() => {
    if (!isOpen || !idsKey) return undefined;

    let cancelled = false;
    const ids = idsKey.split("|");

    Promise.all(
      ids.map(async (connectionId) => {
        const response = await fetch(`/api/providers/${connectionId}/models`, { cache: "no-store" });
        if (!response.ok) return [];
        const data = await response.json();
        return Array.isArray(data.models) ? data.models : [];
      })
    )
      .then((modelLists) => {
        if (cancelled) return;
        const seen = new Set();
        const deduped = modelLists.flat().filter((model) => {
          if (!model?.id || seen.has(model.id)) return false;
          seen.add(model.id);
          return true;
        });
        setState({ key: idsKey, models: deduped });
      })
      .catch((error) => {
        // Do not hide the static fallback when the account catalog is unavailable.
        console.warn(`Unable to load ${label} models for selector:`, error);
        if (!cancelled) setState({ key: idsKey, models: [] });
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen, idsKey, label]);

  return isOpen && idsKey && state.key === idsKey ? state.models : [];
}
