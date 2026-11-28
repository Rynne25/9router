import { describe, it, expect } from "vitest";
import { PONYTAIL_LEVELS, PONYTAIL_PROMPTS } from "../../open-sse/rtk/ponytailPrompt.js";

describe("Ponytail 5 prompt sync", () => {
  it("covers all three intensity levels", () => {
    expect(Object.values(PONYTAIL_LEVELS)).toEqual(["lite", "full", "ultra"]);
    for (const lvl of Object.values(PONYTAIL_LEVELS)) {
      expect(typeof PONYTAIL_PROMPTS[lvl]).toBe("string");
      expect(PONYTAIL_PROMPTS[lvl]).toContain("Before you write:");
      expect(PONYTAIL_PROMPTS[lvl]).toContain("grep every caller before editing");
      expect(PONYTAIL_PROMPTS[lvl]).toContain("shortcut: <the limit>, <when to upgrade>");
    }
  });

  it("requires questioning unrequested scope up front in ultra level", () => {
    expect(PONYTAIL_PROMPTS[PONYTAIL_LEVELS.ULTRA]).toContain("question the request");
  });
});
