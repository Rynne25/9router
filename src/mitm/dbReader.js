// CJS reader for MITM standalone process. Reads mitmAlias from JSON cache
// at $DATA_DIR/mitm/aliases.json (synced by app from SQLite on startup + writes).
// JSON-only: no SQLite native binding required in MITM bundle.
const fs = require("fs");
const path = require("path");
const { DATA_DIR } = require("./paths");

const CACHE_FILE = path.join(DATA_DIR, "mitm", "aliases.json");

let cachedData = null;
let cachedMtimeMs = 0;

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

function getMitmAlias(toolName) {
  const all = readCache();
  return all?.[toolName] || null;
}

module.exports = { getMitmAlias };
