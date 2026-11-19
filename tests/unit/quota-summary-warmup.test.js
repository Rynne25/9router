import { describe, it, expect, beforeEach } from "vitest";
import {
  buildConnectionsCacheKey,
  clearConnectionsCacheForTest,
  computeQuotaSummaryStats,
  extractSupportedModelPills,
  filterConnectionsClientSide,
  getConnectionAverageRemaining,
  getConnectionHealthStatus,
  getMemoryConnectionsCache,
  matchesAccountSearch,
  parseWarmupApiResponse,
  setMemoryConnectionsCache,
  sortConnectionsEnhanced,
} from "@/app/(dashboard)/dashboard/usage/components/ProviderLimits/utils.js";

describe("Quota Summary, Model Pills, Filtering, SWR Cache & Warmup Helpers", () => {
  beforeEach(() => {
    clearConnectionsCacheForTest();
  });

  describe("extractSupportedModelPills", () => {
    it("extracts Argon 4, G1 Pro, Claude, Gemini 3.8, and Flash Image for Antigravity PRO", () => {
      const conn = {
        id: "ag-pro",
        provider: "antigravity",
        tier: "pro",
      };
      const quotaEntry = {
        quotas: [
          { name: "Gemini", modelKey: "gemini_session", remainingPercentage: 100 },
          { name: "Claude", modelKey: "claude_gpt_session", remainingPercentage: 80 },
          { name: "G1 Pro / Argon", modelKey: "g1pro_argon_weekly", remainingPercentage: 90 },
        ],
        raw: {
          availableModels: [
            "gemini-4-argon-high",
            "gemini-pro-orchestrator-g1-pro",
            "claude-sonnet-4-6",
            "gemini-3.8-flash-high",
            "gemini-3.1-flash-image",
          ],
        },
      };

      const pills = extractSupportedModelPills(conn, quotaEntry);
      expect(pills.map((p) => p.label)).toEqual([
        "Argon 4",
        "G1 Pro",
        "Claude",
        "Gemini 3.8",
        "Flash Image",
      ]);
    });

    it("does not falsely show Claude pill on Antigravity free tier with only claude_gpt_weekly placeholder", () => {
      const conn = {
        id: "ag-free",
        provider: "antigravity",
        tier: "free",
        providerSpecificData: {
          quotas: {
            gemini_weekly: { used: 0, total: 1000, remainingPercentage: 100 },
            claude_gpt_weekly: { used: 1000, total: 1000, remainingPercentage: 0 },
          },
        },
      };

      const pills = extractSupportedModelPills(conn, null);
      expect(pills.map((p) => p.label)).toEqual(["Gemini 3.8"]);
    });

    it("extracts Codex Spark and Code Review pills", () => {
      const conn = { id: "cx-1", provider: "codex" };
      const quotaEntry = {
        raw: {
          quotas: {
            session: { used: 10, total: 100 },
            spark_session: { used: 0, total: 100 },
            review_session: { used: 0, total: 100 },
          },
        },
      };

      const pills = extractSupportedModelPills(conn, quotaEntry);
      expect(pills.map((p) => p.label)).toEqual([
        "Codex 5h/Weekly",
        "Spark",
        "Code Review",
      ]);
    });
  });

  describe("matchesAccountSearch & filterConnectionsClientSide", () => {
    const connections = [
      {
        id: "c1",
        provider: "antigravity",
        name: "Alpha Pro",
        email: "alpha@gmail.com",
        tier: "pro",
        isActive: true,
        providerSpecificData: {
          quotas: {
            "gemini-4-argon-high": { remainingPercentage: 95 },
            gemini_session: { remainingPercentage: 90 },
          },
        },
      },
      {
        id: "c2",
        provider: "antigravity",
        name: "Beta Free",
        email: "beta@gmail.com",
        tier: "free",
        isActive: true,
        validationBlocked: true,
        validationUrl: "https://accounts.google.com/verify",
        providerSpecificData: {
          quotas: {
            gemini_weekly: { remainingPercentage: 0 },
          },
        },
      },
      {
        id: "c3",
        provider: "codex",
        name: "Codex Work",
        email: "work@company.com",
        isActive: true,
      },
    ];

    const quotaData = {
      c1: {
        quotas: [
          { name: "Gemini", modelKey: "gemini_session", used: 10, total: 100, remainingPercentage: 90 },
          { name: "G1 Pro / Argon", modelKey: "g1pro_argon_weekly", used: 5, total: 100, remainingPercentage: 95 },
        ],
      },
      c2: {
        quotas: [
          { name: "Gemini", modelKey: "gemini_weekly", used: 100, total: 100, remainingPercentage: 0 },
        ],
      },
      c3: {
        quotas: [
          { name: "5h", quotaType: "session", used: 80, total: 100, remainingPercentage: 20 },
        ],
      },
    };

    it("matches search by email, tier, and supported model", () => {
      expect(matchesAccountSearch(connections[0], quotaData.c1, "alpha@gmail")).toBe(true);
      expect(matchesAccountSearch(connections[0], quotaData.c1, "argon 4")).toBe(true);
      expect(matchesAccountSearch(connections[0], quotaData.c1, "pro")).toBe(true);
      expect(matchesAccountSearch(connections[1], quotaData.c2, "argon")).toBe(false);
    });

    it("filters by tier and health status", () => {
      const proOnly = filterConnectionsClientSide(connections, quotaData, {}, { tierFilter: "pro" });
      expect(proOnly.map((c) => c.id)).toEqual(["c1"]);

      const blockedOnly = filterConnectionsClientSide(connections, quotaData, {}, { healthFilter: "blocked" });
      expect(blockedOnly.map((c) => c.id)).toEqual(["c2"]);

      const lowOnly = filterConnectionsClientSide(connections, quotaData, {}, { healthFilter: "low" });
      expect(lowOnly.map((c) => c.id)).toEqual(["c3"]);
    });

    it("computes health status and average remaining correctly", () => {
      expect(getConnectionAverageRemaining(quotaData.c1)).toBe(93);
      expect(getConnectionHealthStatus(connections[0], quotaData.c1)).toBe("healthy");
      expect(getConnectionHealthStatus(connections[1], quotaData.c2)).toBe("blocked");
      expect(getConnectionHealthStatus(connections[2], quotaData.c3)).toBe("low");
    });
  });

  describe("sortConnectionsEnhanced", () => {
    const connections = [
      { id: "a", provider: "antigravity", name: "A" },
      { id: "b", provider: "antigravity", name: "B" },
      { id: "c", provider: "codex", name: "C" },
    ];
    const quotaData = {
      a: { quotas: [{ total: 100, used: 10, remainingPercentage: 90, resetAt: "2026-11-19T12:00:00Z" }] },
      b: { quotas: [{ total: 100, used: 80, remainingPercentage: 20, resetAt: "2026-11-19T06:00:00Z" }] },
      c: { quotas: [{ total: 100, used: 50, remainingPercentage: 50, resetAt: "2026-11-19T09:00:00Z" }] },
    };

    it("sorts by remaining percentage ascending and descending across all providers", () => {
      const asc = sortConnectionsEnhanced(connections, quotaData, { quotaSortMode: "remaining-asc" });
      expect(asc.map((x) => x.id)).toEqual(["b", "c", "a"]);

      const desc = sortConnectionsEnhanced(connections, quotaData, { quotaSortMode: "remaining-desc" });
      expect(desc.map((x) => x.id)).toEqual(["a", "c", "b"]);
    });

    it("sorts by earliest reset time when expiringFirst is enabled", () => {
      const expiring = sortConnectionsEnhanced(connections, quotaData, { expiringFirst: true });
      expect(expiring.map((x) => x.id)).toEqual(["b", "c", "a"]);
    });
  });

  describe("computeQuotaSummaryStats", () => {
    it("computes KPI counts, average remaining %, and provider breakdown", () => {
      const connections = [
        { id: "1", provider: "antigravity", isActive: true },
        { id: "2", provider: "antigravity", isActive: false },
        { id: "3", provider: "codex", isActive: true },
      ];
      const quotaData = {
        "1": { quotas: [{ total: 100, used: 20, remainingPercentage: 80 }] },
        "2": { quotas: [{ total: 100, used: 0, remainingPercentage: 100 }] }, // disabled -> excluded from active avg
        "3": { quotas: [{ total: 100, used: 60, remainingPercentage: 40 }] },
      };

      const stats = computeQuotaSummaryStats({
        connections,
        filteredConnections: connections,
        quotaData,
        errors: {},
        totals: { eligibleConnections: 5 },
      });

      expect(stats.totalAccounts).toBe(5);
      expect(stats.activeCount).toBe(2);
      expect(stats.disabledCount).toBe(1);
      expect(stats.healthyCount).toBe(2);
      expect(stats.avgRemainingPct).toBe(60); // avg of active 80% and 40%
      expect(stats.providerBreakdown).toEqual([
        { provider: "antigravity", label: "Antigravity", count: 2, activeCount: 1 },
        { provider: "codex", label: "OpenAI Codex", count: 1, activeCount: 1 },
      ]);
    });
  });

  describe("parseWarmupApiResponse", () => {
    it("parses a successful per-account warmup response", () => {
      const parsed = parseWarmupApiResponse(true, {
        success: true,
        result: { ok: true, model: "gemini-3.8-flash-tiered", activated: true },
      });
      expect(parsed.ok).toBe(true);
      expect(parsed.type).toBe("success");
      expect(parsed.model).toBe("gemini-3.8-flash-tiered");
      expect(parsed.validationUrl).toBeNull();
    });

    it("extracts 403 verification URL on blocked account warmup", () => {
      const parsed = parseWarmupApiResponse(true, {
        success: false,
        result: {
          ok: false,
          error: "Warmup failed on gemini-3.8-flash-tiered (403): Verify your account",
          verification: {
            isVerificationRequired: true,
            validationUrl: "https://accounts.google.com/v3/signin/challenge",
          },
        },
      });
      expect(parsed.ok).toBe(false);
      expect(parsed.type).toBe("error");
      expect(parsed.isVerificationRequired).toBe(true);
      expect(parsed.validationUrl).toBe("https://accounts.google.com/v3/signin/challenge");
    });
  });

  describe("SWR memory connections cache", () => {
    it("stores and retrieves connection snapshots by filter/page key", () => {
      const key = buildConnectionsCacheKey({
        providerFilter: "antigravity",
        accountFilter: "active",
        page: 1,
        pageSize: 50,
      });
      expect(getMemoryConnectionsCache(key)).toBeNull();

      setMemoryConnectionsCache(key, {
        connections: [{ id: "c1", provider: "antigravity" }],
        totals: { eligibleConnections: 1, providerFilteredConnections: 1 },
      });

      const cached = getMemoryConnectionsCache(key);
      expect(cached).not.toBeNull();
      expect(cached.connections).toHaveLength(1);
    });
  });
});
