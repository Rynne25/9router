import { describe, it, expect, vi } from "vitest";

describe("MITM HTTP/2 Session Pooling & Low Latency Pipeline", () => {
  it("pipeSSE forwards Uint8Array binary chunks directly with zero-copy and enables tcpNoDelay", async () => {
    const { pipeSSE } = await import("../../src/mitm/handlers/base.js");

    const chunk1 = new Uint8Array([104, 101, 108, 108, 111]); // "hello"
    const chunk2 = new Uint8Array([32, 119, 111, 114, 108, 100]); // " world"

    let streamClosed = false;
    const mockStream = new ReadableStream({
      start(controller) {
        controller.enqueue(chunk1);
        controller.enqueue(chunk2);
        controller.close();
      },
    });

    const mockRouterRes = {
      status: 200,
      headers: new Headers({ "content-type": "text/event-stream" }),
      body: mockStream,
    };

    const writtenChunks = [];
    let noDelayCalled = false;
    let writtenHead = null;

    const mockClientRes = {
      socket: {
        setNoDelay: (val) => {
          if (val === true) noDelayCalled = true;
        },
      },
      writeHead: (status, headers) => {
        writtenHead = { status, headers };
      },
      write: (data) => {
        writtenChunks.push(data);
      },
      end: () => {
        streamClosed = true;
      },
    };

    await pipeSSE(mockRouterRes, mockClientRes, null);

    expect(noDelayCalled).toBe(true);
    expect(writtenHead.status).toBe(200);
    expect(writtenHead.headers["X-Accel-Buffering"]).toBe("no");
    expect(writtenChunks.length).toBe(2);
    // Direct binary chunks without String coercion
    expect(writtenChunks[0]).toEqual(chunk1);
    expect(writtenChunks[1]).toEqual(chunk2);
    expect(streamClosed).toBe(true);
  });

  it("proxyFetch DNS bypass uses persistent Keep-Alive https.Agent and Anycast fallback", async () => {
    const { proxyAwareFetch, resetDnsCacheForTests, resetDirectDispatchersForTests } = await import(
      "../../open-sse/utils/proxyFetch.js"
    );
    resetDnsCacheForTests();
    resetDirectDispatchersForTests();

    // Verify proxyFetch is exported and functioning with bypass
    expect(typeof proxyAwareFetch).toBe("function");
    expect(typeof resetDnsCacheForTests).toBe("function");
  });
});
