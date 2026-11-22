import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import AcademicDateInput from './AcademicDateInput'
import { typedDateValue } from '@/lib/academicDate'

describe('AcademicDateInput (owner decision 2026-11-22: MM-DD-YYYY)', () => {
  it('shows a stored date as MM-DD-YYYY in a text field with the format as placeholder', () => {
    const html = renderToStaticMarkup(<AcademicDateInput value="2026-11-03" onChange={() => {}} />)
    expect(html).toContain('value="11-03-2026"')
    expect(html).toContain('placeholder="MM-DD-YYYY"')
    expect(html).toContain('type="text"')
    expect(html).not.toContain('type="date"')
  })

  it('a legacy empty value shows an empty field, not an invented date', () => {
    expect(renderToStaticMarkup(<AcademicDateInput value="" onChange={() => {}} />)).toContain('value=""')
  })

  it('passes a real typed date on canonical, the raw text otherwise, "" when cleared', () => {
    expect(typedDateValue('02-29-2024')).toBe('2024-02-29')
    expect(typedDateValue('02-29-2000')).toBe('2000-02-29')
    expect(typedDateValue('02-30-2026')).toBe('02-30-2026')
    expect(typedDateValue('02-29-2026')).toBe('02-29-2026')
    expect(typedDateValue('  ')).toBe('')
  })
})
