import { v4 as uuidv4 } from "uuid";
import { KIRO_CODEWHISPERER_TARGET } from "../../config/kiroConstants.js";
import { refreshKiroToken } from "../../services/tokenRefresh.js";

// Regions per service host; a region outside the set is never spliced into the hostname.
export const KIRO_SERVICE_REGIONS = {
  q: new Set(["us-east-1", "eu-central-1"]),
  runtime: new Set(["us-east-1", "eu-central-1"]),
  codewhisperer: new Set(["us-east-1"]),
};

export function buildAuthHeaders(configHeaders = {}, credentials, stream = true, url = "") {
  const headers = {
    ...configHeaders,
    "Amz-Sdk-Request": "attempt=1; max=3",
    "Amz-Sdk-Invocation-Id": uuidv4()
  };
  if (url.includes("://codewhisperer.")) {
    headers["X-Amz-Target"] = KIRO_CODEWHISPERER_TARGET;
  } else {
    delete headers["X-Amz-Target"];
  }

  // API-key auth: the key is stored as accessToken and sent as a bearer token
  // exactly like an OAuth access token, but with an extra `tokentype: API_KEY`
  // header so CodeWhisperer treats it as a long-lived API key rather than an
  // OIDC/social access token. Mirrors the Kiro IDE headless-auth behavior.
  // Enterprise / Microsoft Entra (external_idp) tokens are OAuth access tokens,
  // but CodeWhisperer requires TokenType=EXTERNAL_IDP to bind them to profiles.
  const authMethod = credentials?.providerSpecificData?.authMethod;
  const isApiKey = authMethod === "api_key";
  const isExternalIdp = authMethod === "external_idp";

  const apiKey = credentials?.apiKey || (isApiKey ? credentials?.accessToken : null);
  if (isApiKey && apiKey) {
    headers["Authorization"] = `Bearer ${apiKey}`;
    headers["TokenType"] = "API_KEY";
  } else if (credentials?.accessToken) {
    headers["Authorization"] = `Bearer ${credentials.accessToken}`;
    if (isExternalIdp) {
      headers["TokenType"] = "EXTERNAL_IDP";
    }
  }

  // CLIRO parity for the Amazon surfaces: the Kiro runtime accepts the
  // SSO bearer header + agent-mode marker. Without these the deprecated
  // path gateway answers REQUEST_BODY_INVALID for modern payloads.
  if (credentials?.accessToken) {
    headers["x-amz-sso-bearer"] = credentials.accessToken;
  }
  headers["x-amzn-kiro-agent-mode"] = "spec";
  headers["x-amzn-codewhisperer-machine-id"] = "kiro-desktop";
  const profileArn = credentials?.providerSpecificData?.profileArn;
  if (profileArn) {
    headers["x-amzn-codewhisperer-profile-arn"] = profileArn;
  }

  return headers;
}

export function getOrderedBaseUrls(baseUrls = [], credentials) {
  // IAM Identity Center (idc) tokens are AWS SSO access tokens — the same
  // family as external_idp/api_key. The kiro.dev gateway rejects them with
  // 403 "bearer token invalid", so they must hit the CodeWhisperer
  // *.amazonaws.com surface, and in the region the token was minted in
  // (the baseUrls are hardcoded us-east-1).
  // Kiro deprecated the legacy path-style GenerateAssistantResponse on
  // runtime.*.kiro.dev (IDE 1.0.228+ moved to POST / + x-amz-target). The
  // path gateway now answers valid modern payloads with 400
  // REQUEST_BODY_INVALID, and 400 is terminal in BaseExecutor, so kiro.dev
  // must never be the first surface for any auth method. Amazon surfaces
  // reject foreign tokens with 401/403, which DO fall through, so trying
  // q/codewhisperer first is safe for every auth method (CLIRO parity).

  // Only a covered region reaches the hostname that receives the bearer token.
  const requestedRegion = (credentials?.providerSpecificData?.region || "us-east-1").trim();
  const regionalize = (u) => {
    if (!u.includes("amazonaws.com")) return u;
    const service = u.match(/\/\/([a-z]+)\.[a-z0-9-]+\.amazonaws\.com/)?.[1];
    const covered = KIRO_SERVICE_REGIONS[service];
    if (!covered || !covered.has(requestedRegion)) return u;
    return u.replace(/([a-z]+)\.[a-z0-9-]+\.amazonaws\.com/, `$1.${requestedRegion}.amazonaws.com`);
  };

  const amazon = baseUrls.filter((u) => u.includes("amazonaws.com")).map(regionalize);
  const others = baseUrls.filter((u) => !u.includes("amazonaws.com"));
  const q = amazon.filter((u) => u.includes("://q."));
  const remaining = amazon.filter((u) => !u.includes("://q."));
  return q.length > 0
    ? [...q, ...remaining, ...others]
    : [...amazon, ...others];
}

export async function refreshKiroCredentials(credentials, log, proxyOptions = null) {
  if (!credentials?.refreshToken) return null;

  try {
    // Use centralized refreshKiroToken function (handles both AWS SSO OIDC and Social Auth)
    const result = await refreshKiroToken(
      credentials.refreshToken,
      credentials.providerSpecificData,
      log,
      proxyOptions
    );

    return result;
  } catch (error) {
    log?.error?.("TOKEN", `Kiro refresh error: ${error.message}`);
    return null;
  }
}
