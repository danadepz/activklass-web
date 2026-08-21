import { useCallback, useEffect, useRef, useState } from 'react'

/* ------------------------------------------------------------------ *
 * useAsyncAction — run an async handler once at a time, and say so.
 *
 * Owned by the UI/UX lane (see OWNERSHIP.md).
 *
 * Only ten files disabled a control while its write was in flight. Everywhere
 * else a second click during a slow Firestore round-trip fired the handler
 * again: two identical announcements, a delete racing its own refetch, a
 * question saved to the bank twice.
 *
 * Two halves, and both matter:
 *   - the ref guard actually prevents the second call, synchronously, before
 *     React has re-rendered anything
 *   - the `pending` flag lets the button go disabled and say what it is doing,
 *     so the reader knows the first click landed and does not try again
 *
 * A ref alone would stop the double write and still leave the button looking
 * inert; state alone would leave a gap between the click and the re-render in
 * which a second click gets through.
 *
 *     const [remove, removing] = useAsyncAction(() => onDelete(id))
 *     <button onClick={remove} disabled={removing}>
 *       {removing ? 'Deleting…' : 'Delete'}
 *     </button>
 * ------------------------------------------------------------------ */
export function useAsyncAction(fn) {
  const [pending, setPending] = useState(false)
  const running = useRef(false)
  const mounted = useRef(true)

  useEffect(() => () => { mounted.current = false }, [])

  const run = useCallback(async (...args) => {
    if (running.current) return undefined
    running.current = true
    setPending(true)
    try {
      return await fn(...args)
    } finally {
      running.current = false
      // The handler may have navigated away or removed the row it lived in.
      if (mounted.current) setPending(false)
    }
  }, [fn])

  return [run, pending]
}

export default useAsyncAction
