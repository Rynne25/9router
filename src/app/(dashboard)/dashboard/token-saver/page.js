import { getSettings } from "@/lib/localDb";
import TokenSaverClient from "./TokenSaverClient";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function pickTokenSaverSettings(settings) {
  if (!settings || typeof settings !== "object") return null;

  return {
    rtkEnabled: settings.rtkEnabled !== false,
    headroomEnabled: Boolean(settings.headroomEnabled),
    headroomUrl: settings.headroomUrl || "http://localhost:8787",
    headroomTimeoutMs:
      typeof settings.headroomTimeoutMs === "number"
        ? settings.headroomTimeoutMs
        : 3000,
    headroomCodeAware: settings.headroomCodeAware === true,
    headroomKompress: settings.headroomKompress !== false,
    cavemanEnabled: Boolean(settings.cavemanEnabled),
    cavemanLevel: settings.cavemanLevel || "full",
    ponytailEnabled: Boolean(settings.ponytailEnabled),
    ponytailLevel: settings.ponytailLevel || "full",
    customPromptEnabled: Boolean(settings.customPromptEnabled),
    customPrompt:
      typeof settings.customPrompt === "string" ? settings.customPrompt : "",
    claudeCacheTtl: settings.claudeCacheTtl === "1h" ? "1h" : "5m",
  };
}

export default async function TokenSaverPage() {
  let initialSettings = null;
  try {
    const settings = await getSettings();
    initialSettings = pickTokenSaverSettings(settings);
  } catch {
    initialSettings = null;
  }

  return <TokenSaverClient initialSettings={initialSettings} />;
}
