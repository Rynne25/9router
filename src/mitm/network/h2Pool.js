const http2 = require("http2");
const tls = require("tls");
const { log, err } = require("../logger");
const { REJECT_UNAUTHORIZED } = require("./dnsResolver");

class Http2SessionPool {
  constructor() {
    this.sessions = new Map(); // host -> entry
    this.pingIntervalMs = 30000;
  }

  async getSession(targetHost, targetIP) {
    const existing = this.sessions.get(targetHost);
    if (existing) {
      if (existing.targetIP && targetIP && existing.targetIP !== targetIP) {
        this.evict(targetHost);
      } else {
        if (existing.client && !existing.client.destroyed && !existing.client.closed) {
          existing.lastUsed = Date.now();
          return existing.client;
        }
        if (existing.connectingPromise) {
          return existing.connectingPromise;
        }
      }
    }
    return this._createNewSession(targetHost, targetIP);
  }

  _createNewSession(targetHost, targetIP) {
    let resolveSession, rejectSession;
    const connectingPromise = new Promise((res, rej) => {
      resolveSession = res;
      rejectSession = rej;
    });

    const entry = {
      client: null,
      targetIP,
      connectingPromise,
      lastUsed: Date.now(),
      pingTimer: null,
    };
    this.sessions.set(targetHost, entry);

    try {
      const client = http2.connect(`https://${targetHost}`, {
        createConnection: () => tls.connect({
          host: targetIP,
          port: 443,
          servername: targetHost,
          ALPNProtocols: ["h2"],
          rejectUnauthorized: REJECT_UNAUTHORIZED,
        }),
      });

      const cleanup = () => {
        if (entry.pingTimer) {
          clearInterval(entry.pingTimer);
          entry.pingTimer = null;
        }
        if (this.sessions.get(targetHost) === entry) {
          this.sessions.delete(targetHost);
        }
        try { if (!client.destroyed) client.destroy(); } catch {}
      };

      client.once("connect", () => {
        entry.client = client;
        entry.connectingPromise = null;
        log(`🔗 [mitm] HTTP/2 session pooled for ${targetHost}`);

        entry.pingTimer = setInterval(() => {
          if (client.destroyed || client.closed) {
            cleanup();
            return;
          }
          try {
            let pongReceived = false;
            const pingTimeout = setTimeout(() => {
              if (!pongReceived) {
                log(`[mitm] HTTP/2 ping timeout (${targetHost}), evicting`);
                cleanup();
              }
            }, 5000);
            if (pingTimeout.unref) pingTimeout.unref();
            client.ping((pingErr) => {
              pongReceived = true;
              clearTimeout(pingTimeout);
              if (pingErr) {
                log(`[mitm] HTTP/2 ping failed (${targetHost}): ${pingErr.message}, evicting`);
                cleanup();
              }
            });
          } catch {
            cleanup();
          }
        }, this.pingIntervalMs);
        if (entry.pingTimer.unref) entry.pingTimer.unref();

        resolveSession(client);
      });

      client.once("error", (e) => {
        err(`[mitm] HTTP/2 session error (${targetHost}): ${e.message}`);
        cleanup();
        if (entry.connectingPromise) rejectSession(e);
      });

      client.once("goaway", () => {
        log(`[mitm] HTTP/2 session received GOAWAY (${targetHost})`);
        cleanup();
      });

      client.once("close", () => {
        cleanup();
      });
    } catch (e) {
      this.sessions.delete(targetHost);
      rejectSession(e);
    }

    return connectingPromise;
  }

  evict(targetHost) {
    const entry = this.sessions.get(targetHost);
    if (entry) {
      if (entry.pingTimer) clearInterval(entry.pingTimer);
      try { if (entry.client && !entry.client.destroyed) entry.client.destroy(); } catch {}
      this.sessions.delete(targetHost);
    }
  }

  closeAll() {
    for (const [host] of this.sessions) {
      this.evict(host);
    }
  }
}

const h2Pool = new Http2SessionPool();

module.exports = {
  Http2SessionPool,
  h2Pool,
};
