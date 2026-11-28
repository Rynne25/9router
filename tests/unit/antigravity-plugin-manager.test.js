import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

import {
  ANTIGRAVITY_PLUGIN_ALLOWLIST,
  ANTIGRAVITY_PLUGIN_CATALOG,
  ANTIGRAVITY_PLUGIN_IDS,
  assertValidPluginId,
  findConflicts,
  getPluginById,
  getSmartPackNote,
  meetsMinNode,
  parseNodeTuple,
  resolveSmartPack,
} from "../../src/lib/antigravity/pluginCatalog.js";

import {
  detectEnvironment,
  execSafeCommand,
  getAntigravityPluginsStatus,
  getInstallLogTail,
  getPaths,
  installPlugin,
  installSmartPack,
  runDoctor,
  uninstallPlugin,
} from "../../src/lib/antigravity/pluginManager.js";

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../..");
const setupSaver = require("../../cli/src/cli/commands/setupSaver.js");

function makeSandbox(label) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `9router-agy-test-${label}-`));
  const homeDir = path.join(root, "home");
  const dataDir = path.join(root, "data");
  fs.mkdirSync(path.join(homeDir, ".gemini", "config", "plugins"), { recursive: true });
  fs.mkdirSync(dataDir, { recursive: true });
  return { root, homeDir, dataDir };
}

function cleanupSandbox(root) {
  try {
    fs.rmSync(root, { recursive: true, force: true });
  } catch {}
}

test("pluginCatalog exposes strict allowlist of 6 plugins with required metadata", () => {
  assert.deepEqual(ANTIGRAVITY_PLUGIN_IDS, [
    "agy-dart",
    "agy-fast",
    "context-mode",
    "codegraph",
    "codebase-memory-mcp",
    "mcptoon",
  ]);
  assert.equal(ANTIGRAVITY_PLUGIN_ALLOWLIST.size, 6);
  assert.equal(ANTIGRAVITY_PLUGIN_CATALOG.length, 6);

  const dart = getPluginById("agy-dart");
  assert.equal(dart.repo, "zou172866/Antigravity-agy-dart");
  assert.equal(dart.stars, 239);
  assert.equal(dart.license, "MIT");
  assert.equal(dart.slot, "context");
  assert.deepEqual(dart.conflictsWith, ["agy-fast", "context-mode"]);
  assert.deepEqual(dart.minNode, [22, 16]);
  assert.equal(dart.requiresPython, false);

  const mcptoon = getPluginById("mcptoon");
  assert.equal(mcptoon.license, "Apache-2.0");
  assert.equal(mcptoon.requiresPython, true);
  assert.equal(mcptoon.slot, "mcp-gateway");
});

test("assertValidPluginId rejects injection payloads and unknown IDs", () => {
  const badIds = [
    "",
    null,
    undefined,
    123,
    "unknown-plugin",
    "agy-dart && calc",
    "agy-dart; rm -rf /",
    "$(whoami)",
    "../etc/passwd",
  ];
  for (const id of badIds) {
    assert.throws(() => assertValidPluginId(id), { code: "INVALID_PLUGIN_ID" });
  }
});

test("resolveSmartPack picks agy-dart + codegraph on Node >= 22.16 and Node 20 fallback below", () => {
  assert.deepEqual(parseNodeTuple("v24.15.0"), [24, 15]);
  assert.deepEqual(parseNodeTuple("v22.16.0"), [22, 16]);
  assert.equal(meetsMinNode("v22.16.0", [22, 16]), true);
  assert.equal(meetsMinNode("v22.15.9", [22, 16]), false);

  assert.deepEqual(resolveSmartPack({ nodeVersion: "v24.15.0" }), ["agy-dart", "codegraph"]);
  assert.deepEqual(resolveSmartPack({ nodeVersion: "v22.16.0" }), ["agy-dart", "codegraph"]);
  assert.deepEqual(resolveSmartPack({ nodeVersion: "v22.15.0" }), ["agy-fast", "context-mode", "codegraph"]);
  assert.deepEqual(resolveSmartPack({ nodeVersion: "v20.18.1" }), ["agy-fast", "context-mode", "codegraph"]);

  assert.match(getSmartPackNote({ nodeVersion: "v24.15.0" }), /agy-dart \+ codegraph/);
  assert.match(getSmartPackNote({ nodeVersion: "v20.18.1" }), /agy-fast \+ context-mode \+ codegraph/);
});

test("findConflicts detects symmetric slot conflicts cleanly", () => {
  assert.deepEqual(findConflicts("agy-dart", ["agy-fast", "codegraph"]).sort(), ["agy-fast"]);
  assert.deepEqual(findConflicts("agy-dart", ["agy-fast", "context-mode"]).sort(), ["agy-fast", "context-mode"]);
  assert.deepEqual(findConflicts("agy-fast", ["agy-dart", "context-mode"]), ["agy-dart"]);
  assert.deepEqual(findConflicts("codegraph", ["codebase-memory-mcp"]), ["codebase-memory-mcp"]);
  assert.deepEqual(findConflicts("codebase-memory-mcp", ["codegraph"]), ["codegraph"]);
  assert.deepEqual(findConflicts("mcptoon", ["agy-dart", "codegraph"]), []);
});

test("setupSaver.js is standalone CommonJS with zero src/ imports and matches pluginCatalog", () => {
  const setupSaverSrc = fs.readFileSync(path.join(repoRoot, "cli", "src", "cli", "commands", "setupSaver.js"), "utf8");
  assert.equal(/\bfrom\s+["'].*src\//.test(setupSaverSrc), false);
  assert.equal(/require\(["'].*src\//.test(setupSaverSrc), false);

  assert.deepEqual([...setupSaver.ANTIGRAVITY_PLUGIN_IDS], [...ANTIGRAVITY_PLUGIN_IDS]);
  assert.equal(setupSaver.ANTIGRAVITY_PLUGIN_CATALOG.length, ANTIGRAVITY_PLUGIN_CATALOG.length);

  for (const esmPlugin of ANTIGRAVITY_PLUGIN_CATALOG) {
    const cjsPlugin = setupSaver.ANTIGRAVITY_PLUGIN_CATALOG.find((p) => p.id === esmPlugin.id);
    assert.ok(cjsPlugin, `Missing ${esmPlugin.id} in setupSaver catalog`);
    assert.equal(cjsPlugin.repo, esmPlugin.repo);
    assert.equal(cjsPlugin.stars, esmPlugin.stars);
    assert.equal(cjsPlugin.license, esmPlugin.license);
    assert.equal(cjsPlugin.slot, esmPlugin.slot);
    assert.deepEqual([...cjsPlugin.conflictsWith], [...esmPlugin.conflictsWith]);
    assert.deepEqual([...cjsPlugin.minNode], [...esmPlugin.minNode]);
    assert.equal(cjsPlugin.requiresPython, esmPlugin.requiresPython);
  }

  assert.deepEqual(setupSaver.resolveSmartPack({ nodeVersion: "v24.15.0" }), resolveSmartPack({ nodeVersion: "v24.15.0" }));
  assert.deepEqual(setupSaver.resolveSmartPack({ nodeVersion: "v20.18.1" }), resolveSmartPack({ nodeVersion: "v20.18.1" }));
});

test("execSafeCommand rejects unsafe shell metacharacters in arguments", async () => {
  await assert.rejects(
    () => execSafeCommand(process.execPath, ["-e", "console.log(1) && calc"]),
    /Refusing unsafe command argument/
  );
  await assert.rejects(
    () => execSafeCommand(process.execPath, ["foo|bar"]),
    /Refusing unsafe command argument/
  );
});

test("detectPluginState and getAntigravityPluginsStatus accurately reflect installed plugins and MCP wiring", async () => {
  const sb = makeSandbox("detect");
  try {
    const paths = getPaths({ homeDir: sb.homeDir, dataDir: sb.dataDir });

    // Simulate agy-fast + codegraph installed (without global codegraph binary lookup)
    const fastDir = path.join(paths.geminiPluginsDir, "agy-fast");
    fs.mkdirSync(fastDir, { recursive: true });
    fs.writeFileSync(path.join(fastDir, "plugin.json"), JSON.stringify({ name: "agy-fast", version: "0.3.2" }));

    const cgPkgDir = path.dirname(paths.codegraphPkgJson);
    fs.mkdirSync(cgPkgDir, { recursive: true });
    fs.writeFileSync(paths.codegraphPkgJson, JSON.stringify({ name: "@colbymchenry/codegraph", version: "1.6.5" }));
    fs.writeFileSync(paths.unifiedMcpConfigPath, JSON.stringify({
      mcpServers: {
        codegraph: { command: process.execPath, args: [paths.codegraphShimPath, "serve", "--mcp"] },
      },
    }));

    const status = await getAntigravityPluginsStatus({
      homeDir: sb.homeDir,
      dataDir: sb.dataDir,
      nodeVersion: "v24.15.0",
      npmPath: "npm",
      tarPath: "tar",
      python: { available: true, command: "python", version: "3.14.0" },
      skipBinLookup: true,
    });

    assert.deepEqual(status.smartPackIds, ["agy-dart", "codegraph"]);
    const byId = Object.fromEntries(status.plugins.map((p) => [p.id, p]));
    assert.equal(byId["agy-fast"].installed, true);
    assert.equal(byId["agy-fast"].version, "0.3.2");
    assert.equal(byId["agy-dart"].installed, false);
    assert.deepEqual(byId["agy-dart"].activeConflicts, ["agy-fast"]);
    assert.equal(byId["codegraph"].installed, true);
    assert.equal(byId["codegraph"].mcpConfigured, true);
    assert.equal(byId["codegraph"].version, "1.6.5");
  } finally {
    cleanupSandbox(sb.root);
  }
});

test("installPlugin auto-resolves conflicts before installing agy-dart and logs actions", async () => {
  const sb = makeSandbox("conflict");
  try {
    const paths = getPaths({ homeDir: sb.homeDir, dataDir: sb.dataDir });

    // Pre-install conflicting agy-fast & context-mode
    const fastDir = path.join(paths.geminiPluginsDir, "agy-fast");
    const ctxDir = path.join(paths.geminiPluginsDir, "context-mode");
    fs.mkdirSync(fastDir, { recursive: true });
    fs.mkdirSync(ctxDir, { recursive: true });
    fs.writeFileSync(path.join(fastDir, "plugin.json"), JSON.stringify({ name: "agy-fast", version: "0.3.2" }));
    fs.writeFileSync(path.join(ctxDir, "plugin.json"), JSON.stringify({ name: "context-mode", version: "2.0.1" }));

    const mockOpts = {
      homeDir: sb.homeDir,
      dataDir: sb.dataDir,
      nodeVersion: "v24.15.0",
      npmPath: "npm",
      tarPath: "tar",
      python: { available: false, command: null, version: null },
      skipBinLookup: true,
      fetchFn: async (url) => {
        if (url.includes("releases/latest")) {
          return new Response(JSON.stringify({ tarball_url: "https://example.test/agy-dart.tar.gz" }), { status: 200 });
        }
        return new Response("fake-tarball-bytes", { status: 200 });
      },
      runCmd: async (cmd, args) => {
        if (cmd === "tar") {
          const installDir = path.join(paths.agyDartSrcDir, "scripts");
          fs.mkdirSync(installDir, { recursive: true });
          fs.writeFileSync(path.join(installDir, "install.mjs"), "// mock");
        } else if (cmd === process.execPath && args[1] === "install") {
          const dartDir = path.join(paths.geminiPluginsDir, "agy-dart");
          fs.mkdirSync(dartDir, { recursive: true });
          fs.writeFileSync(path.join(dartDir, "plugin.json"), JSON.stringify({ name: "agy-dart", version: "1.10.0" }));
          fs.writeFileSync(path.join(dartDir, "mcp_config.json"), "{}");
        }
        return { code: 0, stdout: "ok", stderr: "" };
      },
    };

    // With autoResolveConflicts: false, installing agy-dart must fail
    const blocked = await installPlugin("agy-dart", { ...mockOpts, autoResolveConflicts: false });
    assert.equal(blocked.ok, false);
    assert.match(blocked.results[0].error, /Conflict detected for agy-dart/);

    // With autoResolveConflicts: true, agy-fast & context-mode are uninstalled cleanly
    const okRes = await installPlugin("agy-dart", { ...mockOpts, autoResolveConflicts: true });
    assert.equal(okRes.ok, true);
    assert.deepEqual(okRes.results[0].resolvedConflicts.sort(), ["agy-fast", "context-mode"]);
    assert.equal(fs.existsSync(fastDir), false);
    assert.equal(fs.existsSync(ctxDir), false);
    assert.equal(fs.existsSync(path.join(paths.geminiPluginsDir, "agy-dart", "plugin.json")), true);

    const logTail = getInstallLogTail(50, mockOpts);
    assert.match(logTail, /Auto-resolving conflict: uninstalling agy-fast/);
    assert.match(logTail, /Auto-resolving conflict: uninstalling context-mode/);
  } finally {
    cleanupSandbox(sb.root);
  }
});

test("installSmartPack wires codegraph local shim into Antigravity mcp_config.json and serializes mutex", async () => {
  const sb = makeSandbox("smartpack");
  try {
    const paths = getPaths({ homeDir: sb.homeDir, dataDir: sb.dataDir });
    const timeline = [];

    const mockOpts = {
      homeDir: sb.homeDir,
      dataDir: sb.dataDir,
      nodeVersion: "v24.15.0",
      npmPath: "npm",
      tarPath: "tar",
      python: { available: false, command: null, version: null },
      skipBinLookup: true,
      fetchFn: async (url) => {
        if (url.includes("releases/latest")) {
          return new Response(JSON.stringify({ tarball_url: "https://example.test/agy-dart.tar.gz" }), { status: 200 });
        }
        return new Response("fake-tarball", { status: 200 });
      },
      runCmd: async (cmd, args) => {
        timeline.push(`start:${path.basename(cmd)}:${args[0]}`);
        await new Promise((r) => setTimeout(r, 15));
        if (cmd === "tar") {
          fs.mkdirSync(path.join(paths.agyDartSrcDir, "scripts"), { recursive: true });
          fs.writeFileSync(path.join(paths.agyDartSrcDir, "scripts", "install.mjs"), "// mock");
        } else if (cmd === process.execPath && args[0].endsWith("install.mjs") && args[1] === "install") {
          const dartDir = path.join(paths.geminiPluginsDir, "agy-dart");
          fs.mkdirSync(dartDir, { recursive: true });
          fs.writeFileSync(path.join(dartDir, "plugin.json"), JSON.stringify({ name: "agy-dart", version: "1.10.0" }));
        } else if (cmd === "npm" && args[0] === "install") {
          fs.mkdirSync(path.dirname(paths.codegraphPkgJson), { recursive: true });
          fs.writeFileSync(paths.codegraphPkgJson, JSON.stringify({ name: "@colbymchenry/codegraph", version: "1.6.5" }));
          fs.writeFileSync(paths.codegraphShimPath, "// mock shim");
        } else if (cmd === process.execPath && args[0] === paths.codegraphShimPath && args[1] === "install") {
          fs.mkdirSync(path.dirname(paths.unifiedMcpConfigPath), { recursive: true });
          fs.writeFileSync(paths.unifiedMcpConfigPath, JSON.stringify({
            mcpServers: { codegraph: { command: "codegraph", args: ["serve", "--mcp"] } },
          }));
        }
        timeline.push(`end:${path.basename(cmd)}:${args[0]}`);
        return { code: 0, stdout: "ok", stderr: "" };
      },
    };

    const [smartRes, doctorRes] = await Promise.all([
      installSmartPack(mockOpts),
      runDoctor(mockOpts),
    ]);

    assert.equal(smartRes.ok, true);
    assert.deepEqual(smartRes.results.map((r) => r.pluginId), ["agy-dart", "codegraph"]);
    assert.equal(doctorRes.ok, true);

    const mcpCfg = JSON.parse(fs.readFileSync(paths.unifiedMcpConfigPath, "utf8"));
    assert.equal(mcpCfg.mcpServers.codegraph.command, process.execPath);
    assert.deepEqual(mcpCfg.mcpServers.codegraph.args, [paths.codegraphShimPath, "serve", "--mcp"]);

    // Verify uninstall cleans codegraph MCP entry + prefix dir
    const unRes = await uninstallPlugin("codegraph", mockOpts);
    assert.equal(unRes.ok, true);
    const mcpAfter = JSON.parse(fs.readFileSync(paths.unifiedMcpConfigPath, "utf8"));
    assert.equal(mcpAfter.mcpServers.codegraph, undefined);
    assert.equal(fs.existsSync(paths.codegraphPrefixDir), false);

    // Ensure mutex serialized start/end pairs without interleaving
    for (let i = 0; i < timeline.length; i += 2) {
      assert.match(timeline[i], /^start:/);
      assert.match(timeline[i + 1], /^end:/);
    }
  } finally {
    cleanupSandbox(sb.root);
  }
});

test("CLI setupSaver parseArgs handles all flags and validates allowlist", () => {
  assert.deepEqual(setupSaver.parseArgs(["--status"]), {
    status: true,
    doctor: false,
    yes: false,
    autoResolveConflicts: true,
    pack: null,
    plugin: null,
    uninstall: null,
    help: false,
  });

  const p = setupSaver.parseArgs(["--pack", "node20", "--yes", "--no-conflicts"]);
  assert.equal(p.pack, "node20");
  assert.equal(p.yes, true);
  assert.equal(p.autoResolveConflicts, false);

  const single = setupSaver.parseArgs(["--plugin", "codegraph"]);
  assert.equal(single.plugin, "codegraph");

  assert.throws(() => setupSaver.parseArgs(["--plugin", "evil;rm"]), { code: "INVALID_PLUGIN_ID" });
  assert.throws(() => setupSaver.parseArgs(["--pack", "invalid"]), /Invalid --pack/);
  assert.throws(() => setupSaver.parseArgs(["--bogus"]), /Unknown option/);
});

test("detectEnvironment reports coherent runtime fields", () => {
  const env = detectEnvironment();
  assert.equal(typeof env.nodeVersion, "string");
  assert.equal(typeof env.nodeMajor, "number");
  assert.equal(typeof env.meetsAgyDartNode, "boolean");
  assert.equal(typeof env.pythonAvailable, "boolean");
});
