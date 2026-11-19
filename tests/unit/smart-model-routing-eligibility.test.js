import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getProviderConnections: vi.fn(),
  getProviderConnectionById: vi.fn(async () => null),
  updateProviderConnection: vi.fn(async () => true),
  getSettings: vi.fn(),
  getProxyPools: vi.fn(),
  validateApiKey: vi.fn(),
  resolveConnectionProxyConfig: vi.fn(),
  getAntigravityUsage: vi.fn(),
  handleChatCore: vi.fn(),
  checkAndRefreshToken: vi.fn(),
  getModelInfo: vi.fn(),
  getComboModels: vi.fn(),
}));

vi.mock("@/lib/localDb", () => ({
  getProviderConnections: mocks.getProviderConnections,
  getProviderConnectionById: mocks.getProviderConnectionById,
  updateProviderConnection: mocks.updateProviderConnection,
  getSettings: mocks.getSettings,
  getProxyPools: mocks.getProxyPools,
  validateApiKey: mocks.validateApiKey,
}));
vi.mock("@/lib/network/connectionProxy", () => ({
  resolveConnectionProxyConfig: mocks.resolveConnectionProxyConfig,
  pickProxyPoolId: vi.fn(),
}));
vi.mock("open-sse/services/usage/google.js", () => ({
  getAntigravityUsage: mocks.getAntigravityUsage,
}));
vi.mock("@/sse/utils/logger.js", () => ({
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  maskKey: vi.fn(() => "sk-***"),
  tagForSession: vi.fn(() => "tag"),
  nextTag: vi.fn(() => "tag"),
  line: vi.fn(),
  errorLine: vi.fn(),
}));
vi.mock("open-sse/handlers/chatCore.js", () => ({
  handleChatCore: mocks.handleChatCore,
}));
vi.mock("@/sse/services/tokenRefresh.js", () => ({
  checkAndRefreshToken: mocks.checkAndRefreshToken,
  updateProviderCredentials: vi.fn(async () => {}),
}));
vi.mock("@/sse/services/model.js", () => ({
  getModelInfo: mocks.getModelInfo,
  getComboModels: mocks.getComboModels,
}));
vi.mock("@/sse/services/keyAccess.js", () => ({
  getKeyAccessContext: vi.fn(async () => null),
  enforceKeyAccess: vi.fn(async () => null),
  filterAdapterModels: vi.fn(async (_ctx, models) => models),
}));
vi.mock("open-sse/services/projectId.js", () => ({
  getProjectIdForConnection: vi.fn(async () => "proj-1"),
}));
vi.mock("@/lib/headroom/detect", () => ({ DEFAULT_HEADROOM_URL: "http://localhost:8787" }));
vi.mock("@/lib/pxpipe/loader.js", () => ({ getTransform: vi.fn(async () => null) }));
vi.mock("@/lib/pxpipe/events.js", () => ({ appendPxpipeEvent: vi.fn() }));
vi.mock("@/sse/services/systemoneRouter.js", () => ({ resolveSmartChoice: vi.fn() }));

const {
  isModelUnsupportedError,
  checkFallbackError,
} = await import("open-sse/services/accountFallback.js");
const {
  clearUnsupportedModelsCache,
  isModelMarkedUnsupported,
  markModelUnsupportedForConnection,
  isConnectionEligibleForModel,
} = await import("@/sse/services/modelEligibility.js");
const {
  getAntigravityQuotaCache,
  getAntigravityAvailableModelsCache,
  getAntigravityTierCache,
  isAntigravityModelSupported,
  syncAntigravityUsageCache,
} = await import("@/sse/services/antigravityQuota.js");
const {
  getProviderCredentials,
  markAccountUnavailable,
  clearAccountError,
} = await import("@/sse/services/auth.js");
const { handleChat } = await import("@/sse/handlers/chat.js");

beforeEach(() => {
  vi.clearAllMocks();
  clearUnsupportedModelsCache();
  getAntigravityQuotaCache().clear();
  getAntigravityAvailableModelsCache().clear();
  getAntigravityTierCache().clear();
  mocks.resolveConnectionProxyConfig.mockResolvedValue({});
  mocks.getSettings.mockResolvedValue({});
  mocks.updateProviderConnection.mockResolvedValue({});
  mocks.getComboModels.mockResolvedValue(null);
  mocks.checkAndRefreshToken.mockImplementation(async (_provider, creds) => creds);
});

describe("isModelUnsupportedError & checkFallbackError", () => {
  it("detects 404/400/403/406 model-unsupported upstream responses", () => {
    expect(isModelUnsupportedError(404, "Requested entity was not found.")).toBe(true);
    expect(isModelUnsupportedError(404, "models/gemini-4-argon-high is not found")).toBe(true);
    expect(isModelUnsupportedError(400, "Model gemini-4-argon-high is not supported for this account")).toBe(true);
    expect(isModelUnsupportedError(400, "The model 'gemini-4-argon' is not available")).toBe(true);
    expect(isModelUnsupportedError(400, "Invalid model id: gemini-4-argon")).toBe(true);
    expect(isModelUnsupportedError(403, "Account does not have access to model gemini-4-argon")).toBe(true);
    expect(isModelUnsupportedError(406, "Unsupported model")).toBe(true);

    const fb = checkFallbackError(400, "The requested model is not supported for this tier", 0, "antigravity");
    expect(fb.shouldFallback).toBe(true);
    expect(fb.modelUnsupported).toBe(true);
    expect(fb.modelScoped).toBe(true);
    expect(fb.cooldownMs).toBeGreaterThan(0);
  });

  it("does not misclassify verification 403, context overflow 400, or 429 rate limits", () => {
    expect(isModelUnsupportedError(403, "Please verify your account to continue https://accounts.google.com/verify")).toBe(false);
    expect(isModelUnsupportedError(400, "This model's maximum context length is 1048576 tokens.")).toBe(false);
    expect(isModelUnsupportedError(400, "unsupported parameter: reasoning_effort")).toBe(false);
    expect(isModelUnsupportedError(429, "Resource has been exhausted")).toBe(false);

    const ctxErr = checkFallbackError(400, "This model's maximum context length is 1048576 tokens.", 0, "antigravity");
    expect(ctxErr).toEqual({ shouldFallback: false, cooldownMs: 0, requestScoped: true });
  });
});

describe("Antigravity pre-flight eligibility filtering", () => {
  it("skips accounts missing gemini-4-argon-high in live availableModelsCache and routes to eligible PRO account", async () => {
    syncAntigravityUsageCache("ag-jiro", {
      plan: "Google AI Pro",
      quotas: {
        "gemini-3.8-flash-high": { remainingPercentage: 100 },
        "claude-sonnet-4-6": { remainingPercentage: 100 },
        claude_gpt_session: { remainingPercentage: 100 },
      },
      availableModels: ["gemini-3.8-flash-high", "claude-sonnet-4-6", "claude-opus-4-6-thinking"],
    });
    syncAntigravityUsageCache("ag-pro", {
      plan: "Google AI Pro",
      quotas: {
        "gemini-4-argon-high": { remainingPercentage: 100 },
        "gemini-3.8-flash-high": { remainingPercentage: 100 },
        gemini_argon_weekly: { remainingPercentage: 90 },
      },
      availableModels: ["gemini-4-argon-high", "gemini-4-argon", "gemini-3.8-flash-high", "claude-sonnet-4-6"],
    });

    mocks.getProviderConnections.mockResolvedValue([
      { id: "ag-jiro", email: "jiro@example.com", isActive: true, priority: 1 },
      { id: "ag-pro", email: "pro@example.com", isActive: true, priority: 2 },
    ]);

    const creds = await getProviderCredentials("antigravity", null, "gemini-4-argon-high");
    expect(creds.connectionId).toBe("ag-pro");
  });

  it("skips accounts based on persisted providerSpecificData.availableModels on cold RAM", async () => {
    mocks.getProviderConnections.mockResolvedValue([
      {
        id: "ag-no-argon",
        email: "noargon@example.com",
        isActive: true,
        priority: 1,
        providerSpecificData: {
          availableModels: ["gemini-3.8-flash-high", "claude-sonnet-4-6"],
        },
      },
      {
        id: "ag-with-argon",
        email: "argon@example.com",
        isActive: true,
        priority: 2,
        providerSpecificData: {
          availableModels: ["gemini-4-argon-high", "gemini-3.8-flash-high"],
        },
      },
    ]);

    const creds = await getProviderCredentials("antigravity", null, "gemini-4-argon");
    expect(creds.connectionId).toBe("ag-with-argon");
  });

  it("enforces FREE and PRO JIRO tier eligibility while keeping compatible models eligible", async () => {
    const freeConn = {
      id: "ag-free",
      email: "free@example.com",
      isActive: true,
      priority: 1,
      providerSpecificData: { tier: "free", subscriptionTier: "free" },
    };
    const jiroConn = {
      id: "ag-jiro",
      email: "jiro@example.com",
      isActive: true,
      priority: 2,
      providerSpecificData: { tier: "pro_jiro", subscriptionTier: "pro_jiro" },
    };
    const proConn = {
      id: "ag-pro",
      email: "pro@example.com",
      isActive: true,
      priority: 3,
      providerSpecificData: {
        tier: "pro",
        subscriptionTier: "pro",
        quotas: {
          "gemini-4-argon-high": { remainingPercentage: 80 },
          "claude-sonnet-4-6": { remainingPercentage: 100 },
        },
      },
    };

    mocks.getProviderConnections.mockResolvedValue([freeConn, jiroConn, proConn]);

    // Argon 4 -> skips FREE & PRO JIRO, picks PRO
    expect((await getProviderCredentials("antigravity", null, "gemini-4-argon-high")).connectionId).toBe("ag-pro");
    // G1 Pro Orchestrator -> skips FREE & PRO JIRO, picks PRO
    expect((await getProviderCredentials("antigravity", null, "gemini-pro-orchestrator-g1-pro")).connectionId).toBe("ag-pro");
    // Claude Sonnet -> skips FREE, picks PRO JIRO (priority 2)
    expect((await getProviderCredentials("antigravity", null, "claude-sonnet-4-6")).connectionId).toBe("ag-jiro");
    // Standard Gemini -> FREE is eligible (priority 1)
    expect((await getProviderCredentials("antigravity", null, "gemini-3.8-flash-high")).connectionId).toBe("ag-free");
  });

  it("skips account whose persisted quota map lacks Argon/G1 Pro keys (inferred pro_jiro)", async () => {
    mocks.getProviderConnections.mockResolvedValue([
      {
        id: "ag-pro-missing-argon",
        email: "jiro2@example.com",
        isActive: true,
        priority: 1,
        providerSpecificData: {
          tier: "pro",
          quotas: {
            "gemini-3.8-flash-high": { remainingPercentage: 100 },
            "claude-sonnet-4-6": { remainingPercentage: 100 },
            claude_gpt_session: { remainingPercentage: 100 },
          },
        },
      },
      {
        id: "ag-pro-argon",
        email: "pro2@example.com",
        isActive: true,
        priority: 2,
        providerSpecificData: {
          tier: "pro",
          quotas: {
            "gemini-4-argon-high": { remainingPercentage: 100 },
            "gemini-3.8-flash-high": { remainingPercentage: 100 },
          },
        },
      },
    ]);

    const creds = await getProviderCredentials("antigravity", null, "gemini-4-argon-high");
    expect(creds.connectionId).toBe("ag-pro-argon");
  });

  it("resolves Antigravity model aliases, context markers, and thinking suffixes accurately", () => {
    syncAntigravityUsageCache("ag-alias", {
      plan: "Google AI Pro",
      quotas: {
        "gemini-4-argon-high": { remainingPercentage: 100 },
        "claude-sonnet-4-6": { remainingPercentage: 100 },
        "claude-opus-4-6-thinking": { remainingPercentage: 100 },
      },
      availableModels: ["gemini-4-argon-high", "claude-sonnet-4-6", "claude-opus-4-6-thinking", "gemini-3.1-flash-image"],
    });

    expect(isAntigravityModelSupported("ag-alias", "gemini-4-argon")).toBe(true);
    expect(isAntigravityModelSupported("ag-alias", "gemini-pro-orchestrator-g1-pro")).toBe(true);
    expect(isAntigravityModelSupported("ag-alias", "claude-sonnet-5-5-high")).toBe(true);
    expect(isAntigravityModelSupported("ag-alias", "claude-opus-5-5")).toBe(true);
    expect(isAntigravityModelSupported("ag-alias", "claude-sonnet-4-6[1m]")).toBe(true);
    expect(isAntigravityModelSupported("ag-alias", "gemini-3.1-flash-image-16x9")).toBe(true);
    expect(isAntigravityModelSupported("ag-alias", "gemini-3.8-flash-high(high)")).toBe(false);
  });

  it("degrades gracefully on cold start when capability info is absent (even with raw tier='pro')", async () => {
    mocks.getProviderConnections.mockResolvedValue([
      { id: "ag-cold-empty", email: "cold1@example.com", isActive: true, priority: 1 },
      {
        id: "ag-cold-raw-pro",
        email: "cold2@example.com",
        isActive: true,
        priority: 2,
        providerSpecificData: { tier: "pro" },
      },
    ]);

    expect((await getProviderCredentials("antigravity", null, "gemini-4-argon-high")).connectionId).toBe("ag-cold-empty");
    expect(isAntigravityModelSupported("ag-cold-raw-pro", "gemini-4-argon-high", {
      id: "ag-cold-raw-pro",
      providerSpecificData: { tier: "pro" },
    })).toBe(true);
  });

  it("does not block synthetic websearch/webfetch lock keys using availableModels", async () => {
    syncAntigravityUsageCache("ag-search", {
      plan: "Free",
      quotas: { gemini_weekly: { remainingPercentage: 100 } },
      availableModels: ["gemini-3.8-flash-high"],
    });
    mocks.getProviderConnections.mockResolvedValue([
      { id: "ag-search", email: "search@example.com", isActive: true },
    ]);

    const creds = await getProviderCredentials("antigravity", null, "websearch:antigravity");
    expect(creds.connectionId).toBe("ag-search");
  });
});

describe("General provider modelLimits & availableModels filtering", () => {
  it("filters non-antigravity connections by modelLimits and availableModels", async () => {
    mocks.getProviderConnections.mockResolvedValue([
      {
        id: "cx-limited",
        email: "limited@example.com",
        isActive: true,
        priority: 1,
        providerSpecificData: {
          modelLimits: { "gpt-5.4": { supported: false } },
        },
      },
      {
        id: "cx-missing",
        email: "missing@example.com",
        isActive: true,
        priority: 2,
        providerSpecificData: {
          availableModels: ["gpt-5.1"],
        },
      },
      {
        id: "cx-ok",
        email: "ok@example.com",
        isActive: true,
        priority: 3,
        providerSpecificData: {
          availableModels: ["gpt-5.4", "gpt-5.1"],
        },
      },
    ]);

    const creds = await getProviderCredentials("codex", null, "gpt-5.4");
    expect(creds.connectionId).toBe("cx-ok");
    expect(isConnectionEligibleForModel({ id: "cx-1", providerSpecificData: { enabledModels: ["gpt-5.4"] } }, "gpt-5.1").eligible).toBe(false);
  });
});

describe("Runtime unsupported-model caching with TTL and self-healing", () => {
  it("caches runtime 404/unsupported model per connection, skips on next request, and expires after TTL", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-18T12:00:00.000Z"));

    try {
      const connA = { id: "ag-a", email: "a@example.com", isActive: true, priority: 1 };
      const connB = { id: "ag-b", email: "b@example.com", isActive: true, priority: 2 };
      mocks.getProviderConnections.mockResolvedValue([connA, connB]);

      const markResult = await markAccountUnavailable(
        "ag-a",
        404,
        "Requested entity was not found.",
        "antigravity",
        "gemini-4-argon-high"
      );
      expect(markResult.shouldFallback).toBe(true);
      expect(markResult.modelUnsupported).toBe(true);
      expect(isModelMarkedUnsupported("ag-a", "gemini-4-argon-high")).toBe(true);

      // Next request for gemini-4-argon-high skips ag-a immediately
      expect((await getProviderCredentials("antigravity", null, "gemini-4-argon-high")).connectionId).toBe("ag-b");

      // Other models on ag-a remain unaffected
      expect((await getProviderCredentials("antigravity", null, "gemini-3.8-flash-high")).connectionId).toBe("ag-a");

      // Advance past 30-minute TTL -> ag-a becomes eligible again
      await vi.advanceTimersByTimeAsync(30 * 60 * 1000 + 1000);
      expect(isModelMarkedUnsupported("ag-a", "gemini-4-argon-high")).toBe(false);
      expect((await getProviderCredentials("antigravity", null, "gemini-4-argon-high")).connectionId).toBe("ag-a");
    } finally {
      vi.useRealTimers();
    }
  });

  it("clears cached unsupported mark when request succeeds or fresh availableModels lists the model", async () => {
    markModelUnsupportedForConnection("ag-heal", "gemini-4-argon-high", { status: 404 });
    expect(isModelMarkedUnsupported("ag-heal", "gemini-4-argon-high")).toBe(true);

    await clearAccountError("ag-heal", { id: "ag-heal" }, "gemini-4-argon-high");
    expect(isModelMarkedUnsupported("ag-heal", "gemini-4-argon-high")).toBe(false);

    markModelUnsupportedForConnection("ag-heal", "gemini-4-argon-high", { status: 404 });
    syncAntigravityUsageCache("ag-heal", {
      quotas: { "gemini-4-argon-high": { remainingPercentage: 100 } },
      availableModels: ["gemini-4-argon-high"],
    });
    expect(isModelMarkedUnsupported("ag-heal", "gemini-4-argon-high")).toBe(false);
  });
});

describe("End-to-end handleChat cold-start fallback & pre-flight skip", () => {
  it("falls back on cold-start 404 and skips the ineligible account immediately on subsequent requests", async () => {
    const connA = { id: "ag-cold-a", email: "a@example.com", isActive: true, priority: 1, accessToken: "tok-a" };
    const connB = { id: "ag-cold-b", email: "b@example.com", isActive: true, priority: 2, accessToken: "tok-b" };

    mocks.getModelInfo.mockResolvedValue({ provider: "antigravity", model: "gemini-4-argon-high" });
    mocks.getProviderConnections.mockResolvedValue([connA, connB]);
    mocks.getAntigravityUsage.mockResolvedValue({
      plan: "Pro Jiro",
      quotas: { "gemini-3.8-flash-high": { remainingPercentage: 100 } },
      availableModels: ["gemini-3.8-flash-high", "claude-sonnet-4-6"],
    });

    mocks.handleChatCore
      .mockResolvedValueOnce({
        success: false,
        status: 404,
        error: "[404]: Requested entity was not found.",
        response: new Response(JSON.stringify({ error: { message: "Not found" } }), { status: 404 }),
      })
      .mockResolvedValueOnce({
        success: true,
        response: new Response(JSON.stringify({ ok: true, acc: "b" }), { status: 200 }),
      })
      .mockResolvedValueOnce({
        success: true,
        response: new Response(JSON.stringify({ ok: true, acc: "b-cached" }), { status: 200 }),
      });

    const mkReq = () =>
      new Request("http://localhost/v1/chat/completions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          model: "ag/gemini-4-argon-high",
          messages: [{ role: "user", content: "hi" }],
        }),
      });

    // Request 1 (cold start): tries connA -> 404 -> falls back to connB -> 200
    const res1 = await handleChat(mkReq());
    expect(res1.status).toBe(200);
    expect(mocks.handleChatCore).toHaveBeenCalledTimes(2);
    expect(mocks.handleChatCore.mock.calls[0][0].connectionId).toBe("ag-cold-a");
    expect(mocks.handleChatCore.mock.calls[1][0].connectionId).toBe("ag-cold-b");

    // Request 2: pre-flight skips ag-cold-a IMMEDIATELY without calling handleChatCore for it!
    const res2 = await handleChat(mkReq());
    expect(res2.status).toBe(200);
    expect(mocks.handleChatCore).toHaveBeenCalledTimes(3);
    expect(mocks.handleChatCore.mock.calls[2][0].connectionId).toBe("ag-cold-b");
  });

  it("returns 404 without making upstream calls when all active accounts are pre-flight ineligible", async () => {
    mocks.getModelInfo.mockResolvedValue({ provider: "antigravity", model: "gemini-4-argon-high" });
    mocks.getProviderConnections.mockResolvedValue([
      {
        id: "ag-only-free",
        email: "free@example.com",
        isActive: true,
        providerSpecificData: { tier: "free" },
      },
    ]);

    const req = new Request("http://localhost/v1/chat/completions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: "ag/gemini-4-argon-high",
        messages: [{ role: "user", content: "hi" }],
      }),
    });

    const res = await handleChat(req);
    expect(res.status).toBe(404);
    expect(mocks.handleChatCore).not.toHaveBeenCalled();
  });
});
