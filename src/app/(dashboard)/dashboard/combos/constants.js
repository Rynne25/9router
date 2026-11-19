import { resolveProviderId, AI_PROVIDERS } from "@/shared/constants/providers";

// Capacity adapter: global fallback pools of models per input-modality capability.
// A request needing a capability the target model/combo lacks switches straight
// to the first enabled model here instead of erroring or dropping the data.
export const CAPACITY_ADAPTER_CAPS = [
  { key: "vision", label: "Vision", icon: "visibility", desc: "images (png, jpg, webp, …)" },
  // pdf, videoInput temporarily hidden — no translator support yet for those blocks.
  { key: "audioInput", label: "Audio", icon: "graphic_eq", desc: "audio input" },
];

export const DEFAULT_FALLBACK_MODEL = "oc/mimo-v2.6-flash-free";
export const EMPTY_CAP_ENTRY = { enabled: true, roundRobin: false, models: [] };
export const EMPTY_CAPACITY_ADAPTER = {
  vision: { ...EMPTY_CAP_ENTRY },
  pdf: { ...EMPTY_CAP_ENTRY },
  audioInput: { ...EMPTY_CAP_ENTRY },
  videoInput: { ...EMPTY_CAP_ENTRY },
};

export const upgradeLegacyModel = (m) => (m === "oc/mimo-v2.5-free" ? DEFAULT_FALLBACK_MODEL : m);

// Backward-compat: legacy stored form was an array of {model, enabled}.
export function normalizeCapEntry(entry) {
  if (Array.isArray(entry)) {
    return {
      enabled: true,
      roundRobin: false,
      models: entry.map((e) => upgradeLegacyModel(e?.model || e)).filter(Boolean),
    };
  }
  if (entry && typeof entry === "object") {
    return {
      enabled: entry.enabled !== false,
      roundRobin: !!entry.roundRobin,
      models: Array.isArray(entry.models) ? entry.models.map(upgradeLegacyModel).filter(Boolean) : [],
    };
  }
  return { ...EMPTY_CAP_ENTRY };
}

export const STRATEGY_OPTIONS = [
  { value: "priority-fallback", label: "Priority Fallback — #1 across accounts" },
  { value: "fallback", label: "Fallback — try in order" },
  { value: "round-robin", label: "Round Robin — rotate" },
  { value: "smart", label: "Smart Router — System One" },
  { value: "fusion", label: "Fusion — panel + judge" },
];

export function getPolicyBadgeLabel(strategy) {
  const safe = strategy && typeof strategy === "object" ? strategy : {};
  const policy = safe.smartPolicy || (safe.sessionSticky === false ? "per-turn" : "smart");
  if (policy === "strict") return "Strict Lock";
  if (policy === "per-turn") return "Per-Turn";
  if (policy === "custom") {
    const raw = safe.confidenceThreshold;
    const pct = Math.round((raw || 0.8) * (raw && raw <= 1 ? 100 : 1));
    return `Custom (≥${pct || 80}%)`;
  }
  return "Smart (≥80%)";
}

export function fmtK(n) {
  if (!n) return "?";
  if (n >= 1000000) {
    const m = n / 1000000;
    return `${Number.isInteger(m) ? m : m.toFixed(1)}M`;
  }
  return `${Math.round(n / 1000)}k`;
}

export function getRouterModelStatus(routerModel, activeProviders) {
  const effectiveModel =
    typeof routerModel === "string" && routerModel.trim() ? routerModel.trim() : "oc/jev-1.13-free";
  const slashIdx = effectiveModel.indexOf("/");
  const prefix = slashIdx !== -1 ? effectiveModel.slice(0, slashIdx) : effectiveModel;
  const providerId = resolveProviderId(prefix);
  const providerDef = AI_PROVIDERS[providerId];
  const isNoAuth = !!providerDef?.noAuth;

  if (isNoAuth) {
    return { ready: true, label: "Ready (Free)", providerId };
  }

  const isConnected = (activeProviders || []).some((c) => c.provider === providerId && c.isActive !== false);
  if (isConnected) {
    return { ready: true, label: "Connected", providerId };
  }

  return { ready: false, label: "Not configured", providerId };
}
