import { NextResponse } from "next/server";
import { assertValidPluginId } from "@/lib/antigravity/pluginCatalog.js";
import {
  installPlugin,
  installSmartPack,
  runDoctor,
  uninstallPlugin,
} from "@/lib/antigravity/pluginManager.js";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const NO_STORE_HEADERS = { "Cache-Control": "no-store" };
const ALLOWED_ACTIONS = new Set(["install-smart-pack", "install", "uninstall", "doctor"]);

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON request body" },
      { status: 400, headers: NO_STORE_HEADERS }
    );
  }

  const action = body?.action;
  const pluginId = body?.pluginId ?? null;
  const autoResolveConflicts = body?.autoResolveConflicts !== false;

  if (typeof action !== "string" || !ALLOWED_ACTIONS.has(action)) {
    return NextResponse.json(
      { ok: false, error: `Unsupported action: ${String(action)}` },
      { status: 400, headers: NO_STORE_HEADERS }
    );
  }

  if ((action === "install" || action === "uninstall") && !pluginId) {
    return NextResponse.json(
      { ok: false, error: `pluginId is required for action "${action}"` },
      { status: 400, headers: NO_STORE_HEADERS }
    );
  }

  if (pluginId !== null && pluginId !== undefined) {
    try {
      assertValidPluginId(pluginId);
    } catch (err) {
      return NextResponse.json(
        { ok: false, error: err.message, code: err.code || "INVALID_PLUGIN_ID" },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }
  }

  try {
    let payload;
    if (action === "install-smart-pack") {
      payload = await installSmartPack({ autoResolveConflicts });
    } else if (action === "install") {
      payload = await installPlugin(pluginId, { autoResolveConflicts });
    } else if (action === "uninstall") {
      payload = await uninstallPlugin(pluginId);
    } else {
      payload = await runDoctor({ pluginId });
    }
    return NextResponse.json(payload, { headers: NO_STORE_HEADERS });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error?.message || "Plugin operation failed" },
      { status: error?.code === "INVALID_PLUGIN_ID" ? 400 : 500, headers: NO_STORE_HEADERS }
    );
  }
}
