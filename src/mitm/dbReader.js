// CJS reader for MITM standalone process. Reads mitmAlias from JSON cache
// at $DATA_DIR/mitm/aliases.json (synced by app from SQLite on startup + writes).
// JSON-only: no SQLite native binding required in MITM bundle.
const fs = require("fs");
const path = require("path");
const { DATA_DIR } = require("./paths");

const CACHE_FILE = path.join(DATA_DIR, "mitm", "aliases.json");
const TOOL_STATE_FILE = path.join(DATA_DIR, "mitm", "tool-state.json");

let cachedData = null;
let cachedMtimeMs = 0;

let cachedToolState = null;
let cachedToolStateMtimeMs = 0;

function readCache() {
  try {
    if (!fs.existsSync(CACHE_FILE)) {
      cachedData = null;
      cachedMtimeMs = 0;
      return null;
    }
    const { mtimeMs } = fs.statSync(CACHE_FILE);
    if (cachedData !== null && mtimeMs === cachedMtimeMs) {
      return cachedData;
    }
    cachedData = JSON.parse(fs.readFileSync(CACHE_FILE, "utf-8"));
    cachedMtimeMs = mtimeMs;
    return cachedData;
  } catch {
    return null;
  }
}

function readToolState() {
  try {
    if (!fs.existsSync(TOOL_STATE_FILE)) {
      cachedToolState = null;
      cachedToolStateMtimeMs = 0;
      return {};
    }
    const { mtimeMs } = fs.statSync(TOOL_STATE_FILE);
    if (cachedToolState !== null && mtimeMs === cachedToolStateMtimeMs) {
      return cachedToolState;
    }
    cachedToolState = JSON.parse(fs.readFileSync(TOOL_STATE_FILE, "utf-8"));
    cachedToolStateMtimeMs = mtimeMs;
    return cachedToolState || {};
  } catch {
    return {};
  }
}

function getMitmAlias(toolName) {
  const all = readCache();
  return all?.[toolName] || null;
}

function isToolRoutingEnabled(toolName) {
  const state = readToolState();
  if (state && typeof state[toolName] === "boolean") {
    return state[toolName];
  }
  return true;
}

module.exports = { getMitmAlias, isToolRoutingEnabled };
