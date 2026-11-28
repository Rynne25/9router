import { createHash } from "node:crypto";
import { collectToolResultTextRefs } from "./toon.js";

const DEFAULT_MIN_CHARS = 600;
const MIN_SAVINGS_CHARS = 200;

/**
 * Deduplicate identical repeated tool_result blocks across conversation turns.
 * - mode === "cache-safe" (default): preserves earliest occurrence (index 0) so
 *   prompt cache prefixes remain intact; replaces duplicates 1..k with a backward ref.
 * - mode === "recency": preserves latest occurrence (index k); replaces 0..k-1 with a forward ref.
 * Returns stats or null if disabled/invalid/failed.
 */
export function dedupeToolResultsInMessages(
  body,
  { enabled = true, mode = "cache-safe", minChars = DEFAULT_MIN_CHARS } = {}
) {
  if (!enabled || !body || typeof body !== "object") return null;

  const normalizedMode = mode === "recency" ? "recency" : "cache-safe";
  const stats = { hits: 0, groups: 0, mode: normalizedMode, bytesBefore: 0, bytesAfter: 0, saved: 0 };

  try {
    const refs = collectToolResultTextRefs(body);
    const groups = new Map();

    for (let i = 0; i < refs.length; i++) {
      const ref = refs[i];
      const text = ref.container[ref.key];
      if (typeof text !== "string") continue;

      stats.bytesBefore += text.length;
      stats.bytesAfter += text.length;

      if (text.length < minChars) continue;
      const normalized = text.replace(/\r\n/g, "\n").trim();
      if (normalized.length === 0) continue;

      const fullHash = createHash("sha256").update(normalized, "utf8").digest("hex");
      const entry = {
        ref,
        text,
        slot: i + 1,
        lines: normalized.split("\n").length,
        shortHash: fullHash.slice(0, 8),
      };

      let list = groups.get(fullHash);
      if (!list) {
        list = [];
        groups.set(fullHash, list);
      }
      list.push(entry);
    }

    for (const entries of groups.values()) {
      if (entries.length < 2) continue;

      const isRecency = normalizedMode === "recency";
      const anchor = isRecency ? entries[entries.length - 1] : entries[0];
      const startIdx = isRecency ? 0 : 1;
      const endIdx = isRecency ? entries.length - 1 : entries.length;
      let groupReplaced = false;

      for (let j = startIdx; j < endIdx; j++) {
        const entry = entries[j];
        const estTokens = Math.max(1, Math.round(entry.text.length / 4));
        const placeholder = isRecency
          ? `[9router-dedup: identical to later tool_result #${anchor.slot} (sha256:${entry.shortHash}, ${entry.lines} lines, ~${estTokens} tokens saved) — see latest output verbatim]`
          : `[9router-dedup: identical to earlier tool_result #${anchor.slot} (sha256:${entry.shortHash}, ${entry.lines} lines, ~${estTokens} tokens saved) — reuse earlier output verbatim]`;

        const saved = entry.text.length - placeholder.length;
        if (saved < MIN_SAVINGS_CHARS) continue;

        entry.ref.container[entry.ref.key] = placeholder;
        stats.hits += 1;
        stats.bytesAfter -= saved;
        stats.saved += saved;
        groupReplaced = true;
      }

      if (groupReplaced) stats.groups += 1;
    }
  } catch (e) {
    console.warn("[DEDUP] dedupeToolResultsInMessages error:", e?.message || e);
    return null;
  }

  return stats;
}

/**
 * Format a concise log line for tool-result deduplication stats. Returns null if no hits.
 */
export function formatToolDedupLog(stats) {
  if (!stats || !stats.hits) return null;
  const saved = stats.bytesBefore - stats.bytesAfter;
  const pct = stats.bytesBefore > 0 ? ((saved / stats.bytesBefore) * 100).toFixed(1) : "0";
  return `[DEDUP:${stats.mode}] saved ${saved}B / ${stats.bytesBefore}B (${pct}%) hits=${stats.hits} groups=${stats.groups}`;
}
