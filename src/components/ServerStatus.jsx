import { useEffect, useRef, useState } from 'react'
import { gold, goldDeep, ink, navy } from '@/theme'

/**
 * Says out loud when the API is down, because nothing else does.
 *
 * Two teacher walkthroughs in a row were run against a dead backend, and both
 * produced the same report: a list of unrelated features "not functioning".
 * The app opens, signs in and renders every page without the API -- all of that
 * is Firestore -- so the first sign of trouble is a button that appears to do
 * nothing, several minutes in.
 *
 * That is worse for a remote tester on a forwarded port. They cannot see a
 * terminal, cannot check a port, and cannot start anything; asking them
 * afterwards whether the server was running is asking for something they had no
 * way to know. This gives them the answer on screen, before the first click.
 *
 * GET /api/health needs no token (app/__init__.py), so this works signed out
 * too, and polls rather than checking once: the usual case is the API coming
 * back mid-session, and the banner should disappear on its own when it does.
 */
const HEALTH_URL = `${import.meta.env.VITE_API_URL ?? ''}/api/health`
const POLL_MS = 30000
const RETRY_MS = 2000
const TIMEOUT_MS = 4000

async function ping(signal) {
  try {
    const res = await fetch(HEALTH_URL, { cache: 'no-store', signal })
    /* A 502 from the Vite proxy means Vite is up and Flask is not -- which is
       exactly the case this banner exists for, and it arrives as a perfectly
       successful fetch. Anything that is not a 2xx JSON answer counts as down. */
    if (!res.ok) return false
    const body = await res.json().catch(() => null)
    return body?.status === 'ok'
  } catch {
    return false
  }
}

export default function ServerStatus() {
  // null = not checked yet. Nothing renders until we know, so a slow first
  // answer never flashes a warning at someone whose server is fine.
  const [up, setUp] = useState(null)

  const checkRef = useRef(() => {})

  useEffect(() => {
    let alive = true
    let running = false
    let controller
    let timeout
    let retryTimer
    let finishWait
    let pollTimer
    const request = async () => {
      controller = new AbortController()
      timeout = setTimeout(() => controller.abort(), TIMEOUT_MS)
      try {
        return await ping(controller.signal)
      } finally {
        clearTimeout(timeout)
      }
    }
    const run = async () => {
      if (!alive || running) return
      running = true
      clearTimeout(pollTimer)
      try {
        let ok = await request()
        if (!ok && alive) {
          await new Promise((resolve) => {
            finishWait = resolve
            retryTimer = setTimeout(resolve, RETRY_MS)
          })
          finishWait = undefined
          if (alive) ok = await request()
        }
        if (alive) setUp(ok)
      } finally {
        running = false
        if (alive) pollTimer = setTimeout(run, POLL_MS)
      }
    }
    checkRef.current = run
    run()
    // Coming back to the tab is the moment someone is about to try again.
    const onFocus = () => run()
    window.addEventListener('focus', onFocus)
    return () => {
      alive = false
      clearTimeout(pollTimer)
      clearTimeout(retryTimer)
      clearTimeout(timeout)
      controller?.abort()
      finishWait?.()
      checkRef.current = () => {}
      window.removeEventListener('focus', onFocus)
    }
  }, [])

  if (up !== false) return null

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        background: gold,
        color: ink,
        borderBottom: `1px solid ${goldDeep}`,
        padding: '10px 18px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12,
        flexWrap: 'wrap',
        fontSize: 13.5,
        fontWeight: 500,
        textAlign: 'center',
      }}
    >
      <span>
        <strong style={{ fontWeight: 700 }}>The ActivKlass server is not responding.</strong>{' '}
        Adding students, uploading a roster and the admin page will not work until it is
        back. Everything else is fine — this is not something you did.
      </span>
      <button
        type="button"
        onClick={() => checkRef.current()}
        style={{
          background: navy,
          color: '#FAFAF6',
          border: 'none',
          borderRadius: 8,
          padding: '5px 12px',
          fontSize: 12.5,
          fontWeight: 600,
          fontFamily: 'inherit',
          cursor: 'pointer',
        }}
      >
        Check again
      </button>
    </div>
  )
}
