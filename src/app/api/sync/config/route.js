import { NextResponse } from "next/server";
import { getSettings, updateSettings } from "@/lib/localDb";
import { getOrCreateSyncToken, generateSyncToken, startAccountSyncWorker } from "@/lib/sync/syncService";
import { isMasterReceiverMachine } from "@/shared/utils/machineId";

/**
 * GET /api/sync/config
 * Returns current machine sync settings.
 * Source (sender) machines receive `{ isReceiver: false, hidden: true }` so all sync UI stays completely invisible.
 */
export async function GET() {
  try {
    const isReceiver = await isMasterReceiverMachine();
    if (!isReceiver) {
      return NextResponse.json({
        syncRole: "sender",
        isReceiver: false,
        hidden: true,
      });
    }

    const settings = await getSettings();
    const syncToken = await getOrCreateSyncToken();

    return NextResponse.json({
      syncRole: "receiver",
      isReceiver: true,
      syncToken,
      syncEnabled: settings.syncEnabled !== false,
      syncRemotePeerUrl: settings.syncRemotePeerUrl || "",
      syncRemoteToken: settings.syncRemoteToken || "",
      syncAutoIntervalMinutes: settings.syncAutoIntervalMinutes ?? 5,
      syncOnPageLoad: settings.syncOnPageLoad !== false,
      syncFilterProviders: settings.syncFilterProviders || [],
      syncLastRunAt: settings.syncLastRunAt || null,
      syncLastStatus: settings.syncLastStatus || null,
    });
  } catch (err) {
    console.error("[SyncAPI] Error getting sync config:", err);
    return NextResponse.json({ error: "Failed to get sync config" }, { status: 500 });
  }
}

/**
 * PUT /api/sync/config
 * Update sync configuration (Master Receiver only).
 */
export async function PUT(request) {
  try {
    const isReceiver = await isMasterReceiverMachine();
    if (!isReceiver) {
      return NextResponse.json({ error: "Not available on source machines" }, { status: 403 });
    }

    const body = await request.json();
    const patch = { syncRole: "receiver" };

    if (body.regenerateToken === true) {
      patch.syncToken = generateSyncToken();
    } else if (body.syncToken && typeof body.syncToken === "string") {
      patch.syncToken = body.syncToken.trim();
    }

    if (typeof body.syncEnabled === "boolean") {
      patch.syncEnabled = body.syncEnabled;
    }

    if (typeof body.syncRemotePeerUrl === "string") {
      patch.syncRemotePeerUrl = body.syncRemotePeerUrl.trim();
    }

    if (typeof body.syncRemoteToken === "string") {
      patch.syncRemoteToken = body.syncRemoteToken.trim();
    }

    if (typeof body.syncAutoIntervalMinutes === "number") {
      patch.syncAutoIntervalMinutes = Math.max(1, body.syncAutoIntervalMinutes);
    }

    if (typeof body.syncOnPageLoad === "boolean") {
      patch.syncOnPageLoad = body.syncOnPageLoad;
    }

    if (Array.isArray(body.syncFilterProviders)) {
      patch.syncFilterProviders = body.syncFilterProviders.map(String);
    }

    await updateSettings(patch);
    startAccountSyncWorker().catch(() => {});

    const updated = await getSettings();

    return NextResponse.json({
      success: true,
      config: {
        syncRole: "receiver",
        isReceiver: true,
        syncToken: updated.syncToken,
        syncEnabled: updated.syncEnabled,
        syncRemotePeerUrl: updated.syncRemotePeerUrl,
        syncRemoteToken: updated.syncRemoteToken,
        syncAutoIntervalMinutes: updated.syncAutoIntervalMinutes,
        syncOnPageLoad: updated.syncOnPageLoad,
        syncFilterProviders: updated.syncFilterProviders,
        syncLastRunAt: updated.syncLastRunAt,
        syncLastStatus: updated.syncLastStatus,
      },
    });
  } catch (err) {
    console.error("[SyncAPI] Error updating sync config:", err);
    return NextResponse.json({ error: "Failed to update sync config" }, { status: 400 });
  }
}
