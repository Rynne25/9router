import { NextResponse } from "next/server";
import { scanLocalDbs } from "../../../../../lib/antigravity/dbScanner.js";
import { getUserInfo, fetchProjectAndTier, exchangeRefreshToken } from "../../../../../lib/antigravity/accountService.js";

/**
 * GET /api/oauth/antigravity/scan-db
 * Scans local state.vscdb and returns detected accounts list.
 */
export async function GET() {
  try {
    const rawAccounts = scanLocalDbs();
    const enrichedAccounts = [];

    for (const acc of rawAccounts) {
      const enriched = { ...acc };

      // Attempt to resolve email and tier if not already present
      if (!enriched.email && enriched.refreshToken) {
        try {
          // If we have an accessToken, try userinfo; otherwise do a quick exchange
          let token = enriched.accessToken;
          if (!token) {
            const tokenRes = await exchangeRefreshToken(enriched.refreshToken).catch(() => null);
            token = tokenRes?.access_token;
            if (token) enriched.accessToken = token;
          }

          if (token) {
            const [userInfo, assist] = await Promise.all([
              getUserInfo(token).catch(() => null),
              fetchProjectAndTier(token).catch(() => null),
            ]);

            if (userInfo?.email) {
              enriched.email = userInfo.email;
              enriched.name = userInfo.name || userInfo.email;
            }
            if (assist?.projectId && !enriched.projectId) {
              enriched.projectId = assist.projectId;
            }
            if (assist?.tier && !enriched.tier) {
              enriched.tier = assist.tier;
            }
          }
        } catch {
          // Best-effort enrichment — ignore network failures
        }
      }

      if (!enriched.tier) enriched.tier = "free";
      enrichedAccounts.push(enriched);
    }

    return NextResponse.json({
      success: true,
      accounts: enrichedAccounts,
      total: enrichedAccounts.length,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error.message || "Failed to scan local database" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/oauth/antigravity/scan-db
 * Optional POST variant supporting custom dbPath.
 */
export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const customPath = body?.path || body?.dbPath || null;
    const accounts = scanLocalDbs(customPath);

    return NextResponse.json({
      success: true,
      accounts,
      total: accounts.length,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error.message || "Failed to scan database" },
      { status: 500 }
    );
  }
}
