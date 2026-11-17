import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'

const state = vi.hoisted(() => ({
  subscription: null,
  usage: null,
  resourceUsage: null,
  plans: {
    institution: { standard: { teacher_seats: 20, student_seats: 2400, storage_gb: 25 } },
    teacher: { standard: { teacher_seats: 1, student_seats: 150, storage_gb: 5 } },
  },
}))

vi.mock('@tanstack/react-query', async (importOriginal) => ({
  ...(await importOriginal()),
  useQuery: ({ queryKey }) => {
    const key = queryKey?.[0]
    if (key === 'subscription-plans') {
      return { data: { plans: state.plans }, isLoading: false, isError: false, error: null }
    }
    if (key === 'subscription-owner') {
      return { data: { owner_id: 'school-1' }, isLoading: false, isError: false, error: null }
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
    profile: { id: 'admin-1', role: 'admin' },
    school: { id: 'school-1', name: 'St. Jude Academy' },
  }),
}))

import SubscriptionTab from './SubscriptionTab'

describe('Subscription Usage Dashboard & Warning States (Institutions)', () => {
  it('renders normal capacity with available seat counts and resource summary', () => {
    state.subscription = {
      type: 'institution',
      name: 'St. Jude Academy',
      plan: 'standard',
      status: 'active',
      paid_through: { seconds: 1820665919, nanoseconds: 0 },
      limits: { teacher_seats: 20, student_seats: 2400, storage_gb: 25 },
    }
    state.usage = {
      teachers: { used: 10, seats: 20, over: false },
      students: { used: 1200, seats: 2400, over: false },
    }
    state.resourceUsage = {
      ai_credits: { status: 'unavailable', granted: null },
      storage: { status: 'unavailable', used_bytes: null },
    }

    const html = renderToStaticMarkup(<MemoryRouter><SubscriptionTab /></MemoryRouter>)
    expect(html).toContain('St. Jude Academy')
    expect(html).toContain('of 20 used')
    expect(html).toContain('10 available')
    expect(html).toContain('of 2400 used')
    expect(html).toContain('1200 available')
    expect(html).toContain('Resource allowances &amp; policy')
    expect(html).toContain('School-wide AI Credits')
    expect(html).toContain('Student-Protected Credit Pool')
    expect(html).toContain('25 GB')
    expect(html).toContain('Paid through')
    expect(html).toMatch(/\d+ days? left/)
  })

  it('shows a trial expiry countdown in the school administrator subscription screen', () => {
    state.subscription = {
      type: 'institution', name: 'St. Jude Academy', status: 'trial',
      trial_ends_at: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
      limits: { teacher_seats: 20, student_seats: 2400, storage_gb: 25 },
    }
    const html = renderToStaticMarkup(<MemoryRouter><SubscriptionTab /></MemoryRouter>)
    expect(html).toContain('Trial ends')
    expect(html).toMatch(/\d+ days? left/)
  })

  it('renders 80% informational warning when capacity reaches 80%', () => {
    state.usage = {
      teachers: { used: 16, seats: 20, over: false },
      students: { used: 1920, seats: 2400, over: false },
    }
    const html = renderToStaticMarkup(<MemoryRouter><SubscriptionTab /></MemoryRouter>)
    expect(html).toContain('80% capacity reached:')
    expect(html).toContain('Approaching plan limit. All active learners and classes remain fully operational.')
  })

  it('renders 90% prominent warning when capacity reaches 90%', () => {
    state.usage = {
      teachers: { used: 18, seats: 20, over: false },
      students: { used: 2160, seats: 2400, over: false },
    }
    const html = renderToStaticMarkup(<MemoryRouter><SubscriptionTab /></MemoryRouter>)
    expect(html).toContain('90% capacity reached:')
    expect(html).toContain('High utilization. Consider expanding capacity soon.')
  })

  it('renders 100% capacity state stating enrollment is not blocked while enforcement is disabled', () => {
    state.usage = {
      teachers: { used: 20, seats: 20, over: true },
      students: { used: 2450, seats: 2400, over: true },
    }
    const html = renderToStaticMarkup(<MemoryRouter><SubscriptionTab /></MemoryRouter>)
    expect(html).toContain('Over plan limit')
    expect(html).toContain('50 over plan')
    expect(html).toContain('Existing students and teachers retain full access to active classes and records. Capacity is informational and new enrollments are not blocked while subscription-wide enforcement is disabled (plan upgrade recommended).')
    expect(html).toContain('No automatic charges or data deletions will ever occur.')
  })

  it('clearly distinguishes unavailable resource allowances from exhausted allowances', () => {
    // 1. Unavailable case
    state.resourceUsage = {
      ai_credits: { status: 'unavailable', granted: null },
      storage: { status: 'unavailable', used_bytes: null },
    }
    let html = renderToStaticMarkup(<MemoryRouter><SubscriptionTab /></MemoryRouter>)
    expect(html).toContain('Not included in your plan. Standard daily AI limits apply.')
    expect(html).toContain('Not tracked school-wide. Each user has their own daily limit.')

    // 2. Exhausted case
    state.resourceUsage = {
      ai_credits: {
        status: 'available_estimated',
        granted: 1000000,
        remaining: 0,
        // the shape read_resource_usage (backend) actually returns
        pools: {
          teacher: { status: 'available_estimated', granted: 500000, reserved: 0, consumed: 500000, remaining: 0 },
          student: { status: 'available_estimated', granted: 500000, reserved: 0, consumed: 500000, remaining: 0 },
        },
      },
      storage: { status: 'unavailable', used_bytes: null },
    }
    html = renderToStaticMarkup(<MemoryRouter><SubscriptionTab /></MemoryRouter>)
    expect(html).toContain('0 credits remaining (Exhausted)')
    expect(html).toContain('How Limits Work')

    // 3. Granted (Option B, 3 teachers x 90 students): the student pool shows its own balance
    state.resourceUsage = {
      ai_credits: {
        status: 'available_estimated', granted: 300000, reserved: 0, consumed: 0, remaining: 300000,
        pools: {
          teacher: { status: 'available_estimated', granted: 150000, reserved: 0, consumed: 0, remaining: 150000 },
          student: { status: 'available_estimated', granted: 150000, reserved: 0, consumed: 0, remaining: 150000 },
        },
      },
      storage: { status: 'unavailable', used_bytes: null },
    }
    html = renderToStaticMarkup(<MemoryRouter><SubscriptionTab /></MemoryRouter>)
    expect(html).toContain('300,000 credits available')
    expect(html).toContain('150,000 protected')
    expect(html).not.toContain('Exhausted')
  })

  it('never displays project-wide storage as school storage when tenant storage is unprovisioned', () => {
    state.resourceUsage = {
      storage: { status: 'unavailable', used_bytes: null },
    }
    const html = renderToStaticMarkup(<MemoryRouter><SubscriptionTab /></MemoryRouter>)
    expect(html).toContain('Upload limit: 5–25 MB per file · Usage not tracked school-wide')
  })

  it('reads the backend storage.bytes contract and does not claim uploads are blocked at the informational allowance', () => {
    state.resourceUsage = {
      ai_credits: { status: 'unavailable', granted: null },
      storage: { status: 'attributed', bytes: 25_000_000_000, objects: 100, allowance_bytes: 25_000_000_000 },
    }
    const html = renderToStaticMarkup(<MemoryRouter><SubscriptionTab /></MemoryRouter>)
    expect(html).toContain('25 GB')
    expect(html).toContain('of 25 GB used')
    expect(html).toContain('0 B available')
    expect(html).toContain('Storage capacity is informational in this release. New uploads are not blocked')
    expect(html).not.toContain('Uploads are paused until storage is expanded')
  })
})
