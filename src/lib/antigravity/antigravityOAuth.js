import { ANTIGRAVITY_OAUTH_CLIENT, ANTIGRAVITY_IDE_USER_AGENT } from "../../../open-sse/providers/shared.js";
import { getOAuthClientMetadata } from "./antigravityProtobuf.js";

const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const USER_INFO_ENDPOINT = "https://www.googleapis.com/oauth2/v3/userinfo";
const LOAD_CODE_ASSIST_ENDPOINT = "https://cloudcode-pa.googleapis.com/v1internal:loadCodeAssist";

/**
 * 1. exchangeRefreshToken(refreshToken)
 * Calls Google OAuth token endpoint with Antigravity client credentials.
 *
 * @param {string} refreshToken
 * @returns {Promise<{ access_token: string, refresh_token: string, expires_in: number, scope: string, token_type: string }>}
 */
export async function exchangeRefreshToken(refreshToken) {
  if (!refreshToken || typeof refreshToken !== "string") {
    throw new Error("Refresh token is required");
  }

  const cleanToken = refreshToken.trim();
  const response = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: cleanToken,
      client_id: ANTIGRAVITY_OAUTH_CLIENT.clientId,
      client_secret: ANTIGRAVITY_OAUTH_CLIENT.clientSecret,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    let parsedError;
    try {
      parsedError = JSON.parse(errorBody);
    } catch {
      parsedError = null;
    }
    const message = parsedError?.error_description || parsedError?.error || errorBody;
    const err = new Error(`Google token exchange failed (${response.status}): ${message}`);
    err.status = response.status;
    err.details = parsedError;
    throw err;
  }

  const data = await response.json();
  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token || cleanToken,
    expires_in: data.expires_in || 3600,
    scope: data.scope || "",
    token_type: data.token_type || "Bearer",
  };
}

/**
 * 2. getUserInfo(accessToken)
 * Calls Google OAuth2 v3 userinfo endpoint.
 *
 * @param {string} accessToken
 * @returns {Promise<object>}
 */
export async function getUserInfo(accessToken) {
  if (!accessToken) {
    throw new Error("Access token is required to get user info");
  }

  const response = await fetch(USER_INFO_ENDPOINT, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    const errorBody = await response.text();
    const err = new Error(`Failed to get Google user info (${response.status}): ${errorBody}`);
    err.status = response.status;
    throw err;
  }

  return await response.json();
}

/**
 * Normalizes any raw tier identifier into one of: 'free', 'pro', 'ultra', 'enterprise'.
 *
 * @param {string} rawTier
 * @returns {"free" | "pro" | "ultra" | "enterprise"}
 */
export function normalizeTier(rawTier) {
  if (!rawTier || typeof rawTier !== "string") return "free";
  const s = rawTier.toLowerCase().trim();
  if (s.includes("enterprise")) return "enterprise";
  if (s.includes("ultra")) return "ultra";
  if (s.includes("plus") || s.includes("g1-plus")) return "plus";
  if (s.includes("pro") || s.includes("g1-pro") || s.includes("advanced") || s.includes("premium")) return "pro";
  if (s.includes("free") || s.includes("legacy")) return "free";
  return "free";
}

/**
 * Detects whether an Antigravity connection has access to Argon or G1 Pro models.
 * @param {object} connection
 * @param {object} [quotaEntry]
 * @returns {boolean}
 */
export function hasArgonOrG1Pro(connection, quotaEntry = null) {
  if (!connection && !quotaEntry) return false;

  // 1. Check connection.providerSpecificData.quotas
  const psdQuotas =
    connection?.providerSpecificData?.quotas ||
    connection?.providerSpecificData?.rawQuotas ||
    connection?.quotas;
  if (psdQuotas && typeof psdQuotas === "object") {
    if (Array.isArray(psdQuotas)) {
      if (
        psdQuotas.some((q) => {
          const k = String(q.modelKey || q.id || q.name || "").toLowerCase();
          return k.includes("argon") || k.includes("orchestrator") || k.includes("g1-pro") || k.includes("g1pro") || k.includes("g1 pro");
        })
      ) {
        return true;
      }
    } else {
      const keys = Object.keys(psdQuotas);
      if (
        keys.some((k) => {
          const lk = k.toLowerCase();
          return lk.includes("argon") || lk.includes("orchestrator") || lk.includes("g1-pro") || lk.includes("g1pro");
        })
      ) {
        return true;
      }
    }
  }

  // 2. Check live / cached quotaData in ProviderLimits
  const qList = quotaEntry?.quotas;
  if (Array.isArray(qList)) {
    if (
      qList.some((q) => {
        const k = String(q.modelKey || q.id || q.name || "").toLowerCase();
        return k.includes("argon") || k.includes("orchestrator") || k.includes("g1-pro") || k.includes("g1pro") || k.includes("g1 pro");
      })
    ) {
      return true;
    }
  }

  const rawObj = quotaEntry?.raw?.quotas || quotaEntry?.raw?.models;
  if (rawObj && typeof rawObj === "object") {
    const keys = Object.keys(rawObj);
    if (
      keys.some((k) => {
        const lk = k.toLowerCase();
        return lk.includes("argon") || lk.includes("orchestrator") || lk.includes("g1-pro") || lk.includes("g1pro");
      })
    ) {
      return true;
    }
  }

  // 3. Check models list if available
  const models = connection?.providerSpecificData?.models || connection?.models;
  if (Array.isArray(models)) {
    if (
      models.some((m) => {
        const id = String(typeof m === "string" ? m : m.id || m.name || "").toLowerCase();
        return id.includes("argon") || id.includes("orchestrator") || id.includes("g1-pro") || id.includes("g1pro");
      })
    ) {
      return true;
    }
  }

  return false;
}

/**
 * Returns the resolved effective tier for an Antigravity account:
 * - "pro": Has Argon / G1 Pro latest models
 * - "pro_jiro": Pro tier without Argon / G1 Pro latest models
 * - "ultra": Ultra tier
 * - "enterprise": Enterprise tier
 * - "free": Free tier
 *
 * @param {object} connection
 * @param {object} [quotaEntry]
 * @returns {"pro" | "pro_jiro" | "ultra" | "enterprise" | "free"}
 */
export function getAntigravityEffectiveTier(connection, quotaEntry = null) {
  if (!connection && !quotaEntry) return "free";

  // 1. Check official paid subscription info (from Google loadCodeAssist)
  const subInfo =
    quotaEntry?.subscriptionInfo ||
    quotaEntry?.raw?.subscriptionInfo ||
    connection?.providerSpecificData?.subscriptionInfo;

  const paidTierCandidate = (
    subInfo?.paidTier?.id ||
    subInfo?.paidTier?.name ||
    subInfo?.currentTier?.id ||
    subInfo?.currentTier?.name ||
    quotaEntry?.plan ||
    ""
  ).toLowerCase().trim();

  if (paidTierCandidate && !["free", "free-tier", "unknown"].includes(paidTierCandidate)) {
    if (paidTierCandidate.includes("enterprise")) return "enterprise";
    if (paidTierCandidate.includes("ultra")) return "ultra";
    if (paidTierCandidate.includes("plus") || paidTierCandidate.includes("g1-plus")) return "plus";
    if (
      paidTierCandidate.includes("pro") ||
      paidTierCandidate.includes("advanced") ||
      paidTierCandidate.includes("premium") ||
      paidTierCandidate.includes("google-one") ||
      paidTierCandidate.includes("g1-pro")
    ) {
      return "pro";
    }
  }

  // 2. Check explicit raw tier from connection or providerSpecificData
  const rawTier = (
    connection?.providerSpecificData?.subscriptionTier ||
    connection?.providerSpecificData?.tier ||
    connection?.subscriptionTier ||
    connection?.tier ||
    "free"
  ).toLowerCase().trim();

  if (rawTier === "pro_jiro" || rawTier === "pro jiro" || rawTier === "pro-jiro") {
    return "pro_jiro";
  }
  if (rawTier === "enterprise" || rawTier.includes("enterprise")) return "enterprise";
  if (rawTier === "ultra" || rawTier.includes("ultra")) return "ultra";
  if (rawTier === "plus" || rawTier.includes("plus") || rawTier === "g1-plus" || rawTier === "g1-plus-tier") {
    return "plus";
  }
  if (rawTier === "pro" || rawTier.includes("pro") || rawTier === "g1-pro" || rawTier === "g1-pro-tier") {
    return "pro";
  }

  // 3. Heuristic deduction: If account has access to Argon or G1 Pro -> PRO
  if (hasArgonOrG1Pro(connection, quotaEntry)) {
    return "pro";
  }

  return "free";
}

/**
 * 3. fetchProjectAndTier(accessToken)
 * Calls https://cloudcode-pa.googleapis.com/v1internal:loadCodeAssist to fetch projectId
 * and normalize tier to 'free', 'pro', 'ultra', 'enterprise'.
 *
 * @param {string} accessToken
 * @returns {Promise<{ projectId: string, tier: "free" | "pro" | "ultra" | "enterprise", raw: object }>}
 */
export async function fetchProjectAndTier(accessToken) {
  if (!accessToken) {
    throw new Error("Access token is required to load code assist");
  }

  const metadata = getOAuthClientMetadata();
  const response = await fetch(LOAD_CODE_ASSIST_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      "User-Agent": ANTIGRAVITY_IDE_USER_AGENT,
      "x-request-source": "local",
    },
    body: JSON.stringify({ metadata }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    const err = new Error(`loadCodeAssist failed (${response.status}): ${errorBody}`);
    err.status = response.status;
    throw err;
  }

  const data = await response.json();

  // Extract projectId
  let projectId = "";
  if (typeof data.cloudaicompanionProject === "string") {
    projectId = data.cloudaicompanionProject.trim();
  } else if (data.cloudaicompanionProject && typeof data.cloudaicompanionProject === "object") {
    projectId = data.cloudaicompanionProject.id || "";
  }

  // Extract rawTier candidate
  let rawTier = "";
  if (data.paidTier?.id || data.paidTier?.name) {
    rawTier = data.paidTier.id || data.paidTier.name;
  } else if (data.currentTier?.id || data.currentTier?.name) {
    rawTier = data.currentTier.id || data.currentTier.name;
  } else if (Array.isArray(data.allowedTiers) && data.allowedTiers.length > 0) {
    const defaultTier = data.allowedTiers.find((t) => t.isDefault && (t.id || t.name));
    if (defaultTier) {
      rawTier = defaultTier.id || defaultTier.name;
    } else {
      rawTier = data.allowedTiers[0].id || data.allowedTiers[0].name || "";
    }
  }

  const tier = normalizeTier(rawTier);

  return {
    projectId,
    tier,
    rawTier: rawTier || "free",
    raw: data,
  };
}

/**
 * 4. checkErrorAndVerification(error)
 * Detects 403, 'Verify your account to continue', extracts validation_url / appeal_url.
 *
 * @param {any} error
 * @returns {{ isVerificationRequired: boolean, status: number|null, message: string, validationUrl: string|null, appealUrl: string|null }}
 */
export function checkErrorAndVerification(error) {
  if (!error) {
    return {
      isVerificationRequired: false,
      status: null,
      message: "",
      validationUrl: null,
      appealUrl: null,
    };
  }

  let status = error.status || error.statusCode || error.code || null;
  let message = error.message || (typeof error === "string" ? error : "");
  let validationUrl = error.validation_url || error.validationUrl || null;
  let appealUrl = error.appeal_url || error.appealUrl || null;

  const data = error.data || error.response?.data || error.body || error.details || null;
  if (data && typeof data === "object") {
    if (!status && data.error?.code) status = data.error.code;
    if (data.error?.message) message = `${message} ${data.error.message}`;
    if (data.validation_url) validationUrl = data.validation_url;
    if (data.appeal_url) appealUrl = data.appeal_url;
    if (data.context) {
      if (data.context.verificationUrl) validationUrl = data.context.verificationUrl;
      if (data.context.appealUrl) appealUrl = data.context.appealUrl;
      if (data.context.errorMessage) message = `${message} ${data.context.errorMessage}`;
    }
    if (Array.isArray(data.error?.details)) {
      for (const d of data.error.details) {
        if (d.validation_url || d.validationUrl) validationUrl = d.validation_url || d.validationUrl;
        if (d.appeal_url || d.appealUrl) appealUrl = d.appeal_url || d.appealUrl;
        if (d.metadata?.validation_url) validationUrl = d.metadata.validation_url;
        if (d.metadata?.appeal_url) appealUrl = d.metadata.appeal_url;
      }
    }
  }

  const messageStr = String(message);

  // Regex extract URL if not found in structured fields
  if (!validationUrl) {
    const vMatch =
      messageStr.match(/https:\/\/(?:accounts\.google\.com|support\.google\.com)[^\s"'>)]*(?:verify|validation|challenge)[^\s"'>)]*/i) ||
      messageStr.match(/https:\/\/[^\s"'>)]*(?:verify|validation|challenge)[^\s"'>)]*/i);
    if (vMatch) validationUrl = vMatch[0];
  }

  if (!appealUrl) {
    const aMatch = messageStr.match(/https:\/\/[^\s"'>)]*(?:appeal|compliance)[^\s"'>)]*/i);
    if (aMatch) appealUrl = aMatch[0];
  }

  const is403 = Number(status) === 403;
  const hasVerifyText =
    /verify\s+your\s+account\s+to\s+continue/i.test(messageStr) ||
    /verification\s+required/i.test(messageStr) ||
    /account\s+suspended/i.test(messageStr) ||
    /appeal/i.test(messageStr) ||
    /unauthorized_client/i.test(messageStr);

  const isVerificationRequired = is403 || hasVerifyText || Boolean(validationUrl || appealUrl);

  return {
    isVerificationRequired,
    status: status ? Number(status) : is403 ? 403 : null,
    message: messageStr.trim(),
    validationUrl,
    appealUrl,
  };
}
