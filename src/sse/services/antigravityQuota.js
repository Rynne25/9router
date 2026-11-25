/**
 * Antigravity live quota cache — in-memory, refreshed on demand.
 * Used by auth.js pre-filter to skip accounts with exhausted model quota.
 * Also triggered by 409/429 error handler to sync exact resetAt from upstream.
 */

import { resolveConnectionProxyConfig } from "@/lib/network/connectionProxy";
import { getAntigravityUsage } from "open-sse/services/usage/google.js";
import {
  isArgonOrG1ProKey,
  hasArgonOrG1Pro,
  hasClaudeOrSessionQuota,
  getAntigravityEffectiveTier,
} from "@/shared/utils/antigravityTier.js";
import {
  isModelMarkedUnsupported,
  clearModelUnsupportedForConnection,
  extractModelIdSet,
  matchesAnyCandidate,
  checkModelLimitsEligibility,
} from "./modelEligibility.js";
import * as log from "../utils/logger.js";

// In-memory cache: connectionId → { [modelId]: { remainingPercentage, resetAt } }
const quotaCache = new Map();
// In-memory cache of supported/available model IDs per connectionId (from fetchAvailableModels)
const availableModelsCache = new Map();
// In-memory cache of resolved Antigravity subscription tier per connectionId
const tierCache = new Map();
// Track last refresh per connection to avoid hammering
const lastRefreshAt = new Map();
// In-flight refresh promises — dedup concurrent 409/429 bursts
const inflightRefresh = new Map();

const MIN_REFRESH_INTERVAL_MS = 30_000; // 30s between refreshes per connection

// Strike-based circuit breaker (#3681): Google's quota API can report remaining
// quota while generation endpoints keep returning 429 (sprint/weekly dual-pool
// mismatch). After STRIKE_THRESHOLD 429s within the window for the same
// connection+model, treat the optimistic quota reading as untrusted and
// cache-block that pair instead of retry-storming upstream.
const STRIKE_WINDOW_MS = 60_000; // strikes older than this reset the count
const STRIKE_THRESHOLD = 3;
const STRIKE_BLOCK_MS = 15 * 60_000;
const strikeCounts = new Map(); // "connectionId|model" → { count, windowStart (anchored at first strike) }
const strikeBlocks = new Map(); // "connectionId|model" → blockedUntil ms

/**
 * Re-apply active strike blocks onto a fresh quotas snapshot so the auth
 * pre-filter (which reads this cache) keeps skipping the blocked pair across
 * requests until the block expires — same channel as the exhausted-0% path.
 */
function applyActiveStrikeBlocks(connectionId, quotas) {
  const now = Date.now();
  for (const [key, until] of strikeBlocks) {
    if (!key.startsWith(`${connectionId}|`)) continue;
    if (until <= now) {
      strikeBlocks.delete(key);
      continue;
    }
    quotas[key.slice(connectionId.length + 1)] = {
      remainingPercentage: 0,
      resetAt: new Date(until).toISOString(),
    };
  }
  return quotas;
}

/**
 * Get model family for Antigravity models ("claude_gpt", "gemini_argon", or "gemini").
 */
export function getAntigravityModelFamily(model) {
  if (!model || typeof model !== "string") return null;
  const clean = (model.includes("/") ? model.slice(model.indexOf("/") + 1) : model).toLowerCase();
  if (clean.startsWith("claude-") || clean.startsWith("gpt-") || clean === "claude") {
    return "claude_gpt";
  }
  if ((clean.startsWith("gemini-") && !clean.includes("image")) || clean.startsWith("gemini") || clean === "gemini_argon") {
    return "gemini";
  }
  return null;
}

const ANTIGRAVITY_MODEL_ALIASES = {
  "gemini-4-neon": "gemini-4-argon-high",
  "gemini-pro-orchestrator-neon": "gemini-4-argon-high",
  "gemini-pro-orchestrator-argon": "gemini-4-argon-high",
  "claude-opus-5-5-orchestrator": "claude-opus-5-5-high",
  "gemini-4-argon": "gemini-4-argon-high",
  "gemini-4-hydrogen": "gemini-4-hydrogen-high",
  "gemini-4-carbon": "gemini-4-carbon-high",
  "gpt-oss-120b": "gpt-oss-120b-medium",
  "claude-sonnet-5-5": "claude-sonnet-5-5-high",
  "claude-opus-5-5": "claude-opus-5-5-high",
  "gemini-3.8-flash": "gemini-3.8-flash-medium",
  "gemini-3.7-flash": "gemini-3.7-flash-medium",
  "gemini-3.6-flash": "gemini-3.6-flash-medium",
};

function normalizeAntigravityModelId(model) {
  if (!model || typeof model !== "string") return "";
  return (model.includes("/") ? model.slice(model.indexOf("/") + 1) : model)
    .replace(/\[[^\]]+\]\s*$/, "")
    .replace(/\([^()]+\)\s*$/, "")
    .trim();
}

export function getAntigravityModelCandidates(model) {
  if (!model || typeof model !== "string") return [];
  const cleanModel = normalizeAntigravityModelId(model);
  const candidates = [];
  const push = (id) => {
    if (id && !candidates.includes(id)) candidates.push(id);
  };

  push(model);
  push(cleanModel);
  if (ANTIGRAVITY_MODEL_ALIASES[cleanModel]) {
    push(ANTIGRAVITY_MODEL_ALIASES[cleanModel]);
  }
  if (cleanModel === "gemini-pro-orchestrator-g1-pro") {
    push("gemini-4-argon-high");
    push("gemini-4-hydrogen-high");
  }
  if (/^gemini-3\.1-flash-image-\d+x\d+$/i.test(cleanModel)) {
    push("gemini-3.1-flash-image");
  }
  if (cleanModel.startsWith("claude-opus-5-5") || cleanModel === "claude-opus-4-6") {
    push("claude-opus-4-6-thinking");
    push("claude-opus-5-5-high");
  }
  if (cleanModel.startsWith("claude-sonnet-5-5")) {
    push("claude-sonnet-4-6");
    push("claude-sonnet-5-5-high");
  }
  return candidates;
}

function isArgonOrHydrogenModel(cleanModel) {
  if (!cleanModel) return false;
  const lower = cleanModel.toLowerCase();
  return isArgonOrG1ProKey(cleanModel) || lower.includes("hydrogen") || lower.includes("neon") || lower.includes("carbon");
}

function resolveKnownAntigravityTier(connectionId, connection, availableSet, quotasSnapshot) {
  if (connectionId && tierCache.has(connectionId)) {
    return tierCache.get(connectionId);
  }
  const psd = connection?.providerSpecificData;
  const rawTier = (
    psd?.subscriptionTier ||
    psd?.tier ||
    connection?.subscriptionTier ||
    connection?.tier ||
    ""
  ).toLowerCase().trim();

  const hasAvailableArgon = availableSet
    ? [...availableSet].some((id) => isArgonOrHydrogenModel(id))
    : false;
  const hasSnapshotData = Boolean(
    (availableSet && availableSet.size > 0) ||
    (quotasSnapshot && typeof quotasSnapshot === "object" && Object.keys(quotasSnapshot).length > 0)
  );

  if (psd?.subscriptionInfo) {
    return getAntigravityEffectiveTier(connection, {
      subscriptionInfo: psd.subscriptionInfo,
      quotas: quotasSnapshot || undefined,
    });
  }

  if (rawTier === "pro_jiro" || rawTier === "pro jiro" || rawTier === "pro-jiro") {
    return "pro_jiro";
  }
  if (rawTier.includes("enterprise")) return "enterprise";
  if (rawTier.includes("ultra")) return "ultra";
  if (rawTier.includes("plus") || rawTier.includes("g1-plus")) return "plus";
  if (rawTier.includes("pro") || rawTier.includes("g1-pro")) {
    return "pro";
  }
  if (rawTier === "free" || rawTier.includes("legacy")) {
    if (hasAvailableArgon || hasArgonOrG1Pro(connection, quotasSnapshot ? { quotas: quotasSnapshot } : null)) {
      return "pro";
    }
    if (hasClaudeOrSessionQuota(connection, quotasSnapshot ? { quotas: quotasSnapshot } : null)) {
      return "pro_jiro";
    }
    return "free";
  }

  // No explicit tier string on connection — only infer from persisted/full quota snapshot
  if (quotasSnapshot && typeof quotasSnapshot === "object" && Object.keys(quotasSnapshot).length > 0) {
    if (hasArgonOrG1Pro(connection, { quotas: quotasSnapshot })) return "pro";
    if (hasClaudeOrSessionQuota(connection, { quotas: quotasSnapshot })) return "pro_jiro";
    if (Object.keys(quotasSnapshot).length >= 1 && psd?.quotas) return "free";
  }

  return null;
}

/**
 * Check whether an Antigravity connection supports the given model.
 * Evaluates runtime unsupported cache, explicit connection allow/deny lists,
 * modelLimits, fetched availableModels (live RAM or persisted), subscription tier
 * compatibility (free / pro_jiro / pro / ultra / enterprise), and quota map.
 * Fail-open on cold start when no capability/tier info has been fetched yet.
 */
export function isAntigravityModelSupported(connectionId, model, connection = null) {
  if (!model || typeof model !== "string") return true;
  const cleanModel = normalizeAntigravityModelId(model);
  if (!cleanModel) return true;
  const candidates = getAntigravityModelCandidates(model);
  const psd = connection?.providerSpecificData;

  // 1. Runtime unsupported cache (e.g. learned from 404 / invalid model error)
  if (connectionId && (isModelMarkedUnsupported(connectionId, model) || isModelMarkedUnsupported(connectionId, cleanModel))) {
    return false;
  }

  // 2. Explicit per-connection disabledModels / enabledModels / supportedModels / modelLimits
  const disabledSet = extractModelIdSet(psd?.disabledModels);
  if (disabledSet && matchesAnyCandidate(disabledSet, candidates)) {
    return false;
  }

  const allowRaw = Array.isArray(psd?.enabledModels) && psd.enabledModels.length > 0
    ? psd.enabledModels
    : (Array.isArray(psd?.supportedModels) && psd.supportedModels.length > 0 ? psd.supportedModels : null);
  const allowSet = extractModelIdSet(allowRaw);
  if (allowSet && !matchesAnyCandidate(allowSet, candidates)) {
    return false;
  }

  const limitsCheck = checkModelLimitsEligibility(
    psd?.modelLimits,
    candidates,
    psd?.modelLimitsAuthoritative === true
  );
  if (!limitsCheck.eligible) {
    return false;
  }

  // 3. Available models snapshot (live RAM cache first, then persisted providerSpecificData)
  const liveAvailable = connectionId ? availableModelsCache.get(connectionId) : null;
  const persistedAvailable = extractModelIdSet(psd?.availableModels) || extractModelIdSet(psd?.models || connection?.models);
  const availableSet = liveAvailable && liveAvailable.size > 0 ? liveAvailable : persistedAvailable;

  // Authoritative quota snapshot (persisted psd.quotas, or live quotaCache when backed by usage sync)
  const persistedQuotas = psd?.quotas || psd?.rawQuotas || null;
  const liveQuotas = connectionId && (availableModelsCache.has(connectionId) || tierCache.has(connectionId))
    ? quotaCache.get(connectionId)
    : null;
  const quotasSnapshot = (liveQuotas && Object.keys(liveQuotas).length > 0) ? liveQuotas : persistedQuotas;

  // 4. Tier compatibility check (when tier is explicitly known or derived from real usage data)
  const knownTier = resolveKnownAntigravityTier(connectionId, connection, availableSet, quotasSnapshot);
  const isArgonModel = isArgonOrHydrogenModel(cleanModel);
  const isClaudeModel = cleanModel.toLowerCase().startsWith("claude-") || cleanModel.toLowerCase() === "claude";

  if ((knownTier === "free" || knownTier === "plus") && (isArgonModel || isClaudeModel)) {
    return false;
  }
  if (knownTier === "pro_jiro" && isArgonModel) {
    return false;
  }

  // 5. Fetched availableModels allowlist check
  if (availableSet && availableSet.size > 0) {
    if (!matchesAnyCandidate(availableSet, candidates)) {
      return false;
    }
  } else if (isArgonModel && quotasSnapshot && typeof quotasSnapshot === "object") {
    // 6. Fallback to populated quota map when availableModels wasn't saved
    if (knownTier !== "ultra" && knownTier !== "enterprise") {
      const keys = Object.keys(quotasSnapshot);
      if (keys.length >= 2 && !keys.some((k) => isArgonOrHydrogenModel(k))) {
        return false;
      }
    }
  }

  return true;
}

/**
 * Check whether an Antigravity connection's cached quota for a specific model is exhausted (0%).
 * Checks live RAM cache first, then persisted connection.providerSpecificData.quotas (only with future resetAt).
 * Automatically returns { exhausted: false } once resetAt has passed.
 */
export function isAntigravityQuotaExhausted(connectionId, model, connection = null) {
  if (!connectionId || !model) return { exhausted: false, resetAt: null };
  const liveQuotas = quotaCache.get(connectionId);
  const persistedQuotas = connection?.providerSpecificData?.quotas || connection?.providerSpecificData?.rawQuotas || null;
  const connQuotas = liveQuotas || persistedQuotas;
  if (!connQuotas) return { exhausted: false, resetAt: null };

  const cleanModel = normalizeAntigravityModelId(model);
  const quota = getAntigravityModelQuota(connQuotas, model) || connQuotas?.[cleanModel] || connQuotas?.[model];
  if (!quota || typeof quota !== "object") return { exhausted: false, resetAt: null };

  const isZero = typeof quota.remainingPercentage === "number"
    ? quota.remainingPercentage <= 0
    : (typeof quota.total === "number" && quota.total > 0 && typeof quota.used === "number" && quota.used >= quota.total);

  if (!isZero) return { exhausted: false, resetAt: null };

  if (quota.resetAt) {
    const resetMs = new Date(quota.resetAt).getTime();
    if (Number.isFinite(resetMs) && resetMs <= Date.now()) {
      return { exhausted: false, resetAt: null };
    }
    return { exhausted: true, resetAt: quota.resetAt };
  }

  // Require an explicit resetAt when reading persisted DB quotas so stale snapshots without resetAt don't block indefinitely
  if (!liveQuotas) return { exhausted: false, resetAt: null };

  return { exhausted: true, resetAt: null };
}

/**
 * Resolve quota info for a given model from the connection quotas map.
 * Checks direct model entry, tier aliases, and shared family summary buckets
 * (session 5h and weekly limits).
 */
export function getAntigravityModelQuota(quotas, model) {
  if (!quotas || typeof quotas !== "object" || !model) return null;

  const cleanModel = typeof model === "string"
    ? (model.includes("/") ? model.slice(model.indexOf("/") + 1) : model).replace(/\([^()]+\)\s*$/, "").trim()
    : "";

  const family = getAntigravityModelFamily(cleanModel);
  const candidates = [];

  // 1. Direct entry in quotas map (e.g. per-model quota if present)
  if (quotas[cleanModel]) {
    candidates.push(quotas[cleanModel]);
  }

  // 2. Direct tier aliases if base model was passed
  if ((cleanModel === "gemini-4-argon" || cleanModel === "gemini-4-neon" || cleanModel === "gemini-pro-orchestrator-neon" || cleanModel === "gemini-pro-orchestrator-argon") && quotas["gemini-4-argon-high"]) {
    candidates.push(quotas["gemini-4-argon-high"]);
  }
  if (cleanModel === "gemini-4-hydrogen" && quotas["gemini-4-hydrogen-high"]) {
    candidates.push(quotas["gemini-4-hydrogen-high"]);
  }
  if (cleanModel === "gemini-4-carbon" && quotas["gemini-4-carbon-high"]) {
    candidates.push(quotas["gemini-4-carbon-high"]);
  }
  if ((cleanModel === "claude-opus-5-5" || cleanModel === "claude-opus-5-5-orchestrator") && quotas["claude-opus-5-5-high"]) {
    candidates.push(quotas["claude-opus-5-5-high"]);
  }
  if (cleanModel === "claude-sonnet-5-5" && quotas["claude-sonnet-5-5-high"]) {
    candidates.push(quotas["claude-sonnet-5-5-high"]);
  }
  if (cleanModel === "gpt-oss-120b" && quotas["gpt-oss-120b-medium"]) {
    candidates.push(quotas["gpt-oss-120b-medium"]);
  }
  if (cleanModel === "gemini-3.8-flash" && quotas["gemini-3.8-flash-medium"]) {
    candidates.push(quotas["gemini-3.8-flash-medium"]);
  }
  if (cleanModel === "gemini-3.7-flash" && quotas["gemini-3.7-flash-medium"]) {
    candidates.push(quotas["gemini-3.7-flash-medium"]);
  }
  if (cleanModel === "gemini-3.6-flash" && quotas["gemini-3.6-flash-medium"]) {
    candidates.push(quotas["gemini-3.6-flash-medium"]);
  }

  // 3. Shared family summary buckets (5h session & Weekly)
  if (family === "claude_gpt") {
    if (quotas.claude_gpt_session) candidates.push(quotas.claude_gpt_session);
    if (quotas.claude_gpt_weekly) candidates.push(quotas.claude_gpt_weekly);
  } else if (family === "gemini_argon") {
    if (quotas.gemini_argon_session) candidates.push(quotas.gemini_argon_session);
    if (quotas.gemini_argon_weekly) candidates.push(quotas.gemini_argon_weekly);
    // On Ultra plans where Argon shares the main Gemini bucket (no separate argon summary),
    // fall back to the shared Gemini summary buckets.
    if (!quotas.gemini_argon_session && !quotas.gemini_argon_weekly) {
      if (quotas.gemini_session) candidates.push(quotas.gemini_session);
      if (quotas.gemini_weekly) candidates.push(quotas.gemini_weekly);
    }
  } else if (family === "gemini") {
    if (quotas.gemini_session) candidates.push(quotas.gemini_session);
    if (quotas.gemini_weekly) candidates.push(quotas.gemini_weekly);
  }

  if (candidates.length === 0) return null;

  const now = Date.now();
  const exhausted = [];

  for (const c of candidates) {
    if (c && typeof c === "object" && typeof c.remainingPercentage === "number" && c.remainingPercentage <= 0) {
      if (c.resetAt) {
        const resetMs = new Date(c.resetAt).getTime();
        if (resetMs > now) {
          exhausted.push({ ...c, resetMs });
        }
      } else {
        exhausted.push({ ...c, resetMs: 0 });
      }
    }
  }

  // If any bucket is exhausted (0%), the model is exhausted.
  // Use the longest (latest) resetAt so we do not unblock prematurely.
  if (exhausted.length > 0) {
    exhausted.sort((a, b) => b.resetMs - a.resetMs);
    const primary = exhausted[0];
    return {
      used: primary.used ?? 1000,
      total: primary.total ?? 1000,
      remainingPercentage: 0,
      resetAt: primary.resetAt,
      displayName: primary.displayName || cleanModel,
    };
  }

  // If none exhausted, return the most constrained available bucket
  const valid = candidates.filter(c => c && typeof c.remainingPercentage === "number");
  if (valid.length === 0) return null;
  valid.sort((a, b) => a.remainingPercentage - b.remainingPercentage);
  return valid[0];
}

/**
 * Clear strike state for a connection|model after a successful request, so
 * "consecutive" strikes means consecutive. Only removes a synthesized cache
 * entry (resetAt == our block deadline); a real upstream 0% reading stays.
 */
export function clearAntigravityStrikes(connectionId, model) {
  const key = `${connectionId}|${model}`;
  strikeCounts.delete(key);
  const until = strikeBlocks.get(key);
  if (until === undefined) return;
  strikeBlocks.delete(key);
  const cached = quotaCache.get(connectionId);
  const iso = new Date(until).toISOString();
  if (cached?.[model]?.resetAt === iso) {
    delete cached[model];
  }
  const family = getAntigravityModelFamily(model);
  if (family === "claude_gpt" && cached?.claude_gpt_session?.resetAt === iso) {
    delete cached.claude_gpt_session;
  } else if (family === "gemini_argon" && cached?.gemini_argon_session?.resetAt === iso) {
    delete cached.gemini_argon_session;
  } else if (family === "gemini" && cached?.gemini_session?.resetAt === iso) {
    delete cached.gemini_session;
  }
  quotaCache.set(connectionId, cached);
}

/**
 * Get the quota cache (read-only reference for auth.js pre-filter).
 */
export function getAntigravityQuotaCache() {
  return quotaCache;
}

export function getAntigravityAvailableModelsCache() {
  return availableModelsCache;
}

export function getAntigravityTierCache() {
  return tierCache;
}

/**
 * Sync live usage response (from getAntigravityUsage) into in-memory caches
 * so subsequent routing calls immediately know quotas, availableModels, and tier.
 */
export function syncAntigravityUsageCache(connectionId, usage) {
  if (!connectionId || !usage || usage.message) return null;

  if (usage.quotas && typeof usage.quotas === "object") {
    quotaCache.set(connectionId, applyActiveStrikeBlocks(connectionId, usage.quotas));
  }

  if (Array.isArray(usage.availableModels) && usage.availableModels.length > 0) {
    const modelSet = new Set(usage.availableModels);
    availableModelsCache.set(connectionId, modelSet);
    for (const m of modelSet) {
      clearModelUnsupportedForConnection(connectionId, m);
    }
  }

  const hasTierSignal = Boolean(
    usage.subscriptionInfo ||
    (usage.plan && usage.plan !== "Unknown") ||
    usage.quotas?.gemini_weekly ||
    usage.quotas?.gemini_argon_weekly ||
    usage.quotas?.claude_gpt_session
  );
  if (hasTierSignal) {
    const resolvedTier = getAntigravityEffectiveTier(
      {
        providerSpecificData: {
          subscriptionInfo: usage.subscriptionInfo,
          quotas: usage.quotas,
          availableModels: usage.availableModels,
        },
      },
      usage
    );
    tierCache.set(connectionId, resolvedTier);
  }

  return usage.quotas || null;
}

/**
 * Refresh quota for a single antigravity connection from upstream API.
 * Updates in-memory cache only. Cache expiry is the upstream model resetAt.
 * @returns {object|null} quotas map or null on failure
 */
export async function refreshAntigravityQuota(connectionId, accessToken, providerSpecificData) {
  const now = Date.now();
  // Coalesce concurrent refreshes before applying the interval gate.
  const inflight = inflightRefresh.get(connectionId);
  if (inflight) return inflight;

  const lastRefresh = lastRefreshAt.get(connectionId) || 0;
  if (now - lastRefresh < MIN_REFRESH_INTERVAL_MS) {
    log.debug("AG_QUOTA", `${connectionId.slice(0, 8)} | skip refresh (${Math.round((now - lastRefresh) / 1000)}s ago)`);
    return quotaCache.get(connectionId) || null;
  }

  // Record every attempt so failed quota calls cannot amplify an upstream 429 burst.
  lastRefreshAt.set(connectionId, now);
  const promise = _doRefresh(connectionId, accessToken, providerSpecificData, now);
  inflightRefresh.set(connectionId, promise);
  try {
    return await promise;
  } finally {
    inflightRefresh.delete(connectionId);
  }
}

async function _doRefresh(connectionId, accessToken, providerSpecificData, now) {
  try {
    const proxyCfg = await resolveConnectionProxyConfig(providerSpecificData || {});
    const proxyOptions = {
      connectionProxyEnabled: proxyCfg.connectionProxyEnabled === true,
      connectionProxyUrl: proxyCfg.connectionProxyUrl || "",
      connectionNoProxy: proxyCfg.connectionNoProxy || "",
      vercelRelayUrl: proxyCfg.vercelRelayUrl || "",
      strictProxy: proxyCfg.strictProxy === true,
    };

    const usage = await getAntigravityUsage(accessToken, providerSpecificData, proxyOptions);
    // 401/403 usage responses can contain an empty quotas object plus message.
    // Preserve known cache instead of replacing it with an upstream error response.
    if (!usage?.quotas || usage.message) return null;

    // Update in-memory caches. Caller logs CACHE_BLOCK only if requested model is exhausted.
    // Strike blocks are re-asserted after every refresh so an optimistic
    // upstream reading cannot resurrect a pair we just circuit-broke.
    return syncAntigravityUsageCache(connectionId, usage);
  } catch (e) {
    log.warn("AG_QUOTA", `${connectionId.slice(0, 8)} | refresh failed: ${e.message}`);
    return null;
  }
}

/**
 * Handle Antigravity 409/429 — refresh RAM cache and return model resetAt when exhausted.
 * Called from chat handler error path.
 * @returns {number|null} resetAt timestamp ms (for resetsAtMs passthrough) or null
 */
export async function handleAntigravityQuotaError(connectionId, status, model, accessToken, providerSpecificData) {
  log.info("AG_QUOTA", `${connectionId.slice(0, 8)} | ${status} on ${model} — refreshing quota`);

  // Throttle applies to error paths too: one quota request per account/30s.
  // The first 409/429 populates cache; concurrent or repeated errors reuse it.
  const quotas = await refreshAntigravityQuota(connectionId, accessToken, providerSpecificData);
  const quota = getAntigravityModelQuota(quotas, model);

  // Strike breaker: count every 429 whose quota reading is either optimistic
  // (remaining > 0) or unavailable (quota API 403/error). 3 within the window
  // => the pair is unhealthy regardless of what the API claims; block 15m.
  // 409 counts too by design: Antigravity signals pool exhaustion with 409 as
  // well (see #3561 — "skip exhausted account/model quota before upstream
  // retry" was motivated by 409/429 pairs), and poisoning by transient 409s
  // requires 3 of them inside 60 seconds on the same pair.
  if (!quota || quota.remainingPercentage > 0) {
    const key = `${connectionId}|${model}`;
    const now = Date.now();
    const strike = strikeCounts.get(key);
    // Fixed window anchored at the FIRST qualifying strike: three 429s must
    // all land within 60s of that first one, not within 60s of each other.
    const windowStart = strike && now - strike.windowStart <= STRIKE_WINDOW_MS ? strike.windowStart : now;
    const count = strike && windowStart === strike.windowStart ? strike.count + 1 : 1;
    strikeCounts.set(key, { count, windowStart });
    if (count >= STRIKE_THRESHOLD) {
      strikeCounts.delete(key);
      const blockedUntil = now + STRIKE_BLOCK_MS;
      const reading = quota ? `${Math.round(quota.remainingPercentage)}%` : "unknown";
      log.warn("AG_QUOTA", `${connectionId.slice(0, 8)} | STRIKE_${status} ${model} — ${count}x 429 (quota ${reading}); CACHE_BLOCK 15m`);
      // Synthesize a 0% entry in the shared cache so the auth pre-filter skips
      // this pair on subsequent requests too, not just the current retry loop
      // (the chat handler does not persist modelLock_* for this path).
      const cached = quotaCache.get(connectionId) || {};
      cached[model] = { remainingPercentage: 0, resetAt: new Date(blockedUntil).toISOString() };
      quotaCache.set(connectionId, cached);
      strikeBlocks.set(key, blockedUntil);
      return blockedUntil;
    }
    return null;
  }

  // Healthy-but-exhausted reading: clear strikes and use the exact resetAt.
  strikeCounts.delete(`${connectionId}|${model}`);
  if (!quota.resetAt) return null;

  const resetMs = new Date(quota.resetAt).getTime();
  if (resetMs <= Date.now()) return null;

  // Cache-block the requested model under its model name
  const cached = quotaCache.get(connectionId) || {};
  cached[model] = { remainingPercentage: 0, resetAt: quota.resetAt };
  quotaCache.set(connectionId, cached);

  log.warn("AG_QUOTA", `${connectionId.slice(0, 8)} | UPSTREAM_${status} ${model} — quota exhausted; CACHE_BLOCK until ${quota.resetAt}`);
  return resetMs;
}
