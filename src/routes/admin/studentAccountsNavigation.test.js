import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { studentAccountsDestination } from '@/lib/studentAccountsNavigation'

const source = readFileSync(new URL('./UsersTab.jsx', import.meta.url), 'utf8')

describe('school-admin student account creation destination', () => {
  it('opens the student accounts view and targets a newly created individual student', () => {
    expect(studentAccountsDestination({
      role: 'student',
      user: { login_id: 'school-123456', first_name: 'Ana', last_name: 'Santos' },
    })).toEqual({ roleFilter: 'student', search: 'school-123456' })
  })

  it('applies the destination after successful account creation and scrolls to the accounts list', () => {
    expect(source).toContain('onCreated({ role, user: res.user })')
    expect(source).toContain('const destination = studentAccountsDestination(result)')
    expect(source).toContain("setRoleFilter(destination.roleFilter)")
    expect(source).toContain('setSearch(destination.search)')
    expect(source).toContain('accountsRef.current?.scrollIntoView')
    expect(source).toContain('title={roleFilter === \'student\' ? \'Student Accounts\' : \'Users\'}')
  })

  it('opens the student accounts view after a bulk student upload without filtering out created rows', () => {
    expect(studentAccountsDestination({
      role: 'bulk-student',
      created: [{ login_id: 'school-123456' }, { login_id: 'school-234567' }],
    })).toEqual({ roleFilter: 'student', search: '' })
  })

  it('leaves teacher creation and unrelated Users navigation unchanged', () => {
    expect(studentAccountsDestination({ role: 'teacher', user: { login_id: 'school-123456' } })).toBeNull()
    expect(studentAccountsDestination(null)).toBeNull()
  })
})
