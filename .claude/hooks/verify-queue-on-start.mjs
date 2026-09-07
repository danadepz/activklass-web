// SessionStart hook: is anything on the ticket board marked `fixed` but not yet
// `verified`? If so, say so at the top of the session, so the verification pane
// never has to be told a fixed ticket arrived.
//
// Why this exists: the /verify watch is a session-bound loop. It caught T-19
// within minutes while the session was alive, and missed T-20, T-21 and T-23
// entirely because each landed after the terminal had closed — the owner had
// to say "new fixed ticket is there" three times. A hook at session start is
// the one place that runs whether or not anyone remembered to restart the loop.
//
// Lane safety: every pane in this checkout starts sessions here — the debug
// pane, the tickets pane, the verify pane. A pane that fixes must never also
// verify, so the message is conditional on the reader being the verification
// pane, and the hook prints nothing at all when the queue is empty, so other
// panes' context stays clean.
//
// Reads only. Never edits the ledger.
import { readFileSync } from 'node:fs'

const LEDGER = 'C:/CAPSTONE/_tools/discord/tickets/_ledger.md'

let text
try {
  text = readFileSync(LEDGER, 'utf8')
} catch {
  process.exit(0) // no board on this machine — nothing to say
}

// Issue rows: | id | title | kind | repo | pane | tickets | state | card | commit |
const outstanding = []
for (const line of text.split(/\r?\n/)) {
  const m = line.match(/^\|\s*(T-\d+)\s*\|/)
  if (!m) continue
  const cells = line.split('|').map((c) => c.trim())
  const [, id, title, , , , , state, , commit] = cells
  const s = (state ?? '').toLowerCase()
  if (s.includes('fixed') && !s.includes('verified')) {
    outstanding.push({ id, title, state, commit: commit || '(no commit cited)' })
  }
}

if (outstanding.length === 0) process.exit(0)

const rows = outstanding
  .map((r) => `  ${r.id}  [${r.state}]  ${r.commit}\n      ${r.title}`)
  .join('\n')
const ids = outstanding.map((r) => r.id).join(', ')

const context = [
  `Ticket board: ${outstanding.length} issue(s) marked fixed and NOT yet verified.`,
  rows,
  '',
  'If this session is the verification pane (the /verify + /loop double-checker):',
  `  run /verify on ${ids}, oldest first, following the skill exactly — fix in tree,`,
  '  tester\'s repro driven in Chrome on :5173, regression test proved to fail without',
  '  the fix — then re-arm the /loop watch. Never fix what fails; set it back to',
  '  dispatched with the evidence.',
  'If this session is any other pane: leave these alone. A pane that fixes must not',
  '  also verify its own work.',
].join('\n')

process.stdout.write(
  JSON.stringify({
    systemMessage: `Ticket board: ${outstanding.length} fixed, unverified — ${ids}`,
    hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: context },
  }),
)
