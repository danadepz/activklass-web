/**
 * Subscription status, usage and plan changes.
 *
 * Owned by the logic lane (see OWNERSHIP.md). These go through Flask rather
 * than Firestore for a specific reason: the plan decides the seat limits, so a
 * client that could write its own subscription document could grant itself an
 * unlimited institution plan. firestore.rules lets an owner read their record
 * but not update it, and the server applies limits from its own plan table.
 */
import { api } from './api'
import { blue, gold, green, red } from '../theme'

/**
 * Who a teacher belongs to -- 'school' | 'solo' | 'none'.
 *
 * The one stored fact behind this is users/{uid}.school_id: a teacher whose
 * profile carries it is issued by a school and that school pays for them; a
 * teacher without it is on their own. Everything else about the account is a
 * consequence of that, so nothing is stored twice and nothing can drift.
 *
 * This answers "who does this teacher belong to", NOT "what plan are they
 * on". The plan question is describeSubscription() below, which resolves
 * through Flask; this reads the profile alone and cannot fail. That matters
 * for the screens that shape themselves around it -- a stopped Flask must
 * never take a capability away from the teacher who is entitled to it.
 *
 * Three states, not two, and 'solo' is not simply the absence of 'school':
 * a self-registered teacher who was approved but never subscribed is 'none'.
 * Anything that means "belongs to a school" must ask for 'school' by name
 * rather than test for not-solo, or it sweeps that teacher in with the
 * institutional ones.
 */
export function accountKind(profile) {
  if (profile?.school_id) return 'school'
  // The markers a self-subscribed account carries from registration; a
  // resolved subscription is not needed and not consulted.
  if (profile?.subscription_status || profile?.trial_ends_at) return 'solo'
  return 'none'
}

/**
 * Which subscription applies to the signed-in user, resolved server-side.
 *
 * An admin's is their school's, found through users/{uid}.school_id; a solo
 * teacher's is keyed by their own uid. Asking the server means the client never
 * hardcodes a school id -- it used to, which worked only while a single school
 * existed.
 */
export function fetchMyOwnerId() {
  return api('/api/subscription/mine')
}

/** The plan catalogue, so the UI never invents a plan name or seat count. */
export function fetchPlans() {
  return api('/api/subscription/plans')
}

/** Status plus live seat usage, counted from the users collection. */
export function fetchSubscription(ownerId) {
  return api(`/api/subscription/${ownerId}`)
}

/** Limits are applied server-side from the catalogue, not sent from here. */
export function changePlan(ownerId, plan) {
  return api(`/api/subscription/${ownerId}/plan`, { method: 'POST', body: { plan } })
}

/**
 * Start a PayMongo test-mode checkout for one school year (T-68). The amount
 * is recomputed server-side from the stored seats; nothing is sent from
 * here. Returns `{ checkout_url, reference }` -- the caller sends the
 * browser to `checkout_url` and keeps `reference` to poll with below.
 *
 * `flow: 'institution_signup'` (T-82) sends the return trip to /register
 * instead of /teacher/account -- an Institution sign-up pays before it has
 * an Account page to return to. Only takes effect server-side when
 * `ownerId` is actually a pending school; harmless to pass otherwise.
 */
export function startCheckout(ownerId, { flow } = {}) {
  return api(`/api/subscription/${ownerId}/checkout`, { method: 'POST', body: flow ? { flow } : undefined })
}

/**
 * T-82: the one write that turns a fresh Institution sign-up's own
 * `subscription_requests` document into something checkout can charge --
 * `schools` stays superadmin-only to write directly, so this is the
 * Admin-SDK doorway. Idempotent: calling it twice for the same request
 * returns the same school_id.
 */
export function createPendingSchool(requestId) {
  return api('/api/subscription/institution/pending-school', { method: 'POST', body: { request_id: requestId } })
}

/**
 * The return-page poll: ask whether PayMongo has actually confirmed the
 * payment yet. `{ status: 'paid' | 'pending' }` -- a fresh return from the
 * hosted page may still read 'pending' for a moment, so callers should try
 * again rather than treat one 'pending' as final. Once paid, also carries
 * `receipt_sent_to` (the address, T-69) or `receipt_failed: true` -- the
 * mail outage that caused a failure never blocks the payment itself, so
 * this is reported, not retried here.
 */
export function confirmCheckout(ownerId, reference) {
  return api(`/api/subscription/${ownerId}/checkout/${reference}/confirm`, { method: 'POST' })
}

/**
 * Bytes actually stored, grouped by folder.
 *
 * Returns `{ available: false, reason }` when Firebase Storage was never
 * provisioned for the project, which is a state worth showing rather than an
 * error -- and better than rendering 0 B as though it had been measured.
 */
export function fetchStorageUsage() {
  return api('/api/admin/storage')
}

export function formatBytes(bytes) {
  if (bytes == null) return '—'
  if (bytes === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  const value = bytes / 1024 ** i
  return `${value >= 10 || i === 0 ? Math.round(value) : value.toFixed(1)} ${units[i]}`
}

/* ── What a teacher's own screens say about their plan ──────────────────── */

const DAY_MS = 24 * 60 * 60 * 1000

/** A Firestore Timestamp, a Date, an ISO string or epoch seconds -> ms, or null. */
export function toMillis(value) {
  if (value == null) return null
  if (typeof value.toMillis === 'function') return value.toMillis()
  if (value instanceof Date) return value.getTime()
  if (typeof value === 'object' && typeof value.seconds === 'number') return value.seconds * 1000
  if (typeof value === 'number') return value < 1e12 ? value * 1000 : value
  const parsed = Date.parse(value)
  return Number.isNaN(parsed) ? null : parsed
}

/**
 * The one-line status a teacher sees on their dashboard and beside their name.
 *
 * Pure so it can be tested against every account shape the app now produces:
 * a school-issued or absorbed teacher (school_id set, or the resolved
 * subscription is the institution's), a solo teacher on a paid plan, a
 * self-registered teacher still on the 30-day trial (subscription_status /
 * trial_ends_at on the profile, stamped by /register), and a subscription the
 * backend or superadmin console suspended or cancelled.
 *
 *   kind:  'school' | 'active' | 'trial' | 'expired'
 *   locks: what a trial may not use.
 *
 * T-124 (owner decision 2026-10-02, Option B): this used to return six kinds,
 * two of which were not peers of the rest. `lapsed` (suspended/cancelled) now
 * folds into `expired` -- both mean "you had access and it stopped", one
 * label covers them, and the lock an ended trial already carried now applies
 * here too: a suspended or cancelled subscriber loses the quiz bank and
 * teacher groups the moment this ships. `none` was the function's fallback
 * for "the legacy seeded teacher with no subscription record at all", and a
 * fallback can only be deleted once nothing can still reach it -- so
 * `scripts/backfill_subscription_none.py` (activklass-backend) first stamped
 * `subscription_status: 'active'` onto every teacher who had no subscription
 * record at all (13 accounts on the live project, 2026-10-02, reversible via
 * the script's `--revert`). They now resolve through the `active` branch
 * below with the same unlocked behaviour `none` always gave them -- and,
 * because `active` is one of the kinds `useMySubscription` already counted as
 * solo, those 13 accounts go from "neither school nor solo" to solo teachers
 * who manage their own students, which they could not do before. The
 * function's final `return` is defensive only: real data can no longer reach
 * it after the backfill, and it deliberately does not default to `expired` --
 * that would silently lock an account the backfill exists to keep unlocked.
 */
export function describeSubscription({ profile, subscription, now = Date.now() }) {
  const sub = subscription ?? null
  const schoolName = sub?.type === 'institution'
    ? (sub.name || sub.school_name || profile?.teaching_school_name || '')
    : (profile?.teaching_school_name || '')

  if (profile?.school_id || sub?.type === 'institution') {
    return {
      kind: 'school',
      label: 'Institution subscription',
      detail: schoolName || 'Covered by your school',
      plan: sub?.plan ?? null,
      daysLeft: null,
      locks: { quizBank: false, teacherGroups: false },
    }
  }

  const status = sub?.status ?? profile?.subscription_status ?? null
  const trialEndsAt = toMillis(sub?.trial_ends_at ?? profile?.trial_ends_at)

  if (status === 'trial' || (!sub && trialEndsAt != null)) {
    const daysLeft = trialEndsAt == null ? null : Math.ceil((trialEndsAt - now) / DAY_MS)
    if (daysLeft != null && daysLeft <= 0) {
      return {
        kind: 'expired',
        label: 'Trial ended',
        detail: 'Subscribe to keep the full features',
        plan: sub?.plan ?? null,
        daysLeft: 0,
        locks: { quizBank: true, teacherGroups: true },
      }
    }
    return {
      kind: 'trial',
      label: 'Free trial',
      detail: daysLeft == null ? 'Trial' : `${daysLeft} day${daysLeft === 1 ? '' : 's'} left`,
      plan: sub?.plan ?? null,
      daysLeft,
      locks: { quizBank: true, teacherGroups: true },
    }
  }

  if (status === 'active') {
    const plan = sub?.plan ?? null
    return {
      kind: 'active',
      label: 'Subscribed',
      detail: plan ? `${plan.charAt(0).toUpperCase()}${plan.slice(1)} plan` : 'Individual plan',
      plan,
      daysLeft: null,
      locks: { quizBank: false, teacherGroups: false },
    }
  }

  if (status === 'suspended' || status === 'cancelled') {
    return {
      kind: 'expired',
      label: status === 'suspended' ? 'Subscription paused' : 'Subscription ended',
      detail: 'Contact ActivKlass to reactivate',
      plan: sub?.plan ?? null,
      daysLeft: null,
      locks: { quizBank: true, teacherGroups: true },
    }
  }

  // Unreachable on real data since the 2026-10-02 backfill (see the doc
  // comment above) -- every teacher now has a subscription_status. Mirrors
  // `active`'s unlocked shape rather than defaulting to `expired`, which
  // would lock an account purely because of a data gap.
  return {
    kind: 'active',
    label: 'Subscribed',
    detail: 'Individual plan',
    plan: null,
    daysLeft: null,
    locks: { quizBank: false, teacherGroups: false },
  }
}

/**
 * Avatar-ring colour per kind (T-110, owner answer 2026-10-02: institution
 * Blue, solo Green, trial Yellow, expired Red). Kept beside the kinds
 * describeSubscription returns, not in the layout that draws the ring, so
 * the ring and the label can never name two different plans for the same
 * account. Four colours for the four kinds post-T-124 -- nothing to add.
 */
export const SUBSCRIPTION_RING_COLOR = {
  school: blue,
  active: green,
  trial: gold,
  expired: red,
}
