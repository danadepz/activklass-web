import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import SubscriptionExpiry, { subscribeExpiryClock } from './SubscriptionExpiry'
import { formatExpirationCountdown } from '@/lib/subscription'

const NOW = new Date('2026-11-16T00:00:00.000Z').getTime()

describe('formatExpirationCountdown', () => {
  it('shows human-readable days or hours left from a timestamp', () => {
    const expiry = { toMillis: () => NOW + (5 * 24 * 60 + 12 * 60 + 8) * 60_000 }
    expect(formatExpirationCountdown(expiry, NOW)).toBe('5 days left')
  })

  it('rounds partial minutes up and describes an elapsed expiry', () => {
    expect(formatExpirationCountdown(NOW + 1, NOW)).toBe('1 minute left')
    expect(formatExpirationCountdown(NOW, NOW)).toBe('Expired')
  })

  it('returns no countdown for missing or invalid dates', () => {
    expect(formatExpirationCountdown(null, NOW)).toBeNull()
    expect(formatExpirationCountdown('not a date', NOW)).toBeNull()
  })
})

describe('SubscriptionExpiry', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
  })

  afterEach(() => vi.useRealTimers())

  it('renders the date and days left', () => {
    const html = renderToStaticMarkup(
      <SubscriptionExpiry label="Trial ends" expiresAt={NOW + (2 * 24 * 60 + 3 * 60 + 8) * 60_000} />,
    )
    expect(html).toContain('Trial ends')
    expect(html).toContain('November 18, 2026')
    expect(html).toContain('2 days left')
  })

  it('refreshes every minute and immediately after focus/visibility changes', () => {
    const windowListeners = new Map()
    const documentListeners = new Map()
    vi.stubGlobal('window', {
      addEventListener: (name, listener) => windowListeners.set(name, listener),
      removeEventListener: (name) => windowListeners.delete(name),
    })
    vi.stubGlobal('document', {
      addEventListener: (name, listener) => documentListeners.set(name, listener),
      removeEventListener: (name) => documentListeners.delete(name),
    })
    const refresh = vi.fn()

    const cleanup = subscribeExpiryClock(refresh)
    vi.advanceTimersByTime(60_000)
    expect(refresh).toHaveBeenCalledTimes(1)
    windowListeners.get('focus')()
    documentListeners.get('visibilitychange')()
    expect(refresh).toHaveBeenCalledTimes(3)

    cleanup()
    expect(windowListeners.size).toBe(0)
    expect(documentListeners.size).toBe(0)
    vi.advanceTimersByTime(60_000)
    expect(refresh).toHaveBeenCalledTimes(3)
  })

  it('renders nothing without a trustworthy expiry timestamp', () => {
    const html = renderToStaticMarkup(<SubscriptionExpiry label="Paid through" expiresAt={null} />)
    expect(html).toBe('')
  })
})
