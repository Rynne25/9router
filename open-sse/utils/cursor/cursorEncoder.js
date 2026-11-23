/**
 * Cursor Request Encoding, Frame Wrapping, and Body Generation
 */

import { v4 as uuidv4 } from "uuid";
import zlib from "zlib";
import {
  WIRE_TYPE,
  ROLE,
  UNIFIED_MODE,
  THINKING_LEVEL,
  FIELD,
  CLIENT_SIDE_TOOL_V2_MCP,
  encodeVarint,
  encodeField,
  concatArrays,
  log,
} from "./cursorWire.js";

/**
 * Format tool name: "toolName" → "mcp_custom_toolName"
 * Also handles: "mcp__server__tool" → "mcp_server_tool"
 */
function formatToolName(name) {
  const base = typeof name === "string" && name.length > 0 ? name : "tool";

  if (base.startsWith("mcp__")) {
    const rest = base.slice("mcp__".length);
    const splitIdx = rest.indexOf("__");
    if (splitIdx >= 0) {
      const server = rest.slice(0, splitIdx) || "custom";
      const toolName = rest.slice(splitIdx + 2) || "tool";
      return `mcp_${server}_${toolName}`;
    }
    return `mcp_custom_${rest || "tool"}`;
  }

  if (base.startsWith("mcp_")) return base;
  return `mcp_custom_${base}`;
}

/**
 * Parse formatted tool name: "mcp_server_tool" → { serverName, selectedTool }
 */
function parseToolName(formattedName) {
  if (typeof formattedName !== "string" || !formattedName.startsWith("mcp_")) {
    return { serverName: "custom", selectedTool: formattedName || "tool" };
  }

  const tail = formattedName.slice("mcp_".length);
  const splitIdx = tail.indexOf("_");
  if (splitIdx < 0) {
    return { serverName: "custom", selectedTool: tail || "tool" };
  }

  return {
    serverName: tail.slice(0, splitIdx) || "custom",
    selectedTool: tail.slice(splitIdx + 1) || "tool",
  };
}

/**
 * Parse tool_call_id into { toolCallId, modelCallId }
 * Cursor uses "\nmc_" delimiter for model_call_id
 */
function parseToolId(id) {
  const delimiter = "\nmc_";
  const idx = id.indexOf(delimiter);
  if (idx >= 0) {
    return { toolCallId: id.slice(0, idx), modelCallId: id.slice(idx + delimiter.length) };
  }
  return { toolCallId: id, modelCallId: null };
}

/**
 * Encode MCPResult proto: { selected_tool, result }
 */
function encodeMcpResult(selectedTool, resultContent) {
  return concatArrays(
    encodeField(FIELD.MCPR_SELECTED_TOOL, WIRE_TYPE.LEN, selectedTool),
    encodeField(FIELD.MCPR_RESULT, WIRE_TYPE.LEN, resultContent),
  );
}

/**
 * Encode ClientSideToolV2Result proto: { tool, mcp_result, call_id, model_call_id, tool_index }
 * Represents the result of executing a tool
 */
function encodeClientSideToolV2Result(toolCallId, modelCallId, selectedTool, resultContent, toolIndex = 1) {
  return concatArrays(
    encodeField(FIELD.CV2R_TOOL, WIRE_TYPE.VARINT, CLIENT_SIDE_TOOL_V2_MCP),
    encodeField(FIELD.CV2R_MCP_RESULT, WIRE_TYPE.LEN, encodeMcpResult(selectedTool, resultContent)),
    encodeField(FIELD.CV2R_CALL_ID, WIRE_TYPE.LEN, toolCallId),
    ...(modelCallId ? [encodeField(FIELD.CV2R_MODEL_CALL_ID, WIRE_TYPE.LEN, modelCallId)] : []),
    encodeField(FIELD.CV2R_TOOL_INDEX, WIRE_TYPE.VARINT, toolIndex > 0 ? toolIndex : 1),
  );
}

/**
 * Encode MCPParams.Tool nested inside ClientSideToolV2Call
 */
function encodeMcpParamsForCall(toolName, rawArgs, serverName) {
  const tool = concatArrays(
    encodeField(FIELD.MCP_TOOL_NAME, WIRE_TYPE.LEN, toolName),
    encodeField(FIELD.MCP_TOOL_PARAMS, WIRE_TYPE.LEN, rawArgs),
    encodeField(FIELD.MCP_TOOL_SERVER, WIRE_TYPE.LEN, serverName),
  );
  return encodeField(FIELD.MCP_TOOLS_LIST, WIRE_TYPE.LEN, tool);
}

/**
 * Encode ClientSideToolV2Call proto: { tool, mcp_params, call_id, name, raw_args, tool_index, model_call_id }
 * Represents a tool call definition
 */
function encodeClientSideToolV2Call(toolCallId, toolName, selectedTool, serverName, rawArgs, modelCallId, toolIndex = 1) {
  return concatArrays(
    encodeField(FIELD.CV2C_TOOL, WIRE_TYPE.VARINT, CLIENT_SIDE_TOOL_V2_MCP),
    encodeField(FIELD.CV2C_MCP_PARAMS, WIRE_TYPE.LEN, encodeMcpParamsForCall(selectedTool, rawArgs, serverName)),
    encodeField(FIELD.CV2C_CALL_ID, WIRE_TYPE.LEN, toolCallId),
    encodeField(FIELD.CV2C_NAME, WIRE_TYPE.LEN, toolName),
    encodeField(FIELD.CV2C_RAW_ARGS, WIRE_TYPE.LEN, rawArgs),
    encodeField(FIELD.CV2C_TOOL_INDEX, WIRE_TYPE.VARINT, toolIndex > 0 ? toolIndex : 1),
    ...(modelCallId ? [encodeField(FIELD.CV2C_MODEL_CALL_ID, WIRE_TYPE.LEN, modelCallId)] : []),
  );
}

/**
 * Encode ConversationMessage.ToolResult with full structure
 * Matches Cursor proto: tool_call_id, tool_name, tool_index, raw_args, result, tool_call
 */
export function encodeToolResult(toolResult) {
  const originalName = toolResult.tool_name || toolResult.name || "";
  const toolName = formatToolName(originalName);
  const rawArgs = toolResult.raw_args || "{}";
  const resultContent = toolResult.result_content || toolResult.result || "";
  const { toolCallId, modelCallId } = parseToolId(toolResult.tool_call_id || "");
  const toolIndex = toolResult.tool_index || toolResult.index || 1;

  // Parse tool name to extract server and selected tool
  const { serverName, selectedTool } = parseToolName(toolName);

  return concatArrays(
    encodeField(FIELD.TOOL_RESULT_CALL_ID, WIRE_TYPE.LEN, toolCallId),
    encodeField(FIELD.TOOL_RESULT_NAME, WIRE_TYPE.LEN, toolName),
    encodeField(FIELD.TOOL_RESULT_INDEX, WIRE_TYPE.VARINT, toolIndex > 0 ? toolIndex : 1),
    ...(modelCallId ? [encodeField(FIELD.TOOL_RESULT_MODEL_CALL_ID, WIRE_TYPE.LEN, modelCallId)] : []),
    encodeField(FIELD.TOOL_RESULT_RAW_ARGS, WIRE_TYPE.LEN, rawArgs),
    encodeField(FIELD.TOOL_RESULT_RESULT, WIRE_TYPE.LEN,
      encodeClientSideToolV2Result(toolCallId, modelCallId, selectedTool, resultContent, toolIndex),
    ),
    encodeField(FIELD.TOOL_RESULT_TOOL_CALL, WIRE_TYPE.LEN,
      encodeClientSideToolV2Call(toolCallId, toolName, selectedTool, serverName, rawArgs, modelCallId, toolIndex),
    ),
  );
}

export function encodeMessage(content, role, messageId, chatModeEnum = null, isLast = false, hasTools = false, toolResults = [], serverBubbleId = null) {
  const hasToolResults = toolResults.length > 0;
  return concatArrays(
    encodeField(FIELD.MSG_CONTENT, WIRE_TYPE.LEN, content),
    encodeField(FIELD.MSG_ROLE, WIRE_TYPE.VARINT, role),
    encodeField(FIELD.MSG_ID, WIRE_TYPE.LEN, messageId),
    // Only include server_bubble_id if explicitly provided (last assistant message only)
    ...(serverBubbleId ? [encodeField(FIELD.MSG_SERVER_BUBBLE_ID, WIRE_TYPE.LEN, serverBubbleId)] : []),
    ...(hasToolResults ? toolResults.map((tr) =>
      encodeField(FIELD.MSG_TOOL_RESULTS, WIRE_TYPE.LEN, encodeToolResult(tr)),
    ) : []),
    encodeField(FIELD.MSG_IS_AGENTIC, WIRE_TYPE.VARINT, hasTools ? 1 : 0),
    encodeField(FIELD.MSG_UNIFIED_MODE, WIRE_TYPE.VARINT, hasTools ? UNIFIED_MODE.AGENT : UNIFIED_MODE.CHAT),
    ...(isLast && hasTools ? [encodeField(FIELD.MSG_SUPPORTED_TOOLS, WIRE_TYPE.LEN, encodeVarint(1))] : []),
  );
}

export function encodeInstruction(text) {
  return text ? encodeField(FIELD.INSTRUCTION_TEXT, WIRE_TYPE.LEN, text) : new Uint8Array(0);
}

export function encodeModel(modelName) {
  return concatArrays(
    encodeField(FIELD.MODEL_NAME, WIRE_TYPE.LEN, modelName),
    encodeField(FIELD.MODEL_EMPTY, WIRE_TYPE.LEN, new Uint8Array(0)),
  );
}

export function encodeCursorSetting() {
  const unknown6 = concatArrays(
    encodeField(FIELD.SETTING6_FIELD_1, WIRE_TYPE.LEN, new Uint8Array(0)),
    encodeField(FIELD.SETTING6_FIELD_2, WIRE_TYPE.LEN, new Uint8Array(0)),
  );

  return concatArrays(
    encodeField(FIELD.SETTING_PATH, WIRE_TYPE.LEN, "cursor\\aisettings"),
    encodeField(FIELD.SETTING_UNKNOWN_3, WIRE_TYPE.LEN, new Uint8Array(0)),
    encodeField(FIELD.SETTING_UNKNOWN_6, WIRE_TYPE.LEN, unknown6),
    encodeField(FIELD.SETTING_UNKNOWN_8, WIRE_TYPE.VARINT, 1),
    encodeField(FIELD.SETTING_UNKNOWN_9, WIRE_TYPE.VARINT, 1),
  );
}

export function encodeMetadata() {
  return concatArrays(
    encodeField(FIELD.META_PLATFORM, WIRE_TYPE.LEN, process.platform || "linux"),
    encodeField(FIELD.META_ARCH, WIRE_TYPE.LEN, process.arch || "x64"),
    encodeField(FIELD.META_VERSION, WIRE_TYPE.LEN, process.version || "v20.0.0"),
    encodeField(FIELD.META_CWD, WIRE_TYPE.LEN, process.cwd?.() || "/"),
    encodeField(FIELD.META_TIMESTAMP, WIRE_TYPE.LEN, new Date().toISOString()),
  );
}

export function encodeMessageId(messageId, role, summaryId = null) {
  return concatArrays(
    encodeField(FIELD.MSGID_ID, WIRE_TYPE.LEN, messageId),
    ...(summaryId ? [encodeField(FIELD.MSGID_SUMMARY, WIRE_TYPE.LEN, summaryId)] : []),
    encodeField(FIELD.MSGID_ROLE, WIRE_TYPE.VARINT, role),
  );
}

export function encodeMcpTool(tool) {
  const toolName = tool.function?.name || tool.name || "";
  const toolDesc = tool.function?.description || tool.description || "";
  const inputSchema = tool.function?.parameters || tool.input_schema || {};

  return concatArrays(
    ...(toolName ? [encodeField(FIELD.MCP_TOOL_NAME, WIRE_TYPE.LEN, toolName)] : []),
    ...(toolDesc ? [encodeField(FIELD.MCP_TOOL_DESC, WIRE_TYPE.LEN, toolDesc)] : []),
    ...(Object.keys(inputSchema).length > 0 ? [encodeField(FIELD.MCP_TOOL_PARAMS, WIRE_TYPE.LEN, JSON.stringify(inputSchema))] : []),
    encodeField(FIELD.MCP_TOOL_SERVER, WIRE_TYPE.LEN, "custom"),
  );
}

// ==================== REQUEST BUILDING ====================

export function encodeRequest(messages, modelName, tools = [], reasoningEffort = null, forceAgentMode = false) {
  const hasTools = tools?.length > 0;
  const isAgentic = hasTools || forceAgentMode;
  const formattedMessages = [];
  const messageIds = [];
  const normalizedMessages = [];

  // Guardrail: split mixed assistant payload into separate assistant messages
  // This prevents protobuf encoding errors when tool calls and results are in same message
  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    const hasToolCalls = Array.isArray(msg?.tool_calls) && msg.tool_calls.length > 0;
    const hasToolResults = Array.isArray(msg?.tool_results) && msg.tool_results.length > 0;

    if (msg?.role === "assistant" && hasToolCalls && hasToolResults) {
      log(
        "ENCODE",
        `normalizing mixed assistant tool payload at msg[${i}] (calls=${msg.tool_calls.length}, results=${msg.tool_results.length})`,
      );

      // Keep assistant tool call message without embedded results
      normalizedMessages.push({
        ...msg,
        tool_results: [],
      });

      // Avoid inserting duplicate assistant tool-result message if next one already matches
      const nextMsg = messages[i + 1];
      const nextHasToolResults =
        nextMsg?.role === "assistant" &&
        Array.isArray(nextMsg?.tool_results) &&
        nextMsg.tool_results.length > 0;
      const currentIds = new Set(
        msg.tool_results.map((tr) => tr?.tool_call_id).filter((id) => typeof id === "string"),
      );
      const nextIds = new Set(
        (nextMsg?.tool_results || [])
          .map((tr) => tr?.tool_call_id)
          .filter((id) => typeof id === "string"),
      );
      let sameIds = currentIds.size > 0 && currentIds.size === nextIds.size;
      if (sameIds) {
        for (const id of currentIds) {
          if (!nextIds.has(id)) {
            sameIds = false;
            break;
          }
        }
      }

      if (!(nextHasToolResults && sameIds)) {
        normalizedMessages.push({
          role: "assistant",
          content: "",
          tool_results: msg.tool_results,
        });
      }

      continue;
    }

    normalizedMessages.push(msg);
  }

  // Prepare messages
  for (let i = 0; i < normalizedMessages.length; i++) {
    const msg = normalizedMessages[i];
    const role = msg.role === "user" ? ROLE.USER : ROLE.ASSISTANT;
    const msgId = uuidv4();
    const isLast = i === normalizedMessages.length - 1;

    formattedMessages.push({
      content: msg.content,
      role,
      messageId: msgId,
      isLast,
      hasTools,
      toolResults: msg.tool_results || [],
    });

    messageIds.push({ messageId: msgId, role });
  }

  // Map reasoning effort to thinking level
  let thinkingLevel = THINKING_LEVEL.UNSPECIFIED;
  if (reasoningEffort === "medium") thinkingLevel = THINKING_LEVEL.MEDIUM;
  else if (reasoningEffort === "high") thinkingLevel = THINKING_LEVEL.HIGH;

  // Build request
  return concatArrays(
    // Messages
    ...formattedMessages.map((fm) =>
      encodeField(FIELD.MESSAGES, WIRE_TYPE.LEN,
        encodeMessage(fm.content, fm.role, fm.messageId, null, fm.isLast, fm.hasTools, fm.toolResults),
      ),
    ),

    // Static fields
    encodeField(FIELD.UNKNOWN_2, WIRE_TYPE.VARINT, 1),
    encodeField(FIELD.INSTRUCTION, WIRE_TYPE.LEN, encodeInstruction("")),
    encodeField(FIELD.UNKNOWN_4, WIRE_TYPE.VARINT, 1),
    encodeField(FIELD.MODEL, WIRE_TYPE.LEN, encodeModel(modelName)),
    encodeField(FIELD.WEB_TOOL, WIRE_TYPE.LEN, ""),
    encodeField(FIELD.UNKNOWN_13, WIRE_TYPE.VARINT, 1),
    encodeField(FIELD.CURSOR_SETTING, WIRE_TYPE.LEN, encodeCursorSetting()),
    encodeField(FIELD.UNKNOWN_19, WIRE_TYPE.VARINT, 1),
    encodeField(FIELD.CONVERSATION_ID, WIRE_TYPE.LEN, uuidv4()),
    encodeField(FIELD.METADATA, WIRE_TYPE.LEN, encodeMetadata()),

    // Tool-related fields
    encodeField(FIELD.IS_AGENTIC, WIRE_TYPE.VARINT, isAgentic ? 1 : 0),
    ...(isAgentic ? [encodeField(FIELD.SUPPORTED_TOOLS, WIRE_TYPE.LEN, encodeVarint(1))] : []),

    // Message IDs
    ...messageIds.map((mid) =>
      encodeField(FIELD.MESSAGE_IDS, WIRE_TYPE.LEN, encodeMessageId(mid.messageId, mid.role)),
    ),

    // MCP Tools
    ...(tools?.length > 0 ? tools.map((tool) =>
      encodeField(FIELD.MCP_TOOLS, WIRE_TYPE.LEN, encodeMcpTool(tool)),
    ) : []),

    // Mode fields
    encodeField(FIELD.LARGE_CONTEXT, WIRE_TYPE.VARINT, 0),
    encodeField(FIELD.UNKNOWN_38, WIRE_TYPE.VARINT, 0),
    encodeField(FIELD.UNIFIED_MODE, WIRE_TYPE.VARINT, isAgentic ? UNIFIED_MODE.AGENT : UNIFIED_MODE.CHAT),
    encodeField(FIELD.UNKNOWN_47, WIRE_TYPE.LEN, ""),
    encodeField(FIELD.SHOULD_DISABLE_TOOLS, WIRE_TYPE.VARINT, isAgentic ? 0 : 1),
    encodeField(FIELD.THINKING_LEVEL, WIRE_TYPE.VARINT, thinkingLevel),
    encodeField(FIELD.UNKNOWN_51, WIRE_TYPE.VARINT, 0),
    encodeField(FIELD.UNKNOWN_53, WIRE_TYPE.VARINT, 1),
    encodeField(FIELD.UNIFIED_MODE_NAME, WIRE_TYPE.LEN, isAgentic ? "Agent" : "Ask"),
  );
}

export function buildChatRequest(messages, modelName, tools = [], reasoningEffort = null, forceAgentMode = false) {
  return encodeField(FIELD.REQUEST, WIRE_TYPE.LEN, encodeRequest(messages, modelName, tools, reasoningEffort, forceAgentMode));
}

/**
 * Encode a tool result as ClientSideToolV2Result (field 2 of StreamUnifiedChatRequestWithTools)
 * This is sent as a SEPARATE request frame, not inside conversation messages.
 * Proto: StreamUnifiedChatRequestWithTools.client_side_tool_v2_result = 2
 */
export function buildToolResultRequest(toolResult) {
  const { toolCallId, modelCallId } = parseToolId(toolResult.tool_call_id || "");
  const rawName = toolResult.tool_name || "";
  const resultContent = toolResult.result_content || "";

  // selected_tool = raw tool name (e.g. "Write", "Read") per cursor-api Rust source:
  const selectedTool = rawName.startsWith("mcp_custom_")
    ? rawName.slice("mcp_custom_".length)
    : rawName.startsWith("mcp_")
    ? rawName.slice(4)
    : rawName;

  // ClientSideToolV2Result per proto:
  const cv2Result = concatArrays(
    encodeField(FIELD.CV2R_TOOL, WIRE_TYPE.VARINT, CLIENT_SIDE_TOOL_V2_MCP),
    encodeField(FIELD.CV2R_MCP_RESULT, WIRE_TYPE.LEN, encodeMcpResult(selectedTool, resultContent)),
    encodeField(FIELD.CV2R_CALL_ID, WIRE_TYPE.LEN, toolCallId),
    ...(modelCallId ? [encodeField(FIELD.CV2R_MODEL_CALL_ID, WIRE_TYPE.LEN, modelCallId)] : []),
  );

  // StreamUnifiedChatRequestWithTools: field 2 = client_side_tool_v2_result
  return encodeField(2, WIRE_TYPE.LEN, cv2Result);
}

export function wrapConnectRPCFrame(payload, compress = false) {
  let finalPayload = payload;
  let flags = 0x00;

  if (compress) {
    finalPayload = new Uint8Array(zlib.gzipSync(Buffer.from(payload)));
    flags = 0x01;
  }

  const frame = new Uint8Array(5 + finalPayload.length);
  frame[0] = flags;
  frame[1] = (finalPayload.length >> 24) & 0xFF;
  frame[2] = (finalPayload.length >> 16) & 0xFF;
  frame[3] = (finalPayload.length >> 8) & 0xFF;
  frame[4] = finalPayload.length & 0xFF;
  frame.set(finalPayload, 5);

  return frame;
}

export function generateCursorBody(messages, modelName, tools = [], reasoningEffort = null, forceAgentMode = false) {
  log("BODY", `Generating: ${messages.length} msgs, model=${modelName}, tools=${tools.length}, reasoning=${reasoningEffort || "none"}, forceAgentMode=${forceAgentMode}`);

  const protobuf = buildChatRequest(messages, modelName, tools, reasoningEffort, forceAgentMode);
  const framed = wrapConnectRPCFrame(protobuf, false); // Cursor doesn't support compressed requests

  log("BODY", `Protobuf=${protobuf.length}B, Framed=${framed.length}B`);
  return framed;
}

/**
 * Generate a framed tool result body to send as a separate request frame.
 * Uses field 2 (client_side_tool_v2_result) of StreamUnifiedChatRequestWithTools.
 */
export function generateToolResultBody(toolResult) {
  const protobuf = buildToolResultRequest(toolResult);
  return wrapConnectRPCFrame(protobuf, false);
}
