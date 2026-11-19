import { describe, it, expect, vi, beforeEach } from "vitest";

describe("Antigravity API Routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();

    vi.doMock("next/server", () => ({
      NextResponse: {
        json(body, init = {}) {
          return new Response(JSON.stringify(body), {
            status: init.status || 200,
            headers: {
              "Content-Type": "application/json",
              ...(init.headers || {}),
            },
          });
        },
      },
    }));

    vi.doMock("../../src/models/index.js", () => ({
      createProviderConnection: vi.fn(async (data) => ({
        id: "mock-conn-123",
        ...data,
      })),
      getProviderConnections: vi.fn(async () => [
        {
          id: "mock-conn-123",
          provider: "antigravity",
          email: "user@example.com",
          name: "user@example.com",
          refreshToken: "1//mock-refresh-token",
          accessToken: "ya29.mock-access",
          projectId: "mock-proj",
          providerSpecificData: { tier: "pro" },
        },
      ]),
      getProviderConnectionById: vi.fn(async (id) => {
        if (id === "existing-ag-conn") {
          return {
            id: "existing-ag-conn",
            provider: "antigravity",
            email: "ag@example.com",
            refreshToken: "1//mock-refresh-token",
            accessToken: "ya29.mock-access",
            projectId: "mock-proj",
          };
        }
        return null;
      }),
      updateProviderConnection: vi.fn(async (id, data) => ({
        id,
        ...data,
      })),
    }));

    vi.doMock("../../src/lib/antigravity/accountService.js", async () => {
      const actual = await vi.importActual("../../src/lib/antigravity/accountService.js");
      return {
        ...actual,
        switchAccount: vi.fn(async (connection, target = "2.0") => ({
          success: true,
          target: target === "cli" ? "agy" : target === "classic" ? "2.0" : target,
          path: `/mock/path/${target}`,
          hotSwitched: target === "2.0" || target === "classic",
          restarted: false,
          email: connection.email || connection.name,
        })),
        detectActiveClientsStatus: vi.fn(async () => ({
          classicConnectionId: "existing-ag-conn",
          classicEmail: "ag@example.com",
          ideConnectionId: null,
          ideEmail: null,
          agyConnectionId: "existing-ag-conn",
          agyEmail: "ag@example.com",
        })),
      };
    });
  });

  describe("POST /api/oauth/antigravity/import-token", () => {
    it("returns 400 if no valid token provided", async () => {
      const { POST: importTokenPost } = await import(
        "../../src/app/api/oauth/antigravity/import-token/route.js"
      );
      const req = new Request("http://localhost/api/oauth/antigravity/import-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input: "invalid-token-without-prefix" }),
      });
      const res = await importTokenPost(req);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBeDefined();
    });

    it("returns 400 if request body is invalid JSON", async () => {
      const { POST: importTokenPost } = await import(
        "../../src/app/api/oauth/antigravity/import-token/route.js"
      );
      const req = {
        json: async () => {
          throw new Error("Unexpected token");
        },
      };
      const res = await importTokenPost(req);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain("Invalid JSON");
    });
  });

  describe("GET /api/oauth/antigravity/scan-db", () => {
    it("returns detected accounts list structure", async () => {
      const { GET: scanDbGet } = await import(
        "../../src/app/api/oauth/antigravity/scan-db/route.js"
      );
      const res = await scanDbGet();
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(Array.isArray(data.accounts)).toBe(true);
    });
  });

  describe("GET /api/oauth/antigravity/export", () => {
    it("returns JSON array of accounts", async () => {
      const { GET: exportGet } = await import(
        "../../src/app/api/oauth/antigravity/export/route.js"
      );
      const req = new Request("http://localhost/api/oauth/antigravity/export");
      const res = await exportGet(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(Array.isArray(data)).toBe(true);
      expect(data.length).toBe(1);
      expect(data[0].email).toBe("user@example.com");
      expect(data[0].refresh_token).toBe("1//mock-refresh-token");
      expect(data[0].tier).toBe("pro");
      expect(data[0].projectId).toBe("mock-proj");
    });

    it("attaches download attachment header when download=true", async () => {
      const { GET: exportGet } = await import(
        "../../src/app/api/oauth/antigravity/export/route.js"
      );
      const req = new Request("http://localhost/api/oauth/antigravity/export?download=true");
      const res = await exportGet(req);
      expect(res.status).toBe(200);
      expect(res.headers.get("Content-Disposition")).toContain('attachment; filename="antigravity-accounts.json"');
    });
  });

  describe("POST /api/oauth/antigravity/warmup", () => {
    it("returns 404 if connectionId does not exist", async () => {
      const { POST: warmupPost } = await import(
        "../../src/app/api/oauth/antigravity/warmup/route.js"
      );
      const req = new Request("http://localhost/api/oauth/antigravity/warmup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ connectionId: "non-existent-uuid" }),
      });
      const res = await warmupPost(req);
      expect(res.status).toBe(404);
      const data = await res.json();
      expect(data.error).toContain("not found");
    });
  });

  describe("POST /api/oauth/antigravity/refresh-all", () => {
    it("refreshes connections and updates database", async () => {
      const { POST: refreshAllPost } = await import(
        "../../src/app/api/oauth/antigravity/refresh-all/route.js"
      );
      const res = await refreshAllPost();
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.total).toBe(1);
    });
  });

  describe("POST /api/oauth/antigravity/switch", () => {
    it("returns 400 if connectionId is missing", async () => {
      const { POST: switchPost } = await import(
        "../../src/app/api/oauth/antigravity/switch/route.js"
      );
      const req = new Request("http://localhost/api/oauth/antigravity/switch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target: "ide" }),
      });
      const res = await switchPost(req);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain("connectionId is required");
    });

    it("returns 404 if connectionId does not exist", async () => {
      const { POST: switchPost } = await import(
        "../../src/app/api/oauth/antigravity/switch/route.js"
      );
      const req = new Request("http://localhost/api/oauth/antigravity/switch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ connectionId: "unknown-id", target: "ide" }),
      });
      const res = await switchPost(req);
      expect(res.status).toBe(404);
    });

    it("returns 400 if switch target is invalid", async () => {
      const { POST: switchPost } = await import(
        "../../src/app/api/oauth/antigravity/switch/route.js"
      );
      const req = new Request("http://localhost/api/oauth/antigravity/switch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ connectionId: "existing-ag-conn", target: "invalid-target-xyz" }),
      });
      const res = await switchPost(req);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain("Invalid switch target");
    });

    it("switches target cleanly when connection exists", async () => {
      const { POST: switchPost } = await import(
        "../../src/app/api/oauth/antigravity/switch/route.js"
      );
      const req = new Request("http://localhost/api/oauth/antigravity/switch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ connectionId: "existing-ag-conn", target: "agy" }),
      });
      const res = await switchPost(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.target).toBe("agy");
      expect(data.connectionId).toBe("existing-ag-conn");
      expect(data.activeClients?.classicEmail).toBe("ag@example.com");
    });

    it("switches Antigravity 2.0 target with hotSwitched flag", async () => {
      const { POST: switchPost } = await import(
        "../../src/app/api/oauth/antigravity/switch/route.js"
      );
      const req = new Request("http://localhost/api/oauth/antigravity/switch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ connectionId: "existing-ag-conn", target: "2.0" }),
      });
      const res = await switchPost(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.target).toBe("2.0");
      expect(data.hotSwitched).toBe(true);
    });
  });

  describe("GET /api/oauth/antigravity/active-clients", () => {
    it("returns active client status for 2.0, IDE, and CLI", async () => {
      const { GET: activeClientsGet } = await import(
        "../../src/app/api/oauth/antigravity/active-clients/route.js"
      );
      const res = await activeClientsGet();
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.classicConnectionId).toBe("existing-ag-conn");
      expect(data.agyConnectionId).toBe("existing-ag-conn");
    });
  });
});
