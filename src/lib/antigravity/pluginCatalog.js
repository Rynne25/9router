/**
 * Antigravity Token-Saver Plugin & MCP Catalog (Layer-2)
 *
 * Strict allowlist + conflict metadata + Node/Python smart pack resolution.
 * Keep pure ESM with zero alias imports so both Next.js and `node --test` work.
 */

export const ANTIGRAVITY_PLUGIN_IDS = Object.freeze([
  "agy-dart",
  "agy-fast",
  "context-mode",
  "codegraph",
  "codebase-memory-mcp",
  "mcptoon",
]);

export const ANTIGRAVITY_PLUGIN_ALLOWLIST = new Set(ANTIGRAVITY_PLUGIN_IDS);

export const ANTIGRAVITY_PLUGIN_CATALOG = Object.freeze([
  Object.freeze({
    id: "agy-dart",
    name: "agy-dart",
    repo: "zou172866/Antigravity-agy-dart",
    stars: 239,
    license: "MIT",
    slot: "context",
    conflictsWith: Object.freeze(["agy-fast", "context-mode"]),
    minNode: Object.freeze([22, 16]),
    requiresPython: false,
    installType: "github-tarball",
    summary: "All-in-one Antigravity context + fast-tools + CLI filter engine (supersedes agy-fast & context-mode on Node >= 22.16)",
    homepage: "https://github.com/zou172866/Antigravity-agy-dart",
  }),
  Object.freeze({
    id: "agy-fast",
    name: "agy-fast",
    repo: "INK-Q/agy-fast",
    stars: 2019,
    license: "MIT",
    slot: "context",
    conflictsWith: Object.freeze(["agy-dart"]),
    minNode: Object.freeze([20, 0]),
    requiresPython: false,
    installType: "npx",
    npmPackage: "agy-fast",
    summary: "Low-latency batch search, slice reader & multi-edit MCP accelerator for Antigravity (Node >= 20)",
    homepage: "https://github.com/INK-Q/agy-fast",
  }),
  Object.freeze({
    id: "context-mode",
    name: "context-mode",
    repo: "Domush/antigravity-plugin-context-mode",
    stars: 152,
    license: "MIT",
    slot: "context",
    conflictsWith: Object.freeze(["agy-dart"]),
    minNode: Object.freeze([20, 0]),
    requiresPython: false,
    installType: "npx",
    npmPackage: "antigravity-plugin-context-mode",
    summary: "Sandboxed command output indexing & FTS5/BM25 context reducer for Antigravity",
    homepage: "https://github.com/Domush/antigravity-plugin-context-mode",
  }),
  Object.freeze({
    id: "codegraph",
    name: "codegraph",
    repo: "colbymchenry/codegraph",
    stars: 78975,
    license: "MIT",
    slot: "graph",
    conflictsWith: Object.freeze(["codebase-memory-mcp"]),
    minNode: Object.freeze([20, 0]),
    requiresPython: false,
    installType: "npm-prefix",
    npmPackage: "@colbymchenry/codegraph",
    summary: "Rust-powered semantic code graph MCP for surgical symbol lookup without full-file reads",
    homepage: "https://github.com/colbymchenry/codegraph",
  }),
  Object.freeze({
    id: "codebase-memory-mcp",
    name: "codebase-memory-mcp",
    repo: "DeusData/codebase-memory-mcp",
    stars: 49263,
    license: "MIT",
    slot: "graph",
    conflictsWith: Object.freeze(["codegraph"]),
    minNode: Object.freeze([20, 0]),
    requiresPython: false,
    installType: "github-release-bin",
    summary: "Zero-runtime C knowledge graph MCP across 164 languages with persistent codebase memory",
    homepage: "https://github.com/DeusData/codebase-memory-mcp",
  }),
  Object.freeze({
    id: "mcptoon",
    name: "mcptoon",
    repo: "activeing123/mcptoon",
    stars: 445,
    license: "Apache-2.0",
    slot: "mcp-gateway",
    conflictsWith: Object.freeze([]),
    minNode: Object.freeze([20, 0]),
    requiresPython: true,
    installType: "pip",
    pypiPackage: "mcptoon",
    summary: "On-demand MCP schema gateway using compact TOON tool index (~99% idle schema token reduction)",
    homepage: "https://github.com/activeing123/mcptoon",
  }),
]);

const CATALOG_MAP = new Map(ANTIGRAVITY_PLUGIN_CATALOG.map((p) => [p.id, p]));

/**
 * Parse a Node version string ("v24.15.0" or "22.16") or env object into [major, minor].
 */
export function parseNodeTuple(envOrVersion) {
  if (Array.isArray(envOrVersion) && envOrVersion.length >= 2) {
    return [Number(envOrVersion[0]) || 0, Number(envOrVersion[1]) || 0];
  }
  if (envOrVersion && typeof envOrVersion === "object") {
    if (Number.isFinite(envOrVersion.nodeMajor) && Number.isFinite(envOrVersion.nodeMinor)) {
      return [envOrVersion.nodeMajor, envOrVersion.nodeMinor];
    }
    if (envOrVersion.nodeVersion) {
      return parseNodeTuple(envOrVersion.nodeVersion);
    }
  }
  const raw = typeof envOrVersion === "string" ? envOrVersion : process.version;
  const match = String(raw || "").trim().match(/^v?(\d+)\.(\d+)/);
  if (!match) return [0, 0];
  return [parseInt(match[1], 10), parseInt(match[2], 10)];
}

export function meetsMinNode(envOrVersion, minNode = [20, 0]) {
  const [major, minor] = parseNodeTuple(envOrVersion);
  const [reqMajor, reqMinor] = minNode;
  return major > reqMajor || (major === reqMajor && minor >= reqMinor);
}

export function getPluginById(pluginId) {
  if (typeof pluginId !== "string" || !ANTIGRAVITY_PLUGIN_ALLOWLIST.has(pluginId)) {
    return null;
  }
  return CATALOG_MAP.get(pluginId) || null;
}

export function assertValidPluginId(pluginId) {
  const plugin = getPluginById(pluginId);
  if (!plugin) {
    const err = new Error(`Invalid or unsupported Antigravity plugin id: ${String(pluginId)}`);
    err.code = "INVALID_PLUGIN_ID";
    throw err;
  }
  return plugin;
}

/**
 * Resolve the recommended non-conflicting Smart Pack for the given runtime environment.
 * - Node >= 22.16: ["agy-dart", "codegraph"] (agy-dart supersedes agy-fast & context-mode)
 * - Node <  22.16: ["agy-fast", "context-mode", "codegraph"]
 */
export function resolveSmartPack(env = {}) {
  if (meetsMinNode(env, [22, 16])) {
    return ["agy-dart", "codegraph"];
  }
  return ["agy-fast", "context-mode", "codegraph"];
}

export function getSmartPackNote(env = {}) {
  const [major, minor] = parseNodeTuple(env);
  if (meetsMinNode(env, [22, 16])) {
    return `Node v${major}.${minor} >= 22.16: khuyến nghị agy-dart + codegraph (agy-dart thay thế gọn agy-fast & context-mode, không xung đột).`;
  }
  return `Node v${major}.${minor} < 22.16: khuyến nghị agy-fast + context-mode + codegraph (chế độ tương thích Node 20+).`;
}

/**
 * Symmetric conflict lookup against currently installed plugin IDs.
 */
export function findConflicts(pluginId, installedIds = []) {
  const target = assertValidPluginId(pluginId);
  const installedSet = new Set(Array.isArray(installedIds) ? installedIds : []);
  const conflicts = new Set();

  for (const cid of target.conflictsWith) {
    if (installedSet.has(cid) && cid !== target.id) conflicts.add(cid);
  }
  for (const other of ANTIGRAVITY_PLUGIN_CATALOG) {
    if (other.id !== target.id && installedSet.has(other.id) && other.conflictsWith.includes(target.id)) {
      conflicts.add(other.id);
    }
  }
  return [...conflicts];
}
