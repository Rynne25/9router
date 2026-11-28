// Port of filter_pytest_output (rtk/src/cmds/python/pytest_cmd.rs).
// Compacts verbose pytest session output into failure summaries + pass/fail counts.
import { stripAnsi } from "../stripAnsi.js";

const PYTEST_MAX_FAILURES = 10;
const PYTEST_MAX_DETAIL_LINES = 2;
const RE_SUMMARY_LINE = /^=+\s*(.+?(?:passed|failed|error|skipped|xfailed|warnings?).*?)\s*=+$/m;
const RE_FAILED_ITEM = /^FAILED\s+(.+?)(?:\s+-\s+(.*))?$/;
const RE_SECTION_HEADER = /^_{3,}\s+(.+?)\s+_{3,}$/;

export function pytest(input) {
  const clean = stripAnsi(input || "");
  if (!clean.trim()) return "";

  const lines = clean.split("\n");
  const detailsByTest = new Map();
  let currentSection = null;
  let capturingSection = false;

  for (const line of lines) {
    const secMatch = RE_SECTION_HEADER.exec(line.trim());
    if (secMatch) {
      currentSection = secMatch[1].trim();
      capturingSection = true;
      if (!detailsByTest.has(currentSection)) detailsByTest.set(currentSection, []);
      continue;
    }

    if (/^=+\s*(?:short test summary|warnings summary|\d+\s+(?:passed|failed))/.test(line.trim())) {
      capturingSection = false;
      continue;
    }

    if (capturingSection && currentSection) {
      const trimmed = line.trim();
      if (trimmed.startsWith("E   ")) {
        const list = detailsByTest.get(currentSection);
        if (list.length < PYTEST_MAX_DETAIL_LINES) {
          list.push(trimmed.slice(4).trim());
        }
      }
    }
  }

  const failedLines = [];
  for (const line of lines) {
    const m = RE_FAILED_ITEM.exec(line.trim());
    if (m) {
      failedLines.push({ target: m[1].trim(), inlineReason: m[2]?.trim() || "" });
    }
  }

  // Extract trailing summary if not captured by section banner match (last =...= line)
  let summary = "";
  for (let i = lines.length - 1; i >= 0; i--) {
    const m = RE_SUMMARY_LINE.exec(lines[i].trim());
    if (m) {
      summary = m[1].trim();
      break;
    }
  }

  if (!summary && failedLines.length === 0 && detailsByTest.size === 0) {
    return clean;
  }

  const out = [`pytest: ${summary || `${failedLines.length} failed`}`];

  if (failedLines.length > 0) {
    const shown = failedLines.slice(0, PYTEST_MAX_FAILURES);
    shown.forEach((item, idx) => {
      out.push(`${idx + 1}. ${item.target}`);
      const shortKey = item.target.split("::").pop();
      const extra = detailsByTest.get(item.target) || detailsByTest.get(shortKey) || [];
      if (item.inlineReason && extra.length === 0) {
        out.push(`   ${item.inlineReason}`);
      } else {
        for (const d of extra.slice(0, PYTEST_MAX_DETAIL_LINES)) {
          out.push(`   ${d}`);
        }
      }
    });
    if (failedLines.length > PYTEST_MAX_FAILURES) {
      out.push(`+${failedLines.length - PYTEST_MAX_FAILURES} more failures`);
    }
  }

  return out.join("\n");
}

pytest.filterName = "pytest";
