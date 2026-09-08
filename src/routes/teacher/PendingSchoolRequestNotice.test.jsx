/**
 * The dashboard notice for someone who registered FOR a school and signed in
 * before the ActivKlass team approved the request (T-31, andecobs-47).
 * Static markup, the house pattern.
 */
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/context/useAuth', () => ({ useAuth: () => ({ profile: {}, school: null }) }))
vi.mock('@/hooks/useTeacherClasses', () => ({ useTeacherClasses: () => ({ data: [], isLoading: false }) }))
vi.mock('@/hooks/useMySubscription', () => ({ useMySubscription: () => ({ isLoading: true }) }))
vi.mock('@/lib/firebase', () => ({ db: {} }))

import { PendingSchoolRequestNotice } from './index.jsx'

const requester = { role: 'teacher', school_request_pending: true, teaching_school_name: 'Delta National High School' }

describe('PendingSchoolRequestNotice', () => {
  it('tells an institution requester their request is pending and this is a teacher workspace', () => {
    const html = renderToStaticMarkup(<PendingSchoolRequestNotice profile={requester} />)
    expect(html).toContain('Your request to set up Delta National High School is with the ActivKlass team.')
    expect(html).toContain('until then this is your teacher workspace')
  })

  it('falls back to "your school" when the profile carries no school name', () => {
    const html = renderToStaticMarkup(<PendingSchoolRequestNotice profile={{ school_request_pending: true }} />)
    expect(html).toContain('set up your school is with')
  })

  it('shows nothing to an ordinary teacher', () => {
    expect(renderToStaticMarkup(<PendingSchoolRequestNotice profile={{ role: 'teacher' }} />)).toBe('')
    expect(renderToStaticMarkup(<PendingSchoolRequestNotice profile={{ role: 'teacher', school_request_pending: false }} />)).toBe('')
  })

  it('clears with what approve_request writes: school_request_pending false and a school_id', () => {
    // POST /api/superadmin/requests/{id}/approve promotes in one batch:
    // role admin, school_id, school_request_pending: false.
    const approved = { ...requester, role: 'admin', school_id: 'sch-1', school_request_pending: false }
    expect(renderToStaticMarkup(<PendingSchoolRequestNotice profile={approved} />)).toBe('')
    // A school_id alone is enough -- a stale flag never outlives the school.
    expect(renderToStaticMarkup(<PendingSchoolRequestNotice profile={{ ...requester, school_id: 'sch-1' }} />)).toBe('')
  })
})
