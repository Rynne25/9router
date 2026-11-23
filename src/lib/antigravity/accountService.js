/**
 * Antigravity Account Service Facade
 *
 * Decomposed into specialized modules for maintainability:
 * - antigravityProtobuf.js: Binary protobuf encoding / decoding
 * - antigravityOAuth.js: Google OAuth token exchange, profile, tier detection
 * - antigravityWarmup.js: Model warmup and quota timer activation
 * - antigravityKeyring.js: OS-native credential storage (WinCred, Keychain, SecretService)
 * - antigravitySwitcher.js: Multi-target account switching & client detection
 */

export {
  getOAuthClientMetadata,
  buildOauthTokenPayload,
  buildUserStatusPayload,
  buildEnterprisePreferencesPayload,
} from "./antigravityProtobuf.js";

export {
  exchangeRefreshToken,
  getUserInfo,
  normalizeTier,
  hasArgonOrG1Pro,
  getAntigravityEffectiveTier,
  fetchProjectAndTier,
  checkErrorAndVerification,
} from "./antigravityOAuth.js";

export {
  warmupAccount,
} from "./antigravityWarmup.js";

export {
  writeSystemKeyring,
  readSystemKeyring,
} from "./antigravityKeyring.js";

export {
  detectActiveClientsStatus,
  writeAgyTokenFile,
  writeGeminiCredsFiles,
  switchAccount,
} from "./antigravitySwitcher.js";
