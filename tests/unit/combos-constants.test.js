import { describe, it, expect } from "vitest";
import {
  DEFAULT_FALLBACK_MODEL,
  EMPTY_CAP_ENTRY,
  upgradeLegacyModel,
  normalizeCapEntry,
  getPolicyBadgeLabel,
  fmtK,
  getRouterModelStatus,
} from "../../src/app/(dashboard)/dashboard/combos/constants.js";

describe("combos constants & pure helpers", () => {
  it("upgrades legacy oc/mimo-v2.5-free model references", () => {
    expect(upgradeLegacyModel("oc/mimo-v2.5-free")).toBe(DEFAULT_FALLBACK_MODEL);
    expect(upgradeLegacyModel("ag/gemini-4-argon")).toBe("ag/gemini-4-argon");
  });

  it("normalizes array, object, and null capacity adapter entries", () => {
    expect(normalizeCapEntry([{ model: "oc/mimo-v2.5-free" }, "ag/gemini-4-argon"])).toEqual({
      enabled: true,
      roundRobin: false,
      models: [DEFAULT_FALLBACK_MODEL, "ag/gemini-4-argon"],
    });

    expect(
      normalizeCapEntry({
        enabled: false,
        roundRobin: true,
        models: ["oc/mimo-v2.5-free"],
      })
    ).toEqual({
      enabled: false,
      roundRobin: true,
      models: [DEFAULT_FALLBACK_MODEL],
    });

    expect(normalizeCapEntry(null)).toEqual(EMPTY_CAP_ENTRY);
    expect(normalizeCapEntry(undefined)).toEqual(EMPTY_CAP_ENTRY);
  });

  it("formats smart policy badge labels safely including null/undefined input", () => {
    expect(getPolicyBadgeLabel(undefined)).toBe("Smart (≥80%)");
    expect(getPolicyBadgeLabel(null)).toBe("Smart (≥80%)");
    expect(getPolicyBadgeLabel({ smartPolicy: "strict" })).toBe("Strict Lock");
    expect(getPolicyBadgeLabel({ sessionSticky: false })).toBe("Per-Turn");
    expect(getPolicyBadgeLabel({ smartPolicy: "custom", confidenceThreshold: 0.75 })).toBe("Custom (≥75%)");
    expect(getPolicyBadgeLabel({ smartPolicy: "custom", confidenceThreshold: 90 })).toBe("Custom (≥90%)");
  });

  it("formats token window values with fmtK", () => {
    expect(fmtK(0)).toBe("?");
    expect(fmtK(null)).toBe("?");
    expect(fmtK(128000)).toBe("128k");
    expect(fmtK(1000000)).toBe("1M");
    expect(fmtK(1500000)).toBe("1.5M");
  });

  it("resolves router model readiness against active connections and free providers", () => {
    expect(getRouterModelStatus("ag/gemini-3.8-flash-high", [{ provider: "antigravity", isActive: true }])).toEqual({
      ready: true,
      label: "Connected",
      providerId: "antigravity",
    });

    expect(getRouterModelStatus("ag/gemini-3.8-flash-high", [{ provider: "antigravity", isActive: false }])).toEqual({
      ready: false,
      label: "Not configured",
      providerId: "antigravity",
    });
  });
});
