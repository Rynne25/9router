import { describe, it, expect } from "vitest";
import {
  getAntigravityEffectiveTier,
  getTierBadgeLabel,
  hasArgonOrG1Pro,
  hasClaudeOrSessionQuota,
} from "../../src/shared/utils/antigravityTier.js";

describe("Antigravity Tier Auto-Detection", () => {
  it("detects pro when account has gemini-4-argon model in quotas", () => {
    const conn = {
      email: "hieu205nt@gmail.com",
      provider: "antigravity",
      tier: "free",
    };
    const quotaEntry = {
      quotas: {
        "gemini-4-argon": { remaining: 100, total: 1000 },
        "gemini_session": { remaining: 86, total: 1000 },
      },
    };

    expect(hasArgonOrG1Pro(conn, quotaEntry)).toBe(true);
    expect(getAntigravityEffectiveTier(conn, quotaEntry)).toBe("pro");
    expect(getTierBadgeLabel(getAntigravityEffectiveTier(conn, quotaEntry))).toBe("PRO");
  });

  it("detects pro_jiro when account has Claude 5h session quota without explicit tier set", () => {
    const conn = {
      email: "hieu205nt@gmail.com",
      provider: "antigravity",
      subscriptionTier: "free",
    };
    const quotaEntry = {
      quotas: {
        "claude_gpt_session": { remaining: 100, total: 1000 },
        "claude_weekly": { remaining: 100, total: 1000 },
        "gemini_weekly": { remaining: 86, total: 1000 },
      },
    };

    expect(hasClaudeOrSessionQuota(conn, quotaEntry)).toBe(true);
    expect(getAntigravityEffectiveTier(conn, quotaEntry)).toBe("pro_jiro");
    expect(getTierBadgeLabel(getAntigravityEffectiveTier(conn, quotaEntry))).toBe("PRO JIRO");
  });

  it("detects free tier when account only has weekly gemini quotas and no claude/argon", () => {
    const conn = {
      email: "freeuser@gmail.com",
      provider: "antigravity",
      tier: "free",
    };
    const quotaEntry = {
      quotas: {
        "gemini_weekly": { remaining: 100, total: 1000 },
      },
    };

    expect(hasArgonOrG1Pro(conn, quotaEntry)).toBe(false);
    expect(hasClaudeOrSessionQuota(conn, quotaEntry)).toBe(false);
    expect(getAntigravityEffectiveTier(conn, quotaEntry)).toBe("free");
    expect(getTierBadgeLabel("free")).toBe("FREE");
  });

  it("detects free tier even when free account has claude_gpt_weekly, stale claude-* keys, and multi-day gemini_session", () => {
    const conn = {
      email: "rynne365@gmail.com",
      provider: "antigravity",
      tier: "free",
      providerSpecificData: {
        tier: "free",
        subscriptionTier: "free",
        quotas: {
          "claude-sonnet-4-6": { remainingPercentage: 0 },
          "claude-opus-4-6-thinking": { remainingPercentage: 0 },
          "gemini_weekly": { remainingPercentage: 30 },
          "claude_gpt_weekly": { remainingPercentage: 0 },
        },
      },
    };
    const fiveDaysFromNow = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString();
    const quotaEntry = {
      quotas: {
        "gemini_session": { remainingPercentage: 30, resetAt: fiveDaysFromNow },
        "gemini_weekly": { remainingPercentage: 30, resetAt: fiveDaysFromNow },
        "claude_gpt_weekly": { remainingPercentage: 0, resetAt: fiveDaysFromNow },
      },
    };

    expect(hasClaudeOrSessionQuota(conn, quotaEntry)).toBe(false);
    expect(getAntigravityEffectiveTier(conn, quotaEntry)).toBe("free");
  });

  it("detects ultra and enterprise from paidTier or plan metadata", () => {
    const conn = { provider: "antigravity" };
    const ultraQuota = {
      plan: "Google One Ultra AI Plan",
    };
    const enterpriseQuota = {
      subscriptionInfo: {
        paidTier: { id: "enterprise-tier", name: "Gemini Enterprise" },
      },
    };

    expect(getAntigravityEffectiveTier(conn, ultraQuota)).toBe("ultra");
    expect(getAntigravityEffectiveTier(conn, enterpriseQuota)).toBe("enterprise");
  });
});
