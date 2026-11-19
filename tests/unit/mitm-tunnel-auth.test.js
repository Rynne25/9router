import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";

const mocks = vi.hoisted(() => ({
  nextResponse: Symbol("next"),
  jsonResponse: vi.fn((body, init) => ({
    status: init?.status || 200,
    body,
  })),
  redirectResponse: vi.fn((url) => ({ status: 307, url })),
  getSettings: vi.fn(),
  updateSettings: vi.fn(),
  validateApiKey: vi.fn(),
  getConsistentMachineId: vi.fn(),
  verifyDashboardAuthToken: vi.fn(),
  enableTunnel: vi.fn(),
  enableTailscale: vi.fn(),
  configureTunnelMonitoring: vi.fn(),
  getApiKeys: vi.fn(),
  createApiKey: vi.fn(),
  startServer: vi.fn(),
  getMitmStatus: vi.fn(),
  getCachedPassword: vi.fn(),
  loadEncryptedPassword: vi.fn(),
  isSudoPasswordRequired: vi.fn(),
  execSync: vi.fn(() => ""),
}));

vi.mock("child_process", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    default: { ...(actual.default || actual), execSync: mocks.execSync },
    execSync: mocks.execSync,
  };
});

vi.mock("next/server", () => ({
  NextResponse: {
    next: vi.fn(() => mocks.nextResponse),
    json: mocks.jsonResponse,
    redirect: mocks.redirectResponse,
  },
}));

vi.mock("@/lib/localDb", () => ({
  getSettings: mocks.getSettings,
  updateSettings: mocks.updateSettings,
  validateApiKey: mocks.validateApiKey,
  getApiKeys: mocks.getApiKeys,
  createApiKey: mocks.createApiKey,
}));

vi.mock("@/shared/utils/machineId", () => ({
  getConsistentMachineId: mocks.getConsistentMachineId,
}));

vi.mock("@/lib/auth/dashboardSession", () => ({
  verifyDashboardAuthToken: mocks.verifyDashboardAuthToken,
}));

vi.mock("@/lib/tunnel", () => ({
  enableTunnel: mocks.enableTunnel,
  enableTailscale: mocks.enableTailscale,
}));

vi.mock("@/shared/services/initializeApp", () => ({
  configureTunnelMonitoring: mocks.configureTunnelMonitoring,
}));

vi.mock("@/mitm/manager", () => ({
  getMitmStatus: mocks.getMitmStatus,
  startServer: mocks.startServer,
  stopServer: vi.fn(),
  enableToolDNS: vi.fn(),
  disableToolDNS: vi.fn(),
  trustCert: vi.fn(),
  getCachedPassword: mocks.getCachedPassword,
  setCachedPassword: vi.fn(),
  loadEncryptedPassword: mocks.loadEncryptedPassword,
  isSudoPasswordRequired: mocks.isSudoPasswordRequired,
  initDbHooks: vi.fn(),
}));

const { proxy, __test__ } = await import("../../src/dashboardGuard.js");

const PEER_TOKEN = "peer-token-mitm-test";

function makeRequest(pathname, headers = {}, cookies = {}) {
  return {
    nextUrl: { pathname, searchParams: new URL(`http://localhost${pathname}`).searchParams },
    headers: new Headers(headers),
    cookies: { get: vi.fn((k) => (cookies[k] ? { value: cookies[k] } : undefined)) },
    url: `http://localhost${pathname}`,
  };
}

function makeLocalRequest(pathname, headers = {}) {
  return makeRequest(pathname, {
    "x-9r-peer-token": PEER_TOKEN,
    "x-9r-real-ip": "127.0.0.1",
    ...headers,
  });
}

describe("MITM & Tunnel without requireLogin/custom password", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NINEROUTER_PEER_TOKEN = PEER_TOKEN;
    mocks.getSettings.mockResolvedValue({
      requireLogin: false,
      tunnelDashboardAccess: false,
      tunnelEnabled: true,
      tunnelUrl: "https://demo-abc.trycloudflare.com",
      tailscaleEnabled: true,
      tailscaleUrl: "https://node.tailnet.ts.net",
    });
    mocks.updateSettings.mockResolvedValue({});
    mocks.validateApiKey.mockResolvedValue(false);
    mocks.getConsistentMachineId.mockResolvedValue("machine-123");
    mocks.verifyDashboardAuthToken.mockResolvedValue(false);
    mocks.enableTunnel.mockResolvedValue({ success: true, tunnelUrl: "https://demo-abc.trycloudflare.com" });
    mocks.enableTailscale.mockResolvedValue({ success: true, tunnelUrl: "https://node.tailnet.ts.net" });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("allows local MITM control route when requireLogin=false and no password is set", async () => {
    const res = await proxy(
      makeLocalRequest("/api/cli-tools/antigravity-mitm", {
        host: "localhost:20128",
        origin: "http://localhost:20128",
      })
    );
    expect(res).toBe(mocks.nextResponse);
  });

  it("blocks tunnel dashboard & protected API access when tunnelDashboardAccess=false even if requireLogin=false", async () => {
    const dashRes = await proxy(
      makeRequest("/dashboard/mitm", { host: "r123abc.abc-tunnel.us" })
    );
    expect(dashRes.status).toBe(307);
    expect(String(dashRes.url)).toContain("/login");

    const apiRes = await proxy(
      makeRequest("/api/settings", { host: "demo-abc.trycloudflare.com" })
    );
    expect(apiRes.status).toBe(403);
    expect(apiRes.body.error).toBe("Dashboard access via tunnel is disabled");
  });

  it("requires valid JWT over tunnel even when requireLogin=false and tunnelDashboardAccess=true", async () => {
    mocks.getSettings.mockResolvedValue({
      requireLogin: false,
      tunnelDashboardAccess: true,
      tunnelEnabled: true,
      tunnelUrl: "https://demo-abc.trycloudflare.com",
      tailscaleEnabled: true,
      tailscaleUrl: "https://node.tailnet.ts.net",
    });

    const dashRes = await proxy(
      makeRequest("/dashboard/endpoint", { host: "demo-abc.trycloudflare.com" })
    );
    expect(dashRes.status).toBe(307);

    const apiRes = await proxy(
      makeRequest("/api/settings", { host: "node.tailnet.ts.net" })
    );
    expect(apiRes.status).toBe(401);
  });

  it("detects tunnel and tailscale hosts accurately via isTunnelHostRequest", () => {
    const settings = {
      tunnelEnabled: true,
      tunnelUrl: "https://demo-abc.trycloudflare.com",
      tailscaleEnabled: true,
      tailscaleUrl: "https://my-host.ts.net",
    };

    expect(__test__.isTunnelHostRequest(makeRequest("/", { host: "demo-abc.trycloudflare.com" }), settings)).toBe(true);
    expect(__test__.isTunnelHostRequest(makeRequest("/", { host: "r999.abc-tunnel.us" }), settings)).toBe(true);
    expect(__test__.isTunnelHostRequest(makeRequest("/", { host: "my-host.ts.net" }), settings)).toBe(true);
    expect(__test__.isTunnelHostRequest(makeRequest("/", { host: "localhost:20128" }), settings)).toBe(false);
  });

  it("allows tailscale enable when requireLogin=false and auto-disables tunnelDashboardAccess", async () => {
    mocks.getSettings.mockResolvedValue({
      requireLogin: false,
      password: null,
      tunnelDashboardAccess: true,
    });

    const { POST } = await import("../../src/app/api/tunnel/tailscale-enable/route.js");
    const res = await POST();

    expect(mocks.updateSettings).toHaveBeenCalledWith({ tunnelDashboardAccess: false });
    expect(mocks.enableTailscale).toHaveBeenCalled();
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it("allows cloudflare tunnel enable when requireLogin=false and auto-disables tunnelDashboardAccess", async () => {
    vi.useFakeTimers();
    mocks.getSettings.mockResolvedValue({
      requireLogin: false,
      password: null,
      tunnelDashboardAccess: true,
    });

    const { POST } = await import("../../src/app/api/tunnel/enable/route.js");
    const promise = POST();
    await vi.runAllTimersAsync();
    const res = await promise;

    expect(mocks.updateSettings).toHaveBeenCalledWith({ tunnelDashboardAccess: false });
    expect(mocks.enableTunnel).toHaveBeenCalled();
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it("resolves or auto-provisions a valid API key when starting MITM with placeholder sk_9router", async () => {
    mocks.isSudoPasswordRequired.mockReturnValue(false);
    mocks.getCachedPassword.mockReturnValue("sudo-pass");
    mocks.loadEncryptedPassword.mockResolvedValue(null);
    mocks.getApiKeys.mockResolvedValue([]);
    mocks.getSettings.mockResolvedValue({ requireApiKey: true });
    mocks.createApiKey.mockResolvedValue({ key: "sk-auto-generated-123" });
    mocks.startServer.mockResolvedValue({ running: true, pid: 4321 });

    const { POST } = await import("../../src/app/api/cli-tools/antigravity-mitm/route.js");
    const req = new Request("http://localhost/api/cli-tools/antigravity-mitm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ apiKey: "sk_9router" }),
    });
    const res = await POST(req);

    expect(mocks.createApiKey).toHaveBeenCalledWith("Default Key", "machine-123");
    expect(mocks.startServer).toHaveBeenCalledWith("sk-auto-generated-123", "sudo-pass", false);
    expect(res.status).toBe(200);
  });

  it("does not block tunnel activation in Endpoint UI with the Require login prompt", () => {
    const endpointClient = readFileSync(
      new URL("../../src/app/(dashboard)/dashboard/endpoint/EndpointPageClient.js", import.meta.url),
      "utf-8"
    );
    const tunnelSection = readFileSync(
      new URL("../../src/app/(dashboard)/dashboard/endpoint/components/TunnelEndpointSection.js", import.meta.url),
      "utf-8"
    );

    expect(endpointClient).not.toContain('Enable "Require login" and set a custom password before activating the tunnel.');
    expect(tunnelSection).not.toContain("if (isLoginUnsafe)");
  });
});
