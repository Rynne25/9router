"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { MITM_TOOLS } from "@/shared/constants/cliTools";
import { getModelsByProviderId } from "@/shared/constants/models";
import { isOpenAICompatibleProvider, isAnthropicCompatibleProvider } from "@/shared/constants/providers";
import { MitmServerCard, MitmToolCard } from "@/app/(dashboard)/dashboard/cli-tools/components";
import useSettingsStore from "@/store/settingsStore";
import { getCachedData, fetchWithCache, fetchJson } from "@/shared/utils/swrCache";

const MITM_STATUS_DEFAULT = { running: false, certExists: false, dnsStatus: {}, hasCachedPassword: false };
const MITM_DATA_TTL_MS = 30000;

export default function MitmPageClient() {
  const [connections, setConnections] = useState(() => getCachedData("/api/providers")?.connections || []);
  const [apiKeys, setApiKeys] = useState(() => getCachedData("/api/keys")?.keys || []);
  const [modelAliases, setModelAliases] = useState(() => getCachedData("/api/models/alias")?.aliases || {});
  const [combos, setCombos] = useState(() => getCachedData("/api/combos")?.combos || []);
  const [cloudEnabled, setCloudEnabled] = useState(() => useSettingsStore.getState().settings?.cloudEnabled || false);
  const [expandedTool, setExpandedTool] = useState("antigravity");
  const [mitmStatus, setMitmStatus] = useState(
    () => getCachedData("/api/cli-tools/antigravity-mitm") || MITM_STATUS_DEFAULT
  );

  useEffect(() => {
    let cancelled = false;

    fetchWithCache("/api/providers", () => fetchJson("/api/providers"), { ttlMs: MITM_DATA_TTL_MS })
      .then((data) => {
        if (!cancelled && data) setConnections(data.connections || []);
      })
      .catch(() => {});

    fetchWithCache("/api/keys", () => fetchJson("/api/keys"), { ttlMs: MITM_DATA_TTL_MS })
      .then((data) => {
        if (!cancelled && data) setApiKeys(data.keys || []);
      })
      .catch(() => {});

    fetchWithCache("/api/models/alias", () => fetchJson("/api/models/alias"), { ttlMs: MITM_DATA_TTL_MS })
      .then((data) => {
        if (!cancelled && data) setModelAliases(data.aliases || {});
      })
      .catch(() => {});

    fetchWithCache("/api/combos", () => fetchJson("/api/combos"), { ttlMs: MITM_DATA_TTL_MS })
      .then((data) => {
        if (!cancelled && data) setCombos(data.combos || []);
      })
      .catch(() => {});

    useSettingsStore
      .getState()
      .fetchSettings()
      .then((data) => {
        if (!cancelled && data) setCloudEnabled(data.cloudEnabled || false);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, []);

  const activeProviders = useMemo(
    () => connections.filter((c) => c.isActive !== false),
    [connections]
  );

  const hasActiveProviders = useMemo(
    () =>
      activeProviders.some(
        (conn) =>
          getModelsByProviderId(conn.provider).length > 0 ||
          isOpenAICompatibleProvider(conn.provider) ||
          isAnthropicCompatibleProvider(conn.provider)
      ) || combos.length > 0,
    [activeProviders, combos]
  );

  const handleDnsChange = useCallback((data) => {
    setMitmStatus((prev) => ({ ...prev, dnsStatus: data.dnsStatus ?? prev.dnsStatus }));
  }, []);

  const mitmTools = useMemo(() => Object.entries(MITM_TOOLS), []);

  return (
    <div className="flex w-full flex-col gap-3">
      {/* MITM Server Control Center */}
      <MitmServerCard
        apiKeys={apiKeys}
        cloudEnabled={cloudEnabled}
        onStatusChange={setMitmStatus}
      />

      {/* IDE Tool Cards */}
      <div className="flex flex-col gap-3">
        {mitmTools.map(([toolId, tool]) => (
          <MitmToolCard
            key={toolId}
            tool={tool}
            isExpanded={expandedTool === toolId}
            onToggle={() => setExpandedTool(expandedTool === toolId ? null : toolId)}
            serverRunning={mitmStatus.running}
            dnsActive={mitmStatus.dnsStatus?.[toolId] || false}
            hasCachedPassword={mitmStatus.hasCachedPassword || false}
            needsSudoPassword={mitmStatus.needsSudoPassword !== false}
            isWin={mitmStatus.isWin === true}
            apiKeys={apiKeys}
            activeProviders={activeProviders}
            hasActiveProviders={hasActiveProviders}
            modelAliases={modelAliases}
            combos={combos}
            cloudEnabled={cloudEnabled}
            onDnsChange={handleDnsChange}
          />
        ))}
      </div>
    </div>
  );
}
