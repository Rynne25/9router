import { platform as getOsPlatform, arch as getOsArch } from "os";

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

/**
 * Encodes a BigInt or number as a Protobuf varint Buffer.
 */
export function encodeVarint(val) {
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
export function encodeTag(fieldNumber, wireType) {
  return encodeVarint((fieldNumber << 3) | wireType);
}

/**
 * Encodes a length-delimited Protobuf field.
 */
export function encodeLengthDelimited(fieldNumber, data) {
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
