/**
 * `9router setup-saver` — Portable Layer-2 Antigravity Token-Saver Plugin & MCP setup.
 *
 * Pure CommonJS with zero imports from `src/` so it works standalone in the
 * packed npm CLI (`cli/package.json`) via `npx 9router setup-saver` or `9router setup-saver`.
 */

const fs = require("fs");
const path = require("path");
const os = require("os");
const { spawn, execFileSync } = require("child_process");
const { Readable } = require("stream");
const { pipeline } = require("stream/promises");

const IS_WIN = process.platform === "win32";
const INSTALL_TIMEOUT_MS = 5 * 60 * 1000;
const NETWORK_TIMEOUT_MS = 30 * 1000;

const AGY_DART_LATEST_API = "https://api.github.com/repos/zou172866/Antigravity-agy-dart/releases/latest";
const AGY_DART_FALLBACK_TARBALL = "https://github.com/zou172866/Antigravity-agy-dart/archive/refs/tags/v1.10.0.tar.gz";
const CBM_LATEST_API = "https://api.github.com/repos/DeusData/codebase-memory-mcp/releases/latest";

const PYTHON_CANDIDATES = IS_WIN
  ? ["python", "python3"]
  : ["python3.13", "python3.12", "python3.11", "python3.10", "python3", "python"];

const UNSAFE_ARG_PATTERN = /[&|><^`!\r\n\0]/;

const ANTIGRAVITY_PLUGIN_IDS = Object.freeze([
  "agy-dart",
  "agy-fast",
  "context-mode",
  "codegraph",
  "codebase-memory-mcp",
  "mcptoon",
]);

const ANTIGRAVITY_PLUGIN_ALLOWLIST = new Set(ANTIGRAVITY_PLUGIN_IDS);

const ANTIGRAVITY_PLUGIN_CATALOG = Object.freeze([
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
    summary: "Low-latency batch search, slice reader & multi-edit MCP accelerator for Antigravity (Node >= 20)",
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
    summary: "Sandboxed command output indexing & FTS5/BM25 context reducer for Antigravity",
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
    summary: "Rust-powered semantic code graph MCP for surgical symbol lookup without full-file reads",
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
    summary: "On-demand MCP schema gateway using compact TOON tool index (~99% idle schema token reduction)",
  }),
]);

const CATALOG_MAP = new Map(ANTIGRAVITY_PLUGIN_CATALOG.map((p) => [p.id, p]));

const HELP = `
Usage: 9router setup-saver [options]

Install, inspect, or remove Layer-2 Antigravity Token-Saver plugins & MCP tools.

Options:
  --status               Show detected runtime, Smart Pack, and plugin status
  --pack <smart|node20>  Install recommended Smart Pack or Node 20 compatibility pack
  --plugin <id>          Install a specific plugin (${ANTIGRAVITY_PLUGIN_IDS.join(", ")})
  --uninstall <id>       Uninstall a specific plugin
  --doctor               Run health check on installed plugins
  --yes, -y              Non-interactive mode (auto-confirm Smart Pack install)
  --no-conflicts         Do not auto-uninstall conflicting plugins before installing
  -h, --help             Show this help
`;

let installQueue = Promise.resolve();
const activeState = { installing: false, currentPluginId: null };

function parseNodeTuple(envOrVersion) {
  if (Array.isArray(envOrVersion) && envOrVersion.length >= 2) {
    return [Number(envOrVersion[0]) || 0, Number(envOrVersion[1]) || 0];
  }
  if (envOrVersion && typeof envOrVersion === "object") {
    if (Number.isFinite(envOrVersion.nodeMajor) && Number.isFinite(envOrVersion.nodeMinor)) {
      return [envOrVersion.nodeMajor, envOrVersion.nodeMinor];
    }
    if (envOrVersion.nodeVersion) return parseNodeTuple(envOrVersion.nodeVersion);
  }
  const raw = typeof envOrVersion === "string" ? envOrVersion : process.version;
  const match = String(raw || "").trim().match(/^v?(\d+)\.(\d+)/);
  if (!match) return [0, 0];
  return [parseInt(match[1], 10), parseInt(match[2], 10)];
}

function meetsMinNode(envOrVersion, minNode = [20, 0]) {
  const [major, minor] = parseNodeTuple(envOrVersion);
  const [reqMajor, reqMinor] = minNode;
  return major > reqMajor || (major === reqMajor && minor >= reqMinor);
}

function assertValidPluginId(pluginId) {
  if (typeof pluginId !== "string" || !ANTIGRAVITY_PLUGIN_ALLOWLIST.has(pluginId)) {
    const err = new Error(`Invalid or unsupported Antigravity plugin id: ${String(pluginId)}`);
    err.code = "INVALID_PLUGIN_ID";
    throw err;
  }
  return CATALOG_MAP.get(pluginId);
}

function resolveSmartPack(env = {}) {
  if (meetsMinNode(env, [22, 16])) {
    return ["agy-dart", "codegraph"];
  }
  return ["agy-fast", "context-mode", "codegraph"];
}

function getSmartPackNote(env = {}) {
  const [major, minor] = parseNodeTuple(env);
  if (meetsMinNode(env, [22, 16])) {
    return `Node v${major}.${minor} >= 22.16: khuyến nghị agy-dart + codegraph (agy-dart thay thế gọn agy-fast & context-mode, không xung đột).`;
  }
  return `Node v${major}.${minor} < 22.16: khuyến nghị agy-fast + context-mode + codegraph (chế độ tương thích Node 20+).`;
}

function findConflicts(pluginId, installedIds = []) {
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

function getHomeDir(overrideHome) {
  if (overrideHome) return overrideHome;
  if (IS_WIN) {
    const driveHome =
      process.env.HOMEDRIVE && process.env.HOMEPATH
        ? `${process.env.HOMEDRIVE}${process.env.HOMEPATH}`
        : "";
    return process.env.USERPROFILE || driveHome || process.env.HOME || os.homedir();
  }
  return process.env.HOME || process.env.USERPROFILE || os.homedir();
}

function getDataDir(overrideDataDir) {
  if (overrideDataDir) return overrideDataDir;
  const configured = process.env.DATA_DIR;
  if (configured && !(IS_WIN && /^\//.test(configured))) return configured;
  if (IS_WIN) {
    return path.join(process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming"), "9router");
  }
  return path.join(os.homedir(), ".9router");
}

function getPaths(options = {}) {
  const homeDir = getHomeDir(options.homeDir);
  const dataDir = getDataDir(options.dataDir);
  const pluginsDataDir = path.join(dataDir, "antigravity-plugins");
  const geminiConfigDir = path.join(homeDir, ".gemini", "config");
  const geminiPluginsDir = path.join(geminiConfigDir, "plugins");
  const geminiLegacyDir = path.join(homeDir, ".gemini", "antigravity");
  const codegraphPrefixDir = path.join(pluginsDataDir, "codegraph");
  const cbmDir = path.join(pluginsDataDir, "codebase-memory-mcp");

  return {
    homeDir,
    dataDir,
    pluginsDataDir,
    installLogPath: path.join(pluginsDataDir, "install.log"),
    agyDartSrcDir: path.join(pluginsDataDir, "agy-dart-src"),
    agyDartTarballPath: path.join(pluginsDataDir, "agy-dart-src.tar.gz"),
    codegraphPrefixDir,
    codegraphBinDir: path.join(codegraphPrefixDir, "node_modules", ".bin"),
    codegraphPkgJson: path.join(codegraphPrefixDir, "node_modules", "@colbymchenry", "codegraph", "package.json"),
    codegraphShimPath: path.join(codegraphPrefixDir, "node_modules", "@colbymchenry", "codegraph", "npm-shim.js"),
    cbmDir,
    cbmBinPath: path.join(cbmDir, IS_WIN ? "codebase-memory-mcp.exe" : "codebase-memory-mcp"),
    geminiConfigDir,
    geminiPluginsDir,
    geminiLegacyDir,
    unifiedMcpConfigPath: path.join(geminiConfigDir, "mcp_config.json"),
    legacyMcpConfigPath: path.join(geminiLegacyDir, "mcp_config.json"),
  };
}

function buildExtendedPath(options = {}) {
  const paths = getPaths(options);
  const extraBins = IS_WIN
    ? [
        `${process.env.ProgramFiles || ""}\\nodejs`,
        `${process.env.APPDATA || ""}\\npm`,
        `${process.env.LOCALAPPDATA || ""}\\Programs\\Python\\Python314\\Scripts`,
        `${process.env.LOCALAPPDATA || ""}\\Programs\\Python\\Python313\\Scripts`,
        `${process.env.LOCALAPPDATA || ""}\\Programs\\Python\\Python312\\Scripts`,
        `${process.env.LOCALAPPDATA || ""}\\Programs\\Python\\Python311\\Scripts`,
        `${process.env.LOCALAPPDATA || ""}\\Programs\\Python\\Python310\\Scripts`,
        `${process.env.APPDATA || ""}\\Python\\Python314\\Scripts`,
        `${process.env.APPDATA || ""}\\Python\\Python313\\Scripts`,
        `${process.env.APPDATA || ""}\\Python\\Python312\\Scripts`,
        path.join(paths.homeDir, ".local", "bin"),
        paths.codegraphBinDir,
        paths.cbmDir,
      ]
    : [
        "/usr/local/bin",
        "/opt/homebrew/bin",
        path.join(paths.homeDir, ".local", "bin"),
        "/usr/bin",
        "/bin",
        paths.codegraphBinDir,
        paths.cbmDir,
      ];
  return [...extraBins, process.env.PATH || ""].filter(Boolean).join(path.delimiter);
}

function appendLog(logPath, line) {
  try {
    fs.mkdirSync(path.dirname(logPath), { recursive: true });
    fs.appendFileSync(logPath, `[${new Date().toISOString()}] ${line}\n`, "utf8");
  } catch {}
}

function getInstallLogTail(maxLines = 200, options = {}) {
  const { installLogPath } = getPaths(options);
  try {
    if (!fs.existsSync(installLogPath)) return "";
    const lines = fs.readFileSync(installLogPath, "utf8").split(/\r?\n/).filter(Boolean);
    return lines.slice(-maxLines).join("\n");
  } catch {
    return "";
  }
}

function validateSafeArgs(args) {
  for (const arg of args) {
    if (typeof arg !== "string" || UNSAFE_ARG_PATTERN.test(arg)) {
      throw new Error(`Refusing unsafe command argument: ${String(arg)}`);
    }
  }
}

function findBinary(name, extendedPath = buildExtendedPath()) {
  if (!/^[a-zA-Z0-9._-]+$/.test(name)) return null;
  try {
    const cmd = IS_WIN ? "where" : "which";
    const out = execFileSync(cmd, [name], {
      stdio: ["ignore", "pipe", "ignore"],
      windowsHide: true,
      timeout: 3000,
      env: { ...process.env, PATH: extendedPath },
    }).toString().trim();
    return out ? out.split(/\r?\n/)[0].trim() : null;
  } catch {
    return null;
  }
}

function detectPython(extendedPath = buildExtendedPath()) {
  const candidates = [];
  if (IS_WIN) {
    for (const ver of ["Python314", "Python313", "Python312", "Python311", "Python310"]) {
      if (process.env.LOCALAPPDATA) {
        candidates.push(path.join(process.env.LOCALAPPDATA, "Programs", "Python", ver, "python.exe"));
      }
    }
  }
  for (const c of PYTHON_CANDIDATES) candidates.push(c);

  for (const candidate of candidates) {
    try {
      const out = execFileSync(candidate, ["--version"], {
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
        timeout: 3000,
        env: { ...process.env, PATH: extendedPath },
      }).toString().trim();
      const m = out.match(/Python\s+(\d+\.\d+(?:\.\d+)?)/i);
      if (m) return { available: true, command: candidate, version: m[1] };
    } catch {}
  }
  return { available: false, command: null, version: null };
}

function readJsonSafe(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

function writeJsonSafe(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + "\n", "utf8");
}

function getMcpServerEntry(serverName, paths) {
  for (const cfgPath of [paths.unifiedMcpConfigPath, paths.legacyMcpConfigPath]) {
    const cfg = readJsonSafe(cfgPath);
    if (cfg?.mcpServers && Object.prototype.hasOwnProperty.call(cfg.mcpServers, serverName)) {
      return { path: cfgPath, entry: cfg.mcpServers[serverName] };
    }
  }
  return null;
}

function removeMcpServerEntry(serverName, paths) {
  let removed = false;
  for (const cfgPath of [paths.unifiedMcpConfigPath, paths.legacyMcpConfigPath]) {
    const cfg = readJsonSafe(cfgPath);
    if (cfg?.mcpServers && Object.prototype.hasOwnProperty.call(cfg.mcpServers, serverName)) {
      delete cfg.mcpServers[serverName];
      writeJsonSafe(cfgPath, cfg);
      removed = true;
    }
  }
  return removed;
}

function ensureAntigravityMcpEntry(serverName, entry, paths) {
  const preferredPath = fs.existsSync(path.join(paths.geminiConfigDir, ".migrated")) || fs.existsSync(paths.unifiedMcpConfigPath)
    ? paths.unifiedMcpConfigPath
    : paths.legacyMcpConfigPath;
  const cfg = readJsonSafe(preferredPath) || {};
  if (!cfg.mcpServers || typeof cfg.mcpServers !== "object") cfg.mcpServers = {};
  cfg.mcpServers[serverName] = entry;
  writeJsonSafe(preferredPath, cfg);
  return preferredPath;
}

function detectEnvironment(options = {}) {
  const paths = getPaths(options);
  const extendedPath = buildExtendedPath(options);
  const nodeVersion = options.nodeVersion || process.version;
  const [nodeMajor, nodeMinor] = parseNodeTuple(nodeVersion);
  const npmPath = options.npmPath !== undefined ? options.npmPath : findBinary("npm", extendedPath);
  const tarPath = options.tarPath !== undefined ? options.tarPath : findBinary("tar", extendedPath);
  const python = options.python || detectPython(extendedPath);
  const antigravityDetected = fs.existsSync(paths.geminiConfigDir) || fs.existsSync(paths.geminiLegacyDir);

  return {
    nodeVersion,
    nodeMajor,
    nodeMinor,
    meetsAgyDartNode: meetsMinNode([nodeMajor, nodeMinor], [22, 16]),
    platform: process.platform,
    arch: process.arch,
    npmAvailable: Boolean(npmPath),
    npmPath,
    tarAvailable: Boolean(tarPath),
    pythonAvailable: Boolean(python?.available),
    pythonVersion: python?.version || null,
    pythonCommand: python?.command || null,
    antigravityDetected,
    configDir: paths.geminiConfigDir,
    pluginsDir: paths.geminiPluginsDir,
    mcpConfigPath: fs.existsSync(paths.unifiedMcpConfigPath)
      ? paths.unifiedMcpConfigPath
      : paths.legacyMcpConfigPath,
  };
}

async function execSafeCommand(cmd, args = [], options = {}) {
  validateSafeArgs(args);
  const logPath = options.logPath;
  const cwd = options.cwd;
  const timeoutMs = options.timeoutMs || INSTALL_TIMEOUT_MS;
  const env = { ...process.env, ...(options.env || {}), PATH: options.env?.PATH || buildExtendedPath(options) };
  const isNodeExe = cmd === process.execPath;
  const needsWinShell = IS_WIN && !isNodeExe && !cmd.toLowerCase().endsWith(".exe");
  if (logPath) appendLog(logPath, `RUN: ${path.basename(cmd)} ${args.join(" ")}`);

  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      cwd,
      env,
      windowsHide: true,
      shell: needsWinShell,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    const onChunk = (chunk, isErr) => {
      const text = chunk.toString();
      if (isErr) stderr += text;
      else stdout += text;
      if (logPath) {
        for (const line of text.split(/\r?\n/)) {
          if (line.trim()) appendLog(logPath, line);
        }
      }
      if (typeof options.onOutput === "function") options.onOutput(text, isErr);
    };
    child.stdout?.on("data", (d) => onChunk(d, false));
    child.stderr?.on("data", (d) => onChunk(d, true));

    const timer = setTimeout(() => {
      try { child.kill("SIGKILL"); } catch {}
      reject(new Error(`Command timed out after ${Math.round(timeoutMs / 1000)}s: ${cmd}`));
    }, timeoutMs);

    child.once("error", (err) => { clearTimeout(timer); reject(err); });
    child.once("exit", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve({ code: 0, stdout, stderr });
      else {
        const tail = (stderr || stdout).trim().split(/\r?\n/).slice(-5).join(" | ");
        reject(new Error(`Command exited with code ${code}: ${tail || cmd}`));
      }
    });
  });
}

function readPluginManifestVersion(pluginDir) {
  const manifest = readJsonSafe(path.join(pluginDir, "plugin.json"));
  const pkg = readJsonSafe(path.join(pluginDir, "package.json"));
  return manifest?.version || pkg?.version || null;
}

function detectPluginState(plugin, env, options = {}) {
  const paths = getPaths(options);
  const extendedPath = buildExtendedPath(options);
  const supported = meetsMinNode(env, plugin.minNode) && (!plugin.requiresPython || env.pythonAvailable);
  let unsupportedReason = null;
  if (!meetsMinNode(env, plugin.minNode)) {
    unsupportedReason = `Requires Node.js >= ${plugin.minNode.join(".")} (current: ${env.nodeVersion})`;
  } else if (plugin.requiresPython && !env.pythonAvailable) {
    unsupportedReason = "Requires Python 3.10+ on PATH";
  }

  let installed = false;
  let version = null;
  let installPath = null;
  let mcpConfigured = false;
  let binaryInstalled = false;

  if (plugin.id === "agy-dart") {
    const dir = path.join(paths.geminiPluginsDir, "agy-dart");
    if (fs.existsSync(path.join(dir, "plugin.json"))) {
      installed = true;
      installPath = dir;
      version = readPluginManifestVersion(dir) || readJsonSafe(path.join(paths.agyDartSrcDir, "package.json"))?.version || null;
      mcpConfigured = fs.existsSync(path.join(dir, "mcp_config.json"));
    }
  } else if (plugin.id === "agy-fast") {
    const dir = path.join(paths.geminiPluginsDir, "agy-fast");
    if (fs.existsSync(path.join(dir, "plugin.json"))) {
      installed = true;
      installPath = dir;
      version = readPluginManifestVersion(dir);
      mcpConfigured = fs.existsSync(path.join(dir, "mcp_config.json"));
    }
  } else if (plugin.id === "context-mode") {
    const primary = path.join(paths.geminiPluginsDir, "context-mode");
    const legacy = path.join(paths.geminiPluginsDir, "antigravity-plugin-context-mode");
    const dir = fs.existsSync(path.join(primary, "plugin.json"))
      ? primary
      : fs.existsSync(path.join(legacy, "plugin.json"))
        ? legacy
        : null;
    if (dir) {
      installed = true;
      installPath = dir;
      version = readPluginManifestVersion(dir);
      mcpConfigured = fs.existsSync(path.join(dir, "mcp_config.json"));
    }
  } else if (plugin.id === "codegraph") {
    const localPkg = readJsonSafe(paths.codegraphPkgJson);
    const globalBin = options.skipBinLookup ? null : findBinary("codegraph", extendedPath);
    binaryInstalled = Boolean(localPkg || globalBin);
    mcpConfigured = Boolean(getMcpServerEntry("codegraph", paths));
    installed = Boolean(binaryInstalled && mcpConfigured);
    version = localPkg?.version || null;
    installPath = localPkg ? paths.codegraphPrefixDir : globalBin;
  } else if (plugin.id === "codebase-memory-mcp") {
    const localExists = fs.existsSync(paths.cbmBinPath);
    const globalBin = options.skipBinLookup ? null : findBinary("codebase-memory-mcp", extendedPath);
    binaryInstalled = Boolean(localExists || globalBin);
    mcpConfigured = Boolean(getMcpServerEntry("codebase-memory-mcp", paths));
    installed = Boolean(binaryInstalled && mcpConfigured);
    installPath = localExists ? paths.cbmBinPath : globalBin;
  } else if (plugin.id === "mcptoon") {
    const bin = options.skipBinLookup ? null : findBinary("mcptoon", extendedPath);
    if (bin) {
      installed = true;
      binaryInstalled = true;
      installPath = bin;
    } else if (!options.skipBinLookup && env.pythonAvailable && env.pythonCommand) {
      try {
        const showOut = execFileSync(env.pythonCommand, ["-m", "pip", "show", "mcptoon"], {
          stdio: ["ignore", "pipe", "ignore"],
          windowsHide: true,
          timeout: 3000,
          env: { ...process.env, PATH: extendedPath },
        }).toString();
        const verMatch = showOut.match(/^Version:\s*(.+)$/im);
        if (verMatch) {
          installed = true;
          binaryInstalled = true;
          version = verMatch[1].trim();
        }
      } catch {}
    }
    mcpConfigured = Boolean(getMcpServerEntry("mcptoon", paths));
  }

  return {
    ...plugin,
    installed,
    binaryInstalled,
    mcpConfigured,
    version,
    installPath,
    supported,
    unsupportedReason,
  };
}

async function getAntigravityPluginsStatus(options = {}) {
  const env = detectEnvironment(options);
  const smartPackIds = resolveSmartPack(env);
  const smartPackNote = getSmartPackNote(env);
  const smartSet = new Set(smartPackIds);

  const detected = ANTIGRAVITY_PLUGIN_CATALOG.map((p) => detectPluginState(p, env, options));
  const installedIds = detected.filter((p) => p.installed).map((p) => p.id);

  const plugins = detected.map((p) => ({
    ...p,
    recommended: smartSet.has(p.id),
    activeConflicts: findConflicts(p.id, installedIds),
  }));

  return {
    env,
    smartPackIds,
    smartPackNote,
    plugins,
    installing: activeState.installing,
    currentPluginId: activeState.currentPluginId,
    logTail: getInstallLogTail(200, options),
  };
}

async function downloadFile(url, destPath, fetchFn = fetch) {
  const res = await fetchFn(url, {
    headers: { "User-Agent": "9Router-PluginManager/1.0" },
    redirect: "follow",
    signal: AbortSignal.timeout(NETWORK_TIMEOUT_MS),
  });
  if (!res.ok || !res.body) throw new Error(`HTTP ${res.status} downloading ${url}`);
  fs.mkdirSync(path.dirname(destPath), { recursive: true });
  await pipeline(Readable.fromWeb(res.body), fs.createWriteStream(destPath));
}

async function resolveAgyDartTarballUrl(fetchFn = fetch) {
  try {
    const res = await fetchFn(AGY_DART_LATEST_API, {
      headers: { "User-Agent": "9Router-PluginManager/1.0", Accept: "application/vnd.github+json" },
      signal: AbortSignal.timeout(10000),
    });
    if (res.ok) {
      const data = await res.json();
      if (data?.tarball_url) return data.tarball_url;
    }
  } catch {}
  return AGY_DART_FALLBACK_TARBALL;
}

function findFileRecursive(dir, targetName, depth = 3) {
  if (depth < 0 || !fs.existsSync(dir)) return null;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isFile() && entry.name.toLowerCase() === targetName.toLowerCase()) return full;
    if (entry.isDirectory()) {
      const found = findFileRecursive(full, targetName, depth - 1);
      if (found) return found;
    }
  }
  return null;
}

function selectCbmAsset(assets = []) {
  const plat = process.platform === "win32" ? "windows" : process.platform === "darwin" ? "darwin" : "linux";
  const arch = process.arch === "arm64" ? "arm64" : "amd64";
  const ext = plat === "windows" ? ".zip" : ".tar.gz";
  const exact = assets.find((a) => a.name === `codebase-memory-mcp-${plat}-${arch}${ext}`);
  if (exact) return exact;
  return assets.find((a) =>
    a.name.includes(`-${plat}-${arch}`) &&
    a.name.endsWith(ext) &&
    !a.name.includes("-ui-") &&
    !a.name.endsWith(".bundle")
  ) || null;
}

async function installAgyDart(env, paths, options) {
  if (!meetsMinNode(env, [22, 16])) {
    throw new Error(`agy-dart requires Node.js >= 22.16 (current: ${env.nodeVersion})`);
  }
  const fetchFn = options.fetchFn || fetch;
  const runCmd = options.runCmd || execSafeCommand;
  const primaryUrl = await resolveAgyDartTarballUrl(fetchFn);

  try {
    appendLog(paths.installLogPath, `Downloading agy-dart from ${primaryUrl}`);
    await downloadFile(primaryUrl, paths.agyDartTarballPath, fetchFn);
  } catch (err) {
    if (primaryUrl === AGY_DART_FALLBACK_TARBALL) throw err;
    appendLog(paths.installLogPath, `Primary download failed (${err.message}); trying fallback ${AGY_DART_FALLBACK_TARBALL}`);
    await downloadFile(AGY_DART_FALLBACK_TARBALL, paths.agyDartTarballPath, fetchFn);
  }

  fs.rmSync(paths.agyDartSrcDir, { recursive: true, force: true });
  fs.mkdirSync(paths.agyDartSrcDir, { recursive: true });
  await runCmd("tar", ["-xzf", paths.agyDartTarballPath, "-C", paths.agyDartSrcDir, "--strip-components=1"], {
    logPath: paths.installLogPath,
  });

  let installScript = path.join(paths.agyDartSrcDir, "scripts", "install.mjs");
  if (!fs.existsSync(installScript)) installScript = findFileRecursive(paths.agyDartSrcDir, "install.mjs", 3);
  if (!installScript || !fs.existsSync(installScript)) {
    throw new Error("agy-dart archive extracted but scripts/install.mjs was not found");
  }
  await runCmd(process.execPath, [installScript, "install"], {
    cwd: path.dirname(path.dirname(installScript)),
    logPath: paths.installLogPath,
  });
}

async function installCodegraph(env, paths, options) {
  if (!env.npmAvailable) throw new Error("npm not found on PATH");
  const runCmd = options.runCmd || execSafeCommand;
  const extendedPath = buildExtendedPath(options);

  fs.mkdirSync(paths.codegraphPrefixDir, { recursive: true });
  const hostPkg = path.join(paths.codegraphPrefixDir, "package.json");
  if (!fs.existsSync(hostPkg)) writeJsonSafe(hostPkg, { name: "9router-codegraph-host", private: true });

  await runCmd("npm", ["install", "@colbymchenry/codegraph@latest", "--no-audit", "--no-fund"], {
    cwd: paths.codegraphPrefixDir,
    logPath: paths.installLogPath,
    env: { ...process.env, PATH: extendedPath },
  });

  const hasShim = fs.existsSync(paths.codegraphShimPath);
  const runCodegraph = (cgArgs) => {
    if (hasShim) {
      return runCmd(process.execPath, [paths.codegraphShimPath, ...cgArgs], {
        cwd: paths.codegraphPrefixDir,
        logPath: paths.installLogPath,
        env: { ...process.env, PATH: extendedPath, CI: "1" },
      });
    }
    return runCmd("codegraph", cgArgs, {
      cwd: paths.codegraphPrefixDir,
      logPath: paths.installLogPath,
      env: { ...process.env, PATH: extendedPath, CI: "1" },
    });
  };

  await runCodegraph(["install", "--yes", "--target=antigravity", "--location=global"]);
  await runCodegraph(["--version"]);

  const hasGlobalBin = options.skipBinLookup ? false : Boolean(findBinary("codegraph", process.env.PATH || ""));
  if (!hasGlobalBin && hasShim) {
    ensureAntigravityMcpEntry("codegraph", {
      command: process.execPath,
      args: [paths.codegraphShimPath, "serve", "--mcp"],
    }, paths);
    appendLog(paths.installLogPath, `Wired Antigravity MCP for local codegraph shim: ${paths.codegraphShimPath}`);
  }
}

async function installCodebaseMemoryMcp(env, paths, options) {
  const fetchFn = options.fetchFn || fetch;
  const runCmd = options.runCmd || execSafeCommand;
  const res = await fetchFn(CBM_LATEST_API, {
    headers: { "User-Agent": "9Router-PluginManager/1.0", Accept: "application/vnd.github+json" },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`Failed to fetch codebase-memory-mcp release (${res.status})`);
  const release = await res.json();
  const asset = selectCbmAsset(release?.assets || []);
  if (!asset?.browser_download_url) {
    throw new Error(`No codebase-memory-mcp release asset found for ${process.platform}/${process.arch}`);
  }

  fs.mkdirSync(paths.cbmDir, { recursive: true });
  const archivePath = path.join(paths.cbmDir, asset.name);
  await downloadFile(asset.browser_download_url, archivePath, fetchFn);
  if (asset.name.endsWith(".zip")) {
    await runCmd("tar", ["-xf", archivePath, "-C", paths.cbmDir], { logPath: paths.installLogPath });
  } else {
    await runCmd("tar", ["-xzf", archivePath, "-C", paths.cbmDir], { logPath: paths.installLogPath });
  }

  const binName = IS_WIN ? "codebase-memory-mcp.exe" : "codebase-memory-mcp";
  if (!fs.existsSync(paths.cbmBinPath)) {
    const nested = findFileRecursive(paths.cbmDir, binName, 2);
    if (nested) fs.copyFileSync(nested, paths.cbmBinPath);
  }
  if (!fs.existsSync(paths.cbmBinPath)) throw new Error("codebase-memory-mcp binary not found after extraction");
  if (!IS_WIN) fs.chmodSync(paths.cbmBinPath, 0o755);

  try {
    await runCmd(paths.cbmBinPath, ["install", "--no-hooks"], { cwd: paths.cbmDir, logPath: paths.installLogPath });
  } catch (err) {
    appendLog(paths.installLogPath, `codebase-memory-mcp install --no-hooks note: ${err.message}`);
  }

  if (!getMcpServerEntry("codebase-memory-mcp", paths)) {
    ensureAntigravityMcpEntry("codebase-memory-mcp", { command: paths.cbmBinPath, args: [] }, paths);
  }
}

async function installMcptoon(env, paths, options) {
  if (!env.pythonAvailable || !env.pythonCommand) throw new Error("Python 3.10+ is required to install mcptoon");
  const runCmd = options.runCmd || execSafeCommand;
  const extendedPath = buildExtendedPath(options);
  try {
    await runCmd(env.pythonCommand, ["-m", "pip", "install", "--user", "--upgrade", "mcptoon"], {
      logPath: paths.installLogPath,
      env: { ...process.env, PATH: extendedPath },
    });
  } catch (err) {
    if (/--user/i.test(err.message) || /virtualenv/i.test(err.message)) {
      await runCmd(env.pythonCommand, ["-m", "pip", "install", "--upgrade", "mcptoon"], {
        logPath: paths.installLogPath,
        env: { ...process.env, PATH: extendedPath },
      });
    } else {
      throw err;
    }
  }
  try {
    await runCmd(env.pythonCommand, ["-m", "mcptoon", "quickstart"], {
      logPath: paths.installLogPath,
      env: { ...process.env, PATH: extendedPath },
    });
  } catch (err) {
    appendLog(paths.installLogPath, `mcptoon quickstart note: ${err.message}`);
  }
}

async function uninstallSinglePlugin(pluginId, options = {}) {
  const plugin = assertValidPluginId(pluginId);
  const paths = getPaths(options);
  const env = detectEnvironment(options);
  const runCmd = options.runCmd || execSafeCommand;
  const extendedPath = buildExtendedPath(options);

  appendLog(paths.installLogPath, `=== Uninstalling ${plugin.id} ===`);

  if (plugin.id === "agy-dart") {
    const installScript = path.join(paths.agyDartSrcDir, "scripts", "install.mjs");
    if (fs.existsSync(installScript)) {
      try { await runCmd(process.execPath, [installScript, "uninstall"], { logPath: paths.installLogPath }); } catch {}
    }
    fs.rmSync(path.join(paths.geminiPluginsDir, "agy-dart"), { recursive: true, force: true });
    fs.rmSync(path.join(paths.geminiLegacyDir, "plugins", "agy-dart"), { recursive: true, force: true });
  } else if (plugin.id === "agy-fast") {
    if (env.npmAvailable) {
      try {
        await runCmd("npx", ["--yes", "agy-fast@latest", "uninstall"], {
          logPath: paths.installLogPath,
          env: { ...process.env, PATH: extendedPath, CI: "1" },
        });
      } catch {}
    }
    fs.rmSync(path.join(paths.geminiPluginsDir, "agy-fast"), { recursive: true, force: true });
  } else if (plugin.id === "context-mode") {
    if (env.npmAvailable) {
      try {
        await runCmd("npx", ["--yes", "antigravity-plugin-context-mode@latest", "uninstall"], {
          logPath: paths.installLogPath,
          env: { ...process.env, PATH: extendedPath, CI: "1" },
        });
      } catch {}
    }
    fs.rmSync(path.join(paths.geminiPluginsDir, "context-mode"), { recursive: true, force: true });
    fs.rmSync(path.join(paths.geminiPluginsDir, "antigravity-plugin-context-mode"), { recursive: true, force: true });
  } else if (plugin.id === "codegraph") {
    if (fs.existsSync(paths.codegraphShimPath)) {
      try {
        await runCmd(process.execPath, [paths.codegraphShimPath, "uninstall", "--yes", "--target=antigravity", "--location=global"], {
          logPath: paths.installLogPath,
          env: { ...process.env, PATH: extendedPath, CI: "1" },
        });
      } catch {}
    }
    removeMcpServerEntry("codegraph", paths);
    fs.rmSync(paths.codegraphPrefixDir, { recursive: true, force: true });
  } else if (plugin.id === "codebase-memory-mcp") {
    if (fs.existsSync(paths.cbmBinPath)) {
      try { await runCmd(paths.cbmBinPath, ["uninstall"], { logPath: paths.installLogPath }); } catch {}
    }
    removeMcpServerEntry("codebase-memory-mcp", paths);
    fs.rmSync(paths.cbmDir, { recursive: true, force: true });
  } else if (plugin.id === "mcptoon") {
    if (env.pythonAvailable && env.pythonCommand) {
      try {
        await runCmd(env.pythonCommand, ["-m", "pip", "uninstall", "-y", "mcptoon"], {
          logPath: paths.installLogPath,
          env: { ...process.env, PATH: extendedPath },
        });
      } catch {}
    }
    removeMcpServerEntry("mcptoon", paths);
  }
  return { pluginId: plugin.id, action: "uninstall", ok: true };
}

async function installSinglePlugin(pluginId, { autoResolveConflicts = true, ...options } = {}) {
  const plugin = assertValidPluginId(pluginId);
  const paths = getPaths(options);
  const env = detectEnvironment(options);
  const runCmd = options.runCmd || execSafeCommand;
  const extendedPath = buildExtendedPath(options);

  appendLog(paths.installLogPath, `=== Installing ${plugin.id} (autoResolveConflicts=${Boolean(autoResolveConflicts)}) ===`);

  const installedBefore = ANTIGRAVITY_PLUGIN_CATALOG
    .filter((p) => detectPluginState(p, env, { ...options, skipBinLookup: true }).installed)
    .map((p) => p.id);
  const conflicts = findConflicts(plugin.id, installedBefore);
  const resolvedConflicts = [];

  if (conflicts.length > 0) {
    if (!autoResolveConflicts) {
      throw new Error(`Conflict detected for ${plugin.id}: uninstall ${conflicts.join(", ")} first or enable autoResolveConflicts`);
    }
    for (const conflictId of conflicts) {
      await uninstallSinglePlugin(conflictId, options);
      resolvedConflicts.push(conflictId);
    }
  }

  if (plugin.id === "agy-dart") await installAgyDart(env, paths, options);
  else if (plugin.id === "agy-fast") {
    if (!env.npmAvailable) throw new Error("npm/npx not found on PATH");
    await runCmd("npx", ["--yes", "agy-fast@latest", "install"], {
      logPath: paths.installLogPath,
      env: { ...process.env, PATH: extendedPath, CI: "1" },
    });
  } else if (plugin.id === "context-mode") {
    if (!env.npmAvailable) throw new Error("npm/npx not found on PATH");
    await runCmd("npx", ["--yes", "antigravity-plugin-context-mode@latest", "install"], {
      logPath: paths.installLogPath,
      env: { ...process.env, PATH: extendedPath, CI: "1" },
    });
  } else if (plugin.id === "codegraph") await installCodegraph(env, paths, options);
  else if (plugin.id === "codebase-memory-mcp") await installCodebaseMemoryMcp(env, paths, options);
  else if (plugin.id === "mcptoon") await installMcptoon(env, paths, options);

  const afterState = detectPluginState(plugin, detectEnvironment(options), options);
  if (!afterState.installed) {
    throw new Error(`${plugin.id} installer finished but verification check failed — see install.log`);
  }

  return {
    pluginId: plugin.id,
    action: "install",
    ok: true,
    version: afterState.version,
    installPath: afterState.installPath,
    resolvedConflicts,
  };
}

function withInstallMutex(label, fn) {
  const run = installQueue.then(async () => {
    activeState.installing = true;
    activeState.currentPluginId = label;
    try { return await fn(); }
    finally {
      activeState.installing = false;
      activeState.currentPluginId = null;
    }
  });
  installQueue = run.catch(() => {});
  return run;
}

function installPlugin(pluginId, opts = {}) {
  assertValidPluginId(pluginId);
  return withInstallMutex(pluginId, async () => {
    try {
      const r = await installSinglePlugin(pluginId, opts);
      return { ok: true, results: [r], logTail: getInstallLogTail(200, opts), status: await getAntigravityPluginsStatus(opts) };
    } catch (err) {
      return { ok: false, results: [{ pluginId, action: "install", ok: false, error: err.message }], logTail: getInstallLogTail(200, opts), status: await getAntigravityPluginsStatus(opts) };
    }
  });
}

function uninstallPlugin(pluginId, opts = {}) {
  assertValidPluginId(pluginId);
  return withInstallMutex(pluginId, async () => {
    try {
      const r = await uninstallSinglePlugin(pluginId, opts);
      return { ok: true, results: [r], logTail: getInstallLogTail(200, opts), status: await getAntigravityPluginsStatus(opts) };
    } catch (err) {
      return { ok: false, results: [{ pluginId, action: "uninstall", ok: false, error: err.message }], logTail: getInstallLogTail(200, opts), status: await getAntigravityPluginsStatus(opts) };
    }
  });
}

function installSmartPack({ autoResolveConflicts = true, packIds = null, ...opts } = {}) {
  const env = detectEnvironment(opts);
  const targetIds = Array.isArray(packIds) && packIds.length > 0
    ? packIds.map((id) => assertValidPluginId(id).id)
    : resolveSmartPack(env);

  return withInstallMutex("smart-pack", async () => {
    const results = [];
    let allOk = true;
    for (const id of targetIds) {
      activeState.currentPluginId = id;
      try {
        results.push(await installSinglePlugin(id, { autoResolveConflicts, ...opts }));
      } catch (err) {
        allOk = false;
        results.push({ pluginId: id, action: "install", ok: false, error: err.message });
      }
    }
    return { ok: allOk, results, logTail: getInstallLogTail(200, opts), status: await getAntigravityPluginsStatus(opts) };
  });
}

function runDoctor({ pluginId = null, ...opts } = {}) {
  if (pluginId) assertValidPluginId(pluginId);
  return withInstallMutex(pluginId || "doctor", async () => {
    const paths = getPaths(opts);
    const runCmd = opts.runCmd || execSafeCommand;
    const status = await getAntigravityPluginsStatus(opts);
    const targets = pluginId ? status.plugins.filter((p) => p.id === pluginId) : status.plugins.filter((p) => p.installed);
    const results = [];
    let allOk = true;

    for (const p of targets) {
      if (!p.installed) {
        results.push({ pluginId: p.id, action: "doctor", ok: false, error: "Not installed" });
        allOk = false;
        continue;
      }
      try {
        if (p.id === "agy-dart" && fs.existsSync(path.join(paths.agyDartSrcDir, "scripts", "install.mjs"))) {
          await runCmd(process.execPath, [path.join(paths.agyDartSrcDir, "scripts", "install.mjs"), "doctor"], { logPath: paths.installLogPath });
        } else if (p.id === "codegraph" && fs.existsSync(paths.codegraphShimPath)) {
          await runCmd(process.execPath, [paths.codegraphShimPath, "--version"], { logPath: paths.installLogPath });
        }
        results.push({ pluginId: p.id, action: "doctor", ok: true, version: p.version, mcpConfigured: p.mcpConfigured, conflicts: p.activeConflicts });
      } catch (err) {
        allOk = false;
        results.push({ pluginId: p.id, action: "doctor", ok: false, error: err.message });
      }
    }
    return { ok: allOk, results, logTail: getInstallLogTail(200, opts), status };
  });
}

function parseArgs(argv) {
  const opts = {
    status: false,
    doctor: false,
    yes: false,
    autoResolveConflicts: true,
    pack: null,
    plugin: null,
    uninstall: null,
    help: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => {
      const v = argv[++i];
      if (v === undefined) throw new Error(`Missing value for ${a}`);
      return v;
    };
    if (a === "--status") opts.status = true;
    else if (a === "--doctor") opts.doctor = true;
    else if (a === "--yes" || a === "-y") opts.yes = true;
    else if (a === "--no-conflicts") opts.autoResolveConflicts = false;
    else if (a === "--pack") opts.pack = next();
    else if (a === "--plugin") opts.plugin = next();
    else if (a === "--uninstall") opts.uninstall = next();
    else if (a === "-h" || a === "--help") opts.help = true;
    else throw new Error(`Unknown option: ${a}`);
  }
  if (opts.pack && opts.pack !== "smart" && opts.pack !== "node20") {
    throw new Error(`Invalid --pack value "${opts.pack}" (expected: smart | node20)`);
  }
  if (opts.plugin) assertValidPluginId(opts.plugin);
  if (opts.uninstall) assertValidPluginId(opts.uninstall);
  return opts;
}

function printStatus(status) {
  const { env, smartPackIds, smartPackNote, plugins } = status;
  console.log("\n⚡ Antigravity Layer-2 Token-Saver Plugins");
  console.log(`   Node.js: ${env.nodeVersion} (${env.meetsAgyDartNode ? "agy-dart ready" : "Node 20 mode"})`);
  console.log(`   Python : ${env.pythonAvailable ? `${env.pythonVersion} (${env.pythonCommand})` : "Not found"}`);
  console.log(`   Config : ${env.configDir} (${env.antigravityDetected ? "Antigravity detected" : "will create on install"})`);
  console.log(`   Smart  : ${smartPackIds.join(" + ")}`);
  console.log(`   Note   : ${smartPackNote}\n`);

  for (const p of plugins) {
    const mark = p.installed ? "✅" : p.recommended ? "⭐" : "• ";
    const ver = p.version ? ` v${p.version}` : "";
    const rec = p.recommended ? " [Smart Pack]" : "";
    const mcp = (p.id === "codegraph" || p.id === "codebase-memory-mcp") ? ` (MCP:${p.mcpConfigured ? "ok" : "no"})` : "";
    const conflict = p.activeConflicts.length ? ` ⚠ conflicts: ${p.activeConflicts.join(",")}` : "";
    const unsup = !p.supported ? ` [${p.unsupportedReason}]` : "";
    console.log(`  ${mark} ${p.id.padEnd(20)} slot=${p.slot.padEnd(11)} ★${String(p.stars).padEnd(5)} ${p.license.padEnd(10)}${ver}${mcp}${rec}${conflict}${unsup}`);
  }
  console.log();
}

function printResults(res) {
  for (const r of res.results || []) {
    if (r.ok) {
      const conflictsMsg = r.resolvedConflicts?.length ? ` (removed conflicts: ${r.resolvedConflicts.join(", ")})` : "";
      console.log(`✅ ${r.pluginId}: ${r.action} ok${r.version ? ` v${r.version}` : ""}${conflictsMsg}`);
    } else {
      console.error(`❌ ${r.pluginId}: ${r.action} failed — ${r.error}`);
    }
  }
}

async function run(argv = []) {
  const opts = parseArgs(argv);
  if (opts.help) {
    console.log(HELP);
    return 0;
  }

  if (opts.status) {
    const status = await getAntigravityPluginsStatus();
    printStatus(status);
    return 0;
  }

  if (opts.doctor) {
    const res = await runDoctor();
    printResults(res);
    if (!res.results.length) console.log("• No Antigravity token-saver plugins currently installed.");
    return res.ok ? 0 : 1;
  }

  if (opts.uninstall) {
    console.log(`🧹 Uninstalling ${opts.uninstall}...`);
    const res = await uninstallPlugin(opts.uninstall);
    printResults(res);
    return res.ok ? 0 : 1;
  }

  if (opts.plugin) {
    console.log(`📦 Installing ${opts.plugin}...`);
    const res = await installPlugin(opts.plugin, { autoResolveConflicts: opts.autoResolveConflicts });
    printResults(res);
    return res.ok ? 0 : 1;
  }

  if (opts.pack) {
    const packIds = opts.pack === "node20" ? ["agy-fast", "context-mode", "codegraph"] : null;
    console.log(`⚡ Installing ${opts.pack} Antigravity Token Saver pack...`);
    const res = await installSmartPack({ autoResolveConflicts: opts.autoResolveConflicts, packIds });
    printResults(res);
    return res.ok ? 0 : 1;
  }

  if (opts.yes) {
    const status = await getAntigravityPluginsStatus();
    printStatus(status);
    console.log(`⚡ Installing Smart Pack (${status.smartPackIds.join(" + ")})...`);
    const res = await installSmartPack({ autoResolveConflicts: opts.autoResolveConflicts });
    printResults(res);
    return res.ok ? 0 : 1;
  }

  const status = await getAntigravityPluginsStatus();
  printStatus(status);

  if (!process.stdin.isTTY) {
    console.log("Run with --yes to install Smart Pack non-interactively, or --help for options.");
    return 0;
  }

  const { confirm } = require("../utils/input");
  const ok = await confirm(`Install Smart Pack (${status.smartPackIds.join(" + ")}) with automatic conflict resolution?`);
  if (!ok) {
    console.log("Cancelled.");
    return 0;
  }
  const res = await installSmartPack({ autoResolveConflicts: opts.autoResolveConflicts });
  printResults(res);
  return res.ok ? 0 : 1;
}

module.exports = {
  run,
  parseArgs,
  ANTIGRAVITY_PLUGIN_IDS,
  ANTIGRAVITY_PLUGIN_CATALOG,
  assertValidPluginId,
  resolveSmartPack,
  getSmartPackNote,
  findConflicts,
  detectEnvironment,
  getAntigravityPluginsStatus,
  installPlugin,
  uninstallPlugin,
  installSmartPack,
  runDoctor,
};
