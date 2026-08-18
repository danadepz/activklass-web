/**
 * Derived statistics for the operations console.
 *
 * Pure -- every number here comes from the /api/superadmin/subscribers payload
 * the page already fetches. No new endpoint, no second round trip, and no
 * stored counters to drift out of step with the rows on screen.
 *
 * The payload shape per row is { subscription, owner, usage }, where usage is
 * { teachers, students } and each slot is { used, seats, pct, over } --
 * see app/services/subscription_usage.py.
 */

/** Segments, in the order they appear in the filter row and the tiles. */
export const SEGMENTS = [
  { key: 'all', label: 'All' },
  { key: 'institution', label: 'Institutions' },
  { key: 'teacher', label: 'Solo teachers' },
]

/** Statuses the backend can set, matching SUBSCRIBER_STATUSES in superadmin.js. */
export const STATUSES = ['active', 'trial', 'suspended', 'cancelled']

/** Anything not 'institution' is a solo teacher, which is how the backend keys it. */
export function segmentOf(row) {
  return row?.subscription?.type === 'institution' ? 'institution' : 'teacher'
}

/**
 * Plan identity for grouping.
 *
 * Keyed by type AND name, never by name alone: the catalogue has a "standard"
 * plan under BOTH institution and teacher (see PLANS in api/subscriptions.py),
 * and they are different products with different seat counts. Grouping on the
 * bare name silently merges a 50-teacher school with a solo teacher.
 */
export function planKey(row) {
  const plan = String(row?.subscription?.plan ?? '').trim() || 'unassigned'
  return `${segmentOf(row)}:${plan}`
}

/** "Institution · standard" — what the plan-mix chart labels a bar. */
export function planLabel(key) {
  const [type, ...rest] = String(key).split(':')
  const plan = rest.join(':') || 'unassigned'
  return `${type === 'institution' ? 'Institution' : 'Solo'} · ${plan}`
}

/**
 * Firestore SERVER_TIMESTAMP reaches us through Flask's JSON encoder, which is
 * not guaranteed to pick one representation -- and a row written moments ago
 * can still carry null while the server resolves the sentinel.
 *
 * So every shape it can arrive as is handled, and anything unrecognised
 * returns null rather than an Invalid Date. `new Date(undefined)` produces a
 * Date whose getTime() is NaN, which survives every downstream comparison and
 * would silently bucket a real subscriber into the wrong month.
 */
export function parseCreatedAt(value) {
  if (value == null) return null

  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value : null

  // Firestore client shapes: { seconds } or { _seconds } plus nanoseconds.
  if (typeof value === 'object') {
    const seconds = value.seconds ?? value._seconds
    if (Number.isFinite(Number(seconds))) return new Date(Number(seconds) * 1000)
    return null
  }

  // Epoch milliseconds, if anything ever sends a number.
  if (typeof value === 'number') {
    return Number.isFinite(value) ? new Date(value) : null
  }

  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed) return null
    // Covers both ISO-8601 and the RFC-1123 form Flask's default JSON provider
    // emits ("Tue, 19 Aug 2026 01:23:45 GMT").
    const parsed = new Date(trimmed)
    return Number.isFinite(parsed.getTime()) ? parsed : null
  }

  return null
}

/** Narrow the rows the whole console is scoped to. */
export function filterRows(rows, { segment = 'all', status = 'all' } = {}) {
  return (rows ?? []).filter((row) => {
    if (segment !== 'all' && segmentOf(row) !== segment) return false
    if (status !== 'all' && (row?.subscription?.status ?? null) !== status) return false
    return true
  })
}

/**
 * Aggregate one seat slot across rows.
 *
 * A subscriber with no cap is unlimited, and unlimited is excluded from BOTH
 * sides rather than counted as zero seats -- the same call componentPercent
 * makes for excused work. Counting it as zero would push utilisation over 100%
 * and make the meter permanently red; counting its usage against nothing would
 * quietly deflate the percentage instead.
 */
function aggregateSeats(rows, slotName) {
  let used = 0
  let seats = 0
  let unlimited = 0
  let uncapped = 0
  for (const row of rows ?? []) {
    const slot = row?.usage?.[slotName]
    const rowUsed = Number(slot?.used)
    const rowSeats = Number(slot?.seats)
    if (slot?.seats == null || !Number.isFinite(rowSeats) || rowSeats <= 0) {
      unlimited += 1
      if (Number.isFinite(rowUsed)) uncapped += rowUsed
      continue
    }
    if (Number.isFinite(rowUsed)) used += rowUsed
    seats += rowSeats
  }
  return {
    used,
    seats,
    unlimited,
    uncapped,
    // Null, not 0, when nothing is capped: "no data" and "0% used" are
    // different states and the meter renders them differently.
    pct: seats > 0 ? Math.round((used / seats) * 100) : null,
  }
}

/** Headline counts for the stat tiles. */
export function summarize(rows) {
  const list = rows ?? []
  const byStatus = Object.fromEntries(STATUSES.map((s) => [s, 0]))
  let institutions = 0
  let teachers = 0
  let overSeats = 0

  for (const row of list) {
    if (segmentOf(row) === 'institution') institutions += 1
    else teachers += 1

    const status = row?.subscription?.status
    if (status in byStatus) byStatus[status] += 1

    if (row?.usage?.teachers?.over || row?.usage?.students?.over) overSeats += 1
  }

  return {
    total: list.length,
    institutions,
    teachers,
    byStatus,
    overSeats,
    students: aggregateSeats(list, 'students'),
    teacherSeats: aggregateSeats(list, 'teachers'),
  }
}

/**
 * Counts per plan, biggest first — the plan-mix chart's data.
 *
 * Ties break alphabetically by label so the bar order is stable between
 * refetches; sorting on count alone lets two equal plans swap places on every
 * poll, which reads as the chart flickering.
 */
export function planMix(rows) {
  const counts = new Map()
  for (const row of rows ?? []) {
    const key = planKey(row)
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  return [...counts.entries()]
    .map(([key, count]) => ({ key, label: planLabel(key), count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
}

const MONTH_LABELS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
]

/**
 * Signups per month over a trailing window, oldest first.
 *
 * Bucketed in local time because the operator reads it against their own
 * calendar, and always returning a full `months`-long window means an empty
 * month renders as a zero column rather than vanishing and compressing the
 * axis. `now` is injected so this is testable without freezing the clock.
 *
 * Rows with an unusable created_at are counted in `undated` instead of being
 * dropped: a chart that silently omits subscribers would understate signups.
 */
export function signupsByMonth(rows, months = 6, now = new Date()) {
  const span = Math.max(1, Math.round(Number(months)) || 1)
  const buckets = []
  const index = new Map()

  for (let i = span - 1; i >= 0; i -= 1) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    const bucket = {
      key,
      label: MONTH_LABELS[d.getMonth()],
      year: d.getFullYear(),
      count: 0,
    }
    buckets.push(bucket)
    index.set(key, bucket)
  }

  let undated = 0
  for (const row of rows ?? []) {
    const created = parseCreatedAt(row?.subscription?.created_at)
    if (!created) {
      undated += 1
      continue
    }
    const key = `${created.getFullYear()}-${String(created.getMonth() + 1).padStart(2, '0')}`
    const bucket = index.get(key)
    if (bucket) bucket.count += 1
  }

  const peak = buckets.reduce((max, b) => Math.max(max, b.count), 0)
  return { buckets, peak, undated }
}

/**
 * Everything the analytics band renders, from one pass over the scoped rows.
 * One entry point keeps the page from recomputing three memos that must agree.
 */
export function analyticsFor(rows, { months = 6, now = new Date() } = {}) {
  return {
    summary: summarize(rows),
    plans: planMix(rows),
    signups: signupsByMonth(rows, months, now),
  }
}
