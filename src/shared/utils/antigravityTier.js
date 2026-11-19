/**
 * Antigravity Account Tier Detection Utility
 * Shared between client (React) and server (Next.js API routes).
 */

const ARGON_OR_G1_PRO_REGEX = /(?:argon|orchestrator|g1[- ]?pro)/i;

/**
 * Tests whether a model identifier or quota name represents an Argon or G1 Pro model.
 * @param {unknown} val
 * @returns {boolean}
 */
export function isArgonOrG1ProKey(val) {
  if (!val) return false;
  return ARGON_OR_G1_PRO_REGEX.test(String(val));
}

/**
 * Detects whether an Antigravity connection has access to Argon or G1 Pro models.
 * @param {object} connection - Provider connection object
 * @param {object} [quotaEntry] - Optional live/cached quota object from ProviderLimits
 * @returns {boolean}
 */
export function hasArgonOrG1Pro(connection, quotaEntry = null) {
  if (!connection && !quotaEntry) return false;

  // 1. Check connection.providerSpecificData.quotas or connection.quotas
  const psdQuotas =
    connection?.providerSpecificData?.quotas ||
    connection?.providerSpecificData?.rawQuotas ||
    connection?.quotas;
  if (psdQuotas && typeof psdQuotas === "object") {
    if (Array.isArray(psdQuotas)) {
      if (
        psdQuotas.some((q) =>
          isArgonOrG1ProKey(q?.modelKey) ||
          isArgonOrG1ProKey(q?.id) ||
          isArgonOrG1ProKey(q?.name)
        )
      ) {
        return true;
      }
    } else {
      const keys = Object.keys(psdQuotas);
      if (keys.some((k) => isArgonOrG1ProKey(k))) {
        return true;
      }
    }
  }

  // 2. Check live / cached quotaData in ProviderLimits
  const qList = quotaEntry?.quotas;
  if (Array.isArray(qList)) {
    if (
      qList.some((q) =>
        isArgonOrG1ProKey(q?.modelKey) ||
        isArgonOrG1ProKey(q?.id) ||
        isArgonOrG1ProKey(q?.name)
      )
    ) {
      return true;
    }
  } else if (qList && typeof qList === "object") {
    const keys = Object.keys(qList);
    if (keys.some((k) => isArgonOrG1ProKey(k))) {
      return true;
    }
  }

  const rawObj = quotaEntry?.raw?.quotas || quotaEntry?.raw?.models;
  if (rawObj && typeof rawObj === "object") {
    const keys = Object.keys(rawObj);
    if (keys.some((k) => isArgonOrG1ProKey(k))) {
      return true;
    }
  }

  // 3. Check models list if available
  const models = connection?.providerSpecificData?.models || connection?.models;
  if (Array.isArray(models)) {
    if (
      models.some((m) => {
        const id = typeof m === "string" ? m : m?.id || m?.name || "";
        return isArgonOrG1ProKey(id);
      })
    ) {
      return true;
    }
  }

  return false;
}

function isPaidSessionQuotaKey(key, quotaObj = null, allQuotas = null) {
  const lk = String(key || "").toLowerCase();
  if (!lk) return false;

  // Explicit 5h Claude rolling session quota (never present on free-tier accounts)
  if (lk.includes("claude") && lk.includes("session")) {
    return true;
  }

  // Gemini 5h session quota: on free-tier accounts, gemini_session mirrors the multi-day weekly reset
  if ((lk === "gemini_session" || lk === "gemini_argon_session") && quotaObj && typeof quotaObj === "object") {
    const resetAt = quotaObj.resetAt ? new Date(quotaObj.resetAt).getTime() : 0;
    const weeklyResetAt = allQuotas?.gemini_weekly?.resetAt
      ? new Date(allQuotas.gemini_weekly.resetAt).getTime()
      : 0;
    const SIX_AND_HALF_HOURS_MS = 6.5 * 60 * 60 * 1000;
    if (resetAt > 0 && resetAt - Date.now() <= SIX_AND_HALF_HOURS_MS) {
      if (!weeklyResetAt || Math.abs(weeklyResetAt - resetAt) > 60 * 60 * 1000) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Detects whether an Antigravity connection has access to paid 5h Claude/session quotas.
 * Free tier Google Antigravity accounts only have weekly quotas (including claude_gpt_weekly at 0%
 * and multi-day gemini_session) and do not have claude_gpt_session.
 * @param {object} connection
 * @param {object} [quotaEntry]
 * @returns {boolean}
 */
export function hasClaudeOrSessionQuota(connection, quotaEntry = null) {
  if (!connection && !quotaEntry) return false;

  // Check quotaEntry
  const qList = quotaEntry?.quotas;
  if (qList && typeof qList === "object") {
    if (Array.isArray(qList)) {
      if (qList.some((q) => isPaidSessionQuotaKey(q?.modelKey || q?.id || q?.name, q, null))) {
        return true;
      }
    } else {
      for (const [k, v] of Object.entries(qList)) {
        if (isPaidSessionQuotaKey(k, v, qList)) {
          return true;
        }
      }
    }
  }

  // Check connection quotas
  const connQuotas =
    connection?.providerSpecificData?.quotas ||
    connection?.providerSpecificData?.rawQuotas ||
    connection?.quotas;
  if (connQuotas && typeof connQuotas === "object") {
    if (Array.isArray(connQuotas)) {
      if (connQuotas.some((q) => isPaidSessionQuotaKey(q?.modelKey || q?.id || q?.name, q, null))) {
        return true;
      }
    } else {
      for (const [k, v] of Object.entries(connQuotas)) {
        if (isPaidSessionQuotaKey(k, v, connQuotas)) {
          return true;
        }
      }
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

  // 1. Check explicit raw tier from connection or providerSpecificData
  const rawTier = (
    connection?.providerSpecificData?.subscriptionTier ||
    connection?.providerSpecificData?.tier ||
    connection?.subscriptionTier ||
    connection?.tier ||
    ""
  ).toLowerCase().trim();

  if (rawTier === "pro_jiro" || rawTier === "pro jiro" || rawTier === "pro-jiro") {
    return "pro_jiro";
  }
  if (rawTier === "enterprise" || rawTier.includes("enterprise")) return "enterprise";
  if (rawTier === "ultra" || rawTier.includes("ultra")) return "ultra";
  if (rawTier === "pro" || rawTier.includes("pro")) {
    return hasArgonOrG1Pro(connection, quotaEntry) ? "pro" : "pro_jiro";
  }

  // 2. Check subscription info / plan metadata from live quota response
  const subInfo =
    quotaEntry?.subscriptionInfo ||
    quotaEntry?.raw?.subscriptionInfo ||
    connection?.providerSpecificData?.subscriptionInfo;

  const paidTierCandidate = (
    subInfo?.paidTier?.name ||
    subInfo?.paidTier?.id ||
    subInfo?.currentTier?.name ||
    subInfo?.currentTier?.id ||
    quotaEntry?.plan ||
    ""
  ).toLowerCase().trim();

  if (paidTierCandidate && !["free", "free-tier", "unknown"].includes(paidTierCandidate)) {
    if (paidTierCandidate.includes("enterprise")) return "enterprise";
    if (paidTierCandidate.includes("ultra")) return "ultra";
    if (
      paidTierCandidate.includes("pro") ||
      paidTierCandidate.includes("advanced") ||
      paidTierCandidate.includes("premium") ||
      paidTierCandidate.includes("google-one")
    ) {
      return hasArgonOrG1Pro(connection, quotaEntry) ? "pro" : "pro_jiro";
    }
  }

  // 3. Heuristic deduction: If account has access to Argon or G1 Pro -> PRO
  if (hasArgonOrG1Pro(connection, quotaEntry)) {
    return "pro";
  }

  // 4. Heuristic deduction: If account has Claude or 5h rolling session windows -> PRO JIRO
  // (Free tier accounts on Google Antigravity only have weekly limits and cannot access Claude)
  if (hasClaudeOrSessionQuota(connection, quotaEntry)) {
    return "pro_jiro";
  }

  return "free";
}

/**
 * Returns human-readable label for the tier
 * @param {"pro" | "pro_jiro" | "ultra" | "enterprise" | "free"} tier
 * @returns {string}
 */
export function getTierBadgeLabel(tier) {
  switch (tier) {
    case "pro":
      return "PRO";
    case "pro_jiro":
      return "PRO JIRO";
    case "ultra":
      return "ULTRA";
    case "enterprise":
      return "ENTERPRISE";
    case "free":
    default:
      return "FREE";
  }
}
