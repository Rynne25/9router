export const HTTP_LOG_RE =
  /\b(GET|POST|PUT|PATCH|DELETE|OPTIONS|HEAD)\s+(\/[^\s),"]*)(?:\s+([1-5]\d{2}))?(?:\s+(?:in\s+)?(\d+(?:\.\d+)?(?:ms|s)))?/;

const KV_PAIR_RE = /\b([a-zA-Z_][a-zA-Z0-9_]*)=("[^"]*"|'[^']*'|[^\s,]+)/g;

const KNOWN_KV_KEYS = new Set([
  "model",
  "status",
  "provider",
  "email",
  "port",
  "error",
  "connectionId",
  "id",
  "duration",
  "latency",
  "BackendState",
  "host",
  "proto",
  "tool",
  "originalModel",
]);

/**
 * Extract a trailing JSON object from a log string, scanning candidate " {" positions from right to left.
 */
function extractTrailingJson(text) {
  if (!text.endsWith("}")) return { text, meta: null };
  let searchFrom = text.length;
  while (searchFrom > 0) {
    const idx = text.lastIndexOf(" {", searchFrom - 1);
    if (idx === -1) break;
    const candidate = text.slice(idx + 1);
    try {
      const parsed = JSON.parse(candidate);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return { text: text.slice(0, idx).trim(), meta: parsed };
      }
    } catch {
      // Try earlier " {" if nested object
    }
    searchFrom = idx;
  }
  return { text, meta: null };
}

/**
 * Parse a raw console log line into structured fields for clear UI rendering.
 */
export function parseLogLine(rawLine) {
  const line = String(rawLine || "").trim();
  let rest = line;
  let time = null;
  let level = "LOG";
  let tag = "System";
  const subTags = [];

  // 1. Extract leading timestamp: [HH:MM:SS(.ms)] or HH:MM:SS(.ms)
  const timeMatch = rest.match(/^\[?(\d{2}:\d{2}:\d{2}(?:\.\d+)?)\]?\s*/);
  if (timeMatch) {
    time = timeMatch[1];
    rest = rest.slice(timeMatch[0].length);
  }

  // 2. Extract leading emoji or [LEVEL] indicators
  if (rest.startsWith("ℹ️") || rest.startsWith("ℹ")) {
    level = "INFO";
    rest = rest.replace(/^ℹ️?\s*/, "");
  } else if (rest.startsWith("⚠️") || rest.startsWith("⚠")) {
    level = "WARN";
    rest = rest.replace(/^⚠️?\s*/, "");
  } else if (rest.startsWith("❌") || rest.startsWith("✖")) {
    level = "ERROR";
    rest = rest.replace(/^[❌✖]\s*/, "");
  }

  const levelBracket = rest.match(/^\[(LOG|INFO|WARN|WARNING|ERROR|DEBUG)\]\s*/i);
  if (levelBracket) {
    const rawLvl = levelBracket[1].toUpperCase();
    level = rawLvl === "WARNING" ? "WARN" : rawLvl;
    rest = rest.slice(levelBracket[0].length);
  }

  // 3. Extract primary and secondary module tags: [TAG][subTag]
  const tagMatch = rest.match(/^\[([^\]]+)\]\s*/);
  if (tagMatch) {
    tag = tagMatch[1].trim();
    rest = rest.slice(tagMatch[0].length);
    while (true) {
      const subMatch = rest.match(/^\[([^\]]+)\]\s*/);
      if (!subMatch) break;
      subTags.push(subMatch[1].trim());
      rest = rest.slice(subMatch[0].length);
    }
  } else if (/^TOKEN\s+/i.test(rest)) {
    tag = "TOKEN";
  } else if (/^MITM\b/i.test(rest) || /\[MITM\]/i.test(rest) || /\bmitm proxy\b/i.test(rest)) {
    tag = "MITM";
  } else if (/\b(?:failover|fallback|switching connection)\b/i.test(rest)) {
    subTags.push("FAILOVER");
  }

  // Check emoji right after tag (e.g. "[UniversalSync] ❌ ..." or "[TAG] ⚠️ ...")
  if (rest.startsWith("❌") || rest.startsWith("✖")) {
    level = "ERROR";
    rest = rest.replace(/^[❌✖]\s*/, "");
  } else if (rest.startsWith("⚠️") || rest.startsWith("⚠")) {
    if (level === "LOG") level = "WARN";
    rest = rest.replace(/^⚠️?\s*/, "");
  }

  // 4. Extract trailing JSON object if present
  const jsonExtracted = extractTrailingJson(rest);
  rest = jsonExtracted.text;
  let meta = jsonExtracted.meta;

  // 5. Extract structured HTTP request info if present
  let http = null;
  const httpMatch = rest.match(HTTP_LOG_RE);
  if (httpMatch) {
    http = {
      method: httpMatch[1],
      path: httpMatch[2],
      status: httpMatch[3] ? Number(httpMatch[3]) : null,
      duration: httpMatch[4] || null,
    };
  }

  // 6. Extract inline key=value metadata pairs when meaningful
  const kvMatches = [...rest.matchAll(KV_PAIR_RE)];
  if (kvMatches.length > 0) {
    const extractedKv = {};
    for (const m of kvMatches) {
      const key = m[1];
      if (!KNOWN_KV_KEYS.has(key)) continue;
      let val = m[2];
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      extractedKv[key] = val;
    }
    if (Object.keys(extractedKv).length > 0) {
      meta = { ...extractedKv, ...(meta || {}) };
    }
  }

  // 7. Refine level from HTTP status or content keywords
  const lower = `${tag} ${rest}`.toLowerCase();
  const hasRealErrorMeta =
    Boolean(meta?.error) && meta.error !== "false" && meta.error !== "null";
  if (http?.status >= 500) {
    level = "ERROR";
  } else if (http?.status >= 400 && level === "LOG") {
    level = "WARN";
  } else if (
    level === "LOG" &&
    (/\berror\b(?!=(?:false|null|0)\b)|\bfailed\b|\betimedout\b|\beconnrefused\b|\baborted\b|\bexception\b|\bunauthorized\b/.test(
      lower
    ) ||
      hasRealErrorMeta)
  ) {
    level = "ERROR";
  } else if (
    level === "LOG" &&
    /\bwarn\b|\btimeout\b|\bretry\b|\brate.?limit\b|\bcooldown\b|\bskipping\b/.test(lower)
  ) {
    level = "WARN";
  } else if (level === "LOG" && (tag.includes("TOKEN") || tag === "INFO")) {
    level = "INFO";
  }

  // 8. Categorize for quick filtering
  let category = "system";
  if (level === "ERROR" || level === "WARN") {
    category = "error";
  } else if (/token|auth|credential|oauth/i.test(tag) || /token|credential/i.test(rest)) {
    category = "token";
  } else if (/mitm|proxy|dns/i.test(tag) || /mitm|proxy/i.test(rest)) {
    category = "mitm";
  } else if (
    Boolean(http) ||
    /combo|chat|model|route|sse|request|usage|gemini|qoder/i.test(tag) ||
    /model|combo|request/i.test(rest)
  ) {
    category = "request";
  }

  const dedupKey = `${level}|${tag}|${subTags.join(",")}|${rest}|${
    meta ? JSON.stringify(meta) : ""
  }`;

  return {
    raw: line,
    time,
    level,
    tag,
    subTags,
    category,
    message: rest || line,
    http,
    meta,
    dedupKey,
  };
}

/**
 * Shared predicate for counting and filtering log entries by category tab.
 */
export function matchesCategory(entry, filterId) {
  if (filterId === "all") return true;
  if (filterId === "error") return entry.level === "ERROR" || entry.level === "WARN";
  if (filterId === "request") return entry.category === "request";
  if (filterId === "mitm") return entry.category === "mitm" || /mitm|proxy/i.test(entry.tag);
  if (filterId === "token") return entry.category === "token" || /token/i.test(entry.tag);
  return true;
}

/**
 * Format parsed metadata into concise visual chips.
 */
export function formatMetaChips(meta) {
  if (!meta || typeof meta !== "object") return [];
  const chips = [];

  if (meta.email) {
    chips.push({
      key: "email",
      label: String(meta.email),
      tone: "bg-sky-500/15 text-sky-300 border-sky-500/35 font-semibold",
    });
  }
  if (meta.provider) {
    chips.push({
      key: "provider",
      label: String(meta.provider),
      tone: "bg-indigo-500/15 text-indigo-300 border-indigo-500/30",
    });
  }
  if (meta.model) {
    chips.push({
      key: "model",
      label: String(meta.model),
      tone: "bg-emerald-500/15 text-emerald-300 border-emerald-500/35 font-semibold",
    });
  }
  if (meta.tool) {
    chips.push({
      key: "tool",
      label: String(meta.tool),
      tone: "bg-amber-500/15 text-amber-300 border-amber-500/35 font-semibold",
    });
  }
  if (meta.host) {
    chips.push({
      key: "host",
      label: String(meta.host),
      tone: "bg-purple-500/15 text-purple-300 border-purple-500/35",
    });
  }
  if (meta.proto) {
    chips.push({
      key: "proto",
      label: String(meta.proto).toUpperCase(),
      tone: "bg-cyan-500/15 text-cyan-300 border-cyan-500/35 font-mono",
    });
  }
  if (meta.originalModel) {
    chips.push({
      key: "originalModel",
      label: `from: ${String(meta.originalModel)}`,
      tone: "bg-slate-500/20 text-slate-300 border-slate-500/35",
    });
  }
  if (meta.status !== undefined && meta.status !== null && meta.status !== "") {
    const code = Number(meta.status);
    if (Number.isFinite(code)) {
      const tone =
        code >= 500
          ? "bg-red-500/15 text-red-300 border-red-500/30"
          : code >= 400
            ? "bg-amber-500/15 text-amber-300 border-amber-500/30"
            : "bg-emerald-500/12 text-emerald-300 border-emerald-500/30";
      chips.push({
        key: "status",
        label: `HTTP ${code}`,
        tone,
      });
    }
  }
  const connId = meta.connectionId || meta.id;
  if (connId && typeof connId === "string" && !meta.email) {
    chips.push({
      key: "id",
      label: `#${connId.slice(0, 8)}`,
      tone: "bg-white/10 text-slate-300 border-white/15",
    });
  }
  if (typeof meta.expiresIn === "number" && Number.isFinite(meta.expiresIn)) {
    const mins = Math.round(meta.expiresIn / 60);
    chips.push({
      key: "exp",
      label: mins >= 0 ? `hết hạn ${mins}m` : `quá hạn ${Math.abs(mins)}m`,
      tone:
        mins >= 0
          ? "bg-teal-500/12 text-teal-300 border-teal-500/30"
          : "bg-amber-500/15 text-amber-300 border-amber-500/30",
    });
  }
  if (meta.success === true) {
    chips.push({
      key: "ok",
      label: "✓ OK",
      tone: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
    });
  } else if (meta.success === false) {
    chips.push({
      key: "fail",
      label: "✕ Lỗi",
      tone: "bg-red-500/15 text-red-300 border-red-500/30",
    });
  }

  // Fallback for additional short primitive fields
  if (chips.length === 0) {
    Object.entries(meta)
      .filter(
        ([, v]) =>
          v !== null &&
          v !== undefined &&
          typeof v !== "object" &&
          (typeof v !== "number" || Number.isFinite(v))
      )
      .slice(0, 3)
      .forEach(([k, v]) => {
        chips.push({
          key: k,
          label: `${k}: ${String(v).slice(0, 28)}`,
          tone: "bg-white/10 text-slate-300 border-white/15",
        });
      });
  }

  return chips;
}