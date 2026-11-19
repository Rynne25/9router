import { NextResponse } from "next/server";
import { createProviderConnection } from "../../../../../models/index.js";
import {
  exchangeRefreshToken,
  getUserInfo,
  fetchProjectAndTier,
  checkErrorAndVerification,
} from "../../../../../lib/antigravity/accountService.js";

const REFRESH_TOKEN_REGEX = /1\/\/[a-zA-Z0-9_\-]+/g;

/**
 * Normalizes request payload into a list of { token, email, tier, projectId, isGcpTos, serviceMachineId } items.
 */
function extractTokenItems(body) {
  const items = [];
  const tokenMap = new Map();

  const registerItem = (token, meta = {}) => {
    if (!token || typeof token !== "string") return;
    const cleanToken = token.trim();
    if (!cleanToken.startsWith("1//")) return;

    if (!tokenMap.has(cleanToken)) {
      const item = {
        token: cleanToken,
        email: meta.email || null,
        tier: meta.tier || meta.subscriptionTier || null,
        projectId: meta.projectId || meta.enterpriseGcpProjectId || null,
        isGcpTos: meta.isGcpTos === true,
        serviceMachineId: meta.serviceMachineId || null,
      };
      tokenMap.set(cleanToken, item);
      items.push(item);
    } else {
      // Merge metadata if previously missing
      const existing = tokenMap.get(cleanToken);
      if (!existing.email && meta.email) existing.email = meta.email;
      if (!existing.tier && (meta.tier || meta.subscriptionTier)) {
        existing.tier = meta.tier || meta.subscriptionTier;
      }
      if (!existing.projectId && (meta.projectId || meta.enterpriseGcpProjectId)) {
        existing.projectId = meta.projectId || meta.enterpriseGcpProjectId;
      }
    }
  };

  // Case 1: Body is an Array
  if (Array.isArray(body)) {
    for (const entry of body) {
      if (typeof entry === "string") {
        const matches = entry.match(REFRESH_TOKEN_REGEX) || [];
        for (const m of matches) registerItem(m);
      } else if (entry && typeof entry === "object") {
        const rt = entry.refresh_token || entry.refreshToken || entry.token;
        if (typeof rt === "string") registerItem(rt, entry);
      }
    }
    return items;
  }

  if (!body || typeof body !== "object") return items;

  // Case 2: Body has accounts array
  if (Array.isArray(body.accounts)) {
    for (const acc of body.accounts) {
      if (acc && typeof acc === "object") {
        const rt = acc.refresh_token || acc.refreshToken || acc.token;
        if (typeof rt === "string") registerItem(rt, acc);
      }
    }
  }

  // Case 3: Body has tokens array
  if (Array.isArray(body.tokens)) {
    for (const tok of body.tokens) {
      if (typeof tok === "string") {
        const matches = tok.match(REFRESH_TOKEN_REGEX) || [];
        for (const m of matches) registerItem(m);
      }
    }
  }

  // Case 4: Single token / refreshToken
  const single = body.token || body.refreshToken || body.refresh_token;
  if (typeof single === "string") {
    const matches = single.match(REFRESH_TOKEN_REGEX) || [];
    for (const m of matches) registerItem(m, body);
  }

  // Case 5: Raw input string (multiline or JSON string)
  if (typeof body.input === "string") {
    const trimmed = body.input.trim();
    if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
      try {
        const parsed = JSON.parse(trimmed);
        const parsedItems = extractTokenItems(parsed);
        for (const p of parsedItems) registerItem(p.token, p);
      } catch {
        // Fall back to regex
      }
    }
    const matches = trimmed.match(REFRESH_TOKEN_REGEX) || [];
    for (const m of matches) registerItem(m);
  }

  return items;
}

/**
 * POST /api/oauth/antigravity/import-token
 * Accepts single token, multiline string, or JSON array [{ email, refresh_token }].
 */
export async function POST(request) {
  try {
    let body;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON request body" },
        { status: 400 }
      );
    }

    const items = extractTokenItems(body);

    if (items.length === 0) {
      return NextResponse.json(
        {
          error: "No valid Antigravity refresh tokens found. Token must start with 1//",
          success: 0,
          failed: 0,
          results: [],
        },
        { status: 400 }
      );
    }

    const results = [];
    let successCount = 0;
    let failedCount = 0;

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      try {
        // 1. Exchange refresh token for fresh access token
        const tokenRes = await exchangeRefreshToken(item.token);
        const accessToken = tokenRes.access_token;
        const refreshToken = tokenRes.refresh_token || item.token;
        const expiresIn = tokenRes.expires_in || 3600;

        // 2. Fetch User Info if email is not yet available
        let email = item.email;
        if (!email && accessToken) {
          try {
            const userInfo = await getUserInfo(accessToken);
            email = userInfo?.email || null;
          } catch {
            // Keep email null if userinfo fails
          }
        }

        // 3. Fetch Project ID and normalized Tier
        let projectId = item.projectId;
        let tier = item.tier;
        if ((!projectId || !tier) && accessToken) {
          try {
            const assist = await fetchProjectAndTier(accessToken);
            if (!projectId) projectId = assist.projectId || "";
            if (!tier) tier = assist.tier;
          } catch {
            if (!tier) tier = "free";
          }
        }

        // 4. Save connection in database
        const connectionName = email || `Antigravity Account`;
        const connection = await createProviderConnection({
          provider: "antigravity",
          authType: "oauth",
          name: connectionName,
          email: email || null,
          accessToken,
          refreshToken,
          expiresIn,
          expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString(),
          projectId: projectId || null,
          providerSpecificData: {
            tier: tier || "free",
            subscriptionTier: tier || "free",
            isGcpTos: item.isGcpTos === true,
            serviceMachineId: item.serviceMachineId || null,
            lastImportedAt: new Date().toISOString(),
          },
          testStatus: "active",
        });

        successCount++;
        results.push({
          ok: true,
          index: i + 1,
          id: connection.id,
          email: connection.email,
          tier: tier || "free",
          projectId: projectId || null,
        });
      } catch (err) {
        failedCount++;
        const verification = checkErrorAndVerification(err);
        results.push({
          ok: false,
          index: i + 1,
          token: `${item.token.slice(0, 10)}...`,
          error: err.message,
          verification,
        });
      }
    }

    return NextResponse.json({
      success: successCount,
      imported: successCount,
      failed: failedCount,
      total: items.length,
      results,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error.message || "Failed to process import-token request" },
      { status: 500 }
    );
  }
}
