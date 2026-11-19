import { describe, it, expect } from "vitest";
import {
  getProviderMeta,
  MCODE_LEASE_PROVIDERS,
  LIVE_MODEL_CATALOG_PROVIDERS,
  AUTO_PING_SETTINGS_KEYS,
} from "../../src/app/(dashboard)/dashboard/providers/[id]/utils/providerMeta.js";

describe("providerMeta utility", () => {
  it("resolves Antigravity OAuth provider metadata correctly", () => {
    const meta = getProviderMeta("antigravity", null);
    expect(meta.isOAuth).toBe(true);
    expect(meta.isCompatible).toBe(false);
    expect(meta.hasDualAuthModes).toBe(false);
    expect(meta.oauthConnectionLabel).toBe("OAuth");
    expect(meta.apiKeyConnectionLabel).toBe("API Key");
  });

  it("handles dual-auth providers (xai and kimi) with custom labels", () => {
    const xai = getProviderMeta("xai", null);
    expect(xai.hasDualAuthModes).toBe(true);
    expect(xai.oauthConnectionLabel).toBe("Grok Build OAuth");
    expect(xai.apiKeyConnectionLabel).toBe("xAI API Key");

    const kimi = getProviderMeta("kimi", null);
    expect(kimi.hasDualAuthModes).toBe(true);
    expect(kimi.oauthConnectionLabel).toBe("Kimi Coding OAuth");
    expect(kimi.apiKeyConnectionLabel).toBe("Kimi API Key");
  });

  it("handles qoder PAT and grok-cli device login labels", () => {
    expect(getProviderMeta("qoder", null).apiKeyConnectionLabel).toBe("PAT");
    expect(getProviderMeta("qoder-cn", null).apiKeyConnectionLabel).toBe("PAT");
    expect(getProviderMeta("grok-cli", null).oauthConnectionLabel).toBe("Grok CLI Device Login");
  });

  it("handles compatible nodes with and without custom prefix", () => {
    const nodeWithPrefix = {
      id: "openai-compatible-chat-1",
      name: "Local VLLM",
      type: "openai-compatible",
      prefix: "vllm",
      apiType: "chat",
      baseUrl: "http://localhost:8000/v1",
    };
    const metaPrefix = getProviderMeta("openai-compatible-chat-1", nodeWithPrefix);
    expect(metaPrefix.isCompatible).toBe(true);
    expect(metaPrefix.isOpenAICompatible).toBe(true);
    expect(metaPrefix.hasDualAuthModes).toBe(false);
    expect(metaPrefix.providerStorageAlias).toBe("openai-compatible-chat-1");
    expect(metaPrefix.providerDisplayAlias).toBe("vllm");
    expect(metaPrefix.providerInfo.textIcon).toBe("OC");

    const anthropicNode = {
      id: "anthropic-compatible-1",
      type: "anthropic-compatible",
    };
    const metaNoPrefix = getProviderMeta("anthropic-compatible-1", anthropicNode);
    expect(metaNoPrefix.isAnthropicCompatible).toBe(true);
    expect(metaNoPrefix.providerDisplayAlias).toBe("anthropic-compatible-1");
    expect(metaNoPrefix.providerInfo.textIcon).toBe("AC");
    expect(metaNoPrefix.providerInfo.name).toBe("Anthropic Compatible");
  });

  it("exports expected provider sets and auto-ping keys", () => {
    expect(MCODE_LEASE_PROVIDERS.has("minimax-code")).toBe(true);
    expect(LIVE_MODEL_CATALOG_PROVIDERS.has("cursor")).toBe(true);
    expect(AUTO_PING_SETTINGS_KEYS.claude).toBe("claudeAutoPing");
    expect(AUTO_PING_SETTINGS_KEYS.codex).toBe("codexAutoPing");
  });
});
