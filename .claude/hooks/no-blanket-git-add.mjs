#!/usr/bin/env node
/** PreToolUse hook — stop a pane staging another pane's work.
 *
 *  Several Claude Code panes share this one checkout (see OWNERSHIP.md), so
 *  `git add -A`, `git add .` and `git commit -a` sweep every other pane's
 *  in-flight edits into your commit. OWNERSHIP.md already forbids them; this
 *  makes forgetting impossible rather than merely discouraged.
 *
 *  Exit 2 = block the call and show this message to Claude.
 *  Anything it cannot parse exits 0 — a hook must never block on itself. */

let raw = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (c) => (raw += c));
process.stdin.on("end", () => {
  let command = "";
  try {
    command = JSON.parse(raw || "{}")?.tool_input?.command || "";
  } catch {
    process.exit(0);
  }
  if (!command) process.exit(0);

  // Split on the operators that start a new command, so `echo hi && git add -A`
  // is inspected as two commands and `git add ./src/lib/api.js` is not a match.
  const segments = command.split(/(?:&&|\|\||[;|\n])/);

  const offenders = [
    // git add -A / --all / . / -u  (long and short forms, anywhere in the args)
    { re: /\bgit\s+add\b(?=[^\n]*(?:\s-{1,2}(?:A\b|all\b|u\b)|\s\.(?:\s|$)))/i, name: "git add -A / git add . / git add -u" },
    // git commit -a / --all, but NOT --amend and not -m alone
    { re: /\bgit\s+commit\b(?=[^\n]*(?:\s--all\b|\s-[a-zA-Z]*a[a-zA-Z]*\b))/i, name: "git commit -a" },
  ];

  for (const segment of segments) {
    for (const { re, name } of offenders) {
      if (re.test(segment)) {
        console.error(
          `\n[hook] Blocked: ${name}\n\n` +
            "Several panes share this checkout, so a blanket stage sweeps their\n" +
            "in-flight edits into your commit. Stage explicit paths instead:\n\n" +
            "    git add src/lib/thing.js src/routes/teacher/thing.jsx\n\n" +
            "See OWNERSHIP.md > How to work. If you genuinely need everything,\n" +
            "run `git status` first and list the paths you mean.",
        );
        process.exit(2);
      }
    }
  }
  process.exit(0);
});
