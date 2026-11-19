import { describe, it, expect, vi, afterEach } from "vitest";

describe("proxyAwareFetch MITM DNS bypass resilience", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it("skips 8.8.8.8 DNS bypass when OS lookup returns a non-loopback public IP", async () => {
    const dnsLookupMock = vi.fn((host, cb) => cb(null, { address: "172.217.115.4", family: 4 }));
    const resolverResolve4Mock = vi.fn();

    vi.doMock("dns", () => ({
      default: {
        lookup: dnsLookupMock,
        getServers: () => ["10.0.1.121"],
        Resolver: class {
          setServers() {}
          resolve4(...args) {
            resolverResolve4Mock(...args);
          }
          cancel() {}
        },
      },
      lookup: dnsLookupMock,
      getServers: () => ["10.0.1.121"],
    }));

    const undiciFetchMock = vi.fn(async () => new Response("ok", { status: 200 }));
    vi.doMock("undici", () => ({
      fetch: undiciFetchMock,
      Agent: class {},
      ProxyAgent: class {},
    }));

    const { proxyAwareFetch, resetDirectDispatchersForTests } = await import(
      "../../open-sse/utils/proxyFetch.js"
    );
    resetDirectDispatchersForTests();

    const res = await proxyAwareFetch("https://daily-cloudcode-pa.googleapis.com/v1internal:models", {
      method: "GET",
    });

    expect(res.status).toBe(200);
    expect(dnsLookupMock).toHaveBeenCalledTimes(1);
    expect(resolverResolve4Mock).not.toHaveBeenCalled();
    expect(undiciFetchMock).toHaveBeenCalledTimes(1);
  });

  it("falls back to DoH (443) when OS lookup is loopback and UDP DNS fails", async () => {
    const dnsLookupMock = vi.fn((host, cb) => cb(null, { address: "127.0.0.1", family: 4 }));

    vi.doMock("dns", () => ({
      default: {
        lookup: dnsLookupMock,
        getServers: () => ["127.0.0.1"],
        Resolver: class {
          setServers() {}
          resolve4(_host, cb) {
            cb(new Error("ETIMEOUT"));
          }
          cancel() {}
        },
      },
      lookup: dnsLookupMock,
      getServers: () => ["127.0.0.1"],
    }));

    const undiciFetchMock = vi.fn(async (url) => {
      if (String(url).startsWith("https://dns.google/resolve")) {
        return new Response(JSON.stringify({ Answer: [{ type: 1, data: "172.217.115.4" }] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      return new Response("ok", { status: 200 });
    });
    vi.doMock("undici", () => ({
      fetch: undiciFetchMock,
      Agent: class {},
      ProxyAgent: class {},
    }));

    // Mock https/net so createBypassRequest resolves a real Response without network
    const { EventEmitter } = await import("events");
    const { Readable } = await import("stream");
    vi.doMock("net", () => ({
      default: {
        Socket: class extends EventEmitter {
          connect(_port, _ip, cb) {
            cb();
          }
          destroy() {}
        },
      },
    }));
    vi.doMock("https", () => ({
      default: {
        request: (_opts, cb) => {
          const resStream = Readable.from([Buffer.from('{"ok":true}')]);
          resStream.statusCode = 200;
          resStream.statusMessage = "OK";
          resStream.headers = { "content-type": "application/json" };
          cb(resStream);
          return { on() {}, write() {}, end() {}, destroy() {} };
        },
      },
    }));

    const { proxyAwareFetch, resetDirectDispatchersForTests } = await import(
      "../../open-sse/utils/proxyFetch.js"
    );
    resetDirectDispatchersForTests();

    const res = await proxyAwareFetch("https://daily-cloudcode-pa.googleapis.com/v1internal:models", {
      method: "POST",
      body: "{}",
    });

    expect(res.status).toBe(200);
    expect(typeof res.clone).toBe("function");
    expect(await res.clone().json()).toEqual({ ok: true });
    expect(undiciFetchMock).toHaveBeenCalledWith(
      expect.stringContaining("https://dns.google/resolve?name=daily-cloudcode-pa.googleapis.com"),
      expect.any(Object)
    );
  });
});
