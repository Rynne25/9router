import { NextResponse } from "next/server";
import os from "os";
import { getSettings } from "@/lib/localDb";
import { getConsistentMachineId, isMasterReceiverMachine } from "@/shared/utils/machineId";
import { getOrCreateSyncToken } from "@/lib/sync/syncService";
import { getProviderConnections } from "@/lib/db/repos/connectionsRepo";
import { isPrivateOrLocalIp } from "@/lib/sync/peerDiscoveryService";

/**
 * GET /api/sync/discovery
 * Announce this 9Router Source instance to the Master Receiver on the local network.
 * Strictly disabled on the Master Receiver machine (1-way only).
 */
export async function GET(request) {
  try {
    // Master Receiver never announces or exports accounts to other machines
    if (await isMasterReceiverMachine()) {
      return NextResponse.json({ error: "Receiver-only host" }, { status: 403 });
    }

    // Check client IP
    const clientIp =
      request.headers.get("x-9r-real-ip") ||
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      "127.0.0.1";

    if (!isPrivateOrLocalIp(clientIp)) {
      return NextResponse.json({ error: "Discovery is restricted to local network" }, { status: 403 });
    }

    const settings = await getSettings();
    if (settings.syncAllowLanDiscovery === false) {
      return NextResponse.json({ error: "LAN discovery disabled on this host" }, { status: 403 });
    }

    const [machineId, syncToken, connections] = await Promise.all([
      getConsistentMachineId("9r-lan-discovery"),
      getOrCreateSyncToken(),
      getProviderConnections(),
    ]);

    return NextResponse.json({
      service: "9router",
      version: "0.5.119",
      hostname: os.hostname(),
      machineId,
      accountsCount: connections.length,
      autoSyncToken: syncToken,
      timestamp: Date.now(),
    });
  } catch (err) {
    console.error("[SyncDiscovery] Error:", err.message);
    return NextResponse.json({ error: "Internal discovery error" }, { status: 500 });
  }
}
