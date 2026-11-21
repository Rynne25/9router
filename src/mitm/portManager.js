const { exec, execSync } = require("child_process");
const net = require("net");
const { isSudoAvailable } = require("./dns/dnsConfig");
const { LSOF_BIN } = require("./config");

const IS_WIN = process.platform === "win32";
const MITM_PORT = 443;

function isProcessAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return err.code === "EACCES";
  }
}

function killProcess(pid, force = false, sudoPassword = null) {
  if (IS_WIN) {
    const flag = force ? "/F " : "";
    exec(`taskkill ${flag}/PID ${pid}`, { windowsHide: true }, () => {});
  } else {
    const sig = force ? "SIGKILL" : "SIGTERM";
    const cmd = `pkill -${sig} -P ${pid} 2>/dev/null; kill -${sig} ${pid} 2>/dev/null`;
    if (sudoPassword || isSudoAvailable()) {
      const { execWithPassword } = require("./dns/dnsConfig");
      execWithPassword(cmd, sudoPassword || "").catch(() => exec(cmd, { windowsHide: true }, () => {}));
    } else {
      exec(cmd, { windowsHide: true }, () => {});
    }
  }
}

function getProcessUsingPort443() {
  try {
    if (IS_WIN) {
      const psCmd = `powershell -NonInteractive -WindowStyle Hidden -Command ` +
        `"$c = Get-NetTCPConnection -LocalPort 443 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1; if ($c) { $c.OwningProcess } else { 0 }"`;
      const pidStr = execSync(psCmd, { encoding: "utf8", windowsHide: true }).trim();
      const pid = parseInt(pidStr, 10);
      if (pid && pid > 4) {
        const tasklistResult = execSync(`tasklist /FI "PID eq ${pid}" /FO CSV /NH`, { encoding: "utf8", windowsHide: true });
        const processMatch = tasklistResult.match(/"([^"]+)"/);
        if (processMatch) return processMatch[1].replace(".exe", "");
      }
    } else {
      const result = execSync(`${LSOF_BIN} -i :443`, { encoding: "utf8", windowsHide: true });
      const lines = result.trim().split("\n");
      if (lines.length > 1) return lines[1].split(/\s+/)[0];
    }
  } catch {
    return null;
  }
  return null;
}

function checkPort443Free(port = MITM_PORT) {
  return new Promise((resolve) => {
    const tester = net.createServer();
    tester.once("error", (err) => {
      if (err.code === "EADDRINUSE") resolve("in-use");
      else resolve("no-permission");
    });
    tester.once("listening", () => { tester.close(() => resolve("free")); });
    tester.listen(port, "127.0.0.1");
  });
}

function getPort443Owner(sudoPassword) {
  return new Promise((resolve) => {
    if (IS_WIN) {
      const psCmd = `powershell -NonInteractive -WindowStyle Hidden -Command "` +
        `$c = Get-NetTCPConnection -LocalPort 443 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1; ` +
        `if ($c) { $c.OwningProcess } else { 0 }"`;
      exec(psCmd, { windowsHide: true }, (err, stdout) => {
        if (err) return resolve(null);
        const pid = parseInt(stdout.trim(), 10);
        if (!pid || pid <= 4) return resolve(null);
        exec(`tasklist /FI "PID eq ${pid}" /FO CSV /NH`, { windowsHide: true }, (e2, out2) => {
          const m = out2?.match(/"([^"]+)"/);
          resolve({ pid, name: m ? m[1] : "unknown" });
        });
      });
    } else {
      exec(`${LSOF_BIN} -nP -iTCP:443 -sTCP:LISTEN -t`, { windowsHide: true }, (err, stdout) => {
        if (err || !stdout?.trim()) return resolve(null);
        const pid = parseInt(stdout.trim().split("\n")[0], 10);
        if (!pid || isNaN(pid)) return resolve(null);
        exec(`ps -p ${pid} -o comm=`, { windowsHide: true }, (e2, out2) => {
          resolve({ pid, name: (out2?.trim() || "unknown") });
        });
      });
    }
  });
}

async function killPort443Owner(owner, sudoPassword) {
  if (!owner || !owner.pid) return;
  if (IS_WIN) {
    try {
      execSync(`powershell -NonInteractive -WindowStyle Hidden -Command "Stop-Process -Id ${owner.pid} -Force -ErrorAction SilentlyContinue"`, { windowsHide: true });
    } catch { /* best effort */ }
  } else {
    try {
      const { execWithPassword } = require("./dns/dnsConfig");
      if (sudoPassword || isSudoAvailable()) {
        await execWithPassword(`kill -9 ${owner.pid}`, sudoPassword || "");
      } else {
        execSync(`kill -9 ${owner.pid}`, { windowsHide: true });
      }
    } catch { /* best effort */ }
  }
  await new Promise(r => setTimeout(r, 800));
}

module.exports = {
  isProcessAlive,
  killProcess,
  getProcessUsingPort443,
  checkPort443Free,
  getPort443Owner,
  killPort443Owner,
};
