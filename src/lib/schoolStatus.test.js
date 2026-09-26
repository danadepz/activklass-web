import { describe, expect, it } from 'vitest'
import { schoolApprovedUnpaid, schoolSuspended } from './schoolStatus'

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

/* T-82, Option C: a school a superadmin approved but that has not yet paid
   for its year. Distinct from schoolSuspended -- an approved_unpaid school
   was never switched off, so it must never fall into SCHOOL_OFF's set. */
describe('schoolApprovedUnpaid', () => {
  it('gates on approved_unpaid only', () => {
    expect(schoolApprovedUnpaid({ subscription_status: 'approved_unpaid' }, false)).toBe(true)
    expect(schoolApprovedUnpaid({ subscription_status: 'active' }, false)).toBe(false)
    expect(schoolApprovedUnpaid({ subscription_status: 'trial' }, false)).toBe(false)
    expect(schoolApprovedUnpaid({ subscription_status: 'pending' }, false)).toBe(false)
    expect(schoolApprovedUnpaid({ subscription_status: 'declined' }, false)).toBe(false)
  })

  it('does not double-gate a suspended or cancelled school', () => {
    expect(schoolApprovedUnpaid({ subscription_status: 'suspended' }, false)).toBe(false)
    expect(schoolApprovedUnpaid({ subscription_status: 'cancelled' }, false)).toBe(false)
  })

  it('never gates someone with no school, or a school with no status yet', () => {
    expect(schoolApprovedUnpaid(null, false)).toBe(false)
    expect(schoolApprovedUnpaid(undefined, false)).toBe(false)
    expect(schoolApprovedUnpaid({ name: 'Old School' }, false)).toBe(false)
  })

  it('never gates the superadmin', () => {
    expect(schoolApprovedUnpaid({ subscription_status: 'approved_unpaid' }, true)).toBe(false)
  })
})
