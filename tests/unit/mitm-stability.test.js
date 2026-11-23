import { describe, it, expect, vi, afterEach } from "vitest";
import { Readable } from "stream";

describe("MITM bypass fetch stability", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it("caches isHostsSpoofed result within TTL and clears it on resetDnsCacheForTests", async () => {
    const dnsLookupMock = vi.fn((_host, cb) =>
      cb(null, { address: "172.217.115.4", family: 4 })
    );

    vi.doMock("dns", () => ({
      default: { lookup: dnsLookupMock },
      lookup: dnsLookupMock,
    }));

    const { isHostsSpoofed, resetDnsCacheForTests } = await import(
      "../../open-sse/utils/proxyFetch.js"
    );
    resetDnsCacheForTests();

    const first = await isHostsSpoofed("daily-cloudcode-pa.googleapis.com");
    const second = await isHostsSpoofed("daily-cloudcode-pa.googleapis.com");

    expect(first).toBe(false);
    expect(second).toBe(false);
    expect(dnsLookupMock).toHaveBeenCalledTimes(1);

    resetDnsCacheForTests();

    const third = await isHostsSpoofed("daily-cloudcode-pa.googleapis.com");
    expect(third).toBe(false);
    expect(dnsLookupMock).toHaveBeenCalledTimes(2);
  });

  it("detects ECONNRESET and socket hang up in isStaleSocketError", async () => {
    const { isStaleSocketError } = await import("../../open-sse/utils/proxyFetch.js");

    expect(isStaleSocketError(Object.assign(new Error("read ECONNRESET"), { code: "ECONNRESET" }))).toBe(true);
    expect(isStaleSocketError(new Error("socket hang up"))).toBe(true);
    expect(isStaleSocketError(Object.assign(new Error("aborted"), { name: "AbortError", code: "ECONNRESET" }))).toBe(false);
  });

  it("uses 120000ms agent timeout and retries createBypassRequest once on stale socket error", async () => {
    const dnsLookupMock = vi.fn((_host, cb) =>
      cb(null, { address: "127.0.0.1", family: 4 })
    );

    vi.doMock("dns", () => ({
      default: {
        lookup: dnsLookupMock,
        getServers: () => ["8.8.8.8"],
        Resolver: class {
          setServers() {}
          resolve4(_host, cb) {
            cb(null, ["172.217.115.4"]);
          }
          cancel() {}
        },
      },
      lookup: dnsLookupMock,
      getServers: () => ["8.8.8.8"],
      Resolver: class {
        setServers() {}
        resolve4(_host, cb) {
          cb(null, ["172.217.115.4"]);
        }
        cancel() {}
      },
    }));

    const agentInstances = [];
    let requestAttempt = 0;

    vi.doMock("https", () => ({
      default: {
        Agent: class {
          constructor(opts) {
            this.opts = opts;
            this.destroy = vi.fn();
            agentInstances.push(this);
          }
        },
        request: (_opts, cb) => {
          requestAttempt += 1;
          const handlers = {};
          return {
            on(event, fn) {
              handlers[event] = fn;
            },
            write() {},
            end() {
              if (requestAttempt === 1) {
                const err = new Error("socket hang up");
                err.code = "ECONNRESET";
                handlers.error?.(err);
                return;
              }
              const resStream = Readable.from([Buffer.from('{"retried":true}')]);
              resStream.statusCode = 200;
              resStream.statusMessage = "OK";
              resStream.headers = { "content-type": "application/json" };
              cb(resStream);
            },
            destroy() {},
          };
        },
      },
    }));

    const { proxyAwareFetch, resetDnsCacheForTests, resetDirectDispatchersForTests } = await import(
      "../../open-sse/utils/proxyFetch.js"
    );
    resetDnsCacheForTests();
    resetDirectDispatchersForTests();

    const res = await proxyAwareFetch(
      "https://daily-cloudcode-pa.googleapis.com/v1internal:streamGenerateContent",
      {
        method: "POST",
        body: "{}",
      }
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ retried: true });
    expect(requestAttempt).toBe(2);
    expect(agentInstances.length).toBe(2);
    expect(agentInstances[0].opts.timeout).toBe(120000);
    expect(agentInstances[0].destroy).toHaveBeenCalledTimes(1);
    expect(agentInstances[1].opts.timeout).toBe(120000);
  });
});
