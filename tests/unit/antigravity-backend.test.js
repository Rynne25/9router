import { describe, it, expect } from "vitest";
import {
  getCandidateDbPaths,
  getCliTokenPaths,
  parseProtobuf,
  decodeOauthToken,
  decodeInitState,
  decodeEnterprisePreferences,
  scanLocalDbs,
} from "../../src/lib/antigravity/dbScanner.js";
import {
  normalizeTier,
  checkErrorAndVerification,
  buildOauthTokenPayload,
  buildEnterprisePreferencesPayload,
} from "../../src/lib/antigravity/accountService.js";

describe("Antigravity Backend - dbScanner", () => {
  it("returns candidate DB paths", () => {
    const paths = getCandidateDbPaths();
    expect(Array.isArray(paths)).toBe(true);
    expect(paths.length).toBeGreaterThan(0);
    expect(paths.some((p) => p.includes("state.vscdb"))).toBe(true);
  });

  it("returns CLI token file paths", () => {
    const cliPaths = getCliTokenPaths();
    expect(Array.isArray(cliPaths)).toBe(true);
    expect(cliPaths.length).toBe(2);
    expect(cliPaths.map((c) => c.source)).toContain("cli");
    expect(cliPaths.map((c) => c.source)).toContain("classic");
  });

  it("parses protobuf varint and length-delimited fields", () => {
    // Construct simple protobuf: tag 1 (wireType 2) = "hello", tag 2 (wireType 0) = 42
    const buf = Buffer.concat([
      Buffer.from([0x0a, 0x05]), // tag: 1 << 3 | 2 = 10 (0x0a), len: 5
      Buffer.from("hello", "utf8"),
      Buffer.from([0x10, 0x2a]), // tag: 2 << 3 | 0 = 16 (0x10), val: 42 (0x2a)
    ]);
    const parsed = parseProtobuf(buf);
    expect(parsed[1].toString("utf8")).toBe("hello");
    expect(parsed[2]).toBe(42n);
  });

  it("builds and decodes oauthToken payload round-trip", () => {
    const refreshToken = "1//test_refresh_token_1234567890_XYZ";
    const accessToken = "ya29.test_access_token_mock_ABC";
    const projectId = "test-project-123";

    const payload = buildOauthTokenPayload({
      refreshToken,
      accessToken,
      projectId,
      isGcpTos: true,
    });

    expect(typeof payload).toBe("string");
    expect(payload.length).toBeGreaterThan(0);

    const decoded = decodeOauthToken(payload);
    expect(decoded).not.toBeNull();
    expect(decoded.refreshToken).toBe(refreshToken);
    expect(decoded.accessToken).toBe(accessToken);
    expect(decoded.isGcpTos).toBe(true);
  });

  it("decodes legacy initState from JSON", () => {
    const jsonStr = JSON.stringify({
      refreshToken: "1//legacy_token_abc",
      accessToken: "ya29.legacy_token_xyz",
      isGcpTos: false,
      enterpriseGcpProjectId: "enterprise-proj-789",
    });
    const decoded = decodeInitState(jsonStr);
    expect(decoded.refreshToken).toBe("1//legacy_token_abc");
    expect(decoded.accessToken).toBe("ya29.legacy_token_xyz");
    expect(decoded.isGcpTos).toBe(false);
    expect(decoded.enterpriseGcpProjectId).toBe("enterprise-proj-789");
  });

  it("builds and decodes enterprise preferences payload round-trip", () => {
    const projId = "my-custom-enterprise-project";
    const payload = buildEnterprisePreferencesPayload(projId);
    expect(typeof payload).toBe("string");

    const decoded = decodeEnterprisePreferences(payload);
    expect(decoded).toBe(projId);
  });

  it("scans local DBs without throwing", () => {
    const accounts = scanLocalDbs();
    expect(Array.isArray(accounts)).toBe(true);
    // If state.vscdb exists on this machine, it should find at least 1 account
    if (accounts.length > 0) {
      expect(accounts[0].refreshToken).toMatch(/^1\/\//);
      expect(accounts[0].source).toBeDefined();
    }
  });
});

describe("Antigravity Backend - accountService", () => {
  it("normalizes tiers correctly", () => {
    expect(normalizeTier("free-tier")).toBe("free");
    expect(normalizeTier("legacy-tier")).toBe("free");
    expect(normalizeTier("free")).toBe("free");
    expect(normalizeTier(null)).toBe("free");
    expect(normalizeTier("")).toBe("free");

    expect(normalizeTier("pro-tier")).toBe("pro");
    expect(normalizeTier("gemini-code-assist-pro")).toBe("pro");
    expect(normalizeTier("PRO")).toBe("pro");

    expect(normalizeTier("ultra-tier")).toBe("ultra");
    expect(normalizeTier("Ultra")).toBe("ultra");

    expect(normalizeTier("enterprise-tier")).toBe("enterprise");
    expect(normalizeTier("ENTERPRISE")).toBe("enterprise");
  });

  it("detects 403 and extracts verification / appeal URLs", () => {
    const errorObj = {
      status: 403,
      message: "Verify your account to continue at https://accounts.google.com/verify?id=test",
    };
    const res = checkErrorAndVerification(errorObj);
    expect(res.isVerificationRequired).toBe(true);
    expect(res.status).toBe(403);
    expect(res.validationUrl).toBe("https://accounts.google.com/verify?id=test");
  });

  it("extracts appeal URL from structured data", () => {
    const errorObj = {
      status: 403,
      data: {
        error: {
          code: 403,
          message: "Account suspended. Please visit https://google.com/appeal to file an appeal.",
        },
        appeal_url: "https://support.google.com/appeal/123",
      },
    };
    const res = checkErrorAndVerification(errorObj);
    expect(res.isVerificationRequired).toBe(true);
    expect(res.appealUrl).toBe("https://support.google.com/appeal/123");
  });

  it("returns isVerificationRequired = false on regular errors", () => {
    const errorObj = {
      status: 500,
      message: "Internal server error",
    };
    const res = checkErrorAndVerification(errorObj);
    expect(res.isVerificationRequired).toBe(false);
    expect(res.validationUrl).toBeNull();
  });
});
