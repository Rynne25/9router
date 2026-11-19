/**
 * Pre-flight model eligibility filtering & runtime unsupported-model caching.
 * Keeps ineligible connections out of upstream dispatch without disabling
 * the connection for other models, and remembers runtime 404/unsupported
 * rejections per connection+model with a sensible TTL.
 */

export const DEFAULT_UNSUPPORTED_MODEL_TTL_MS = 30 * 60 * 1000;

// In-memory cache: "connectionId|normalizedModel" -> { expiresAt, reason, status, recordedAt }
const unsupportedModelsCache = new Map();

export function isSyntheticLockKey(model) {
  return typeof model === "string" && (model.startsWith("websearch:") || model.startsWith("webfetch:"));
}

export function normalizeEligibilityModelId(model) {
  if (!model || typeof model !== "string") return "";
  if (isSyntheticLockKey(model)) return model;
  const withoutProvider = model.includes("/") ? model.slice(model.indexOf("/") + 1) : model;
  return withoutProvider
    .replace(/\[[^\]]+\]\s*$/, "")
    .replace(/\([^()]+\)\s*$/, "")
    .trim();
}

function makeCacheKey(connectionId, model) {
  const clean = normalizeEligibilityModelId(model).toLowerCase();
  if (!connectionId || !clean) return null;
  return `${connectionId}|${clean}`;
}

/**
 * Record a runtime upstream rejection indicating `model` is unsupported on `connectionId`.
 */
export function markModelUnsupportedForConnection(connectionId, model, options = {}) {
  if (!connectionId || connectionId === "noauth" || !model || isSyntheticLockKey(model)) return;
  const key = makeCacheKey(connectionId, model);
  if (!key) return;
  const now = Date.now();
  const ttlMs = Number.isFinite(options.ttlMs) && options.ttlMs > 0
    ? options.ttlMs
    : DEFAULT_UNSUPPORTED_MODEL_TTL_MS;
  unsupportedModelsCache.set(key, {
    expiresAt: now + ttlMs,
    recordedAt: now,
    status: options.status ?? null,
    reason: typeof options.reason === "string" ? options.reason.slice(0, 200) : "unsupported",
  });
}

/**
 * Clear unsupported-model cache entry for a connection+model (or all models for a connection).
 */
export function clearModelUnsupportedForConnection(connectionId, model = null) {
  if (!connectionId) return;
  if (!model) {
    const prefix = `${connectionId}|`;
    for (const key of unsupportedModelsCache.keys()) {
      if (key.startsWith(prefix)) unsupportedModelsCache.delete(key);
    }
    return;
  }
  const key = makeCacheKey(connectionId, model);
  if (key) unsupportedModelsCache.delete(key);
}

/**
 * Read active (non-expired) runtime unsupported entry for a connection+model.
 */
export function getUnsupportedModelEntry(connectionId, model) {
  const key = makeCacheKey(connectionId, model);
  if (!key) return null;
  const entry = unsupportedModelsCache.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    unsupportedModelsCache.delete(key);
    return null;
  }
  return entry;
}

export function isModelMarkedUnsupported(connectionId, model) {
  return Boolean(getUnsupportedModelEntry(connectionId, model));
}

export function getUnsupportedModelsCache() {
  return unsupportedModelsCache;
}

export function clearUnsupportedModelsCache(connectionId = null) {
  if (connectionId) {
    clearModelUnsupportedForConnection(connectionId, null);
    return;
  }
  unsupportedModelsCache.clear();
}

/**
 * Extract normalized Set of model IDs from an array of strings or model objects.
 */
export function extractModelIdSet(rawList) {
  if (!Array.isArray(rawList) || rawList.length === 0) return null;
  const out = new Set();
  for (const item of rawList) {
    const rawId = typeof item === "string" ? item : (item?.id || item?.modelId || item?.name || "");
    const clean = normalizeEligibilityModelId(rawId);
    if (rawId && typeof rawId === "string") out.add(rawId.trim());
    if (clean) out.add(clean);
  }
  return out.size > 0 ? out : null;
}

export function matchesAnyCandidate(idSet, candidates) {
  if (!idSet || idSet.size === 0 || !candidates || candidates.length === 0) return false;
  for (const c of candidates) {
    if (c && idSet.has(c)) return true;
  }
  const lowerSet = new Set([...idSet].map((v) => v.toLowerCase()));
  return candidates.some((c) => c && lowerSet.has(c.toLowerCase()));
}

/**
 * Evaluate connection.providerSpecificData.modelLimits against candidate model IDs.
 */
export function checkModelLimitsEligibility(modelLimits, candidates, authoritative = false) {
  if (!modelLimits || typeof modelLimits !== "object" || Array.isArray(modelLimits)) {
    return { eligible: true };
  }
  const entries = Object.entries(modelLimits);
  if (entries.length === 0) return { eligible: true };

  for (const candidate of candidates) {
    if (!candidate) continue;
    const entry = modelLimits[candidate] ?? entries.find(([k]) => k.toLowerCase() === candidate.toLowerCase())?.[1];
    if (entry && typeof entry === "object") {
      if (
        entry.supported === false ||
        entry.available === false ||
        entry.enabled === false ||
        entry.allowed === false
      ) {
        return { eligible: false, reason: "model_limit_unsupported" };
      }
      return { eligible: true };
    }
  }

  if (authoritative) {
    return { eligible: false, reason: "missing_from_model_limits" };
  }
  return { eligible: true };
}

/**
 * Check whether a connection is eligible to serve `model` before dispatching upstream.
 * Fail-open on cold start when no capability / tier / unsupported info is cached.
 *
 * @param {object} connection
 * @param {string} model
 * @param {object} [options]
 * @param {string} [options.providerId]
 * @param {Function} [options.isAntigravityModelSupported]
 * @returns {{ eligible: boolean, reason?: string }}
 */
export function isConnectionEligibleForModel(connection, model, options = {}) {
  if (!connection || !model || isSyntheticLockKey(model)) {
    return { eligible: true };
  }

  const clean = normalizeEligibilityModelId(model);
  if (!clean) return { eligible: true };
  const candidates = model === clean ? [clean] : [model, clean];

  // 1. Runtime unsupported model cache (fast, TTL-backed)
  if (candidates.some((c) => isModelMarkedUnsupported(connection.id, c))) {
    return { eligible: false, reason: "cached_unsupported" };
  }

  const psd = connection.providerSpecificData;
  if (psd && typeof psd === "object") {
    // 2. Explicit per-connection disabledModels
    const disabledSet = extractModelIdSet(psd.disabledModels);
    if (disabledSet && matchesAnyCandidate(disabledSet, candidates)) {
      return { eligible: false, reason: "disabled_for_connection" };
    }

    // 3. Explicit per-connection allowlist (enabledModels / supportedModels)
    const allowListRaw = Array.isArray(psd.enabledModels) && psd.enabledModels.length > 0
      ? psd.enabledModels
      : (Array.isArray(psd.supportedModels) && psd.supportedModels.length > 0 ? psd.supportedModels : null);
    const allowSet = extractModelIdSet(allowListRaw);
    if (allowSet && !matchesAnyCandidate(allowSet, candidates)) {
      return { eligible: false, reason: "not_in_enabled_models" };
    }

    // 4. Per-connection modelLimits map
    const limitsCheck = checkModelLimitsEligibility(
      psd.modelLimits,
      candidates,
      psd.modelLimitsAuthoritative === true
    );
    if (!limitsCheck.eligible) {
      return limitsCheck;
    }
  }

  // 5. Antigravity-specific capability, tier, and quota-map eligibility
  if (options.providerId === "antigravity" && typeof options.isAntigravityModelSupported === "function") {
    if (!options.isAntigravityModelSupported(connection.id, model, connection)) {
      return { eligible: false, reason: "antigravity_unsupported" };
    }
    return { eligible: true };
  }

  // 6. Generic fetched availableModels / models list on connection (non-Antigravity)
  if (psd && typeof psd === "object") {
    const fetchedRaw = Array.isArray(psd.availableModels) && psd.availableModels.length > 0
      ? psd.availableModels
      : (Array.isArray(psd.models) && psd.models.length > 0 ? psd.models : null);
    const fetchedSet = extractModelIdSet(fetchedRaw);
    if (fetchedSet && !matchesAnyCandidate(fetchedSet, candidates)) {
      return { eligible: false, reason: "not_in_available_models" };
    }
  }

  return { eligible: true };
}
