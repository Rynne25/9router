import os from "os";
import { exec } from "child_process";
import { getSettings, updateSettings } from "@/lib/db/repos/settingsRepo.js";
import { getOrCreateSyncToken, executePullSync } from "./syncService.js";
import { getConsistentMachineId, isMasterReceiverMachine } from "@/shared/utils/machineId";

let _discoveryInterval = null;
let _cachedPeers = [];
let _isScanning = false;

/**
 * Check if an IP address belongs to a private / local network.
 */
export function isPrivateOrLocalIp(ip) {
  if (!ip || typeof ip !== "string") return false;
  const clean = ip.replace(/^::ffff:/, "").trim().toLowerCase();
  if (clean === "localhost" || clean === "127.0.0.1" || clean === "::1") return true;

  // 10.0.0.0 - 10.255.255.255
  if (clean.startsWith("10.")) return true;
  // 192.168.0.0 - 192.168.255.255
  if (clean.startsWith("192.168.")) return true;
  // 172.16.0.0 - 172.31.255.255
  const parts = clean.split(".");
  if (parts.length === 4 && parts[0] === "172") {
    const second = parseInt(parts[1], 10);
    if (second >= 16 && second <= 31) return true;
  }
  // Tailscale 100.64.0.0/10 (100.64.0.0 - 100.127.255.255)
  if (parts.length === 4 && parts[0] === "100") {
    const second = parseInt(parts[1], 10);
    if (second >= 64 && second <= 127) return true;
  }

  return false;
}

/**
 * Extract candidate LAN/WLAN/Tailscale IPv4 addresses from local interfaces.
 */
export function getLocalInterfaceIps() {
  const interfaces = os.networkInterfaces();
  const ips = [];
  for (const list of Object.values(interfaces)) {
    if (!list) continue;
    for (const iface of list) {
      if (iface.family === "IPv4" && !iface.internal) {
        ips.push(iface.address);
      }
    }
  }
  return ips;
}

/**
 * Parse ARP table using `arp -a` to get active devices on the local subnet.
 */
function getArpTableIps() {
  return new Promise((resolve) => {
    exec("arp -a", { timeout: 3000, windowsHide: true }, (err, stdout) => {
      if (err || !stdout) return resolve([]);
      const ips = new Set();
      // Match IPv4 addresses in ARP output
      const regex = /(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})/g;
      let match;
      while ((match = regex.exec(stdout)) !== null) {
        const ip = match[1];
        if (
          isPrivateOrLocalIp(ip) &&
          !ip.endsWith(".255") &&
          !ip.startsWith("224.") &&
          !ip.startsWith("239.") &&
          !ip.startsWith("255.")
        ) {
          ips.add(ip);
        }
      }
      resolve(Array.from(ips));
    });
  });
}

/**
 * Probe a candidate IP on port 20128 to see if 9Router is running.
 */
async function probePeer(ip, port = 20128, timeoutMs = 1200) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(`http://${ip}:${port}/api/sync/discovery`, {
      method: "GET",
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });

    if (res.ok) {
      const data = await res.json();
      if (data && data.service === "9router") {
        return {
          ip,
          port,
          url: `http://${ip}:${port}`,
          hostname: data.hostname || "9Router Peer",
          machineId: data.machineId || null,
          version: data.version || "unknown",
          accountsCount: data.accountsCount || 0,
          autoSyncToken: data.autoSyncToken || null,
          discoveredAt: new Date().toISOString(),
          online: true,
        };
      }
    }
  } catch {
    // Peer not running or timeout
  } finally {
    clearTimeout(timer);
  }
  return null;
}

/**
 * Discover all other 9Router instances currently active on the local network.
 */
export async function discoverLanPeers(port = 20128) {
  if (_isScanning) return _cachedPeers;
  _isScanning = true;

  try {
    const ownIps = new Set([...getLocalInterfaceIps(), "127.0.0.1", "localhost"]);
    const ownMachineId = await getConsistentMachineId("9r-lan-discovery");

    // Gather candidate IPs from ARP table and common subnet offsets
    const candidateIps = new Set(await getArpTableIps());

    // Also probe neighboring IPs for each local IPv4 interface
    for (const ownIp of getLocalInterfaceIps()) {
      const parts = ownIp.split(".");
      if (parts.length === 4) {
        const prefix = `${parts[0]}.${parts[1]}.${parts[2]}`;
        const currentHost = parseInt(parts[3], 10);
        // Probe immediate adjacent hosts
        for (let i = Math.max(1, currentHost - 10); i <= Math.min(254, currentHost + 10); i++) {
          candidateIps.add(`${prefix}.${i}`);
        }
      }
    }

    // Filter out our own IP addresses
    const targets = Array.from(candidateIps).filter((ip) => !ownIps.has(ip));

    // Concurrently probe all targets in batches of 20
    const peers = [];
    const BATCH_SIZE = 20;
    for (let i = 0; i < targets.length; i += BATCH_SIZE) {
      const batch = targets.slice(i, i + BATCH_SIZE);
      const results = await Promise.all(batch.map((ip) => probePeer(ip, port)));
      for (const res of results) {
        if (res && res.machineId !== ownMachineId) {
          peers.push(res);
        }
      }
    }

    _cachedPeers = peers;
    return peers;
  } catch (err) {
    console.error("[PeerDiscovery] Scan failed:", err.message);
    return _cachedPeers;
  } finally {
    _isScanning = false;
  }
}

/**
 * Automatically find peers and pull accounts with ZERO user intervention.
 */
export async function autoSyncFromDiscoveredPeers() {
  try {
    const isReceiver = await isMasterReceiverMachine();
    if (!isReceiver) {
      return null;
    }

    const settings = await getSettings();
    if (settings.syncAutoDiscoveryEnabled === false) {
      return null;
    }

    const peers = await discoverLanPeers();
    if (peers.length === 0) {
      return null;
    }

    // Connect to the primary discovered peer that has available accounts
    const targetPeer = peers.find((p) => p.autoSyncToken && p.accountsCount > 0) || peers[0];
    if (!targetPeer || !targetPeer.autoSyncToken) {
      return null;
    }

    console.log(`[AutoDiscovery] Auto-syncing from discovered 9Router peer: ${targetPeer.hostname} (${targetPeer.url})`);

    const result = await executePullSync({
      remoteUrl: targetPeer.url,
      remoteSyncToken: targetPeer.autoSyncToken,
      providers: settings.syncFilterProviders || [],
    });

    if (result && result.addedCount > 0) {
      console.log(`[AutoDiscovery] 🎉 Successfully imported ${result.addedCount} new accounts from ${targetPeer.hostname}!`);
    }

    // Auto-save discovered peer as the configured peer URL
    await updateSettings({
      syncRemotePeerUrl: targetPeer.url,
      syncRemoteToken: targetPeer.autoSyncToken,
      syncDiscoveredPeer: {
        hostname: targetPeer.hostname,
        url: targetPeer.url,
        lastSeen: new Date().toISOString(),
      },
    });

    return {
      peer: targetPeer,
      syncResult: result,
    };
  } catch (err) {
    console.log("[AutoDiscovery] Auto-sync failed:", err.message);
    return null;
  }
}

/**
 * Start the autonomous LAN discovery daemon worker.
 */
export async function startLanDiscoveryWorker() {
  if (_discoveryInterval) {
    clearInterval(_discoveryInterval);
    _discoveryInterval = null;
  }

  const isReceiver = await isMasterReceiverMachine();
  if (!isReceiver) {
    return;
  }

  // Run initial discovery 3 seconds after boot
  setTimeout(() => {
    autoSyncFromDiscoveredPeers().catch(() => {});
  }, 3000);

  // Periodically check every 60 seconds
  _discoveryInterval = setInterval(() => {
    autoSyncFromDiscoveredPeers().catch(() => {});
  }, 60 * 1000);

  console.log("[PeerDiscovery] Autonomous LAN Discovery & Sync worker started (every 60s)");
}

export function stopLanDiscoveryWorker() {
  if (_discoveryInterval) {
    clearInterval(_discoveryInterval);
    _discoveryInterval = null;
  }
}

export function getCachedDiscoveredPeers() {
  return _cachedPeers;
}
