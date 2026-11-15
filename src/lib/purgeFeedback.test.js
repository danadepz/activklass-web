/**
 * T-256: a purge is shown as done only when the server says it is done.
 * The backend answers 200 `state: 'completed'`, or 502 `state: 'incomplete'`
 * with the accounts still left, or 409 when a guard refused it.
 */
import { describe, expect, it } from 'vitest'
import { ApiError } from './api'
import { isIncompletePurge, purgeErrorMessage, purgeResultMessage } from './purgeFeedback'

describe('purgeResultMessage', () => {
  it('reports success for a completed purge', () => {
    const r = purgeResultMessage({ ok: true, state: 'completed' }, 'Subscriber and its accounts')
    expect(r.ok).toBe(true)
    expect(r.message).toBe('Subscriber and its accounts purged. Sign-in accounts and records are removed.')
  })

  it('never reports success without the completed state', () => {
    for (const result of [{ ok: true, purged: true }, { state: 'incomplete' }, null, undefined]) {
      const r = purgeResultMessage(result, 'X')
      expect(r.ok).toBe(false)
      expect(r.message).not.toMatch(/purged\./)
    }
  })
})

describe('purgeErrorMessage', () => {
  const incomplete = new ApiError(502, 'purge_incomplete', 'Purge not finished: Some sign-in accounts could not be deleted. They are disabled. Retry the purge.', {
    error: 'purge_incomplete',
    state: 'incomplete',
    step: 'auth',
    message: 'Purge not finished: Some sign-in accounts could not be deleted. They are disabled. Retry the purge.',
    auth_cleanup_failed: ['uid-a', 'uid-b'],
  })

  it('names the accounts still to remove and how to finish', () => {
    expect(isIncompletePurge(incomplete)).toBe(true)
    const msg = purgeErrorMessage(incomplete, 'fallback')
    expect(msg).toContain('Some sign-in accounts could not be deleted')
    expect(msg).toContain('Accounts still to remove: uid-a, uid-b.')
    expect(msg).toContain('Retry purge')
  })

  it('an incomplete purge with no accounts left still says how to finish', () => {
    const err = new ApiError(502, 'purge_incomplete', 'x', { state: 'incomplete', message: 'Purge not finished: Some records could not be removed. Retry the purge.' })
    expect(purgeErrorMessage(err, 'fallback')).toBe('Purge not finished: Some records could not be removed. Retry the purge. Use Retry purge to finish it.')
  })

  it('a refused purge shows the server reason unchanged and is not incomplete', () => {
    const paid = new ApiError(409, 'conflict', 'Cannot purge subscriber: it has paid. Cancel or suspend the subscription instead.', { error: 'conflict' })
    expect(isIncompletePurge(paid)).toBe(false)
    expect(purgeErrorMessage(paid, 'fallback')).toBe('Cannot purge subscriber: it has paid. Cancel or suspend the subscription instead.')
  })

  it('falls back when there is no message at all', () => {
    expect(purgeErrorMessage(undefined, 'Could not purge request.')).toBe('Could not purge request.')
  })
})
