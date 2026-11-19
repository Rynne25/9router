import { NextResponse } from "next/server";
import { discoverLanPeers, autoSyncFromDiscoveredPeers, getCachedDiscoveredPeers } from "@/lib/sync/peerDiscoveryService";
import { isMasterReceiverMachine } from "@/shared/utils/machineId";

/**
 * GET /api/sync/peers
 * Discover other 9Router peers on the local network (Master Receiver only).
 */
export async function GET(request) {
  try {
    const isReceiver = await isMasterReceiverMachine();
    if (!isReceiver) {
      return NextResponse.json({ peers: [], hidden: true, timestamp: Date.now() });
    }

    const { searchParams } = new URL(request.url);
    const forceScan = searchParams.get("scan") === "true";

    const peers = forceScan ? await discoverLanPeers() : getCachedDiscoveredPeers();
    return NextResponse.json({
      peers,
      timestamp: Date.now(),
    });
  } catch (err) {
    console.error("[SyncPeers] Error:", err.message);
    return NextResponse.json({ error: "Failed to scan peers" }, { status: 500 });
  }
}

/**
 * POST /api/sync/peers
 * Trigger immediate autonomous discovery & sync (Master Receiver only).
 */
export async function POST() {
  try {
    const isReceiver = await isMasterReceiverMachine();
    if (!isReceiver) {
      return NextResponse.json({ success: true, result: null, hidden: true });
    }

    const result = await autoSyncFromDiscoveredPeers();
    return NextResponse.json({
      success: true,
      result,
    });
  } catch (err) {
    console.error("[SyncPeers] Auto-sync failed:", err.message);
    return NextResponse.json({ error: err.message || "Failed to auto-sync" }, { status: 500 });
  }
}
