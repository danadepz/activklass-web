#!/usr/bin/env node
/** PostToolUse hook — run the tests that cover the file just edited.
 *
 *  There is no typechecker on this repo (plain JSX), so the vitest suite and
 *  the build are the only automated checks. The full suite is only ~1.2s, but
 *  running all of it on every edit would fail one pane's hook because ANOTHER
 *  pane is mid-edit — four panes share this checkout. So this runs only the
 *  test file that covers the edited module.
 *
 *  Editing src/lib/foo.js runs src/lib/foo.test.js, if it exists.
 *  Editing one of the three modules ported into activklass-mobile also runs
 *  portParity.test.js, which is the check people forget.
 *
 *  Exit 2 → failures are surfaced to Claude. No matching test = no-op. */
import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

// Ports shared with activklass-mobile/src/lib — held in step by portParity.
const PORTED = ["quizPool", "quizFeedback", "quizAttempts"];

let raw = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (c) => (raw += c));
process.stdin.on("end", () => {
  let filePath = "";
  try {
    filePath = JSON.parse(raw || "{}")?.tool_input?.file_path || "";
  } catch {
    process.exit(0);
  }

  const rel = filePath.replace(/\\/g, "/");
  if (!/\/src\/.+\.jsx?$/.test(rel)) process.exit(0); // not app source — no-op

  const repo = process.cwd();
  const srcRel = rel.slice(rel.lastIndexOf("/src/") + 1); // "src/lib/foo.js"
  const targets = new Set();

  if (/\.test\.jsx?$/.test(srcRel)) {
    targets.add(srcRel);
  } else {
    const sibling = srcRel.replace(/\.(jsx?)$/, ".test.$1");
    if (existsSync(path.join(repo, sibling))) targets.add(sibling);
  }

  const base = path.basename(srcRel).replace(/\.jsx?$/, "");
  if (PORTED.includes(base)) targets.add("src/lib/portParity.test.js");

  if (targets.size === 0) process.exit(0); // nothing covers it — say nothing

  const list = [...targets];
  try {
    execSync(`npx vitest run ${list.join(" ")}`, { stdio: "inherit", cwd: repo });
    process.exit(0);
  } catch {
    console.error(
      `\n[hook] Tests failed after editing ${srcRel}\n` +
        `Ran: ${list.join(", ")}\n` +
        "If this is portParity.test.js, the fix is in activklass-mobile/src/lib — " +
        "never in the test.",
    );
    process.exit(2);
  }
});
