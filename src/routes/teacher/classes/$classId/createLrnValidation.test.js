/**
 * Class page → Add Student → Create New: an LRN must be exactly 12 digits
 * before the form is sent (2026-11-20). The provision endpoint has refused any
 * other length since 5ec6ab8; without this check the teacher read that refusal
 * only after the round trip. The backend stays the authoritative validator.
 *
 * Create only: the find path re-enrols existing students, whose stored LRN may
 * predate the rule, so it must keep its old check (identifierError alone).
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/firebase', () => ({ db: {}, auth: {}, storage: {} }))

import { createIdentifierError } from './index.jsx'

const fields = (over) => ({ student_number: '', lrn: '', ...over })

describe('createIdentifierError — new student on the class page', () => {
  it('refuses an LRN shorter or longer than 12 digits on the LRN toggle', () => {
    expect(createIdentifierError(fields({ lrn: '13642820001' }), 'lrn')).toMatch(/exactly 12 digits/)
    expect(createIdentifierError(fields({ lrn: '1364282000111' }), 'lrn')).toMatch(/exactly 12 digits/)
    expect(createIdentifierError(fields({ lrn: '13642820001A' }), 'lrn')).toMatch(/exactly 12 digits/)
  })

  it('accepts a 12-digit LRN', () => {
    expect(createIdentifierError(fields({ lrn: '136428200011' }), 'lrn')).toBe('')
  })

  it('still requires the identifier the toggle names', () => {
    expect(createIdentifierError(fields(), 'lrn')).toBe('LRN is required.')
    expect(createIdentifierError(fields(), 'id')).toBe('ID Number is required.')
  })

  it('leaves the college path alone: an ID Number with no LRN passes', () => {
    expect(createIdentifierError(fields({ student_number: '2024-000123' }), 'id')).toBe('')
  })

  it('checks a hidden LRN too, because the payload sends it either way', () => {
    expect(createIdentifierError(fields({ student_number: '2024-000123', lrn: '12345' }), 'id'))
      .toMatch(/exactly 12 digits/)
  })
})

describe('wiring', () => {
  const src = readFileSync(fileURLToPath(new URL('./index.jsx', import.meta.url)), 'utf8')

  it('the create submit uses the 12-digit check', () => {
    expect(src).toContain('createIdentifierError(createFields, createIdentifierType)')
  })

  it('the find (re-enrol) path keeps the old check, so legacy records are not blocked', () => {
    expect(src).toContain('identifierError(findFields, findIdentifierType)')
    expect(src).not.toContain('createIdentifierError(findFields')
  })
})
