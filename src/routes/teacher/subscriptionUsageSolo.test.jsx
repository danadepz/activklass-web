import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'

const state = vi.hoisted(() => ({
  subscription: null,
  usage: null,
  resourceUsage: null,
  plans: {
    teacher: { standard: { teacher_seats: 1, student_seats: 150, storage_gb: 5 } },
  },
  profile: { id: 'teacher-1', role: 'teacher', email: 'teacher@test.com' },
}))

vi.mock('@tanstack/react-query', async (importOriginal) => ({
  ...(await importOriginal()),
  useQuery: ({ queryKey }) => {
    const key = queryKey?.[0]
    if (key === 'subscription-plans') {
      return { data: { plans: state.plans }, isLoading: false, isError: false, error: null }
    }
    if (key === 'subscription') {
      return {
        data: {
          subscription: state.subscription,
          usage: state.usage,
          resource_usage: state.resourceUsage,
        },
        isLoading: false,
        isError: false,
        error: null,
      }
    }
    return { data: null, isLoading: false, isError: false, error: null }
  },
  useMutation: () => ({ mutate: vi.fn(), isPending: false }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}))

vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({
    profile: state.profile,
    school: null,
    refreshProfile: vi.fn(),
  }),
}))

vi.mock('@/lib/institution', () => ({
  acceptInvite: vi.fn(),
  declineInvite: vi.fn(),
  fetchMyInvites: vi.fn(),
  isAbsorbed: () => false,
}))

vi.mock('@/routes/teacher/SchoolColleagues', () => ({ default: () => null }))

import TeacherAccount from './account'

describe('Subscription Usage Dashboard & Warning States (Solo Teachers)', () => {
  it('renders solo subscription status, paid through date, and available student seats', () => {
    state.subscription = {
      type: 'teacher',
      plan: 'standard',
      status: 'active',
      paid_through: { seconds: 1820665919, nanoseconds: 0 },
      limits: { teacher_seats: 1, student_seats: 150, storage_gb: 5 },
    }
    state.usage = {
      students: { used: 40, seats: 150, over: false },
    }
    state.resourceUsage = {
      ai_credits: { status: 'unavailable', granted: null },
      storage: { status: 'unavailable', used_bytes: null },
    }

    const html = renderToStaticMarkup(<MemoryRouter><TeacherAccount /></MemoryRouter>)
    expect(html).toContain('Your subscription')
    expect(html).toContain('Paid through')
    expect(html).toMatch(/\d+ days?(, \d+ hours?)?(, \d+ minutes?)? remaining/)
    expect(html.toLowerCase()).toContain('early renewal preserves remaining days')
    expect(html).toContain('40')
    expect(html).toContain('110 available')
    expect(html).toContain('Resource Allowances &amp; Usage Policy')
    expect(html).toContain('Student Capacity')
    expect(html).toContain('Teacher Daily Generations')
    expect(html).toContain('Student Daily Explanations')
    expect(html).toContain('Storage Allowance')
  })

  it('shows a trial expiry countdown on the individual account', () => {
    state.subscription = {
      type: 'teacher', status: 'trial',
      trial_ends_at: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
      limits: { teacher_seats: 1, student_seats: 150, storage_gb: 5 },
    }
    const html = renderToStaticMarkup(<MemoryRouter><TeacherAccount /></MemoryRouter>)
    expect(html).toContain('Trial ends')
    expect(html).toMatch(/\d+ days?(, \d+ hours?)?(, \d+ minutes?)? remaining/)
  })

  it('renders 80% informational warning when student capacity reaches 80%', () => {
    state.usage = {
      students: { used: 120, seats: 150, over: false },
    }
    const html = renderToStaticMarkup(<MemoryRouter><TeacherAccount /></MemoryRouter>)
    expect(html).toContain('80% capacity reached:')
    expect(html).toContain('Approaching student limit. Existing learners and classes remain fully active.')
  })

  it('renders 90% prominent warning when student capacity reaches 90%', () => {
    state.usage = {
      students: { used: 135, seats: 150, over: false },
    }
    const html = renderToStaticMarkup(<MemoryRouter><TeacherAccount /></MemoryRouter>)
    expect(html).toContain('90% capacity reached:')
    expect(html).toContain('High student seat utilization. Consider adding student seats soon.')
  })

  it('renders 100% exhaustion state stating enrollment is not blocked while enforcement is disabled', () => {
    state.usage = {
      students: { used: 155, seats: 150, over: true },
    }
    const html = renderToStaticMarkup(<MemoryRouter><TeacherAccount /></MemoryRouter>)
    expect(html).toContain('Seat limit reached (100%):')
    expect(html).toContain('Existing students and classes retain full access. Capacity is informational and new enrollments are not blocked while subscription-wide enforcement is disabled (plan upgrade recommended).')
    expect(html).toContain('No automatic charges or data deletions will ever occur.')
  })

  it('displays protective invariants ensuring non-AI academic features remain operational', () => {
    const html = renderToStaticMarkup(<MemoryRouter><TeacherAccount /></MemoryRouter>)
    expect(html).toContain('At AI limits, non-AI academic features (gradebooks, rosters, attendance) remain fully operational.')
  })

  it('clearly distinguishes unavailable AI credits from exhausted credits for solo teachers', () => {
    state.resourceUsage = {
      ai_credits: { status: 'unavailable', granted: null },
      storage: { status: 'unavailable', used_bytes: null },
    }
    let html = renderToStaticMarkup(<MemoryRouter><TeacherAccount /></MemoryRouter>)
    expect(html).toContain('Unavailable (unprovisioned; standard daily user quotas apply)')

    state.resourceUsage = {
      ai_credits: { status: 'available_estimated', granted: 30000, remaining: 0 },
      storage: { status: 'unavailable', used_bytes: null },
    }
    html = renderToStaticMarkup(<MemoryRouter><TeacherAccount /></MemoryRouter>)
    expect(html).toContain('0 credits remaining (Exhausted)')
  })
})
