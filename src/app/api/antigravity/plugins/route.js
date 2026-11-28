import { NextResponse } from "next/server";
import { getAntigravityPluginsStatus } from "@/lib/antigravity/pluginManager.js";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const NO_STORE_HEADERS = { "Cache-Control": "no-store" };

export async function GET() {
  try {
    const status = await getAntigravityPluginsStatus();
    return NextResponse.json(status, { headers: NO_STORE_HEADERS });
  } catch (error) {
    return NextResponse.json(
      { error: error?.message || "Failed to detect Antigravity plugins" },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
