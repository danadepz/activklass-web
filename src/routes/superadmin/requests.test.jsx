/**
 * T-82 (Option B, 2026-09-26): a school request may already point at a
 * pending school that paid for its year at sign-up. Two things must not
 * happen to one of those: declining it as a bare client-side Firestore
 * write (nothing can refund through PayMongo from the browser), and
 * approving it with the seats silently edited to something the payment does
 * not match.
 *
 * This page has no test file before this one, and this repo has no DOM
 * library to drive a real click-and-render pass with (register.test.jsx's
 * own comment explains why) — so the two properties that actually matter
 * are read off the source, the same house pattern register.test.jsx uses
 * for its own async, un-drivable handlers.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const requestsSource = readFileSync(fileURLToPath(new URL('./requests.jsx', import.meta.url)), 'utf8')
const queuesSource = readFileSync(fileURLToPath(new URL('./queues.js', import.meta.url)), 'utf8')

describe('T-82 — declining a paid request refunds through Flask, not a bare Firestore write', () => {
  it('branches on paid before deciding how to decline', () => {
    expect(requestsSource).toMatch(/if \(paid\) \{\s*return declineRequest\(id, note\.trim\(\)\)/)
  })

  it('the unpaid path is untouched — still the same client-side Firestore update', () => {
    expect(requestsSource).toMatch(/await updateDoc\(doc\(db, 'subscription_requests', id\), \{\s*status: 'declined'/)
  })

  it('the click site passes paid through, computed from the row PayMongo actually flipped', () => {
    expect(requestsSource).toMatch(/const paid = r\.school_payment_status === 'paid'/)
    expect(requestsSource).toMatch(/decline\.mutate\(\{ id: r\.id, note, school, paid \}\)/)
  })
})

describe('T-82 — approving a paid request cannot silently change what was charged for', () => {
  it('the seat inputs lock when the school already paid', () => {
    expect(requestsSource).toMatch(/disabled=\{paid\} value=\{form\.teacher_seats\}/)
    expect(requestsSource).toMatch(/disabled=\{paid\} value=\{form\.student_seats\}/)
  })

  it('paid is read from the request the dialog was opened on, not re-derived', () => {
    expect(requestsSource).toMatch(/const paid = request\.school_payment_status === 'paid'/)
  })
})

describe('T-82 — the console can tell a paid request from an estimate-only one', () => {
  it('fetchPendingRequests attaches each row’s school_payment_status', () => {
    expect(queuesSource).toMatch(/school_payment_status: schoolSnap\.exists\(\) \? \(schoolSnap\.data\(\)\.payment_status \?\? null\) : null/)
  })
})
