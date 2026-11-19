"use client";

import PropTypes from "prop-types";
import { Card, Button, Input, Modal, Toggle } from "@/shared/components";
import SecurityWarning from "./SecurityWarning";
import KeyAccessControls from "./KeyAccessControls";

export default function ApiKeysCard({
  keys,
  visibleKeys,
  maskKey,
  toggleKeyVisibility,
  copy,
  copied,
  requireApiKey,
  onToggleRequireApiKey,
  isRemoteHost,
  showAddModal,
  setShowAddModal,
  newKeyName,
  setNewKeyName,
  handleCreateKey,
  createdKey,
  setCreatedKey,
  handleDeleteKey,
  handleToggleKey,
  handleUpdateKeyAccess,
  onRequestConfirm,
}) {
  return (
    <>
      <Card id="require-api-key">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <span className="material-symbols-outlined text-primary">
              vpn_key
            </span>
            API Keys
          </h2>
          <Button icon="add" onClick={() => setShowAddModal(true)}>
            Create Key
          </Button>
        </div>

        <div className="flex items-center justify-between pb-4 mb-4 border-b border-border">
          <div>
            <p className="font-medium">Require API key</p>
            <p className="text-sm text-text-muted">
              Requests without a valid key will be rejected
            </p>
          </div>
          <Toggle
            checked={requireApiKey}
            onChange={() => onToggleRequireApiKey(!requireApiKey)}
          />
        </div>

        {isRemoteHost && !requireApiKey && (
          <div className="mb-4 -mt-2">
            <SecurityWarning message="Endpoint is exposed without an API key." />
          </div>
        )}

        {keys.length === 0 ? (
          <div className="text-center py-12">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 text-primary mb-4">
              <span className="material-symbols-outlined text-[32px]">
                vpn_key
              </span>
            </div>
            <p className="text-text-main font-medium mb-1">No API keys yet</p>
            <p className="text-sm text-text-muted mb-4">
              Create your first API key to get started
            </p>
            <Button icon="add" onClick={() => setShowAddModal(true)}>
              Create Key
            </Button>
          </div>
        ) : (
          <div className="flex flex-col">
            {keys.map((key) => (
              <div
                key={key.id}
                className={`group flex items-start justify-between gap-3 py-3 border-b border-black/[0.03] dark:border-white/[0.03] last:border-b-0 ${
                  key.isActive === false ? "opacity-60" : ""
                }`}
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{key.name}</p>
                  <div className="flex items-center gap-2 mt-1 min-w-0 flex-wrap">
                    <code className="text-xs text-text-muted font-mono break-all min-w-0">
                      {visibleKeys.has(key.id) ? key.key : maskKey(key.key)}
                    </code>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => toggleKeyVisibility(key.id)}
                        className="p-1 hover:bg-black/5 dark:hover:bg-white/5 rounded text-text-muted hover:text-primary transition-all"
                        title={
                          visibleKeys.has(key.id) ? "Hide key" : "Show key"
                        }
                      >
                        <span className="material-symbols-outlined text-[14px]">
                          {visibleKeys.has(key.id)
                            ? "visibility_off"
                            : "visibility"}
                        </span>
                      </button>
                      <button
                        onClick={() => copy(key.key, key.id)}
                        className="p-1 hover:bg-black/5 dark:hover:bg-white/5 rounded text-text-muted hover:text-primary transition-all"
                      >
                        <span className="material-symbols-outlined text-[14px]">
                          {copied === key.id ? "check" : "content_copy"}
                        </span>
                      </button>
                    </div>
                  </div>
                  <p className="text-xs text-text-muted mt-1">
                    Created {new Date(key.createdAt).toLocaleDateString()}
                  </p>
                  {key.isActive === false && (
                    <p className="text-xs text-orange-500 mt-1">Paused</p>
                  )}
                  <KeyAccessControls
                    apiKey={key}
                    onChange={(access) => handleUpdateKeyAccess(key.id, access)}
                    onRequestRestrict={() =>
                      onRequestConfirm({
                        title: "Restrict API Key",
                        message: `Restrict API key "${key.name}"?\n\nIt will only be able to call the combos and models you add. Until you add one, it can call nothing.`,
                        onConfirm: async () => {
                          onRequestConfirm(null);
                          handleUpdateKeyAccess(key.id, {
                            restricted: true,
                            allow: key.access?.allow || [],
                          });
                        },
                      })
                    }
                  />
                </div>
                <div className="flex items-center gap-2 shrink-0 pt-0.5">
                  <Toggle
                    size="sm"
                    checked={key.isActive ?? true}
                    onChange={(checked) => {
                      if (key.isActive && !checked) {
                        onRequestConfirm({
                          title: "Pause API Key",
                          message: `Pause API key "${key.name}"?\n\nThis key will stop working immediately but can be resumed later.`,
                          onConfirm: async () => {
                            onRequestConfirm(null);
                            handleToggleKey(key.id, checked);
                          },
                        });
                      } else {
                        handleToggleKey(key.id, checked);
                      }
                    }}
                    title={key.isActive ? "Pause key" : "Resume key"}
                  />
                  <button
                    onClick={() => handleDeleteKey(key.id)}
                    className="p-2 hover:bg-red-500/10 rounded text-red-500 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-all"
                  >
                    <span className="material-symbols-outlined text-[18px]">
                      delete
                    </span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Add Key Modal */}
      <Modal
        isOpen={showAddModal}
        title="Create API Key"
        onClose={() => {
          setShowAddModal(false);
          setNewKeyName("");
        }}
      >
        <div className="flex flex-col gap-4">
          <Input
            label="Key Name"
            value={newKeyName}
            onChange={(e) => setNewKeyName(e.target.value)}
            placeholder="Production Key"
          />
          <div className="flex gap-2">
            <Button
              onClick={handleCreateKey}
              fullWidth
              disabled={!newKeyName.trim()}
            >
              Create
            </Button>
            <Button
              onClick={() => {
                setShowAddModal(false);
                setNewKeyName("");
              }}
              variant="ghost"
              fullWidth
            >
              Cancel
            </Button>
          </div>
        </div>
      </Modal>

      {/* Created Key Modal */}
      <Modal
        isOpen={!!createdKey}
        title="API Key Created"
        onClose={() => setCreatedKey(null)}
      >
        <div className="flex flex-col gap-4">
          <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
            <p className="text-sm text-yellow-800 dark:text-yellow-200 mb-2 font-medium">
              Save this key now!
            </p>
            <p className="text-sm text-yellow-700 dark:text-yellow-300">
              Store this key securely. You can view or copy it later from the API Keys list.
            </p>
          </div>
          <div className="flex gap-2">
            <Input
              value={createdKey || ""}
              readOnly
              className="flex-1 font-mono text-sm"
            />
            <Button
              variant="secondary"
              icon={copied === "created_key" ? "check" : "content_copy"}
              onClick={() => copy(createdKey, "created_key")}
            >
              {copied === "created_key" ? "Copied!" : "Copy"}
            </Button>
          </div>
          <Button onClick={() => setCreatedKey(null)} fullWidth>
            Done
          </Button>
        </div>
      </Modal>
    </>
  );
}

ApiKeysCard.propTypes = {
  keys: PropTypes.arrayOf(PropTypes.object).isRequired,
  visibleKeys: PropTypes.object.isRequired,
  maskKey: PropTypes.func.isRequired,
  toggleKeyVisibility: PropTypes.func.isRequired,
  copy: PropTypes.func.isRequired,
  copied: PropTypes.string,
  requireApiKey: PropTypes.bool.isRequired,
  onToggleRequireApiKey: PropTypes.func.isRequired,
  isRemoteHost: PropTypes.bool.isRequired,
  showAddModal: PropTypes.bool.isRequired,
  setShowAddModal: PropTypes.func.isRequired,
  newKeyName: PropTypes.string.isRequired,
  setNewKeyName: PropTypes.func.isRequired,
  handleCreateKey: PropTypes.func.isRequired,
  createdKey: PropTypes.string,
  setCreatedKey: PropTypes.func.isRequired,
  handleDeleteKey: PropTypes.func.isRequired,
  handleToggleKey: PropTypes.func.isRequired,
  handleUpdateKeyAccess: PropTypes.func.isRequired,
  onRequestConfirm: PropTypes.func.isRequired,
};
