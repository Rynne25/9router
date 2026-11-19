"use client";

import { useState, useCallback } from "react";

const AG_RISK_STORAGE_KEY = "ag_risk_confirmed";

/**
 * Manage provider detail modal visibility, OAuth/API-key flow triggers, and AG risk confirmation.
 */
export function useProviderModals({ providerId, isOAuth, setShowAgRiskModal, fetchConnections, confirmState, setConfirmState }) {
  const [showOAuthModal, setShowOAuthModal] = useState(false);
  const [showXiaomiMimoModal, setShowXiaomiMimoModal] = useState(false);
  const [showIFlowCookieModal, setShowIFlowCookieModal] = useState(false);
  const [showAddApiKeyModal, setShowAddApiKeyModal] = useState(false);
  const [addConnectionError, setAddConnectionError] = useState("");
  const [showBulkImportCodex, setShowBulkImportCodex] = useState(false);
  const [showBulkImportGrokCli, setShowBulkImportGrokCli] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showEditNodeModal, setShowEditNodeModal] = useState(false);
  const [selectedConnection, setSelectedConnection] = useState(null);
  const [showAddCustomModel, setShowAddCustomModel] = useState(false);
  const [scheduleConnection, setScheduleConnection] = useState(null);

  const triggerApiKeyConnection = useCallback(() => {
    setAddConnectionError("");
    setShowAddApiKeyModal(true);
  }, []);

  const triggerOAuthConnection = useCallback(() => {
    if (providerId === "antigravity" && typeof window !== "undefined") {
      if (window.localStorage.getItem(AG_RISK_STORAGE_KEY) !== "true") {
        setShowAgRiskModal(true);
        return;
      }
    }
    if (providerId === "xiaomi-mimo") {
      setShowXiaomiMimoModal(true);
      return;
    }
    if (isOAuth) {
      setShowOAuthModal(true);
      return;
    }
    triggerApiKeyConnection();
  }, [providerId, isOAuth, setShowAgRiskModal, triggerApiKeyConnection]);

  const triggerAddConnection = useCallback(() => {
    if (isOAuth) {
      triggerOAuthConnection();
      return;
    }
    triggerApiKeyConnection();
  }, [isOAuth, triggerOAuthConnection, triggerApiKeyConnection]);

  const handleAgRiskConfirm = useCallback(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(AG_RISK_STORAGE_KEY, "true");
    }
    setShowAgRiskModal(false);
    if (isOAuth) {
      setShowOAuthModal(true);
      return;
    }
    triggerApiKeyConnection();
  }, [isOAuth, setShowAgRiskModal, triggerApiKeyConnection]);

  const openEditConnection = useCallback((conn) => {
    setSelectedConnection(conn);
    setShowEditModal(true);
  }, []);

  const modalState = {
    showOAuthModal,
    setShowOAuthModal,
    showXiaomiMimoModal,
    setShowXiaomiMimoModal,
    showIFlowCookieModal,
    setShowIFlowCookieModal,
    showAddApiKeyModal,
    setShowAddApiKeyModal,
    addConnectionError,
    setAddConnectionError,
    onCloseAddApiKey: () => {
      setAddConnectionError("");
      setShowAddApiKeyModal(false);
    },
    showEditModal,
    setShowEditModal,
    selectedConnection,
    showEditNodeModal,
    setShowEditNodeModal,
    showAddCustomModel,
    setShowAddCustomModel,
    showBulkImportCodex,
    setShowBulkImportCodex,
    showBulkImportGrokCli,
    setShowBulkImportGrokCli,
    scheduleConnection,
    setScheduleConnection,
    confirmState,
    setConfirmState,
    onOAuthSuccess: () => {
      fetchConnections();
      setShowOAuthModal(false);
    },
    onIFlowCookieSuccess: () => {
      fetchConnections();
      setShowIFlowCookieModal(false);
    },
  };

  return {
    modalState,
    triggerApiKeyConnection,
    triggerOAuthConnection,
    triggerAddConnection,
    handleAgRiskConfirm,
    openEditConnection,
  };
}
