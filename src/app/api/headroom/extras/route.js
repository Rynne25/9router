import { NextResponse } from "next/server";
import {
  findPython310,
  getInstalledHeadroomExtras,
  HEADROOM_COMPRESSION_EXTRAS,
  invalidateHeadroomEnvCache,
} from "@/lib/headroom/detect";
import { installHeadroomExtras, uninstallHeadroomExtras, getInstallLogTail } from "@/lib/headroom/process";

export const dynamic = "force-dynamic";

export async function GET(req) {
  try {
    const params = new URL(req.url).searchParams;
    // `?log=1` returns the live install/uninstall log tail for progress polling.
    if (params.get("log") === "1") {
      return NextResponse.json({ log: getInstallLogTail() });
    }
    const refresh = params.get("refresh") === "1";
    const python = findPython310();
    const status = getInstalledHeadroomExtras(python, { refresh });
    return NextResponse.json({
      available: HEADROOM_COMPRESSION_EXTRAS,
      ...status,
    });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req) {
  try {
    const body = await req.json().catch(() => ({}));
    const requested = Array.isArray(body?.extras) ? body.extras : [];
    const result = await installHeadroomExtras(requested);
    invalidateHeadroomEnvCache();
    return NextResponse.json(result);
  } catch (error) {
    const status = error.code === "NOT_INSTALLED" || error.code === "NO_PYTHON" ? 400 : 500;
    return NextResponse.json({ error: error.message, code: error.code || null }, { status });
  }
}

export async function DELETE(req) {
  try {
    const body = await req.json().catch(() => ({}));
    const requested = Array.isArray(body?.extras) ? body.extras : [];
    const result = await uninstallHeadroomExtras(requested);
    invalidateHeadroomEnvCache();
    return NextResponse.json(result);
  } catch (error) {
    const status = error.code === "NO_PYTHON" || error.code === "INVALID_EXTRAS" ? 400 : 500;
    return NextResponse.json({ error: error.message, code: error.code || null }, { status });
  }
}
