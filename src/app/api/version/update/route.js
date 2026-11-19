import { executeAutoUpdate } from "@/lib/updater/autoUpdateService";

export const dynamic = "force-dynamic";

/**
 * POST /api/version/update
 * Streams real-time 1-Click Update progress events over SSE.
 */
export async function POST(request) {
  let downloadUrl = null;
  try {
    const body = await request.json().catch(() => ({}));
    if (body?.downloadUrl) downloadUrl = body.downloadUrl;
  } catch {}

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const sendEvent = (data) => {
        try {
          const payload = `data: ${JSON.stringify(data)}\n\n`;
          controller.enqueue(encoder.encode(payload));
        } catch { /* stream closed */ }
      };

      try {
        sendEvent({
          phase: "detecting",
          progress: 5,
          message: "Đang phát hiện môi trường cài đặt...",
        });

        await executeAutoUpdate(sendEvent, downloadUrl);

        setTimeout(() => {
          try { controller.close(); } catch {}
        }, 1200);
      } catch (err) {
        sendEvent({
          phase: "error",
          progress: 0,
          error: err.message || "Quá trình cập nhật thất bại",
          message: `Lỗi: ${err.message}`,
        });
        setTimeout(() => {
          try { controller.close(); } catch {}
        }, 500);
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
