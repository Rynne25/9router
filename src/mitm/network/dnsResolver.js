const dns = require("dns");
const tls = require("tls");
const { promisify } = require("util");
const { log, err } = require("../logger");

const STALE_REVALIDATE_MS = 20 * 60 * 1000; // 20 minutes
const GOOGLE_ANYCAST_IPS = [
  "172.217.114.4",
  "142.250.190.10",
  "142.251.46.234",
  "142.250.72.106",
  "172.217.168.202"
];

const cachedTargetIPs = {};
let cachedSystemDnsServers = ["1.1.1.1", "8.8.8.8", "8.8.4.4", "1.0.0.1"];
const activeResolutions = new Map();

function refreshSystemDnsServersAsync() {
  try {
    const defaultServers = dns.getServers?.() || [];
    const servers = [];
    for (const s of defaultServers) {
      if (s && !s.startsWith("127.") && s !== "::1") servers.push(s);
    }
    for (const fallback of ["1.1.1.1", "8.8.8.8", "8.8.4.4", "1.0.0.1"]) {
      if (!servers.includes(fallback)) servers.push(fallback);
    }
    cachedSystemDnsServers = servers;
  } catch {}

  if (process.platform === "win32") {
    const { exec } = require("child_process");
    exec('powershell -NoProfile -Command "(Get-DnsClientServerAddress -AddressFamily IPv4).ServerAddresses"', { timeout: 3000, windowsHide: true }, (error, stdout) => {
      if (!error && stdout) {
        const found = stdout.split(/\r?\n/).map(s => s.trim()).filter(ip => ip && !ip.startsWith("127.") && !cachedSystemDnsServers.includes(ip));
        if (found.length > 0) {
          cachedSystemDnsServers = [...found, ...cachedSystemDnsServers];
        }
      }
    });
  }
}

refreshSystemDnsServersAsync();
const dnsRefreshTimer = setInterval(refreshSystemDnsServersAsync, 30 * 60 * 1000);
if (dnsRefreshTimer.unref) dnsRefreshTimer.unref();

async function _performResolve(hostname) {
  for (const srv of cachedSystemDnsServers) {
    try {
      const resolver = new dns.Resolver();
      resolver.setServers([srv]);
      const resolve4 = promisify(resolver.resolve4.bind(resolver));
      const addresses = await Promise.race([
        resolve4(hostname),
        new Promise((_, reject) => setTimeout(() => reject(new Error("DNS timeout")), 1500)),
      ]);
      if (addresses && addresses.length > 0) {
        cachedTargetIPs[hostname] = { ip: addresses[0], ts: Date.now() };
        return addresses[0];
      }
    } catch {}
  }

  if (hostname.includes("googleapis.com")) {
    const googleFallbackIP = GOOGLE_ANYCAST_IPS[0];
    cachedTargetIPs[hostname] = { ip: googleFallbackIP, ts: Date.now() };
    return googleFallbackIP;
  }

  throw new Error(`Failed to resolve IP for ${hostname} across all DNS servers`);
}

async function resolveTargetIP(hostname) {
  const cached = cachedTargetIPs[hostname];
  const now = Date.now();

  if (cached) {
    if (now - cached.ts > STALE_REVALIDATE_MS && !activeResolutions.has(hostname)) {
      const p = _performResolve(hostname).catch(() => {}).finally(() => activeResolutions.delete(hostname));
      activeResolutions.set(hostname, p);
    }
    return cached.ip;
  }

  if (activeResolutions.has(hostname)) {
    return activeResolutions.get(hostname);
  }

  const resolvePromise = _performResolve(hostname).finally(() => activeResolutions.delete(hostname));
  activeResolutions.set(hostname, resolvePromise);
  return resolvePromise;
}

const alpnCache = new Map([
  ["daily-cloudcode-pa.googleapis.com", "h2"],
  ["cloudcode-pa.googleapis.com", "h2"],
  ["api.individual.githubcopilot.com", "h2"],
  ["runtime.us-east-1.kiro.dev", "http/1.1"],
  ["q.us-east-1.amazonaws.com", "http/1.1"],
  ["codewhisperer.us-east-1.amazonaws.com", "http/1.1"],
  ["api2.cursor.sh", "http/1.1"],
]);

const REJECT_UNAUTHORIZED = process.env.STRICT_SSL !== "false" && process.env.MITM_INSECURE_UPSTREAM !== "true";

async function negotiateAlpn(host) {
  if (alpnCache.has(host)) return alpnCache.get(host);
  const ip = await resolveTargetIP(host);
  return new Promise((resolve, reject) => {
    const socket = tls.connect({
      host: ip, port: 443, servername: host,
      ALPNProtocols: ["h2", "http/1.1"], rejectUnauthorized: REJECT_UNAUTHORIZED,
    }, () => {
      const proto = socket.alpnProtocol || "http/1.1";
      alpnCache.set(host, proto);
      log(`🔗 [mitm] ALPN ${host} → ${proto}`);
      socket.end();
      resolve(proto);
    });
    socket.once("error", reject);
    socket.setTimeout(5000, () => { socket.destroy(new Error("ALPN timeout")); });
  });
}

module.exports = {
  resolveTargetIP,
  negotiateAlpn,
  REJECT_UNAUTHORIZED,
};
