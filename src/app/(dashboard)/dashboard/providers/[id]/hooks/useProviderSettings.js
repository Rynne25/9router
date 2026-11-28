"use client";

import { useState, useCallback } from "react";
import useSettingsStore from "@/store/settingsStore";
import { AUTO_PING_SETTINGS_KEYS } from "../utils/providerMeta";

/**
 * Manage per-provider routing strategy (Round Robin / sticky limit),
 * thinking mode preference, and auto-ping schedule settings.
 * @param {{ providerId: string }} params
 */
export function useProviderSettings({ providerId }) {
  const initialSettings = useSettingsStore.getState().settings;
  const initialOverride = (initialSettings?.providerStrategies || {})[providerId] || {};
  const initialThinking = (initialSettings?.providerThinking || {})[providerId] || {};
  const initialAutoPingKey = AUTO_PING_SETTINGS_KEYS[providerId];
  const initialApCfg = initialAutoPingKey ? initialSettings?.[initialAutoPingKey] || {} : {};

  const [providerStrategy, setProviderStrategy] = useState(
    () => initialOverride.fallbackStrategy || null
  );
  const [providerStickyLimit, setProviderStickyLimit] = useState(() =>
    initialOverride.stickyRoundRobinLimit != null ? String(initialOverride.stickyRoundRobinLimit) : "1"
  );
  const [thinkingMode, setThinkingMode] = useState(() => initialThinking.mode || "auto");
  const [autoPing, setAutoPing] = useState(() => ({
    enabled: initialApCfg.enabled === true,
    connections: initialApCfg.connections || {},
    schedules: initialApCfg.schedules || {},
  }));

  const syncSettingsFromData = useCallback((settingsData) => {
    const override = (settingsData.providerStrategies || {})[providerId] || {};
    setProviderStrategy(override.fallbackStrategy || null);
    setProviderStickyLimit(override.stickyRoundRobinLimit != null ? String(override.stickyRoundRobinLimit) : "1");

    const thinkingCfg = (settingsData.providerThinking || {})[providerId] || {};
    setThinkingMode(thinkingCfg.mode || "auto");

    const autoPingSettingsKey = AUTO_PING_SETTINGS_KEYS[providerId];
    const apCfg = autoPingSettingsKey ? settingsData[autoPingSettingsKey] || {} : {};
    setAutoPing({
      enabled: apCfg.enabled === true,
      connections: apCfg.connections || {},
      schedules: apCfg.schedules || {},
    });
  }, [providerId]);

  const saveProviderStrategy = useCallback(async (strategy, stickyLimit) => {
    try {
      const settingsRes = await fetch("/api/settings", { cache: "no-store" });
      const settingsData = settingsRes.ok ? await settingsRes.json() : {};
      const current = settingsData.providerStrategies || {};

      const override = {};
      if (strategy) override.fallbackStrategy = strategy;
      if (strategy === "round-robin" && stickyLimit !== "") {
        override.stickyRoundRobinLimit = Number(stickyLimit) || 3;
      }

      const updated = { ...current };
      if (Object.keys(override).length === 0) {
        delete updated[providerId];
      } else {
        updated[providerId] = override;
      }

      await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ providerStrategies: updated }),
      });
    } catch (error) {
      console.log("Error saving provider strategy:", error);
    }
  }, [providerId]);

  const handleRoundRobinToggle = useCallback((enabled) => {
    const strategy = enabled ? "round-robin" : null;
    const sticky = enabled ? providerStickyLimit || "1" : providerStickyLimit;
    if (enabled && !providerStickyLimit) setProviderStickyLimit("1");
    setProviderStrategy(strategy);
    saveProviderStrategy(strategy, sticky);
  }, [providerStickyLimit, saveProviderStrategy]);

  const handleSoonestResetToggle = useCallback((enabled) => {
    const strategy = enabled ? "soonest-reset" : null;
    setProviderStrategy(strategy);
    saveProviderStrategy(strategy, providerStickyLimit);
  }, [providerStickyLimit, saveProviderStrategy]);

  const handleStickyLimitChange = useCallback((value) => {
    setProviderStickyLimit(value);
    saveProviderStrategy("round-robin", value);
  }, [saveProviderStrategy]);

  const handleSaveAutoPing = useCallback(async (connectionId, { reactive, schedule }) => {
    const autoPingSettingsKey = AUTO_PING_SETTINGS_KEYS[providerId];
    if (!autoPingSettingsKey) return;

    const next = {
      ...autoPing,
      connections: { ...autoPing.connections, [connectionId]: reactive },
      schedules: { ...autoPing.schedules, [connectionId]: schedule },
    };
    setAutoPing(next);
    try {
      await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [autoPingSettingsKey]: next }),
      });
    } catch (error) {
      console.log("Error saving auto-ping config:", error);
    }
  }, [providerId, autoPing]);

  return {
    providerStrategy,
    providerStickyLimit,
    thinkingMode,
    setThinkingMode,
    autoPing,
    syncSettingsFromData,
    handleRoundRobinToggle,
    handleSoonestResetToggle,
    handleStickyLimitChange,
    handleSaveAutoPing,
  };
}
