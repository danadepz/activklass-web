import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import SubscriptionCostBreakdown from './SubscriptionCostBreakdown'
import PaymentConfirmModal from './PaymentConfirmModal'
import SubscriptionStatusPanel from './SubscriptionStatusPanel'
import { ACK_COSTS, canConfirm, formatCentavos, legacyQuoteToCosting } from '@/lib/subscriptionPayment'

// Shapes as the backend returns them (app/services/installments.py).
const institution = {
  plan: 'institution', teacher_seats: 10, teacher_seat_included: false, teacher_unit_centavos: 150000,
  teacher_subtotal_centavos: 1500000, student_capacity: 400, block_size: 40, student_blocks: 10,
  block_unit_centavos: 120000, student_subtotal_centavos: 1200000, total_centavos: 2700000, term_days: 300,
  allowances: { ai_credits: 1000000, teacher_generations_per_seat_per_day: 15, student_explanations_per_student_per_day: 10, storage_gb: 50 },
}
const individual = {
  plan: 'individual', teacher_seats: 1, teacher_seat_included: true, teacher_unit_centavos: 0,
  teacher_subtotal_centavos: 0, student_capacity: 80, block_size: 40, student_blocks: 2,
  block_unit_centavos: 120000, student_subtotal_centavos: 240000, total_centavos: 240000, term_days: 300,
}
const half = { option: 'half', due_now_centavos: 1350000, remaining_centavos: 1350000 }
const text = (html) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')

describe('formatCentavos', () => {
  it('formats whole pesos and keeps real centavos', () => {
    expect(formatCentavos(2700000)).toBe('₱27,000')
    expect(formatCentavos(1350050)).toBe('₱13,500.50')
    expect(formatCentavos(undefined)).toBe('—')
  })
})

describe('SubscriptionCostBreakdown', () => {
  it('itemises the institution reference example', () => {
    const t = text(renderToStaticMarkup(<SubscriptionCostBreakdown costing={institution} />))
    expect(t).toContain('Plan Institution')
    expect(t).toContain('Teacher seats 10 × ₱1,500 ₱15,000')
    expect(t).toContain('Unique student capacity 400 students · 10 blocks of 40 × ₱1,200 ₱12,000')
    expect(t).toContain('AI credits 1,000,000')
    expect(t).toContain('Teacher AI generations 15 per teacher / day')
    expect(t).toContain('Student AI explanations 10 per student / day')
    expect(t).toContain('Storage 50 GB')
    expect(t).toContain('Total subscription cost ₱27,000')
    expect(t).toContain('Validity 300 days')
  })

  it('shows the included teacher and the 50% schedule with an estimated due date', () => {
    const t = text(renderToStaticMarkup(
      <SubscriptionCostBreakdown
        costing={individual}
        schedule={{ option: 'half', due_now_centavos: 120000, remaining_centavos: 120000 }}
        dueDate={{ seconds: 1800000000, estimate: true }}
      />,
    ))
    expect(t).toContain('Teacher seats 1 teacher Included')
    expect(t).toContain('Total subscription cost ₱2,400')
    expect(t).toContain('Payment option 50% down payment')
    expect(t).toContain('Amount due now ₱1,200')
    expect(t).toContain('Remaining balance')
    expect(t).toContain('(estimated')
  })

  it('omits the balance row for full payment', () => {
    const t = text(renderToStaticMarkup(
      <SubscriptionCostBreakdown costing={institution} schedule={{ option: 'full', due_now_centavos: 2700000, remaining_centavos: 0 }} />,
    ))
    expect(t).toContain('Amount due now ₱27,000')
    expect(t).not.toContain('Remaining balance')
  })

  it('renders the live per-seat quote without inventing blocks', () => {
    const costing = legacyQuoteToCosting({
      subscription_type: 'teacher', teacher_seats: 1, student_capacity: 40, term_days: 300,
      total_contract_php: 3600, payment_due_php: 3600,
      line_items: [
        { key: 'teacher_seats', quantity: 1, unit_price_php: 1200, subtotal_php: 1200 },
        { key: 'student_capacity', quantity: 40, unit_price_php: 60, subtotal_php: 2400 },
      ],
    })
    const t = text(renderToStaticMarkup(<SubscriptionCostBreakdown costing={costing} />))
    expect(t).toContain('Unique student capacity 40 students × ₱60 ₱2,400')
    expect(t).not.toContain('AI credits')
    expect(t).toContain('Total subscription cost ₱3,600')
    expect(t).not.toContain('student blocks')
  })
})

describe('PaymentConfirmModal', () => {
  it('shows the plan, costs, both acknowledgments, and starts with Confirm disabled', () => {
    const html = renderToStaticMarkup(
      <PaymentConfirmModal open costing={institution} schedule={half} terms={{ version: 'subscription-terms-1.0-proposed', version_label: 'Version 1.0 — Proposed for Review', sections: [{ heading: 'Subscription Agreement', blocks: [['p', 'x']] }] }} onBack={() => {}} onConfirm={() => {}} />,
    )
    const t = text(html)
    expect(t).toContain(ACK_COSTS)
    expect(t).toContain('I have read and agree to the Terms and Conditions')
    expect(t).not.toContain('Demonstration Terms')
    expect(html).toMatch(/<button type="button"[^>]*>Terms and Conditions<\/button>/)
    expect(t).toContain('Go Back')
    expect(t).toContain('Total subscription cost ₱27,000')
    expect(t).toContain('Amount due now ₱13,500')
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Pay Now/)
  })

  it('requires both boxes', () => {
    expect(canConfirm(false, false, false)).toBe(false)
    expect(canConfirm(true, false, false)).toBe(false)
    expect(canConfirm(false, true, false)).toBe(false)
    expect(canConfirm(true, true, true)).toBe(false)
    expect(canConfirm(true, true, false)).toBe(true)
  })

  it('renders nothing when closed', () => {
    expect(renderToStaticMarkup(<PaymentConfirmModal open={false} costing={institution} onBack={() => {}} onConfirm={() => {}} />)).toBe('')
  })
})

describe('SubscriptionStatusPanel', () => {
  const view = (payment, subscription = { status: 'active', paid_through: 1825920000 }) => ({
    costing: institution, schedule: half, subscription,
    payment: { amount_paid_centavos: 1350000, remaining_centavos: 1350000, balance_due_at: 1802592000, overdue_warning: null, balance_checkout_available: true, ...payment },
  })

  it('shows the overdue warning, amount and due date while access stays active', () => {
    const warning = 'Your remaining subscription balance is overdue. Please settle your payment to avoid possible limitations to your access.'
    const t = text(renderToStaticMarkup(
      <SubscriptionStatusPanel view={view({ status: 'overdue', overdue_warning: warning })} onPayBalance={() => {}} />,
    ))
    expect(t).toContain('Overdue Balance')
    expect(t).toContain(warning)
    expect(t).toContain('Remaining: ₱13,500')
    expect(t).toContain('Status Active')
    expect(t).toContain('Pay remaining ₱13,500')
  })

  it('shows partial payment details and no warning before the deadline', () => {
    const t = text(renderToStaticMarkup(<SubscriptionStatusPanel view={view({ status: 'partially_paid' })} onPayBalance={() => {}} />))
    expect(t).toContain('Partially paid')
    expect(t).toContain('Subscription total ₱27,000')
    expect(t).toContain('Amount paid ₱13,500')
    expect(t).not.toContain('Overdue Balance')
  })

  it('clears the warning and the balance action once fully paid', () => {
    const t = text(renderToStaticMarkup(<SubscriptionStatusPanel view={view({
      status: 'fully_paid', amount_paid_centavos: 2700000, remaining_centavos: 0, balance_checkout_available: false,
    })} onPayBalance={() => {}} />))
    expect(t).toContain('Fully paid')
    expect(t).not.toContain('Overdue Balance')
    expect(t).not.toContain('Pay remaining')
  })
})
