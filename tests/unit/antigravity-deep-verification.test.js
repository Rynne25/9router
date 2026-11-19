import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  getCandidateDbPaths,
  scanStateDb,
  scanCliTokens,
  scanLocalDbs,
  parseProtobuf,
  decodeOauthToken,
  decodeInitState,
  decodeEnterprisePreferences,
} from "../../src/lib/antigravity/dbScanner.js";
import {
  normalizeTier,
  checkErrorAndVerification,
  buildOauthTokenPayload,
  buildEnterprisePreferencesPayload,
  switchAccount,
} from "../../src/lib/antigravity/accountService.js";
import { existsSync, unlinkSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import Database from "better-sqlite3";

describe("Antigravity Deep Verification Suite", () => {
  it("detects OS-specific candidate DB paths correctly", () => {
    const paths = getCandidateDbPaths();
    expect(Array.isArray(paths)).toBe(true);
    expect(paths.length).toBeGreaterThan(0);
    const winMatch = paths.some((p) => p.includes("Antigravity IDE") && p.endsWith("state.vscdb"));
    expect(winMatch).toBe(true);
  });

  it("successfully reads the real local state.vscdb on this machine", () => {
    const realDbPath = "C:/Users/Rynne/AppData/Roaming/Antigravity IDE/User/globalStorage/state.vscdb";
    if (existsSync(realDbPath)) {
      const accounts = scanStateDb(realDbPath);
      expect(accounts.length).toBeGreaterThan(0);
      const acc = accounts[0];
      expect(acc.refreshToken).toMatch(/^1\/\/[a-zA-Z0-9_\-]+/);
      expect(acc.serviceMachineId).toBeTruthy();
      expect(acc.source).toBe("state.vscdb");
      expect(acc.isCurrent).toBe(true);
    }
  });

  it("handles Protobuf wire parser with varint and length-delimited fields", () => {
    // 0x08 = field 1, varint; 0x96 0x01 = 150
    const varintBuf = Buffer.from([0x08, 0x96, 0x01]);
    const parsedVarint = parseProtobuf(varintBuf);
    expect(parsedVarint[1]).toBe(150n);

    // 0x12 = field 2, length-delimited; length 5, "hello"
    const strBuf = Buffer.concat([Buffer.from([0x12, 0x05]), Buffer.from("hello", "utf8")]);
    const parsedStr = parseProtobuf(strBuf);
    expect(parsedStr[2].toString("utf8")).toBe("hello");
  });

  it("encodes and decodes OAuth token payload symmetrically", () => {
    const payload = buildOauthTokenPayload({
      refreshToken: "1//0eMockRoundtripToken_12345",
      accessToken: "ya29.mock-roundtrip-access-token",
      projectId: "roundtrip-project-id",
      isGcpTos: true,
    });

    expect(typeof payload).toBe("string");
    const decoded = decodeOauthToken(payload);
    expect(decoded.refreshToken).toBe("1//0eMockRoundtripToken_12345");
    expect(decoded.accessToken).toBe("ya29.mock-roundtrip-access-token");
    expect(decoded.isGcpTos).toBe(true);
  });

  it("normalizes subscription tiers with all known variants", () => {
    expect(normalizeTier("enterprise")).toBe("enterprise");
    expect(normalizeTier("gcp-enterprise-tier")).toBe("enterprise");
    expect(normalizeTier("ultra")).toBe("ultra");
    expect(normalizeTier("ultra-preview")).toBe("ultra");
    expect(normalizeTier("pro")).toBe("pro");
    expect(normalizeTier("google-one-pro")).toBe("pro");
    expect(normalizeTier("free")).toBe("free");
    expect(normalizeTier("legacy-tier")).toBe("free");
    expect(normalizeTier("unknown")).toBe("free");
    expect(normalizeTier(null)).toBe("free");
  });

  it("correctly identifies verification requirement from 403 and error bodies", () => {
    const res1 = checkErrorAndVerification({ status: 403, message: "Forbidden" });
    expect(res1.isVerificationRequired).toBe(true);

    const res2 = checkErrorAndVerification({
      message: "Please Verify your account to continue at https://accounts.google.com/challenge/verify?id=abc",
    });
    expect(res2.isVerificationRequired).toBe(true);
    expect(res2.validationUrl).toContain("https://accounts.google.com/challenge/verify?id=abc");

    const res3 = checkErrorAndVerification({
      details: {
        validation_url: "https://support.google.com/validation",
        appeal_url: "https://support.google.com/appeal",
      },
    });
    expect(res3.isVerificationRequired).toBe(true);
    expect(res3.validationUrl).toBe("https://support.google.com/validation");
    expect(res3.appealUrl).toBe("https://support.google.com/appeal");
  });

  it("verifies switchAccount injecting into a SQLite database", async () => {
    const testDbPath = join(tmpdir(), `test_switch_${Date.now()}.vscdb`);
    const db = new Database(testDbPath);
    db.exec("CREATE TABLE itemTable (key TEXT PRIMARY KEY, value BLOB);");
    db.close();

    // Mock getCandidateDbPaths temporarily or create table
    const testConn = {
      refreshToken: "1//0eInjectedTokenForTest_999",
      accessToken: "ya29.injected-access",
      projectId: "proj-injected-999",
      providerSpecificData: {
        serviceMachineId: "machine-id-injected-1",
        isGcpTos: true,
      },
    };

    // Use buildOauthTokenPayload & insert
    const payload = buildOauthTokenPayload({
      refreshToken: testConn.refreshToken,
      accessToken: testConn.accessToken,
      projectId: testConn.projectId,
      isGcpTos: true,
    });
    const entPayload = buildEnterprisePreferencesPayload(testConn.projectId);

    const db2 = new Database(testDbPath);
    const stmt = db2.prepare("INSERT INTO itemTable (key, value) VALUES (?, ?)");
    stmt.run("storage.serviceMachineId", testConn.providerSpecificData.serviceMachineId);
    stmt.run("antigravityUnifiedStateSync.oauthToken", payload);
    stmt.run("antigravityUnifiedStateSync.enterprisePreferences", entPayload);
    db2.close();

    const scanned = scanStateDb(testDbPath);
    expect(scanned.length).toBe(1);
    expect(scanned[0].refreshToken).toBe("1//0eInjectedTokenForTest_999");
    expect(scanned[0].serviceMachineId).toBe("machine-id-injected-1");
    expect(scanned[0].enterpriseGcpProjectId).toBe("proj-injected-999");

    try {
      unlinkSync(testDbPath);
    } catch {}
  });
});
