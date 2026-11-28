import { RAW_CAP, HEADROOM_TOOL_OUTPUT_MAX_DEPTH } from "./constants.js";
import { OPENAI_BLOCK, RESPONSES_ITEM } from "../translator/schema/index.js";

const DEFAULT_MIN_CHARS = 400;
const DEFAULT_MIN_SAVINGS_PCT = 15;
const MAX_NESTED_DEPTH = 2;
const GEMINI_TEXT_FIELDS = ["result", "output", "content", "text"];
const GEMINI_META_KEYS = new Set(["error", "is_error", "status", "type", "id", "name", "toolUseId", "tool_use_id"]);

function isPlainObject(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function isPrimitive(value) {
  return value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean";
}

function isUniformTabularArray(value) {
  if (!Array.isArray(value) || value.length < 3) return false;
  const first = value[0];
  if (!isPlainObject(first)) return false;
  const keys = Object.keys(first);
  if (keys.length === 0) return false;

  for (let i = 0; i < value.length; i++) {
    const item = value[i];
    if (!isPlainObject(item)) return false;
    if (Object.keys(item).length !== keys.length) return false;
    for (let k = 0; k < keys.length; k++) {
      const key = keys[k];
      if (!Object.hasOwn(item, key) || !isPrimitive(item[key])) return false;
    }
  }
  return true;
}

function formatToonScalar(value) {
  if (value === null) return "null";
  if (typeof value === "boolean" || typeof value === "number") return String(value);
  const str = String(value);
  if (str.length === 0) return '""';
  if (/[,\n\r":]/.test(str) || /^\s|\s$/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function formatToonKey(key) {
  if (key.length === 0) return '""';
  if (/[,\n\r":{}\[\]\s]/.test(key)) {
    return `"${key.replace(/"/g, '""')}"`;
  }
  return key;
}

function encodeTabularRows(arr, indent) {
  const keys = Object.keys(arr[0]);
  const headerKeys = keys.map(formatToonKey).join(",");
  const rows = new Array(arr.length);
  const rowIndent = `${indent} `;
  for (let i = 0; i < arr.length; i++) {
    const item = arr[i];
    const cells = new Array(keys.length);
    for (let k = 0; k < keys.length; k++) {
      cells[k] = formatToonScalar(item[keys[k]]);
    }
    rows[i] = `${rowIndent}${cells.join(",")}`;
  }
  return { headerKeys, rows };
}

function encodeObjectLines(obj, depth, indent, state) {
  const lines = [];
  for (const [key, val] of Object.entries(obj)) {
    const formattedKey = formatToonKey(key);
    if (isUniformTabularArray(val)) {
      const { headerKeys, rows } = encodeTabularRows(val, indent);
      lines.push(`${indent}${formattedKey}[${val.length}]{${headerKeys}}:`);
      for (const row of rows) lines.push(row);
      state.tabularCount += 1;
    } else if (isPlainObject(val) && depth + 1 < MAX_NESTED_DEPTH) {
      const childEntries = Object.entries(val);
      if (childEntries.length === 0) {
        lines.push(`${indent}${formattedKey}: {}`);
      } else {
        lines.push(`${indent}${formattedKey}:`);
        const childLines = encodeObjectLines(val, depth + 1, `${indent} `, state);
        for (const line of childLines) lines.push(line);
      }
    } else if (isPrimitive(val)) {
      lines.push(`${indent}${formattedKey}: ${formatToonScalar(val)}`);
    } else {
      lines.push(`${indent}${formattedKey}: ${JSON.stringify(val)}`);
    }
  }
  return lines;
}

/**
 * Encode a parsed JSON value into TOON tabular notation if it contains at least
 * one uniform array of plain objects (length >= 3) at top-level or nested 1-2 levels.
 * Returns null when no tabular arrays are detected or input is not encodable.
 */
export function encodeJsonToToon(value) {
  try {
    if (isUniformTabularArray(value)) {
      const { headerKeys, rows } = encodeTabularRows(value, "");
      return [`[${value.length}]{${headerKeys}}:`, ...rows].join("\n");
    }
    if (isPlainObject(value)) {
      const state = { tabularCount: 0 };
      const lines = encodeObjectLines(value, 0, "", state);
      if (state.tabularCount < 1) return null;
      return lines.join("\n");
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Try compressing a JSON text blob into TOON format with a `[TOON]\n` prefix.
 * Returns the original text unchanged if any safety or savings guard fails.
 */
export function tryCompressJsonText(text, { minChars = DEFAULT_MIN_CHARS, minSavingsPct = DEFAULT_MIN_SAVINGS_PCT } = {}) {
  if (typeof text !== "string") return text;
  const beforeLen = text.length;
  if (beforeLen < minChars || beforeLen > RAW_CAP) return text;

  try {
    const trimmed = text.trim();
    const looksLikeObject = trimmed.startsWith("{") && trimmed.endsWith("}");
    const looksLikeArray = trimmed.startsWith("[") && trimmed.endsWith("]");
    if (!looksLikeObject && !looksLikeArray) return text;

    const parsed = JSON.parse(trimmed);
    const encoded = encodeJsonToToon(parsed);
    if (!encoded) return text;

    const out = `[TOON]\n${encoded}`;
    const afterLen = out.length;
    if (afterLen >= beforeLen) return text;
    if ((beforeLen - afterLen) / beforeLen < minSavingsPct / 100) return text;
    return out;
  } catch {
    return text;
  }
}

/**
 * Collect chronological text-block refs for all non-error tool results across
 * the 5 supported provider request shapes (Kiro, Gemini/Antigravity/Vertex,
 * OpenAI Responses, OpenAI Chat, Claude).
 */
export function collectToolResultTextRefs(body) {
  const refs = [];
  if (!body || typeof body !== "object") return refs;

  // 1. Kiro: conversationState.history[] + currentMessage
  if (body.conversationState) {
    const state = body.conversationState;
    const allMessages = [...(Array.isArray(state?.history) ? state.history : [])];
    if (state?.currentMessage) allMessages.push(state.currentMessage);

    for (const msg of allMessages) {
      const toolResults = msg?.userInputMessage?.userInputMessageContext?.toolResults;
      if (!Array.isArray(toolResults)) continue;

      for (const tr of toolResults) {
        if (!tr || tr.status === "error" || tr.is_error === true) continue;
        if (!Array.isArray(tr.content)) continue;
        for (let k = 0; k < tr.content.length; k++) {
          const part = tr.content[k];
          if (part && typeof part.text === "string") {
            refs.push({ container: part, key: "text", shape: "kiro-tool-result" });
          }
        }
      }
    }
    return refs;
  }

  // 2. Gemini / Antigravity / Gemini-CLI / Vertex
  const geminiContents = Array.isArray(body.request?.contents)
    ? body.request.contents
    : Array.isArray(body.contents)
      ? body.contents
      : null;
  if (geminiContents) {
    const visitGemini = (object, key, depth = 0, isRootResponse = false) => {
      if (depth > HEADROOM_TOOL_OUTPUT_MAX_DEPTH) return;
      const value = object?.[key];
      if (typeof value === "string") {
        refs.push({ container: object, key, shape: "gemini-tool-result" });
      } else if (Array.isArray(value)) {
        for (let i = 0; i < value.length; i++) visitGemini(value, i, depth + 1, false);
      } else if (value && typeof value === "object") {
        if (value.error !== undefined || value.is_error === true || value.status === "error") return;
        if (value.type && value.type !== OPENAI_BLOCK.TEXT && value.type !== RESPONSES_ITEM.INPUT_TEXT) return;
        for (const field of GEMINI_TEXT_FIELDS) {
          if (Object.hasOwn(value, field)) visitGemini(value, field, depth + 1, false);
        }
        if (isRootResponse) {
          for (const field of Object.keys(value)) {
            if (!GEMINI_TEXT_FIELDS.includes(field) && !GEMINI_META_KEYS.has(field) && typeof value[field] === "string") {
              refs.push({ container: value, key: field, shape: "gemini-tool-result" });
            }
          }
        }
      }
    };

    for (const content of geminiContents) {
      if (!Array.isArray(content?.parts)) continue;
      for (const part of content.parts) {
        if (part?.functionResponse && part.functionResponse.error === undefined) {
          visitGemini(part.functionResponse, "response", 0, true);
        }
      }
    }
    return refs;
  }

  // 3/4/5. OpenAI Responses (input), OpenAI Chat (messages role:tool), Claude (messages tool_result)
  const items = Array.isArray(body.messages)
    ? body.messages
    : Array.isArray(body.input)
      ? body.input
      : null;
  if (!items) return refs;

  for (let i = 0; i < items.length; i++) {
    const msg = items[i];
    if (!msg || typeof msg !== "object") continue;

    // 3. OpenAI Responses: { type: "function_call_output", output: string | [...] }
    if (msg.type === "function_call_output") {
      if (msg.is_error === true || msg.status === "error") continue;
      if (typeof msg.output === "string") {
        refs.push({ container: msg, key: "output", shape: "openai-responses-string" });
      } else if (Array.isArray(msg.output)) {
        for (let k = 0; k < msg.output.length; k++) {
          const part = msg.output[k];
          if (
            part &&
            (part.type === "input_text" || part.type === "output_text" || part.type === "text") &&
            typeof part.text === "string"
          ) {
            refs.push({ container: part, key: "text", shape: "openai-responses-array" });
          }
        }
      }
      continue;
    }

    // 4. OpenAI Chat: { role: "tool", content: string | [{ type: "text", text }] }
    if (msg.role === "tool") {
      if (msg.is_error === true || msg.status === "error") continue;
      if (typeof msg.content === "string") {
        refs.push({ container: msg, key: "content", shape: "openai-tool" });
      } else if (Array.isArray(msg.content)) {
        for (let k = 0; k < msg.content.length; k++) {
          const part = msg.content[k];
          if (part && part.type === "text" && typeof part.text === "string") {
            refs.push({ container: part, key: "text", shape: "openai-tool-array" });
          }
        }
      }
      continue;
    }

    if (!Array.isArray(msg.content)) continue;

    // 5. Claude: content[] with { type: "tool_result", is_error?, content: string | [...] }
    for (let j = 0; j < msg.content.length; j++) {
      const block = msg.content[j];
      if (!block || block.type !== "tool_result") continue;
      if (block.is_error === true || block.status === "error") continue;

      if (typeof block.content === "string") {
        refs.push({ container: block, key: "content", shape: "claude-string" });
      } else if (Array.isArray(block.content)) {
        for (let k = 0; k < block.content.length; k++) {
          const part = block.content[k];
          if (part && part.type === "text" && typeof part.text === "string") {
            refs.push({ container: part, key: "text", shape: "claude-array" });
          }
        }
      }
    }
  }

  return refs;
}

/**
 * Compress uniform JSON arrays in tool_result blocks in-place using TOON notation.
 * Returns stats or null if disabled/invalid/failed.
 */
export function compressToonInMessages(
  body,
  { enabled = true, minChars = DEFAULT_MIN_CHARS, minSavingsPct = DEFAULT_MIN_SAVINGS_PCT } = {}
) {
  if (!enabled || !body || typeof body !== "object") return null;

  const stats = { hits: 0, bytesBefore: 0, bytesAfter: 0, saved: 0 };
  try {
    const refs = collectToolResultTextRefs(body);
    for (let i = 0; i < refs.length; i++) {
      const { container, key } = refs[i];
      const text = container[key];
      if (typeof text !== "string") continue;

      const beforeLen = text.length;
      stats.bytesBefore += beforeLen;

      const out = tryCompressJsonText(text, { minChars, minSavingsPct });
      if (out !== text) {
        container[key] = out;
        stats.hits += 1;
        stats.bytesAfter += out.length;
        stats.saved += beforeLen - out.length;
      } else {
        stats.bytesAfter += beforeLen;
      }
    }
  } catch (e) {
    console.warn("[TOON] compressToonInMessages error:", e?.message || e);
    return null;
  }
  return stats;
}

/**
 * Format a concise log line for TOON compression stats. Returns null if no hits.
 */
export function formatToonLog(stats) {
  if (!stats || !stats.hits) return null;
  const saved = stats.bytesBefore - stats.bytesAfter;
  const pct = stats.bytesBefore > 0 ? ((saved / stats.bytesBefore) * 100).toFixed(1) : "0";
  return `[TOON] saved ${saved}B / ${stats.bytesBefore}B (${pct}%) hits=${stats.hits}`;
}
