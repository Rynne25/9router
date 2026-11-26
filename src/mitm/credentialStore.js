const crypto = require("crypto");
const { isAdmin } = require("./winElevated.js");
const { isSudoPasswordRequired } = require("./dns/dnsConfig");
const { err } = require("./logger");

const IS_WIN = process.platform === "win32";
const ENCRYPT_ALGO = "aes-256-gcm";
const ENCRYPT_SALT = "9router-mitm-pwd";

let _getSettings = null;
let _updateSettings = null;

function getCachedPassword() {
  return globalThis.__mitmSudoPassword || null;
}

function setCachedPassword(pwd) {
  globalThis.__mitmSudoPassword = pwd;
}

function deriveKey() {
  try {
    const { machineIdSync } = require("node-machine-id");
    const raw = machineIdSync();
    return crypto.createHash("sha256").update(raw + ENCRYPT_SALT).digest();
  } catch {
    return crypto.createHash("sha256").update(ENCRYPT_SALT).digest();
  }
}

function encryptPassword(plaintext) {
  const key = deriveKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ENCRYPT_ALGO, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${tag.toString("hex")}:${encrypted.toString("hex")}`;
}

function decryptPassword(stored) {
  try {
    const [ivHex, tagHex, dataHex] = stored.split(":");
    if (!ivHex || !tagHex || !dataHex) return null;
    const key = deriveKey();
    const decipher = crypto.createDecipheriv(ENCRYPT_ALGO, key, Buffer.from(ivHex, "hex"));
    decipher.setAuthTag(Buffer.from(tagHex, "hex"));
    return decipher.update(Buffer.from(dataHex, "hex")) + decipher.final("utf8");
  } catch {
    return null;
  }
}

function initDbHooks(getSettingsFn, updateSettingsFn) {
  _getSettings = getSettingsFn;
  _updateSettings = updateSettingsFn;
}

function getSettingsHook() {
  return _getSettings;
}

function updateSettingsHook() {
  return _updateSettings;
}

async function saveMitmSettings(enabled, password) {
  if (!_updateSettings) return;
  try {
    const updates = { mitmEnabled: enabled };
    if (password) updates.mitmSudoEncrypted = encryptPassword(password);
    await _updateSettings(updates);
  } catch (e) {
    err(`Failed to save settings: ${e.message}`);
  }
}

async function clearEncryptedPassword() {
  if (!_updateSettings) return;
  try {
    await _updateSettings({ mitmSudoEncrypted: null });
  } catch (e) {
    err(`Failed to clear encrypted password: ${e.message}`);
  }
}

async function loadEncryptedPassword() {
  if (!_getSettings) return null;
  try {
    const settings = await _getSettings();
    if (!settings.mitmSudoEncrypted) return null;
    return decryptPassword(settings.mitmSudoEncrypted);
  } catch {
    return null;
  }
}

const fs = require("fs");
const path = require("path");
const { DATA_DIR } = require("./paths");

const TOOL_STATE_FILE = path.join(DATA_DIR, "mitm", "tool-state.json");

function syncToolStateFile(state) {
  try {
    const dir = path.dirname(TOOL_STATE_FILE);
    fs.mkdirSync(dir, { recursive: true });
    const tmp = `${TOOL_STATE_FILE}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(state || {}, null, 2), "utf8");
    fs.renameSync(tmp, TOOL_STATE_FILE);
  } catch { /* best effort */ }
}

async function saveDnsToolState(tool, enabled) {
  if (!_updateSettings || !_getSettings) return;
  try {
    const s = await _getSettings();
    const next = { ...(s.dnsToolEnabled || {}), [tool]: enabled };
    await _updateSettings({ dnsToolEnabled: next });
    syncToolStateFile(next);
  } catch (e) {
    err(`Failed to save DNS state: ${e.message}`);
  }
}

async function loadDnsToolState() {
  if (!_getSettings) return {};
  try {
    const s = await _getSettings();
    const state = s.dnsToolEnabled || {};
    syncToolStateFile(state);
    return state;
  } catch {
    return {};
  }
}

async function hasDnsPrivilege() {
  if (IS_WIN) return isAdmin();
  if (isAdmin()) return true;
  if (!isSudoPasswordRequired()) return true;
  const pwd = getCachedPassword() || await loadEncryptedPassword();
  return !!pwd;
}

module.exports = {
  getCachedPassword,
  setCachedPassword,
  deriveKey,
  encryptPassword,
  decryptPassword,
  initDbHooks,
  getSettingsHook,
  updateSettingsHook,
  saveMitmSettings,
  clearEncryptedPassword,
  loadEncryptedPassword,
  saveDnsToolState,
  loadDnsToolState,
  hasDnsPrivilege,
};
