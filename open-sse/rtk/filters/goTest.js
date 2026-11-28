// Port of go_test filter (rtk/src/cmds/go/go_cmd.rs).
// Supports both `go test -json` NDJSON streams and standard `go test` text output.
import { stripAnsi } from "../stripAnsi.js";

const GO_MAX_FAILURES = 10;
const GO_FAILURE_LINES = 4;

function parseJsonStream(clean) {
  const lines = clean.split("\n").map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0 || !lines[0].startsWith("{")) return null;

  let passed = 0;
  let failed = 0;
  let skipped = 0;
  const outputMap = new Map();
  const failedTests = [];
  const failedPackages = new Set();

  for (const line of lines) {
    let evt;
    try {
      evt = JSON.parse(line);
    } catch {
      return null;
    }
    if (!evt || typeof evt.Action !== "string") return null;

    const key = evt.Test ? `${evt.Package || ""}::${evt.Test}` : evt.Package || "";
    if (evt.Action === "output" && typeof evt.Output === "string" && evt.Test) {
      const list = outputMap.get(key) || [];
      const text = evt.Output.trim();
      if (text && !text.startsWith("=== RUN") && !text.startsWith("--- FAIL")) {
        list.push(text);
        outputMap.set(key, list);
      }
    } else if (evt.Action === "pass" && evt.Test) {
      passed += 1;
    } else if (evt.Action === "skip" && evt.Test) {
      skipped += 1;
    } else if (evt.Action === "fail") {
      if (evt.Test) {
        failed += 1;
        failedTests.push({ key, name: evt.Test, pkg: evt.Package || "" });
      } else if (evt.Package) {
        failedPackages.add(evt.Package);
      }
    }
  }

  const out = [
    `go test: ${failed > 0 || failedPackages.size > 0 ? "FAIL" : "ok"} (${passed} passed, ${failed} failed, ${skipped} skipped)`,
  ];

  if (failedTests.length > 0) {
    failedTests.slice(0, GO_MAX_FAILURES).forEach((t, idx) => {
      out.push(`${idx + 1}. ${t.name}${t.pkg ? ` (${t.pkg})` : ""}`);
      for (const l of (outputMap.get(t.key) || []).slice(0, GO_FAILURE_LINES)) {
        out.push(`   ${l}`);
      }
    });
    if (failedTests.length > GO_MAX_FAILURES) {
      out.push(`+${failedTests.length - GO_MAX_FAILURES} more failures`);
    }
  } else if (failedPackages.size > 0) {
    out.push(`Failed packages: ${Array.from(failedPackages).join(", ")}`);
  }

  return out.join("\n");
}

export function goTest(input) {
  const clean = stripAnsi(input || "");
  if (!clean.trim()) return "";

  const jsonResult = parseJsonStream(clean);
  if (jsonResult) return jsonResult;

  const lines = clean.split("\n");
  let okPackages = 0;
  const failPackages = [];
  const failures = [];
  let active = null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (/^ok\s+\S+/.test(trimmed)) {
      okPackages += 1;
      active = null;
      continue;
    }
    if (/^FAIL\s+\S+/.test(trimmed)) {
      failPackages.push(trimmed);
      active = null;
      continue;
    }
    const failMatch = /^---\s+FAIL:\s+(.+?)(?:\s+\(.+\))?$/.exec(trimmed);
    if (failMatch) {
      active = { name: failMatch[1].trim(), lines: [] };
      failures.push(active);
      continue;
    }
    if (/^(?:---\s+PASS:|===\s+RUN|FAIL$|PASS$)/.test(trimmed)) {
      active = null;
      continue;
    }
    if (active && trimmed.length > 0 && active.lines.length < GO_FAILURE_LINES) {
      active.lines.push(trimmed);
    }
  }

  if (okPackages === 0 && failPackages.length === 0 && failures.length === 0) {
    return clean;
  }

  const status = failPackages.length > 0 || failures.length > 0 ? "FAIL" : "ok";
  const out = [`go test: ${status} (${okPackages} ok packages, ${failPackages.length} failed packages, ${failures.length} failed tests)`];

  if (failures.length > 0) {
    failures.slice(0, GO_MAX_FAILURES).forEach((f, idx) => {
      out.push(`${idx + 1}. ${f.name}`);
      for (const detail of f.lines) out.push(`   ${detail}`);
    });
    if (failures.length > GO_MAX_FAILURES) {
      out.push(`+${failures.length - GO_MAX_FAILURES} more failures`);
    }
  }

  return out.join("\n");
}

goTest.filterName = "go-test";
