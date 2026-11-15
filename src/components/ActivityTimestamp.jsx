import { useSyncExternalStore } from 'react'
import { ink, faint } from '@/theme'

/* ------------------------------------------------------------------ *
 * ActivityTimestamp — "when was this person last active", as a readable
 * relative time with the exact moment on hover.
 *
 * Owned by the UI/UX lane (see OWNERSHIP.md).
 *
 * DATA DEPENDENCY, NOT YET MET. The screens that render this pass
 * `users/{uid}.last_active_at`, and nothing in the system writes that field
 * yet: Firebase Auth keeps each account's last sign-in, but only the Admin
 * SDK can read it for someone else, so it has to be copied onto the profile
 * server-side (activklass-backend). Until it is, every row honestly reads
 * "No activity recorded". Never feed this `updated_at` -- that is stamped
 * when an admin edits a profile, not when the student did anything.
 *
 * The label re-renders once a minute through one shared ticker, so a page
 * left open keeps saying the right thing without a refetch, and a refetch
 * (new value) re-renders it immediately.
 * ------------------------------------------------------------------ */

const MINUTE = 60 * 1000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

/** Firestore Timestamp ({ seconds } or .toMillis()), Date, ms number or ISO string -> ms, else null. */
export function toMillis(value) {
  if (value == null || value === '') return null
  let ms
  if (typeof value.toMillis === 'function') ms = value.toMillis()
  else if (typeof value.seconds === 'number') ms = value.seconds * 1000 + Math.floor((value.nanoseconds ?? 0) / 1e6)
  else if (value instanceof Date) ms = value.getTime()
  else if (typeof value === 'number') ms = value
  else ms = new Date(value).getTime()
  return Number.isFinite(ms) ? ms : null
}

const plural = (n, unit) => `${n} ${unit}${n === 1 ? '' : 's'} ago`

/**
 * "Just now", "20 minutes ago", "1 hour ago", "2 days ago", "3 months ago".
 * Returns null when there is no usable time. A time slightly in the future
 * (a device clock running ahead) reads as "Just now" rather than a negative.
 */
export function formatRelative(value, now = Date.now()) {
  const ms = toMillis(value)
  if (ms == null) return null
  const diff = Math.max(0, now - ms)
  if (diff < MINUTE) return 'Just now'
  if (diff < HOUR) return plural(Math.floor(diff / MINUTE), 'minute')
  if (diff < DAY) return plural(Math.floor(diff / HOUR), 'hour')
  if (diff < 30 * DAY) return plural(Math.floor(diff / DAY), 'day')
  if (diff < 365 * DAY) return plural(Math.floor(diff / (30 * DAY)), 'month')
  return plural(Math.floor(diff / (365 * DAY)), 'year')
}

/** The exact moment, for the hover title: "Nov 15, 2026, 10:21 AM". */
export function formatExact(value) {
  const ms = toMillis(value)
  if (ms == null) return null
  return new Date(ms).toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
  }).replace(/ /g, ' ') // newer ICU puts a narrow no-break space before AM/PM
}

export const NO_ACTIVITY_LABEL = 'No activity recorded'

/* One interval for every timestamp on the page, not one per table row. */
let tick = Date.now()
const listeners = new Set()
let timer = null
function subscribe(fn) {
  listeners.add(fn)
  if (!timer) {
    timer = setInterval(() => {
      tick = Date.now()
      listeners.forEach((l) => l())
    }, MINUTE)
  }
  return () => {
    listeners.delete(fn)
    if (listeners.size === 0) { clearInterval(timer); timer = null }
  }
}
const getTick = () => tick
const getServerTick = () => Date.now()

export default function ActivityTimestamp({ value, style }) {
  useSyncExternalStore(subscribe, getTick, getServerTick)
  // Date.now() rather than the tick itself: the tick only decides *when* to
  // re-render; a value that just changed on refetch is measured from now.
  const relative = formatRelative(value, Date.now())

  if (relative == null) {
    return (
      <span style={{ fontSize: 12.5, color: faint, whiteSpace: 'nowrap', ...style }}>
        {NO_ACTIVITY_LABEL}
      </span>
    )
  }

  const exact = formatExact(value)
  return (
    <time
      dateTime={new Date(toMillis(value)).toISOString()}
      title={exact}
      style={{ fontSize: 13, color: ink, whiteSpace: 'nowrap', cursor: 'help', ...style }}
    >
      {relative}
    </time>
  )
}
