import crypto from "crypto";
import { homedir, tmpdir, platform as getOsPlatform } from "os";
import { join, dirname } from "path";
import { existsSync, mkdirSync, readFileSync, writeFileSync, copyFileSync, unlinkSync } from "fs";
import { execFile, spawn } from "child_process";
import { promisify } from "util";
import { exchangeRefreshToken } from "./antigravityOAuth.js";
import { buildOauthTokenPayload, buildUserStatusPayload, buildEnterprisePreferencesPayload } from "./antigravityProtobuf.js";
import { getCandidateDbPaths, decodeOauthToken } from "./dbScanner.js";
import { KEYRING_TARGET, runPowerShellScript, writeSystemKeyring, readSystemKeyring } from "./antigravityKeyring.js";

const execFileAsync = promisify(execFile);

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
    (cmd.includes("--user-data-dir") && cmd.includes("antigravity ide"))
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
