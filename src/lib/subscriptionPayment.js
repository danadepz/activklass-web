import { api } from '@/lib/api'

/**
 * Display helpers and the local demo-checkout client for the subscription
 * payment UI. No price is calculated here: every amount arrives from the
 * backend in integer centavos and is only formatted.
 */

/** ₱27,000 — or ₱13,500.50 when there are centavos to show. */
export function formatCentavos(centavos) {
  if (!Number.isInteger(centavos)) return '—'
  const hasCents = centavos % 100 !== 0
  return `₱${(centavos / 100).toLocaleString('en-PH', {
    minimumFractionDigits: hasCents ? 2 : 0,
    maximumFractionDigits: 2,
  })}`
}

/** A unix-seconds timestamp as a Philippine calendar date. */
export function formatDate(seconds) {
  if (!Number.isFinite(seconds)) return '—'
  return new Date(seconds * 1000).toLocaleDateString('en-PH', {
    year: 'numeric', month: 'long', day: 'numeric', timeZone: 'Asia/Manila',
  })
}

export const ACK_COSTS = 'I have reviewed and understood the subscription costs and payment schedule.'

/** Both confirmation boxes ticked, and not already submitting. */
export const canConfirm = (costsReviewed, termsAccepted, busy) => costsReviewed === true && termsAccepted === true && !busy

export const PLAN_LABEL = { individual: 'Individual Teacher', institution: 'Institution' }
export const OPTION_LABEL = { full: 'Full payment (100%)', half: '50% down payment' }

/**
 * The live (legacy, per-seat) checkout quote in the shape the shared
 * breakdown renders. Peso → centavo is a unit change, not a price calculation.
 */
export function legacyQuoteToCosting(quote) {
  const items = Object.fromEntries((quote?.line_items || []).map((item) => [item.key, item]))
  const teacher = items.teacher_seats
  const students = items.student_capacity
  return {
    plan: quote.subscription_type === 'institution' ? 'institution' : 'individual',
    teacher_seats: quote.teacher_seats,
    teacher_seat_included: false,
    teacher_unit_centavos: (teacher?.unit_price_php ?? 0) * 100,
    teacher_subtotal_centavos: (teacher?.subtotal_php ?? 0) * 100,
    student_capacity: quote.student_capacity,
    student_blocks: null,
    block_unit_centavos: (students?.unit_price_php ?? 0) * 100,
    student_subtotal_centavos: (students?.subtotal_php ?? 0) * 100,
    total_centavos: (quote.total_contract_php ?? quote.payment_due_php) * 100,
    term_days: quote.term_days,
  }
}

// ── Local demo checkout (/api/demo-checkout, PayMongo TEST, dev only) ────────

const demo = (path, options) => api(`/api/demo-checkout${path}`, { requireAuth: false, ...options })

export function fetchDemoQuote({ plan, teacherSeats, studentCapacity, paymentOption }) {
  return demo('/quote', {
    method: 'POST',
    body: { plan, teacher_seats: teacherSeats, student_capacity: studentCapacity, payment_option: paymentOption },
  })
}

export function startDemoCheckout({ plan, teacherSeats, studentCapacity, paymentOption, termsVersion, idempotencyKey }) {
  return demo('/sessions', {
    method: 'POST',
    body: {
      plan,
      teacher_seats: teacherSeats,
      student_capacity: studentCapacity,
      payment_option: paymentOption,
      acknowledgments: { costs_reviewed: true, terms_accepted: true, terms_version: termsVersion },
      idempotency_key: idempotencyKey,
    },
  })
}

export function fetchDemoStatus(demoId, simulateDays = 0) {
  return demo(`/${encodeURIComponent(demoId)}?simulate_days=${simulateDays}`)
}

export function markDemoCancelled(demoId) {
  return demo(`/${encodeURIComponent(demoId)}/cancelled`, { method: 'POST' })
}

export function startDemoBalanceCheckout(demoId) {
  return demo(`/${encodeURIComponent(demoId)}/balance`, { method: 'POST' })
}
