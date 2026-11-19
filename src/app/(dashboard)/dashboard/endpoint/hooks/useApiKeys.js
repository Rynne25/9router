"use client";

import { useState, useEffect, useCallback } from "react";
import { useCopyToClipboard } from "@/shared/hooks/useCopyToClipboard";
import {
  getCachedData,
  setCachedData,
  fetchWithCache,
  fetchJson,
} from "@/shared/utils/swrCache";

const KEYS_CACHE_KEY = "/api/keys";
const KEYS_TTL_MS = 30000;

export function useApiKeys() {
  const cachedInitial = getCachedData(KEYS_CACHE_KEY);
  const initialKeys = Array.isArray(cachedInitial?.keys)
    ? cachedInitial.keys
    : Array.isArray(cachedInitial)
      ? cachedInitial
      : null;
  const [keys, setKeys] = useState(() => initialKeys || []);
  const [loading, setLoading] = useState(() => initialKeys === null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newKeyName, setNewKeyName] = useState("");
  const [createdKey, setCreatedKey] = useState(null);
  const [confirmState, setConfirmState] = useState(null);
  const [visibleKeys, setVisibleKeys] = useState(() => new Set());
  const { copied, copy } = useCopyToClipboard();

  const fetchKeys = useCallback(async ({ force = false } = {}) => {
    try {
      const data = await fetchWithCache(
        KEYS_CACHE_KEY,
        () => fetchJson(KEYS_CACHE_KEY),
        { ttlMs: KEYS_TTL_MS, force }
      );
      return data?.keys || [];
    } catch {
      return [];
    }
  }, []);

  const fetchData = useCallback(async () => {
    try {
      let existing = await fetchKeys({ force: true });
      // Auto-provision a default key for first-time users so the endpoint works out of the box.
      if (existing.length === 0) {
        try {
          const createRes = await fetch("/api/keys", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: "Default Key" }),
          });
          if (createRes.ok) existing = await fetchKeys({ force: true });
        } catch {
          /* fall through to empty render */
        }
      }
      setKeys(existing);
      setCachedData(KEYS_CACHE_KEY, { keys: existing });
    } catch (error) {
      console.log("Error fetching data:", error);
    } finally {
      setLoading(false);
    }
  }, [fetchKeys]);

  useEffect(() => {
    let ignore = false;

    async function loadInitial() {
      try {
        let existing = await fetchKeys();
        if (existing.length === 0) {
          try {
            const createRes = await fetch("/api/keys", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ name: "Default Key" }),
            });
            if (createRes.ok) existing = await fetchKeys({ force: true });
          } catch {
            /* fall through to empty render */
          }
        }
        if (!ignore) {
          setKeys(existing);
          setCachedData(KEYS_CACHE_KEY, { keys: existing });
        }
      } catch (error) {
        console.log("Error fetching data:", error);
      } finally {
        if (!ignore) {
          setLoading(false);
        }
      }
    }

    loadInitial();
    return () => {
      ignore = true;
    };
  }, [fetchKeys]);

  const handleCreateKey = useCallback(async () => {
    if (!newKeyName.trim()) return;

    try {
      const res = await fetch("/api/keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newKeyName }),
      });
      const data = await res.json();

      if (res.ok) {
        setCreatedKey(data.key);
        await fetchData();
        setNewKeyName("");
        setShowAddModal(false);
      }
    } catch (error) {
      console.log("Error creating key:", error);
    }
  }, [newKeyName, fetchData]);

  const handleDeleteKey = useCallback((id) => {
    setConfirmState({
      title: "Delete API Key",
      message: "Delete this API key?",
      onConfirm: async () => {
        setConfirmState(null);
        try {
          const res = await fetch(`/api/keys/${id}`, { method: "DELETE" });
          if (res.ok) {
            setKeys((prev) => {
              const next = prev.filter((k) => k.id !== id);
              setCachedData(KEYS_CACHE_KEY, { keys: next });
              return next;
            });
            setVisibleKeys((prev) => {
              const next = new Set(prev);
              next.delete(id);
              return next;
            });
          }
        } catch (error) {
          console.log("Error deleting key:", error);
        }
      },
    });
  }, []);

  const handleToggleKey = useCallback(async (id, isActive) => {
    try {
      const res = await fetch(`/api/keys/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive }),
      });
      if (res.ok) {
        setKeys((prev) => {
          const next = prev.map((k) => (k.id === id ? { ...k, isActive } : k));
          setCachedData(KEYS_CACHE_KEY, { keys: next });
          return next;
        });
      }
    } catch (error) {
      console.log("Error toggling key:", error);
    }
  }, []);

  const handleUpdateKeyAccess = useCallback(async (id, access) => {
    try {
      const res = await fetch(`/api/keys/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ access }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.key) {
        setKeys((prev) => {
          const next = prev.map((k) => (k.id === id ? { ...k, access: data.key.access } : k));
          setCachedData(KEYS_CACHE_KEY, { keys: next });
          return next;
        });
      } else {
        console.log("Error updating key access:", data.error || res.status);
      }
    } catch (error) {
      console.log("Error updating key access:", error);
    }
  }, []);

  const maskKey = useCallback((fullKey) => {
    if (!fullKey || fullKey.length <= 10) return fullKey || "";
    return fullKey.slice(0, 6) + "•".repeat(fullKey.length - 10) + fullKey.slice(-4);
  }, []);

  const toggleKeyVisibility = useCallback((keyId) => {
    setVisibleKeys((prev) => {
      const next = new Set(prev);
      if (next.has(keyId)) next.delete(keyId);
      else next.add(keyId);
      return next;
    });
  }, []);

  return {
    keys,
    setKeys,
    loading,
    showAddModal,
    setShowAddModal,
    newKeyName,
    setNewKeyName,
    createdKey,
    setCreatedKey,
    confirmState,
    setConfirmState,
    visibleKeys,
    copied,
    copy,
    fetchData,
    handleCreateKey,
    handleDeleteKey,
    handleToggleKey,
    handleUpdateKeyAccess,
    maskKey,
    toggleKeyVisibility,
  };
}
