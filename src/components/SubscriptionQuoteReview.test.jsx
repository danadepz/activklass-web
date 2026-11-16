import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import SubscriptionQuoteReview from './SubscriptionQuoteReview'

const queryMock = vi.hoisted(() => ({
  data: {
    quote: {
      pricing_version: 'legacy-seat-rates-300d-v1',
      subscription_type: 'teacher',
      teacher_seats: 1,
      student_capacity: 40,
      student_blocks: null,
      term_days: 300,
      line_items: [
        { key: 'teacher_seats', quantity: 1, unit_price_php: 1200, subtotal_php: 1200 },
        { key: 'student_capacity', quantity: 40, unit_price_php: 60, subtotal_php: 2400 },
      ],
      total_contract_php: 3600,
      payment_due_php: 3600,
      terms: { required: false, available: false, version: null, url: null, status: 'not_required' },
    },
  },
  isLoading: false,
  isError: false,
  error: null,
  refetch: vi.fn(),
  isFetching: false,
}))

vi.mock('@tanstack/react-query', () => ({ useQuery: () => queryMock }))
vi.mock('@/lib/subscription', () => ({ fetchSubscriptionQuote: vi.fn() }))

const render = () => renderToStaticMarkup(<SubscriptionQuoteReview ownerId="teacher-1" onContinue={() => {}} />)
const text = (html) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')

describe('SubscriptionQuoteReview', () => {
  it('shows the server quote as one breakdown with a Proceed to Payment action', () => {
    const t = text(render())
    expect(t).toContain('Total subscription cost ₱3,600')
    expect(t).toContain('Validity 300 days')
    expect(t).toContain('Amount due now ₱3,600')
    expect(t).toContain('Proceed to Payment')
  })

  it('shows no competing demo price, internal policy id, or raw error code', () => {
    const html = render()
    expect(html).not.toContain('legacy-seat-rates-300d-v1')
    expect(html).not.toContain('Option B')
    expect(html).not.toContain('DEMO ONLY')
  })

  it('keeps payment closed in plain words when approved Terms are required but missing', () => {
    const orig = queryMock.data.quote.terms
    queryMock.data.quote.terms = { required: true, available: false, version: null, url: null, status: 'unavailable' }
    const html = render()
    expect(html).toContain('Online payment is not available for this account yet')
    expect(html).not.toContain('Commercial Checkout Blocked')
    expect(html).not.toContain('terms_unavailable')
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Proceed to Payment/)
    queryMock.data.quote.terms = orig
  })

  it('enables Proceed to Payment when checkout is open', () => {
    expect(render()).not.toMatch(/<button[^>]*disabled=""[^>]*>Proceed to Payment/)
  })

  it('renders institution seats from the quote', () => {
    const orig = queryMock.data.quote
    queryMock.data = { quote: {
      ...orig, subscription_type: 'institution', teacher_seats: 10, student_capacity: 400,
      total_contract_php: 36000, payment_due_php: 36000,
      line_items: [
        { key: 'teacher_seats', quantity: 10, unit_price_php: 1200, subtotal_php: 12000 },
        { key: 'student_capacity', quantity: 400, unit_price_php: 60, subtotal_php: 24000 },
      ],
    } }
    const t = text(render())
    expect(t).toContain('Plan Institution')
    expect(t).toContain('Teacher seats 10 × ₱1,200 ₱12,000')
    expect(t).toContain('Total subscription cost ₱36,000')
    queryMock.data = { quote: orig }
  })
})
