import { NextResponse } from "next/server";
import { popPendingSyncNotifications, getUniversalSyncStatus, pollCloudBuffer } from "@/lib/sync/universalSyncEngine";
import { isMasterReceiverMachine } from "@/shared/utils/machineId";

/**
 * GET /api/sync/events
 * Returns any new sync notifications received from remote machines (Master Receiver only).
 */
export async function GET(request) {
  try {
    const isReceiver = await isMasterReceiverMachine();
    if (!isReceiver) {
      return NextResponse.json({
        notifications: [],
        hidden: true,
        timestamp: Date.now(),
      });
    }

    const { searchParams } = new URL(request.url);
    if (searchParams.get("check") === "true") {
      await pollCloudBuffer();
    }

    const notifications = popPendingSyncNotifications();
    const status = getUniversalSyncStatus();

    return NextResponse.json({
      notifications,
      status,
      timestamp: Date.now(),
    });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
