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

  it('keeps a warning that carries an action until the user dismisses it', () => {
    toast.warning('2 rows were skipped', { action: { label: 'Review', onClick: vi.fn() } })
    vi.advanceTimersByTime(60 * 60 * 1000)
    expect(getToasts()).toHaveLength(1)
    expect(getToasts()[0].duration).toBe(0)
  })

  it('does not stack the same error when it is raised again', () => {
    toast.error('Every weight must be above 0%.')
    toast.error('Every weight must be above 0%.')
    expect(getToasts()).toHaveLength(1)
    toast.error('The pass mark must be 1 to 99.')
    expect(getToasts().map((t) => t.message)).toEqual([
      'Every weight must be above 0%.',
      'The pass mark must be 1 to 99.',
    ])
  })

  it('gives a repeated timed notice its full time again instead of a second copy', () => {
    toast.success('Saved')
    vi.advanceTimersByTime(2000)
    toast.success('Saved')
    expect(getToasts()).toHaveLength(1)
    vi.advanceTimersByTime(2000)
    expect(getToasts()).toHaveLength(1)
    vi.advanceTimersByTime(1000)
    expect(getToasts()).toHaveLength(0)
  })

  it('allows an explicit duration override', () => {
    toast.error('Registration needs attention', { duration: 6000 })
    expect(getToasts()[0].duration).toBe(6000)
    vi.advanceTimersByTime(6000)
    expect(getToasts()).toHaveLength(0)
  })
})
