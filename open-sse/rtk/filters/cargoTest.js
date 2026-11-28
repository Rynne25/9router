// Port of filter_cargo_test (rtk/src/cmds/rust/cargo_cmd.rs).
// Drops passing `test ... ok` lines and surfaces only failure diagnostics + totals.
import { stripAnsi } from "../stripAnsi.js";

const CARGO_MAX_FAILURES = 10;
const CARGO_FAILURE_LINES = 4;
const RE_TEST_RESULT = /^test result:\s*(ok|FAILED)\.\s*(\d+)\s+passed;\s*(\d+)\s+failed;\s*(\d+)\s+ignored/;
const RE_FAILURE_HEADER = /^----\s+(.+?)\s+stdout\s+----$/;

export function cargoTest(input) {
  const clean = stripAnsi(input || "");
  if (!clean.trim()) return "";

  const lines = clean.split("\n");
  let totalPassed = 0;
  let totalFailed = 0;
  let totalIgnored = 0;
  let resultLines = 0;

  const failures = [];
  let activeFailure = null;

  for (const line of lines) {
    const trimmed = line.trim();
    const resMatch = RE_TEST_RESULT.exec(trimmed);
    if (resMatch) {
      resultLines += 1;
      totalPassed += Number(resMatch[2]);
      totalFailed += Number(resMatch[3]);
      totalIgnored += Number(resMatch[4]);
      activeFailure = null;
      continue;
    }

    const failMatch = RE_FAILURE_HEADER.exec(trimmed);
    if (failMatch) {
      activeFailure = { name: failMatch[1].trim(), lines: [] };
      failures.push(activeFailure);
      continue;
    }

    if (trimmed === "failures:" || /^thread '.+' panicked/.test(trimmed)) {
      if (activeFailure && trimmed.startsWith("thread ")) {
        activeFailure.lines.push(trimmed);
      } else if (trimmed === "failures:") {
        activeFailure = null;
      }
      continue;
    }

    if (activeFailure && trimmed.length > 0 && !trimmed.startsWith("note: run with")) {
      if (activeFailure.lines.length < CARGO_FAILURE_LINES) {
        activeFailure.lines.push(trimmed);
      }
    }
  }

  if (resultLines === 0 && failures.length === 0) {
    return clean;
  }

  const status = totalFailed > 0 ? "FAILED" : "ok";
  const out = [`cargo test: ${status} (${totalPassed} passed, ${totalFailed} failed, ${totalIgnored} ignored)`];

  if (failures.length > 0) {
    const shown = failures.slice(0, CARGO_MAX_FAILURES);
    shown.forEach((f, idx) => {
      out.push(`${idx + 1}. ${f.name}`);
      for (const detail of f.lines) {
        out.push(`   ${detail}`);
      }
    });
    if (failures.length > CARGO_MAX_FAILURES) {
      out.push(`+${failures.length - CARGO_MAX_FAILURES} more failures`);
    }
  }

  return out.join("\n");
}

cargoTest.filterName = "cargo-test";
