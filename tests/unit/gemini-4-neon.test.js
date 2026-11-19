import { describe, expect, it } from "vitest";
import { getModelUpstreamId } from "../../open-sse/config/providerModels.js";
import { AntigravityExecutor } from "../../open-sse/executors/antigravity.js";
import { getCapabilitiesForModel } from "../../open-sse/providers/capabilities.js";
import antigravityRegistry from "../../open-sse/providers/registry/antigravity.js";
import { getThinkingLevels } from "../../open-sse/providers/thinkingLevels.js";
import { applyThinking, stripThinkingSuffix } from "../../open-sse/translator/concerns/thinkingUnified.js";
import { MITM_TOOLS } from "../../src/shared/constants/cliTools.js";
import { parseQuotaData } from "../../src/app/(dashboard)/dashboard/usage/components/ProviderLimits/utils/quotaParsers.js";
import { pairQuotasByFamily } from "../../src/app/(dashboard)/dashboard/usage/components/ProviderLimits/utils/quotaFamilyUtils.js";

describe("Gemini 4 Neon Integration Tests", () => {
  it("registers Gemini 4 Neon & Orchestrator variants in Antigravity registry and MITM UI", () => {
    const registryIds = antigravityRegistry.models.map((m) => m.id);
    const mitmIds = MITM_TOOLS.antigravity.defaultModels.map((m) => m.id);
    const mitmAliases = MITM_TOOLS.antigravity.modelAliases;

    const expected = [
      "gemini-4-neon-extra",
      "gemini-4-neon-high",
      "gemini-4-neon-medium",
      "gemini-4-neon-low",
      "gemini-4-neon",
      "gemini-pro-orchestrator-neon",
      "gemini-pro-orchestrator-argon",
      "gemini-4-argon-extra",
      "gemini-4-hydrogen-extra",
    ];

    for (const id of expected) {
      expect(registryIds).toContain(id);
      expect(mitmIds).toContain(id);
      expect(mitmAliases).toContain(id);
    }
  });

  it("declares level-based always-on reasoning with extra tier for Gemini 4 Neon", () => {
    const caps = getCapabilitiesForModel("antigravity", "gemini-4-neon-extra");
    expect(caps.reasoning).toBe(true);
    expect(caps.thinkingFormat).toBe("gemini-level");
    expect(caps.thinkingCanDisable).toBe(false);
    expect(getThinkingLevels("antigravity", "gemini-4-neon-extra")).toEqual([
      "low",
      "medium",
      "high",
      "extra",
    ]);
  });

  it.each([
    ["gemini-4-neon-extra", "extra"],
    ["gemini-4-neon-high", "high"],
    ["gemini-4-neon-medium", "medium"],
    ["gemini-4-neon-low", "low"],
  ])("maps %s to wire model and preserves %s thinkingLevel end-to-end", (modelId, expectedLevel) => {
    const upstreamModel = getModelUpstreamId("ag", modelId);
    expect(upstreamModel).toBe(`${modelId}(${expectedLevel})`);

    const body = {
      model: stripThinkingSuffix(upstreamModel),
      request: {
        contents: [{ role: "user", parts: [{ text: "hello" }] }],
        generationConfig: {},
      },
    };

    applyThinking("antigravity", upstreamModel, body, "antigravity");
    const finalBody = new AntigravityExecutor().transformRequest(
      modelId,
      body,
      true,
      { projectId: "project", connectionId: "connection" },
    );

    expect(finalBody.model).toBe(modelId);
    expect(finalBody.request.generationConfig.thinkingConfig).toEqual({
      thinkingLevel: expectedLevel,
      includeThoughts: true,
    });
  });

  it("preserves extra thinkingLevel on Gemini 4 Argon", () => {
    const body = { reasoning_effort: "extra" };
    applyThinking("gemini", "gemini-4-argon", body, "vertex");
    expect(body.generationConfig.thinkingConfig).toEqual({
      thinkingLevel: "extra",
      includeThoughts: true,
    });
  });
});

describe("Antigravity Quota Ordering & Neon Family", () => {
  it("always places Gemini before Claude even when Claude has paired 5h+Weekly and Gemini has Weekly only", () => {
    const parsed = parseQuotaData("antigravity", {
      quotas: {
        claude_gpt_session: { used: 100, total: 1000, remainingPercentage: 90 },
        claude_gpt_weekly: { used: 200, total: 1000, remainingPercentage: 80 },
        gemini_weekly: { used: 0, total: 1000, remainingPercentage: 100 },
        "gemini-4-neon-extra": { used: 50, total: 1000, remainingPercentage: 95 },
      },
    });

    const { items } = pairQuotasByFamily(parsed);
    const titles = items.map((item) => (item.kind === "paired" ? item.pair.title : item.quota.cleanTitle));
    const geminiIdx = titles.indexOf("Gemini");
    const claudeIdx = titles.indexOf("Claude");

    expect(geminiIdx).toBeGreaterThanOrEqual(0);
    expect(claudeIdx).toBeGreaterThanOrEqual(0);
    expect(geminiIdx).toBeLessThan(claudeIdx);
  });
});
