import { DEPLETED_QUOTA_THRESHOLD, QUOTA_CACHE_KEY } from "./constants";
import { getRemainingPercentage } from "./quotaFormatters";

export function getConnectionLabel(connection) {
  return connection.name?.trim()
    || connection.email?.trim()
    || connection.displayName?.trim()
    || null;
}

export function getConnectionSecondaryLabel(connection) {
  if (connection.name?.trim() && connection.email?.trim() && connection.name.trim() !== connection.email.trim()) {
    return connection.email.trim();
  }

  if (connection.name?.trim() && connection.displayName?.trim() && connection.name.trim() !== connection.displayName.trim()) {
    return connection.displayName.trim();
  }

  return null;
}

export function getConnectionQuotaRemaining(connection, quotaData) {
  const quota = quotaData[connection.id]?.quotas?.[0];
  if (!quota) return Number.POSITIVE_INFINITY;
  if (typeof quota.remaining === "number") return quota.remaining;
  return Number.POSITIVE_INFINITY;
}

// Stable group-by-provider: first-seen provider order, original order within group.
function groupByProviderStable(connections) {
  const seen = new Map();
  for (const conn of connections) {
    const key = conn.provider || "";
    if (!seen.has(key)) seen.set(key, []);
    seen.get(key).push(conn);
  }
  return Array.from(seen.values()).flat();
}

export function sortVisibleConnections(
  connections,
  quotaData,
  expiringFirst,
  providerFilter,
  quotaSortMode,
) {
  if (providerFilter === "codex" && quotaSortMode !== "default") {
    return [...connections].sort((a, b) => {
      const remainingA = getConnectionQuotaRemaining(a, quotaData);
      const remainingB = getConnectionQuotaRemaining(b, quotaData);
      const remainingDiff =
        quotaSortMode === "remaining-asc"
          ? remainingA - remainingB
          : remainingB - remainingA;
      if (remainingDiff !== 0) return remainingDiff;
      return (getConnectionLabel(a) || "").localeCompare(
        getConnectionLabel(b) || "",
      );
    });
  }

  if (!expiringFirst) return groupByProviderStable(connections);

  const getEarliestResetTime = (connection) => {
    const resetTimes = (quotaData[connection.id]?.quotas || [])
      .map((quota) =>
        quota.resetAt
          ? new Date(quota.resetAt).getTime()
          : Number.POSITIVE_INFINITY,
      )
      .filter((time) => Number.isFinite(time));
    return resetTimes.length > 0
      ? Math.min(...resetTimes)
      : Number.POSITIVE_INFINITY;
  };

  return [...connections].sort((a, b) => {
    const expiryDiff = getEarliestResetTime(a) - getEarliestResetTime(b);
    if (expiryDiff !== 0) return expiryDiff;
    return (
      (a.provider || "").localeCompare(b.provider || "") ||
      (getConnectionLabel(a) || "").localeCompare(getConnectionLabel(b) || "")
    );
  });
}

// Connection is fully depleted only when ALL valid models hit the threshold
export function isConnectionFullyDepleted(conn, quotaData) {
  const quotas = quotaData[conn.id]?.quotas;
  if (!quotas?.length) return false;
  const validQuotas = quotas.filter((q) => q.total && q.total > 0);
  if (!validQuotas.length) return false;
  return validQuotas.every((q) => getRemainingPercentage(q) <= DEPLETED_QUOTA_THRESHOLD);
}

// Connection is available when AT LEAST ONE valid model still has capacity
export function hasAvailableQuota(conn, quotaData, errors) {
  if (errors[conn.id] || conn.testStatus === "error" || conn.testStatus === "expired" || conn.validationBlocked) {
    return false;
  }
  const quotas = quotaData[conn.id]?.quotas;
  if (!quotas?.length) return true;
  const validQuotas = quotas.filter((q) => q.total && q.total > 0);
  if (!validQuotas.length) return true;
  return validQuotas.some((q) => getRemainingPercentage(q) > DEPLETED_QUOTA_THRESHOLD);
}

export function buildLoadingState(connections) {
  const nextLoadingState = {};
  connections.forEach((connection) => {
    nextLoadingState[connection.id] = true;
  });
  return nextLoadingState;
}

export function filterQuotaStateByConnections(state, connections) {
  const visibleIds = new Set(connections.map((connection) => connection.id));
  return Object.fromEntries(
    Object.entries(state).filter(([id]) => visibleIds.has(id)),
  );
}

export function getConnectionsPageRange(pagination) {
  if (!pagination.total) {
    return { start: 0, end: 0 };
  }
  const start = (pagination.page - 1) * pagination.pageSize + 1;
  const end = Math.min(pagination.page * pagination.pageSize, pagination.total);
  return { start, end };
}

export function getConnectionsEmptyMessage(totals, providerFilter, accountFilter) {
  if (!totals.eligibleConnections) {
    return {
      icon: "cloud_off",
      title: "No Providers Connected",
      description:
        "Connect to providers with OAuth to track your API quota limits and usage.",
    };
  }
  if (!totals.providerFilteredConnections) {
    return {
      icon: "filter_alt_off",
      title: "No Accounts Match Current Filters",
      description:
        providerFilter === "all"
          ? "Try changing the account status filter to see more quota trackers."
          : `No ${accountFilter === "inactive" ? "turned off" : accountFilter === "active" ? "active" : "matching"} accounts found for ${providerFilter}.`,
    };
  }
  return {
    icon: "filter_alt_off",
    title: "No Accounts On This Page",
    description:
      "Try moving to another page or refreshing the current filters.",
  };
}

export function sortRequestFromExpiringFirst(expiringFirst) {
  return expiringFirst ? "expiring" : "priority";
}

export function getPageSizeLabel(pageSize, isCustomPageSize) {
  return isCustomPageSize ? `Custom: ${pageSize} / page` : `${pageSize} / page`;
}

export function getConnectionsPaginationSummary(pagination) {
  const { start, end } = getConnectionsPageRange(pagination);
  return `Showing ${start}-${end} of ${pagination.total}`;
}

export function getSafePagination(pagination, fallbackPageSize) {
  return (
    pagination || {
      page: 1,
      pageSize: fallbackPageSize,
      total: 0,
      totalPages: 1,
    }
  );
}

export function getSafeTotals(totals, fallbackTotal = 0) {
  return (
    totals || {
      eligibleConnections: fallbackTotal,
      providerFilteredConnections: fallbackTotal,
    }
  );
}

export function shouldResetPage(previousValue, nextValue) {
  return previousValue !== nextValue;
}

export function getPaginationPageValue(dataPagination, fallbackPage) {
  return dataPagination?.page || fallbackPage;
}

export function getProviderOptions(dataProviderOptions) {
  return dataProviderOptions || [];
}

export async function reconcileConnectionsPage(fetchConnections, targetPage) {
  return await fetchConnections(targetPage);
}

export const QUOTA_FRESH_TTL_MS = 60_000;

export function isQuotaCacheFresh(entry, ttlMs = QUOTA_FRESH_TTL_MS) {
  if (!entry?.cachedAt) return false;
  const cachedMs = Date.parse(entry.cachedAt);
  return Number.isFinite(cachedMs) && Date.now() - cachedMs < ttlMs;
}

export function getQuotaCache() {
  if (typeof window === "undefined") return {};
  try {
    const cached = window.localStorage.getItem(QUOTA_CACHE_KEY);
    return cached ? JSON.parse(cached) : {};
  } catch (error) {
    console.error("Error reading quota cache:", error);
    return {};
  }
}

export function setQuotaCache(connectionId, quotaEntry) {
  if (typeof window === "undefined") return;
  try {
    const cache = getQuotaCache();
    cache[connectionId] = {
      ...quotaEntry,
      cachedAt: new Date().toISOString(),
    };
    window.localStorage.setItem(QUOTA_CACHE_KEY, JSON.stringify(cache));
  } catch (error) {
    console.error("Error writing quota cache:", error);
  }
}
