import { describe, expect, it } from 'vitest'
import { approvalMessage, teacherApprovalMessage } from './approvalMessage'

const base = {
  schoolName: 'Delta National High School',
  campus: 'Main',
  firstName: 'Dina',
  email: 'principal@delta.test',
  teacherSeats: 20,
  studentSeats: 2400,
  trialEndsAt: new Date('2026-09-29T00:00:00Z'),
  signInUrl: 'http://localhost:5173/login',
}

describe('approvalMessage', () => {
  it('names the school in the subject and the campus in the body', () => {
    const { subject, body } = approvalMessage(base)
    expect(subject).toBe('Your ActivKlass school account is ready — Delta National High School')
    expect(body).toContain('Delta National High School, Main has been approved')
  })

  it('carries what they sign in with and no password', () => {
    const { body } = approvalMessage(base)
    expect(body).toContain('Sign in: http://localhost:5173/login')
    expect(body).toContain('Email: principal@delta.test')
    // The requester keeps the password they chose; nothing to hand over.
    expect(body).toContain('the one you chose when you registered')
    expect(body).not.toMatch(/temporary password/i)
  })

  it('states the seats with thousands separators and the trial end date', () => {
    const { body } = approvalMessage(base)
    expect(body).toContain('20 teacher seats and 2,400 student seats')
    expect(body).toContain('until 29 September 2026')
    expect(body).toContain('nothing is due today')
  })

  it('still reads correctly with no campus, no name and no trial date', () => {
    const { body } = approvalMessage({ ...base, campus: '', firstName: '', trialEndsAt: null })
    expect(body).toContain('Hi there,')
    expect(body).toContain('Delta National High School has been approved')
    expect(body).toContain('Your first 30 days are free. We will send')
    expect(body).not.toContain('until')
  })

  it('accepts a Firestore Timestamp-like value', () => {
    const ts = { toDate: () => new Date('2026-10-01T00:00:00Z') }
    expect(approvalMessage({ ...base, trialEndsAt: ts }).body).toContain('1 October 2026')
  })
})

const soloBase = {
  firstName: 'Kristine',
  email: 'kristine@email.com',
  trialEndsAt: new Date('2026-09-29T00:00:00Z'),
  signInUrl: 'http://localhost:5173/login',
}

describe('teacherApprovalMessage', () => {
  it('says the account is open and what they sign in with', () => {
    const { subject, body } = teacherApprovalMessage(soloBase)
    expect(subject).toBe('Your ActivKlass account is verified')
    expect(body).toContain('Hi Kristine,')
    expect(body).toContain('Sign in: http://localhost:5173/login')
    expect(body).toContain('Email: kristine@email.com')
  })

  /* The failure this guards against is a teacher hunting for a password we
     never sent: they chose their own at registration, and nothing in the
     approval changes it. */
  it('never hands over or invents a credential', () => {
    const { body } = teacherApprovalMessage(soloBase)
    expect(body).toContain('the one you chose when you registered')
    expect(body).not.toMatch(/temporary password|pass1234|activation link to click\.\s*$/i)
    expect(body).toContain('there is no activation link')
  })

  it('dates the free month and says nothing is due', () => {
    const { body } = teacherApprovalMessage(soloBase)
    expect(body).toContain('free, until 29 September 2026')
    expect(body).toContain('Nothing is due today')
  })

  it('reads correctly with no name and no trial date', () => {
    const { body } = teacherApprovalMessage({ ...soloBase, firstName: '', trialEndsAt: null })
    expect(body).toContain('Hi there,')
    expect(body).toContain('Your first 30 days are free. Nothing is due today')
    expect(body).not.toContain('until')
  })

  it('accepts a Firestore Timestamp-like value, like the school notice', () => {
    const ts = { toDate: () => new Date('2026-10-01T00:00:00Z') }
    expect(teacherApprovalMessage({ ...soloBase, trialEndsAt: ts }).body).toContain('1 October 2026')
  })

  /* Only the trial locks the question bank (lib/subscription.js), so this is
     the one entitlement the letter is allowed to name. */
  it('names the one thing a trial does not include', () => {
    expect(teacherApprovalMessage(soloBase).body).toContain('question bank stays locked')
  })
})
