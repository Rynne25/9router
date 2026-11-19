import { homedir, tmpdir, platform } from "os";
import { join } from "path";
import { existsSync, readFileSync, copyFileSync, unlinkSync } from "fs";
import { createRequire } from "module";
import crypto from "crypto";

function getRuntimeRequire() {
  try {
    return createRequire(join(process.cwd(), "package.json"));
  } catch {
    return null;
  }
}

/**
 * Returns candidate file paths for Antigravity state.vscdb based on OS.
 */
export function getCandidateDbPaths() {
  const home = homedir();
  const currentPlatform = platform();

  if (currentPlatform === "win32") {
    const appData = process.env.APPDATA || join(home, "AppData", "Roaming");
    const localAppData = process.env.LOCALAPPDATA || join(home, "AppData", "Local");
    return [
      join(appData, "Antigravity IDE", "User", "globalStorage", "state.vscdb"),
      join(appData, "Antigravity", "User", "globalStorage", "state.vscdb"),
      join(localAppData, "Programs", "Antigravity IDE", "User", "globalStorage", "state.vscdb"),
      join(localAppData, "Programs", "Antigravity", "User", "globalStorage", "state.vscdb"),
      join(localAppData, "Antigravity IDE", "User", "globalStorage", "state.vscdb"),
      join(localAppData, "Antigravity", "User", "globalStorage", "state.vscdb"),
    ];
  }

  if (currentPlatform === "darwin") {
    return [
      join(home, "Library", "Application Support", "Antigravity IDE", "User", "globalStorage", "state.vscdb"),
      join(home, "Library", "Application Support", "Antigravity", "User", "globalStorage", "state.vscdb"),
    ];
  }

  // Linux and other Unix-like systems
  return [
    join(home, ".config", "Antigravity IDE", "User", "globalStorage", "state.vscdb"),
    join(home, ".config", "antigravity-ide", "User", "globalStorage", "state.vscdb"),
    join(home, ".config", "Antigravity", "User", "globalStorage", "state.vscdb"),
    join(home, ".config", "antigravity", "User", "globalStorage", "state.vscdb"),
  ];
}

/**
 * Returns CLI and standalone token file paths.
 */
export function getCliTokenPaths() {
  const home = homedir();
  return [
    {
      source: "cli",
      path: join(home, ".gemini", "antigravity-cli", "antigravity-oauth-token"),
    },
    {
      source: "classic",
      path: join(home, ".gemini", "jetski-standalone-oauth-token"),
    },
  ];
}

/**
 * Lightweight Protobuf wire parser for decoding nested message structures.
 *
 * @param {Buffer} buf
 * @returns {Record<number, any>}
 */
export function parseProtobuf(buf) {
  if (!Buffer.isBuffer(buf) || buf.length === 0) return {};
  const fields = {};
  let offset = 0;

  while (offset < buf.length) {
    let tag = 0;
    let shift = 0;
    while (offset < buf.length) {
      const byte = buf[offset++];
      tag |= (byte & 0x7f) << shift;
      if (!(byte & 0x80)) break;
      shift += 7;
    }

    const wireType = tag & 0x07;
    const fieldNumber = tag >>> 3;

    if (wireType === 0) {
      // Varint
      let val = 0n;
      let valShift = 0n;
      while (offset < buf.length) {
        const byte = BigInt(buf[offset++]);
        val |= (byte & 0x7fn) << valShift;
        if (!(byte & 0x80n)) break;
        valShift += 7n;
      }
      fields[fieldNumber] = val;
    } else if (wireType === 2) {
      // Length-delimited
      let length = 0;
      let lenShift = 0;
      while (offset < buf.length) {
        const byte = buf[offset++];
        length |= (byte & 0x7f) << lenShift;
        if (!(byte & 0x80)) break;
        lenShift += 7;
      }
      if (offset + length > buf.length) break;
      const slice = buf.subarray(offset, offset + length);
      offset += length;

      if (!fields[fieldNumber]) {
        fields[fieldNumber] = slice;
      } else if (Array.isArray(fields[fieldNumber])) {
        fields[fieldNumber].push(slice);
      } else {
        fields[fieldNumber] = [fields[fieldNumber], slice];
      }
    } else if (wireType === 1) {
      // 64-bit
      offset += 8;
    } else if (wireType === 5) {
      // 32-bit
      offset += 4;
    } else {
      break;
    }
  }

  return fields;
}

/**
 * Decode antigravityUnifiedStateSync.oauthToken Base64/Protobuf value.
 */
export function decodeOauthToken(rawVal) {
  if (!rawVal || typeof rawVal !== "string") return null;

  let refreshToken = null;
  let accessToken = null;
  let isGcpTos = false;
  let validationUrl = null;
  let appealUrl = null;
  let errorMessage = null;

  try {
    const outerBuf = Buffer.from(rawVal, "base64");
    const outerFields = parseProtobuf(outerBuf);
    const entries = Array.isArray(outerFields[1]) ? outerFields[1] : outerFields[1] ? [outerFields[1]] : [];

    for (const entryBuf of entries) {
      const entry = parseProtobuf(entryBuf);
      const key = entry[1]?.toString("utf8");

      if (key === "authStateWithContextSentinelKey" && entry[2]) {
        const valObj = parseProtobuf(entry[2]);
        const jsonStr = valObj[1]?.toString("utf8");
        if (jsonStr) {
          try {
            const parsed = JSON.parse(jsonStr);
            const ctx = parsed?.context || {};
            isGcpTos = ctx.isGcpTos === true || ctx.is_gcp_tos === true;
            validationUrl = ctx.verificationUrl || ctx.validation_url || null;
            appealUrl = ctx.appealUrl || ctx.appeal_url || null;
            errorMessage = ctx.errorMessage || null;
          } catch {
            // Ignore JSON parse errors
          }
        }
      } else if (key === "oauthTokenInfoSentinelKey" && entry[2]) {
        const valObj = parseProtobuf(entry[2]);
        const innerB64 = valObj[1]?.toString("utf8");
        if (innerB64) {
          const innerBuf = Buffer.from(innerB64, "base64");
          const innerFields = parseProtobuf(innerBuf);
          if (innerFields[1]) accessToken = innerFields[1].toString("utf8");
          if (innerFields[3]) refreshToken = innerFields[3].toString("utf8");
        }
      }
    }
  } catch {
    // Protobuf decode failed, fall through to regex
  }

  // Regex fallback in case of schema drift
  if (!refreshToken) {
    const match = rawVal.match(/1\/\/[a-zA-Z0-9_\-\.]+/);
    if (match) refreshToken = match[0];
  }

  if (!refreshToken) {
    try {
      const decodedUtf8 = Buffer.from(rawVal, "base64").toString("utf8");
      const match = decodedUtf8.match(/1\/\/[a-zA-Z0-9_\-\.]+/);
      if (match) refreshToken = match[0];
      if (!accessToken) {
        const atMatch = decodedUtf8.match(/ya29\.[a-zA-Z0-9_\-]+/);
        if (atMatch) accessToken = atMatch[0];
      }
      if (!isGcpTos && /"isGcpTos"\s*:\s*true/i.test(decodedUtf8)) {
        isGcpTos = true;
      }
    } catch {
      // Ignore
    }
  }

  return {
    refreshToken,
    accessToken,
    isGcpTos,
    validationUrl,
    appealUrl,
    errorMessage,
  };
}

/**
 * Decode jetskiStateSync.agentManagerInitState value (legacy/classic).
 */
export function decodeInitState(rawVal) {
  if (!rawVal || typeof rawVal !== "string") return null;

  let refreshToken = null;
  let accessToken = null;
  let isGcpTos = false;
  let enterpriseGcpProjectId = null;

  // 1. Try parsing directly as JSON
  try {
    const parsed = JSON.parse(rawVal);
    refreshToken = parsed.refreshToken || parsed.refresh_token || parsed.token || null;
    accessToken = parsed.accessToken || parsed.access_token || null;
    isGcpTos = parsed.isGcpTos === true || parsed.is_gcp_tos === true;
    enterpriseGcpProjectId = parsed.enterpriseGcpProjectId || parsed.projectId || null;
  } catch {
    // 2. Try Base64 decode
    try {
      const buf = Buffer.from(rawVal, "base64");
      const utf8 = buf.toString("utf8");
      const rtMatch = utf8.match(/1\/\/[a-zA-Z0-9_\-]+/);
      if (rtMatch) refreshToken = rtMatch[0];
      const atMatch = utf8.match(/ya29\.[a-zA-Z0-9_\-]+/);
      if (atMatch) accessToken = atMatch[0];
      if (/"isGcpTos"\s*:\s*true/i.test(utf8)) isGcpTos = true;
      const projMatch = utf8.match(/"(?:enterpriseGcpProjectId|projectId)"\s*:\s*"([^"]+)"/);
      if (projMatch) enterpriseGcpProjectId = projMatch[1];
    } catch {
      // Ignore
    }
  }

  if (!refreshToken) {
    const match = rawVal.match(/1\/\/[a-zA-Z0-9_\-]+/);
    if (match) refreshToken = match[0];
  }

  return {
    refreshToken,
    accessToken,
    isGcpTos,
    enterpriseGcpProjectId,
  };
}

/**
 * Decode antigravityUnifiedStateSync.enterprisePreferences value.
 */
export function decodeEnterprisePreferences(rawVal) {
  if (!rawVal || typeof rawVal !== "string") return null;
  try {
    const buf = Buffer.from(rawVal, "base64");
    const fields = parseProtobuf(buf);
    const entryBuf = fields[1];
    if (entryBuf) {
      const entry = parseProtobuf(entryBuf);
      const key = entry[1]?.toString("utf8");
      if (key === "enterpriseGcpProjectId" && entry[2]) {
        const valObj = parseProtobuf(entry[2]);
        const projectId = valObj[1]?.toString("utf8");
        if (projectId) return projectId;
      }
    }
  } catch {
    // Fall back to regex
  }

  try {
    const utf8 = Buffer.from(rawVal, "base64").toString("utf8");
    const match = utf8.match(/enterpriseGcpProjectId[^\w-]*([a-zA-Z0-9_\-]+)/);
    if (match) return match[1];
  } catch {
    // Ignore
  }

  return null;
}

const TARGET_DB_KEYS = [
  "antigravityUnifiedStateSync.oauthToken",
  "jetskiStateSync.agentManagerInitState",
  "antigravityUnifiedStateSync.enterprisePreferences",
  "storage.serviceMachineId",
  "telemetry.serviceMachineId",
];

function decodeDbValue(val) {
  if (val == null) return null;
  if (typeof val === "string") return val;
  if (val instanceof Uint8Array || Buffer.isBuffer(val)) {
    return Buffer.from(val).toString("utf8");
  }
  return String(val);
}

function queryRowsSync(targetPath) {
  const result = {};

  // Strategy A: Built-in node:sqlite (Node >= 22.5; avoids Node 24 better-sqlite3 SIGSEGV)
  if (!process.versions.bun) {
    const [maj, min] = process.versions.node.split(".").map(Number);
    if (maj > 22 || (maj === 22 && min >= 5)) {
      const sqliteMod = process.getBuiltinModule?.("node:sqlite");
      if (sqliteMod?.DatabaseSync) {
        const db = new sqliteMod.DatabaseSync(targetPath, { readOnly: true });
        try {
          const rows = db.prepare("SELECT key, value FROM ItemTable WHERE key IN (?, ?, ?, ?, ?)").all(...TARGET_DB_KEYS);
          for (const row of rows) {
            const val = decodeDbValue(row?.value);
            if (row?.key && val !== null) result[row.key] = val;
          }
          return result;
        } finally {
          try { db.close(); } catch {}
        }
      }
    }
  }

  // Strategy B: better-sqlite3 (Node < 24 only)
  const [nodeMajor] = process.versions.node.split(".").map(Number);
  const req = getRuntimeRequire();
  if (!process.versions.bun && nodeMajor < 24 && req) {
    const Database = req("better-sqlite3");
    const db = new Database(targetPath, { readonly: true, fileMustExist: true, timeout: 3000 });
    try {
      const rows = db.prepare("SELECT key, value FROM ItemTable WHERE key IN (?, ?, ?, ?, ?)").all(...TARGET_DB_KEYS);
      for (const row of rows) {
        const val = decodeDbValue(row?.value);
        if (row?.key && val !== null) result[row.key] = val;
      }
      return result;
    } finally {
      try { db.close(); } catch {}
    }
  }

  throw new Error("No synchronous SQLite driver available");
}

/**
 * Reads state.vscdb safely with copy-temp fallback if locked on Windows.
 *
 * @param {string} dbPath
 * @returns {Record<string, string>}
 */
function readDbRows(dbPath) {
  if (!existsSync(dbPath)) return {};

  try {
    return queryRowsSync(dbPath);
  } catch {
    // Fall through to temp-copy strategy (handles EBUSY / SQLITE_BUSY when IDE is open)
  }

  const tempPath = join(tmpdir(), `9router_vscdb_scan_${Date.now()}_${crypto.randomBytes(4).toString("hex")}.tmp`);
  try {
    copyFileSync(dbPath, tempPath);
    return queryRowsSync(tempPath);
  } catch {
    return {};
  } finally {
    if (existsSync(tempPath)) {
      try { unlinkSync(tempPath); } catch {}
    }
  }
}

/**
 * Scans a single state.vscdb file and extracts account details.
 *
 * @param {string} dbPath
 * @returns {Array<object>}
 */
export function scanStateDb(dbPath) {
  if (!existsSync(dbPath)) return [];

  const rows = readDbRows(dbPath);
  const accounts = [];

  const serviceMachineId = rows["storage.serviceMachineId"] || rows["telemetry.serviceMachineId"] || null;
  const enterpriseGcpProjectId = decodeEnterprisePreferences(rows["antigravityUnifiedStateSync.enterprisePreferences"]);

  // 1. Check antigravityUnifiedStateSync.oauthToken
  if (rows["antigravityUnifiedStateSync.oauthToken"]) {
    const decoded = decodeOauthToken(rows["antigravityUnifiedStateSync.oauthToken"]);
    if (decoded?.refreshToken) {
      accounts.push({
        source: "state.vscdb",
        path: dbPath,
        refreshToken: decoded.refreshToken,
        accessToken: decoded.accessToken || null,
        isGcpTos: decoded.isGcpTos,
        enterpriseGcpProjectId: enterpriseGcpProjectId || null,
        serviceMachineId: serviceMachineId,
        validationUrl: decoded.validationUrl,
        appealUrl: decoded.appealUrl,
        errorMessage: decoded.errorMessage,
        isCurrent: true,
      });
    }
  }

  // 2. Check jetskiStateSync.agentManagerInitState
  if (rows["jetskiStateSync.agentManagerInitState"]) {
    const decoded = decodeInitState(rows["jetskiStateSync.agentManagerInitState"]);
    if (decoded?.refreshToken) {
      const alreadyHas = accounts.some((a) => a.refreshToken === decoded.refreshToken);
      if (!alreadyHas) {
        accounts.push({
          source: "classic",
          path: dbPath,
          refreshToken: decoded.refreshToken,
          accessToken: decoded.accessToken || null,
          isGcpTos: decoded.isGcpTos,
          enterpriseGcpProjectId: decoded.enterpriseGcpProjectId || enterpriseGcpProjectId || null,
          serviceMachineId: serviceMachineId,
          isCurrent: accounts.length === 0,
        });
      }
    }
  }

  return accounts;
}

/**
 * Scans CLI and standalone token files (~/.gemini/...).
 *
 * @returns {Array<object>}
 */
export function scanCliTokens() {
  const accounts = [];
  const files = getCliTokenPaths();

  for (const item of files) {
    if (!existsSync(item.path)) continue;

    try {
      const content = readFileSync(item.path, "utf8").trim();
      if (!content) continue;

      let refreshToken = null;
      let accessToken = null;
      let email = null;
      let projectId = null;

      if (content.startsWith("{")) {
        try {
          const parsed = JSON.parse(content);
          refreshToken = parsed.token?.refresh_token || parsed.refresh_token || parsed.refreshToken || (typeof parsed.token === "string" ? parsed.token : null);
          accessToken = parsed.token?.access_token || parsed.access_token || parsed.accessToken || null;
          email = parsed.id_token_email || parsed.email || null;
          projectId = parsed.projectId || parsed.enterpriseGcpProjectId || null;
        } catch {
          // Fall through
        }
      }

      if (!refreshToken) {
        const match = content.match(/1\/\/[a-zA-Z0-9_\-]+/);
        if (match) refreshToken = match[0];
      }

      if (refreshToken) {
        accounts.push({
          source: item.source,
          path: item.path,
          refreshToken,
          accessToken,
          email,
          projectId,
          isCurrent: false,
        });
      }
    } catch {
      // Ignore read errors
    }
  }

  return accounts;
}

/**
 * Main scanner function: scans local SQLite DBs and CLI tokens,
 * deduplicates accounts by refreshToken.
 *
 * @param {string} [customPath]
 * @returns {Array<object>}
 */
export function scanLocalDbs(customPath = null) {
  const allAccounts = [];
  const seenTokens = new Set();

  const dbPaths = customPath ? [customPath] : getCandidateDbPaths();

  for (const dbPath of dbPaths) {
    if (!existsSync(dbPath)) continue;
    const found = scanStateDb(dbPath);
    for (const acc of found) {
      if (acc.refreshToken && !seenTokens.has(acc.refreshToken)) {
        seenTokens.add(acc.refreshToken);
        allAccounts.push(acc);
      }
    }
  }

  // Scan CLI tokens
  const cliAccounts = scanCliTokens();
  for (const acc of cliAccounts) {
    if (acc.refreshToken && !seenTokens.has(acc.refreshToken)) {
      seenTokens.add(acc.refreshToken);
      allAccounts.push(acc);
    }
  }

  return allAccounts;
}
