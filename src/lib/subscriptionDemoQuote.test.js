import { describe, expect, it, vi } from 'vitest'

const api = vi.hoisted(() => vi.fn())
vi.mock('./api', () => ({ api }))

import { fetchOptionBDemoQuote } from './subscription'

describe('Option B public demonstration quote API', () => {
  it('sends capacity only to the read-only backend endpoint without requiring authentication', async () => {
    const input = { subscription_type: 'institution', teacher_seats: 10, student_capacity: 400 }
    await fetchOptionBDemoQuote(input)
    expect(api).toHaveBeenCalledWith('/api/subscription/demo-option-b-quote', {
      method: 'POST', requireAuth: false, body: input,
    })
  })
})
