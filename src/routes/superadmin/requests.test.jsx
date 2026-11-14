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

describe('T-256 — every decline goes through Flask, which closes the requester login', () => {
  it('declining always calls the server, paid or not', () => {
    expect(requestsSource).toMatch(/mutationFn: \(\{ id, note \}\) => declineRequest\(id, note\.trim\(\)\)/)
  })

  it('no bare Firestore decline is left -- it would leave a working login behind', () => {
    expect(requestsSource).not.toMatch(/status: 'declined'/)
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

/* T-255 (maykel_64440-339): approval now refuses a login prefix another school
   holds; the Approve dialog is where the superadmin sees the registered one and
   picks a free one, so the new admin never finds the box empty. */
describe('T-255 — Approve dialog carries the login prefix', () => {
  it('prefills the prefix from the registered abbreviation', () => {
    expect(requestsSource).toContain("login_prefix: String(request.school_abbr ?? '').toLowerCase()")
    expect(requestsSource).toContain('<Field label="Login prefix"')
  })
  it('sends it with the approval', () => {
    expect(requestsSource).toMatch(/login_prefix: form\.login_prefix\.trim\(\)\.toLowerCase\(\)/)
  })
})
