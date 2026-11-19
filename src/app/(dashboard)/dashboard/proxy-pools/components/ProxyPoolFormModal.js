"use client";

import { Button, Input, Modal, Toggle } from "@/shared/components";

export default function ProxyPoolFormModal({
  isOpen = false,
  isEdit = false,
  formData = {},
  onChange,
  onSave,
  onClose,
  saving = false,
}) {
  return (
    <Modal
      isOpen={isOpen}
      title={isEdit ? "Edit Proxy Pool" : "Add Proxy Pool"}
      onClose={onClose}
    >
      <div className="flex flex-col gap-4">
        <Input
          label="Name"
          value={formData.name || ""}
          onChange={(e) => onChange?.("name", e.target.value)}
          placeholder="Office Proxy"
        />
        <Input
          label="Proxy URL"
          value={formData.proxyUrl || ""}
          onChange={(e) => onChange?.("proxyUrl", e.target.value)}
          placeholder="http://127.0.0.1:7897"
        />
        <Input
          label="No Proxy"
          value={formData.noProxy || ""}
          onChange={(e) => onChange?.("noProxy", e.target.value)}
          placeholder="localhost,127.0.0.1,.internal"
          hint="Comma-separated hosts/domains to bypass proxy"
        />

        <div className="flex flex-col gap-3 rounded-lg border border-border/50 p-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-medium">Active</p>
            <p className="text-xs text-text-muted">
              Inactive pools are ignored by runtime resolution.
            </p>
          </div>
          <Toggle
            checked={formData.isActive === true}
            onChange={() => onChange?.("isActive", !formData.isActive)}
            disabled={saving}
          />
        </div>

        <div className="flex flex-col gap-3 rounded-lg border border-border/50 p-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-medium">Strict Proxy</p>
            <p className="text-xs text-text-muted">
              Fail request if proxy is unreachable instead of falling back to direct.
            </p>
          </div>
          <Toggle
            checked={formData.strictProxy === true}
            onChange={() => onChange?.("strictProxy", !formData.strictProxy)}
            disabled={saving}
          />
        </div>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <Button
            fullWidth
            onClick={onSave}
            disabled={!formData.name?.trim() || !formData.proxyUrl?.trim() || saving}
          >
            {saving ? "Saving..." : "Save"}
          </Button>
          <Button fullWidth variant="ghost" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
        </div>
      </div>
    </Modal>
  );
}
