import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import OptionBDemoQuote from './OptionBDemoQuote'

const state = vi.hoisted(() => ({
  data: {
    demo_only: true,
    checkout_eligible: false,
    policy_version: 'subscription-option-b-v1',
    quote: {
      policy_version: 'subscription-option-b-v1',
      subscription_type: 'institution',
      teacher_seats: 10,
      student_capacity: 400,
      student_blocks: 10,
      term_days: 300,
      total_contract_php: 27_000,
      ai_credits: { granted: 1_000_000, student_reserved: 500_000 },
      daily_limits: { teacher_generations_per_seat: 15, student_explanations_per_student: 10 },
      storage: { gb: 50 },
    },
  },
  isLoading: false,
  isFetching: false,
  isError: false,
  refetch: vi.fn(),
}))

vi.mock('@tanstack/react-query', () => ({ useQuery: () => state }))
vi.mock('@/lib/subscription', () => ({ fetchOptionBDemoQuote: vi.fn() }))

describe('OptionBDemoQuote', () => {
  it('renders the server policy and exact 10/400 demo entitlements without checkout controls', () => {
    const html = renderToStaticMarkup(<OptionBDemoQuote subscriptionType="institution" teacherSeats={10} studentCapacity={400} />)
    expect(html).toContain('Capstone demo pricing · Option B')
    expect(html).toContain('DEMO ONLY · NOT PAYABLE')
    expect(html).toContain('₱27,000')
    expect(html).toContain('1,000,000')
    expect(html).toContain('500,000')
    expect(html).toContain('15 per seat/day')
    expect(html).toContain('10 per student/day')
    expect(html).toContain('50 GB proposed')
    expect(html).toContain('300 days')
    expect(html).toContain('subscription-option-b-v1')
    expect(html).not.toContain('PayMongo')
    expect(html).not.toContain('<button')
  })

  it('does not invent a price when the demo API fails', () => {
    const previous = state.isError
    const previousData = state.data
    state.isError = true
    state.data = undefined
    const html = renderToStaticMarkup(<OptionBDemoQuote subscriptionType="teacher" teacherSeats={1} studentCapacity={40} />)
    expect(html).toContain('Demo package quote unavailable')
    expect(html).not.toContain('₱1,200')
    state.isError = previous
    state.data = previousData
  })

  it('keeps the 10/400 institution reference visible beside a different capacity quote', () => {
    const html = renderToStaticMarkup(<OptionBDemoQuote subscriptionType="institution" teacherSeats={20} studentCapacity={600} />)
    expect(html).toContain('Institution reference example · 10 teachers / 400 students')
    expect(html).toContain('₱27,000 for 300 days')
    expect(html).toContain('1,000,000 proposed credits')
    expect(html).toContain('500,000 student-protected credits')
  })
})
