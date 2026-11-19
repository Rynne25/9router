import { NextResponse } from "next/server";
import { getProviderConnections } from "../../../../../models/index.js";

/**
 * GET /api/oauth/antigravity/export
 * Exports connections of antigravity to JSON array [{ email, refresh_token, tier, projectId }].
 */
export async function GET(request) {
  try {
    const connections = await getProviderConnections({ provider: "antigravity" });

    const exported = connections.map((conn) => ({
      email: conn.email || conn.name || "",
      refresh_token: conn.refreshToken || "",
      tier: conn.providerSpecificData?.subscriptionTier || conn.providerSpecificData?.tier || "free",
      projectId: conn.projectId || "",
    }));

    const url = new URL(request.url);
    const isDownload = url.searchParams.get("download") === "true";

    const headers = {
      "Content-Type": "application/json",
    };
    if (isDownload) {
      headers["Content-Disposition"] = 'attachment; filename="antigravity-accounts.json"';
    }

    return NextResponse.json(exported, {
      status: 200,
      headers,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error.message || "Failed to export Antigravity accounts" },
      { status: 500 }
    );
  }
}
