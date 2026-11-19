import { NextResponse } from "next/server";
import { getProviderConnectionById, getProviderConnections } from "../../../../../models/index.js";
import { switchAccount, detectActiveClientsStatus } from "../../../../../lib/antigravity/accountService.js";

/**
 * POST /api/oauth/antigravity/switch
 * Calls switchAccount(connectionId, target).
 *
 * Body: { connectionId: string, target?: "2.0" | "classic" | "ide" | "agy" | "cli" | "all" }
 */
export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const connectionId = body?.connectionId || body?.id;
    const target = (body?.target || "2.0").toLowerCase();

    if (!connectionId) {
      return NextResponse.json(
        { error: "connectionId is required to switch Antigravity account" },
        { status: 400 }
      );
    }

    const connection = await getProviderConnectionById(connectionId);
    if (!connection) {
      return NextResponse.json(
        { error: `Connection ${connectionId} not found` },
        { status: 404 }
      );
    }

    if (connection.provider !== "antigravity") {
      return NextResponse.json(
        { error: `Connection ${connectionId} is not an Antigravity connection (${connection.provider})` },
        { status: 400 }
      );
    }

    const validTargets = ["2.0", "classic", "ide", "agy", "cli", "all"];
    if (!validTargets.includes(target)) {
      return NextResponse.json(
        { error: `Invalid switch target "${target}". Expected one of: ${validTargets.join(", ")}` },
        { status: 400 }
      );
    }

    const switchResult = await switchAccount(connection, target);
    const allConnections = await getProviderConnections({ provider: "antigravity" });
    const activeClients = await detectActiveClientsStatus(allConnections).catch(() => null);

    return NextResponse.json({
      success: true,
      target: switchResult.target || target,
      connectionId: connection.id,
      email: connection.email || connection.name,
      path: switchResult.path,
      hotSwitched: Boolean(switchResult.hotSwitched),
      restarted: Boolean(switchResult.restarted),
      activeClients,
      message: `Successfully switched ${switchResult.target || target} to account ${connection.email || connection.name}`,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error.message || "Failed to switch Antigravity account" },
      { status: 500 }
    );
  }
}
