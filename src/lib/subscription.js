/**
 * Subscription status, usage and plan changes.
 *
 * Owned by the logic lane (see OWNERSHIP.md). These go through Flask rather
 * than Firestore for a specific reason: the plan decides the seat limits, so a
 * client that could write its own subscription document could grant itself an
 * unlimited institution plan. firestore.rules lets an owner read their record
 * but not update it, and the server applies limits from its own plan table.
 */
import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { api } from './api'
import { confirmDialog } from '../components/ui/dialogs'
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

/** Backend-calculated current-price summary; informational, never charge authority. */
export function fetchSubscriptionQuote(ownerId) {
  return api(`/api/subscription/${ownerId}/quote`)
}

/** Active legacy registration policy and its server-owned seat bounds. */
export function fetchRegistrationPolicy() {
  return api('/api/subscription/registration-policy', { requireAuth: false })
}

/** Backend-authoritative registration quote; no local estimate fallback. */
export function fetchRegistrationQuote(input) {
  return api('/api/subscription/registration-quote', {
    method: 'POST',
    requireAuth: false,
    body: input,
  })
}

/** Public package-only quote for the clearly non-payable Option B demo. */
export function fetchOptionBDemoQuote(input) {
  return api('/api/subscription/demo-option-b-quote', {
    method: 'POST',
    requireAuth: false,
    body: input,
  })
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
export function startCheckout(ownerId, { flow, quoteReviewed = false, pricingVersion, quoteTotalPhp, termsVersion, termsAcceptanceId, paymentOption } = {}) {
  const body = {}
  if (flow) body.flow = flow
  if (paymentOption) body.payment_option = paymentOption
  if (quoteReviewed) body.quote_reviewed = true
  if (pricingVersion) body.pricing_version = pricingVersion
  if (quoteTotalPhp !== undefined) body.quote_total_php = quoteTotalPhp
  if (termsVersion) body.terms_version = termsVersion
  if (termsAcceptanceId) body.terms_acceptance_id = termsAcceptanceId
  return api(`/api/subscription/${ownerId}/checkout`, { method: 'POST', body })
}

/**
 * Start the PayMongo test checkout for the remaining 50% balance. The
 * server charges the stored balance; nothing about the amount is sent.
 */
export function startBalanceCheckout(ownerId) {
  return api(`/api/subscription/${ownerId}/balance/checkout`, { method: 'POST', body: {} })
}

/**
 * Record explicit acceptance of an approved subscription Terms version.
 * Hits backend POST /api/subscription/<owner_id>/terms/accept.
 */
export function recordTermsAcceptance(ownerId, { termsVersion, userAgent } = {}) {
  const ua = userAgent || (typeof navigator !== 'undefined' ? navigator.userAgent : 'web-client')
  return api(`/api/subscription/${ownerId}/terms/accept`, {
    method: 'POST',
    body: { accepted: true, terms_version: termsVersion, user_agent: ua },
  })
}

/**
 * Legacy authenticated Option B comparison retained for internal diagnostics.
 * Customer-facing demo screens use fetchOptionBDemoQuote instead.
 */
export function fetchProposedPolicyQuote(ownerId, { subscriptionType, teacherSeats, studentCapacity } = {}) {
  return api(`/api/subscription/${ownerId}/proposed-policy-quote`, {
    method: 'POST',
    body: {
      subscription_type: subscriptionType,
      teacher_seats: teacherSeats,
      student_capacity: studentCapacity,
    },
  })
}

/**
 * Read persisted payment record directly from database without external provider round-trips.
 * Returns { owner_id, payment: { reference, status, kind, amount_php, pricing_version, paid_at, provider_confirmed } }
 */
export function fetchPaymentStatus(ownerId, reference) {
  return api(`/api/subscription/${ownerId}/payments/${reference}`)
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
 * Buy more seats on an already-active subscription (institution admin, both
 * seat types; solo teacher, student seats only -- their one teacher seat is
 * fixed). `teacherSeats` / `studentSeats` are the NEW TOTALS, not deltas; a
 * field left out means "no change to that one". The server recomputes the
 * charge from the delta and never writes `limits` until PayMongo confirms --
 * this only starts the checkout, same shape as `startCheckout`.
 */
export function startSeatIncreaseCheckout(ownerId, { teacherSeats, studentSeats, quoteTotalPhp, pricingVersion } = {}) {
  const body = { quote_reviewed: true }
  if (teacherSeats !== undefined) body.teacher_seats = teacherSeats
  if (studentSeats !== undefined) body.student_seats = studentSeats
  if (quoteTotalPhp !== undefined) body.quote_total_php = quoteTotalPhp
  if (pricingVersion) body.pricing_version = pricingVersion
  return api(`/api/subscription/${ownerId}/seats/checkout`, { method: 'POST', body })
}

/** Server quote for a seat upgrade; never estimate the PayMongo amount locally. */
export function fetchSeatIncreaseQuote(ownerId, { teacherSeats, studentSeats } = {}) {
  const body = {}
  if (teacherSeats !== undefined) body.teacher_seats = teacherSeats
  if (studentSeats !== undefined) body.student_seats = studentSeats
  return api(`/api/subscription/${ownerId}/seats/quote`, { method: 'POST', body })
}

/**
 * Validate a seat-increase input and confirm the charge with the user --
 * the "build the confirm message, compute the prorated amount" half of the
 * flow that `SeatIncreaseCard` (institution admin, both seat types) and
 * `AddStudentSeatsControl` (solo teacher, student seats only) each wrote by
 * hand, down to the same confirm-dialog sentence. Returns the NEW TOTALS to
 * pass to `startSeatIncreaseCheckout` once confirmed, or `null` after
 * calling `onError` (a validation failure) or a cancelled dialog -- the
 * caller's own `useMutation` still tracks `isPending` and starts the
 * checkout, since that state belongs to the component, not this helper.
 *
 * `current` / `next` are `{ teacherSeats, studentSeats }`; a solo caller
 * leaves `teacherSeats` out of both, since that seat is fixed on a solo plan.
 * `ownerPhrase` is the back half of the validation sentence -- "what your
 * school already has" for an institution, "what you already have" (the
 * default) for a solo teacher.
 */
export async function confirmSeatIncrease({
  ownerId, current, next, ownerPhrase = 'what you already have', onError,
}) {
  const curTeacher = current.teacherSeats ?? 0
  const curStudent = current.studentSeats ?? 0
  const nextTeacher = next.teacherSeats ?? curTeacher
  const nextStudent = next.studentSeats ?? curStudent

  if (!Number.isInteger(nextTeacher) || !Number.isInteger(nextStudent)
      || nextTeacher < curTeacher || nextStudent < curStudent) {
    onError(`Enter seat counts at or above ${ownerPhrase}.`)
    return null
  }
  if (nextTeacher === curTeacher && nextStudent === curStudent) {
    onError(`Raise at least one seat count above ${ownerPhrase}.`)
    return null
  }

  let response
  try {
    response = await fetchSeatIncreaseQuote(ownerId, { teacherSeats: nextTeacher, studentSeats: nextStudent })
  } catch (err) {
    onError(err.message || 'The server could not provide a seat-increase quote.')
    return null
  }
  const quote = response?.quote
  if (!quote || quote.requested_limits?.teacher_seats !== nextTeacher || quote.requested_limits?.student_seats !== nextStudent || !Number.isFinite(quote.payment_due_php)) {
    onError('The server returned an incomplete seat-increase quote. Refresh and try again.')
    return null
  }
  const addedTeacher = nextTeacher - curTeacher
  const addedStudent = nextStudent - curStudent
  const amount = quote.payment_due_php
  const money = (value) => `₱${value.toLocaleString('en-PH')}`
  const parts = []
  if (addedTeacher > 0) parts.push(`${addedTeacher} teacher seat${addedTeacher === 1 ? '' : 's'}`)
  if (addedStudent > 0) parts.push(`${addedStudent} student seat${addedStudent === 1 ? '' : 's'}`)
  const ok = await confirmDialog({
    title: `Add ${parts.join(' and ')}?`,
    message:
      `This charges ${money(amount)} now — prorated to the months left until your plan renews — `
      + "and the new seats renew on that same date. Seat reductions go through ActivKlass support, "
      + 'not this screen.',
    confirmLabel: `Pay ${money(amount)}`,
  })
  if (!ok) return null
  return { teacherSeats: nextTeacher, studentSeats: nextStudent, amount, pricingVersion: quote.pricing_version }
}

/**
 * The trip back from PayMongo's hosted page. `checkout_ref` in the URL is
 * this account's OWN reference (T-68), minted before the gateway is called
 * -- not PayMongo's session id, which does not exist yet at that point.
 * Polls a few times because a test payment can take a moment to settle,
 * then stops rather than polling forever.
 *
 * Shared by `teacher/account.jsx` (a solo teacher's own renewal or seat
 * top-up) and `routes/admin/SubscriptionTab.jsx` (an institution's seat
 * top-up) -- both poll the same confirm endpoint and need identical
 * settle/stop behaviour, so this lives beside the checkout wrappers instead
 * of being written twice.
 */
export function useCheckoutReturn(ownerId) {
  const [params, setParams] = useSearchParams()
  const qc = useQueryClient()
  const reference = params.get('checkout_ref')
  const cancelled = params.get('checkout_cancelled')
  const [state, setState] = useState(reference ? 'checking' : cancelled ? 'unverified_return' : null)
  const [receipt, setReceipt] = useState(null)

  useEffect(() => {
    if (!reference || !ownerId) return undefined
    let stopped = false
    let attempt = 0
    const markPaid = (payment) => {
      setState('paid')
      setReceipt({
        receiptSentTo: payment?.receipt_sent_to ?? null,
        receiptFailed: Boolean(payment?.receipt_failed),
        kind: payment?.kind ?? 'subscription',
        newLimits: payment?.new_limits ?? null,
      })
      qc.invalidateQueries({ queryKey: ['subscription'] })
    }
    async function poll() {
      attempt += 1
      try {
        // Redirect query parameters are navigation hints only. Read the
        // owner-scoped backend record before displaying any payment outcome.
        const stored = await fetchPaymentStatus(ownerId, reference)
        const payment = stored?.payment
        if (stopped) return
        if (payment?.status === 'paid' && payment.provider_confirmed === true) {
          markPaid(payment)
          return
        }
        if (payment?.status === 'expired') {
          setState('expired')
          return
        }
        const res = await confirmCheckout(ownerId, reference)
        if (stopped) return
        if (res.status === 'paid') {
          const refreshed = await fetchPaymentStatus(ownerId, reference).catch(() => null)
          markPaid(refreshed?.payment || res)
          return
        }
        if (res.status === 'expired') {
          setState('expired')
          return
        }
        if (res.provider_attempt_status === 'failed') setState('attempt_failed')
      } catch {
        if (stopped) return
      }
      if (attempt < 5) setTimeout(poll, 2000)
      else if (!stopped) setState((current) => current === 'attempt_failed' ? current : 'unconfirmed')
    }
    poll()
    return () => { stopped = true }
    // reference/ownerId only -- qc is stable, and re-running on every
    // render would restart the poll from attempt 1 forever.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reference, ownerId])

  function dismiss() {
    setState(null)
    params.delete('checkout_ref')
    params.delete('checkout_cancelled')
    setParams(params, { replace: true })
  }

  return { state, receipt, reference, dismiss }
}

/**
 * Hook to inspect the persisted payment document directly from Firestore
 * without making external payment provider calls.
 */
export function usePaymentStatus(ownerId, reference) {
  return useQuery({
    queryKey: ['subscription-payment-status', ownerId, reference],
    queryFn: () => fetchPaymentStatus(ownerId, reference),
    enabled: Boolean(ownerId && reference),
    retry: false,
  })
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

/** Format decimal-byte subscription allowances (1 GB = 1,000,000,000 bytes). */
export function formatDecimalBytes(bytes) {
  if (bytes == null) return '—'
  if (bytes === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1000)), units.length - 1)
  const value = bytes / 1000 ** i
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

/** Format a subscription expiry countdown without false minute precision when days remain. */
export function formatExpirationCountdown(expiresAt, now = Date.now()) {
  const expiresMs = toMillis(expiresAt)
  if (expiresMs == null || !Number.isFinite(expiresMs)) return null

  const totalMinutes = Math.ceil((expiresMs - now) / 60_000)
  if (totalMinutes <= 0) return 'Expired'

  const days = Math.floor(totalMinutes / (24 * 60))
  const hours = Math.floor((totalMinutes % (24 * 60)) / 60)
  const minutes = totalMinutes % 60
  if (days >= 1) {
    return `${days} day${days === 1 ? '' : 's'} left`
  }
  if (hours >= 1) {
    return `${hours} hour${hours === 1 ? '' : 's'} left`
  }
  return `${minutes} minute${minutes === 1 ? '' : 's'} left`
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
