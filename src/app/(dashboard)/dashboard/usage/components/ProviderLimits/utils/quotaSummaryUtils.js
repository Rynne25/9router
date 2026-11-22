import { DEPLETED_QUOTA_THRESHOLD } from "./constants";
import { getRemainingPercentage } from "./quotaFormatters";
import { getAntigravityEffectiveTier, getTierBadgeLabel } from "./tierUtils";
import { providerLabel } from "./quotaFormatters";

export const CONNECTIONS_CACHE_KEY = "9r_quota_connections_cache_v1";
export const VIEW_PREFS_STORAGE_KEY = "9r_quota_view_prefs_v1";
const CONNECTIONS_CACHE_TTL_MS = 10 * 60 * 1000;

const memoryConnectionsCache = new Map();

export const TIER_FILTER_OPTIONS = [
  { value: "all", label: "Tất cả gói" },
  { value: "pro", label: "PRO (Argon / G1)" },
  { value: "plus", label: "PLUS (Google AI Plus)" },
  { value: "pro_jiro", label: "PRO JIRO" },
  { value: "ultra", label: "ULTRA" },
  { value: "enterprise", label: "ENTERPRISE" },
  { value: "free", label: "FREE" },
];

export const HEALTH_FILTER_OPTIONS = [
  { value: "all", label: "Tất cả tình trạng" },
  { value: "healthy", label: "Sẵn sàng (>30%)" },
  { value: "low", label: "Sắp hết (≤30%)" },
  { value: "exhausted", label: "Hết hạn mức" },
  { value: "blocked", label: "Lỗi / Cần xác minh 403" },
];

export function buildConnectionsCacheKey({
  providerFilter = "all",
  accountFilter = "all",
  page = 1,
  pageSize = 50,
} = {}) {
  return `${providerFilter}|${accountFilter}|${page}|${pageSize}`;
}

export function getMemoryConnectionsCache(cacheKey) {
  const entry = memoryConnectionsCache.get(cacheKey);
  if (!entry) return null;
  if (Date.now() - entry.cachedAtMs > CONNECTIONS_CACHE_TTL_MS) {
    memoryConnectionsCache.delete(cacheKey);
    return null;
  }
  return entry;
}

export function setMemoryConnectionsCache(cacheKey, snapshot) {
  if (!cacheKey || !snapshot) return;
  memoryConnectionsCache.set(cacheKey, {
    ...snapshot,
    cachedAtMs: Date.now(),
  });
}

export function readConnectionsStorageCache(cacheKey) {
  const mem = getMemoryConnectionsCache(cacheKey);
  if (mem) return mem;
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(CONNECTIONS_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const entry = parsed?.[cacheKey];
    if (!entry || !Array.isArray(entry.connections)) return null;
    if (Date.now() - (entry.cachedAtMs || 0) > CONNECTIONS_CACHE_TTL_MS) return null;
    memoryConnectionsCache.set(cacheKey, entry);
    return entry;
  } catch {
    return null;
  }
}

export function writeConnectionsStorageCache(cacheKey, snapshot) {
  const entry = {
    ...snapshot,
    cachedAtMs: Date.now(),
  };
  memoryConnectionsCache.set(cacheKey, entry);
  if (typeof window === "undefined") return;
  try {
    const raw = window.localStorage.getItem(CONNECTIONS_CACHE_KEY);
    const store = raw ? JSON.parse(raw) : {};
    store[cacheKey] = entry;
    // Keep only the 8 most recent cache keys to avoid bloating localStorage
    const keys = Object.keys(store);
    if (keys.length > 8) {
      keys
        .sort((a, b) => (store[a]?.cachedAtMs || 0) - (store[b]?.cachedAtMs || 0))
        .slice(0, keys.length - 8)
        .forEach((oldKey) => delete store[oldKey]);
    }
    window.localStorage.setItem(CONNECTIONS_CACHE_KEY, JSON.stringify(store));
  } catch {
    // Non-fatal: storage quota exceeded or private browsing
  }
}

export function clearConnectionsCacheForTest() {
  memoryConnectionsCache.clear();
}

const ANTIGRAVITY_PILL_DEFS = [
  {
    id: "argon4",
    label: "Argon 4",
    tone: "violet",
    match: (key) => key.includes("argon"),
  },
  {
    id: "g1pro",
    label: "G1 Pro",
    tone: "purple",
    match: (key) => key.includes("orchestrator") || key.includes("g1-pro") || key.includes("g1pro"),
  },
  {
    id: "claude",
    label: "Claude",
    tone: "amber",
    match: (key) => key.startsWith("claude-") || key === "claude" || key === "claude_gpt_session",
  },
  {
    id: "gemini",
    label: "Gemini 3.8",
    tone: "sky",
    match: (key) =>
      (key.startsWith("gemini-3") && !key.includes("image")) ||
      key.startsWith("gemini-pro") ||
      key === "gemini_session" ||
      key === "gemini_weekly" ||
      key === "gemini",
  },
  {
    id: "hydrogen",
    label: "Hydrogen 4",
    tone: "cyan",
    match: (key) => key.includes("hydrogen"),
  },
  {
    id: "image",
    label: "Flash Image",
    tone: "pink",
    match: (key) => key.includes("image"),
  },
];

function collectRawModelKeys(connection, quotaEntry) {
  const keys = new Set();
  const addKey = (val) => {
    if (!val) return;
    const normalized = String(val).trim().toLowerCase();
    if (normalized) keys.add(normalized);
  };

  const availableModels = quotaEntry?.raw?.availableModels;
  if (Array.isArray(availableModels)) {
    availableModels.forEach(addKey);
  }

  const rawQuotas = quotaEntry?.raw?.quotas;
  if (rawQuotas && typeof rawQuotas === "object") {
    Object.keys(rawQuotas).forEach(addKey);
  }

  const psdQuotas = connection?.providerSpecificData?.quotas || connection?.quotas;
  if (psdQuotas && typeof psdQuotas === "object") {
    if (Array.isArray(psdQuotas)) {
      psdQuotas.forEach((q) => {
        addKey(q?.modelKey);
        addKey(q?.id);
        addKey(q?.name);
      });
    } else {
      Object.keys(psdQuotas).forEach(addKey);
    }
  }

  const psdModels = connection?.providerSpecificData?.models || connection?.models;
  if (Array.isArray(psdModels)) {
    psdModels.forEach((m) => addKey(typeof m === "string" ? m : m?.id || m?.name));
  }

  if (Array.isArray(quotaEntry?.quotas)) {
    quotaEntry.quotas.forEach((q) => {
      addKey(q?.modelKey);
      addKey(q?.name);
    });
  }

  return [...keys];
}

/**
 * Extracts crisp supported model capability pills for an account card.
 * @param {object} connection
 * @param {object|null} quotaEntry
 * @returns {Array<{ id: string, label: string, tone: string }>}
 */
export function extractSupportedModelPills(connection, quotaEntry = null) {
  if (!connection) return [];
  const rawKeys = collectRawModelKeys(connection, quotaEntry);
  if (rawKeys.length === 0) return [];

  if (connection.provider === "antigravity") {
    const tier = getAntigravityEffectiveTier(connection, quotaEntry);
    const pills = [];
    for (const def of ANTIGRAVITY_PILL_DEFS) {
      // Free-tier accounts include a 0% claude_gpt_weekly placeholder without actual Claude access
      if (def.id === "claude" && tier === "free") {
        const hasExplicitClaudeModel = rawKeys.some(
          (k) => k.startsWith("claude-") || k === "claude_gpt_session",
        );
        if (!hasExplicitClaudeModel) continue;
      }
      if (rawKeys.some((k) => def.match(k))) {
        pills.push({ id: def.id, label: def.label, tone: def.tone });
      }
    }
    return pills;
  }

  if (connection.provider === "codex") {
    const pills = [];
    if (rawKeys.some((k) => k === "session" || k === "weekly" || k.includes("5h"))) {
      pills.push({ id: "codex-core", label: "Codex 5h/Weekly", tone: "emerald" });
    }
    if (rawKeys.some((k) => k.includes("spark"))) {
      pills.push({ id: "spark", label: "Spark", tone: "amber" });
    }
    if (rawKeys.some((k) => k.includes("review"))) {
      pills.push({ id: "review", label: "Code Review", tone: "sky" });
    }
    return pills;
  }

  if (connection.provider === "claude") {
    const pills = [];
    if (rawKeys.some((k) => k.includes("session") || k.includes("weekly"))) {
      pills.push({ id: "claude-core", label: "Sonnet / Haiku", tone: "amber" });
    }
    if (rawKeys.some((k) => k.includes("opus"))) {
      pills.push({ id: "opus", label: "Opus", tone: "purple" });
    }
    if (rawKeys.some((k) => k.includes("fable"))) {
      pills.push({ id: "fable", label: "Fable", tone: "violet" });
    }
    return pills;
  }

  if (Array.isArray(quotaEntry?.quotas) && quotaEntry.quotas.length > 0) {
    return quotaEntry.quotas.slice(0, 4).map((q, idx) => ({
      id: `${q.modelKey || q.name || idx}`,
      label: q.name,
      tone: "slate",
    }));
  }

  return [];
}

/**
 * Computes average remaining quota percentage across finite non-unlimited quota rows.
 * @param {object|null} quotaEntry
 * @returns {number|null}
 */
export function getConnectionAverageRemaining(quotaEntry) {
  const quotas = quotaEntry?.quotas;
  if (!Array.isArray(quotas) || quotas.length === 0) return null;
  const finite = quotas.filter(
    (q) => q && q.unlimited !== true && q.isCreditBalance !== true && (q.total > 0 || q.remainingPercentage !== undefined || q.percentage !== undefined || q.remaining !== undefined),
  );
  if (finite.length === 0) return null;
  const sum = finite.reduce((acc, q) => acc + getRemainingPercentage(q), 0);
  return Math.round(sum / finite.length);
}

/**
 * Computes minimum remaining quota percentage for sorting / health checks.
 * @param {object|null} quotaEntry
 * @returns {number|null}
 */
export function getConnectionMinRemaining(quotaEntry) {
  const quotas = quotaEntry?.quotas;
  if (!Array.isArray(quotas) || quotas.length === 0) return null;
  const finite = quotas.filter(
    (q) => q && q.unlimited !== true && q.isCreditBalance !== true && (q.total > 0 || q.remainingPercentage !== undefined || q.percentage !== undefined || q.remaining !== undefined),
  );
  if (finite.length === 0) return null;
  return Math.min(...finite.map((q) => getRemainingPercentage(q)));
}

export function isConnectionValidationBlocked(connection) {
  return Boolean(
    connection?.validationBlocked ||
    connection?.isValidationBlocked ||
    connection?.providerSpecificData?.validationBlocked ||
    connection?.providerSpecificData?.isValidationBlocked,
  );
}

export function getConnectionValidationUrl(connection) {
  return (
    connection?.validationUrl ||
    connection?.appealUrl ||
    connection?.providerSpecificData?.validationUrl ||
    connection?.providerSpecificData?.appealUrl ||
    null
  );
}

/**
 * Determines health status of a connection for badge color & filtering.
 * @returns {"disabled" | "blocked" | "error" | "exhausted" | "low" | "healthy" | "loading"}
 */
export function getConnectionHealthStatus(connection, quotaEntry = null, error = null) {
  if (connection?.isActive === false) return "disabled";
  if (isConnectionValidationBlocked(connection)) return "blocked";
  if (error || connection?.testStatus === "error" || connection?.testStatus === "expired") {
    return "error";
  }
  const quotas = quotaEntry?.quotas;
  if (!Array.isArray(quotas) || quotas.length === 0) return "loading";
  const finite = quotas.filter((q) => q && q.unlimited !== true && q.isCreditBalance !== true && q.total > 0);
  if (finite.length === 0) return "healthy";
  const allDepleted = finite.every((q) => getRemainingPercentage(q) <= DEPLETED_QUOTA_THRESHOLD);
  if (allDepleted) return "exhausted";
  const anyLow = finite.some((q) => getRemainingPercentage(q) <= 30);
  if (anyLow) return "low";
  return "healthy";
}

/**
 * Fast client-side search matching email, name, displayName, provider, tier, or supported model.
 */
export function matchesAccountSearch(connection, quotaEntry, searchQuery) {
  const q = String(searchQuery || "").trim().toLowerCase();
  if (!q) return true;

  const tokens = q.split(/\s+/).filter(Boolean);
  const pills = extractSupportedModelPills(connection, quotaEntry);
  const tier = connection.provider === "antigravity"
    ? getAntigravityEffectiveTier(connection, quotaEntry)
    : "";
  const tierLabel = tier ? getTierBadgeLabel(tier) : "";

  const searchableParts = [
    connection.name,
    connection.email,
    connection.displayName,
    connection.provider,
    providerLabel(connection.provider),
    tier,
    tierLabel,
    quotaEntry?.plan,
    ...pills.map((p) => p.label),
    ...collectRawModelKeys(connection, quotaEntry).slice(0, 40),
  ]
    .filter(Boolean)
    .map((s) => String(s).toLowerCase());

  const haystack = searchableParts.join(" ");
  return tokens.every((token) => haystack.includes(token));
}

export function filterConnectionsClientSide(
  connections = [],
  quotaData = {},
  errors = {},
  { searchQuery = "", tierFilter = "all", healthFilter = "all" } = {},
) {
  return connections.filter((conn) => {
    const quotaEntry = quotaData[conn.id] || null;
    const error = errors[conn.id] || null;

    if (searchQuery && !matchesAccountSearch(conn, quotaEntry, searchQuery)) {
      return false;
    }

    if (tierFilter !== "all") {
      if (conn.provider !== "antigravity") return false;
      const effectiveTier = getAntigravityEffectiveTier(conn, quotaEntry);
      if (effectiveTier !== tierFilter) return false;
    }

    if (healthFilter !== "all") {
      const status = getConnectionHealthStatus(conn, quotaEntry, error);
      if (healthFilter === "healthy" && status !== "healthy" && status !== "loading") {
        return false;
      }
      if (healthFilter === "low" && status !== "low") {
        return false;
      }
      if (healthFilter === "exhausted" && status !== "exhausted") {
        return false;
      }
      if (healthFilter === "blocked" && status !== "blocked" && status !== "error") {
        return false;
      }
    }

    return true;
  });
}

export function sortConnectionsEnhanced(
  connections = [],
  quotaData = {},
  { expiringFirst = false, quotaSortMode = "default" } = {},
) {
  if (quotaSortMode === "remaining-asc" || quotaSortMode === "remaining-desc") {
    return [...connections].sort((a, b) => {
      const avgA = getConnectionAverageRemaining(quotaData[a.id]);
      const avgB = getConnectionAverageRemaining(quotaData[b.id]);
      const valA = avgA === null ? (quotaSortMode === "remaining-asc" ? Number.POSITIVE_INFINITY : -1) : avgA;
      const valB = avgB === null ? (quotaSortMode === "remaining-asc" ? Number.POSITIVE_INFINITY : -1) : avgB;
      const diff = quotaSortMode === "remaining-asc" ? valA - valB : valB - valA;
      if (diff !== 0) return diff;
      return (a.name || a.email || "").localeCompare(b.name || b.email || "");
    });
  }

  if (expiringFirst) {
    const getEarliestReset = (conn) => {
      const times = (quotaData[conn.id]?.quotas || [])
        .map((q) => (q.resetAt ? new Date(q.resetAt).getTime() : Number.POSITIVE_INFINITY))
        .filter((t) => Number.isFinite(t));
      return times.length > 0 ? Math.min(...times) : Number.POSITIVE_INFINITY;
    };

    return [...connections].sort((a, b) => {
      const diff = getEarliestReset(a) - getEarliestReset(b);
      if (diff !== 0) return diff;
      return (a.provider || "").localeCompare(b.provider || "");
    });
  }

  // Group by provider preserving first-seen order
  const groups = new Map();
  for (const conn of connections) {
    const key = conn.provider || "";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(conn);
  }
  return Array.from(groups.values()).flat();
}

export function computeQuotaSummaryStats({
  connections = [],
  filteredConnections = [],
  quotaData = {},
  errors = {},
  totals = {},
} = {}) {
  let activeCount = 0;
  let disabledCount = 0;
  let healthyCount = 0;
  let lowCount = 0;
  let exhaustedCount = 0;
  let blockedCount = 0;
  let remainingSum = 0;
  let remainingSamples = 0;

  const providerMap = new Map();

  for (const conn of connections) {
    const isActive = conn.isActive !== false;
    if (isActive) activeCount += 1;
    else disabledCount += 1;

    const pKey = conn.provider || "unknown";
    if (!providerMap.has(pKey)) {
      providerMap.set(pKey, {
        provider: pKey,
        label: providerLabel(pKey),
        count: 0,
        activeCount: 0,
      });
    }
    const pEntry = providerMap.get(pKey);
    pEntry.count += 1;
    if (isActive) pEntry.activeCount += 1;

    const quotaEntry = quotaData[conn.id] || null;
    const error = errors[conn.id] || null;
    const status = getConnectionHealthStatus(conn, quotaEntry, error);
    if (status === "healthy") healthyCount += 1;
    else if (status === "low") lowCount += 1;
    else if (status === "exhausted") exhaustedCount += 1;
    else if (status === "blocked" || status === "error") blockedCount += 1;

    if (isActive) {
      const avg = getConnectionAverageRemaining(quotaEntry);
      if (avg !== null) {
        remainingSum += avg;
        remainingSamples += 1;
      }
    }
  }

  const providerBreakdown = Array.from(providerMap.values()).sort(
    (a, b) => b.count - a.count || a.label.localeCompare(b.label),
  );

  return {
    totalAccounts: totals?.eligibleConnections || connections.length,
    loadedAccounts: connections.length,
    filteredTotal: filteredConnections.length,
    activeCount,
    disabledCount,
    healthyCount,
    lowCount,
    exhaustedCount,
    blockedCount,
    avgRemainingPct: remainingSamples > 0 ? Math.round(remainingSum / remainingSamples) : null,
    providerBreakdown,
  };
}

/**
 * Normalizes POST /api/oauth/antigravity/warmup response for UI feedback.
 */
export function parseWarmupApiResponse(resOk, data = {}, connection = null) {
  const result = data?.result || data || {};
  const ok = Boolean(resOk && data?.success !== false && result?.ok !== false);
  const verification = result?.verification || data?.verification || null;
  const validationUrl =
    verification?.validationUrl ||
    verification?.appealUrl ||
    data?.validationUrl ||
    getConnectionValidationUrl(connection) ||
    null;
  const rawError = result?.error || data?.error || "";
  const isVerificationRequired = Boolean(
    verification?.isVerificationRequired ||
    (typeof rawError === "string" && (rawError.includes("403") || /verify\s+your\s+account/i.test(rawError))),
  );

  if (ok) {
    const model = result?.model || "gemini-3.8-flash";
    return {
      ok: true,
      type: "success",
      model,
      message: `Làm nóng thành công (${model}) — hạn mức tuần đã kích hoạt.`,
      validationUrl: null,
      isVerificationRequired: false,
    };
  }

  const message = isVerificationRequired
    ? "Tài khoản cần xác minh Google (403) trước khi sử dụng."
    : rawError || "Làm nóng tài khoản thất bại";

  return {
    ok: false,
    type: "error",
    model: result?.model || null,
    message,
    validationUrl,
    isVerificationRequired,
  };
}
