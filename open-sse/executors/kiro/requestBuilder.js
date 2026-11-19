import { openaiToKiroRequest } from "../../translator/request/openai-to-kiro.js";
import {
  canonicalizeKiroConversation,
  normalizeKiroToolSpecs,
  kiroEmptyUserContent
} from "../../translator/concerns/kiroConversation.js";

export const KIRO_SHORT_FINAL_MAX_CHARS = 800;

export const REPAIR_INSTRUCTIONS = Object.freeze({
  tool: "Retry the previous response because its Kiro tool_call wrapper was malformed. If you use the wrapper tool named tool_call, its input must contain a non-empty name and an arguments field.",
  ellipsis: "Retry the previous response because it ended with only an ellipsis. Return the complete final answer, not only ... or ….",
  short_final: "Retry the previous response because its final only announced a future action. Complete the check now and return the result or a concrete blocker."
});

export const SHORT_FUTURE_ACTION = /^(?:(?:(?:現在|接著|接下來|下一步)[，,:：\s]*(?:我(?:只)?(?:會|要|將|再)?\s*)?|我只再)(?:補|查|確認|驗證|追(?:查|蹤)?|繼續|檢查|測試)|我(?:會|要|將)(?:再|重新)?(?:補(?:齊|查)?|抓取|查(?:詢)?|確認|驗證|追(?:查|蹤)?|繼續|檢查|測試)|(?:(?:next|now|then)\b[\s,:-]*)?(?:i(?:'ll| will| am going to| need to)|let me)\s+(?:verify|check|confirm|validate|investigate|trace|continue|follow up|test)\b)/iu;
// Keep this tied to the observed whole-response signature. Broader Chinese
// result/progress heuristics create false positives for completed findings.
export const OBSERVED_TRAILING_FUTURE_ACTION = /^目前證據顯示[\s\S]{1,700}[。.!?；;]\s*最後補查\s+504\s+access\s+log[，,]\s*確認\s+host[／/]路徑與是否為集中流量[。.!]?$/iu;
export const ENGLISH_FUTURE_ACTION = /^(?:(?:next|now|then)\b[\s,:-]*)?(?:i(?:'ll| will| am going to| need to)|let me)\s+(?:verify|check|confirm|validate|investigate|trace|continue|follow up|test)\b/iu;
export const ENGLISH_RESULT_CLAUSE = /(?:[:;\n]|[.!?]\s+\S|\b(?:status|checksum|response|deployment)\s+(?:is|are|was|were|matches?|equals?|returned)\b)/iu;
export const CHINESE_FUTURE_ACTION = /^(?:(?:現在|接著|接下來|下一步)[，,:：\s]*(?:我(?:只)?(?:會|要|將|再)?\s*)?|我只再|我(?:會|要|將)(?:再|重新)?)(?:補|抓取|查|確認|驗證|追|繼續|檢查|測試)/u;
export const CHINESE_RESULT_CLAUSE = /(?:[。！？]\s*\S|(?:版本|狀態|回應|結果|部署|校驗碼)(?:是|為|等於|顯示))/u;
export const USER_WAIT = /(?:請(?:你|先)|你(?:先|需要|可以|提供|確認|批准|允許)|等待(?:你|使用者)|等你|核准|同意|授權|\b(?:after|when|once)\s+you\b|\byour\s+(?:approval|confirmation|permission|input)\b|\bwait(?:ing)?\s+for\s+you\b|\bplease\s+(?:approve|confirm|provide|send)\b)/iu;
export const COMPLETED_FINAL = /(?:已(?:經)?完成|完成(?:了|驗證|確認)|修復完成|確認無誤|驗證(?:完成|通過)|測試(?:均)?通過|結論|總結|\b(?:done|completed|fixed|verified|confirmed|passed|in conclusion|summary)\b|\b(?:is|are) complete\b)/iu;
export const RESULT_EVIDENCE = /(?:顯示|發現|因此|成功|失敗|正常|無錯誤|沒有錯誤|\b(?:found|shows?|showed|because|therefore|succeeded|failed|healthy|green|no errors?)\b)/iu;

export function isEllipsisOnly(value) {
  return ["...", "…"].includes(String(value || "").trim());
}

export function isShortFutureAction(value) {
  const text = String(value || "").trim().replaceAll("’", "'");
  if (OBSERVED_TRAILING_FUTURE_ACTION.test(text)) return true;
  if (ENGLISH_FUTURE_ACTION.test(text) && ENGLISH_RESULT_CLAUSE.test(text)) return false;
  if (CHINESE_FUTURE_ACTION.test(text) && CHINESE_RESULT_CLAUSE.test(text)) return false;
  return text.length > 0 && text.length <= KIRO_SHORT_FINAL_MAX_CHARS &&
    SHORT_FUTURE_ACTION.test(text) && !USER_WAIT.test(text) &&
    !COMPLETED_FINAL.test(text) && !RESULT_EVIDENCE.test(text);
}

// The instruction goes into the current user turn, never into a top-level
// `systemPrompt`: kiro.dev answers any body carrying that field with
// 400 REQUEST_BODY_INVALID, so writing it here turned every repair retry into
// a hard failure.
export function appendRepairInstruction(body, kind) {
  const repaired = structuredClone(body || {});
  const instruction = REPAIR_INSTRUCTIONS[kind] || "Retry the previous incomplete Kiro response.";
  const msg = repaired?.conversationState?.currentMessage?.userInputMessage;
  if (msg) {
    const content = typeof msg.content === "string" ? msg.content : "";
    msg.content = content ? `${content}\n\n${instruction}` : instruction;
  }
  return repaired;
}

/**
 * Transforms or passes through request body for Kiro.
 */
export function transformKiroRequest(model, body, stream, credentials) {
  if (body?.messages && !body?.conversationState) {
    return openaiToKiroRequest(model, body, stream, credentials);
  }
  return body;
}

/**
 * Context compacting for Kiro conversation state.
 * Bounds history length and cleans up stale items if context exceeds limits.
 */
export function compactKiroContext(body, options = {}) {
  if (!body?.conversationState) return body;
  const { maxHistoryTurns = 50 } = options;
  const history = body.conversationState.history;
  if (Array.isArray(history) && history.length > maxHistoryTurns) {
    body.conversationState.history = history.slice(-maxHistoryTurns);
  }
  return body;
}

export {
  openaiToKiroRequest,
  canonicalizeKiroConversation,
  normalizeKiroToolSpecs,
  kiroEmptyUserContent
};
