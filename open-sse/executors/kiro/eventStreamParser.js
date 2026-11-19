import { AWS_EVENTSTREAM } from "../../config/awsConstants.js";
import { crc32, parseEventFrame } from "../../utils/awsEventStream.js";
import { SSE_DONE, SSE_HEADERS } from "../../utils/sseConstants.js";
import { resolveKiroModel } from "../../config/kiroConstants.js";
import { getCapabilitiesForModel } from "../../providers/capabilities.js";
import { STREAM_FIRST_CHUNK_TIMEOUT_MS } from "../../config/runtimeConfig.js";
import { BaseExecutor } from "../base.js";
import {
  appendRepairInstruction,
  isEllipsisOnly,
  isShortFutureAction
} from "./requestBuilder.js";

export const KIRO_REPAIR_BUFFER_MAX_BYTES = 8 * 1024 * 1024;
export const KIRO_REPAIR_HEARTBEAT_MS = 10_000;
export const EVENTSTREAM_MAX_MESSAGE_BYTES = AWS_EVENTSTREAM.maxMessageBytes;
export const EVENTSTREAM_MAX_HEADERS_BYTES = AWS_EVENTSTREAM.maxHeadersBytes;
export const KIRO_EVENT_TYPES = new Set([
  "assistantResponseEvent",
  "reasoningContentEvent",
  "codeEvent",
  "toolUseEvent",
  "messageStopEvent",
  "metadataEvent",
  "MetadataEvent",
  "contextUsageEvent",
  "meteringEvent",
  "metricsEvent"
]);
export const KIRO_TRUNCATION_STOP_REASONS = new Set(["model_context_window_exceeded", "max_tokens"]);

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export function envPositiveInt(name, fallback) {
  const parsed = Number.parseInt(process.env?.[name] || "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function concatChunks(chunks, totalBytes) {
  const output = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return output;
}

export function makeAbortError(reason) {
  const error = new Error(reason?.message || reason || "Request aborted");
  error.name = "AbortError";
  return error;
}

export async function readWithTimeout(reader, signal, timeoutMs, message) {
  if (signal?.aborted) throw makeAbortError(signal.reason);
  let timeout;
  let abortHandler;
  const timeoutPromise = new Promise((_, reject) => {
    timeout = setTimeout(() => reject(new Error(message)), timeoutMs);
  });
  const abortPromise = new Promise((_, reject) => {
    abortHandler = () => reject(makeAbortError(signal.reason));
    signal?.addEventListener("abort", abortHandler, { once: true });
  });
  try {
    return await Promise.race([reader.read(), timeoutPromise, abortPromise]);
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener?.("abort", abortHandler);
  }
}

export async function readResponsePrefix(response, signal, maxBytes, timeoutMs) {
  const reader = response?.body?.getReader?.();
  if (!reader) return "";
  const chunks = [];
  let totalBytes = 0;
  try {
    while (totalBytes < maxBytes) {
      const { done, value } = await readWithTimeout(
        reader,
        signal,
        timeoutMs,
        "Kiro retry error body stalled"
      );
      if (done) break;
      const remaining = maxBytes - totalBytes;
      const chunk = value.byteLength > remaining ? value.slice(0, remaining) : value;
      chunks.push(chunk);
      totalBytes += chunk.byteLength;
      if (value.byteLength > remaining) break;
    }
  } finally {
    await reader.cancel("bounded Kiro retry error body").catch(() => {});
  }
  return decoder.decode(concatChunks(chunks, totalBytes));
}

export function normalizeStopReason(value) {
  const reason = String(value || "").trim().replace(/([a-z])([A-Z])/g, "$1_$2").toLowerCase().replace(/[\s-]+/g, "_");
  if (["endturn", "end_turn", "stop", "stop_sequence"].includes(reason)) return "end_turn";
  if (["tooluse", "tool_use", "tool_calls"].includes(reason)) return "tool_use";
  if (["maxtokens", "max_tokens", "max_output_tokens", "length"].includes(reason)) return "max_tokens";
  return reason || null;
}

// Of the reasons stopDisposition() folds into "terminal_incomplete", only these
// mean "usable as far as it got, then the budget ran out" -- the case
// finish_reason "length" exists for. cancelled / pause_turn are abandoned turns
// whose partial content must stay private, so they are deliberately absent.
export function stopDisposition(stopReason, hasToolCalls) {
  if (["malformed_model_output", "invalid_model_output"].includes(stopReason)) return "retryable_protocol_failure";
  if (["cancelled", "pause_turn", "model_context_window_exceeded"].includes(stopReason)) return "terminal_incomplete";
  if (stopReason === "refusal" || /(?:content.*filter|guardrail|safety|policy|blocked)/u.test(stopReason)) return "terminal_refusal";
  if (stopReason === "max_tokens") return hasToolCalls ? "terminal_incomplete" : "length";
  if (stopReason && !["end_turn", "tool_use"].includes(stopReason)) return "unknown_failure";
  if (hasToolCalls || stopReason === "tool_use") return "tool_use";
  if (!stopReason || stopReason === "end_turn") return "complete";
  return "unknown_failure";
}

export function mergeStopReason(current, incoming) {
  if (!incoming) return current;
  if (!current) return incoming;
  const severity = (reason) => {
    const disposition = stopDisposition(reason, false);
    if (disposition === "terminal_refusal") return 6;
    if (disposition === "terminal_incomplete") return 5;
    if (disposition === "unknown_failure") return 4;
    if (disposition === "retryable_protocol_failure") return 3;
    if (disposition === "length") return 2;
    return 1;
  };
  return severity(incoming) > severity(current) ? incoming : current;
}

export function encodeSSEError(code, message, details) {
  return encoder.encode(`data: ${JSON.stringify({ error: {
    message,
    type: "upstream_error",
    code,
    ...(details ? { details } : {})
  } })}\n\ndata: [DONE]\n\n`);
}

export function inspectSSEChunk(chunk, state) {
  for (const line of decoder.decode(chunk).split("\n")) {
    if (!line.startsWith("data: ")) continue;
    const data = line.slice(6).trim();
    if (!data || data === "[DONE]") continue;
    try {
      const event = JSON.parse(data);
      if (event.error) state.error = event.error;
      for (const choice of event.choices || []) {
        const delta = choice.delta || {};
        if (typeof delta.content === "string") state.content += delta.content;
        if (typeof delta.reasoning_content === "string") state.reasoning += delta.reasoning_content;
        if (delta.tool_calls?.length) state.hasToolCalls = true;
      }
    } catch { /* a malformed SSE line is diagnosed by the transformer */ }
  }
}

export function transformEventStreamToSSE(response, model, options = {}) {
  const responseId = `chatcmpl-${Date.now()}`;
  const created = Math.floor(Date.now() / 1000);
  const capabilityModel = resolveKiroModel(model).upstream;
  const contextWindow = getCapabilitiesForModel("kiro", capabilityModel).contextWindow || 200000;
  const eventCounts = {};
  const state = {
    buffer: new Uint8Array(0),
    chunkIndex: 0,
    toolCounter: 0,
    tools: new Map(),
    bufferedToolBytes: 0,
    hasText: false,
    hasReasoning: false,
    hasCode: false,
    hasToolCalls: false,
    sawToolUse: false,
    explicitStop: false,
    stopReason: null,
    terminalProvenance: null,
    transportState: "consuming_response",
    totalContentLength: 0,
    contextUsagePercentage: 0,
    hasContextUsage: false,
    hasMetering: false,
    usage: null,
    inThinking: false,
    toolValidationError: null,
    validatedFrames: 0,
    finished: false
  };

  const diagnostics = (overrides = {}) => ({
    terminal_provenance: state.terminalProvenance || "clean_eventstream_eof",
    transport_state: state.transportState,
    stop_reason: state.stopReason,
    stop_disposition: stopDisposition(state.stopReason, state.hasToolCalls),
    response_state: state.hasToolCalls
      ? "valid_tool"
      : state.hasText || state.hasReasoning || state.hasCode
        ? "text_reasoning"
        : state.explicitStop
          ? "explicit_stop"
          : "no_semantic_output",
    event_counts: { ...eventCounts },
    incomplete_frame_bytes: state.buffer.byteLength,
    ...overrides
  });
  const sseChunk = (delta, finishReason = null, usage) => encoder.encode(`data: ${JSON.stringify({
    id: responseId,
    object: "chat.completion.chunk",
    created,
    model,
    choices: [{ index: 0, delta, finish_reason: finishReason }],
    ...(usage ? { usage } : {})
  })}\n\n`);
  const emitDelta = (controller, delta) => {
    if (state.chunkIndex === 0) delta = { role: "assistant", ...delta };
    state.chunkIndex++;
    controller.enqueue(sseChunk(delta));
  };
  const fail = (controller, provenance, code, message, extra = {}) => {
    state.finished = true;
    state.terminalProvenance = provenance;
    state.transportState = extra.transport_state || "corrupt_frame";
    const detail = diagnostics({
      stop_disposition: extra.stop_disposition || "terminal_incomplete",
      ...extra
    });
    options.onTerminalState?.(detail);
    controller.enqueue(encodeSSEError(code, message, detail));
  };
  const assertToolBufferBound = () => {
    if (state.bufferedToolBytes <= (options.maxToolBytes || KIRO_REPAIR_BUFFER_MAX_BYTES / 2)) return;
    const error = new Error("Kiro buffered tool input exceeded the integrity memory bound");
    error.code = "KIRO_BUFFER_EXCEEDED";
    throw error;
  };
  const appendToolInput = (tool, input) => {
    if (input === undefined) return;
    if (typeof input === "string") {
      if (tool.inputKind && tool.inputKind !== "string") throw new Error("Kiro tool input changed fragment type");
      tool.inputKind = "string";
      tool.inputChunks ||= [];
      tool.inputChunks.push(input);
      state.bufferedToolBytes += encoder.encode(input).byteLength;
    } else if (input && typeof input === "object" && !Array.isArray(input)) {
      if (tool.inputKind && tool.inputKind !== "object") throw new Error("Kiro tool input changed fragment type");
      tool.inputKind = "object";
      state.bufferedToolBytes -= tool.inputBytes || 0;
      tool.inputObject = input;
      tool.inputBytes = encoder.encode(JSON.stringify(input)).byteLength;
      state.bufferedToolBytes += tool.inputBytes;
    } else {
      throw new Error("Kiro tool input must be a JSON object");
    }
    assertToolBufferBound();
  };
  const parsedToolInput = (tool) => {
    if (!tool.inputKind) throw new Error("Kiro tool call is missing input");
    if (tool.inputKind === "object") return tool.inputObject;
    try {
      const input = JSON.parse(tool.inputChunks.join(""));
      if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("not an object");
      return input;
    } catch (error) {
      throw new Error(`Kiro tool input must be valid object JSON (${error.message})`);
    }
  };
  const emitTools = (controller) => {
    for (const tool of state.tools.values()) {
      // Validate per tool, not per turn: one unusable fragment used to throw out
      // of emitTools and take every other complete tool call in the same turn
      // with it, which the client saw as a turn that answered nothing.
      let input;
      try {
        input = parsedToolInput(tool);
        if (tool.name === "tool_call") {
          if (typeof input.name !== "string" || !input.name.trim()) {
            throw new Error("Invalid Kiro tool_call payload: missing nested MCP tool name");
          }
          if (!Object.prototype.hasOwnProperty.call(input, "arguments")) {
            throw new Error("Invalid Kiro tool_call payload: missing nested MCP tool arguments");
          }
        }
      } catch (error) {
        state.droppedTools = (state.droppedTools || 0) + 1;
        state.toolValidationError ||= error.message;
        console.error(`[Kiro] dropping unusable tool call ${tool.id} (${tool.name}): ${error.message}`);
        continue;
      }
      const index = state.toolCounter++;
      emitDelta(controller, {
        tool_calls: [{
          index,
          id: tool.id,
          type: "function",
          function: { name: tool.name, arguments: "" }
        }]
      });
      const serializedInput = JSON.stringify(input);
      emitDelta(controller, {
        tool_calls: [{ index, function: { arguments: serializedInput } }]
      });
      // Tool arguments are billed output like any other completion bytes. They
      // were never added to totalContentLength, so the /4 estimator in finish()
      // reported OUT 0 -- or the Math.max floor of 1 -- for every turn whose
      // entire answer was a tool call.
      state.totalContentLength += tool.name.length + serializedInput.length;
      state.hasToolCalls = true;
    }
    state.tools.clear();
    state.bufferedToolBytes = 0;
    // A declared tool turn that emitted no usable call is only fatal when the
    // turn produced nothing else. Throwing unconditionally here escaped
    // emitTools() with provenance "invalid_tool_call", which the integrity gate
    // re-derived into a repair retry -- discarding text the client had already
    // been promised.
    if (state.stopReason === "tool_use" && !state.hasToolCalls &&
        !state.hasText && !state.hasReasoning && !state.hasCode) {
      throw new Error("Kiro tool_use stop reason did not include a complete tool call");
    }
  };
  const processEvent = (event, controller) => {
    const messageType = event.headers[":message-type"];
    if (messageType === "error" || messageType === "exception") {
      fail(
        controller,
        "upstream_eventstream_error",
        "kiro_upstream_eventstream_error",
        event.payload?.message || `Kiro upstream sent an EventStream ${messageType}`,
        { transport_state: "upstream_error" }
      );
      return false;
    }

    const eventType = event.headers[":event-type"] || "";
    const eventCountKey = KIRO_EVENT_TYPES.has(eventType) ? eventType : "other";
    eventCounts[eventCountKey] = (eventCounts[eventCountKey] || 0) + 1;
    if (eventType === "assistantResponseEvent" && typeof event.payload?.content === "string") {
      let content = event.payload.content;
      if (state.inThinking) {
        const end = content.indexOf("</thinking>");
        if (end < 0) content = "";
        else {
          state.inThinking = false;
          content = content.slice(end + 11).replace(/^\n/u, "");
        }
      } else {
        const start = content.indexOf("<thinking>");
        if (start >= 0) {
          const end = content.indexOf("</thinking>", start + 10);
          if (end < 0) {
            state.inThinking = true;
            content = content.slice(0, start);
          } else {
            content = content.slice(0, start) + content.slice(end + 11).replace(/^\n/u, "");
          }
        }
      }
      if (content || !state.hasReasoning) {
        state.hasText ||= content.length > 0;
        state.totalContentLength += content.length;
        emitDelta(controller, { content });
      }
    } else if (eventType === "reasoningContentEvent") {
      const value = event.payload?.reasoningContentEvent || event.payload || {};
      const content = typeof value === "string" ? value : value.text || value.content || "";
      if (content) {
        state.hasReasoning = true;
        state.totalContentLength += content.length;
        emitDelta(controller, { reasoning_content: content });
      }
    } else if (eventType === "codeEvent" && typeof event.payload?.content === "string") {
      state.hasCode = true;
      state.totalContentLength += event.payload.content.length;
      emitDelta(controller, { content: event.payload.content });
    } else if (eventType === "toolUseEvent") {
      state.sawToolUse = true;
      const values = Array.isArray(event.payload) ? event.payload : [event.payload];
      if (!values[0]) throw new Error("Kiro toolUseEvent is empty");
      for (const value of values) {
        const name = typeof value?.name === "string" ? value.name.trim() : "";
        if (!name) throw new Error("Kiro toolUseEvent is missing a tool name");
        let id;
        if (value.toolUseId == null) {
          id = `call_${created}_${state.tools.size + 1}`;
        } else if (typeof value.toolUseId !== "string" || !value.toolUseId.trim()) {
          throw new Error("Kiro toolUseEvent has an invalid toolUseId");
        } else {
          id = value.toolUseId;
        }
        let tool = state.tools.get(id);
        if (!tool) {
          tool = { id, name };
          state.tools.set(id, tool);
          state.bufferedToolBytes += encoder.encode(id).byteLength + encoder.encode(name).byteLength + 32;
          assertToolBufferBound();
        } else if (tool.name !== name) {
          throw new Error("Kiro tool name changed between fragments");
        }
        appendToolInput(tool, value.input);
      }
    } else if (eventType === "messageStopEvent") {
      state.explicitStop = true;
      const reason = normalizeStopReason(
        event.payload?.stopReason ?? event.payload?.stop_reason
      ) || (state.sawToolUse ? "tool_use" : "end_turn");
      const merged = mergeStopReason(state.stopReason, reason);
      if (merged !== state.stopReason) state.terminalProvenance = "message_stop_event";
      state.stopReason = merged;
    } else if (eventType === "metadataEvent" || eventType === "MetadataEvent") {
      const metadata = event.payload?.metadataEvent || event.payload?.metadata || event.payload;
      const reason = normalizeStopReason(metadata?.stopReason ?? metadata?.stop_reason);
      if (reason) {
        state.explicitStop = true;
        const merged = mergeStopReason(state.stopReason, reason);
        if (merged !== state.stopReason) state.terminalProvenance = "metadata_stop_reason";
        state.stopReason = merged;
      }
    } else if (eventType === "contextUsageEvent") {
      const percentage = Number(event.payload?.contextUsagePercentage);
      if (Number.isFinite(percentage)) {
        state.contextUsagePercentage = percentage;
        state.hasContextUsage = true;
      }
    } else if (eventType === "meteringEvent") {
      state.hasMetering = true;
      const metering = event.payload?.meteringEvent || event.payload || {};
      const credits = Number(metering.usage);
      if (Number.isFinite(credits)) {
        state.usage = {
          ...(state.usage || {}),
          kiro_credits: credits,
          kiro_credit_unit: typeof metering.unit === "string" ? metering.unit : "credit"
        };
      }
    } else if (eventType === "metricsEvent") {
      const metrics = event.payload?.metricsEvent || event.payload || {};
      const prompt = Number(metrics.inputTokens) || 0;
      const completion = Number(metrics.outputTokens) || 0;
      if (prompt || completion) {
        state.usage = {
          ...(state.usage || {}),
          prompt_tokens: prompt,
          completion_tokens: completion,
          total_tokens: prompt + completion
        };
        const cacheRead = Number(metrics.cacheReadInputTokens || metrics.cache_read_input_tokens) || 0;
        const cacheCreate = Number(metrics.cacheCreationInputTokens || metrics.cache_creation_input_tokens) || 0;
        if (cacheRead) state.usage.cache_read_input_tokens = cacheRead;
        if (cacheCreate) state.usage.cache_creation_input_tokens = cacheCreate;
      }
    }
    return true;
  };
  const processBytes = (chunk, controller) => {
    const combinedLength = state.buffer.byteLength + chunk.byteLength;
    if (combinedLength > (options.maxRawBytes || EVENTSTREAM_MAX_MESSAGE_BYTES)) {
      fail(
        controller,
        "corrupt_eventstream_frame",
        "kiro_missing_terminal",
        "Kiro EventStream buffered bytes exceed the protocol bound"
      );
      return false;
    }
    if (state.buffer.byteLength === 0) {
      state.buffer = chunk;
    } else {
      const joined = new Uint8Array(combinedLength);
      joined.set(state.buffer);
      joined.set(chunk, state.buffer.byteLength);
      state.buffer = joined;
    }

    while (state.buffer.byteLength >= 12) {
      const view = new DataView(state.buffer.buffer, state.buffer.byteOffset);
      if (view.getUint32(8, false) !== crc32(state.buffer.subarray(0, 8))) {
        fail(controller, "corrupt_eventstream_frame", "kiro_missing_terminal", "Kiro EventStream prelude CRC mismatch");
        return false;
      }
      const totalLength = view.getUint32(0, false);
      const headersLength = view.getUint32(4, false);
      if (totalLength < 16 || totalLength > EVENTSTREAM_MAX_MESSAGE_BYTES ||
          headersLength > EVENTSTREAM_MAX_HEADERS_BYTES || headersLength > totalLength - 16) {
        fail(controller, "corrupt_eventstream_frame", "kiro_missing_terminal", "Kiro EventStream frame bounds are invalid");
        return false;
      }
      if (state.buffer.byteLength < totalLength) break;
      const frame = state.buffer.slice(0, totalLength);
      state.buffer = state.buffer.slice(totalLength);
      let event;
      try {
        event = parseEventFrame(frame);
      } catch (error) {
        fail(controller, "corrupt_eventstream_frame", "kiro_missing_terminal", error.message);
        return false;
      }
      state.transportState = "valid_complete_frame";
      state.validatedFrames++;
      try {
        if (!processEvent(event, controller)) return false;
      } catch (error) {
        const bufferExceeded = error.code === "KIRO_BUFFER_EXCEEDED";
        if (!bufferExceeded) {
          // Keep whatever is already buffered: the rejected fragment belongs to
          // one tool, and clearing the map dropped the complete calls too.
          state.toolValidationError ||= error.message;
          console.error(`[Kiro] tool fragment rejected, keeping ${state.tools.size} buffered tool(s): ${error.message}`);
          continue;
        }
        fail(
          controller,
          "integrity_buffer_exceeded",
          "kiro_integrity_buffer_exceeded",
          error.message,
          {
            transport_state: state.transportState,
            stop_disposition: "terminal_incomplete"
          }
        );
        return false;
      }
    }
    return true;
  };
  const finish = (controller) => {
    if (state.finished) return;
    if (state.buffer.byteLength) {
      fail(
        controller,
        "incomplete_eventstream_frame",
        "kiro_missing_terminal",
        "Kiro EventStream ended with a truncated frame",
        { transport_state: "incomplete_frame" }
      );
      return;
    }
    state.transportState = "clean_eof";
    const declaredDisposition = stopDisposition(state.stopReason, state.sawToolUse);
    // model_context_window_exceeded / max_tokens map to terminal_incomplete. When
    // they arrive after the model already streamed content, fail() threw away a
    // complete-enough answer; a truncated turn is what finish_reason "length" is
    // for. chunkIndex > 0 means at least one delta already reached the client.
    const declaredTruncatedAfterOutput = declaredDisposition === "terminal_incomplete" &&
      KIRO_TRUNCATION_STOP_REASONS.has(state.stopReason) && state.chunkIndex > 0;
    if (declaredTruncatedAfterOutput) {
      console.error(`[Kiro] truncated after ${state.chunkIndex} chunk(s) (stop_reason=${state.stopReason}); keeping output`);
    }
    if (!declaredTruncatedAfterOutput && ["retryable_protocol_failure", "terminal_incomplete", "terminal_refusal", "unknown_failure"].includes(declaredDisposition)) {
      const code = declaredDisposition === "retryable_protocol_failure"
        ? "kiro_retryable_protocol_failure"
        : declaredDisposition === "terminal_refusal"
          ? "kiro_terminal_refusal"
          : declaredDisposition === "terminal_incomplete"
            ? "kiro_terminal_incomplete"
            : "kiro_unknown_stop_reason";
      fail(
        controller,
        state.terminalProvenance || "metadata_stop_reason",
        code,
        `Kiro ended with non-success stop reason: ${state.stopReason}`,
        { transport_state: state.transportState, stop_disposition: declaredDisposition }
      );
      return;
    }
    try {
      emitTools(controller);
    } catch (error) {
      fail(
        controller,
        "invalid_tool_call",
        "invalid_kiro_tool_call",
        error.message,
        { transport_state: state.transportState, stop_disposition: "retryable_protocol_failure" }
      );
      return;
    }
    // Fail only when the turn has nothing usable left. emitTools() validates
    // per tool and drops just the unusable ones, so this has to run AFTER it:
    // before, the rejected tool was still buffered and tools.size was never 0.
    // A turn that also produced text keeps that text -- the dropped call is
    // logged, not fatal.
    if (state.toolValidationError && !state.hasToolCalls &&
        !state.hasText && !state.hasReasoning && !state.hasCode) {
      fail(
        controller,
        "invalid_tool_call",
        "invalid_kiro_tool_call",
        state.toolValidationError,
        { transport_state: state.transportState, stop_disposition: "retryable_protocol_failure" }
      );
      return;
    }

    const hasOutput = state.hasText || state.hasReasoning || state.hasCode || state.hasToolCalls;
    if (!hasOutput && !state.explicitStop) {
      fail(
        controller,
        "empty_response_eof",
        "kiro_missing_terminal",
        "Kiro EventStream ended without model output",
        { transport_state: state.transportState }
      );
      return;
    }

    const disposition = stopDisposition(state.stopReason, state.hasToolCalls);
    // Same reasoning as declaredTruncatedAfterOutput above.
    const truncatedAfterOutput = disposition === "terminal_incomplete" &&
      KIRO_TRUNCATION_STOP_REASONS.has(state.stopReason) && state.chunkIndex > 0;
    if (truncatedAfterOutput) {
      console.error(`[Kiro] truncated after ${state.chunkIndex} chunk(s) (stop_reason=${state.stopReason}); closing as length`);
    }
    if (!truncatedAfterOutput && ["retryable_protocol_failure", "terminal_incomplete", "terminal_refusal", "unknown_failure"].includes(disposition)) {
      const code = disposition === "retryable_protocol_failure"
        ? "kiro_retryable_protocol_failure"
        : disposition === "terminal_refusal"
          ? "kiro_terminal_refusal"
          : disposition === "terminal_incomplete"
            ? "kiro_terminal_incomplete"
            : "kiro_unknown_stop_reason";
      fail(
        controller,
        state.terminalProvenance || "metadata_stop_reason",
        code,
        `Kiro ended with non-success stop reason: ${state.stopReason}`,
        { transport_state: state.transportState, stop_disposition: disposition }
      );
      return;
    }

    if (state.hasMetering && state.hasContextUsage && !state.usage?.total_tokens) {
      const completion = state.totalContentLength
        ? Math.max(1, Math.floor(state.totalContentLength / 4))
        : 0;
      const prompt = Math.floor(state.contextUsagePercentage * contextWindow / 100);
      state.usage = {
        ...(state.usage || {}),
        prompt_tokens: prompt,
        completion_tokens: completion,
        total_tokens: prompt + completion
      };
    }
    const finishReason = truncatedAfterOutput
      ? "length"
      : state.hasToolCalls
        ? "tool_calls"
        : disposition === "length"
          ? "length"
          : "stop";
    controller.enqueue(sseChunk({}, finishReason, state.usage));
    controller.enqueue(encoder.encode(SSE_DONE));
    state.finished = true;
    options.onTerminalState?.(diagnostics({
      terminal_provenance: state.terminalProvenance || "clean_eventstream_eof",
      transport_state: state.transportState,
      // Report what this exit actually did, not the raw disposition. The
      // integrity gate re-derives its verdict from stop_disposition, so
      // reporting "terminal_incomplete" for a turn we deliberately kept made
      // it discard the very bytes we just released to the client.
      stop_disposition: truncatedAfterOutput ? "length" : disposition
    }));
  };

  if (!response.body) {
    const detail = diagnostics({
      terminal_provenance: "missing_response_body",
      transport_state: "missing_body",
      stop_disposition: "terminal_incomplete"
    });
    options.onTerminalState?.(detail);
    return new Response(encodeSSEError(
      "kiro_missing_terminal",
      "Kiro response did not include an EventStream body",
      detail
    ), { status: response.status, headers: { ...SSE_HEADERS } });
  }

  const reader = response.body.getReader();
  const stream = new ReadableStream({
    start: async (controller) => {
      try {
        while (!state.finished) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunksBefore = state.chunkIndex;
          const framesBefore = state.validatedFrames;
          if (!processBytes(value, controller)) {
            await reader.cancel("invalid Kiro EventStream").catch(() => {});
            break;
          }
          if (state.validatedFrames > framesBefore && state.chunkIndex === chunksBefore) {
            controller.enqueue(encoder.encode(": kiro-upstream\n\n"));
          }
        }
        finish(controller);
        controller.close();
      } catch (error) {
        if (!state.finished) {
          fail(
            controller,
            "upstream_read_error",
            "kiro_missing_terminal",
            error.message || "Kiro EventStream read failed",
            { transport_state: "upstream_error" }
          );
        }
        controller.close();
      }
    },
    cancel(reason) {
      return reader.cancel(reason);
    }
  });
  return new Response(stream, {
    status: response.status,
    statusText: response.statusText,
    headers: { ...SSE_HEADERS }
  });
}

export function integrityFailureSSE(attempt) {
  const disposition = attempt.diagnostics?.stop_disposition;
  const code = attempt.diagnostics?.terminal_provenance === "integrity_buffer_exceeded"
    ? "kiro_integrity_buffer_exceeded"
    : attempt.kind === "upstream_error"
    ? "kiro_upstream_eventstream_error"
    : disposition === "terminal_refusal"
      ? "kiro_terminal_refusal"
      : disposition === "terminal_incomplete"
        ? "kiro_terminal_incomplete"
        : "kiro_unknown_stop_reason";
  return encodeSSEError(code, attempt.message || "Kiro stream ended with a terminal failure", attempt.diagnostics);
}

export async function readIntegrityAttempt(executor, rawResponse, model, options, attempt) {
  let diagnostics;
  const transform = executor?.transformEventStreamToSSE
    ? executor.transformEventStreamToSSE.bind(executor)
    : transformEventStreamToSSE;
  const transformed = transform(rawResponse, model, {
    maxToolBytes: Math.max(1, Math.floor(options.maxBytes / 2)),
    onTerminalState: (value) => {
      diagnostics = value;
    }
  });
  const reader = transformed.body.getReader();
  const chunks = [];
  let totalBytes = 0;
  let sawChunk = false;
  const output = { content: "", reasoning: "", hasToolCalls: false, error: null };

  try {
    while (true) {
      const timeoutMs = sawChunk ? options.stallTimeoutMs : options.ttftTimeoutMs;
      const phase = sawChunk ? "stalled" : "timed out before first chunk";
      const { done, value } = await readWithTimeout(
        reader,
        options.signal,
        timeoutMs,
        `Kiro integrity validation ${phase}`
      );
      if (done) break;
      sawChunk = true;
      totalBytes += value.byteLength;
      if (totalBytes > options.maxBytes) {
        await reader.cancel("kiro_integrity_buffer_exceeded").catch(() => {});
        return {
          kind: "terminal_stop",
          message: `Kiro integrity buffer exceeded ${options.maxBytes} bytes`,
          diagnostics: { terminal_provenance: "integrity_buffer_exceeded" }
        };
      }
      chunks.push(value);
      inspectSSEChunk(value, output);
    }
  } catch (error) {
    await reader.cancel(error.message).catch(() => {});
    throw error;
  }

  const safeDiagnostics = {
    attempt,
    terminal_provenance: diagnostics?.terminal_provenance || "missing_terminal_diagnostics",
    transport_state: diagnostics?.transport_state || "unknown",
    stop_reason: diagnostics?.stop_reason || null,
    stop_disposition: diagnostics?.stop_disposition || "terminal_incomplete",
    response_state: diagnostics?.response_state || "no_semantic_output",
    event_counts: diagnostics?.event_counts || {},
    incomplete_frame_bytes: diagnostics?.incomplete_frame_bytes || 0
  };
  if (safeDiagnostics.stop_disposition === "retryable_protocol_failure") {
    const kind = safeDiagnostics.terminal_provenance === "invalid_tool_call"
      ? "invalid_tool"
      : "retryable_stop";
    return { kind, message: output.error?.message, diagnostics: safeDiagnostics };
  }
  if (safeDiagnostics.stop_disposition === "terminal_incomplete" ||
      safeDiagnostics.stop_disposition === "terminal_refusal" ||
      safeDiagnostics.stop_disposition === "unknown_failure") {
    const kind = safeDiagnostics.terminal_provenance === "upstream_eventstream_error"
      ? "upstream_error"
      : safeDiagnostics.terminal_provenance === "integrity_buffer_exceeded"
        ? "terminal_stop"
      : ["metadata_stop_reason", "message_stop_event"].includes(safeDiagnostics.terminal_provenance)
        ? "terminal_stop"
        : "missing_terminal";
    return { kind, message: output.error?.message, diagnostics: safeDiagnostics };
  }
  if (output.error) {
    return { kind: "missing_terminal", message: output.error.message, diagnostics: safeDiagnostics };
  }
  if (!output.hasToolCalls) {
    if (isEllipsisOnly(output.content) ||
        (!output.content.trim() && isEllipsisOnly(output.reasoning))) {
      return { kind: "ellipsis", diagnostics: safeDiagnostics };
    }
    if (isShortFutureAction(output.content)) {
      return { kind: "short_final", diagnostics: safeDiagnostics };
    }
  }
  return { kind: "complete", bytes: concatChunks(chunks, totalBytes), diagnostics: safeDiagnostics };
}

export async function readRecoverableIntegrityAttempt(executor, rawResponse, model, options, attempt) {
  try {
    const read = executor?.readIntegrityAttempt
      ? executor.readIntegrityAttempt.bind(executor)
      : (resp, mod, opt, att) => readIntegrityAttempt(executor, resp, mod, opt, att);
    return await read(rawResponse, model, options, attempt);
  } catch (error) {
    if (error.name === "AbortError") throw error;
    return {
      kind: "missing_terminal",
      message: error.message || "Kiro transport read failed",
      diagnostics: {
        attempt,
        terminal_provenance: "transport_read_error",
        transport_state: "upstream_error",
        stop_reason: null,
        stop_disposition: "terminal_incomplete",
        response_state: "no_semantic_output",
        event_counts: {},
        incomplete_frame_bytes: 0
      }
    };
  }
}

export async function runIntegrityRecovery(executor, rawResponse, args, options) {
  const readRecoverable = executor?.readRecoverableIntegrityAttempt
    ? executor.readRecoverableIntegrityAttempt.bind(executor)
    : (resp, mod, opt, att) => readRecoverableIntegrityAttempt(executor, resp, mod, opt, att);
  const failureSSE = executor?.integrityFailureSSE
    ? executor.integrityFailureSSE.bind(executor)
    : integrityFailureSSE;

  const first = await readRecoverable(
    rawResponse,
    args.model,
    options,
    "initial"
  );
  if (first.kind === "complete") return first.bytes;
  if (first.kind === "terminal_stop" || first.kind === "upstream_error") {
    return failureSSE(first);
  }
  if (first.kind === "invalid_tool" && !options.repairEnabled) {
    return encodeSSEError("invalid_kiro_tool_call", first.message, first.diagnostics);
  }

  const repairKind = ["ellipsis", "short_final", "invalid_tool"].includes(first.kind)
    ? first.kind
    : null;
  const repairBody = repairKind
    ? appendRepairInstruction(args.body, repairKind === "invalid_tool" ? "tool" : repairKind)
    : structuredClone(args.body || {});

  const retry = await BaseExecutor.prototype.execute.call(executor, {
    ...args,
    body: repairBody,
    signal: options.signal
  });
  if (!retry?.response?.ok) {
    let body = "";
    try {
      body = await readResponsePrefix(
        retry?.response,
        options.signal,
        Math.min(options.maxBytes, 4096),
        options.stallTimeoutMs
      );
    } catch (error) {
      if (error.name === "AbortError") throw error;
    }
    return encodeSSEError(
      "kiro_integrity_retry_upstream_error",
      body || `Kiro integrity retry failed with HTTP ${retry?.response?.status || 502}`,
      { status: retry?.response?.status || 502 }
    );
  }

  const second = await readRecoverable(
    retry.response,
    args.model,
    options,
    "retry"
  );
  if (second.kind === "complete") return second.bytes;
  if (second.kind === "terminal_stop" || second.kind === "upstream_error") {
    return failureSSE(second);
  }
  const code = second.kind === "ellipsis"
    ? "kiro_ellipsis_retry_failed"
    : second.kind === "short_final"
      ? "kiro_short_final_retry_failed"
      : second.kind === "invalid_tool"
        ? "kiro_tool_call_repair_retry_failed"
        : "kiro_missing_terminal_retry_failed";
  return encodeSSEError(
    code,
    `Kiro integrity validation failed after one bounded retry: ${second.message || second.kind}`,
    { attempts: [first.diagnostics, second.diagnostics].filter(Boolean) }
  );
}

export function attachIntegrityGate(executor, result, args) {
  const abortController = new AbortController();
  const maxBytes = envPositiveInt("KIRO_TOOL_CALL_REPAIR_BUFFER_MAX_BYTES", KIRO_REPAIR_BUFFER_MAX_BYTES);
  const legacyTimeout = envPositiveInt("KIRO_TOOL_CALL_REPAIR_TIMEOUT_MS", STREAM_FIRST_CHUNK_TIMEOUT_MS);
  const ttftTimeoutMs = envPositiveInt("KIRO_TOOL_CALL_REPAIR_TTFT_TIMEOUT_MS", legacyTimeout);
  const stallTimeoutMs = envPositiveInt("KIRO_TOOL_CALL_REPAIR_STALL_TIMEOUT_MS", legacyTimeout);
  const repairEnabled = args.credentials?.providerSpecificData?.kiroToolCallRepair !== false &&
    process.env.KIRO_TOOL_CALL_REPAIR !== "false";
  const forwardAbort = () => abortController.abort(args.signal?.reason);
  args.signal?.addEventListener("abort", forwardAbort, { once: true });
  let open = true;
  let heartbeatTimer;

  const recoveryRunner = executor?.runIntegrityRecovery
    ? executor.runIntegrityRecovery.bind(executor)
    : (rawResp, a, opt) => runIntegrityRecovery(executor, rawResp, a, opt);

  const stream = new ReadableStream({
    start: async (controller) => {
      const heartbeat = () => {
        if (!open) return;
        try {
          controller.enqueue(encoder.encode(": kiro-validation\n\n"));
        } catch {
          open = false;
        }
      };
      heartbeat();
      heartbeatTimer = setInterval(heartbeat, KIRO_REPAIR_HEARTBEAT_MS);

      try {
        const bytes = await recoveryRunner(result.response, args, {
          signal: abortController.signal,
          maxBytes,
          ttftTimeoutMs,
          stallTimeoutMs,
          repairEnabled
        });
        if (abortController.signal.aborted) throw makeAbortError(abortController.signal.reason);
        controller.enqueue(bytes);
        controller.close();
      } catch (error) {
        if (open && error.name === "AbortError") {
          controller.error(error);
        } else if (open && error.name !== "AbortError") {
          controller.enqueue(encodeSSEError(
            "kiro_integrity_gate_failed",
            error.message || "Kiro integrity validation failed"
          ));
          controller.close();
        }
      } finally {
        open = false;
        clearInterval(heartbeatTimer);
        args.signal?.removeEventListener?.("abort", forwardAbort);
      }
    },
    cancel(reason) {
      open = false;
      clearInterval(heartbeatTimer);
      abortController.abort(reason || "client cancelled");
    }
  });

  result.response = new Response(stream, {
    status: result.response.status,
    statusText: result.response.statusText,
    headers: { ...SSE_HEADERS }
  });
}

export { crc32, parseEventFrame };
