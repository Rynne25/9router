import { describe, it, expect } from "vitest";
import * as utils from "../../src/app/(dashboard)/dashboard/usage/components/ProviderLimits/utils.js";

describe("ProviderLimits/utils barrel & decomposed utilities", () => {
  it("exports all core utility symbols including parseAntigravityQuotas", () => {
    const expectedSymbols = [
      "CONNECTIONS_PAGE_SIZE",
      "QUOTA_CACHE_KEY",
      "AUTO_REFRESH_STORAGE_KEY",
      "AUTO_PING_SETTINGS_KEYS",
      "getConnectionLabel",
      "getConnectionSecondaryLabel",
      "sortVisibleConnections",
      "isConnectionFullyDepleted",
      "hasAvailableQuota",
      "buildLoadingState",
      "filterQuotaStateByConnections",
      "getRemainingPercentage",
      "formatResetTime",
      "formatTimeRemaining",
      "parseAntigravityQuotas",
      "parseQuotaData",
      "pairQuotasByFamily",
      "getAntigravityEffectiveTier",
      "getAntigravityTierBadgeClass",
      "getTierBadgeLabel",
      "claudeGrantStatus",
      "getCodexResetCreditCount",
    ];
    for (const sym of expectedSymbols) {
      expect(utils[sym], `Expected export '${sym}'`).toBeDefined();
    }
  });

  it("pairs Antigravity daily/5h and weekly quotas into dual-bar families with Argon merged into Gemini", () => {
    const rows = utils.parseAntigravityQuotas({
      gemini_session: { used: 10, total: 100, remainingPercentage: 90, resetAt: "2026-11-16T18:00:00Z" },
      gemini_weekly: { used: 20, total: 100, remainingPercentage: 80, resetAt: "2026-11-22T00:00:00Z" },
      claude_gpt_session: { used: 50, total: 100, remainingPercentage: 50, resetAt: "2026-11-16T18:00:00Z" },
      claude_gpt_weekly: { used: 30, total: 100, remainingPercentage: 70, resetAt: "2026-11-22T00:00:00Z" },
      gemini_argon_weekly: { used: 0, total: 100, remainingPercentage: 100, resetAt: "2026-11-22T00:00:00Z" },
    });

    const { paired, singles } = utils.pairQuotasByFamily(rows);
    expect(paired).toHaveLength(2);
    expect(paired.map((p) => p.title)).toEqual(["Gemini", "Claude"]);
    expect(singles.some((s) => s.cleanTitle === "Argon")).toBe(false);
  });

  it("evaluates depleted vs available quota consistently across models", () => {
    const quotaData = {
      c1: {
        quotas: [
          { name: "Gemini", total: 100, used: 100, remainingPercentage: 0 },
          { name: "Claude", total: 100, used: 100, remainingPercentage: 0 },
        ],
      },
      c2: {
        quotas: [
          { name: "Gemini", total: 100, used: 100, remainingPercentage: 0 },
          { name: "Claude", total: 100, used: 20, remainingPercentage: 80 },
        ],
      },
    };
    expect(utils.isConnectionFullyDepleted({ id: "c1" }, quotaData)).toBe(true);
    expect(utils.hasAvailableQuota({ id: "c1" }, quotaData, {})).toBe(false);

    expect(utils.isConnectionFullyDepleted({ id: "c2" }, quotaData)).toBe(false);
    expect(utils.hasAvailableQuota({ id: "c2" }, quotaData, {})).toBe(true);
    expect(utils.hasAvailableQuota({ id: "c2", validationBlocked: true }, quotaData, {})).toBe(false);
  });

  it("returns distinct PRO JIRO cyan badge class and label", () => {
    const tier = utils.getAntigravityEffectiveTier({ tier: "pro_jiro" });
    expect(tier).toBe("pro_jiro");
    expect(utils.getTierBadgeLabel(tier)).toBe("PRO JIRO");
    expect(utils.getAntigravityTierBadgeClass(tier)).toContain("cyan-500");
  });
});
