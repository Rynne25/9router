// Port of filter_ruff_check (rtk/src/cmds/python/ruff_cmd.rs).
// Supports Ruff JSON diagnostic arrays and compact text diagnostics.
import { TSC_MESSAGE_MAX_CHARS } from "../constants.js";
import { stripAnsi } from "../stripAnsi.js";

const RE_RUFF_TEXT = /^(.+?\.pyi?):(\d+):(\d+):\s+([A-Z]{1,4}\d{3,4})\s+(.+)$/;

function truncate(text, max) {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 3)}...`;
}

function formatGrouped(entries) {
  if (entries.length === 0) return "ruff: All checks passed";

  const byFile = new Map();
  const byCode = new Map();
  for (const e of entries) {
    if (!byFile.has(e.file)) byFile.set(e.file, []);
    byFile.get(e.file).push(e);
    byCode.set(e.code, (byCode.get(e.code) || 0) + 1);
  }

  const out = [`ruff: ${entries.length} issues in ${byFile.size} files`];
  const topCodes = Array.from(byCode.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5);
  if (topCodes.length > 0) {
    out.push(`Top rules: ${topCodes.map(([c, n]) => `${c} (${n}x)`).join(", ")}`);
  }
  out.push("");

  const filesSorted = Array.from(byFile.entries()).sort((a, b) => b[1].length - a[1].length);
  for (const [file, items] of filesSorted) {
    out.push(`${file} (${items.length})`);
    for (const item of items) {
      out.push(`  L${item.line}: ${item.code} ${truncate(item.message, TSC_MESSAGE_MAX_CHARS)}`);
    }
    out.push("");
  }

  return out.join("\n").trim();
}

export function ruffCheck(input) {
  const clean = stripAnsi(input || "");
  if (!clean.trim()) return "";
  if (/^All checks passed!?$/m.test(clean)) return "ruff: All checks passed";

  const trimmed = clean.trim();
  if (trimmed.startsWith("[")) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        const entries = parsed
          .filter((item) => item && item.filename && item.code)
          .map((item) => ({
            file: item.filename,
            line: Number(item.location?.row || 0),
            code: String(item.code),
            message: String(item.message || ""),
          }));
        if (parsed.length === 0 || entries.length > 0) {
          return formatGrouped(entries);
        }
      }
    } catch {
      // Fall through to text parser
    }
  }

  const entries = [];
  for (const line of clean.split("\n")) {
    const m = RE_RUFF_TEXT.exec(line.trim());
    if (m) {
      entries.push({
        file: m[1],
        line: Number(m[2]),
        code: m[4],
        message: m[5].trim(),
      });
    }
  }

  if (entries.length === 0) return clean;
  return formatGrouped(entries);
}

ruffCheck.filterName = "ruff-check";
