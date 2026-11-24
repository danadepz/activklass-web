/* ------------------------------------------------------------------ *
 * toast() — transient confirmation of something that already happened.
 *
 * Owned by the UI/UX lane (see OWNERSHIP.md).
 *
 * The app had no such thing: a successful save was either silent or an
 * `alert('Question saved to Quiz Bank successfully!')`, which stops the reader
 * to make them dismiss news they did not need to act on. Failures were the
 * same alert with an exception message in it.
 *
 * Split by weight, deliberately:
 *   toast.success  — it worked; do not interrupt
 *   toast.error    — it did not work; stays until dismissed, because an error
 *                    that fades before it is read is worse than none
 *   toast.info     — neutral progress
 *   toast.warning  — a temporary, non-critical caution; one that carries an
 *                    `action` stays until dismissed, because it asks for something
 *   alertDialog()  — must be read before continuing (see dialogs.js)
 *
 * `action` is what makes a destructive flow forgiving without building an
 * archive: delete optimistically, then offer Undo for a few seconds.
 *
 *     toast.success('Announcement deleted.', {
 *       action: { label: 'Undo', onClick: () => restore(row) },
 *     })
 *
 * Store and API only; Toaster.jsx renders it and main.jsx mounts that once.
 * ------------------------------------------------------------------ */

/** 0 means "until dismissed" — the deliberate default for actionable errors. */
const DEFAULT_MS = { success: 3000, info: 3000, warning: 3000, error: 0 }

let seq = 0
let items = []
const listeners = new Set()

function emit() {
  for (const l of listeners) l()
}

/** useSyncExternalStore contract: subscribe returns its own unsubscribe. */
export function subscribeToasts(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

/** Stable reference between emits. */
export function getToasts() {
  return items
}

export function dismissToast(id) {
  items = items.filter((t) => t.id !== id)
  emit()
}

function show(type, message, options = {}) {
  seq += 1
  const id = seq
  const duration = options.duration ?? (type === 'warning' && options.action ? 0 : DEFAULT_MS[type] ?? 4000)
  // The same notice again (a second click on Save) replaces the first instead
  // of stacking a copy; a timed one gets its full time again.
  items = items.filter((t) => !(t.type === type && t.message === message))
  items = [...items, { id, type, message, action: options.action, duration }]
  emit()
  if (duration > 0) setTimeout(() => dismissToast(id), duration)
  return id
}

/** `toast(msg)` is info; the named forms carry the tone. */
export const toast = Object.assign(
  (message, options) => show('info', message, options),
  {
    success: (message, options) => show('success', message, options),
    error: (message, options) => show('error', message, options),
    info: (message, options) => show('info', message, options),
    warning: (message, options) => show('warning', message, options),
    dismiss: dismissToast,
  },
)
