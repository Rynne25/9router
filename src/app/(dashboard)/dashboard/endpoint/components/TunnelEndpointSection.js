"use client";

import PropTypes from "prop-types";
import { Card, Button, Input, Toggle } from "@/shared/components";
import EndpointRow from "./EndpointRow";
import Tooltip from "./Tooltip";
import SecurityWarning from "./SecurityWarning";

export default function TunnelEndpointSection({
  currentEndpoint,
  copied,
  onCopy,
  cloudflare,
  tailscale,
  security,
}) {
  const {
    tunnelChecking,
    setTunnelChecking,
    tunnelEnabled,
    tunnelReachable,
    tunnelUrl,
    tunnelPublicUrl,
    tunnelLoading,
    setTunnelLoading,
    tunnelProgress,
    setTunnelProgress,
    tunnelStatus,
    setTunnelStatus,
    tunnelEverReachable,
    setShowEnableTunnelModal,
    setShowDisableTunnelModal,
  } = cloudflare;

  const {
    tsEnabled,
    tsReachable,
    tsUrl,
    tsLoading,
    tsProgress,
    tsStatus,
    setTsStatus,
    tsAuthUrl,
    tsAuthLabel,
    tsConnecting,
    setTsConnecting,
    setTsLoading,
    setTsProgress,
    tsEverReachable,
    setShowDisableTsModal,
    clearUserAuth,
    handleOpenTsModal,
  } = tailscale;

  const {
    requireLogin,
    hasPassword,
    isLoginUnsafe,
    unsafeReason,
    requireApiKey,
    tunnelDashboardAccess,
    onToggleDashboardAccess,
    onBeforeEnableTunnel,
  } = security;

  return (
    <Card>
      <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
        <span className="material-symbols-outlined text-primary">api</span>
        API Endpoint
      </h2>

      {/* Endpoint rows */}
      <div className="flex flex-col gap-2">
        {/* Local */}
        <EndpointRow
          label="Local"
          url={currentEndpoint}
          copyId="local_url"
          copied={copied}
          onCopy={onCopy}
        />

        {/* Cloudflare Tunnel */}
        <div className="flex items-center gap-2">
          <span
            className={`text-xs font-mono px-1.5 py-0.5 rounded shrink-0 min-w-[88px] text-center ${
              tunnelEnabled
                ? "bg-primary/10 text-primary"
                : "bg-surface-2 text-text-muted"
            }`}
          >
            Tunnel
          </span>
          {tunnelEnabled && !tunnelLoading && tunnelReachable ? (
            <>
              <Input
                value={`${tunnelPublicUrl || tunnelUrl}/v1`}
                readOnly
                className="flex-1 font-mono text-sm"
              />
              <button
                onClick={() =>
                  onCopy(`${tunnelPublicUrl || tunnelUrl}/v1`, "tunnel_url")
                }
                className="p-2 hover:bg-black/5 dark:hover:bg-white/5 rounded text-text-muted hover:text-primary transition-colors shrink-0"
              >
                <span className="material-symbols-outlined text-[18px]">
                  {copied === "tunnel_url" ? "check" : "content_copy"}
                </span>
              </button>
              <button
                onClick={() => setShowDisableTunnelModal(true)}
                className="p-2 hover:bg-red-500/10 rounded text-red-500 transition-colors shrink-0"
                title="Disable Tunnel"
              >
                <span className="material-symbols-outlined text-[18px]">
                  power_settings_new
                </span>
              </button>
            </>
          ) : tunnelEnabled && !tunnelLoading && !tunnelReachable ? (
            <>
              <div className="flex-1 flex items-center gap-2 px-3 py-1.5 rounded border border-amber-300 dark:border-amber-800 bg-amber-500/5 text-sm text-amber-600 dark:text-amber-400">
                <span className="material-symbols-outlined animate-spin text-sm">
                  progress_activity
                </span>
                {tunnelEverReachable
                  ? "Tunnel reconnecting..."
                  : "Tunnel checking..."}
              </div>
              <button
                onClick={() => setShowDisableTunnelModal(true)}
                className="p-2 hover:bg-red-500/10 rounded text-red-500 transition-colors shrink-0"
                title="Disable Tunnel"
              >
                <span className="material-symbols-outlined text-[18px]">
                  power_settings_new
                </span>
              </button>
            </>
          ) : tunnelLoading ? (
            <>
              <div className="flex-1 flex items-center gap-2 px-3 py-1.5 rounded border border-border bg-input text-sm text-text-muted">
                <span className="material-symbols-outlined animate-spin text-sm">
                  progress_activity
                </span>
                {tunnelProgress || "Creating tunnel..."}
              </div>
              <button
                onClick={() => {
                  setTunnelLoading(false);
                  setTunnelProgress("");
                }}
                className="p-2 hover:bg-red-500/10 rounded text-red-500 transition-colors shrink-0"
                title="Stop"
              >
                <span className="material-symbols-outlined text-[18px]">
                  power_settings_new
                </span>
              </button>
            </>
          ) : tunnelStatus?.type === "error" ? (
            <>
              <div className="flex-1 flex items-center gap-2 px-3 py-1.5 rounded border border-red-300 dark:border-red-800 bg-red-500/5 text-sm text-red-600 dark:text-red-400">
                <span className="material-symbols-outlined text-sm">error</span>
                {tunnelStatus.message}
              </div>
              <Button
                size="sm"
                icon="cloud_upload"
                onClick={() => setShowEnableTunnelModal(true)}
              >
                Enable
              </Button>
            </>
          ) : tunnelChecking ? (
            <>
              <div className="flex-1 flex items-center gap-2 px-3 py-1.5 rounded border border-border bg-input text-sm text-text-muted">
                <span className="material-symbols-outlined animate-spin text-sm">
                  progress_activity
                </span>
                Checking...
              </div>
              <button
                onClick={() => setTunnelChecking(false)}
                className="p-2 hover:bg-red-500/10 rounded text-red-500 transition-colors shrink-0"
                title="Stop"
              >
                <span className="material-symbols-outlined text-[18px]">
                  power_settings_new
                </span>
              </button>
            </>
          ) : (
            <Button
              size="sm"
              icon="cloud_upload"
              onClick={() => {
                if (!requireApiKey) {
                  setTunnelStatus({
                    type: "error",
                    message:
                      'Security required: Enable "Require API key" before activating the tunnel.',
                  });
                  return;
                }
                onBeforeEnableTunnel?.();
                setShowEnableTunnelModal(true);
              }}
            >
              Enable
            </Button>
          )}
        </div>

        {/* Tailscale */}
        <div className="flex items-center gap-2">
          <span
            className={`text-xs font-mono px-1.5 py-0.5 rounded shrink-0 min-w-[88px] text-center ${
              tsEnabled
                ? "bg-primary/10 text-primary"
                : "bg-surface-2 text-text-muted"
            }`}
          >
            Tailscale
          </span>
          {tsEnabled && !tsLoading && tsReachable ? (
            <>
              <Input
                value={`${tsUrl}/v1`}
                readOnly
                className="flex-1 font-mono text-sm"
              />
              <button
                onClick={() => onCopy(`${tsUrl}/v1`, "ts_url")}
                className="p-2 hover:bg-black/5 dark:hover:bg-white/5 rounded text-text-muted hover:text-primary transition-colors shrink-0"
              >
                <span className="material-symbols-outlined text-[18px]">
                  {copied === "ts_url" ? "check" : "content_copy"}
                </span>
              </button>
              <button
                onClick={() => setShowDisableTsModal(true)}
                className="p-2 hover:bg-red-500/10 rounded text-red-500 transition-colors shrink-0"
                title="Disable Tailscale"
              >
                <span className="material-symbols-outlined text-[18px]">
                  power_settings_new
                </span>
              </button>
            </>
          ) : tsEnabled && !tsLoading && !tsReachable ? (
            <>
              <div className="flex-1 flex items-center gap-2 px-3 py-1.5 rounded border border-amber-300 dark:border-amber-800 bg-amber-500/5 text-sm text-amber-600 dark:text-amber-400">
                <span className="material-symbols-outlined animate-spin text-sm">
                  progress_activity
                </span>
                {tsEverReachable
                  ? "Tailscale reconnecting..."
                  : "Tailscale checking..."}
              </div>
              <button
                onClick={() => setShowDisableTsModal(true)}
                className="p-2 hover:bg-red-500/10 rounded text-red-500 transition-colors shrink-0"
                title="Disable Tailscale"
              >
                <span className="material-symbols-outlined text-[18px]">
                  power_settings_new
                </span>
              </button>
            </>
          ) : tsLoading || tsConnecting ? (
            <>
              <div className="flex-1 flex items-center gap-2 px-3 py-1.5 rounded border border-border bg-input text-sm text-text-muted">
                <span className="material-symbols-outlined animate-spin text-sm">
                  progress_activity
                </span>
                {tsProgress || "Connecting..."}
              </div>
              {tsAuthUrl && (
                <Button
                  size="sm"
                  icon="open_in_new"
                  onClick={() =>
                    window.open(
                      tsAuthUrl,
                      "tailscale_auth",
                      "width=600,height=700,noopener,noreferrer"
                    )
                  }
                >
                  {tsAuthLabel || "Open"}
                </Button>
              )}
              <button
                onClick={() => {
                  setTsLoading(false);
                  setTsConnecting(false);
                  setTsProgress("");
                  clearUserAuth();
                }}
                className="p-2 hover:bg-red-500/10 rounded text-red-500 transition-colors shrink-0"
                title="Stop"
              >
                <span className="material-symbols-outlined text-[18px]">
                  power_settings_new
                </span>
              </button>
            </>
          ) : tsStatus?.type === "error" ? (
            <>
              <div className="flex-1 flex items-center gap-2 px-3 py-1.5 rounded border border-red-300 dark:border-red-800 bg-red-500/5 text-sm text-red-600 dark:text-red-400">
                <span className="material-symbols-outlined text-sm">error</span>
                {tsStatus.message}
              </div>
              <Button size="sm" icon="vpn_lock" onClick={handleOpenTsModal}>
                Enable
              </Button>
            </>
          ) : (
            <Button
              size="sm"
              icon="vpn_lock"
              onClick={() => {
                onBeforeEnableTunnel?.();
                handleOpenTsModal();
              }}
              className="bg-linear-to-r from-indigo-500 to-purple-500 hover:from-indigo-600 hover:to-purple-600 text-white!"
            >
              Enable
            </Button>
          )}
        </div>
      </div>

      {/* Security warnings when tunnel or tailscale is active */}
      {(tunnelEnabled || tsEnabled) && (
        <div className="mt-4 flex flex-col gap-2">
          {!requireApiKey && (
            <SecurityWarning
              message="Require API key is disabled — your endpoint is publicly accessible without authentication."
              action={{ label: "Enable", href: "#require-api-key" }}
            />
          )}
          {tunnelDashboardAccess && (!requireLogin || !hasPassword) && (
            <SecurityWarning
              message={
                !requireLogin
                  ? "Require login is disabled — anyone can access your dashboard via tunnel."
                  : "Dashboard uses the default password — change it in Profile settings."
              }
              action={{
                label: !requireLogin ? "Enable" : "Change password",
                href: "/dashboard/profile",
              }}
            />
          )}
        </div>
      )}

      {/* Tunnel dashboard access option */}
      {(tunnelEnabled || tsEnabled) && (
        <div className="mt-4 pt-4 border-t border-border flex items-center gap-3">
          <Toggle
            checked={tunnelDashboardAccess}
            disabled={isLoginUnsafe && !tunnelDashboardAccess}
            onChange={() => onToggleDashboardAccess(!tunnelDashboardAccess)}
          />
          <div className="flex items-center gap-1.5">
            <p className="font-medium text-sm">Allow dashboard access via tunnel</p>
            <Tooltip
              text={
                isLoginUnsafe
                  ? `${unsafeReason} API & MITM traffic still work without dashboard access enabled.`
                  : "When enabled, the dashboard can be accessed through your tunnel or Tailscale URL (login still required). When disabled, dashboard access via tunnel/Tailscale is completely blocked."
              }
            />
          </div>
        </div>
      )}
    </Card>
  );
}

TunnelEndpointSection.propTypes = {
  currentEndpoint: PropTypes.string.isRequired,
  copied: PropTypes.string,
  onCopy: PropTypes.func.isRequired,
  cloudflare: PropTypes.shape({
    tunnelChecking: PropTypes.bool.isRequired,
    setTunnelChecking: PropTypes.func.isRequired,
    tunnelEnabled: PropTypes.bool.isRequired,
    tunnelReachable: PropTypes.bool.isRequired,
    tunnelUrl: PropTypes.string.isRequired,
    tunnelPublicUrl: PropTypes.string.isRequired,
    tunnelLoading: PropTypes.bool.isRequired,
    setTunnelLoading: PropTypes.func.isRequired,
    tunnelProgress: PropTypes.string.isRequired,
    setTunnelProgress: PropTypes.func.isRequired,
    tunnelStatus: PropTypes.object,
    setTunnelStatus: PropTypes.func.isRequired,
    tunnelEverReachable: PropTypes.bool.isRequired,
    setShowEnableTunnelModal: PropTypes.func.isRequired,
    setShowDisableTunnelModal: PropTypes.func.isRequired,
  }).isRequired,
  tailscale: PropTypes.shape({
    tsEnabled: PropTypes.bool.isRequired,
    tsReachable: PropTypes.bool.isRequired,
    tsUrl: PropTypes.string.isRequired,
    tsLoading: PropTypes.bool.isRequired,
    tsProgress: PropTypes.string.isRequired,
    tsStatus: PropTypes.object,
    setTsStatus: PropTypes.func.isRequired,
    tsAuthUrl: PropTypes.string.isRequired,
    tsAuthLabel: PropTypes.string.isRequired,
    tsConnecting: PropTypes.bool.isRequired,
    setTsConnecting: PropTypes.func.isRequired,
    setTsLoading: PropTypes.func.isRequired,
    setTsProgress: PropTypes.func.isRequired,
    tsEverReachable: PropTypes.bool.isRequired,
    setShowDisableTsModal: PropTypes.func.isRequired,
    clearUserAuth: PropTypes.func.isRequired,
    handleOpenTsModal: PropTypes.func.isRequired,
  }).isRequired,
  security: PropTypes.shape({
    requireLogin: PropTypes.bool.isRequired,
    hasPassword: PropTypes.bool.isRequired,
    isLoginUnsafe: PropTypes.bool.isRequired,
    unsafeReason: PropTypes.string.isRequired,
    requireApiKey: PropTypes.bool.isRequired,
    tunnelDashboardAccess: PropTypes.bool.isRequired,
    onToggleDashboardAccess: PropTypes.func.isRequired,
    onBeforeEnableTunnel: PropTypes.func,
  }).isRequired,
};
