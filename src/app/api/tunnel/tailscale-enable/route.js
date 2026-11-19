import { NextResponse } from "next/server";
import { enableTailscale } from "@/lib/tunnel";
import { getSettings, updateSettings } from "@/lib/localDb";
import { configureTunnelMonitoring } from "@/shared/services/initializeApp";

export async function POST() {
  try {
    const currentSettings = await getSettings();
    const isLoginUnsafe = currentSettings.requireLogin === false || !currentSettings.password;
    if (isLoginUnsafe && currentSettings.tunnelDashboardAccess !== false) {
      await updateSettings({ tunnelDashboardAccess: false });
    }

    const result = await enableTailscale();
    getSettings()
      .then(configureTunnelMonitoring)
      .catch((error) => console.warn("Tailscale monitor start failed:", error.message));
    return NextResponse.json(result);
  } catch (error) {
    console.error("Tailscale enable error:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
