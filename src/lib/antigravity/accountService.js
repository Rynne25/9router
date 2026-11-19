import crypto from "crypto";
import { homedir, tmpdir, platform as getOsPlatform, arch as getOsArch } from "os";
import { join, dirname } from "path";
import { existsSync, mkdirSync, readFileSync, writeFileSync, copyFileSync, unlinkSync } from "fs";
import { execFile, spawn } from "child_process";
import { promisify } from "util";
import { ANTIGRAVITY_OAUTH_CLIENT, ANTIGRAVITY_IDE_USER_AGENT, ANTIGRAVITY_IDE_VERSION } from "../../../open-sse/providers/shared.js";
import { getCandidateDbPaths, decodeOauthToken } from "./dbScanner.js";

const execFileAsync = promisify(execFile);

/**
 * Get the platform enum value based on the current OS.
 * Matches Antigravity binary's ClientMetadata.Platform enum.
 */
function getOAuthPlatformEnum() {
  const os = getOsPlatform();
  const architecture = getOsArch();
  if (os === "darwin") return architecture === "arm64" ? 2 : 1;
  if (os === "linux") return architecture === "arm64" ? 4 : 3;
  if (os === "win32") return 5;
  return 0;
}

/**
 * Get client metadata using numeric enum values for API calls.
 * @returns {{ ideType: number, platform: number, pluginType: number }}
 */
export function getOAuthClientMetadata() {
  return { ideType: 9, platform: getOAuthPlatformEnum(), pluginType: 2 };
}

const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const USER_INFO_ENDPOINT = "https://www.googleapis.com/oauth2/v3/userinfo";
const LOAD_CODE_ASSIST_ENDPOINT = "https://cloudcode-pa.googleapis.com/v1internal:loadCodeAssist";
const GENERATE_CONTENT_ENDPOINT = "https://daily-cloudcode-pa.googleapis.com/v1internal:generateContent";

/**
 * Encodes a BigInt or number as a Protobuf varint Buffer.
 */
function encodeVarint(val) {
  let v = BigInt(val);
  const bytes = [];
  while (v >= 0x80n) {
    bytes.push(Number((v & 0x7fn) | 0x80n));
    v >>= 7n;
  }
  bytes.push(Number(v));
  return Buffer.from(bytes);
}

/**
 * Encodes a Protobuf tag.
 */
function encodeTag(fieldNumber, wireType) {
  return encodeVarint((fieldNumber << 3) | wireType);
}

/**
 * Encodes a length-delimited Protobuf field.
 */
function encodeLengthDelimited(fieldNumber, data) {
  const buf = Buffer.isBuffer(data) ? data : Buffer.from(data, "utf8");
  return Buffer.concat([
    encodeTag(fieldNumber, 2),
    encodeVarint(buf.length),
    buf,
  ]);
}

function isPersonalEmailDomain(email) {
  if (!email || typeof email !== "string") return false;
  const lower = email.toLowerCase().trim();
  return (
    lower.endsWith("@gmail.com") ||
    lower.endsWith("@outlook.com") ||
    lower.endsWith("@hotmail.com") ||
    lower.endsWith("@qq.com") ||
    lower.endsWith("@163.com")
  );
}

/**
 * Builds the Base64-encoded Protobuf payload for antigravityUnifiedStateSync.oauthToken.
 * Matches Antigravity-Manager's create_oauth_info + unified topic schema.
 *
 * @param {object} params
 * @param {string} params.refreshToken
 * @param {string} [params.accessToken]
 * @param {string} [params.projectId]
 * @param {boolean} [params.isGcpTos]
 * @param {string} [params.idToken]
 * @param {string} [params.email]
 * @returns {string} Base64 encoded payload
 */
export function buildOauthTokenPayload({ refreshToken, accessToken = "", projectId = "", isGcpTos = false, idToken = "", email = "" }) {
  const effectiveGcpTos = Boolean(isGcpTos) && !isPersonalEmailDomain(email);

  // Inner Token Protobuf Message (OAuthTokenInfo):
  // field 1: accessToken (string)
  // field 2: "Bearer" (string)
  // field 3: refreshToken (string)
  // field 4: Timestamp { int64 seconds = 1; int32 nanos = 2; }
  // field 5: id_token (string, optional)
  // field 6: is_gcp_tos (varint 1, optional)
  const expirySeconds = Math.floor(Date.now() / 1000) + 3600;
  const expirySub = Buffer.concat([
    encodeTag(1, 0),
    encodeVarint(expirySeconds),
    encodeTag(2, 0),
    encodeVarint(0),
  ]);

  const innerParts = [
    encodeLengthDelimited(1, accessToken || ""),
    encodeLengthDelimited(2, "Bearer"),
    encodeLengthDelimited(3, refreshToken),
    encodeLengthDelimited(4, expirySub),
  ];
  if (idToken) {
    innerParts.push(encodeLengthDelimited(5, idToken));
  }
  if (effectiveGcpTos) {
    innerParts.push(Buffer.concat([encodeTag(6, 0), encodeVarint(1)]));
  }
  const innerBuf = Buffer.concat(innerParts);
  const innerBase64 = innerBuf.toString("base64");

  // Outer Map Entry 0: authStateWithContextSentinelKey
  const authContextJson = JSON.stringify({
    state: "signedIn",
    context: {
      project: projectId || "",
      showProjectError: false,
      errorMessage: "",
      ineligibleMessage: "",
      verificationUrl: "",
      isGcpTos: effectiveGcpTos,
      browserOpenFailed: false,
      appealUrl: "",
      appealLinkText: "",
    },
  });
  const authValSub = encodeLengthDelimited(1, authContextJson);
  const entry0 = Buffer.concat([
    encodeLengthDelimited(1, "authStateWithContextSentinelKey"),
    encodeLengthDelimited(2, authValSub),
  ]);

  // Outer Map Entry 1: oauthTokenInfoSentinelKey
  const tokenValSub = encodeLengthDelimited(1, innerBase64);
  const entry1 = Buffer.concat([
    encodeLengthDelimited(1, "oauthTokenInfoSentinelKey"),
    encodeLengthDelimited(2, tokenValSub),
  ]);

  const outerBuf = Buffer.concat([
    encodeLengthDelimited(1, entry0),
    encodeLengthDelimited(1, entry1),
  ]);

  return outerBuf.toString("base64");
}

/**
 * Builds the Base64-encoded Protobuf payload for antigravityUnifiedStateSync.userStatus.
 * Matches Antigravity-Manager's create_minimal_user_status_payload.
 *
 * @param {string} email
 * @returns {string}
 */
export function buildUserStatusPayload(email) {
  if (!email) return "";
  const innerBuf = Buffer.concat([
    encodeLengthDelimited(3, email),
    encodeLengthDelimited(7, email),
  ]);
  const valSub = encodeLengthDelimited(1, innerBuf.toString("base64"));
  const entry = Buffer.concat([
    encodeLengthDelimited(1, "userStatusSentinelKey"),
    encodeLengthDelimited(2, valSub),
  ]);
  return encodeLengthDelimited(1, entry).toString("base64");
}

/**
 * Builds the Base64-encoded Protobuf payload for antigravityUnifiedStateSync.enterprisePreferences.
 *
 * @param {string} enterpriseGcpProjectId
 * @returns {string} Base64 encoded payload
 */
export function buildEnterprisePreferencesPayload(enterpriseGcpProjectId) {
  if (!enterpriseGcpProjectId) return "";
  const valSub = encodeLengthDelimited(1, enterpriseGcpProjectId);
  const entry = Buffer.concat([
    encodeLengthDelimited(1, "enterpriseGcpProjectId"),
    encodeLengthDelimited(2, valSub),
  ]);
  const outerBuf = encodeLengthDelimited(1, entry);
  return outerBuf.toString("base64");
}

/**
 * 1. exchangeRefreshToken(refreshToken)
 * Calls Google OAuth token endpoint with Antigravity client credentials.
 *
 * @param {string} refreshToken
 * @returns {Promise<{ access_token: string, refresh_token: string, expires_in: number, scope: string, token_type: string }>}
 */
export async function exchangeRefreshToken(refreshToken) {
  if (!refreshToken || typeof refreshToken !== "string") {
    throw new Error("Refresh token is required");
  }

  const cleanToken = refreshToken.trim();
  const response = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: cleanToken,
      client_id: ANTIGRAVITY_OAUTH_CLIENT.clientId,
      client_secret: ANTIGRAVITY_OAUTH_CLIENT.clientSecret,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    let parsedError;
    try {
      parsedError = JSON.parse(errorBody);
    } catch {
      parsedError = null;
    }
    const message = parsedError?.error_description || parsedError?.error || errorBody;
    const err = new Error(`Google token exchange failed (${response.status}): ${message}`);
    err.status = response.status;
    err.details = parsedError;
    throw err;
  }

  const data = await response.json();
  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token || cleanToken,
    expires_in: data.expires_in || 3600,
    scope: data.scope || "",
    token_type: data.token_type || "Bearer",
  };
}

/**
 * 2. getUserInfo(accessToken)
 * Calls Google OAuth2 v3 userinfo endpoint.
 *
 * @param {string} accessToken
 * @returns {Promise<object>}
 */
export async function getUserInfo(accessToken) {
  if (!accessToken) {
    throw new Error("Access token is required to get user info");
  }

  const response = await fetch(USER_INFO_ENDPOINT, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    const errorBody = await response.text();
    const err = new Error(`Failed to get Google user info (${response.status}): ${errorBody}`);
    err.status = response.status;
    throw err;
  }

  return await response.json();
}

/**
 * Normalizes any raw tier identifier into one of: 'free', 'pro', 'ultra', 'enterprise'.
 *
 * @param {string} rawTier
 * @returns {"free" | "pro" | "ultra" | "enterprise"}
 */
export function normalizeTier(rawTier) {
  if (!rawTier || typeof rawTier !== "string") return "free";
  const s = rawTier.toLowerCase().trim();
  if (s.includes("enterprise")) return "enterprise";
  if (s.includes("ultra")) return "ultra";
  if (s.includes("pro")) return "pro";
  if (s.includes("free") || s.includes("legacy")) return "free";
  return "free";
}

/**
 * Detects whether an Antigravity connection has access to Argon or G1 Pro models.
 * @param {object} connection
 * @param {object} [quotaEntry]
 * @returns {boolean}
 */
export function hasArgonOrG1Pro(connection, quotaEntry = null) {
  if (!connection && !quotaEntry) return false;

  // 1. Check connection.providerSpecificData.quotas
  const psdQuotas =
    connection?.providerSpecificData?.quotas ||
    connection?.providerSpecificData?.rawQuotas ||
    connection?.quotas;
  if (psdQuotas && typeof psdQuotas === "object") {
    if (Array.isArray(psdQuotas)) {
      if (
        psdQuotas.some((q) => {
          const k = String(q.modelKey || q.id || q.name || "").toLowerCase();
          return k.includes("argon") || k.includes("orchestrator") || k.includes("g1-pro") || k.includes("g1pro") || k.includes("g1 pro");
        })
      ) {
        return true;
      }
    } else {
      const keys = Object.keys(psdQuotas);
      if (
        keys.some((k) => {
          const lk = k.toLowerCase();
          return lk.includes("argon") || lk.includes("orchestrator") || lk.includes("g1-pro") || lk.includes("g1pro");
        })
      ) {
        return true;
      }
    }
  }

  // 2. Check live / cached quotaData in ProviderLimits
  const qList = quotaEntry?.quotas;
  if (Array.isArray(qList)) {
    if (
      qList.some((q) => {
        const k = String(q.modelKey || q.id || q.name || "").toLowerCase();
        return k.includes("argon") || k.includes("orchestrator") || k.includes("g1-pro") || k.includes("g1pro") || k.includes("g1 pro");
      })
    ) {
      return true;
    }
  }

  const rawObj = quotaEntry?.raw?.quotas || quotaEntry?.raw?.models;
  if (rawObj && typeof rawObj === "object") {
    const keys = Object.keys(rawObj);
    if (
      keys.some((k) => {
        const lk = k.toLowerCase();
        return lk.includes("argon") || lk.includes("orchestrator") || lk.includes("g1-pro") || lk.includes("g1pro");
      })
    ) {
      return true;
    }
  }

  // 3. Check models list if available
  const models = connection?.providerSpecificData?.models || connection?.models;
  if (Array.isArray(models)) {
    if (
      models.some((m) => {
        const id = String(typeof m === "string" ? m : m.id || m.name || "").toLowerCase();
        return id.includes("argon") || id.includes("orchestrator") || id.includes("g1-pro") || id.includes("g1pro");
      })
    ) {
      return true;
    }
  }

  return false;
}

/**
 * Returns the resolved effective tier for an Antigravity account:
 * - "pro": Has Argon / G1 Pro latest models
 * - "pro_jiro": Pro tier without Argon / G1 Pro latest models
 * - "ultra": Ultra tier
 * - "enterprise": Enterprise tier
 * - "free": Free tier
 *
 * @param {object} connection
 * @param {object} [quotaEntry]
 * @returns {"pro" | "pro_jiro" | "ultra" | "enterprise" | "free"}
 */
export function getAntigravityEffectiveTier(connection, quotaEntry = null) {
  if (!connection && !quotaEntry) return "free";
  const rawTier = (
    connection?.providerSpecificData?.subscriptionTier ||
    connection?.providerSpecificData?.tier ||
    connection?.subscriptionTier ||
    connection?.tier ||
    "free"
  ).toLowerCase().trim();

  if (rawTier === "pro_jiro" || rawTier === "pro jiro" || rawTier === "pro-jiro") {
    return "pro_jiro";
  }
  if (rawTier === "enterprise" || rawTier.includes("enterprise")) return "enterprise";
  if (rawTier === "ultra" || rawTier.includes("ultra")) return "ultra";

  if (rawTier === "pro" || rawTier.includes("pro")) {
    return hasArgonOrG1Pro(connection, quotaEntry) ? "pro" : "pro_jiro";
  }

  return "free";
}

/**
 * 3. fetchProjectAndTier(accessToken)
 * Calls https://cloudcode-pa.googleapis.com/v1internal:loadCodeAssist to fetch projectId
 * and normalize tier to 'free', 'pro', 'ultra', 'enterprise'.
 *
 * @param {string} accessToken
 * @returns {Promise<{ projectId: string, tier: "free" | "pro" | "ultra" | "enterprise", raw: object }>}
 */
export async function fetchProjectAndTier(accessToken) {
  if (!accessToken) {
    throw new Error("Access token is required to load code assist");
  }

  const metadata = getOAuthClientMetadata();
  const response = await fetch(LOAD_CODE_ASSIST_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      "User-Agent": ANTIGRAVITY_IDE_USER_AGENT,
      "x-request-source": "local",
    },
    body: JSON.stringify({ metadata }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    const err = new Error(`loadCodeAssist failed (${response.status}): ${errorBody}`);
    err.status = response.status;
    throw err;
  }

  const data = await response.json();

  // Extract projectId
  let projectId = "";
  if (typeof data.cloudaicompanionProject === "string") {
    projectId = data.cloudaicompanionProject.trim();
  } else if (data.cloudaicompanionProject && typeof data.cloudaicompanionProject === "object") {
    projectId = data.cloudaicompanionProject.id || "";
  }

  // Extract rawTier candidate
  let rawTier = "";
  if (data.paidTier?.id || data.paidTier?.name) {
    rawTier = data.paidTier.id || data.paidTier.name;
  } else if (data.currentTier?.id || data.currentTier?.name) {
    rawTier = data.currentTier.id || data.currentTier.name;
  } else if (Array.isArray(data.allowedTiers) && data.allowedTiers.length > 0) {
    const defaultTier = data.allowedTiers.find((t) => t.isDefault && (t.id || t.name));
    if (defaultTier) {
      rawTier = defaultTier.id || defaultTier.name;
    } else {
      rawTier = data.allowedTiers[0].id || data.allowedTiers[0].name || "";
    }
  }

  const tier = normalizeTier(rawTier);

  return {
    projectId,
    tier,
    rawTier: rawTier || "free",
    raw: data,
  };
}

/**
 * 4. checkErrorAndVerification(error)
 * Detects 403, 'Verify your account to continue', extracts validation_url / appeal_url.
 *
 * @param {any} error
 * @returns {{ isVerificationRequired: boolean, status: number|null, message: string, validationUrl: string|null, appealUrl: string|null }}
 */
export function checkErrorAndVerification(error) {
  if (!error) {
    return {
      isVerificationRequired: false,
      status: null,
      message: "",
      validationUrl: null,
      appealUrl: null,
    };
  }

  let status = error.status || error.statusCode || error.code || null;
  let message = error.message || (typeof error === "string" ? error : "");
  let validationUrl = error.validation_url || error.validationUrl || null;
  let appealUrl = error.appeal_url || error.appealUrl || null;

  const data = error.data || error.response?.data || error.body || error.details || null;
  if (data && typeof data === "object") {
    if (!status && data.error?.code) status = data.error.code;
    if (data.error?.message) message = `${message} ${data.error.message}`;
    if (data.validation_url) validationUrl = data.validation_url;
    if (data.appeal_url) appealUrl = data.appeal_url;
    if (data.context) {
      if (data.context.verificationUrl) validationUrl = data.context.verificationUrl;
      if (data.context.appealUrl) appealUrl = data.context.appealUrl;
      if (data.context.errorMessage) message = `${message} ${data.context.errorMessage}`;
    }
    if (Array.isArray(data.error?.details)) {
      for (const d of data.error.details) {
        if (d.validation_url || d.validationUrl) validationUrl = d.validation_url || d.validationUrl;
        if (d.appeal_url || d.appealUrl) appealUrl = d.appeal_url || d.appealUrl;
        if (d.metadata?.validation_url) validationUrl = d.metadata.validation_url;
        if (d.metadata?.appeal_url) appealUrl = d.metadata.appeal_url;
      }
    }
  }

  const messageStr = String(message);

  // Regex extract URL if not found in structured fields
  if (!validationUrl) {
    const vMatch =
      messageStr.match(/https:\/\/(?:accounts\.google\.com|support\.google\.com)[^\s"'>)]*(?:verify|validation|challenge)[^\s"'>)]*/i) ||
      messageStr.match(/https:\/\/[^\s"'>)]*(?:verify|validation|challenge)[^\s"'>)]*/i);
    if (vMatch) validationUrl = vMatch[0];
  }

  if (!appealUrl) {
    const aMatch = messageStr.match(/https:\/\/[^\s"'>)]*(?:appeal|compliance)[^\s"'>)]*/i);
    if (aMatch) appealUrl = aMatch[0];
  }

  const is403 = Number(status) === 403;
  const hasVerifyText =
    /verify\s+your\s+account\s+to\s+continue/i.test(messageStr) ||
    /verification\s+required/i.test(messageStr) ||
    /account\s+suspended/i.test(messageStr) ||
    /appeal/i.test(messageStr) ||
    /unauthorized_client/i.test(messageStr);

  const isVerificationRequired = is403 || hasVerifyText || Boolean(validationUrl || appealUrl);

  return {
    isVerificationRequired,
    status: status ? Number(status) : is403 ? 403 : null,
    message: messageStr.trim(),
    validationUrl,
    appealUrl,
  };
}

/**
 * 5. warmupAccount(connection)
 * Sends prompt 'Say hi' (maxOutputTokens: 10) to gemini-3.8-flash-tiered/high to activate 7-day Weekly Quota Timer.
 *
 * @param {object} connection - Provider connection object
 * @returns {Promise<{ ok: boolean, model: string, text: string, activated: boolean, verification?: object }>}
 */
export async function warmupAccount(connection) {
  if (!connection) {
    throw new Error("Connection is required for warmup");
  }

  // Ensure fresh accessToken
  let accessToken = connection.accessToken;
  if (!accessToken && connection.refreshToken) {
    const tokens = await exchangeRefreshToken(connection.refreshToken);
    accessToken = tokens.access_token;
  }

  if (!accessToken) {
    throw new Error("No access token or refresh token available for connection warmup");
  }

  const projectId = connection.projectId || "";
  const candidateModels = ["gemini-3.8-flash-tiered", "gemini-3.8-flash-high"];
  let lastError = null;

  for (const model of candidateModels) {
    try {
      const payload = {
        project: projectId,
        model,
        userAgent: "antigravity",
        request: {
          contents: [
            {
              role: "user",
              parts: [{ text: "Say hi" }],
            },
          ],
          generationConfig: {
            maxOutputTokens: 10,
          },
        },
      };

      const response = await fetch(GENERATE_CONTENT_ENDPOINT, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          "User-Agent": ANTIGRAVITY_IDE_USER_AGENT,
          "X-Client-Name": "antigravity",
          "X-Client-Version": ANTIGRAVITY_IDE_VERSION,
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorText = await response.text();
        let errorData = null;
        try {
          errorData = JSON.parse(errorText);
        } catch {
          // Ignore
        }
        const err = new Error(`Warmup failed on ${model} (${response.status}): ${errorText}`);
        err.status = response.status;
        err.data = errorData;
        lastError = err;

        // If 404 / model not found, try next candidate model
        if (response.status === 404 || errorText.includes("not found")) {
          continue;
        }

        const verification = checkErrorAndVerification(err);
        if (verification.isVerificationRequired) {
          return {
            ok: false,
            model,
            text: "",
            activated: false,
            error: err.message,
            verification,
          };
        }
        continue;
      }

      const data = await response.json();
      const text =
        data.candidates?.[0]?.content?.parts?.[0]?.text ||
        data.response?.candidates?.[0]?.content?.parts?.[0]?.text ||
        "OK";

      return {
        ok: true,
        model,
        text: text.trim(),
        activated: true,
      };
    } catch (err) {
      lastError = err;
    }
  }

  const verification = checkErrorAndVerification(lastError);
  return {
    ok: false,
    model: candidateModels[0],
    text: "",
    activated: false,
    error: lastError?.message || "Warmup failed on all candidate models",
    verification,
  };
}

const KEYRING_TARGET = "gemini:antigravity";
const KEYRING_USER = "antigravity";

/**
 * Executes a PowerShell script reliably via -EncodedCommand (UTF-16LE Base64).
 * Avoids Windows PowerShell 5.1 stdin buffering/quoting issues.
 */
function runPowerShellScript(script) {
  const fullScript = `$ProgressPreference = 'SilentlyContinue'\n${script}`;
  const encoded = Buffer.from(fullScript, "utf16le").toString("base64");
  return new Promise((resolve, reject) => {
    const child = spawn(
      "powershell",
      ["-NoProfile", "-NonInteractive", "-OutputFormat", "Text", "-ExecutionPolicy", "Bypass", "-EncodedCommand", encoded],
      { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] }
    );
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => { stdout += d.toString(); });
    child.stderr.on("data", (d) => { stderr += d.toString(); });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve(stdout.trim());
      } else {
        const cleanErr = stderr
          .replace(/^#< CLIXML\s*/i, "")
          .replace(/<[^>]+>/g, " ")
          .replace(/_x000D__x000A_/g, " ")
          .replace(/\s+/g, " ")
          .trim();
        reject(new Error(cleanErr || `PowerShell exited with code ${code}`));
      }
    });
  });
}

/**
 * Decodes SQLite TEXT/BLOB values (including Uint8Array from node:sqlite/sql.js) to string.
 */
function decodeSqliteValue(val) {
  if (val == null) return null;
  if (typeof val === "string") return val;
  if (val instanceof Uint8Array || Buffer.isBuffer(val)) {
    return Buffer.from(val).toString("utf8");
  }
  return String(val);
}

/**
 * Opens a SQLite database safely across runtimes:
 * bun:sqlite -> node:sqlite (>=22.5) -> better-sqlite3 (Node <24) -> sql.js (pure JS fallback).
 */
async function openSqliteDatabase(dbPath, readonly = false) {
  // 1. bun:sqlite
  if (process.versions.bun) {
    try {
      const { Database } = await import("bun:sqlite");
      const db = new Database(dbPath, { readonly });
      return {
        exec: (sql) => db.exec(sql),
        prepare: (sql) => ({
          get: (...params) => db.query(sql).get(...params),
          run: (...params) => db.query(sql).run(...params),
        }),
        close: () => db.close(),
      };
    } catch {
      // Fall through
    }
  }

  // 2. node:sqlite (built-in since Node 22.5.0; avoids Node 24 better-sqlite3 SIGSEGV)
  if (!process.versions.bun) {
    const [maj, min] = process.versions.node.split(".").map(Number);
    if (maj > 22 || (maj === 22 && min >= 5)) {
      try {
        const { DatabaseSync } = await import("node:sqlite");
        const db = new DatabaseSync(dbPath, { readOnly: readonly });
        if (!readonly) {
          try { db.exec("PRAGMA busy_timeout = 2500;"); } catch {}
        }
        return {
          exec: (sql) => db.exec(sql),
          prepare: (sql) => db.prepare(sql),
          close: () => db.close(),
        };
      } catch {
        // Fall through
      }
    }
  }

  // 3. better-sqlite3 (only on Node < 24 where native bindings don't SIGSEGV)
  const [nodeMajor] = process.versions.node.split(".").map(Number);
  if (!process.versions.bun && nodeMajor < 24) {
    try {
      const mod = await import("better-sqlite3");
      const Database = mod.default || mod;
      const db = readonly
        ? new Database(dbPath, { readonly: true, fileMustExist: true, timeout: 2500 })
        : new Database(dbPath, { timeout: 2500 });
      return {
        exec: (sql) => db.exec(sql),
        prepare: (sql) => db.prepare(sql),
        close: () => db.close(),
      };
    } catch {
      // Fall through
    }
  }

  // 4. sql.js (pure JS fallback — always bundled in packaged CLI mode)
  const sqlMod = await import("sql.js");
  const initSqlJs = sqlMod.default || sqlMod;
  const SQL = await initSqlJs();
  const initialBuffer = existsSync(dbPath) ? readFileSync(dbPath) : undefined;
  const db = new SQL.Database(initialBuffer);
  return {
    exec: (sql) => db.exec(sql),
    prepare: (sql) => ({
      get: (...params) => {
        const stmt = db.prepare(sql);
        try {
          stmt.bind(params);
          return stmt.step() ? stmt.getAsObject() : undefined;
        } finally {
          stmt.free();
        }
      },
      run: (...params) => {
        db.run(sql, params);
      },
    }),
    close: () => {
      try {
        if (!readonly) {
          writeFileSync(dbPath, Buffer.from(db.export()));
        }
      } finally {
        db.close();
      }
    },
  };
}

/**
 * Writes Antigravity OAuth payload to the OS Keyring / Windows Credential Manager.
 * Matches Antigravity-Manager's write_to_system_keyring in integration.rs.
 */
export async function writeSystemKeyring({ accessToken, refreshToken, email, idToken, expiryTimestamp }) {
  const expirySecs = expiryTimestamp && expiryTimestamp > 10_000_000_000
    ? Math.floor(expiryTimestamp / 1000)
    : expiryTimestamp || Math.floor((Date.now() + 3600 * 1000) / 1000);
  const expiryDate = new Date(expirySecs * 1000);
  const expiryStr = expiryDate.toISOString().replace("Z", "000Z");

  const payload = {
    token: {
      access_token: accessToken || "",
      token_type: "Bearer",
      refresh_token: refreshToken,
      expiry: expiryStr,
      expires_in: 3599,
    },
    auth_method: "consumer",
    ...(email ? { id_token_email: email } : {}),
    ...(idToken ? { id_token: idToken } : {}),
  };

  const payloadJson = JSON.stringify(payload);
  const currentPlatform = getOsPlatform();

  if (currentPlatform === "win32") {
    const b64 = Buffer.from(payloadJson, "utf8").toString("base64");
    const psScript = [
      '$code = @"',
      'using System;',
      'using System.Diagnostics;',
      'using System.Runtime.InteropServices;',
      'using System.Text;',
      'public class WinCredWriter {',
      '  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]',
      '  public struct FILETIME { public uint dwLowDateTime; public uint dwHighDateTime; }',
      '  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]',
      '  public struct CREDENTIAL {',
      '    public uint Flags; public uint Type; public string TargetName; public string Comment;',
      '    public FILETIME LastWritten; public uint CredentialBlobSize; public IntPtr CredentialBlob;',
      '    public uint Persist; public uint AttributeCount; public IntPtr Attributes; public string TargetAlias; public string UserName;',
      '  }',
      '  [DllImport("advapi32.dll", EntryPoint = "CredWriteW", CharSet = CharSet.Unicode, SetLastError = true)]',
      '  public static extern bool CredWrite([In] ref CREDENTIAL credential, uint flags);',
      '  [DllImport("kernel32.dll", SetLastError = true)]',
      '  public static extern IntPtr OpenProcess(uint access, bool inherit, int pid);',
      '  [DllImport("kernel32.dll", SetLastError = true)]',
      '  public static extern bool CloseHandle(IntPtr h);',
      '  [DllImport("advapi32.dll", SetLastError = true)]',
      '  public static extern bool OpenProcessToken(IntPtr proc, uint access, out IntPtr token);',
      '  [DllImport("advapi32.dll", SetLastError = true)]',
      '  public static extern bool DuplicateToken(IntPtr existing, int impLevel, out IntPtr dup);',
      '  [DllImport("advapi32.dll", SetLastError = true)]',
      '  public static extern bool ImpersonateLoggedOnUser(IntPtr token);',
      '  [DllImport("advapi32.dll", SetLastError = true)]',
      '  public static extern bool RevertToSelf();',
      '  public static int LastError = 0;',
      '  public static bool Write(string target, string userName, string secret) {',
      '    byte[] secretBytes = Encoding.UTF8.GetBytes(secret);',
      '    IntPtr blobPtr = Marshal.AllocHGlobal(secretBytes.Length);',
      '    try {',
      '      Marshal.Copy(secretBytes, 0, blobPtr, secretBytes.Length);',
      '      CREDENTIAL cred = new CREDENTIAL();',
      '      cred.Flags = 0; cred.Type = 1; cred.TargetName = target; cred.UserName = userName;',
      '      cred.CredentialBlob = blobPtr; cred.CredentialBlobSize = (uint)secretBytes.Length; cred.Persist = 2;',
      '      if (CredWrite(ref cred, 0)) { LastError = 0; return true; }',
      '      LastError = Marshal.GetLastWin32Error();',
      '      if (LastError == 1312) {',
      '        int sid = Process.GetCurrentProcess().SessionId;',
      '        foreach (Process p in Process.GetProcessesByName("explorer")) {',
      '          if (sid != 0 && p.SessionId != sid) continue;',
      '          IntPtr hProc = OpenProcess(0x1000, false, p.Id);',
      '          if (hProc == IntPtr.Zero) continue;',
      '          IntPtr hTok = IntPtr.Zero; IntPtr hDup = IntPtr.Zero;',
      '          try {',
      '            if (OpenProcessToken(hProc, 0x000A, out hTok) && DuplicateToken(hTok, 2, out hDup)) {',
      '              if (ImpersonateLoggedOnUser(hDup)) {',
      '                try {',
      '                  if (CredWrite(ref cred, 0)) { LastError = 0; return true; }',
      '                  LastError = Marshal.GetLastWin32Error();',
      '                } finally { RevertToSelf(); }',
      '              }',
      '            }',
      '          } finally {',
      '            if (hDup != IntPtr.Zero) CloseHandle(hDup);',
      '            if (hTok != IntPtr.Zero) CloseHandle(hTok);',
      '            CloseHandle(hProc);',
      '          }',
      '        }',
      '      }',
      '      return false;',
      '    } finally { Marshal.FreeHGlobal(blobPtr); }',
      '  }',
      '}',
      '"@',
      'Add-Type -TypeDefinition $code -Language CSharp',
      `$secret = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String("${b64}"))`,
      `$ok = [WinCredWriter]::Write("${KEYRING_TARGET}", "${KEYRING_USER}", $secret)`,
      'if ($ok) { Write-Output "OK" } else { throw "CredWrite failed: $([WinCredWriter]::LastError)" }',
    ].join("\n");

    try {
      const stdout = await runPowerShellScript(psScript);
      if (!stdout.includes("OK")) {
        throw new Error(`PowerShell CredWrite unexpected output: ${stdout}`);
      }
    } catch (err) {
      if (String(err.message || "").includes("1312")) {
        throw new Error(
          "Không thể ghi Windows Credential Manager (lỗi 1312: ERROR_NO_SUCH_LOGON_SESSION). Tiến trình 9Router đang chạy trong phiên nền không có phiên đăng nhập Windows tương tác. Vui lòng tắt 9Router hiện tại và mở lại bằng lệnh `9router` trong CMD/PowerShell."
        );
      }
      throw err;
    }
    return true;
  }

  if (currentPlatform === "darwin") {
    const b64 = Buffer.from(payloadJson, "utf8").toString("base64");
    const fullVal = `go-keyring-base64:${b64}`;
    await execFileAsync("security", ["delete-generic-password", "-s", "gemini", "-a", KEYRING_USER]).catch(() => {});
    await execFileAsync("security", ["add-generic-password", "-s", "gemini", "-a", KEYRING_USER, "-w", fullVal, "-A"]);
    return true;
  }

  if (currentPlatform === "linux") {
    await new Promise((resolve, reject) => {
      const child = spawn("secret-tool", ["store", "--label=Antigravity", "service", "gemini", "username", KEYRING_USER], {
        stdio: ["pipe", "pipe", "pipe"],
      });
      let stderr = "";
      child.stderr.on("data", (d) => { stderr += d.toString(); });
      child.on("error", reject);
      child.on("close", (code) => {
        if (code === 0) resolve(true);
        else reject(new Error(stderr.trim() || `secret-tool exited with code ${code}`));
      });
      child.stdin.write(payloadJson);
      child.stdin.end();
    });
    return true;
  }

  return false;
}

/**
 * Reads Antigravity OAuth payload from the OS Keyring / Windows Credential Manager.
 * Returns { email, refreshToken, accessToken } or null if unavailable.
 */
export async function readSystemKeyring() {
  const currentPlatform = getOsPlatform();
  let rawJson = null;

  try {
    if (currentPlatform === "win32") {
      const psScript = [
        '$code = @"',
        'using System;',
        'using System.Diagnostics;',
        'using System.Runtime.InteropServices;',
        'using System.Text;',
        'public class WinCredReader {',
        '  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]',
        '  public struct FILETIME { public uint dwLowDateTime; public uint dwHighDateTime; }',
        '  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]',
        '  public struct CREDENTIAL {',
        '    public uint Flags; public uint Type; public string TargetName; public string Comment;',
        '    public FILETIME LastWritten; public uint CredentialBlobSize; public IntPtr CredentialBlob;',
        '    public uint Persist; public uint AttributeCount; public IntPtr Attributes; public string TargetAlias; public string UserName;',
        '  }',
        '  [DllImport("advapi32.dll", EntryPoint = "CredReadW", CharSet = CharSet.Unicode, SetLastError = true)]',
        '  public static extern bool CredRead(string target, uint type, uint reservedFlag, out IntPtr credentialPtr);',
        '  [DllImport("advapi32.dll", EntryPoint = "CredFree", SetLastError = true)]',
        '  public static extern void CredFree(IntPtr credentialPtr);',
        '  [DllImport("kernel32.dll", SetLastError = true)]',
        '  public static extern IntPtr OpenProcess(uint access, bool inherit, int pid);',
        '  [DllImport("kernel32.dll", SetLastError = true)]',
        '  public static extern bool CloseHandle(IntPtr h);',
        '  [DllImport("advapi32.dll", SetLastError = true)]',
        '  public static extern bool OpenProcessToken(IntPtr proc, uint access, out IntPtr token);',
        '  [DllImport("advapi32.dll", SetLastError = true)]',
        '  public static extern bool DuplicateToken(IntPtr existing, int impLevel, out IntPtr dup);',
        '  [DllImport("advapi32.dll", SetLastError = true)]',
        '  public static extern bool ImpersonateLoggedOnUser(IntPtr token);',
        '  [DllImport("advapi32.dll", SetLastError = true)]',
        '  public static extern bool RevertToSelf();',
        '  private static string ReadPtr(IntPtr credPtr) {',
        '    try {',
        '      CREDENTIAL cred = (CREDENTIAL)Marshal.PtrToStructure(credPtr, typeof(CREDENTIAL));',
        '      byte[] bytes = new byte[cred.CredentialBlobSize];',
        '      Marshal.Copy(cred.CredentialBlob, bytes, 0, (int)cred.CredentialBlobSize);',
        '      return Encoding.UTF8.GetString(bytes);',
        '    } finally { CredFree(credPtr); }',
        '  }',
        '  public static string Read(string target) {',
        '    IntPtr credPtr;',
        '    if (CredRead(target, 1, 0, out credPtr)) return ReadPtr(credPtr);',
        '    if (Marshal.GetLastWin32Error() == 1312) {',
        '      int sid = Process.GetCurrentProcess().SessionId;',
        '      foreach (Process p in Process.GetProcessesByName("explorer")) {',
        '        if (sid != 0 && p.SessionId != sid) continue;',
        '        IntPtr hProc = OpenProcess(0x1000, false, p.Id);',
        '        if (hProc == IntPtr.Zero) continue;',
        '        IntPtr hTok = IntPtr.Zero; IntPtr hDup = IntPtr.Zero;',
        '        try {',
        '          if (OpenProcessToken(hProc, 0x000A, out hTok) && DuplicateToken(hTok, 2, out hDup)) {',
        '            if (ImpersonateLoggedOnUser(hDup)) {',
        '              try {',
        '                if (CredRead(target, 1, 0, out credPtr)) return ReadPtr(credPtr);',
        '              } finally { RevertToSelf(); }',
        '            }',
        '          }',
        '        } finally {',
        '          if (hDup != IntPtr.Zero) CloseHandle(hDup);',
        '          if (hTok != IntPtr.Zero) CloseHandle(hTok);',
        '          CloseHandle(hProc);',
        '        }',
        '      }',
        '    }',
        '    return "";',
        '  }',
        '}',
        '"@',
        'Add-Type -TypeDefinition $code -Language CSharp',
        `Write-Output ([WinCredReader]::Read("${KEYRING_TARGET}"))`,
      ].join("\n");

      rawJson = (await runPowerShellScript(psScript)) || null;
    } else if (currentPlatform === "darwin") {
      const { stdout } = await execFileAsync("security", ["find-generic-password", "-s", "gemini", "-a", KEYRING_USER, "-w"]);
      const trimmed = stdout.trim();
      if (trimmed.startsWith("go-keyring-base64:")) {
        rawJson = Buffer.from(trimmed.slice("go-keyring-base64:".length), "base64").toString("utf8");
      } else {
        rawJson = trimmed;
      }
    } else if (currentPlatform === "linux") {
      const { stdout } = await execFileAsync("secret-tool", ["lookup", "service", "gemini", "username", KEYRING_USER]);
      rawJson = stdout.trim();
    }
  } catch {
    return null;
  }

  if (!rawJson) return null;
  try {
    const parsed = JSON.parse(rawJson);
    const refreshToken = parsed?.token?.refresh_token || parsed?.refresh_token || null;
    const accessToken = parsed?.token?.access_token || parsed?.access_token || null;
    const email = parsed?.id_token_email || parsed?.email || null;
    if (!refreshToken && !email) return null;
    return { refreshToken, accessToken, email };
  } catch {
    return null;
  }
}

/**
 * Queries running Antigravity and language_server processes on Windows.
 */
async function listWinAntigravityProcesses() {
  if (getOsPlatform() !== "win32") return [];
  const psScript = [
    "$procs = Get-CimInstance Win32_Process -Filter \"Name LIKE '%antigravity%' OR Name LIKE '%language_server%' OR Name LIKE '%agy%'\" |",
    "  Select-Object ProcessId, ParentProcessId, Name, ExecutablePath, CommandLine",
    "if ($procs) { $procs | ConvertTo-Json -Compress } else { '[]' }",
  ].join("\n");

  try {
    const stdout = await runPowerShellScript(psScript);
    if (!stdout) return [];
    const parsed = JSON.parse(stdout);
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    return [];
  }
}

function isIdeProcess(proc) {
  const name = (proc.Name || "").toLowerCase();
  const exe = (proc.ExecutablePath || "").toLowerCase();
  const cmd = (proc.CommandLine || "").toLowerCase();
  if (exe.includes("antigravity-tools") || exe.includes("antigravity-manager") || name.includes("9router")) {
    return false;
  }
  return (
    exe.includes("antigravity ide") ||
    exe.includes("antigravity-ide") ||
    exe.includes("antigravity_ide") ||
    name.includes("antigravity ide") ||
    cmd.includes("--user-data-dir") && cmd.includes("antigravity ide")
  );
}

function isClassicProcess(proc) {
  const name = (proc.Name || "").toLowerCase();
  const exe = (proc.ExecutablePath || "").toLowerCase();
  if (exe.includes("antigravity-tools") || exe.includes("antigravity-manager") || name.includes("9router")) {
    return false;
  }
  if (isIdeProcess(proc)) return false;
  return exe.includes("\\antigravity\\") || name === "antigravity.exe" || name === "antigravity";
}

function isLanguageServerProc(proc) {
  const name = (proc.Name || "").toLowerCase();
  const exe = (proc.ExecutablePath || "").toLowerCase();
  return name.includes("language_server") || exe.includes("language_server");
}

function findDescendantLanguageServerPids(procs, rootPids) {
  const rootSet = new Set(rootPids);
  const visited = new Set(rootPids);
  const frontier = [...rootPids];
  const descendants = [];

  while (frontier.length > 0) {
    const parentId = frontier.pop();
    for (const p of procs) {
      if (p.ParentProcessId === parentId && !visited.has(p.ProcessId)) {
        visited.add(p.ProcessId);
        frontier.push(p.ProcessId);
        descendants.push(p);
      }
    }
  }

  return descendants
    .filter((p) => isLanguageServerProc(p))
    .map((p) => p.ProcessId);
}

async function killPidsWindows(pids) {
  for (const rawPid of pids) {
    const pid = Number(rawPid);
    if (!Number.isInteger(pid) || pid <= 0) continue;
    try {
      await execFileAsync("taskkill", ["/F", "/T", "/PID", String(pid)], { windowsHide: true });
    } catch {
      // Process may already have exited
    }
  }
}

function findExecutablePath(targetKind) {
  const home = homedir();
  const currentPlatform = getOsPlatform();
  if (currentPlatform === "win32") {
    const localAppData = process.env.LOCALAPPDATA || join(home, "AppData", "Local");
    const candidates = targetKind === "ide"
      ? [
          join(localAppData, "Programs", "Antigravity IDE", "Antigravity IDE.exe"),
          join("C:\\Program Files", "Antigravity IDE", "Antigravity IDE.exe"),
        ]
      : [
          join(localAppData, "Programs", "antigravity", "Antigravity.exe"),
          join(localAppData, "Programs", "Antigravity", "Antigravity.exe"),
          join("C:\\Program Files", "Antigravity", "Antigravity.exe"),
        ];
    return candidates.find((p) => existsSync(p)) || null;
  }
  if (currentPlatform === "darwin") {
    const candidates = targetKind === "ide"
      ? ["/Applications/Antigravity IDE.app", join(home, "Applications/Antigravity IDE.app")]
      : ["/Applications/Antigravity.app", join(home, "Applications/Antigravity.app")];
    return candidates.find((p) => existsSync(p)) || null;
  }
  return null;
}

function launchExecutableDetached(exePath) {
  if (!exePath || !existsSync(exePath)) return false;
  try {
    if (getOsPlatform() === "darwin" && exePath.endsWith(".app")) {
      const child = spawn("open", [exePath], { detached: true, stdio: "ignore" });
      child.unref();
      return true;
    }
    const child = spawn(exePath, [], { detached: true, stdio: "ignore", windowsHide: false });
    child.unref();
    return true;
  } catch {
    return false;
  }
}

/**
 * Injects OAuth credentials into an Antigravity SQLite state.vscdb file.
 */
async function injectCredentialsIntoStateDb(dbPath, { accessToken, refreshToken, email, idToken, projectId, isGcpTos, serviceMachineId }) {
  const dbDir = dirname(dbPath);
  if (!existsSync(dbDir)) {
    mkdirSync(dbDir, { recursive: true });
  }
  if (existsSync(dbPath)) {
    try {
      copyFileSync(dbPath, `${dbPath}.backup`);
    } catch {
      // Best-effort backup
    }
  }

  let db;
  try {
    db = await openSqliteDatabase(dbPath, false);
    db.exec(`CREATE TABLE IF NOT EXISTS ItemTable (key TEXT UNIQUE ON CONFLICT REPLACE, value BLOB);`);

    let resolvedMachineId = serviceMachineId;
    if (!resolvedMachineId) {
      try {
        const existingRow = db.prepare("SELECT value FROM ItemTable WHERE key = ?").get("storage.serviceMachineId");
        resolvedMachineId = decodeSqliteValue(existingRow?.value) || crypto.randomUUID();
      } catch {
        resolvedMachineId = crypto.randomUUID();
      }
    }

    const upsertStmt = db.prepare("INSERT OR REPLACE INTO ItemTable (key, value) VALUES (?, ?)");
    upsertStmt.run("storage.serviceMachineId", String(resolvedMachineId));
    upsertStmt.run("telemetry.serviceMachineId", String(resolvedMachineId));

    const oauthPayload = buildOauthTokenPayload({
      refreshToken,
      accessToken,
      projectId: projectId || "",
      isGcpTos: Boolean(isGcpTos),
      idToken,
      email,
    });
    upsertStmt.run("antigravityUnifiedStateSync.oauthToken", oauthPayload);

    const userStatusPayload = buildUserStatusPayload(email);
    if (userStatusPayload) {
      upsertStmt.run("antigravityUnifiedStateSync.userStatus", userStatusPayload);
    }
    upsertStmt.run("antigravityOnboarding", "true");

    if (projectId) {
      const entPayload = buildEnterprisePreferencesPayload(projectId);
      if (entPayload) {
        upsertStmt.run("antigravityUnifiedStateSync.enterprisePreferences", entPayload);
      }
    } else {
      try {
        db.prepare("DELETE FROM ItemTable WHERE key = ?").run("antigravityUnifiedStateSync.enterprisePreferences");
      } catch {}
    }

    try {
      db.prepare("DELETE FROM ItemTable WHERE key = ?").run("jetskiStateSync.agentManagerInitState");
    } catch {}

    return true;
  } catch (e) {
    console.warn(`[switchAccount] Failed injecting into ${dbPath}: ${e.message}`);
    return false;
  } finally {
    if (db) {
      try {
        await db.close();
      } catch {}
    }
  }
}

/**
 * Syncs serviceMachineId / telemetry profile into storage.json if present.
 */
function syncStorageJsonProfile(storageJsonPath, profile = {}) {
  if (!existsSync(storageJsonPath) || !profile) return;
  const serviceMachineId = profile.serviceMachineId || profile.macMachineId;
  if (!serviceMachineId && !profile.machineId) return;
  try {
    const raw = JSON.parse(readFileSync(storageJsonPath, "utf8"));
    let updated = false;
    if (serviceMachineId && raw["storage.serviceMachineId"] !== serviceMachineId) {
      raw["storage.serviceMachineId"] = serviceMachineId;
      updated = true;
    }
    if (profile.machineId) {
      raw["telemetry.machineId"] = profile.machineId;
      updated = true;
    }
    if (profile.macMachineId) {
      raw["telemetry.macMachineId"] = profile.macMachineId;
      updated = true;
    }
    if (profile.devDeviceId) {
      raw["telemetry.devDeviceId"] = profile.devDeviceId;
      updated = true;
    }
    if (profile.sqmId) {
      raw["telemetry.sqmId"] = profile.sqmId;
      updated = true;
    }
    if (updated) {
      writeFileSync(storageJsonPath, JSON.stringify(raw, null, 4), "utf8");
    }
  } catch {
    // Non-fatal
  }
}

/**
 * Detects which stored Antigravity connection is currently active in:
 * - Antigravity 2.0 (classic / Keyring gemini:antigravity)
 * - Antigravity IDE (Antigravity IDE/.../state.vscdb)
 * - Antigravity CLI (agy: ~/.gemini/antigravity-cli/antigravity-oauth-token or Keyring)
 */
export async function detectActiveClientsStatus(connections = []) {
  const status = {
    classicConnectionId: null,
    classicEmail: null,
    ideConnectionId: null,
    ideEmail: null,
    agyConnectionId: null,
    agyEmail: null,
  };

  const findMatch = (refreshToken, email) => {
    if (refreshToken) {
      const byToken = connections.find((c) => c.refreshToken === refreshToken);
      if (byToken) return byToken;
    }
    if (email) {
      const lowerEmail = email.toLowerCase().trim();
      const byEmail = connections.find((c) => (c.email || c.name || "").toLowerCase().trim() === lowerEmail);
      if (byEmail) return byEmail;
    }
    return null;
  };

  // 1. Detect Antigravity 2.0 (System Keyring)
  const keyring = await readSystemKeyring();
  if (keyring) {
    const match = findMatch(keyring.refreshToken, keyring.email);
    status.classicConnectionId = match?.id || null;
    status.classicEmail = match?.email || keyring.email || null;
  }

  // 2. Detect Antigravity IDE (IDE state.vscdb)
  const ideDbPaths = getCandidateDbPaths().filter((p) => p.toLowerCase().includes("ide") && existsSync(p));
  for (const dbPath of ideDbPaths) {
    let tempPath = null;
    let db = null;
    try {
      let row;
      try {
        db = await openSqliteDatabase(dbPath, true);
        row = db.prepare("SELECT value FROM ItemTable WHERE key = ?").get("antigravityUnifiedStateSync.oauthToken");
      } catch {
        if (db) {
          try { await db.close(); } catch {}
          db = null;
        }
        tempPath = join(tmpdir(), `9router_ag_ide_${Date.now()}_${crypto.randomBytes(4).toString("hex")}.vscdb`);
        copyFileSync(dbPath, tempPath);
        db = await openSqliteDatabase(tempPath, true);
        row = db.prepare("SELECT value FROM ItemTable WHERE key = ?").get("antigravityUnifiedStateSync.oauthToken");
      }

      const rawVal = decodeSqliteValue(row?.value);
      if (rawVal) {
        const decoded = decodeOauthToken(rawVal);
        if (decoded?.refreshToken) {
          const match = findMatch(decoded.refreshToken, null);
          status.ideConnectionId = match?.id || null;
          status.ideEmail = match?.email || null;
          break;
        }
      }
    } catch {
      // Ignore locked/missing
    } finally {
      if (db) {
        try { await db.close(); } catch {}
      }
      if (tempPath && existsSync(tempPath)) {
        try { unlinkSync(tempPath); } catch {}
      }
    }
  }

  // 3. Detect Antigravity CLI (agy token file or Keyring fallback)
  const cliTokenPath = join(homedir(), ".gemini", "antigravity-cli", "antigravity-oauth-token");
  if (existsSync(cliTokenPath)) {
    try {
      const parsed = JSON.parse(readFileSync(cliTokenPath, "utf8"));
      const rt = parsed?.token?.refresh_token || parsed?.refresh_token || null;
      const em = parsed?.id_token_email || parsed?.email || null;
      const match = findMatch(rt, em);
      status.agyConnectionId = match?.id || null;
      status.agyEmail = match?.email || em || null;
    } catch {
      // Ignore
    }
  } else if (keyring) {
    status.agyConnectionId = status.classicConnectionId;
    status.agyEmail = status.classicEmail;
  }

  return status;
}

/**
 * Writes an official Antigravity OAuth token file.
 * Matches Antigravity-Manager's AgyOAuthTokenFile format.
 */
export function writeAgyTokenFile(targetPath, { accessToken, refreshToken, email, idToken }) {
  const dir = dirname(targetPath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const payload = {
    token: {
      access_token: accessToken || "",
      token_type: "Bearer",
      refresh_token: refreshToken,
      expiry: new Date(Date.now() + 3600 * 1000).toISOString(),
      expires_in: 3599,
    },
    auth_method: "consumer",
    id_token_email: email || undefined,
    id_token: idToken || undefined,
  };
  writeFileSync(targetPath, JSON.stringify(payload, null, 2), "utf8");
}

/**
 * Writes synchronized Gemini CLI and Google accounts files.
 * Matches Antigravity-Manager's integration.rs implementation.
 */
export function writeGeminiCredsFiles(home, { accessToken, refreshToken, email, idToken }) {
  const geminiDir = join(home, ".gemini");
  if (!existsSync(geminiDir)) mkdirSync(geminiDir, { recursive: true });

  const credsPath = join(geminiDir, "oauth_creds.json");
  const credsPayload = {
    access_token: accessToken || "",
    refresh_token: refreshToken,
    token_type: "Bearer",
    expiry_date: Date.now() + 3600 * 1000,
    id_token: idToken || undefined,
    scope: "https://www.googleapis.com/auth/userinfo.email openid https://www.googleapis.com/auth/cloud-platform https://www.googleapis.com/auth/userinfo.profile",
  };
  writeFileSync(credsPath, JSON.stringify(credsPayload, null, 2), "utf8");

  const accountsPath = join(geminiDir, "google_accounts.json");
  const accountsPayload = {
    active: email || "",
    old: [],
  };
  writeFileSync(accountsPath, JSON.stringify(accountsPayload, null, 2), "utf8");
}

let switchAccountMutex = Promise.resolve();

/**
 * 6. switchAccount(connection, target)
 * - for '2.0' / 'classic': writes System Keyring (gemini:antigravity) + fallback files + hot-reloads language_server
 * - for 'ide': stops Antigravity IDE if running, injects state.vscdb + Keyring + fallback files, relaunches IDE
 * - for 'agy' / 'cli': writes System Keyring + ~/.gemini/antigravity-cli/antigravity-oauth-token + Gemini CLI creds
 *
 * @param {object} connection
 * @param {"2.0" | "classic" | "ide" | "agy" | "cli" | "all"} [target="2.0"]
 * @returns {Promise<object>}
 */
export function switchAccount(connection, target = "2.0") {
  const run = switchAccountMutex.then(() => switchAccountInternal(connection, target));
  switchAccountMutex = run.catch(() => {});
  return run;
}

async function switchAccountInternal(connection, target = "2.0") {
  if (!connection) {
    throw new Error("Connection is required to switch account");
  }

  const refreshToken = connection.refreshToken;
  if (!refreshToken) {
    throw new Error("Connection does not contain a refresh token");
  }

  // Best effort: refresh access token if missing or close to expiry
  let accessToken = connection.accessToken || "";
  try {
    const refreshed = await exchangeRefreshToken(refreshToken);
    if (refreshed?.access_token) {
      accessToken = refreshed.access_token;
    }
  } catch (err) {
    console.warn(`[switchAccount] Token refresh warning: ${err.message}`);
  }

  const home = homedir();
  const rawTarget = (target || "2.0").toLowerCase();
  const safeTarget = rawTarget === "cli" ? "agy" : rawTarget === "classic" ? "2.0" : rawTarget;
  const email = connection.email || connection.name || "";
  const idToken = connection.idToken || "";
  const appData = process.env.APPDATA || join(home, "AppData", "Roaming");

  let targetDbPath = "";
  let cliTokenPath = "";
  let classicTokenPath = "";
  let hotSwitched = false;
  let restarted = false;

  const runningProcs = getOsPlatform() === "win32" ? await listWinAntigravityProcesses() : [];

  // Target 1: 'ide' -> Close IDE if running -> Inject state.vscdb + Keyring + Fallbacks -> Relaunch IDE if was running
  if (safeTarget === "ide" || safeTarget === "all") {
    const ideProcs = runningProcs.filter(isIdeProcess);
    const ideWasRunning = ideProcs.length > 0;
    const ideExeFromProc = ideProcs.find((p) => p.ExecutablePath && !isLanguageServerProc(p))?.ExecutablePath || null;

    if (ideWasRunning && getOsPlatform() === "win32") {
      await killPidsWindows(ideProcs.map((p) => p.ProcessId));
      await new Promise((r) => setTimeout(r, 400));
    }

    const candidatePaths = getCandidateDbPaths().filter((p) => p.toLowerCase().includes("ide"));
    const existingPaths = candidatePaths.filter((p) => existsSync(p));
    const pathsToUpdate = existingPaths.length > 0 ? existingPaths : candidatePaths.slice(0, 1);

    for (const dbPath of pathsToUpdate) {
      const ok = await injectCredentialsIntoStateDb(dbPath, {
        accessToken,
        refreshToken,
        email,
        idToken,
        projectId: connection.projectId || "",
        isGcpTos: Boolean(connection.providerSpecificData?.isGcpTos),
        serviceMachineId: connection.providerSpecificData?.serviceMachineId,
      });
      if (ok && !targetDbPath) {
        targetDbPath = dbPath;
      }
    }

    if (!targetDbPath && safeTarget === "ide") {
      throw new Error("Failed to inject credentials into Antigravity IDE state.vscdb");
    }

    syncStorageJsonProfile(
      join(appData, "Antigravity IDE", "User", "globalStorage", "storage.json"),
      connection.providerSpecificData
    );

    try {
      await writeSystemKeyring({ accessToken, refreshToken, email, idToken });
    } catch (err) {
      console.warn(`[switchAccount] Keyring write warning for IDE: ${err.message}`);
    }

    const geminiDir = join(home, ".gemini");
    classicTokenPath = join(geminiDir, "jetski-standalone-oauth-token");
    writeAgyTokenFile(classicTokenPath, { accessToken, refreshToken, email, idToken });
    writeGeminiCredsFiles(home, { accessToken, refreshToken, email, idToken });

    if (ideWasRunning) {
      const exeToStart = ideExeFromProc || findExecutablePath("ide");
      if (launchExecutableDetached(exeToStart)) {
        restarted = true;
      }
    }

    if (safeTarget === "ide") {
      return {
        success: true,
        target: "ide",
        path: targetDbPath,
        restarted,
        email,
      };
    }
  }

  // Target 2: 'agy' (CLI) -> System Keyring + ~/.gemini/antigravity-cli/antigravity-oauth-token + Gemini CLI creds
  if (safeTarget === "agy" || safeTarget === "all") {
    await writeSystemKeyring({ accessToken, refreshToken, email, idToken });

    const cliDir = join(home, ".gemini", "antigravity-cli");
    cliTokenPath = join(cliDir, "antigravity-oauth-token");
    writeAgyTokenFile(cliTokenPath, { accessToken, refreshToken, email, idToken });
    writeGeminiCredsFiles(home, { accessToken, refreshToken, email, idToken });

    // Verify readback from Keyring matches refreshToken
    if (getOsPlatform() === "win32") {
      const verified = await readSystemKeyring();
      if (!verified || verified.refreshToken !== refreshToken) {
        throw new Error("Keyring credential readback verification failed for CLI");
      }
    }

    if (safeTarget === "agy") {
      return {
        success: true,
        target: "agy",
        path: cliTokenPath,
        email,
      };
    }
  }

  // Target 3: '2.0' / 'classic' -> System Keyring (gemini:antigravity) + fallback files + Hot-Switch language_server
  if (safeTarget === "2.0" || safeTarget === "all") {
    await writeSystemKeyring({ accessToken, refreshToken, email, idToken });

    syncStorageJsonProfile(
      join(appData, "Antigravity", "User", "globalStorage", "storage.json"),
      connection.providerSpecificData
    );

    // If legacy Antigravity (< 2.0) SQLite exists, keep it in sync too
    const legacyClassicDb = join(appData, "Antigravity", "User", "globalStorage", "state.vscdb");
    if (existsSync(legacyClassicDb)) {
      await injectCredentialsIntoStateDb(legacyClassicDb, {
        accessToken,
        refreshToken,
        email,
        idToken,
        projectId: connection.projectId || "",
        isGcpTos: Boolean(connection.providerSpecificData?.isGcpTos),
        serviceMachineId: connection.providerSpecificData?.serviceMachineId,
      });
    }

    const geminiDir = join(home, ".gemini");
    classicTokenPath = join(geminiDir, "jetski-standalone-oauth-token");
    writeAgyTokenFile(classicTokenPath, { accessToken, refreshToken, email, idToken });
    writeGeminiCredsFiles(home, { accessToken, refreshToken, email, idToken });

    if (getOsPlatform() === "win32") {
      const classicRoots = runningProcs.filter((p) => isClassicProcess(p) && !isLanguageServerProc(p));
      if (classicRoots.length > 0) {
        const lsPids = findDescendantLanguageServerPids(
          runningProcs,
          classicRoots.map((p) => p.ProcessId)
        );
        if (lsPids.length > 0) {
          // Hot-Switch: kill language_server subprocesses so supervisor respawns with new Keyring credentials
          await killPidsWindows(lsPids);
          await new Promise((r) => setTimeout(r, 150));
          // Re-assert Keyring once after kill to avoid race where dying language_server flushed stale token
          await writeSystemKeyring({ accessToken, refreshToken, email, idToken }).catch(() => {});
          hotSwitched = true;
        } else {
          // No language_server subprocess found -> full restart of Antigravity 2.0
          const exeToStart = classicRoots.find((p) => p.ExecutablePath)?.ExecutablePath || findExecutablePath("classic");
          await killPidsWindows(classicRoots.map((p) => p.ProcessId));
          await new Promise((r) => setTimeout(r, 300));
          await writeSystemKeyring({ accessToken, refreshToken, email, idToken }).catch(() => {});
          if (launchExecutableDetached(exeToStart)) {
            restarted = true;
          }
        }
      }
    }

    if (safeTarget === "all") {
      return {
        success: true,
        target: "all",
        hotSwitched,
        restarted,
        paths: {
          ide: targetDbPath,
          cli: cliTokenPath,
          classic: classicTokenPath,
        },
        email,
      };
    }

    return {
      success: true,
      target: "2.0",
      path: `${KEYRING_TARGET} (${classicTokenPath})`,
      hotSwitched,
      restarted,
      email,
    };
  }

  throw new Error(`Unsupported switch target: ${target}`);
}
