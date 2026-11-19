import crypto from "crypto";
import { getSettings, updateSettings } from "@/lib/db/repos/settingsRepo.js";
import { getProviderConnections, createProviderConnection, updateProviderConnection } from "@/lib/db/repos/connectionsRepo.js";
import { isMasterReceiverMachine } from "@/shared/utils/machineId";

let _isSyncingInProgress = false;

/**
 * Generate a secure 64-character hex synchronization token.
 */
export function generateSyncToken() {
  return crypto.randomBytes(32).toString("hex");
}

/**
 * Get the current machine's sync token, or generate and persist one if not set.
 */
export async function getOrCreateSyncToken() {
  const settings = await getSettings();
  if (settings.syncToken && typeof settings.syncToken === "string" && settings.syncToken.length >= 32) {
    return settings.syncToken;
  }
  const newToken = generateSyncToken();
  await updateSettings({ syncToken: newToken });
  return newToken;
}

/**
 * Constant-time comparison of two tokens to prevent timing attacks and length leaks.
 */
export function verifySyncToken(providedToken, expectedToken) {
  if (!providedToken || !expectedToken) return false;
  if (typeof providedToken !== "string" || typeof expectedToken !== "string") return false;

  const hashProvided = crypto.createHash("sha256").update(providedToken).digest();
  const hashExpected = crypto.createHash("sha256").update(expectedToken).digest();

  return crypto.timingSafeEqual(hashProvided, hashExpected);
}

/**
 * Export accounts for a remote peer, filtered by provider list if specified.
 */
export async function getExportableAccounts(filterProviders = []) {
  const connections = await getProviderConnections();
  const allowed = Array.isArray(filterProviders) && filterProviders.length > 0
    ? new Set(filterProviders.map((p) => String(p).toLowerCase().trim()))
    : null;

  const filtered = allowed
    ? connections.filter((c) => allowed.has((c.provider || "").toLowerCase()))
    : connections;

  return filtered.map((c) => ({
    provider: c.provider,
    authType: c.authType || "oauth",
    name: c.name || null,
    email: c.email || null,
    displayName: c.displayName || null,
    accessToken: c.accessToken || null,
    refreshToken: c.refreshToken || null,
    expiresAt: c.expiresAt || null,
    tokenType: c.tokenType || null,
    scope: c.scope || null,
    projectId: c.projectId || null,
    apiKey: c.apiKey || null,
    providerSpecificData: c.providerSpecificData || {},
  }));
}

/**
 * Smart Merge incoming remote accounts into the local database without losing existing data.
 */
export async function smartMergeRemoteAccounts(remoteAccounts = []) {
  if (!Array.isArray(remoteAccounts)) {
    throw new Error("Invalid accounts payload: expected array");
  }
  if (remoteAccounts.length > 500) {
    throw new Error("Batch size exceeds 500 accounts limit");
  }

  const localAccounts = await getProviderConnections();
  const added = [];
  const updated = [];
  const skipped = [];

  for (const remote of remoteAccounts) {
    if (!remote || !remote.provider) {
      continue;
    }

    const provider = String(remote.provider).toLowerCase();
    const authType = remote.authType || "oauth";
    const remoteEmail = remote.email ? String(remote.email).toLowerCase().trim() : null;

    let existing = null;

    if (authType === "oauth") {
      existing = localAccounts.find((local) => {
        if ((local.provider || "").toLowerCase() !== provider) return false;
        if (local.authType !== "oauth") return false;

        // Match by email if present
        if (remoteEmail && (local.email || "").toLowerCase().trim() === remoteEmail) {
          const rWs = remote.providerSpecificData?.chatgptAccountId;
          const lWs = local.providerSpecificData?.chatgptAccountId;
          if (rWs && lWs) return rWs === lWs;
          return true;
        }

        // Match by refresh token if present
        if (remote.refreshToken && local.refreshToken && remote.refreshToken === local.refreshToken) {
          return true;
        }

        // Match by unique name if email is absent
        if (!remoteEmail && remote.name && local.name && remote.name.trim() === local.name.trim()) {
          return true;
        }

        return false;
      });
    } else if (authType === "apikey") {
      existing = localAccounts.find((local) => {
        if ((local.provider || "").toLowerCase() !== provider) return false;
        if (remote.apiKey && local.apiKey && remote.apiKey === local.apiKey) return true;
        if (remote.name && local.name && remote.name.trim() === local.name.trim()) return true;
        return false;
      });
    } else {
      existing = localAccounts.find((local) => {
        if ((local.provider || "").toLowerCase() !== provider) return false;
        if (remoteEmail && (local.email || "").toLowerCase().trim() === remoteEmail) return true;
        if (remote.name && local.name && remote.name.trim() === local.name.trim()) return true;
        return false;
      });
    }

    if (existing) {
      // Check if remote has newer tokens or refresh token to update
      let needsTokenUpdate = false;
      const patch = {};

      if (remote.refreshToken && remote.refreshToken !== existing.refreshToken) {
        patch.refreshToken = remote.refreshToken;
        needsTokenUpdate = true;
      }
      if (remote.accessToken && (!existing.accessToken || (remote.expiresAt && remote.expiresAt > (existing.expiresAt || 0)))) {
        patch.accessToken = remote.accessToken;
        patch.expiresAt = remote.expiresAt;
        needsTokenUpdate = true;
      }

      if (needsTokenUpdate) {
        await updateProviderConnection(existing.id, { ...patch, _skipBroadcast: true });
        updated.push({ provider, email: remoteEmail, name: existing.name });
      } else {
        skipped.push({ provider, email: remoteEmail, name: remote.name });
      }
      continue;
    }

    // New account: Insert cleanly with createProviderConnection
    try {
      const created = await createProviderConnection({
        ...remote,
        priority: null, // Automatically receives MAX(priority) + 1
        allowOverwrite: false,
        testStatus: "active",
        isActive: true,
        _skipBroadcast: true,
      });

      added.push({
        provider: created.provider,
        email: created.email,
        name: created.name,
      });
      // Add to local list cache so subsequent items in same batch can detect duplicates
      localAccounts.push(created);
    } catch (err) {
      console.warn(`[SyncService] Failed to insert new account ${remoteEmail || remote.name}:`, err.message);
    }
  }

  return {
    added,
    updated,
    skipped,
    totalRemote: remoteAccounts.length,
  };
}

/**
 * Validate that a remote URL is a legitimate HTTP/HTTPS address and not an internal metadata endpoint.
 */
function validatePeerUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== "string") {
    throw new Error("Remote URL is required");
  }
  const trimmed = rawUrl.trim().replace(/\/+$/, "");
  let parsed;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error("Invalid remote URL format");
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Remote URL must use http: or https:");
  }

  if (parsed.search || parsed.hash) {
    throw new Error("Remote URL must not contain query parameters or fragments");
  }
  if (parsed.username || parsed.password) {
    throw new Error("Remote URL must not contain credentials");
  }

  const host = parsed.hostname.toLowerCase();
  // Comprehensive check for AWS/GCP/Azure/Alibaba metadata and link-local ranges
  const isLinkLocal =
    host.startsWith("169.254.") ||
    host.includes("169.254.169.254") ||
    host === "2852039166" ||
    host === "0xa9fea9fe" ||
    host.includes("metadata.google.internal") ||
    host === "100.100.100.200";

  if (isLinkLocal) {
    throw new Error("Forbidden remote URL target");
  }

  return parsed.origin + parsed.pathname.replace(/\/+$/, "");
}

/**
 * Execute a pull sync from a remote 9Router instance.
 */
export async function executePullSync(customConfig = {}) {
  if (_isSyncingInProgress) {
    throw new Error("A sync operation is already in progress");
  }

  _isSyncingInProgress = true;
  const startedAt = new Date().toISOString();

  try {
    const settings = await getSettings();
    const remoteUrl = validatePeerUrl(customConfig.remoteUrl || settings.syncRemotePeerUrl);
    const remoteToken = (customConfig.remoteSyncToken || settings.syncRemoteToken || "").trim();
    const filterProviders = customConfig.providers || settings.syncFilterProviders || [];

    if (!remoteToken) {
      throw new Error("Remote sync token is required");
    }

    const query = filterProviders.length > 0 ? `?providers=${encodeURIComponent(filterProviders.join(","))}` : "";
    const targetUrl = `${remoteUrl}/api/sync/accounts${query}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    const response = await fetch(targetUrl, {
      method: "GET",
      headers: {
        "x-9r-sync-token": remoteToken,
        "Accept": "application/json",
      },
      signal: controller.signal,
      redirect: "error", // Disallow 301/302 redirects to prevent SSRF
    }).finally(() => clearTimeout(timeout));

    if (!response.ok) {
      const errText = await response.text().catch(() => "");
      let errMsg = `Remote returned HTTP ${response.status}`;
      try {
        const parsed = JSON.parse(errText);
        if (parsed.error && typeof parsed.error === "string") {
          errMsg = parsed.error.slice(0, 100);
        }
      } catch {
        // Do not exfiltrate raw response body to avoid semi-blind SSRF leak
      }
      throw new Error(errMsg);
    }

    const data = await response.json();
    const accounts = Array.isArray(data.accounts) ? data.accounts : [];

    const mergeResult = await smartMergeRemoteAccounts(accounts);

    const statusObj = {
      success: true,
      addedCount: mergeResult.added.length,
      updatedCount: mergeResult.updated.length,
      skippedCount: mergeResult.skipped.length,
      totalRemote: mergeResult.totalRemote,
      syncedAt: startedAt,
      addedAccounts: mergeResult.added,
    };

    await updateSettings({
      syncLastRunAt: startedAt,
      syncLastStatus: statusObj,
    });

    return statusObj;
  } catch (err) {
    const errorStatus = {
      success: false,
      addedCount: 0,
      updatedCount: 0,
      skippedCount: 0,
      totalRemote: 0,
      syncedAt: startedAt,
      error: err.message || "Sync failed",
    };

    try {
      await updateSettings({
        syncLastRunAt: startedAt,
        syncLastStatus: errorStatus,
      });
    } catch { /* best effort */ }

    throw err;
  } finally {
    _isSyncingInProgress = false;
  }
}

let _syncIntervalTimer = null;

/**
 * Start or restart the background one-way pull worker.
 * Runs completely autonomously in the background without user interaction.
 */
export async function startAccountSyncWorker() {
  if (_syncIntervalTimer) {
    clearInterval(_syncIntervalTimer);
    _syncIntervalTimer = null;
  }

  try {
    const isReceiver = await isMasterReceiverMachine();
    if (!isReceiver) {
      return false;
    }

    const settings = await getSettings();
    if (!settings.syncEnabled || !settings.syncRemotePeerUrl || !settings.syncRemoteToken) {
      return false;
    }

    // Trigger an immediate pull in the background
    executePullSync().catch((e) => {
      console.log("[AutoSync] Initial background pull skipped/failed:", e.message);
    });

    const intervalMin = Math.max(1, settings.syncAutoIntervalMinutes || 5);
    _syncIntervalTimer = setInterval(() => {
      executePullSync().catch((e) => {
        console.log("[AutoSync] Periodic 1-way pull failed:", e.message);
      });
    }, intervalMin * 60 * 1000);

    console.log(`[AutoSync] Background 1-way pull worker active (every ${intervalMin}m)`);
    return true;
  } catch (err) {
    console.error("[AutoSync] Failed to start account sync worker:", err);
    return false;
  }
}

/**
 * Stop the background one-way pull worker.
 */
export function stopAccountSyncWorker() {
  if (_syncIntervalTimer) {
    clearInterval(_syncIntervalTimer);
    _syncIntervalTimer = null;
    console.log("[AutoSync] Background 1-way pull worker stopped");
  }
}
