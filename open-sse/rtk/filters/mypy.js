// Port of filter_mypy_output (rtk/src/cmds/python/mypy_cmd.rs).
// Groups mypy diagnostics by file + ranks top error codes cleanly.
import { TSC_MESSAGE_MAX_CHARS } from "../constants.js";
import { stripAnsi } from "../stripAnsi.js";

const RE_MYPY_LINE = /^(.+?\.pyi?):(\d+)(?::(\d+))?:\s+(error|warning|note):\s+(.+?)(?:\s+\[([^\]]+)\])?$/;
const RE_MYPY_SUCCESS = /^Success:\s+no issues found/m;

function truncate(text, max) {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 3)}...`;
}

export function mypy(input) {
  const clean = stripAnsi(input || "");
  if (!clean.trim()) return "";

  if (RE_MYPY_SUCCESS.test(clean)) {
    return "mypy: No issues found";
  }

  const byFile = new Map();
  const byCode = new Map();
  let errorCount = 0;

  for (const line of clean.split("\n")) {
    const match = RE_MYPY_LINE.exec(line.trim());
    if (!match) continue;
    const [, file, lineNum, , severity, message, code] = match;
    if (severity === "note" && !byFile.has(file)) continue;
    if (severity === "error") {
      errorCount += 1;
      if (code) byCode.set(code, (byCode.get(code) || 0) + 1);
    }
    if (!byFile.has(file)) byFile.set(file, []);
    byFile.get(file).push({ line: Number(lineNum), severity, message: message.trim(), code: code || "" });
  }

  if (byFile.size === 0) return clean;

  const lines = [`mypy: ${errorCount} errors in ${byFile.size} files`];
  const topCodes = Array.from(byCode.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5);
  if (topCodes.length > 0) {
    lines.push(`Top codes: ${topCodes.map(([c, n]) => `[${c}] (${n}x)`).join(", ")}`);
  }
  lines.push("");

  const filesSorted = Array.from(byFile.entries()).sort((a, b) => b[1].length - a[1].length);
  for (const [file, items] of filesSorted) {
    lines.push(`${file} (${items.length})`);
    for (const item of items) {
      const codeTag = item.code ? ` [${item.code}]` : "";
      lines.push(`  L${item.line}: ${truncate(item.message, TSC_MESSAGE_MAX_CHARS)}${codeTag}`);
    }
    lines.push("");
  }

  return lines.join("\n").trim();
}

mypy.filterName = "mypy";
