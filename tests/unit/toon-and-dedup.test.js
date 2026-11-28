import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  encodeJsonToToon,
  tryCompressJsonText,
  compressToonInMessages,
  formatToonLog,
} from "../../open-sse/rtk/toon.js";
import {
  dedupeToolResultsInMessages,
  formatToolDedupLog,
} from "../../open-sse/rtk/toolDedup.js";
import { mergeWithDefaults } from "../../src/lib/db/repos/settingsRepo.js";

const { executeMock } = vi.hoisted(() => ({
  executeMock: vi.fn(),
}));

vi.mock("../../open-sse/executors/index.js", () => ({
  getExecutor: () => ({
    noAuth: true,
    execute: executeMock,
  }),
}));

vi.mock("../../open-sse/utils/requestLogger.js", () => ({
  createRequestLogger: async () => ({
    logClientRawRequest: vi.fn(),
    logRawRequest: vi.fn(),
    logTargetRequest: vi.fn(),
    logProviderResponse: vi.fn(),
    logConvertedResponse: vi.fn(),
    logError: vi.fn(),
  }),
}));

vi.mock("../../open-sse/utils/stream.js", () => ({
  COLORS: { red: "", reset: "" },
  createPassthroughStreamWithLogger: vi.fn(() => new TransformStream()),
  createSSETransformStreamWithLogger: vi.fn(() => new TransformStream()),
}));

vi.mock("@/lib/usageDb.js", () => ({
  trackPendingRequest: vi.fn(),
  appendRequestLog: vi.fn(async () => {}),
  saveRequestDetail: vi.fn(async () => {}),
}));

const { handleChatCore } = await import("../../open-sse/handlers/chatCore.js");

function makeUsers(count = 12) {
  return Array.from({ length: count }, (_, i) => ({
    id: i + 1,
    username: `user_${i + 1}`,
    email: `user_${i + 1}@example.com`,
    role: i % 3 === 0 ? "admin" : "member",
    active: i % 2 === 0,
  }));
}

function makeLargeToolOutput(tag = "alpha", lines = 30) {
  return Array.from(
    { length: lines },
    (_, i) => `[${tag}] record line #${i + 1}: payload_value_for_dedup_verification_${i}`
  ).join("\n");
}

describe("TOON encoder & text compressor", () => {
  it("encodes a top-level uniform array of plain objects", () => {
    const out = encodeJsonToToon([
      { id: 1, name: "Alice", ok: true },
      { id: 2, name: "Bob", ok: false },
      { id: 3, name: "Carol", ok: true },
    ]);
    expect(out).toBe(
      "[3]{id,name,ok}:\n 1,Alice,true\n 2,Bob,false\n 3,Carol,true"
    );
  });

  it("encodes tabular arrays nested 1 and 2 levels inside an object", () => {
    const level1 = encodeJsonToToon({
      total: 50,
      items: [
        { id: 1, label: "one" },
        { id: 2, label: "two" },
        { id: 3, label: "three" },
      ],
    });
    expect(level1).toContain("total: 50");
    expect(level1).toContain("items[3]{id,label}:\n 1,one\n 2,two\n 3,three");

    const level2 = encodeJsonToToon({
      ok: true,
      data: {
        page: 1,
        users: [
          { id: 10, role: "admin" },
          { id: 11, role: "user" },
          { id: 12, role: "user" },
        ],
      },
    });
    expect(level2).toContain("ok: true");
    expect(level2).toContain("data:\n page: 1\n users[3]{id,role}:\n  10,admin\n  11,user\n  12,user");
  });

  it("applies RFC-style quoting for commas, newlines, quotes, colons, and empty strings", () => {
    const out = encodeJsonToToon([
      { id: 1, note: "a, b" },
      { id: 2, note: 'say "hi": now' },
      { id: 3, note: "line1\nline2" },
      { id: 4, note: "" },
    ]);
    expect(out).toContain('1,"a, b"');
    expect(out).toContain('2,"say ""hi"": now"');
    expect(out).toContain('3,"line1\nline2"');
    expect(out).toContain('4,""');
  });

  it("returns null for arrays < 3 items, inconsistent keys, or non-primitive cells", () => {
    expect(encodeJsonToToon([{ a: 1 }, { a: 2 }])).toBeNull();
    expect(encodeJsonToToon([{ a: 1 }, { a: 2 }, { b: 3 }])).toBeNull();
    expect(encodeJsonToToon([{ a: 1, b: { nested: 1 } }, { a: 2, b: { nested: 2 } }, { a: 3, b: { nested: 3 } }])).toBeNull();
    expect(encodeJsonToToon({ a: 1, b: "hello" })).toBeNull();
  });

  it("tryCompressJsonText prefixes [TOON] and respects minChars / minSavingsPct / JSON validity", () => {
    const bigJson = JSON.stringify({ items: makeUsers(15), total: 15 }, null, 2);
    const compressed = tryCompressJsonText(bigJson);
    expect(compressed.startsWith("[TOON]\n")).toBe(true);
    expect(compressed.length).toBeLessThan(bigJson.length * 0.85);

    // Idempotent if called again
    expect(tryCompressJsonText(compressed)).toBe(compressed);

    // Skips below minChars
    const smallJson = JSON.stringify(makeUsers(3));
    expect(smallJson.length).toBeLessThan(400);
    expect(tryCompressJsonText(smallJson)).toBe(smallJson);

    // Skips invalid JSON
    const notJson = "not json ".repeat(80);
    expect(tryCompressJsonText(notJson)).toBe(notJson);

    // Skips when savings < minSavingsPct (e.g. 99%)
    expect(tryCompressJsonText(bigJson, { minChars: 100, minSavingsPct: 99 })).toBe(bigJson);
  });
});

describe("compressToonInMessages (all 5 provider shapes)", () => {
  it("returns null when disabled or body missing", () => {
    expect(compressToonInMessages({ messages: [] }, { enabled: false })).toBeNull();
    expect(compressToonInMessages(null, { enabled: true })).toBeNull();
  });

  it("compresses OpenAI Chat, Claude, OpenAI Responses, Kiro, and Gemini shapes while skipping errors", () => {
    const bigJson = JSON.stringify({ items: makeUsers(15), total: 15 }, null, 2);

    // 1. OpenAI Chat
    const openaiBody = {
      messages: [
        { role: "tool", tool_call_id: "c1", content: bigJson },
        { role: "tool", tool_call_id: "c2", is_error: true, content: bigJson },
      ],
    };
    const openaiStats = compressToonInMessages(openaiBody);
    expect(openaiStats.hits).toBe(1);
    expect(openaiBody.messages[0].content.startsWith("[TOON]\n")).toBe(true);
    expect(openaiBody.messages[1].content).toBe(bigJson);

    // 2. Claude (string & array)
    const claudeBody = {
      messages: [
        {
          role: "user",
          content: [
            { type: "tool_result", tool_use_id: "t1", content: bigJson },
            { type: "tool_result", tool_use_id: "t2", content: [{ type: "text", text: bigJson }] },
            { type: "tool_result", tool_use_id: "t3", is_error: true, content: bigJson },
          ],
        },
      ],
    };
    const claudeStats = compressToonInMessages(claudeBody);
    expect(claudeStats.hits).toBe(2);
    expect(claudeBody.messages[0].content[0].content.startsWith("[TOON]\n")).toBe(true);
    expect(claudeBody.messages[0].content[1].content[0].text.startsWith("[TOON]\n")).toBe(true);
    expect(claudeBody.messages[0].content[2].content).toBe(bigJson);

    // 3. OpenAI Responses
    const responsesBody = {
      input: [
        { type: "function_call_output", call_id: "call_1", output: bigJson },
        { type: "function_call_output", call_id: "call_2", output: [{ type: "input_text", text: bigJson }] },
      ],
    };
    const responsesStats = compressToonInMessages(responsesBody);
    expect(responsesStats.hits).toBe(2);
    expect(responsesBody.input[0].output.startsWith("[TOON]\n")).toBe(true);
    expect(responsesBody.input[1].output[0].text.startsWith("[TOON]\n")).toBe(true);

    // 4. Kiro
    const kiroBody = {
      conversationState: {
        history: [
          {
            userInputMessage: {
              userInputMessageContext: {
                toolResults: [
                  { toolUseId: "k1", status: "success", content: [{ text: bigJson }] },
                  { toolUseId: "k2", status: "error", content: [{ text: bigJson }] },
                ],
              },
            },
          },
        ],
        currentMessage: {
          userInputMessage: {
            userInputMessageContext: {
              toolResults: [{ toolUseId: "k3", status: "success", content: [{ text: bigJson }] }],
            },
          },
        },
      },
    };
    const kiroStats = compressToonInMessages(kiroBody);
    expect(kiroStats.hits).toBe(2);
    expect(kiroBody.conversationState.history[0].userInputMessage.userInputMessageContext.toolResults[0].content[0].text.startsWith("[TOON]\n")).toBe(true);
    expect(kiroBody.conversationState.history[0].userInputMessage.userInputMessageContext.toolResults[1].content[0].text).toBe(bigJson);
    expect(kiroBody.conversationState.currentMessage.userInputMessage.userInputMessageContext.toolResults[0].content[0].text.startsWith("[TOON]\n")).toBe(true);

    // 5. Gemini / Antigravity (keeps response as an object)
    const geminiBody = {
      request: {
        contents: [
          {
            role: "user",
            parts: [
              { functionResponse: { id: "g1", name: "List", response: { result: { result: bigJson } } } },
              { functionResponse: { id: "g2", name: "Fail", response: { error: bigJson } } },
            ],
          },
        ],
      },
    };
    const geminiStats = compressToonInMessages(geminiBody);
    expect(geminiStats.hits).toBe(1);
    expect(typeof geminiBody.request.contents[0].parts[0].functionResponse.response).toBe("object");
    expect(geminiBody.request.contents[0].parts[0].functionResponse.response.result.result.startsWith("[TOON]\n")).toBe(true);
    expect(geminiBody.request.contents[0].parts[1].functionResponse.response.error).toBe(bigJson);

    const logLine = formatToonLog(geminiStats);
    expect(logLine).toContain("[TOON] saved");
    expect(formatToonLog({ hits: 0, bytesBefore: 0, bytesAfter: 0 })).toBeNull();
  });
});

describe("dedupeToolResultsInMessages", () => {
  it("returns null when disabled", () => {
    expect(dedupeToolResultsInMessages({ messages: [] }, { enabled: false })).toBeNull();
  });

  it("cache-safe mode preserves earliest occurrence and replaces later duplicates", () => {
    const payloadA = makeLargeToolOutput("read-file", 25);
    const payloadAWithCrlf = `  ${payloadA.replace(/\n/g, "\r\n")}  `;
    const body = {
      messages: [
        { role: "tool", tool_call_id: "c1", content: payloadA },
        { role: "tool", tool_call_id: "c2", content: makeLargeToolOutput("other", 20) },
        { role: "tool", tool_call_id: "c3", content: payloadAWithCrlf },
      ],
    };

    const stats = dedupeToolResultsInMessages(body, { mode: "cache-safe" });
    expect(stats.hits).toBe(1);
    expect(stats.groups).toBe(1);
    expect(stats.mode).toBe("cache-safe");
    expect(body.messages[0].content).toBe(payloadA);
    expect(body.messages[2].content).toMatch(
      /^\[9router-dedup: identical to earlier tool_result #1 \(sha256:[0-9a-f]{8}, 25 lines, ~\d+ tokens saved\) — reuse earlier output verbatim\]$/
    );

    const logLine = formatToolDedupLog(stats);
    expect(logLine).toContain("[DEDUP:cache-safe]");
  });

  it("recency mode preserves latest occurrence and replaces earlier duplicates", () => {
    const payload = makeLargeToolOutput("recency", 25);
    const body = {
      messages: [
        {
          role: "user",
          content: [
            { type: "tool_result", tool_use_id: "t1", content: payload },
            { type: "tool_result", tool_use_id: "t2", content: payload },
          ],
        },
      ],
    };

    const stats = dedupeToolResultsInMessages(body, { mode: "recency" });
    expect(stats.hits).toBe(1);
    expect(body.messages[0].content[0].content).toContain("identical to later tool_result #2");
    expect(body.messages[0].content[1].content).toBe(payload);
  });

  it("skips blocks below minChars, below 200-char savings, and error tool results", () => {
    const shortDup = "short duplicate ".repeat(20); // ~320 chars (< 600 default)
    const bodyShort = {
      messages: [
        { role: "tool", tool_call_id: "c1", content: shortDup },
        { role: "tool", tool_call_id: "c2", content: shortDup },
      ],
    };
    expect(dedupeToolResultsInMessages(bodyShort).hits).toBe(0);

    // Savings < 200 chars even with custom minChars
    const smallSaved = "x".repeat(250);
    const bodySmallSave = {
      messages: [
        { role: "tool", tool_call_id: "c1", content: smallSaved },
        { role: "tool", tool_call_id: "c2", content: smallSaved },
      ],
    };
    expect(dedupeToolResultsInMessages(bodySmallSave, { minChars: 200 }).hits).toBe(0);

    // Error tool_result is never deduped
    const big = makeLargeToolOutput("err", 25);
    const bodyErr = {
      messages: [
        { role: "user", content: [{ type: "tool_result", tool_use_id: "t1", is_error: true, content: big }] },
        { role: "user", content: [{ type: "tool_result", tool_use_id: "t2", is_error: true, content: big }] },
      ],
    };
    expect(dedupeToolResultsInMessages(bodyErr).hits).toBe(0);
    expect(bodyErr.messages[1].content[0].content).toBe(big);
  });

  it("deduplicates across Kiro, OpenAI Responses, and Gemini shapes", () => {
    const big = makeLargeToolOutput("cross-shape", 25);

    const responsesBody = {
      input: [
        { type: "function_call_output", call_id: "c1", output: big },
        { type: "function_call_output", call_id: "c2", output: [{ type: "input_text", text: big }] },
      ],
    };
    expect(dedupeToolResultsInMessages(responsesBody).hits).toBe(1);
    expect(responsesBody.input[1].output[0].text).toContain("earlier tool_result #1");

    const kiroBody = {
      conversationState: {
        history: [{ userInputMessage: { userInputMessageContext: { toolResults: [{ toolUseId: "k1", status: "success", content: [{ text: big }] }] } } }],
        currentMessage: { userInputMessage: { userInputMessageContext: { toolResults: [{ toolUseId: "k2", status: "success", content: [{ text: big }] }] } } },
      },
    };
    expect(dedupeToolResultsInMessages(kiroBody).hits).toBe(1);
    expect(kiroBody.conversationState.currentMessage.userInputMessage.userInputMessageContext.toolResults[0].content[0].text).toContain("earlier tool_result #1");

    const geminiBody = {
      contents: [
        {
          role: "user",
          parts: [
            { functionResponse: { id: "g1", name: "Read", response: { content: big } } },
            { functionResponse: { id: "g2", name: "Read", response: { content: big } } },
          ],
        },
      ],
    };
    expect(dedupeToolResultsInMessages(geminiBody).hits).toBe(1);
    expect(geminiBody.contents[0].parts[1].functionResponse.response.content).toContain("earlier tool_result #1");
  });
});

describe("settingsRepo defaults & handleChatCore integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    executeMock.mockImplementation(async () => ({
      response: new Response(
        JSON.stringify({
          id: "chatcmpl-test",
          object: "chat.completion",
          choices: [{ message: { role: "assistant", content: "ok" }, finish_reason: "stop", index: 0 }],
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      ),
      url: "https://api.openai.com/v1/chat/completions",
      headers: {},
      transformedBody: null,
    }));
  });

  it("populates TOON and ToolDedup defaults in mergeWithDefaults", () => {
    const merged = mergeWithDefaults({});
    expect(merged.toonEnabled).toBe(true);
    expect(merged.toolDedupEnabled).toBe(true);
    expect(merged.toolDedupMode).toBe("cache-safe");
    expect(merged.tokenSaverPreset).toBe("balanced");
  });

  it("runs TOON and ToolDedup in handleChatCore and logs xf flags", async () => {
    const bigJson = JSON.stringify({ items: makeUsers(15), total: 15 }, null, 2);
    const bigPlain = makeLargeToolOutput("chatcore", 25);
    const log = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), line: vi.fn() };

    await handleChatCore({
      body: {
        model: "gpt-4o",
        stream: false,
        messages: [
          { role: "user", content: "run tools" },
          {
            role: "assistant",
            content: null,
            tool_calls: [
              { id: "c1", type: "function", function: { name: "List", arguments: "{}" } },
              { id: "c2", type: "function", function: { name: "Read", arguments: "{}" } },
              { id: "c3", type: "function", function: { name: "Read", arguments: "{}" } },
            ],
          },
          { role: "tool", tool_call_id: "c1", content: bigJson },
          { role: "tool", tool_call_id: "c2", content: bigPlain },
          { role: "tool", tool_call_id: "c3", content: bigPlain },
        ],
      },
      modelInfo: { provider: "openai", model: "gpt-4o" },
      credentials: { apiKey: "test-key", providerSpecificData: {} },
      log,
      connectionId: "test-conn",
      rtkEnabled: false,
      toonEnabled: true,
      toolDedupEnabled: true,
      toolDedupMode: "cache-safe",
      clientRawRequest: {
        endpoint: "/v1/chat/completions",
        body: { model: "gpt-4o" },
        headers: { accept: "application/json" },
      },
    });

    const dispatched = executeMock.mock.calls[0][0].body;
    expect(dispatched.messages[2].content.startsWith("[TOON]\n")).toBe(true);
    expect(dispatched.messages[3].content).toBe(bigPlain);
    expect(dispatched.messages[4].content).toContain("identical to earlier tool_result #2");

    const xf = log.line.mock.calls.find((c) => c[1] === "⚙");
    expect(xf).toBeTruthy();
    expect(xf[2]).toContain("TOON:1");
    expect(xf[2]).toContain("DEDUP:1(cache-safe)");
  });

  it("respects x-9router-token-saver: off and defaults off when omitted", async () => {
    const bigJson = JSON.stringify({ items: makeUsers(15), total: 15 }, null, 2);
    const log = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), line: vi.fn() };

    // Header opt-out
    await handleChatCore({
      body: {
        model: "gpt-4o",
        stream: false,
        messages: [
          { role: "user", content: "go" },
          { role: "tool", tool_call_id: "c1", content: bigJson },
          { role: "tool", tool_call_id: "c2", content: bigJson },
        ],
      },
      modelInfo: { provider: "openai", model: "gpt-4o" },
      credentials: { apiKey: "test-key", providerSpecificData: {} },
      log,
      connectionId: "test-conn",
      toonEnabled: true,
      toolDedupEnabled: true,
      clientRawRequest: {
        endpoint: "/v1/chat/completions",
        body: { model: "gpt-4o" },
        headers: { accept: "application/json", "x-9router-token-saver": "off" },
      },
    });

    const dispatchedOff = executeMock.mock.calls[0][0].body;
    expect(dispatchedOff.messages[1].content).toBe(bigJson);
    expect(dispatchedOff.messages[2].content).toBe(bigJson);

    // Omitted options default to false
    await handleChatCore({
      body: {
        model: "gpt-4o",
        stream: false,
        messages: [
          { role: "user", content: "go" },
          { role: "tool", tool_call_id: "c1", content: bigJson },
          { role: "tool", tool_call_id: "c2", content: bigJson },
        ],
      },
      modelInfo: { provider: "openai", model: "gpt-4o" },
      credentials: { apiKey: "test-key", providerSpecificData: {} },
      log,
      connectionId: "test-conn",
      clientRawRequest: {
        endpoint: "/v1/chat/completions",
        body: { model: "gpt-4o" },
        headers: { accept: "application/json" },
      },
    });

    const dispatchedDefault = executeMock.mock.calls[1][0].body;
    expect(dispatchedDefault.messages[1].content).toBe(bigJson);
    expect(dispatchedDefault.messages[2].content).toBe(bigJson);
  });

  it("runs TOON and ToolDedup pre-translate for Cursor provider", async () => {
    const bigJson = JSON.stringify({ items: makeUsers(15), total: 15 }, null, 2);
    const bigPlain = makeLargeToolOutput("cursor-pre", 25);
    const log = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), line: vi.fn() };

    await handleChatCore({
      body: {
        model: "cu/default",
        stream: false,
        messages: [
          { role: "system", content: "hi" },
          { role: "user", content: "tools" },
          {
            role: "assistant",
            content: null,
            tool_calls: [
              { id: "c1", type: "function", function: { name: "List", arguments: "{}" } },
              { id: "c2", type: "function", function: { name: "Read", arguments: "{}" } },
              { id: "c3", type: "function", function: { name: "Read", arguments: "{}" } },
            ],
          },
          { role: "tool", tool_call_id: "c1", content: bigJson },
          { role: "tool", tool_call_id: "c2", content: bigPlain },
          { role: "tool", tool_call_id: "c3", content: bigPlain },
          { role: "user", content: "done" },
        ],
      },
      modelInfo: { provider: "cursor", model: "default" },
      credentials: { apiKey: "test-key", providerSpecificData: {} },
      log,
      connectionId: "test-conn",
      rtkEnabled: false,
      toonEnabled: true,
      toolDedupEnabled: true,
      toolDedupMode: "cache-safe",
      clientRawRequest: {
        endpoint: "/v1/chat/completions",
        body: { model: "cu/default" },
        headers: { accept: "application/json" },
      },
    });

    const dispatched = executeMock.mock.calls[0][0].body;
    const blob = JSON.stringify(dispatched.messages);
    expect(blob).toContain("[TOON]");
    expect(blob).toContain("identical to earlier tool_result #2");

    const xf = log.line.mock.calls.find((c) => c[1] === "⚙");
    expect(xf).toBeTruthy();
    expect(xf[2]).toContain("TOON:1");
    expect(xf[2]).toContain("DEDUP:1(cache-safe)");
  });
});
