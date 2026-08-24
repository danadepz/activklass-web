/* ------------------------------------------------------------------ *
 * confirmDialog / promptDialog / alertDialog — in-app replacements for
 * window.confirm, window.prompt and alert.
 *
 * Owned by the UI/UX lane (see OWNERSHIP.md).
 *
 * There were 36 native dialogs across the app: 23 confirms, 13 alerts and 3
 * prompts. They render as operating-system chrome with the origin printed
 * above the message, they block the JS thread, they cannot be styled, and
 * window.prompt in particular is the most dated control still shipping in a
 * browser — one of ours asked an administrator to type a new password into it.
 *
 * The API is deliberately imperative and promise-based rather than a hook,
 * because that keeps the migration a one-line change at each call site:
 *
 *     if (!window.confirm('Delete this?')) return
 *     if (!(await confirmDialog('Delete this?'))) return
 *
 * and the handler gains an `async`. A hook would have meant restructuring
 * every one of those handlers into render-time state, in files owned by other
 * panes.
 *
 * This file holds the store and the imperative API and nothing else; the
 * components that render it live in DialogHost.jsx, which main.jsx mounts
 * once. Splitting them is what keeps react-refresh/only-export-components
 * quiet — the lane's files lint clean and should stay that way.
 * ------------------------------------------------------------------ */

let seq = 0
let queue = []
const listeners = new Set()

function emit() {
  for (const l of listeners) l()
}

/** useSyncExternalStore contract: subscribe returns its own unsubscribe. */
export function subscribeDialogs(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

/** Stable reference between emits, so the store does not re-render on every tick. */
export function getDialogs() {
  return queue
}

function push(spec) {
  return new Promise((resolve) => {
    seq += 1
    queue = [...queue, { ...spec, id: seq, resolve }]
    emit()
  })
}

/** Resolve one dialog and drop it from the queue. */
export function settleDialog(id, value) {
  const entry = queue.find((d) => d.id === id)
  queue = queue.filter((d) => d.id !== id)
  emit()
  entry?.resolve(value)
}

/** A bare string is the message; an object is the full spec. */
function normalize(input) {
  return typeof input === 'string' ? { message: input } : (input ?? {})
}

/**
 * Ask a yes/no question. Resolves `true` only if the reader confirms —
 * dismissing with Escape, the backdrop or Cancel all resolve `false`, which
 * is the same contract window.confirm had.
 *
 * @param {string|object} input message, or { title, message, confirmLabel,
 *   cancelLabel, tone: 'danger'|'primary', typeToConfirm }
 *
 * `typeToConfirm: 'DELETE'` adds the GitHub-style guard: an input the reader
 * must type the phrase into before the confirm button arms. Reserve it for
 * deletions that destroy data with no undo -- a class, a published quiz with
 * attempts, a syllabus. Reversible actions (archive, close, unpublish) stay
 * one click, or the guard stops meaning anything.
 */
export function confirmDialog(input) {
  return push({ kind: 'confirm', ...normalize(input) })
}

/**
 * Ask for a line of text. Resolves the string, or `null` if dismissed —
 * matching window.prompt, so a `?? ''` at a call site still means the same
 * thing.
 *
 * `validate` runs on submit and returns an error string to block, or a falsy
 * value to allow. It is what replaces re-prompting in a loop.
 */
export function promptDialog(input) {
  return push({ kind: 'prompt', ...normalize(input) })
}

/**
 * Acknowledge-only. Prefer a toast for success; this is for the things that
 * must be read before the reader moves on.
 */
export function alertDialog(input) {
  return push({ kind: 'alert', ...normalize(input) })
}
