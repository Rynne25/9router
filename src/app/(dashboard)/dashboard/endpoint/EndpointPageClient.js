"use client";

import { useState, useEffect, useCallback, useSyncExternalStore } from "react";
import PropTypes from "prop-types";
import { CardSkeleton, ConfirmModal } from "@/shared/components";
import useSettingsStore from "@/store/settingsStore";
import { useApiKeys } from "./hooks/useApiKeys";
import { useCloudflareTunnel } from "./hooks/useCloudflareTunnel";
import { useTailscaleTunnel } from "./hooks/useTailscaleTunnel";
import TunnelEndpointSection from "./components/TunnelEndpointSection";
import ApiKeysCard from "./components/ApiKeysCard";
import TunnelModals from "./components/TunnelModals";

const subscribeNoop = () => () => {};

export default function EndpointPageClient({ machineId: _machineId = "" }) {
  const initialSettings = useSettingsStore.getState().settings;
  const [requireApiKey, setRequireApiKey] = useState(() => initialSettings?.requireApiKey || false);
  const [requireLogin, setRequireLogin] = useState(() =>
    initialSettings ? initialSettings.requireLogin !== false : true
  );
  const [hasPassword, setHasPassword] = useState(() =>
    initialSettings ? Boolean(initialSettings.hasPassword) : true
  );
  const [tunnelDashboardAccess, setTunnelDashboardAccess] = useState(() =>
    initialSettings?.tunnelDashboardAccess || false
  );

  const apiKeys = useApiKeys();
  const cloudflare = useCloudflareTunnel();
  const tailscale = useTailscaleTunnel();

  const isRemoteHost = useSyncExternalStore(
    subscribeNoop,
    () => !["localhost", "127.0.0.1", "::1"].includes(window.location.hostname),
    () => false
  );

  const baseUrl = useSyncExternalStore(
    subscribeNoop,
    () => `${window.location.origin}/v1`,
    () => "/v1"
  );

  useEffect(() => {
    let ignore = false;
    async function loadSettings() {
      try {
        const settingsData = await useSettingsStore.getState().fetchSettings();
        if (settingsData && !ignore) {
          setRequireApiKey(settingsData.requireApiKey || false);
          setRequireLogin(settingsData.requireLogin !== false);
          setHasPassword(settingsData.hasPassword || false);
          setTunnelDashboardAccess(settingsData.tunnelDashboardAccess || false);
        }
      } catch (error) {
        console.log("Error loading settings:", error);
      }
    }
    loadSettings();
    return () => {
      ignore = true;
    };
  }, []);

  const isLoginUnsafe = !requireLogin || !hasPassword;
  const unsafeReason = !requireLogin
    ? 'Dashboard access via tunnel requires "Require login" and a custom password.'
    : "Dashboard access via tunnel requires changing the default dashboard password.";

  const handleTunnelDashboardAccess = useCallback(async (value) => {
    if (value && isLoginUnsafe) return;
    try {
      const updated = await useSettingsStore.getState().patchSettings({
        tunnelDashboardAccess: value,
      });
      if (updated) setTunnelDashboardAccess(value);
    } catch (error) {
      console.log("Error updating tunnelDashboardAccess:", error);
    }
  }, [isLoginUnsafe]);

  const handleBeforeEnableTunnel = useCallback(async () => {
    if (isLoginUnsafe && tunnelDashboardAccess) {
      await handleTunnelDashboardAccess(false);
    }
  }, [isLoginUnsafe, tunnelDashboardAccess, handleTunnelDashboardAccess]);

  const handleRequireApiKey = useCallback(async (value) => {
    try {
      const updated = await useSettingsStore.getState().patchSettings({
        requireApiKey: value,
      });
      if (updated) setRequireApiKey(value);
    } catch (error) {
      console.log("Error updating requireApiKey:", error);
    }
  }, []);

  if (apiKeys.loading) {
    return (
      <div className="flex flex-col gap-8">
        <CardSkeleton />
        <CardSkeleton />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <TunnelEndpointSection
        currentEndpoint={baseUrl}
        copied={apiKeys.copied}
        onCopy={apiKeys.copy}
        cloudflare={cloudflare}
        tailscale={tailscale}
        security={{
          requireLogin,
          hasPassword,
          isLoginUnsafe,
          unsafeReason,
          requireApiKey,
          tunnelDashboardAccess,
          onToggleDashboardAccess: handleTunnelDashboardAccess,
          onBeforeEnableTunnel: handleBeforeEnableTunnel,
        }}
      />

      <ApiKeysCard
        keys={apiKeys.keys}
        visibleKeys={apiKeys.visibleKeys}
        maskKey={apiKeys.maskKey}
        toggleKeyVisibility={apiKeys.toggleKeyVisibility}
        copy={apiKeys.copy}
        copied={apiKeys.copied}
        requireApiKey={requireApiKey}
        onToggleRequireApiKey={handleRequireApiKey}
        isRemoteHost={isRemoteHost}
        showAddModal={apiKeys.showAddModal}
        setShowAddModal={apiKeys.setShowAddModal}
        newKeyName={apiKeys.newKeyName}
        setNewKeyName={apiKeys.setNewKeyName}
        handleCreateKey={apiKeys.handleCreateKey}
        createdKey={apiKeys.createdKey}
        setCreatedKey={apiKeys.setCreatedKey}
        handleDeleteKey={apiKeys.handleDeleteKey}
        handleToggleKey={apiKeys.handleToggleKey}
        handleUpdateKeyAccess={apiKeys.handleUpdateKeyAccess}
        onRequestConfirm={apiKeys.setConfirmState}
      />

      <TunnelModals cloudflare={cloudflare} tailscale={tailscale} />

      <ConfirmModal
        isOpen={!!apiKeys.confirmState}
        onClose={() => apiKeys.setConfirmState(null)}
        onConfirm={apiKeys.confirmState?.onConfirm}
        title={apiKeys.confirmState?.title || "Confirm"}
        message={apiKeys.confirmState?.message}
        variant="danger"
      />
    </div>
  );
}

EndpointPageClient.propTypes = {
  machineId: PropTypes.string,
};
