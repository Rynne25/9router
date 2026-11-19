import { NextResponse } from "next/server";
import { getProviderConnections } from "../../../../../models/index.js";
import { detectActiveClientsStatus } from "../../../../../lib/antigravity/accountService.js";

/**
 * GET /api/oauth/antigravity/active-clients
 * Detects which stored Antigravity accounts are currently active in 2.0, IDE, and CLI.
 */
export async function GET() {
  try {
    const connections = await getProviderConnections({ provider: "antigravity" });
    const status = await detectActiveClientsStatus(connections);
    return NextResponse.json(status, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      { error: error.message || "Failed to detect active Antigravity clients" },
      { status: 500 }
    );
  }
}
