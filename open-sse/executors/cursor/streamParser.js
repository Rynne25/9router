import zlib from "zlib";
import { HTTP_STATUS } from "../../config/runtimeConfig.js";
import { PROVIDER_OAUTH } from "../../config/providers.js";
import { decodeMessage, extractTextFromResponse } from "../../utils/cursorProtobuf.js";
import { resolveCursorModels, resolveAutoModelSelection } from "../../services/cursorModels.js";
import { estimateUsage } from "../../utils/usageTracking.js";
import { SSE_DONE, SSE_HEADERS } from "../../utils/sseConstants.js";
import { chatChunkSse, sseChunk } from "../../utils/sse.js";
import { FORMATS } from "../../translator/formats.js";
import { proxyIntentFailed } from "./h2Transport.js";
import {
  AGENT_RUN_PATH,
  buildAgentRunFrame,
  extractAgentString,
  encodeKvClientMessage,
  agentMessage,
  shouldRetryEmptyTurn,
  tailOnlyCursorMessages,
  CURSOR_EMPTY_TURN_MAX_RETRIES,
  CURSOR_EMPTY_TURN_RETRY_DELAY_MS,
} from "./wireFraming.js";
import { ToolCallAccumulator, handleAgentExecRequest } from "./toolAdapter.js";

export const COMPRESS_FLAG = {
  NONE: 0x00,
  GZIP: 0x01,
  TRAILER: 0x02,
  GZIP_TRAILER: 0x03,
};

export const CURSOR_STREAM_DEBUG = process.env.CURSOR_STREAM_DEBUG === "1";
export const debugLog = (...args) => {
  if (CURSOR_STREAM_DEBUG) console.log(...args);
};

export function isComposerModel(model) {
  const modelId = String(model || "").split("/").pop();
  return /^composer(?:-|$)/i.test(modelId);
}

export function visibleComposerContentFromThinking(thinking) {
  if (!thinking) return "";
  const endTag = "</think>";
  const endIdx = thinking.lastIndexOf(endTag);
  if (endIdx < 0) return "";
  return thinking.slice(endIdx + endTag.length).trimStart();
}

export function decompressPayload(payload, flags) {
  // Check if payload is JSON error (starts with {"error")
  if (payload.length > 10 && payload[0] === 0x7b && payload[1] === 0x22) {
    try {
      const text = payload.toString("utf-8");
      if (text.startsWith('{"error"')) {
        debugLog(`[DECOMPRESS] Detected JSON error, skipping decompression`);
        return payload;
      }
    } catch {}
  }

  if (
    flags === COMPRESS_FLAG.GZIP ||
    flags === COMPRESS_FLAG.TRAILER ||
    flags === COMPRESS_FLAG.GZIP_TRAILER
  ) {
    // Primary: try gzip decompression (standard gzip header 0x1f 0x8b)
    try {
      return zlib.gunzipSync(payload);
    } catch (gzipErr) {
      // Fallback: TRAILER and GZIP_TRAILER frames sometimes use raw zlib deflate format
      try {
        return zlib.inflateSync(payload);
      } catch (deflateErr) {
        // Last resort: try raw deflate (no zlib header)
        try {
          return zlib.inflateRawSync(payload);
        } catch (rawErr) {
          debugLog(
            `[DECOMPRESS ERROR] flags=${flags}, payloadSize=${payload.length}, gzip=${gzipErr.message}, deflate=${deflateErr.message}, raw=${rawErr.message}`
          );
          debugLog(
            `[DECOMPRESS ERROR] First 50 bytes (hex):`,
            payload.slice(0, 50).toString("hex")
          );
          return payload;
        }
      }
    }
  }
  return payload;
}

// Read one cursor protobuf frame: header + bounds + decompress. Returns status + payload + new offset.
export function readCursorFrame(buffer, offset, frameNum, tag) {
  if (offset + 5 > buffer.length) {
    debugLog(`[CURSOR BUFFER${tag}] Reached end, offset=${offset}, remaining=${buffer.length - offset}`);
    return { status: "done" };
  }

  const flags = buffer[offset];
  const length = buffer.readUInt32BE(offset + 1);
  debugLog(`[CURSOR BUFFER${tag}] Frame ${frameNum + 1}: flags=0x${flags.toString(16).padStart(2, "0")}, length=${length}`);

  if (offset + 5 + length > buffer.length) {
    debugLog(`[CURSOR BUFFER${tag}] Incomplete frame, offset=${offset}, length=${length}, buffer.length=${buffer.length}`);
    return { status: "done" };
  }

  let payload = buffer.slice(offset + 5, offset + 5 + length);
  const newOffset = offset + 5 + length;
  payload = decompressPayload(payload, flags);
  if (!payload) {
    debugLog(`[CURSOR BUFFER${tag}] Frame ${frameNum + 1}: decompression failed, skipping`);
    return { status: "skip", offset: newOffset };
  }
  return { status: "ok", payload, offset: newOffset };
}

export function decodeAgentFrames(buffer, onFrame) {
  let pending = Buffer.from(buffer || []);
  while (pending.length >= 5) {
    const flags = pending[0];
    const length = pending.readUInt32BE(1);
    if (pending.length < 5 + length) break;
    let payload = pending.subarray(5, 5 + length);
    pending = pending.subarray(5 + length);
    if (flags & COMPRESS_FLAG.GZIP) {
      payload = zlib.gunzipSync(payload);
    }
    if (!(flags & COMPRESS_FLAG.TRAILER)) onFrame(payload);
  }
  return pending;
}

export function createErrorResponse(jsonError) {
  const errorMsg = jsonError?.error?.details?.[0]?.debug?.details?.title
    || jsonError?.error?.details?.[0]?.debug?.details?.detail
    || jsonError?.error?.message
    || "API Error";

  const isRateLimit = jsonError?.error?.code === "resource_exhausted";

  return new Response(JSON.stringify({
    error: {
      message: errorMsg,
      type: isRateLimit ? "rate_limit_error" : "api_error",
      code: jsonError?.error?.details?.[0]?.debug?.error || "unknown",
    },
  }), {
    status: isRateLimit ? HTTP_STATUS.RATE_LIMITED : HTTP_STATUS.BAD_REQUEST,
    headers: { "Content-Type": "application/json" },
  });
}

export function transformProtobufToJSON(buffer, model, body) {
  const responseId = `chatcmpl-cursor-${Date.now()}`;
  const created = Math.floor(Date.now() / 1000);

  let offset = 0;
  let totalContent = "";
  let totalThinking = "";
  const accumulator = new ToolCallAccumulator();
  let frameCount = 0;

  debugLog(`[CURSOR BUFFER] Total length: ${buffer.length} bytes`);

  while (offset < buffer.length) {
    const frame = readCursorFrame(buffer, offset, frameCount, "");
    if (frame.status === "done") break;
    offset = frame.offset;
    frameCount++;
    if (frame.status === "skip") continue;
    const payload = frame.payload;

    // Check for JSON error frames (byte guard: skip toString on non-JSON frames)
    if (payload.length > 0 && payload[0] === 0x7b) {
      try {
        const text = payload.toString("utf-8");
        if (text.includes('"error"')) {
          const hasContent = totalContent || accumulator.mapSize > 0;
          debugLog(
            `[CURSOR BUFFER] Error frame (hasContent=${hasContent}): ${text.slice(0, 500)}`
          );
          if (hasContent) {
            break;
          }
          return createErrorResponse(JSON.parse(text));
        }
      } catch {}
    }

    const result = extractTextFromResponse(new Uint8Array(payload));
    debugLog(`[CURSOR DECODED] Frame ${frameCount}:`, result);

    if (result.error) {
      const hasContent = totalContent || accumulator.mapSize > 0;
      debugLog(`[CURSOR BUFFER] Decoded error (hasContent=${hasContent}): ${result.error}`);
      if (hasContent) {
        break;
      }
      return new Response(
        JSON.stringify({
          error: {
            message: result.error,
            type: "rate_limit_error",
            code: "rate_limited",
          },
        }),
        {
          status: HTTP_STATUS.RATE_LIMITED,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    if (result.toolCall) {
      accumulator.addJson(result.toolCall);
    }

    if (result.text) totalContent += result.text;
    if (result.thinking) totalThinking += result.thinking;
  }

  const visibleComposerContent = isComposerModel(model)
    ? visibleComposerContentFromThinking(totalThinking)
    : "";
  const finalContent = totalContent || visibleComposerContent;

  debugLog(
    `[CURSOR BUFFER] Parsed ${frameCount} frames, toolCallsMap size: ${accumulator.mapSize}, finalized toolCalls: ${accumulator.count}`
  );

  const toolCalls = accumulator.finalizeJson();

  debugLog(`[CURSOR BUFFER] Final toolCalls count: ${toolCalls.length}`);

  const message = {
    role: "assistant",
    content: finalContent || null,
  };

  if (toolCalls.length > 0) {
    message.tool_calls = toolCalls;
  }

  const usage = estimateUsage(body, finalContent.length, FORMATS.OPENAI);

  const completion = {
    id: responseId,
    object: "chat.completion",
    created,
    model,
    choices: [{
      index: 0,
      message,
      finish_reason: toolCalls.length > 0 ? "tool_calls" : "stop",
    }],
    usage,
  };

  return new Response(JSON.stringify(completion), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

export function transformProtobufToSSE(buffer, model, body) {
  const responseId = `chatcmpl-cursor-${Date.now()}`;
  const created = Math.floor(Date.now() / 1000);

  const chunks = [];
  let offset = 0;
  let totalContent = "";
  let totalThinking = "";
  let emittedComposerThinkingContentLength = 0;
  const accumulator = new ToolCallAccumulator();
  let frameCount = 0;

  debugLog(`[CURSOR BUFFER SSE] Total length: ${buffer.length} bytes`);

  while (offset < buffer.length) {
    const frame = readCursorFrame(buffer, offset, frameCount, " SSE");
    if (frame.status === "done") break;
    offset = frame.offset;
    frameCount++;
    if (frame.status === "skip") continue;
    const payload = frame.payload;

    // Check for JSON error frames (byte-guard: only decode if starts with '{')
    if (payload[0] === 0x7b) {
      try {
        const text = payload.toString("utf-8");
        if (text.includes('"error"')) {
          const hasContent = chunks.length > 0 || totalContent || accumulator.mapSize > 0;
          debugLog(
            `[CURSOR BUFFER SSE] Error frame (hasContent=${hasContent}): ${text.slice(0, 500)}`
          );
          if (hasContent) {
            break;
          }
          return createErrorResponse(JSON.parse(text));
        }
      } catch {}
    }

    const result = extractTextFromResponse(new Uint8Array(payload));
    debugLog(`[CURSOR DECODED SSE] Frame ${frameCount}:`, result);

    if (result.error) {
      const hasContent = chunks.length > 0 || totalContent || accumulator.mapSize > 0;
      debugLog(`[CURSOR BUFFER SSE] Decoded error (hasContent=${hasContent}): ${result.error}`);
      if (hasContent) {
        break;
      }
      return new Response(
        JSON.stringify({
          error: {
            message: result.error,
            type: "rate_limit_error",
            code: "rate_limited",
          },
        }),
        {
          status: HTTP_STATUS.RATE_LIMITED,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    if (result.toolCall) {
      accumulator.addSse(result.toolCall, { chunks, responseId, created, model });
    }

    if (result.text) {
      totalContent += result.text;
      chunks.push(chatChunkSse({
        id: responseId, created, model,
        delta:
          chunks.length === 0 && accumulator.count === 0
            ? { role: "assistant", content: result.text }
            : { content: result.text },
      }));
    }

    if (isComposerModel(model) && result.thinking) {
      totalThinking += result.thinking;
      const visibleContent = visibleComposerContentFromThinking(totalThinking);
      if (visibleContent.length > emittedComposerThinkingContentLength) {
        const deltaContent = visibleContent.slice(emittedComposerThinkingContentLength);
        emittedComposerThinkingContentLength = visibleContent.length;
        totalContent += deltaContent;
        chunks.push(chatChunkSse({
          id: responseId, created, model,
          delta:
            chunks.length === 0 && accumulator.count === 0
              ? { role: "assistant", content: deltaContent }
              : { content: deltaContent },
        }));
      }
    }
  }

  debugLog(
    `[CURSOR BUFFER SSE] Parsed ${frameCount} frames, toolCallsMap size: ${accumulator.mapSize}, toolCalls array: ${accumulator.count}`
  );

  const toolCalls = accumulator.finalizeSse({ chunks, responseId, created, model });

  if (chunks.length === 0 && toolCalls.length === 0) {
    chunks.push(chatChunkSse({ id: responseId, created, model, delta: { role: "assistant", content: "" } }));
  }

  const usage = estimateUsage(body, totalContent.length, FORMATS.OPENAI);

  chunks.push(
    `data: ${JSON.stringify({
      id: responseId,
      object: "chat.completion.chunk",
      created,
      model,
      choices: [
        {
          index: 0,
          delta: {},
          finish_reason: toolCalls.length > 0 ? "tool_calls" : "stop",
        },
      ],
      usage,
    })}\n\n`
  );
  chunks.push(SSE_DONE);

  return new Response(chunks.join(""), {
    status: 200,
    headers: { ...SSE_HEADERS },
  });
}

export async function executeAgentSession(executor, { model, body, stream, credentials, signal, log, proxyOptions = null }) {
  const agentEndpoint = PROVIDER_OAUTH.cursor?.agentEndpoint;
  if (!agentEndpoint) throw new Error("Cursor AgentService endpoint is not configured");

  // Policy guard: the h2 duplex stream below cannot ride a proxy, so a
  // strict proxy configuration must fail closed here rather than leak the
  // real IP on a direct socket (see proxyIntentFailed above).
  if (proxyIntentFailed(proxyOptions)) {
    throw new Error(
      "Cursor AgentService requires a strict proxy that this HTTP/2 transport cannot honor; refusing to open a direct connection"
    );
  }

  const url = `${agentEndpoint}${AGENT_RUN_PATH}`;
  const headers = executor.buildHeaders(credentials);
  const requestController = new AbortController();
  if (signal?.addEventListener) {
    signal.addEventListener("abort", () => requestController.abort(signal.reason), { once: true });
  }

  // Empty-turn recovery works on the original client history so each retry
  // re-derives its own frame from a clean base (original vs tail-only).
  const originalMessages = body.messages || [];
  let workingMessages = originalMessages;
  const tools = body.tools || [];
  // "Auto (Server Picks)" / "default" is a picker alias, not an AgentService
  // model id — sending it verbatim yields an empty turn. Resolve it to the
  // account's default agent-capable model from the live catalog before Run.
  let runModel = model;
  if (model === "default" || model === "auto") {
    const catalog = await resolveCursorModels(credentials, { signal, log });
    const selection = resolveAutoModelSelection(catalog?.models);
    if (selection) {
      log?.info?.("CURSOR", `auto model resolved: ${model} → ${selection.modelId} (${selection.matchedBy})`);
      runModel = selection.modelId;
    }
  }

  const openAgentSession = (frameMessages) => {
    const session = executor.openAgentHttp2Stream(url, headers, requestController.signal);
    session.write(buildAgentRunFrame(frameMessages, runModel, tools, body.reasoning_effort || body.reasoning?.effort));
    return session;
  };

  let session;
  try {
    session = openAgentSession(workingMessages);
  } catch (error) {
    throw new Error(`Cursor AgentService request failed: ${error.message}`);
  }
  let responseHeaders;
  try {
    responseHeaders = await session.responseHeaders;
  } catch (error) {
    session.close();
    throw new Error(`Cursor AgentService request failed: ${error.message}`);
  }

  const status = Number(responseHeaders[":status"] || 0);
  if (status !== 200) {
    let errorText = "";
    try {
      while (true) {
        const { done, value } = await session.read();
        if (done) break;
        errorText += Buffer.from(value).toString("utf8");
      }
    } catch {}
    session.close();
    return {
      response: new Response(JSON.stringify({
        error: { message: `Cursor AgentService ${status}: ${errorText || "request failed"}`, type: "api_error" },
      }), { status: status || HTTP_STATUS.SERVER_ERROR, headers: { "Content-Type": "application/json" } }),
      url,
      headers,
      transformedBody: body,
      responseFormat: FORMATS.OPENAI,
    };
  }

  // The Claude SSE translator derives Anthropic's message ID by stripping
  // `chatcmpl-`. Keep the remaining ID in Anthropic's required `msg_` form
  // so strict clients such as Claude Code accept the completed stream.
  const responseId = `chatcmpl-msg_${Date.now()}`;
  const created = Math.floor(Date.now() / 1000);
  const composerModel = isComposerModel(model);
  let pending = Buffer.alloc(0);
  let finished = false;
  let thinkingAcc = "";
  let emittedVisible = 0;
  let emittedText = false;

  const flushThinkingFallback = (onEvent) => {
    if (emittedText || !thinkingAcc) return;
    const fallback = composerModel
      ? visibleComposerContentFromThinking(thinkingAcc)
      : thinkingAcc.trim();
    if (fallback) {
      emittedText = true;
      onEvent({ type: "text", value: fallback });
    }
  };

  const consume = async (onEvent) => {
    const finishTurn = () => {
      flushThinkingFallback(onEvent);
      finished = true;
      if (emittedText) onEvent({ type: "done" });
      else onEvent({ type: "error", value: "Cursor AgentService returned an empty turn" });
    };
    try {
      while (!finished) {
        const { done, value } = await session.read();
        if (done) break;
        pending = Buffer.concat([pending, Buffer.from(value)]);
        pending = decodeAgentFrames(pending, (payload) => {
          // A single read can carry several frames; once the turn is over the
          // rest of the batch must not reach the already-closed controller.
          if (finished) return;
          const serverMessage = decodeMessage(payload);

          // agent.v1.AgentServerMessage.interaction_update
          if (serverMessage.has(1)) {
            const update = decodeMessage(serverMessage.get(1)[0].value);
            if (update.has(1)) {
              const textDelta = extractAgentString(decodeMessage(update.get(1)[0].value), 1);
              if (textDelta) {
                emittedText = true;
                onEvent({ type: "text", value: textDelta });
              }
            }
            // thinking_delta (field 4). Composer (and some Grok variants) put
            // the visible answer after </think> here and never send text_delta.
            if (update.has(4)) {
              const thinkingDelta = extractAgentString(decodeMessage(update.get(4)[0].value), 1);
              if (thinkingDelta) {
                thinkingAcc += thinkingDelta;
                if (composerModel) {
                  const visible = visibleComposerContentFromThinking(thinkingAcc);
                  if (visible.length > emittedVisible) {
                    const deltaContent = visible.slice(emittedVisible);
                    emittedVisible = visible.length;
                    emittedText = true;
                    onEvent({ type: "text", value: deltaContent });
                  }
                }
              }
            }
            // Keep unsigned reasoning upstream-only for Anthropic clients.
            if (update.has(14)) {
              finishTurn();
            }
          }

          // KvServerMessage (field 4): get/set blob. Ack so the stream proceeds.
          if (serverMessage.has(4)) {
            const kv = decodeMessage(serverMessage.get(4)[0].value);
            const kvId = kv.get(1)?.[0]?.value || 0;
            const metadata = kv.get(4)?.[0]?.value || null;
            if (kv.has(2)) {
              session.write(encodeKvClientMessage(kvId, 2, agentMessage(1, new Uint8Array()), metadata));
            } else if (kv.has(3)) {
              session.write(encodeKvClientMessage(kvId, 3, new Uint8Array(), metadata));
            }
          }

          // AgentService requests IDE context before producing a response.
          if (serverMessage.has(2)) {
            const execRequest = decodeMessage(serverMessage.get(2)[0].value);
            const execResult = handleAgentExecRequest(execRequest, { session, log, onEvent });
            if (execResult.finished) {
              finished = true;
            }
          }
        });
      }
      if (!finished) finishTurn();
    } finally {
      try { session.end(); } catch {}
      try { session.close(); } catch {}
    }
  };

  // One AgentService attempt on the current working frame. Returns sawContent
  // so the retry policy can tell a wedged long replay from a protocol empty.
  const runAgentTurn = async (onEvent) => {
    finished = false;
    emittedText = false;
    thinkingAcc = "";
    emittedVisible = 0;
    pending = Buffer.alloc(0);
    await consume(onEvent);
    return { sawContent: emittedText };
  };

  // Wrap events so we never retry once real output has reached the client.
  let outputStarted = false;
  const makeWrappedEvent = (onEvent) => (event) => {
    if (event.type === "text" || event.type === "thinking" || event.type === "tool_call") outputStarted = true;
    onEvent(event);
  };

  // Retry loop: fresh h2 session per attempt. An empty turn on a long replay
  // swaps to a tail-only frame; any other failure surfaces immediately.
  // While a retry is still available the empty-turn error event is withheld:
  // emitting it would close the SSE stream before recovery can run.
  const runWithRetry = async (onEvent) => {
    outputStarted = false;
    const wrapped = makeWrappedEvent(onEvent);
    let attempt = 0;
    for (;;) {
      let turnError = null;
      const result = await runAgentTurn((event) => {
        if (event.type === "error") turnError = event;
        else wrapped(event);
      });
      if (turnError && shouldRetryEmptyTurn(originalMessages.length) && !outputStarted && attempt < CURSOR_EMPTY_TURN_MAX_RETRIES && !requestController.signal.aborted) {
        attempt++;
        log?.info?.("CURSOR", `empty_turn on ${originalMessages.length}-message session; retry ${attempt}/${CURSOR_EMPTY_TURN_MAX_RETRIES} with tail-only frame`);
        workingMessages = tailOnlyCursorMessages(originalMessages);
        session = openAgentSession(workingMessages);
        const retryHeaders = await session.responseHeaders;
        const retryStatus = Number(retryHeaders[":status"] || 0);
        if (retryStatus !== 200) {
          wrapped(turnError);
          return result;
        }
        await new Promise((resolve) => setTimeout(resolve, CURSOR_EMPTY_TURN_RETRY_DELAY_MS));
        continue;
      }
      if (turnError) wrapped(turnError);
      return result;
    }
  };

  if (stream === false) {
    let content = "";
    let reasoning = "";
    let agentError = null;
    const toolCalls = [];
    let finishReason = "stop";
    await runWithRetry((event) => {
      if (event.type === "text") content += event.value;
      else if (event.type === "thinking") reasoning += event.value;
      else if (event.type === "tool_call") {
        toolCalls.push({
          id: event.value.id,
          type: "function",
          function: { name: event.value.name, arguments: event.value.arguments },
        });
        finishReason = "tool_calls";
      }
      else if (event.type === "error") agentError = event.value;
      else if (event.type === "done" && event.finishReason) finishReason = event.finishReason;
    });
    if (agentError) {
      return {
        response: new Response(JSON.stringify({ error: { message: agentError, type: "api_error" } }), {
          status: HTTP_STATUS.BAD_REQUEST,
          headers: { "Content-Type": "application/json" },
        }),
        url,
        headers,
        transformedBody: body,
        responseFormat: FORMATS.OPENAI,
      };
    }
    const message = {
      role: "assistant",
      content: content || null,
      ...(reasoning ? { reasoning_content: reasoning } : {}),
      ...(toolCalls.length ? { tool_calls: toolCalls } : {}),
    };
    return {
      response: new Response(JSON.stringify({
        id: responseId,
        object: "chat.completion",
        created,
        model,
        choices: [{ index: 0, message, finish_reason: finishReason }],
        usage: estimateUsage(body, content.length, FORMATS.OPENAI),
      }), { headers: { "Content-Type": "application/json" } }),
      url,
      headers,
      transformedBody: body,
      responseFormat: FORMATS.OPENAI,
    };
  }

  const encoder = new TextEncoder();
  const responseStream = new ReadableStream({
    start(controller) {
      // Defer terminal SSE until runWithRetry settles. Emitting stop on the
      // first empty upstream turn wedges Cursor before the tail-only retry
      // can recover the session.
      runWithRetry((event) => {
        if (event.type === "text") {
          controller.enqueue(encoder.encode(chatChunkSse({ id: responseId, created, model, delta: { content: event.value } })));
        } else if (event.type === "thinking") {
          controller.enqueue(encoder.encode(chatChunkSse({ id: responseId, created, model, delta: { reasoning_content: event.value } })));
        } else if (event.type === "tool_call") {
          controller.enqueue(encoder.encode(chatChunkSse({
            id: responseId, created, model,
            delta: {
              tool_calls: [{
                index: 0,
                id: event.value.id,
                type: "function",
                function: { name: event.value.name, arguments: event.value.arguments },
              }],
            },
          })));
        } else if (event.type === "error") {
          // An SSE error frame, not a content delta: a protocol failure must not
          // be rendered to the user as the assistant's reply, and downstream
          // usage tracking must not record the turn as a success.
          controller.enqueue(encoder.encode(sseChunk({ error: { message: event.value, type: "api_error" } })));
          controller.enqueue(encoder.encode(SSE_DONE));
          controller.close();
        } else if (event.type === "done") {
          controller.enqueue(encoder.encode(chatChunkSse({
            id: responseId, created, model, delta: {},
            finishReason: event.finishReason || "stop",
          })));
          controller.enqueue(encoder.encode(SSE_DONE));
          controller.close();
        }
      }).catch((error) => controller.error(error));
    },
    cancel() {
      requestController.abort();
    },
  });

  return {
    response: new Response(responseStream, { headers: SSE_HEADERS }),
    url,
    headers,
    transformedBody: body,
    responseFormat: FORMATS.OPENAI,
  };
}
