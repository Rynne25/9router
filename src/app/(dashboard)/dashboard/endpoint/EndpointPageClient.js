"use client";

import { useState, useEffect, useCallback, useSyncExternalStore } from "react";
import Link from "next/link";
import PropTypes from "prop-types";
import { CardSkeleton, ConfirmModal } from "@/shared/components";
import { HudFrame, NumberTicker } from "@/shared/components/hud";
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

  const activeKeysCount = Array.isArray(apiKeys.keys)
    ? apiKeys.keys.filter((k) => k.isActive !== false).length
    : 0;
  const tunnelOnline = Boolean(
    (cloudflare.tunnelEnabled && cloudflare.tunnelReachable) ||
      (tailscale.tsEnabled && tailscale.tsReachable),
  );

  return (
    <div className="flex flex-col gap-6">
      {/* Tactical Gateway Header Strip */}
      <HudFrame
        chamfer="sm"
        accent="cyan"
        padding="sm"
        spotlight={true}
        className="border-cyan-500/35 dark:border-cyan-400/25 bg-gradient-to-r from-cyan-500/[0.08] via-sky-500/[0.03] to-transparent"
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-2.5 min-w-0">
            <span className="inline-flex items-center gap-1.5 rounded border border-emerald-500/40 bg-emerald-500/12 px-2 py-0.5 font-mono text-[10.5px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-300">
              <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
              /v1 ONLINE
            </span>
            <code className="truncate rounded-md border border-cyan-500/25 bg-black/[0.04] dark:bg-white/[0.05] px-2 py-0.5 font-mono text-xs font-semibold text-cyan-800 dark:text-cyan-200 max-w-full sm:max-w-[340px]">
              {baseUrl}
            </code>
            <span className="inline-flex items-center gap-1 rounded-md border border-black/10 dark:border-white/10 bg-black/[0.03] dark:bg-white/[0.04] px-2 py-0.5 font-mono text-[11px] tabular-nums text-text-muted">
              KEYS
              <NumberTicker value={activeKeysCount} className="font-bold text-text-main" />
            </span>
            <span
              className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 font-mono text-[10.5px] font-semibold uppercase tracking-wider ${
                requireApiKey
                  ? "border-cyan-500/35 bg-cyan-500/10 text-cyan-700 dark:text-cyan-300"
                  : "border-amber-500/35 bg-amber-500/10 text-amber-700 dark:text-amber-300"
              }`}
            >
              {requireApiKey ? "AUTH: API KEY" : "AUTH: OPEN"}
            </span>
            {tunnelOnline && (
              <span className="inline-flex items-center gap-1 rounded-md border border-emerald-500/35 bg-emerald-500/10 px-2 py-0.5 font-mono text-[10.5px] font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-300">
                TUNNEL LIVE
              </span>
            )}
          </div>

          <Link
            href="/dashboard"
            className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-cyan-500/45 bg-cyan-500/15 px-3 font-mono text-xs font-semibold text-cyan-700 dark:text-cyan-200 hover:bg-cyan-500/25 transition-colors"
          >
            <span className="material-symbols-outlined text-[15px]">rocket_launch</span>
            <span>Antigravity Command Center</span>
          </Link>
        </div>
      </HudFrame>

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
