"use client";

import PropTypes from "prop-types";
import { Button, Modal } from "@/shared/components";
import { TUNNEL_BENEFITS } from "../endpointConstants";
import StatusAlert from "./StatusAlert";

export default function TunnelModals({ cloudflare, tailscale }) {
  const {
    showEnableTunnelModal,
    setShowEnableTunnelModal,
    handleEnableTunnel,
    showDisableTunnelModal,
    setShowDisableTunnelModal,
    handleDisableTunnel,
    tunnelLoading,
  } = cloudflare;

  const {
    showTsModal,
    setShowTsModal,
    tsInstalled,
    tsInstalling,
    tsInstallLog,
    tsLogRef,
    tsStatus,
    setTsSudoPassword,
    setTsStatus,
    handleInstallTailscale,
    handleConnectTailscale,
    showDisableTsModal,
    setShowDisableTsModal,
    handleDisableTailscale,
    tsLoading,
  } = tailscale;

  return (
    <>
      {/* Enable Cloudflare Tunnel Modal */}
      <Modal
        isOpen={showEnableTunnelModal}
        title="Enable Tunnel"
        onClose={() => setShowEnableTunnelModal(false)}
      >
        <div className="flex flex-col gap-4">
          <div className="bg-surface-2 border border-border-subtle rounded-lg p-4">
            <div className="flex items-start gap-3">
              <span className="material-symbols-outlined text-primary">
                cloud_upload
              </span>
              <div>
                <p className="text-sm text-text-main font-medium mb-1">
                  Cloudflare Tunnel
                </p>
                <p className="text-sm text-text-muted">
                  Expose your local 9Router to the internet. No port forwarding,
                  no static IP needed. Share endpoint URL with your team or use
                  it in Cursor, Cline, and other AI tools from anywhere.
                </p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {TUNNEL_BENEFITS.map((benefit) => (
              <div
                key={benefit.title}
                className="flex flex-col items-center text-center p-3 rounded-lg bg-sidebar/50"
              >
                <span className="material-symbols-outlined text-xl text-primary mb-1">
                  {benefit.icon}
                </span>
                <p className="text-xs font-semibold">{benefit.title}</p>
                <p className="text-xs text-text-muted">{benefit.desc}</p>
              </div>
            ))}
          </div>

          <p className="text-xs text-text-muted">
            Requires outbound port 7844 (TCP/UDP). Connection may take 10-30s.
          </p>

          <div className="flex gap-2">
            <Button onClick={handleEnableTunnel} fullWidth>
              Start Tunnel
            </Button>
            <Button
              onClick={() => setShowEnableTunnelModal(false)}
              variant="ghost"
              fullWidth
            >
              Cancel
            </Button>
          </div>
        </div>
      </Modal>

      {/* Disable Cloudflare Tunnel Modal */}
      <Modal
        isOpen={showDisableTunnelModal}
        title="Disable Tunnel"
        onClose={() => !tunnelLoading && setShowDisableTunnelModal(false)}
      >
        <div className="flex flex-col gap-4">
          <p className="text-sm text-text-muted">
            The Cloudflare tunnel will be disconnected. Remote access via tunnel
            URL will stop working.
          </p>
          <div className="flex gap-2">
            <Button
              onClick={handleDisableTunnel}
              fullWidth
              disabled={tunnelLoading}
              variant="danger"
            >
              {tunnelLoading ? "Disabling..." : "Disable"}
            </Button>
            <Button
              onClick={() => setShowDisableTunnelModal(false)}
              variant="ghost"
              fullWidth
              disabled={tunnelLoading}
            >
              Cancel
            </Button>
          </div>
        </div>
      </Modal>

      {/* Tailscale Modal */}
      <Modal
        isOpen={showTsModal}
        title="Tailscale Funnel"
        onClose={() => {
          if (!tsInstalling) {
            setShowTsModal(false);
            setTsSudoPassword("");
            setTsStatus(null);
          }
        }}
      >
        <div className="flex flex-col gap-4">
          {/* Checking state */}
          {tsInstalled === null && (
            <p className="text-sm text-text-muted flex items-center gap-2">
              <span className="material-symbols-outlined animate-spin text-sm">
                progress_activity
              </span>
              Checking...
            </p>
          )}

          {/* Not installed */}
          {tsInstalled === false && !tsInstalling && (
            <div className="flex flex-col gap-3">
              <p className="text-sm text-text-muted">
                Tailscale is not installed. Install it to enable Funnel.
              </p>
              <div className="flex gap-2">
                <Button onClick={handleInstallTailscale} fullWidth>
                  Install Tailscale
                </Button>
                <Button
                  onClick={() => setShowTsModal(false)}
                  variant="ghost"
                  fullWidth
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}

          {/* Installing with progress log */}
          {tsInstalling && (
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2 text-sm text-text-muted">
                <span className="material-symbols-outlined animate-spin text-sm">
                  progress_activity
                </span>
                Installing Tailscale...
              </div>
              {tsInstallLog.length > 0 && (
                <div
                  ref={tsLogRef}
                  className="bg-black/5 dark:bg-white/5 rounded p-2 max-h-40 overflow-y-auto font-mono text-xs text-text-muted"
                >
                  {tsInstallLog.map((line, i) => (
                    <div key={i}>{line}</div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Installed: show Connect button */}
          {tsInstalled === true && !tsInstalling && (
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
                <span className="material-symbols-outlined text-[16px]">
                  check_circle
                </span>
                Tailscale installed
              </div>
              <div className="flex gap-2">
                <Button onClick={() => handleConnectTailscale()} fullWidth>
                  Connect
                </Button>
                <Button
                  onClick={() => setShowTsModal(false)}
                  variant="ghost"
                  fullWidth
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}

          {tsStatus && <StatusAlert status={tsStatus} />}
        </div>
      </Modal>

      {/* Disable Tailscale Modal */}
      <Modal
        isOpen={showDisableTsModal}
        title="Disable Tailscale"
        onClose={() => !tsLoading && setShowDisableTsModal(false)}
      >
        <div className="flex flex-col gap-4">
          <p className="text-sm text-text-muted">
            Tailscale Funnel will be stopped. Remote access via Tailscale URL
            will stop working.
          </p>
          <div className="flex gap-2">
            <Button
              onClick={handleDisableTailscale}
              fullWidth
              disabled={tsLoading}
              variant="danger"
            >
              {tsLoading ? "Disabling..." : "Disable"}
            </Button>
            <Button
              onClick={() => setShowDisableTsModal(false)}
              variant="ghost"
              fullWidth
              disabled={tsLoading}
            >
              Cancel
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}

TunnelModals.propTypes = {
  cloudflare: PropTypes.shape({
    showEnableTunnelModal: PropTypes.bool.isRequired,
    setShowEnableTunnelModal: PropTypes.func.isRequired,
    handleEnableTunnel: PropTypes.func.isRequired,
    showDisableTunnelModal: PropTypes.bool.isRequired,
    setShowDisableTunnelModal: PropTypes.func.isRequired,
    handleDisableTunnel: PropTypes.func.isRequired,
    tunnelLoading: PropTypes.bool.isRequired,
  }).isRequired,
  tailscale: PropTypes.shape({
    showTsModal: PropTypes.bool.isRequired,
    setShowTsModal: PropTypes.func.isRequired,
    tsInstalled: PropTypes.bool,
    tsInstalling: PropTypes.bool.isRequired,
    tsInstallLog: PropTypes.arrayOf(PropTypes.string).isRequired,
    tsLogRef: PropTypes.object.isRequired,
    tsStatus: PropTypes.object,
    setTsSudoPassword: PropTypes.func.isRequired,
    setTsStatus: PropTypes.func.isRequired,
    handleInstallTailscale: PropTypes.func.isRequired,
    handleConnectTailscale: PropTypes.func.isRequired,
    showDisableTsModal: PropTypes.bool.isRequired,
    setShowDisableTsModal: PropTypes.func.isRequired,
    handleDisableTailscale: PropTypes.func.isRequired,
    tsLoading: PropTypes.bool.isRequired,
  }).isRequired,
};
