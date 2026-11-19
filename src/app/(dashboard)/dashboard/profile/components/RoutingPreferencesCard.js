import { Card, Button, Toggle, Input } from "@/shared/components";

export default function RoutingPreferencesCard({
  settings,
  loading,
  updateFallbackStrategy,
  updateComboStrategy,
  updateStickyLimit,
  updateComboStickyLimit,
  proxyForm,
  setProxyForm,
  proxyStatus,
  proxyLoading,
  proxyTestLoading,
  updateOutboundProxy,
  testOutboundProxy,
  updateOutboundProxyEnabled,
  updateObservabilityEnabled,
}) {
  const observabilityEnabled = settings?.enableObservability === true;

  return (
    <>
      {/* Routing Strategy */}
      <Card>
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 rounded-lg bg-blue-500/10 text-blue-500 shrink-0">
            <span className="material-symbols-outlined text-[20px]">route</span>
          </div>
          <h3 className="text-base sm:text-lg font-semibold">Routing Strategy</h3>
        </div>
        <div className="flex flex-col gap-4">
          <div className="flex items-start sm:items-center justify-between gap-4">
            <div className="flex-1 min-w-0">
              <p className="font-medium text-sm sm:text-base">Round Robin</p>
              <p className="text-xs sm:text-sm text-text-muted">
                Cycle through accounts to distribute load
              </p>
            </div>
            <Toggle
              checked={settings?.fallbackStrategy === "round-robin"}
              onChange={() =>
                updateFallbackStrategy(
                  settings?.fallbackStrategy === "round-robin" ? "fill-first" : "round-robin"
                )
              }
              disabled={loading}
            />
          </div>

          {/* Sticky Round Robin Limit */}
          {settings?.fallbackStrategy === "round-robin" && (
            <div className="flex items-start sm:items-center justify-between gap-4 pt-2 border-t border-border/50">
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm sm:text-base">Sticky Limit</p>
                <p className="text-xs sm:text-sm text-text-muted">
                  Calls per account before switching
                </p>
              </div>
              <Input
                type="number"
                min="1"
                max="10"
                value={settings?.stickyRoundRobinLimit || 3}
                onChange={(e) => updateStickyLimit(e.target.value)}
                disabled={loading}
                className="w-16 sm:w-20 text-center shrink-0"
              />
            </div>
          )}

          {/* Combo Round Robin */}
          <div className="flex items-start sm:items-center justify-between gap-4 pt-4 border-t border-border/50">
            <div className="flex-1 min-w-0">
              <p className="font-medium text-sm sm:text-base">Combo Round Robin</p>
              <p className="text-xs sm:text-sm text-text-muted">
                Cycle through providers in combos instead of always starting with first
              </p>
            </div>
            <Toggle
              checked={settings?.comboStrategy === "round-robin"}
              onChange={() =>
                updateComboStrategy(
                  settings?.comboStrategy === "round-robin" ? "fallback" : "round-robin"
                )
              }
              disabled={loading}
            />
          </div>

          {/* Combo Sticky Round Robin Limit */}
          {settings?.comboStrategy === "round-robin" && (
            <div className="flex items-center justify-between pt-2 border-t border-border/50">
              <div>
                <p className="font-medium">Combo Sticky Limit</p>
                <p className="text-sm text-text-muted">
                  Calls per combo model before switching
                </p>
              </div>
              <Input
                type="number"
                min="1"
                max="100"
                value={settings?.comboStickyRoundRobinLimit || 1}
                onChange={(e) => updateComboStickyLimit(e.target.value)}
                disabled={loading}
                className="w-20 text-center"
              />
            </div>
          )}

          <p className="text-xs text-text-muted italic pt-2 border-t border-border/50">
            {settings?.fallbackStrategy === "round-robin"
              ? `Currently distributing requests across all available accounts with ${settings?.stickyRoundRobinLimit || 3} calls per account.`
              : "Currently using accounts in priority order (Fill First)."}
            {settings?.comboStrategy === "round-robin"
              ? ` Combos rotate after ${settings?.comboStickyRoundRobinLimit || 1} call${(settings?.comboStickyRoundRobinLimit || 1) === 1 ? "" : "s"} per model.`
              : " Combos always start with their first model."}
          </p>
        </div>
      </Card>

      {/* Network / Outbound Proxy */}
      <Card>
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 rounded-lg bg-purple-500/10 text-purple-500 shrink-0">
            <span className="material-symbols-outlined text-[20px]">wifi</span>
          </div>
          <h3 className="text-base sm:text-lg font-semibold">Network</h3>
        </div>

        <div className="flex flex-col gap-4">
          <div className="flex items-start sm:items-center justify-between gap-4">
            <div className="flex-1 min-w-0">
              <p className="font-medium text-sm sm:text-base">Outbound Proxy</p>
              <p className="text-xs sm:text-sm text-text-muted">
                Enable proxy for OAuth + provider outbound requests.
              </p>
            </div>
            <Toggle
              checked={settings?.outboundProxyEnabled === true}
              onChange={() =>
                updateOutboundProxyEnabled(!(settings?.outboundProxyEnabled === true))
              }
              disabled={loading || proxyLoading}
            />
          </div>

          {settings?.outboundProxyEnabled === true && (
            <form onSubmit={updateOutboundProxy} className="flex flex-col gap-4 pt-2 border-t border-border/50">
              <div className="flex flex-col gap-2">
                <label className="font-medium text-sm sm:text-base">Proxy URL</label>
                <Input
                  placeholder="http://127.0.0.1:7897"
                  value={proxyForm.outboundProxyUrl}
                  onChange={(e) =>
                    setProxyForm((prev) => ({ ...prev, outboundProxyUrl: e.target.value }))
                  }
                  disabled={loading || proxyLoading}
                />
                <p className="text-xs sm:text-sm text-text-muted">
                  Leave empty to inherit existing env proxy (if any).
                </p>
              </div>

              <div className="flex flex-col gap-2 pt-2 border-t border-border/50">
                <label className="font-medium text-sm sm:text-base">No Proxy</label>
                <Input
                  placeholder="localhost,127.0.0.1"
                  value={proxyForm.outboundNoProxy}
                  onChange={(e) =>
                    setProxyForm((prev) => ({ ...prev, outboundNoProxy: e.target.value }))
                  }
                  disabled={loading || proxyLoading}
                />
                <p className="text-xs sm:text-sm text-text-muted">
                  Comma-separated hostnames/domains to bypass the proxy.
                </p>
              </div>

              <div className="pt-2 border-t border-border/50 flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  loading={proxyTestLoading}
                  disabled={loading || proxyLoading}
                  onClick={testOutboundProxy}
                  className="w-full sm:w-auto"
                >
                  Test proxy URL
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  loading={proxyLoading}
                  className="w-full sm:w-auto"
                >
                  Apply
                </Button>
              </div>
            </form>
          )}

          {proxyStatus?.message && (
            <p
              className={`text-xs sm:text-sm ${
                proxyStatus.type === "error" ? "text-red-500" : "text-green-500"
              } pt-2 border-t border-border/50`}
            >
              {proxyStatus.message}
            </p>
          )}
        </div>
      </Card>

      {/* Observability Settings */}
      <Card>
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 rounded-lg bg-orange-500/10 text-orange-500 shrink-0">
            <span className="material-symbols-outlined text-[20px]">monitoring</span>
          </div>
          <h3 className="text-base sm:text-lg font-semibold">Observability</h3>
        </div>
        <div className="flex items-start sm:items-center justify-between gap-4">
          <div className="flex-1 min-w-0">
            <p className="font-medium text-sm sm:text-base">Enable Observability</p>
            <p className="text-xs sm:text-sm text-text-muted">
              Record request details for inspection in the logs view
            </p>
          </div>
          <Toggle
            checked={observabilityEnabled}
            onChange={() => updateObservabilityEnabled(!observabilityEnabled)}
            disabled={loading}
          />
        </div>
      </Card>
    </>
  );
}
