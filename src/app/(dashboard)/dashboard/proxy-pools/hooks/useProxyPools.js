"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { filterProxyPools, getVisibleProxyPoolSelection, updateProxyPoolSelection } from "@/shared/utils/proxyPoolSelection";

export function normalizeFormData(data = {}) {
  return {
    name: data.name || "",
    proxyUrl: data.proxyUrl || "",
    noProxy: data.noProxy || "",
    isActive: data.isActive !== false,
    strictProxy: data.strictProxy === true,
  };
}

export function useProxyPools({ notify } = {}) {
  const [proxyPools, setProxyPools] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedPoolIds, setSelectedPoolIds] = useState([]);
  const [showFormModal, setShowFormModal] = useState(false);
  const [editingProxyPool, setEditingProxyPool] = useState(null);
  const [formData, setFormData] = useState(normalizeFormData());
  const [saving, setSaving] = useState(false);
  const [testingId, setTestingId] = useState(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [confirmState, setConfirmState] = useState(null);

  const selectionAnchorRef = useRef(null);
  const visiblePoolsRef = useRef([]);

  const visiblePools = useMemo(
    () => filterProxyPools(proxyPools, statusFilter),
    [proxyPools, statusFilter]
  );

  useEffect(() => {
    visiblePoolsRef.current = visiblePools;
  }, [visiblePools]);

  const selectedIds = useMemo(
    () => getVisibleProxyPoolSelection(visiblePools, selectedPoolIds),
    [visiblePools, selectedPoolIds]
  );

  const allSelected = visiblePools.length > 0 && selectedIds.length === visiblePools.length;

  const activeCount = useMemo(
    () => proxyPools.filter((pool) => pool.isActive === true).length,
    [proxyPools]
  );

  const fetchProxyPools = useCallback(async () => {
    try {
      const res = await fetch("/api/proxy-pools?includeUsage=true", { cache: "no-store" });
      const data = await res.json();
      if (res.ok) {
        setProxyPools(data.proxyPools || []);
      }
    } catch (error) {
      console.log("Error fetching proxy pools:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchProxyPools();
  }, [fetchProxyPools]);

  const toggleSelect = useCallback((id, checked, shiftKey) => {
    const anchorId = selectionAnchorRef.current;
    setSelectedPoolIds((prev) =>
      updateProxyPoolSelection(visiblePools, prev, { id, checked, shiftKey, anchorId })
    );
    selectionAnchorRef.current = id;
  }, [visiblePools]);

  const toggleSelectAll = useCallback(() => {
    setSelectedPoolIds(allSelected ? [] : visiblePools.map((pool) => pool.id));
    selectionAnchorRef.current = null;
  }, [allSelected, visiblePools]);

  const clearSelection = useCallback(() => {
    setSelectedPoolIds([]);
    selectionAnchorRef.current = null;
  }, []);

  const handleStatusFilterChange = useCallback((newStatus) => {
    setStatusFilter(newStatus);
    setSelectedPoolIds([]);
    selectionAnchorRef.current = null;
  }, []);

  const resetForm = useCallback(() => {
    setEditingProxyPool(null);
    setFormData(normalizeFormData());
  }, []);

  const openCreateModal = useCallback(() => {
    resetForm();
    setShowFormModal(true);
  }, [resetForm]);

  const openEditModal = useCallback((proxyPool) => {
    setEditingProxyPool(proxyPool);
    setFormData(normalizeFormData(proxyPool));
    setShowFormModal(true);
  }, []);

  const closeFormModal = useCallback(() => {
    setShowFormModal(false);
    resetForm();
  }, [resetForm]);

  const handleSave = useCallback(async () => {
    const payload = {
      name: formData.name.trim(),
      proxyUrl: formData.proxyUrl.trim(),
      noProxy: formData.noProxy.trim(),
      isActive: formData.isActive === true,
      strictProxy: formData.strictProxy === true,
    };

    if (!payload.name || !payload.proxyUrl) return;

    setSaving(true);
    try {
      const isEdit = !!editingProxyPool;
      const res = await fetch(isEdit ? `/api/proxy-pools/${editingProxyPool.id}` : "/api/proxy-pools", {
        method: isEdit ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        await fetchProxyPools();
        closeFormModal();
        notify?.success?.(editingProxyPool ? "Proxy pool updated" : "Proxy pool created");
      } else {
        const data = await res.json();
        notify?.error?.(data.error || "Failed to save proxy pool");
      }
    } catch (error) {
      console.log("Error saving proxy pool:", error);
    } finally {
      setSaving(false);
    }
  }, [formData, editingProxyPool, fetchProxyPools, closeFormModal, notify]);

  const handleDelete = useCallback((proxyPool) => {
    setConfirmState({
      title: "Delete Proxy Pool",
      message: `Delete proxy pool "${proxyPool.name}"?`,
      onConfirm: async () => {
        setConfirmState(null);
        try {
          const res = await fetch(`/api/proxy-pools/${proxyPool.id}`, { method: "DELETE" });
          if (res.ok) {
            setProxyPools((prev) => prev.filter((item) => item.id !== proxyPool.id));
            setSelectedPoolIds((prev) => prev.filter((id) => id !== proxyPool.id));
            notify?.success?.("Proxy pool deleted");
            return;
          }

          const data = await res.json();
          if (res.status === 409) {
            notify?.warning?.(
              `Cannot delete: ${data.boundConnectionCount || 0} connection(s) are still using this pool.`
            );
          } else {
            notify?.error?.(data.error || "Failed to delete proxy pool");
          }
        } catch (error) {
          console.log("Error deleting proxy pool:", error);
          notify?.error?.("Failed to delete proxy pool");
        }
      },
    });
  }, [notify]);

  const handleToggleActive = useCallback(async (pool) => {
    const next = !pool.isActive;
    setProxyPools((prev) => prev.map((p) => (p.id === pool.id ? { ...p, isActive: next } : p)));
    try {
      const res = await fetch(`/api/proxy-pools/${pool.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: next }),
      });
      if (!res.ok) {
        setProxyPools((prev) => prev.map((p) => (p.id === pool.id ? { ...p, isActive: pool.isActive } : p)));
        notify?.error?.("Failed to update active state");
      }
    } catch (error) {
      console.log("Error toggling active:", error);
      setProxyPools((prev) => prev.map((p) => (p.id === pool.id ? { ...p, isActive: pool.isActive } : p)));
    }
  }, [notify]);

  const handleTest = useCallback(async (proxyPoolId) => {
    setTestingId(proxyPoolId);
    try {
      const res = await fetch(`/api/proxy-pools/${proxyPoolId}/test`, { method: "POST" });
      const data = await res.json();

      if (!res.ok) {
        notify?.error?.(data.error || "Failed to test proxy");
        return;
      }

      await fetchProxyPools();
      notify?.success?.(data.ok ? "Proxy test passed" : "Proxy test failed");
    } catch (error) {
      console.log("Error testing proxy pool:", error);
      notify?.error?.("Failed to test proxy");
    } finally {
      setTestingId(null);
    }
  }, [fetchProxyPools, notify]);

  const bulkSetActive = useCallback(async (isActive) => {
    const targets = selectedIds.length > 0 ? selectedIds : visiblePools.map((p) => p.id);
    if (targets.length === 0) return;
    setBulkBusy(true);
    try {
      let ok = 0;
      let failed = 0;
      for (const id of targets) {
        try {
          const res = await fetch(`/api/proxy-pools/${id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ isActive }),
          });
          if (res.ok) ok += 1;
          else failed += 1;
        } catch {
          failed += 1;
        }
      }
      await fetchProxyPools();
      notify?.success?.(`${isActive ? "Activated" : "Deactivated"} ${ok}${failed ? `, failed ${failed}` : ""}`);
    } finally {
      setBulkBusy(false);
    }
  }, [selectedIds, visiblePools, fetchProxyPools, notify]);

  const bulkDelete = useCallback(() => {
    if (selectedIds.length === 0) return;
    setConfirmState({
      title: "Delete Proxy Pools",
      message: `Delete ${selectedIds.length} proxy pool(s)?`,
      onConfirm: async () => {
        const targets = getVisibleProxyPoolSelection(visiblePoolsRef.current, selectedIds);
        setConfirmState(null);
        setBulkBusy(true);
        try {
          let ok = 0;
          let blocked = 0;
          let failed = 0;
          for (const id of targets) {
            try {
              const res = await fetch(`/api/proxy-pools/${id}`, { method: "DELETE" });
              if (res.ok) ok += 1;
              else if (res.status === 409) blocked += 1;
              else failed += 1;
            } catch {
              failed += 1;
            }
          }
          await fetchProxyPools();
          clearSelection();
          notify?.success?.(
            `Deleted ${ok}${blocked ? `, ${blocked} bound` : ""}${failed ? `, ${failed} failed` : ""}`
          );
        } finally {
          setBulkBusy(false);
        }
      },
    });
  }, [selectedIds, clearSelection, fetchProxyPools, notify]);

  return {
    proxyPools,
    setProxyPools,
    loading,
    fetchProxyPools,
    statusFilter,
    setStatusFilter: handleStatusFilterChange,
    visiblePools,
    activeCount,
    selectedIds,
    allSelected,
    toggleSelect,
    toggleSelectAll,
    clearSelection,
    showFormModal,
    editingProxyPool,
    formData,
    setFormData,
    saving,
    openCreateModal,
    openEditModal,
    closeFormModal,
    handleSave,
    handleDelete,
    handleToggleActive,
    testingId,
    handleTest,
    bulkBusy,
    setBulkBusy,
    bulkSetActive,
    bulkDelete,
    confirmState,
    setConfirmState,
  };
}
