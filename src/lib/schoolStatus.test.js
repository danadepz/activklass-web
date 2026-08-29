import { describe, expect, it } from 'vitest'
import { schoolSuspended } from './schoolStatus'

describe('schoolSuspended', () => {
  it('gates on suspended and cancelled only', () => {
    expect(schoolSuspended({ subscription_status: 'suspended' }, false)).toBe(true)
    expect(schoolSuspended({ subscription_status: 'cancelled' }, false)).toBe(true)
    expect(schoolSuspended({ subscription_status: 'active' }, false)).toBe(false)
    expect(schoolSuspended({ subscription_status: 'trial' }, false)).toBe(false)
  })

  it('never gates someone with no school, or a school with no status yet', () => {
    // Solo teachers carry no school_id; older school docs predate the mirror.
    expect(schoolSuspended(null, false)).toBe(false)
    expect(schoolSuspended(undefined, false)).toBe(false)
    expect(schoolSuspended({ name: 'Old School' }, false)).toBe(false)
  })

  it('never gates the superadmin, who is the one who reactivates', () => {
    expect(schoolSuspended({ subscription_status: 'suspended' }, true)).toBe(false)
  })
})
