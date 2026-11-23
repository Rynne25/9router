/**
 * Cursor Response Parsing & Stream Framing
 */

import zlib from "zlib";
import { FIELD, KNOWN_RESPONSE_FIELDS, PROTOBUF_SCHEMA_VERSION, log, decodeMessage } from "./cursorWire.js";

export function parseConnectRPCFrame(buffer) {
  if (buffer.length < 5) return null;

  const flags = buffer[0];
  const length = (buffer[1] << 24) | (buffer[2] << 16) | (buffer[3] << 8) | buffer[4];

  if (buffer.length < 5 + length) return null;

  let payload = buffer.slice(5, 5 + length);

  // Decompress if gzip
  if (flags === 0x01) {
    try {
      payload = new Uint8Array(zlib.gunzipSync(Buffer.from(payload)));
    } catch (err) {
      log("PARSE", `Decompression failed: ${err.message}`);
    }
  }

  return { flags, length, payload, consumed: 5 + length };
}

function extractToolCall(toolCallData) {
  const toolCall = decodeMessage(toolCallData);
  let toolCallId = "";
  let toolName = "";
  let rawArgs = "";
  let isLast = false;

  // Extract tool call ID
  if (toolCall.has(FIELD.TOOL_ID)) {
    const fullId = new TextDecoder().decode(toolCall.get(FIELD.TOOL_ID)[0].value);
    toolCallId = fullId.split("\n")[0]; // Cursor returns multi-line ID, take first line
  }

  // Extract tool name
  if (toolCall.has(FIELD.TOOL_NAME)) {
    toolName = new TextDecoder().decode(toolCall.get(FIELD.TOOL_NAME)[0].value);
  }

  // Extract is_last flag
  if (toolCall.has(FIELD.TOOL_IS_LAST)) {
    isLast = toolCall.get(FIELD.TOOL_IS_LAST)[0].value !== 0;
  }

  // Extract MCP params - nested real tool info
  if (toolCall.has(FIELD.TOOL_MCP_PARAMS)) {
    try {
      const mcpParams = decodeMessage(toolCall.get(FIELD.TOOL_MCP_PARAMS)[0].value);

      if (mcpParams.has(FIELD.MCP_TOOLS_LIST)) {
        const tool = decodeMessage(mcpParams.get(FIELD.MCP_TOOLS_LIST)[0].value);

        if (tool.has(FIELD.MCP_NESTED_NAME)) {
          toolName = new TextDecoder().decode(tool.get(FIELD.MCP_NESTED_NAME)[0].value);
        }

        if (tool.has(FIELD.MCP_NESTED_PARAMS)) {
          rawArgs = new TextDecoder().decode(tool.get(FIELD.MCP_NESTED_PARAMS)[0].value);
        }
      }
    } catch (err) {
      log("EXTRACT", `MCP parse error: ${err.message}`);
    }
  }

  // Fallback to raw_args
  if (!rawArgs && toolCall.has(FIELD.TOOL_RAW_ARGS)) {
    rawArgs = new TextDecoder().decode(toolCall.get(FIELD.TOOL_RAW_ARGS)[0].value);
  }

  if (toolCallId && toolName) {
    return {
      id: toolCallId,
      type: "function",
      function: {
        name: toolName,
        arguments: rawArgs || "{}",
      },
      isLast,
    };
  }

  return null;
}

function extractTextAndThinking(responseData) {
  const nested = decodeMessage(responseData);
  let text = null;
  let thinking = null;

  // Extract text
  if (nested.has(FIELD.RESPONSE_TEXT)) {
    text = new TextDecoder().decode(nested.get(FIELD.RESPONSE_TEXT)[0].value);
  }

  // Extract thinking
  if (nested.has(FIELD.THINKING)) {
    try {
      const thinkingMsg = decodeMessage(nested.get(FIELD.THINKING)[0].value);
      if (thinkingMsg.has(FIELD.THINKING_TEXT)) {
        thinking = new TextDecoder().decode(thinkingMsg.get(FIELD.THINKING_TEXT)[0].value);
      }
    } catch (err) {
      log("EXTRACT", `Thinking parse error: ${err.message}`);
    }
  }

  return { text, thinking };
}

export function extractTextFromResponse(payload) {
  try {
    const fields = decodeMessage(payload);

    // Warn about unknown field numbers — may indicate a Cursor protocol update
    for (const fieldNum of fields.keys()) {
      if (!KNOWN_RESPONSE_FIELDS.has(fieldNum)) {
        log(
          "SCHEMA",
          `Unknown response field #${fieldNum} detected. Schema v${PROTOBUF_SCHEMA_VERSION} may be outdated.`
        );
      }
    }

    // Field 1: ClientSideToolV2Call
    if (fields.has(FIELD.TOOL_CALL)) {
      const toolCall = extractToolCall(fields.get(FIELD.TOOL_CALL)[0].value);
      if (toolCall) {
        log("EXTRACT", `Tool call: ${toolCall.function.name}`);
        return { text: null, error: null, toolCall, thinking: null };
      }
    }

    // Field 2: StreamUnifiedChatResponse
    if (fields.has(FIELD.RESPONSE)) {
      const { text, thinking } = extractTextAndThinking(fields.get(FIELD.RESPONSE)[0].value);

      if (text || thinking) {
        return { text, error: null, toolCall: null, thinking };
      }
    }

    return { text: null, error: null, toolCall: null, thinking: null };
  } catch (err) {
    log("EXTRACT", `Decode failed (schema v${PROTOBUF_SCHEMA_VERSION}): ${err.message}`);
    return {
      text: null,
      error: null,
      toolCall: null,
      thinking: null,
      raw: Buffer.from(payload).toString("base64"),
      decodeError: err.message,
    };
  }
}
