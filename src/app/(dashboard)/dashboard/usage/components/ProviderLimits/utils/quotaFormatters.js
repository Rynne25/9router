import { AI_PROVIDERS } from "@/shared/constants/providers";

// Maps the stored providerSpecificData.authMethod to a human label for Kiro.
const KIRO_METHOD_LABELS = {
  "builder-id": "AWS Builder ID",
  idc: "IAM Identity Center",
  google: "Google",
  github: "GitHub",
  imported: "Imported Token",
  api_key: "API Key",
};

export function providerLabel(providerId) {
  return AI_PROVIDERS[providerId]?.name || providerId;
}

export function kiroMethodLabel(conn) {
  const m = conn.providerSpecificData?.authMethod;
  if (m && KIRO_METHOD_LABELS[m]) return KIRO_METHOD_LABELS[m];
  return conn.authType === "api_key" ? "API Key" : "OAuth";
}

// Region is stored for builder-id/idc/api_key flows; social and imported flows
// omit it, so fall back to the region segment of the profileArn.
export function kiroRegion(conn) {
  const r = conn.providerSpecificData?.region;
  if (r) return r;
  const arn = conn.providerSpecificData?.profileArn;
  const seg = typeof arn === "string" ? arn.split(":")[3] : "";
  return seg || "";
}

export function formatCreditDate(value) {
  if (!value) return "N/A";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "N/A";
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function formatTimeRemaining(value) {
  if (!value) return "N/A";
  const diffMs = new Date(value).getTime() - Date.now();
  if (!Number.isFinite(diffMs)) return "N/A";
  if (diffMs <= 0) return "Expired";
  const totalHours = Math.ceil(diffMs / (60 * 60 * 1000));
  const days = Math.floor(totalHours / 24);
  const hours = totalHours % 24;
  return days > 0 ? `${days}d ${hours}h` : `${hours}h`;
}

/**
 * Format ISO date string to countdown format (inspired by vscode-antigravity-cockpit)
 * @param {string|Date} date - ISO date string or Date object
 * @returns {string} Formatted countdown (e.g., "2d 5h 30m", "4h 40m", "15m") or "-"
 */
export function formatResetTime(date) {
  if (!date) return "-";

  try {
    const resetDate = typeof date === "string" ? new Date(date) : date;
    const now = new Date();
    const diffMs = resetDate - now;

    if (diffMs <= 0) return "-";

    const totalMinutes = Math.ceil(diffMs / (1000 * 60));

    // < 60 minutes: show only minutes
    if (totalMinutes < 60) {
      return `${totalMinutes}m`;
    }

    const totalHours = Math.floor(totalMinutes / 60);
    const remainingMinutes = totalMinutes % 60;

    // < 24 hours: show hours and minutes
    if (totalHours < 24) {
      return `${totalHours}h ${remainingMinutes}m`;
    }

    // >= 24 hours: show days, hours, and minutes
    const days = Math.floor(totalHours / 24);
    const remainingHours = totalHours % 24;
    return `${days}d ${remainingHours}h ${remainingMinutes}m`;
  } catch {
    return "-";
  }
}

/**
 * Get Tailwind color class based on percentage
 * @param {number} percentage - Remaining percentage (0-100)
 * @returns {string} Color name: "green" | "yellow" | "red"
 */
export function getStatusColor(percentage) {
  if (percentage > 70) return "green";
  if (percentage >= 30) return "yellow";
  return "red"; // 0-29% including 0% (out of quota) - show red
}

/**
 * Get status emoji based on percentage
 * @param {number} percentage - Remaining percentage (0-100)
 * @returns {string} Emoji: "🟢" | "🟡" | "🔴"
 */
export function getStatusEmoji(percentage) {
  if (percentage > 70) return "🟢";
  if (percentage >= 30) return "🟡";
  return "🔴"; // 0-29% including 0% (out of quota) - show red
}

/**
 * Calculate remaining percentage
 * @param {number} used - Used amount
 * @param {number} total - Total amount
 * @returns {number} Remaining percentage (0-100)
 */
export function calculatePercentage(used, total) {
  if (!total || total === 0) return 0;
  if (!used || used < 0) return 100;
  if (used >= total) return 0;

  return Math.round(((total - used) / total) * 100);
}

/**
 * Get remaining percentage from a normalized quota row
 * @param {Object} quota - Normalized quota object
 * @returns {number} Remaining percentage (0-100)
 */
export function getRemainingPercentage(quota) {
  if (quota?.percentage !== undefined) {
    // Providers may report the used share; the UI renders the remaining one.
    const value = quota.percentageIsUsed === true ? 100 - quota.percentage : quota.percentage;
    return Math.max(0, Math.round(value));
  }

  if (quota?.remaining !== undefined) {
    return Math.max(0, Math.round(quota.remaining));
  }

  if (quota?.remainingPercentage !== undefined) {
    return Math.round(quota.remainingPercentage);
  }

  return calculatePercentage(quota?.used, quota?.total);
}

export function getQuotaVisibilityKey(quota) {
  if (!quota || typeof quota !== "object") return "";
  return String(quota.modelKey || quota.name || "").trim();
}

/**
 * Trim hidden quota keys to only those matching currently valid quotas.
 * Stale or obsolete model keys are dropped.
 */
export function trimHiddenQuotaKeys(hidden = [], quotas = []) {
  if (!Array.isArray(hidden) || hidden.length === 0) return [];
  const validKeys = new Set(quotas.map(getQuotaVisibilityKey).filter(Boolean));
  return [...new Set(hidden.map((k) => String(k).trim()).filter((k) => validKeys.has(k)))];
}

function getProviderHiddenQuotaSet(provider, quotaVisibility, quotas = []) {
  const hidden = quotaVisibility?.[provider]?.hidden;
  if (!Array.isArray(hidden) || hidden.length === 0) return new Set();
  const trimmed = quotas.length > 0 ? trimHiddenQuotaKeys(hidden, quotas) : hidden;
  return new Set(trimmed.map(String));
}

export function filterQuotasByVisibility(provider, quotas = [], quotaVisibility = {}) {
  if (!Array.isArray(quotas) || quotas.length === 0) return [];
  const hidden = getProviderHiddenQuotaSet(provider, quotaVisibility, quotas);
  if (hidden.size === 0) return quotas;
  return quotas.filter((quota) => !hidden.has(getQuotaVisibilityKey(quota)));
}

export function getHiddenQuotaRows(provider, quotas = [], quotaVisibility = {}) {
  if (!Array.isArray(quotas) || quotas.length === 0) return [];
  const hidden = getProviderHiddenQuotaSet(provider, quotaVisibility, quotas);
  if (hidden.size === 0) return [];
  return quotas.filter((quota) => hidden.has(getQuotaVisibilityKey(quota)));
}
