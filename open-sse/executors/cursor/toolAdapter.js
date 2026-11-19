import crypto from "crypto";
import { generateCursorBody, decodeMcpArgs } from "../../utils/cursorProtobuf.js";
import { createRequestContextResponse, rejectExecRequest } from "./wireFraming.js";
import { chatChunkSse } from "../../utils/sse.js";

/** Upstream payload normalization: transform OpenAI format to Cursor protobuf body. */
export function transformCursorRequest(model, body, stream, credentials) {
  // Messages are already translated by chatCore (claude→openai→cursor)
  // Do NOT call openaiToCursorRequest again — double-translation drops tool_results
  const messages = body?.messages || [];
  const tools = body?.tools || [];
  const reasoningEffort = body?.reasoning_effort || null;
  // Detect Claude Code UA to force Agent mode (issue #643)
  const ua = credentials?.rawHeaders?.["user-agent"] || "";
  const forceAgentMode = ua.includes("claude-cli") || ua.includes("claude-code") || ua.includes("Claude Code");
  return generateCursorBody(messages, model, tools, reasoningEffort, forceAgentMode);
}

/** Handles agent.v1.AgentServerMessage.exec_request (field 2) */
export function handleAgentExecRequest(execRequest, { session, log, onEvent }) {
  if (execRequest.has(10)) {
    log?.info?.("CURSOR", "AgentService request_context ack");
    session.write(createRequestContextResponse(execRequest));
    return { finished: false };
  }

  if (execRequest.has(11)) {
    const mcp = decodeMcpArgs(execRequest.get(11)[0].value);
    const name = mcp.toolName || mcp.name;
    if (name) {
      log?.info?.("CURSOR", `AgentService MCP tool_call ${name}`);
      onEvent({
        type: "tool_call",
        value: {
          id: mcp.toolCallId || `call_${crypto.randomUUID()}`,
          name,
          arguments: JSON.stringify(mcp.args || {}),
        },
      });
      onEvent({ type: "done", finishReason: "tool_calls" });
      return { finished: true };
    }
    onEvent({ type: "error", value: "Cursor AgentService requested an unsupported IDE tool" });
    return { finished: true };
  }

  // Auto/Composer often probe IDE builtins (shell/read/…). Reject
  // them so the model can continue with MCP tools or a text answer
  // instead of stalling the h2 stream.
  const rejection = rejectExecRequest(execRequest);
  if (rejection) {
    log?.info?.("CURSOR", `AgentService rejected IDE exec fields=${[...execRequest.keys()].join(",")}`);
    session.write(rejection);
    return { finished: false };
  }

  onEvent({ type: "error", value: "Cursor AgentService requested an unsupported IDE tool" });
  return { finished: true };
}

/** Accumulator for streaming tool calls in Protobuf responses (JSON and SSE) */
export class ToolCallAccumulator {
  constructor() {
    this.toolCalls = [];
    this.toolCallsMap = new Map();
    this.finalizedIds = new Set();
    this.emittedToolCallIds = new Set();
  }

  get count() {
    return this.toolCalls.length;
  }

  get mapSize() {
    return this.toolCallsMap.size;
  }

  addJson(tc) {
    if (this.toolCallsMap.has(tc.id)) {
      const existing = this.toolCallsMap.get(tc.id);
      existing.function.arguments += tc.function.arguments;
      existing.isLast = tc.isLast;
    } else {
      this.toolCallsMap.set(tc.id, { ...tc });
    }

    if (tc.isLast) {
      const finalToolCall = this.toolCallsMap.get(tc.id);
      this.finalizedIds.add(tc.id);
      this.toolCalls.push({
        id: finalToolCall.id,
        type: finalToolCall.type,
        function: {
          name: finalToolCall.function.name,
          arguments: finalToolCall.function.arguments,
        },
      });
    }
  }

  finalizeJson() {
    for (const [id, tc] of this.toolCallsMap.entries()) {
      if (!this.finalizedIds.has(id)) {
        this.toolCalls.push({
          id: tc.id,
          type: tc.type,
          function: {
            name: tc.function.name,
            arguments: tc.function.arguments,
          },
        });
      }
    }
    return this.toolCalls;
  }

  addSse(tc, { chunks, responseId, created, model }) {
    if (chunks.length === 0) {
      chunks.push(chatChunkSse({ id: responseId, created, model, delta: { role: "assistant", content: "" } }));
    }

    if (this.toolCallsMap.has(tc.id)) {
      const existing = this.toolCallsMap.get(tc.id);
      existing.function.arguments += tc.function.arguments;
      existing.isLast = tc.isLast;

      if (tc.function.arguments) {
        this.emittedToolCallIds.add(tc.id);
        chunks.push(chatChunkSse({
          id: responseId, created, model,
          delta: {
            tool_calls: [{
              index: existing.index,
              id: tc.id,
              type: "function",
              function: {
                name: tc.function.name,
                arguments: tc.function.arguments,
              },
            }],
          },
        }));
      }
    } else {
      const toolCallIndex = this.toolCalls.length;
      this.finalizedIds.add(tc.id);
      this.toolCalls.push({ ...tc, index: toolCallIndex });
      this.toolCallsMap.set(tc.id, { ...tc, index: toolCallIndex });

      this.emittedToolCallIds.add(tc.id);
      chunks.push(chatChunkSse({
        id: responseId, created, model,
        delta: {
          tool_calls: [{
            index: toolCallIndex,
            id: tc.id,
            type: "function",
            function: {
              name: tc.function.name,
              arguments: tc.function.arguments,
            },
          }],
        },
      }));
    }
  }

  finalizeSse({ chunks, responseId, created, model }) {
    for (const [id, tc] of this.toolCallsMap.entries()) {
      if (!this.finalizedIds.has(id)) {
        const toolCallIndex = this.toolCalls.length;
        this.toolCalls.push({
          id: tc.id,
          type: tc.type,
          index: toolCallIndex,
          function: {
            name: tc.function.name,
            arguments: tc.function.arguments,
          },
        });

        if (!this.emittedToolCallIds.has(tc.id)) {
          chunks.push(chatChunkSse({
            id: responseId, created, model,
            delta: {
              tool_calls: [{
                index: toolCallIndex,
                id: tc.id,
                type: "function",
                function: {
                  name: tc.function.name,
                  arguments: tc.function.arguments,
                },
              }],
            },
          }));
        }
      }
    }
    return this.toolCalls;
  }
}
