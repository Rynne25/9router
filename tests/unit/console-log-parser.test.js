import { describe, it, expect } from "vitest";
import {
  parseLogLine,
  formatMetaChips,
  matchesCategory,
} from "../../src/app/(dashboard)/dashboard/console-log/logParser.js";

describe("parseLogLine", () => {
  describe("1. Timestamp extraction", () => {
    it("parses bracketed HH:MM:SS timestamp", () => {
      const res = parseLogLine("[12:34:56] [App] Server started");
      expect(res.time).toBe("12:34:56");
      expect(res.message).toBe("Server started");
    });

    it("parses bracketed HH:MM:SS.ms timestamp", () => {
      const res = parseLogLine("[12:34:56.789] [App] Ready");
      expect(res.time).toBe("12:34:56.789");
      expect(res.message).toBe("Ready");
    });

    it("parses unbracketed HH:MM:SS.ms timestamp", () => {
      const res = parseLogLine("12:34:56.123 [App] Booting");
      expect(res.time).toBe("12:34:56.123");
      expect(res.message).toBe("Booting");
    });

    it("returns null time when line has no leading timestamp", () => {
      const res = parseLogLine("[App] No timestamp here");
      expect(res.time).toBeNull();
      expect(res.message).toBe("No timestamp here");
    });
  });

  describe("2. Level & emoji detection", () => {
    it("detects leading emoji levels", () => {
      expect(parseLogLine("[12:00:00] ℹ️ [App] Info msg").level).toBe("INFO");
      expect(parseLogLine("[12:00:00] ⚠️ [App] Warn msg").level).toBe("WARN");
      expect(parseLogLine("[12:00:00] ❌ [App] Error msg").level).toBe("ERROR");
    });

    it("detects post-tag emoji levels", () => {
      expect(parseLogLine("[12:00:00] [Sync] ❌ Sync failed").level).toBe("ERROR");
      expect(parseLogLine("[12:00:00] [Sync] ⚠️ Slow response").level).toBe("WARN");
    });

    it("detects bracketed level indicators", () => {
      expect(parseLogLine("[ERROR] [App] Crash").level).toBe("ERROR");
      expect(parseLogLine("[WARNING] [App] Deprecated").level).toBe("WARN");
      expect(parseLogLine("[INFO] [App] Started").level).toBe("INFO");
      expect(parseLogLine("[DEBUG] [App] Trace value").level).toBe("DEBUG");
      expect(parseLogLine("[LOG] [App] Plain message").level).toBe("LOG");
    });

    it("infers ERROR and WARN from HTTP status codes", () => {
      expect(parseLogLine("[App] POST /v1/chat 500 in 12ms").level).toBe("ERROR");
      expect(parseLogLine("[App] POST /v1/chat 503").level).toBe("ERROR");
      expect(parseLogLine("[App] GET /v1/models 404").level).toBe("WARN");
      expect(parseLogLine("[App] GET /v1/models 429").level).toBe("WARN");
    });

    it("infers ERROR and WARN from content keywords without false error=false trigger", () => {
      expect(parseLogLine("[App] Upstream error occurred").level).toBe("ERROR");
      expect(parseLogLine("[App] Request failed unexpectedly").level).toBe("ERROR");
      expect(parseLogLine("[App] Socket timeout after 5s").level).toBe("WARN");
      expect(parseLogLine("[App] Scheduling retry #2").level).toBe("WARN");
      expect(parseLogLine("[App] Check completed error=false").level).toBe("LOG");
    });
  });

  describe("3. Multi-tag parsing & fallbacks", () => {
    it("parses primary and subTags", () => {
      const res = parseLogLine("[12:00:00] [mimo-login][exchange] Token exchanged");
      expect(res.tag).toBe("mimo-login");
      expect(res.subTags).toEqual(["exchange"]);
      expect(res.message).toBe("Token exchanged");
    });

    it("parses single [MITM] and [GEMINI_NATIVE] tags", () => {
      const mitm = parseLogLine("[MITM] Intercepted host");
      expect(mitm.tag).toBe("MITM");
      expect(mitm.subTags).toEqual([]);

      const gemini = parseLogLine("[GEMINI_NATIVE] Streaming chunk");
      expect(gemini.tag).toBe("GEMINI_NATIVE");
      expect(gemini.subTags).toEqual([]);
    });

    it("falls back to TOKEN and MITM prefix detection without brackets", () => {
      const tokenRes = parseLogLine("TOKEN refreshed for user");
      expect(tokenRes.tag).toBe("TOKEN");
      expect(tokenRes.level).toBe("INFO");

      const mitmRes = parseLogLine("MITM listening on 8443");
      expect(mitmRes.tag).toBe("MITM");
    });
  });

  describe("4. Trailing JSON & inline key=value extraction", () => {
    it("extracts trailing JSON object and trims it from message", () => {
      const res = parseLogLine(
        '[12:00:00] [Auth] Refreshed {"email":"a@b.com","provider":"antigravity","expiresIn":1800,"success":true}'
      );
      expect(res.message).toBe("Refreshed");
      expect(res.meta).toEqual({
        email: "a@b.com",
        provider: "antigravity",
        expiresIn: 1800,
        success: true,
      });
    });

    it("extracts trailing JSON even when earlier text has non-JSON braces", () => {
      const res = parseLogLine(
        '[12:00:00] [Auth] Template {foo} finished {"email":"u@x.com","success":true}'
      );
      expect(res.message).toBe("Template {foo} finished");
      expect(res.meta).toEqual({ email: "u@x.com", success: true });
    });

    it("keeps invalid trailing JSON as plain message text", () => {
      const res = parseLogLine("[Auth] Broken {not-valid-json}");
      expect(res.meta).toBeNull();
      expect(res.message).toBe("Broken {not-valid-json}");
    });

    it("extracts known inline key=value pairs including quoted values", () => {
      const res = parseLogLine(
        '[Proxy] Upstream call model=gemini-2.5-pro status=503 error="rate limit" ignoredKey=foo'
      );
      expect(res.meta).toEqual({
        model: "gemini-2.5-pro",
        status: "503",
        error: "rate limit",
      });
      expect(res.level).toBe("ERROR");
    });
  });

  describe("5. HTTP log extraction", () => {
    it("extracts method, path, status and duration", () => {
      const res = parseLogLine("[Server] POST /v1/chat/completions 200 in 45ms");
      expect(res.http).toEqual({
        method: "POST",
        path: "/v1/chat/completions",
        status: 200,
        duration: "45ms",
      });
    });

    it("extracts method, path and status without duration", () => {
      const res = parseLogLine("[Server] GET /api/providers 304");
      expect(res.http).toEqual({
        method: "GET",
        path: "/api/providers",
        status: 304,
        duration: null,
      });
    });

    it("does not match lowercase prose as HTTP method", () => {
      const res = parseLogLine("[Docs] Run get /tmp/file to inspect");
      expect(res.http).toBeNull();
    });
  });

  describe("6. Category classification & matchesCategory", () => {
    it("classifies error, token, mitm, request, and system categories", () => {
      expect(parseLogLine("[ERROR] [App] Boom").category).toBe("error");
      expect(parseLogLine("[WARN] [Auth] Slow").category).toBe("error");
      expect(parseLogLine("[OAuth] Refreshed credential").category).toBe("token");
      expect(parseLogLine("[MITM] Certificate ready").category).toBe("mitm");
      expect(parseLogLine("[Server] GET /api/providers 200").category).toBe("request");
      expect(parseLogLine("[GEMINI_NATIVE] Stream ready").category).toBe("request");
      expect(parseLogLine("[System] Boot complete").category).toBe("system");
    });

    it("matches category tabs consistently including tag fallback", () => {
      const proxyWarn = parseLogLine("[WARN] [ProxyFetch] Retrying upstream");
      expect(matchesCategory(proxyWarn, "error")).toBe(true);
      expect(matchesCategory(proxyWarn, "mitm")).toBe(true);
      expect(matchesCategory(proxyWarn, "all")).toBe(true);
    });
  });

  describe("7. dedupKey stability", () => {
    it("produces identical dedupKey for identical log lines with different timestamps", () => {
      const first = parseLogLine(
        '[10:00:01.100] [mimo-login][exchange] Refreshed {"email":"a@b.com"}'
      );
      const second = parseLogLine(
        '[23:59:59.999] [mimo-login][exchange] Refreshed {"email":"a@b.com"}'
      );
      expect(first.dedupKey).toBe(second.dedupKey);
    });
  });
});

describe("formatMetaChips", () => {
  it("returns empty array for null, undefined, or non-object meta", () => {
    expect(formatMetaChips(null)).toEqual([]);
    expect(formatMetaChips(undefined)).toEqual([]);
    expect(formatMetaChips("invalid")).toEqual([]);
  });

  it("formats email, provider, model, status, exp and ok/fail chips", () => {
    const chips = formatMetaChips({
      email: "a@b.com",
      provider: "antigravity",
      model: "gemini-2.5-pro",
      status: 503,
      id: "1234567890abcdef",
      expiresIn: 1800,
      success: true,
    });

    expect(chips.map((c) => [c.key, c.label])).toEqual([
      ["email", "a@b.com"],
      ["provider", "antigravity"],
      ["model", "gemini-2.5-pro"],
      ["status", "HTTP 503"],
      ["exp", "hết hạn 30m"],
      ["ok", "✓ OK"],
    ]);
  });

  it("ignores non-numeric status and NaN expiresIn safely", () => {
    const chips = formatMetaChips({ status: "ok", expiresIn: Number.NaN, port: 8443 });
    expect(chips.map((c) => [c.key, c.label])).toEqual([
      ["status", "status: ok"],
      ["port", "port: 8443"],
    ]);
  });

  it("formats id chip when email is absent, expired exp, and fail chip", () => {
    const chips = formatMetaChips({
      connectionId: "abcdef1234567890",
      status: 429,
      expiresIn: -120,
      success: false,
    });

    expect(chips.map((c) => [c.key, c.label])).toEqual([
      ["status", "HTTP 429"],
      ["id", "#abcdef12"],
      ["exp", "quá hạn 2m"],
      ["fail", "✕ Lỗi"],
    ]);
  });

  it("formats HTTP 200 status with emerald tone", () => {
    const chips = formatMetaChips({ status: 200 });
    expect(chips[0].key).toBe("status");
    expect(chips[0].label).toBe("HTTP 200");
    expect(chips[0].tone).toContain("emerald");
  });

  it("falls back to up to 3 primitive keys even when nested objects appear earlier", () => {
    const chips = formatMetaChips({
      nested: { a: 1 },
      empty: null,
      port: 8443,
      latency: "12ms",
      BackendState: "Running",
      extra: "ignored",
    });

    expect(chips.map((c) => [c.key, c.label])).toEqual([
      ["port", "port: 8443"],
      ["latency", "latency: 12ms"],
      ["BackendState", "BackendState: Running"],
    ]);
  });
});
