"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { MITM_TOOLS } from "@/shared/constants/cliTools";
import { getModelsByProviderId } from "@/shared/constants/models";
import { isOpenAICompatibleProvider, isAnthropicCompatibleProvider } from "@/shared/constants/providers";
import { MitmServerCard, MitmToolCard } from "@/app/(dashboard)/dashboard/cli-tools/components";
import { HudFrame, NumberTicker } from "@/shared/components/hud";
import { useHudPrefs } from "@/shared/hooks/useHudPrefs";
import { playHudSound } from "@/shared/utils/hudAudio";
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
  const { motionPaused } = useHudPrefs();

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

  // Pin Antigravity first among MITM targets
  const mitmTools = useMemo(
    () =>
      Object.entries(MITM_TOOLS).sort(([a], [b]) => {
        if (a === "antigravity") return -1;
        if (b === "antigravity") return 1;
        return 0;
      }),
    []
  );

  const isRunning = Boolean(mitmStatus?.running);
  const certTrusted = Boolean(mitmStatus?.certTrusted);
  const activeDnsToolsCount = Object.values(mitmStatus?.dnsStatus || {}).filter(Boolean).length;
  const antigravityDnsActive = Boolean(mitmStatus?.dnsStatus?.antigravity);

  return (
    <div className="flex w-full flex-col gap-3">
      {/* HUD Mission Header Strip */}
      <HudFrame
        chamfer="md"
        accent={isRunning ? "emerald" : "cyan"}
        padding="sm"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2.5 min-w-0">
            <div
              className={`size-8 rounded-lg flex items-center justify-center shrink-0 border ${
                isRunning
                  ? "border-emerald-500/35 bg-emerald-500/15 text-emerald-500"
                  : "border-cyan-500/35 bg-cyan-500/12 text-cyan-600 dark:text-cyan-400"
              }`}
            >
              <span className="material-symbols-outlined text-[18px]">radar</span>
            </div>
            <div className="flex flex-col min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-cyan-600 dark:text-cyan-400">
                  BẢNG ĐIỀU KHIỂN CHẶN LƯU LƯỢNG MITM
                </span>
                <span
                  className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 font-mono text-[10px] font-bold ${
                    isRunning
                      ? "border-emerald-500/35 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                      : "border-cyan-500/25 bg-cyan-500/10 text-text-muted"
                  }`}
                >
                  <span
                    className={`size-1.5 rounded-full ${
                      isRunning
                        ? `bg-emerald-500 ${motionPaused ? "" : "animate-pulse"}`
                        : "bg-slate-400"
                    }`}
                  />
                  {isRunning ? ":443 ĐANG CHẠY" : ":443 ĐANG CHỜ"}
                </span>
                <span
                  className="inline-flex items-center gap-1 rounded border border-cyan-500/30 bg-cyan-500/10 px-2 py-0.5 font-mono text-[10px] font-semibold text-cyan-700 dark:text-cyan-300"
                  data-i18n-skip="true"
                >
                  <span className="material-symbols-outlined text-[12px]">bolt</span>
                  <span>Passthrough thông minh · Không cần khởi động lại IDE</span>
                </span>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 font-mono text-[11px]" data-i18n-skip="true">
            <div className="flex items-center gap-1.5 rounded-md border border-black/10 dark:border-white/10 bg-white/50 dark:bg-black/25 px-2.5 py-1">
              <span className="text-[10px] uppercase tracking-wider text-text-muted">Root CA</span>
              <span className={`font-bold ${certTrusted ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"}`}>
                {certTrusted ? "ĐÃ TIN CẬY" : "CHƯA TIN CẬY"}
              </span>
            </div>
            <div className="flex items-center gap-1.5 rounded-md border border-black/10 dark:border-white/10 bg-white/50 dark:bg-black/25 px-2.5 py-1">
              <span className="text-[10px] uppercase tracking-wider text-text-muted">DNS đang bật</span>
              <span className="font-bold text-text-main hud-telemetry-num">
                <NumberTicker value={activeDnsToolsCount} />/{mitmTools.length}
              </span>
            </div>
            <div className="flex items-center gap-1.5 rounded-md border border-cyan-500/25 bg-cyan-500/10 px-2.5 py-1">
              <span className="text-[10px] uppercase tracking-wider text-cyan-700 dark:text-cyan-300">Antigravity</span>
              <span className={`font-bold ${antigravityDnsActive && isRunning ? "text-emerald-600 dark:text-emerald-400" : "text-cyan-700 dark:text-cyan-300"}`}>
                {antigravityDnsActive && isRunning ? "ĐANG CHẶN" : "CHUYỂN TIẾP THẲNG"}
              </span>
            </div>
          </div>
        </div>
      </HudFrame>

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
            onToggle={() => {
              playHudSound("click");
              setExpandedTool(expandedTool === toolId ? null : toolId);
            }}
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
