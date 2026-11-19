import { NextResponse } from "next/server";
import { executePullSync } from "@/lib/sync/syncService";
import { isMasterReceiverMachine } from "@/shared/utils/machineId";

/**
 * POST /api/sync/pull
 * Trigger pulling and smart-merging accounts from a remote peer (Master Receiver only).
 */
export async function POST(request) {
  try {
    const isReceiver = await isMasterReceiverMachine();
    if (!isReceiver) {
      return NextResponse.json({ error: "Not available on source machines" }, { status: 403 });
    }

    let body = {};
    try {
      body = await request.json();
    } catch {
      body = {};
    }

    const result = await executePullSync(body);
    return NextResponse.json(result);
  } catch (err) {
    console.error("[SyncAPI] Error executing pull sync:", err);
    return NextResponse.json(
      { error: err.message || "Failed to sync accounts from remote peer" },
      { status: 400 }
    );
  }
}
