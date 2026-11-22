import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { dismissToast, getToasts, toast } from './toast'

function clearToasts() {
  getToasts().forEach((item) => dismissToast(item.id))
}

describe('toast lifetimes', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    clearToasts()
  })

  afterEach(() => {
    clearToasts()
    vi.useRealTimers()
  })

  it.each([
    ['success', () => toast.success('Saved')],
    ['info', () => toast.info('Working')],
    ['warning', () => toast.warning('Some records were skipped')],
  ])('%s notices disappear after three seconds', (_type, show) => {
    show()
    expect(getToasts()).toHaveLength(1)
    expect(getToasts()[0].duration).toBe(3000)

    vi.advanceTimersByTime(2999)
    expect(getToasts()).toHaveLength(1)
    vi.advanceTimersByTime(1)
    expect(getToasts()).toHaveLength(0)
  })

  it('keeps actionable errors visible until the user dismisses them', () => {
    const id = toast.error('Could not save. Try again.')
    vi.advanceTimersByTime(60 * 60 * 1000)
    expect(getToasts()).toHaveLength(1)
    dismissToast(id)
    expect(getToasts()).toHaveLength(0)
  })

  it('refreshes a repeated warning without stacking it or clearing other warnings', () => {
    toast.warning('Invalid weights')
    toast.warning('Invalid pass mark')
    vi.advanceTimersByTime(2000)
    toast.warning('Invalid weights')
    expect(getToasts()).toHaveLength(2)
    vi.advanceTimersByTime(1000)
    expect(getToasts().map((item) => item.message)).toEqual(['Invalid weights'])
    vi.advanceTimersByTime(2000)
    expect(getToasts()).toHaveLength(0)
  })

  it('keeps a warning with an action when a matching temporary warning expires', () => {
    const id = toast.warning('Review skipped records', { action: { label: 'Review', onClick: vi.fn() } })
    toast.warning('Review skipped records')
    vi.advanceTimersByTime(60000)
    expect(getToasts().map((item) => item.id)).toEqual([id])
  })

  it('allows an explicit duration override', () => {
    toast.error('Registration needs attention', { duration: 6000 })
    expect(getToasts()[0].duration).toBe(6000)
    vi.advanceTimersByTime(6000)
    expect(getToasts()).toHaveLength(0)
  })
})
