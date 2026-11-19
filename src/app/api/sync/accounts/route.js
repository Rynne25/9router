import { NextResponse } from "next/server";
import { getOrCreateSyncToken, verifySyncToken, getExportableAccounts } from "@/lib/sync/syncService";
import { isMasterReceiverMachine } from "@/shared/utils/machineId";

/**
 * GET /api/sync/accounts
 * Export accounts from a Source machine for the Master Receiver.
 * Protected by header `x-9r-sync-token` and strictly blocked on the Master Receiver (1-way only).
 */
export async function GET(request) {
  try {
    if (await isMasterReceiverMachine()) {
      return NextResponse.json({ error: "Receiver-only host cannot export accounts" }, { status: 403 });
    }

    const providedToken = request.headers.get("x-9r-sync-token");
    const currentToken = await getOrCreateSyncToken();

    if (!providedToken || !verifySyncToken(providedToken, currentToken)) {
      return NextResponse.json({ error: "Invalid sync token" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const providersParam = searchParams.get("providers");
    const filterProviders = providersParam
      ? providersParam.split(",").map((p) => p.trim()).filter(Boolean)
      : [];

    const accounts = await getExportableAccounts(filterProviders);

    return NextResponse.json({
      version: 1,
      total: accounts.length,
      accounts,
      exportedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[SyncAPI] Error exporting accounts:", err);
    return NextResponse.json({ error: err.message || "Failed to export accounts" }, { status: 500 });
  }
}
