"use client";

import { useState, useEffect } from "react";
import PropTypes from "prop-types";
import Modal from "@/shared/components/Modal";
import Input from "@/shared/components/Input";
import Button from "@/shared/components/Button";
import Badge from "@/shared/components/Badge";
import { isOpenAICompatibleProvider, isAnthropicCompatibleProvider, AI_PROVIDERS } from "@/shared/constants/providers";
import Select from "@/shared/components/Select";

export default function EditConnectionModal({ isOpen, connection, proxyPools, onSave, onClose }) {
  const [formData, setFormData] = useState({
    name: "",
    priority: 1,
    apiKey: "",
  });
  const [azureData, setAzureData] = useState({
    azureEndpoint: "",
    apiVersion: "2024-10-01-preview",
    deployment: "",
    organization: "",
  });
  const [cloudflareData, setCloudflareData] = useState({ accountId: "" });
  const [awsData, setAwsData] = useState({ profile: "", region: "", accessKeyId: "", sessionToken: "" });
  const [clearAwsSessionToken, setClearAwsSessionToken] = useState(false);
  const [region, setRegion] = useState("");
  const [disabledModels, setDisabledModels] = useState([]);
  const [newDisabledModelInput, setNewDisabledModelInput] = useState("");
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [validating, setValidating] = useState(false);
  const [validationResult, setValidationResult] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (connection) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setFormData({
        name: connection.name || "",
        priority: connection.priority || 1,
        apiKey: "",
      });
      // Load Azure-specific data if present
      if (connection.provider === "azure" && connection.providerSpecificData) {
        setAzureData({
          azureEndpoint: connection.providerSpecificData.azureEndpoint || "",
          apiVersion: connection.providerSpecificData.apiVersion || "2024-10-01-preview",
          deployment: connection.providerSpecificData.deployment || "",
          organization: connection.providerSpecificData.organization || "",
        });
      }
      if (connection.provider === "cloudflare-ai" && connection.providerSpecificData) {
        setCloudflareData({ accountId: connection.providerSpecificData.accountId || "" });
      }
      if (AI_PROVIDERS?.[connection.provider]?.credentialForm === "aws") {
        const psd = connection.providerSpecificData || {};
        setAwsData({
          profile: psd.profile || "",
          region: psd.region || "",
          accessKeyId: psd.accessKeyId || "",
          sessionToken: "",
        });
        setClearAwsSessionToken(false);
      }
      // Load region for providers that support it (e.g. xiaomi-tokenplan)
      const providerCfg = AI_PROVIDERS?.[connection.provider];
      if (providerCfg?.regions) {
        const savedRegion = connection.providerSpecificData?.region || providerCfg.defaultRegion || providerCfg.regions[0]?.id || "";
        setRegion(savedRegion);
      }
      // Load disabledModels
      const savedDisabled = connection.providerSpecificData?.disabledModels || [];
      setDisabledModels(Array.isArray(savedDisabled) ? [...savedDisabled] : []);
      setNewDisabledModelInput("");
      setTestResult(null);
      setValidationResult(null);
    }
  }, [connection, isOpen]);

  const isOAuth = connection?.authType === "oauth";
  const isAzure = connection?.provider === "azure";
  const isCloudflareAi = connection?.provider === "cloudflare-ai";
  const usesAwsCredentialForm = AI_PROVIDERS?.[connection?.provider]?.credentialForm === "aws";
  const isCompatible = connection
    ? (isOpenAICompatibleProvider(connection.provider) || isAnthropicCompatibleProvider(connection.provider))
    : false;
  const providerRegions = connection ? (AI_PROVIDERS?.[connection.provider]?.regions || null) : null;

  // Build providerSpecificData for region-aware providers
  const buildRegionSpecificData = () => {
    if (providerRegions && region) return { ...((connection?.providerSpecificData) || {}), region };
    return undefined;
  };

  // The server keeps a saved session token when this password field is blank. Other empty
  // fields still clear their saved values so a profile can be switched to static keys.
  const buildAwsSpecificData = () => ({
    profile: awsData.profile.trim(),
    region: awsData.region.trim(),
    accessKeyId: awsData.accessKeyId.trim(),
    sessionToken: clearAwsSessionToken ? null : awsData.sessionToken.trim(),
  });

  const handleTest = async () => {
    if (!connection?.provider) return;
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch(`/api/providers/${connection.id}/test`, { method: "POST" });
      const data = await res.json();
      setTestResult(data.valid ? "success" : "failed");
    } catch {
      setTestResult("failed");
    } finally {
      setTesting(false);
    }
  };

  const handleValidate = async () => {
    if (!connection?.provider || !formData.apiKey) return;
    setValidating(true);
    setValidationResult(null);
    try {
      const res = await fetch("/api/providers/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: connection.provider,
          apiKey: formData.apiKey,
          ...(isAzure ? { providerSpecificData: azureData } : {}),
          ...(isCloudflareAi ? { providerSpecificData: cloudflareData } : {}),
          ...(usesAwsCredentialForm ? { providerSpecificData: buildAwsSpecificData() } : {}),
          ...(providerRegions ? { providerSpecificData: buildRegionSpecificData() } : {}),
        }),
      });
      const data = await res.json();
      setValidationResult(data.valid ? "success" : "failed");
    } catch {
      setValidationResult("failed");
    } finally {
      setValidating(false);
    }
  };

  const handleSubmit = async () => {
    if (!connection) return;
    setSaving(true);
    try {
      const updates = {
        name: formData.name,
        priority: formData.priority,
      };
      if (!isOAuth && formData.apiKey) {
        updates.apiKey = formData.apiKey;
        let isValid = validationResult === "success";
        if (!isValid) {
          try {
            setValidating(true);
            setValidationResult(null);
            const res = await fetch("/api/providers/validate", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                provider: connection.provider,
                apiKey: formData.apiKey,
                ...(isAzure ? { providerSpecificData: azureData } : {}),
                ...(isCloudflareAi ? { providerSpecificData: cloudflareData } : {}),
                ...(usesAwsCredentialForm ? { providerSpecificData: buildAwsSpecificData() } : {}),
                ...(providerRegions ? { providerSpecificData: buildRegionSpecificData() } : {}),
              }),
            });
            const data = await res.json();
            isValid = !!data.valid;
            setValidationResult(isValid ? "success" : "failed");
          } catch {
            setValidationResult("failed");
          } finally {
            setValidating(false);
          }
        }
        if (isValid) {
          updates.testStatus = "active";
          updates.lastError = null;
          updates.lastErrorAt = null;
        }
      }
      
      // Add Azure-specific data if this is an Azure connection
      if (isAzure) {
        updates.providerSpecificData = {
          azureEndpoint: azureData.azureEndpoint,
          apiVersion: azureData.apiVersion,
          deployment: azureData.deployment,
          organization: azureData.organization,
        };
      }
      if (isCloudflareAi) {
        updates.providerSpecificData = { accountId: cloudflareData.accountId };
      }
      if (usesAwsCredentialForm) {
        updates.providerSpecificData = buildAwsSpecificData();
      }
      // Persist updated region for region-aware providers
      if (providerRegions && region) {
        updates.providerSpecificData = buildRegionSpecificData();
      }

      // Merge disabled models into providerSpecificData
      updates.providerSpecificData = {
        ...(connection.providerSpecificData || {}),
        ...(updates.providerSpecificData || {}),
        disabledModels: disabledModels.map((m) => m.trim()).filter(Boolean),
      };
      
      await onSave(updates);
    } finally {
      setSaving(false);
    }
  };

  if (!connection) return null;

  return (
    <Modal isOpen={isOpen} title="Edit Connection" onClose={onClose}>
      <div className="flex flex-col gap-4">
        <Input
          label="Name"
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          placeholder={isOAuth ? "Account name" : "Production Key"}
        />
        {isOAuth && connection.email && (
          <div className="bg-sidebar/50 p-3 rounded-lg">
            <p className="text-sm text-text-muted mb-1">Email</p>
            <p className="font-medium">{connection.email}</p>
          </div>
        )}
        <Input
          label="Priority"
          type="number"
          value={formData.priority}
          onChange={(e) => setFormData({ ...formData, priority: Number.parseInt(e.target.value, 10) || 1 })}
        />

        {!isOAuth && (
          <>
            <div className="flex gap-2">
              <Input
                label="API Key"
                type="password"
                value={formData.apiKey}
                onChange={(e) => setFormData({ ...formData, apiKey: e.target.value })}
                placeholder="Enter new API key"
                hint="Leave blank to keep the current API key."
                className="flex-1"
              />
              <div className="pt-6">
                <Button onClick={handleValidate} disabled={!formData.apiKey || validating || saving} variant="secondary">
                  {validating ? "Checking..." : "Check"}
                </Button>
              </div>
            </div>
            {validationResult && (
              <Badge variant={validationResult === "success" ? "success" : "error"}>
                {validationResult === "success" ? "Valid" : "Invalid"}
              </Badge>
            )}
          </>
        )}

        {isAzure && (
          <div className="bg-sidebar/50 p-4 rounded-lg border border-accent/20">
            <h3 className="font-semibold mb-3 text-sm">Azure OpenAI Configuration</h3>
            <div className="flex flex-col gap-3">
              <Input
                label="Azure Endpoint"
                value={azureData.azureEndpoint}
                onChange={(e) => setAzureData({ ...azureData, azureEndpoint: e.target.value })}
                placeholder="https://your-resource.openai.azure.com"
                hint="Your Azure OpenAI resource endpoint URL"
              />
              <Input
                label="Deployment Name"
                value={azureData.deployment}
                onChange={(e) => setAzureData({ ...azureData, deployment: e.target.value })}
                placeholder="gpt-4"
                hint="The deployment name in your Azure resource"
              />
              <Input
                label="API Version"
                value={azureData.apiVersion}
                onChange={(e) => setAzureData({ ...azureData, apiVersion: e.target.value })}
                placeholder="2024-10-01-preview"
                hint="Azure OpenAI API version to use"
              />
              <Input
                label="Organization"
                value={azureData.organization}
                onChange={(e) => setAzureData({ ...azureData, organization: e.target.value })}
                placeholder="Organization ID"
                hint="Required for billing"
              />
            </div>
          </div>
        )}

        {usesAwsCredentialForm && (
          <div className="bg-sidebar/50 p-4 rounded-lg border border-accent/20">
            <h3 className="font-semibold mb-3 text-sm">AWS Bedrock Credentials</h3>
            <div className="flex flex-col gap-3">
              <Input
                label="AWS Profile (SSO — recommended)"
                value={awsData.profile}
                onChange={(e) => setAwsData({ ...awsData, profile: e.target.value })}
                placeholder="my-sso-profile"
                hint="Clear this to use static keys instead; a profile takes precedence."
              />
              <Input
                label="Region"
                value={awsData.region}
                onChange={(e) => setAwsData({ ...awsData, region: e.target.value })}
                placeholder="us-east-1"
              />
              <Input
                label="Access Key ID (only for static keys)"
                value={awsData.accessKeyId}
                onChange={(e) => setAwsData({ ...awsData, accessKeyId: e.target.value })}
                placeholder="AKIA..."
              />
              <Input
                label="Session Token (only for temporary ASIA… keys)"
                type="password"
                value={awsData.sessionToken}
                onChange={(e) => setAwsData({ ...awsData, sessionToken: e.target.value })}
                placeholder="FwoGZXIvYXdz..."
                hint="Leave blank to keep the saved token. Enter a new token to replace it."
                disabled={clearAwsSessionToken}
              />
              <label className="flex items-center gap-2 text-sm text-text-muted">
                <input
                  type="checkbox"
                  checked={clearAwsSessionToken}
                  onChange={(e) => {
                    setClearAwsSessionToken(e.target.checked);
                    if (e.target.checked) setAwsData({ ...awsData, sessionToken: "" });
                  }}
                />
                Remove saved session token
              </label>
            </div>
          </div>
        )}

        {providerRegions && (
          <Select
            label="Region"
            value={region}
            onChange={(e) => setRegion(e.target.value)}
            options={providerRegions.map((r) => ({ value: r.id, label: r.label }))}
          />
        )}

        {/* Disabled Models per Account */}
        <div className="rounded-xl border border-black/10 dark:border-white/10 bg-black/[0.02] dark:bg-white/[0.02] p-3 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="text-xs font-bold text-text-primary">Chặn Model trên tài khoản này</p>
              <p className="text-[11px] text-text-muted">
                Các model trong danh sách này sẽ không bao giờ được gửi vào tài khoản này (ví dụ tài khoản bị Google chặn Argon 4).
              </p>
            </div>
          </div>

          {/* Quick Suggestions for Antigravity or common models */}
          <div className="flex flex-wrap items-center gap-1.5 pt-1">
            <span className="text-[10.5px] text-text-muted">Gợi ý nhanh:</span>
            {["gemini-4-neon", "gemini-4-argon", "gemini-4-hydrogen-high", "claude-3-7-sonnet"].map((mId) => {
              const isBlocked = disabledModels.includes(mId);
              return (
                <button
                  key={mId}
                  type="button"
                  onClick={() => {
                    if (isBlocked) {
                      setDisabledModels(disabledModels.filter((m) => m !== mId));
                    } else {
                      setDisabledModels([...disabledModels, mId]);
                    }
                  }}
                  className={`text-[10px] px-2 py-0.5 rounded-full border transition-all cursor-pointer ${
                    isBlocked
                      ? "border-rose-500/40 bg-rose-500/15 text-rose-600 dark:text-rose-400 font-semibold"
                      : "border-black/10 dark:border-white/10 text-text-muted hover:text-text-primary hover:bg-black/5 dark:hover:bg-white/5"
                  }`}
                >
                  {isBlocked ? `✕ Chặn ${mId}` : `+ Chặn ${mId}`}
                </button>
              );
            })}
          </div>

          {/* Active Blocked Chips */}
          {disabledModels.length > 0 ? (
            <div className="flex flex-wrap items-center gap-1.5 pt-1.5">
              {disabledModels.map((m) => (
                <span
                  key={m}
                  className="inline-flex items-center gap-1 rounded-lg border border-rose-500/30 bg-rose-500/10 px-2 py-0.5 text-xs font-semibold text-rose-600 dark:text-rose-400"
                >
                  <span>{m}</span>
                  <button
                    type="button"
                    onClick={() => setDisabledModels(disabledModels.filter((item) => item !== m))}
                    className="size-3.5 flex items-center justify-center rounded-full hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 cursor-pointer"
                    title={`Bỏ chặn ${m}`}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          ) : (
            <p className="text-[11px] text-text-muted italic pt-1">Chưa chặn model nào trên tài khoản này.</p>
          )}

          {/* Add custom model input */}
          <div className="flex items-center gap-1.5 pt-1">
            <input
              type="text"
              value={newDisabledModelInput}
              onChange={(e) => setNewDisabledModelInput(e.target.value)}
              placeholder="Nhập mã model để chặn (ví dụ: gemini-4-argon)..."
              className="flex-1 h-7 rounded-lg border border-black/10 dark:border-white/10 bg-white/70 dark:bg-white/[0.04] px-2.5 text-xs text-text-primary placeholder:text-text-muted outline-none focus:border-primary/50"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  const val = newDisabledModelInput.trim();
                  if (val && !disabledModels.includes(val)) {
                    setDisabledModels([...disabledModels, val]);
                    setNewDisabledModelInput("");
                  }
                }
              }}
            />
            <Button
              size="xs"
              variant="secondary"
              onClick={() => {
                const val = newDisabledModelInput.trim();
                if (val && !disabledModels.includes(val)) {
                  setDisabledModels([...disabledModels, val]);
                  setNewDisabledModelInput("");
                }
              }}
            >
              Thêm
            </Button>
          </div>
        </div>

        {!isCompatible && !isAzure && !isCloudflareAi && (
          <div className="flex items-center gap-3">
            <Button onClick={handleTest} variant="secondary" disabled={testing}>
              {testing ? "Testing..." : "Test Connection"}
            </Button>
            {testResult && (
              <Badge variant={testResult === "success" ? "success" : "error"}>
                {testResult === "success" ? "Valid" : "Failed"}
              </Badge>
            )}
          </div>
        )}

        <div className="flex gap-2">
          <Button onClick={handleSubmit} fullWidth disabled={saving}>{saving ? "Saving..." : "Save"}</Button>
          <Button onClick={onClose} variant="ghost" fullWidth>Cancel</Button>
        </div>
      </div>
    </Modal>
  );
}

EditConnectionModal.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  connection: PropTypes.shape({
    id: PropTypes.string,
    name: PropTypes.string,
    email: PropTypes.string,
    priority: PropTypes.number,
    authType: PropTypes.string,
    provider: PropTypes.string,
    providerSpecificData: PropTypes.object,
  }),
  proxyPools: PropTypes.arrayOf(PropTypes.shape({
    id: PropTypes.string,
    name: PropTypes.string,
  })),
  onSave: PropTypes.func.isRequired,
  onClose: PropTypes.func.isRequired,
};
