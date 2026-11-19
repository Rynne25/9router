import { NextResponse } from "next/server";
import { getProviderConnections, updateProviderConnection } from "../../../../../models/index.js";
import { exchangeRefreshToken, fetchProjectAndTier, checkErrorAndVerification } from "../../../../../lib/antigravity/accountService.js";
import { getAntigravityUsage } from "../../../../../../open-sse/services/usage/google.js";
import { getAntigravityEffectiveTier } from "../../../../../shared/utils/antigravityTier.js";
import { syncAntigravityUsageCache } from "../../../../../sse/services/antigravityQuota.js";

/**
 * Refreshes tokens, tier, and quota metadata for all Antigravity connections.
 */
async function handleRefreshAll() {
  const connections = await getProviderConnections({ provider: "antigravity" });

  if (connections.length === 0) {
    return {
      success: true,
      message: "No Antigravity connections found to refresh",
      total: 0,
      refreshedCount: 0,
      results: [],
    };
  }

  const results = [];
  let refreshedCount = 0;

  for (const conn of connections) {
    if (conn.providerSpecificData?.validationBlocked || conn.validationBlocked) {
      results.push({
        id: conn.id,
        email: conn.email,
        ok: false,
        skipped: true,
        error: "Tài khoản bị cấm/yêu cầu xác minh, đã bỏ qua tự động làm mới",
        verification: {
          isVerificationRequired: true,
          validationUrl: conn.validationUrl || conn.providerSpecificData?.validationUrl || null,
          appealUrl: conn.appealUrl || conn.providerSpecificData?.appealUrl || null,
          message: conn.validationReason || conn.providerSpecificData?.validationReason || "Verification Required",
        },
      });
      continue;
    }

    if (!conn.refreshToken) {
      results.push({
        id: conn.id,
        email: conn.email,
        ok: false,
        error: "Missing refresh token",
      });
      continue;
    }

    try {
      // 1. Refresh OAuth access token
      const tokens = await exchangeRefreshToken(conn.refreshToken);
      const accessToken = tokens.access_token;
      const refreshToken = tokens.refresh_token || conn.refreshToken;
      const expiresIn = tokens.expires_in || 3600;
      const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

      // 2. Fetch updated project ID and tier
      let projectId = conn.projectId;
      let tier = conn.providerSpecificData?.tier || "free";
      try {
        const assist = await fetchProjectAndTier(accessToken);
        if (assist.projectId) projectId = assist.projectId;
        if (assist.tier) tier = assist.tier;
      } catch {
        // Keep existing if loadCodeAssist fails
      }

      // 3. Fetch latest live quota data
      let quotaData = null;
      try {
        quotaData = await getAntigravityUsage(accessToken, {
          ...conn.providerSpecificData,
          projectId,
        });
        if (quotaData && !quotaData.message) {
          syncAntigravityUsageCache(conn.id, quotaData);
        }
      } catch {
        // Quota is best-effort
      }

      // 3b. Auto-infer effective tier if loadCodeAssist didn't return a paid tier
      const analyzedTier = getAntigravityEffectiveTier(
        {
          ...conn,
          providerSpecificData: {
            ...conn.providerSpecificData,
            tier,
            subscriptionTier: tier,
            quotas: quotaData?.quotas || conn.providerSpecificData?.quotas,
          },
        },
        quotaData
      );
      if (tier === "free" && analyzedTier !== "free") {
        tier = analyzedTier;
      }

      // 4. Update connection record in DB
      const updatedPsd = {
        ...(conn.providerSpecificData || {}),
        tier,
        subscriptionTier: tier,
        ...(quotaData?.quotas ? { quotas: quotaData.quotas } : {}),
        ...(Array.isArray(quotaData?.availableModels) && quotaData.availableModels.length > 0
          ? { availableModels: quotaData.availableModels }
          : {}),
        lastRefreshedAt: new Date().toISOString(),
      };

      await updateProviderConnection(conn.id, {
        accessToken,
        refreshToken,
        expiresIn,
        expiresAt,
        projectId,
        providerSpecificData: updatedPsd,
        testStatus: "active",
      });

      refreshedCount++;
      results.push({
        id: conn.id,
        email: conn.email,
        ok: true,
        tier,
        projectId,
        quotasCount: quotaData?.quotas ? Object.keys(quotaData.quotas).length : 0,
      });
    } catch (err) {
      const verification = checkErrorAndVerification(err);
      if (verification.isVerificationRequired) {
        await updateProviderConnection(conn.id, {
          validationBlocked: true,
          validationReason: verification.message,
          validationUrl: verification.validationUrl || verification.appealUrl,
          providerSpecificData: {
            ...(conn.providerSpecificData || {}),
            validationBlocked: true,
            validationReason: verification.message,
            validationUrl: verification.validationUrl || verification.appealUrl,
          },
        }).catch(() => {});
      }
      results.push({
        id: conn.id,
        email: conn.email,
        ok: false,
        error: err.message,
        verification,
      });
    }
  }

  return {
    success: true,
    total: connections.length,
    refreshedCount,
    results,
  };
}

/**
 * POST /api/oauth/antigravity/refresh-all
 */
export async function POST() {
  try {
    const data = await handleRefreshAll();
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      { error: error.message || "Failed to refresh Antigravity accounts" },
      { status: 500 }
    );
  }
}

/**
 * GET /api/oauth/antigravity/refresh-all
 */
export async function GET() {
  try {
    const data = await handleRefreshAll();
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      { error: error.message || "Failed to refresh Antigravity accounts" },
      { status: 500 }
    );
  }
}
