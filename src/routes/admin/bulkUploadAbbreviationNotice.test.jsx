/**
 * T-241 (andecobs-317, Derickk 2026-10-28):
 * Tell a new admin to set the school abbreviation first before uploading users.
 *
 * A first-time admin whose school has no abbreviation/login prefix configured
 * cannot issue teacher or student logins. On the bulk upload screen, a clear
 * disclaimer directs the admin to configure the school abbreviation first,
 * linking directly to the School & Login Prefix card (#school-login-prefix).
 * When an abbreviation is already configured, the disclaimer is hidden.
 */
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/firebase', () => ({ db: {}, auth: {} }))
vi.mock('@/lib/admin', () => ({ bulkCreateUsers: vi.fn() }))
vi.mock('@/lib/roster', () => ({ parseCsv: vi.fn() }))
vi.mock('@/lib/xlsx', () => ({ downloadXlsx: vi.fn(), readXlsxRows: vi.fn() }))
vi.mock('@/components/ui/dialogs', () => ({ confirmDialog: vi.fn(async () => true) }))

import BulkUpload, { rowProblem } from './BulkUpload.jsx'

describe('T-241 — Tell a new admin to set the school abbreviation first', () => {
  const teacherRow = {
    first_name: 'Maria',
    last_name: 'Santos',
    role: 'teacher',
    employee_number: '123456',
  }

  it('shows the abbreviation setup disclaimer and anchor link when no prefix is set', () => {
    const html = renderToStaticMarkup(
      <BulkUpload
        role="teacher"
        onDone={() => {}}
        settings={{ school: { name: 'New Academy', login_prefix: '' } }}
        users={[]}
      />,
    )

    expect(html).toContain('Before uploading users, please set up your school abbreviation first.')
    expect(html).toContain('href="#school-login-prefix"')
    expect(html).toContain('Set abbreviation in School &amp; Login Prefix ↑')
    expect(html).toContain('School &amp; Login Prefix card above')
  })

  it('shows the disclaimer when settings or school is null', () => {
    const html = renderToStaticMarkup(
      <BulkUpload
        role="student"
        onDone={() => {}}
        settings={null}
        users={[]}
      />,
    )

    expect(html).toContain('Before uploading users, please set up your school abbreviation first.')
    expect(html).toContain('href="#school-login-prefix"')
  })

  it('refuses row creation with "no login prefix set" when prefix is missing', () => {
    expect(rowProblem(teacherRow, '')).toBe('no login prefix set')
  })

  it('hides the abbreviation setup disclaimer when a prefix is already set', () => {
    const html = renderToStaticMarkup(
      <BulkUpload
        role="teacher"
        onDone={() => {}}
        settings={{ school: { name: 'San Roque NHS', login_prefix: 'srnhs' } }}
        users={[]}
      />,
    )

    expect(html).not.toContain('Before uploading users, please set up your school abbreviation first.')
    expect(html).not.toContain('href="#school-login-prefix"')
    expect(html).toContain('Logins are issued as')
    expect(html).toContain('srnhs-789012')
    expect(rowProblem(teacherRow, 'srnhs')).toBe('')
  })
})
