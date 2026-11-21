const https = require("https");
const fs = require("fs");
const path = require("path");
const { log } = require("./logger");
const { MITM_DIR } = require("./paths");

const MITM_PORT = 443;
const LOCK_FILE = path.join(MITM_DIR, ".mitm.lock");
const MITM_WATCHDOG_INTERVAL_MS = 30000;

let mitmWatchdogTimer = null;
let lastMitmApiKey = null;

function pollMitmHealth(timeoutMs, port = MITM_PORT) {
  return new Promise((resolve) => {
    const deadline = Date.now() + timeoutMs;
    const check = () => {
      const req = https.request(
        { hostname: "127.0.0.1", port, path: "/_mitm_health", method: "GET", rejectUnauthorized: false },
        (res) => {
          let body = "";
          res.on("data", (d) => { body += d; });
          res.on("end", () => {
            try {
              const json = JSON.parse(body);
              resolve(json.ok === true ? { ok: true, pid: json.pid || null } : null);
            } catch { resolve(null); }
          });
        }
      );
      req.on("error", () => {
        if (Date.now() < deadline) setTimeout(check, 500);
        else resolve(null);
      });
      req.end();
    };
    check();
  });
}

function stopMitmWatchdog() {
  if (mitmWatchdogTimer) {
    clearInterval(mitmWatchdogTimer);
    mitmWatchdogTimer = null;
  }
}

function startMitmWatchdog(apiKey, isRestartingFn, getSettingsFn, onUnresponsive) {
  if (apiKey) lastMitmApiKey = apiKey;
  if (mitmWatchdogTimer) return;

  mitmWatchdogTimer = setInterval(async () => {
    if (isRestartingFn() || fs.existsSync(LOCK_FILE)) return;
    try {
      const settings = getSettingsFn ? await getSettingsFn() : null;
      if (settings && !settings.mitmEnabled) {
        stopMitmWatchdog();
        return;
      }
      const health = await pollMitmHealth(2000, MITM_PORT);
      if (!health && !isRestartingFn() && !fs.existsSync(LOCK_FILE)) {
        const keyToUse = lastMitmApiKey || apiKey || "sk_9router";
        log("⚠️ MITM watchdog: server unresponsive on port 443, triggering auto-restart...");
        if (typeof onUnresponsive === "function") {
          onUnresponsive(keyToUse);
        }
      }
    } catch {
      // Never crash the parent process from watchdog tick
    }
  }, MITM_WATCHDOG_INTERVAL_MS);

  if (mitmWatchdogTimer.unref) {
    mitmWatchdogTimer.unref();
  }
}

module.exports = {
  pollMitmHealth,
  startMitmWatchdog,
  stopMitmWatchdog,
};
