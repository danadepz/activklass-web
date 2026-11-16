import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const src = (p) => readFileSync(fileURLToPath(new URL(p, import.meta.url)), 'utf8')

// The seat-increase controls must give way to the note when the server says the
// account cannot pay, instead of offering a checkout the server will refuse.
describe('payment-unavailable note replaces seat-increase checkout', () => {
  it('teacher account page gates AddStudentSeatsControl on payments_enabled', () => {
    const s = src('../../routes/teacher/account.jsx')
    expect(s).toMatch(/payments_enabled === false && \(\s*<PaymentUnavailableNote/)
    expect(s).toMatch(/payments_enabled !== false && \(\s*<AddStudentSeatsControl/)
  })
  it('admin subscription tab gates SeatIncreaseCard on payments_enabled', () => {
    expect(src('../../routes/admin/SubscriptionTab.jsx')).toMatch(/payments_enabled === false\s*\?\s*<section[^]*?<PaymentUnavailableNote[^]*?:\s*<SeatIncreaseCard/)
  })
})
