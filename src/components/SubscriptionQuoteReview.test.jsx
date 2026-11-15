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
      activation: 'after_verified_payment',
      line_items: [
        { key: 'teacher_seats', quantity: 1, unit_price_php: 1200, subtotal_php: 1200 },
        { key: 'student_capacity', quantity: 40, unit_price_php: 60, subtotal_php: 2400 },
      ],
      subtotal_php: 3600,
      tax_php: null,
      total_contract_php: 3600,
      payment_due_php: 3600,
      payment_terms: 'Full payment; subscription activation follows verified payment.',
      entitlements: {
        ai_credits: { status: 'not_configured', granted: null },
        teacher_daily_generations: { status: 'not_configured', limit: null },
        student_daily_explanations: { status: 'not_configured', limit: null },
        storage: { status: 'configured_plan_limit', gb: 1 },
      },
      terms: { required: false, available: false, version: null, url: null, status: 'not_required' },
    },
  },
  isLoading: false,
  isError: false,
  error: null,
  refetch: vi.fn(),
  isFetching: false,
  proposed: {
    data: {
      proposal: {
        checkout_eligible: false,
        total_contract_php: 1200,
        line_items: [{ key: 'student_capacity_blocks', quantity: 1, unit_price_php: 1200 }],
        ai_credits: { granted: 30000, teacher_reserved: 30000, student_reserved: 0 },
        daily_limits: { teacher_generations_per_seat: 15, student_explanations_per_student: 10, timezone: 'Asia/Manila' },
        storage: { gb: 5 }, student_blocks: 1,
      },
    },
    isLoading: false, isError: false,
  },
  demo: {
    data: {
      demo_only: true, checkout_eligible: false, policy_version: 'subscription-option-b-v1',
      quote: {
        policy_version: 'subscription-option-b-v1', subscription_type: 'teacher',
        teacher_seats: 1, student_capacity: 40, student_blocks: 1, term_days: 300,
        total_contract_php: 1200,
        ai_credits: { granted: 30000, teacher_reserved: 30000, student_reserved: 0 },
        daily_limits: { teacher_generations_per_seat: 15, student_explanations_per_student: 10 },
        storage: { gb: 5 },
      },
    },
    isLoading: false, isFetching: false, isError: false, refetch: vi.fn(),
  },
}))

vi.mock('@tanstack/react-query', () => ({
  useQuery: (options) => String(options.queryKey?.[0]).startsWith('option-b-demo') ? queryMock.demo : queryMock,
}))

vi.mock('@/lib/subscription', () => ({
  fetchProposedPolicyQuote: vi.fn(),
  fetchOptionBDemoQuote: vi.fn(),
  fetchSubscriptionQuote: vi.fn(),
}))

describe('SubscriptionQuoteReview', () => {
  it('shows server quote, unavailable entitlements, and distinguishes unverified taxes from ₱0', () => {
    const html = renderToStaticMarkup(<SubscriptionQuoteReview ownerId="teacher-1" onContinue={() => {}} />)
    expect(html).toContain('₱3,600')
    expect(html).toContain('300 days')
    expect(html).toContain('AI credits: unavailable / not configured')
    expect(html).toContain('Teacher and student daily AI limits: unavailable / not configured')
    expect(html).toContain('Taxes / fees')
    expect(html).toContain('Unverified / not assessed in quote')
    expect(html).not.toContain('₱0 (Not assessed in this quote)')
    expect(html).toContain('This purchase summary is not Terms and Conditions')
    expect(html).toContain('type="checkbox"')
    expect(html).not.toContain('Staging Preview: Proposed Option B Package')
  })

  it('renders complete buyer-facing subscription details, renewal stacking semantics, and student block status', () => {
    const html = renderToStaticMarkup(<SubscriptionQuoteReview ownerId="teacher-1" onContinue={() => {}} />)
    expect(html).toContain('Solo teacher subscription')
    expect(html).toContain('1 teacher seat')
    expect(html).toContain('40 unique student seats')
    expect(html).toContain('Standard seat schedule (40-student block packages unconfigured in live quotes)')
    expect(html).toContain('Activation follows verified PayMongo payment')
    expect(html).toContain('Early renewal preserves remaining term days')
  })

  it('shows the backend Option B quote to a regular subscription owner, separate from active checkout', () => {
    const html = renderToStaticMarkup(<SubscriptionQuoteReview ownerId="teacher-1" onContinue={() => {}} />)
    expect(html).toContain('Capstone demo pricing · Option B')
    expect(html).toContain('DEMO ONLY · NOT PAYABLE')
    expect(html).toContain('₱1,200')
    expect(html).toContain('<strong>AI credits proposed:</strong> 30,000')
    expect(html).toContain('5 GB proposed')
    expect(html).toContain('The demo package above is read-only')
    expect(html).toContain('Pay for this school year')
    expect(html.indexOf('Capstone demo pricing')).toBeLessThan(html.indexOf('Active checkout · current legacy policy'))
  })

  it('does not require a Super Administrator flag to show the demo package', () => {
    const html = renderToStaticMarkup(<SubscriptionQuoteReview ownerId="teacher-1" onContinue={() => {}} showOptionBComparison={true} />)
    expect(html).toContain('Capstone demo pricing · Option B')
  })

  it('does not locally derive Option B when the public backend quote is unavailable', () => {
    const old = queryMock.demo
    queryMock.demo = { data: undefined, isLoading: false, isError: true, isFetching: false, refetch: vi.fn() }
    const html = renderToStaticMarkup(<SubscriptionQuoteReview ownerId="teacher-1" onContinue={() => {}} />)
    expect(html).toContain('Demo package quote unavailable')
    expect(html).not.toContain('<strong>AI credits proposed:</strong> 30,000')
    expect(html).not.toContain('₱1,200 (student_capacity_blocks)')
    expect(html).toContain('Pay for this school year')
    queryMock.demo = old
  })

  it('renders credit consumption explanation and non-AI feature protection notice', () => {
    const html = renderToStaticMarkup(<SubscriptionQuoteReview ownerId="teacher-1" onContinue={() => {}} />)
    expect(html).toContain('Explanation of credit consumption')
    expect(html).toContain('Non-AI features (gradebooks, rosters, attendance, syllabus) consume zero credits and remain accessible')
    expect(html).toContain('1 GB')
  })

  it('renders itemized financial breakdown, payment terms, and contract total', () => {
    const html = renderToStaticMarkup(<SubscriptionQuoteReview ownerId="teacher-1" onContinue={() => {}} />)
    expect(html).toContain('1 × ₱1,200 per teacher seat')
    expect(html).toContain('40 × ₱60 per student seat')
    expect(html).toContain('Contract total (300 days)')
    expect(html).toContain('Active checkout · current legacy policy')
    expect(html).toContain('Total due today')
    expect(html).toContain('Full payment; subscription activation follows verified payment')
  })

  it('provides distinct checkboxes for quote review and test-mode acknowledgment when Terms are not required', () => {
    const html = renderToStaticMarkup(<SubscriptionQuoteReview ownerId="teacher-1" onContinue={() => {}} />)
    expect(html).toContain('I reviewed the seats, 300-day term, activation condition, and total shown above.')
    expect(html).toContain('I acknowledge that official commercial Terms are pending and agree to proceed under test-mode policies.')
    expect(html).toContain('Check both acknowledgments above to enable payment.')
    expect(html).toContain('disabled=""')
  })

  it('blocks commercial checkout when terms are required but unavailable', () => {
    const origTerms = queryMock.data.quote.terms
    queryMock.data.quote.terms = { required: true, available: false, version: null, url: null, status: 'unavailable' }

    const html = renderToStaticMarkup(<SubscriptionQuoteReview ownerId="teacher-1" onContinue={() => {}} />)
    expect(html).toContain('Commercial Checkout Blocked')
    expect(html).toContain('terms_unavailable')
    expect(html).toContain('Commercial checkout is blocked pending approved and published Terms.')
    expect(html).toContain('disabled=""')

    queryMock.data.quote.terms = origTerms
  })

  it('renders approved terms link and agreement checkbox when terms are required and available', () => {
    const origTerms = queryMock.data.quote.terms
    queryMock.data.quote.terms = {
      required: true,
      available: true,
      version: 'terms-2026-v1',
      url: 'https://activklass.com/terms',
      status: 'available',
    }

    const html = renderToStaticMarkup(<SubscriptionQuoteReview ownerId="teacher-1" onContinue={() => {}} />)
    expect(html).toContain('Subscription Terms &amp; Conditions')
    expect(html).toContain('href="https://activklass.com/terms"')
    expect(html).toContain('terms-2026-v1')
    expect(html).toContain('I have read and agree to the ActivKlass Subscription Terms and Conditions (Version: terms-2026-v1).')

    queryMock.data.quote.terms = origTerms
  })

  it('labels proposed resource allowances separately from actual live entitlements', () => {
    const html = renderToStaticMarkup(<SubscriptionQuoteReview ownerId="teacher-1" onContinue={() => {}} />)
    expect(html).toContain('DEMO ONLY · NOT PAYABLE')
    expect(html).toContain('<strong>AI credits proposed:</strong>')
    expect(html).not.toContain('60,000 credits')
    expect(html).not.toContain('40,000 credits')
    expect(html).toContain('Standard seat schedule (40-student block packages unconfigured in live quotes)')
  })

  it('renders institution-specific details and shared pool allowance note when subscription_type is institution', () => {
    const origQuote = queryMock.data.quote
    queryMock.data = {
      quote: {
        ...origQuote,
        subscription_type: 'institution',
        teacher_seats: 10,
        student_capacity: 400,
        payment_due_php: 36000,
        total_contract_php: 36000,
        line_items: [
          { key: 'teacher_seats', quantity: 10, unit_price_php: 1200, subtotal_php: 12000 },
          { key: 'student_capacity', quantity: 400, unit_price_php: 60, subtotal_php: 24000 },
        ],
      },
    }

    const html = renderToStaticMarkup(<SubscriptionQuoteReview ownerId="school-1" onContinue={() => {}} />)
    expect(html).toContain('Institution subscription')
    expect(html).toContain('10 teacher seats')
    expect(html).toContain('400 unique student seats')
    expect(html).toContain('Shared institutional credit allowance:')
    expect(html).toContain('unavailable / not configured (teachers and students operate under individual daily allocations)')
    expect(html).toContain('₱36,000')

    queryMock.data = { quote: origQuote }
  })
})
