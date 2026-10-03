/**
 * T-120 (triplecookiemonster-151): a validation refusal in this file used to
 * show up twice -- once in the inline banner at the top of the modal, and
 * again a moment later as a toast in the corner. Her screenshot was "Enter a
 * level like "Grade 10" or "1st Year"." rendered both ways at once.
 *
 * This file has one shared helper behind every fail() call: `failWith`.
 * Finding that out was the actual job here -- a sweep across call sites
 * would have been the wrong fix for a problem that was really one function.
 * `failWith` no longer toasts (the other half -- what that trades away, and
 * why it is noted rather than silently re-solved -- is in its own doc
 * comment); this counts the toast store before and after a call to prove it,
 * rather than merely asserting the inline message is set.
 */
import { describe, expect, it } from 'vitest'

import { getToasts } from '@/components/ui/toast'
import { failWith } from './index.jsx'

describe('T-120 — a refusal is reported once, inline, not also as a toast', () => {
  it('sets the banner and adds no toast', () => {
    let banner = null
    const fail = failWith((msg) => { banner = msg })
    const before = getToasts().length

    fail('Enter a level like "Grade 10" or "1st Year".')

    expect(banner).toBe('Enter a level like "Grade 10" or "1st Year".')
    expect(getToasts().length, 'a toast was added alongside the inline banner').toBe(before)
  })

  it('a null message still clears the banner, and still adds no toast', () => {
    let banner = 'something'
    const fail = failWith((msg) => { banner = msg })
    const before = getToasts().length

    fail(null)

    expect(banner).toBeNull()
    expect(getToasts().length).toBe(before)
  })
})
