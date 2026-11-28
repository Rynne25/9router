import { NextResponse } from "next/server";
import { getSettings } from "@/lib/localDb";
import { DEFAULT_HEADROOM_URL, getHeadroomStatus } from "@/lib/headroom/detect";
import { getManagedPid } from "@/lib/headroom/process";

export const dynamic = "force-dynamic";

export async function GET(req) {
  try {
    const settings = await getSettings();
    const url = settings.headroomUrl || DEFAULT_HEADROOM_URL;
    const refresh = req?.url ? new URL(req.url).searchParams.get("refresh") === "1" : false;
    const status = await getHeadroomStatus(url, { refresh });
    const managedPid = getManagedPid();
    return NextResponse.json({ ...status, url, managedPid });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
