/**
 * Cursor Protobuf Encoder/Decoder Facade
 * Implements ConnectRPC protobuf wire format for Cursor API.
 *
 * Modularized architecture:
 * - cursor/cursorWire.js: Wire types, varint, low-level field codecs
 * - cursor/cursorEncoder.js: Message & request encoding, frame wrapping
 * - cursor/cursorDecoder.js: Frame parsing & stream response extraction
 * - cursor/cursorMcp.js: AgentService & MCP protocols (google.protobuf.Value)
 */

import {
  encodeVarint,
  encodeField,
  decodeVarint,
  decodeField,
  decodeMessage,
} from "./cursor/cursorWire.js";

import {
  encodeToolResult,
  encodeMessage,
  encodeInstruction,
  encodeModel,
  encodeCursorSetting,
  encodeMetadata,
  encodeMessageId,
  encodeMcpTool,
  encodeRequest,
  buildChatRequest,
  buildToolResultRequest,
  wrapConnectRPCFrame,
  generateCursorBody,
  generateToolResultBody,
} from "./cursor/cursorEncoder.js";

import {
  parseConnectRPCFrame,
  extractTextFromResponse,
} from "./cursor/cursorDecoder.js";

import {
  encodeAgentValue,
  decodeAgentValue,
  encodeMcpToolDefinition,
  encodeMcpTools,
  decodeMcpArgs,
  encodeMcpResultSuccess,
  encodeMcpResultError,
  encodeMcpResultToolNotFound,
} from "./cursor/cursorMcp.js";

export {
  encodeVarint,
  encodeField,
  decodeVarint,
  decodeField,
  decodeMessage,
  encodeToolResult,
  encodeMessage,
  encodeInstruction,
  encodeModel,
  encodeCursorSetting,
  encodeMetadata,
  encodeMessageId,
  encodeMcpTool,
  encodeRequest,
  buildChatRequest,
  buildToolResultRequest,
  wrapConnectRPCFrame,
  generateCursorBody,
  generateToolResultBody,
  parseConnectRPCFrame,
  extractTextFromResponse,
  encodeAgentValue,
  decodeAgentValue,
  encodeMcpToolDefinition,
  encodeMcpTools,
  decodeMcpArgs,
  encodeMcpResultSuccess,
  encodeMcpResultError,
  encodeMcpResultToolNotFound,
};

const cursorProtobuf = {
  encodeVarint,
  encodeField,
  encodeMessage,
  buildChatRequest,
  wrapConnectRPCFrame,
  generateCursorBody,
  decodeVarint,
  decodeField,
  decodeMessage,
  parseConnectRPCFrame,
  extractTextFromResponse,
  encodeAgentValue,
  decodeAgentValue,
  encodeMcpToolDefinition,
  encodeMcpTools,
  decodeMcpArgs,
  encodeMcpResultSuccess,
  encodeMcpResultError,
  encodeMcpResultToolNotFound,
};

export default cursorProtobuf;
