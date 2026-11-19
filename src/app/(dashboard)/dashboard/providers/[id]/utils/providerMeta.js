import {
  OAUTH_PROVIDERS,
  APIKEY_PROVIDERS,
  FREE_PROVIDERS,
  FREE_TIER_PROVIDERS,
  WEB_COOKIE_PROVIDERS,
  getProviderAlias,
  isOpenAICompatibleProvider,
  isAnthropicCompatibleProvider,
} from "@/shared/constants/providers";

export const MCODE_LEASE_PROVIDERS = new Set(["minimax-code", "minimax-code-global"]);

// Providers whose registry list is only an offline fallback: the dashboard
// renders the live per-connection catalog from GET /api/providers/[id]/models
// when one resolves, and falls back to the static rows otherwise.
export const LIVE_MODEL_CATALOG_PROVIDERS = new Set(["cursor", "zed", "claude", "commandcode"]);

export const AUTO_PING_SETTINGS_KEYS = {
  claude: "claudeAutoPing",
  codex: "codexAutoPing",
};

/**
 * Derive normalized provider metadata, auth capabilities, and aliases for a provider detail route.
 * @param {string} providerId
 * @param {object | null} providerNode
 */
export function getProviderMeta(providerId, providerNode) {
  const providerInfo = providerNode
    ? {
        id: providerNode.id,
        name:
          providerNode.name ||
          (providerNode.type === "anthropic-compatible" ? "Anthropic Compatible" : "OpenAI Compatible"),
        color: providerNode.type === "anthropic-compatible" ? "#D97757" : "#10A37F",
        textIcon: providerNode.type === "anthropic-compatible" ? "AC" : "OC",
        apiType: providerNode.apiType,
        baseUrl: providerNode.baseUrl,
        type: providerNode.type,
      }
    : OAUTH_PROVIDERS[providerId] ||
      APIKEY_PROVIDERS[providerId] ||
      FREE_PROVIDERS[providerId] ||
      FREE_TIER_PROVIDERS[providerId] ||
      WEB_COOKIE_PROVIDERS[providerId];

  const authModes = providerInfo?.authModes || [];
  const isOAuth = !!OAUTH_PROVIDERS[providerId] || !!FREE_PROVIDERS[providerId] || authModes.includes("oauth");
  const supportsApiKeyAuth = !!APIKEY_PROVIDERS[providerId] || authModes.includes("apikey");
  const isFreeNoAuth = !!FREE_PROVIDERS[providerId]?.noAuth;
  const providerAlias = getProviderAlias(providerId);

  const isOpenAICompatible = isOpenAICompatibleProvider(providerId);
  const isAnthropicCompatible = isAnthropicCompatibleProvider(providerId);
  const isCompatible = isOpenAICompatible || isAnthropicCompatible;
  const hasDualAuthModes = !isCompatible && isOAuth && supportsApiKeyAuth;

  const oauthConnectionLabel =
    providerId === "xai"
      ? "Grok Build OAuth"
      : providerId === "grok-cli"
        ? "Grok CLI Device Login"
        : providerId === "kimi"
          ? "Kimi Coding OAuth"
          : "OAuth";

  const apiKeyConnectionLabel =
    providerId === "xai"
      ? "xAI API Key"
      : providerId === "kimi"
        ? "Kimi API Key"
        : providerId === "qoder" || providerId === "qoder-cn"
          ? "PAT"
          : "API Key";

  const providerStorageAlias = isCompatible ? providerId : providerAlias;
  const providerDisplayAlias = isCompatible ? providerNode?.prefix || providerId : providerAlias;

  return {
    providerInfo,
    authModes,
    isOAuth,
    supportsApiKeyAuth,
    isFreeNoAuth,
    providerAlias,
    isOpenAICompatible,
    isAnthropicCompatible,
    isCompatible,
    hasDualAuthModes,
    oauthConnectionLabel,
    apiKeyConnectionLabel,
    providerStorageAlias,
    providerDisplayAlias,
  };
}
