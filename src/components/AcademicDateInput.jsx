import { useState } from 'react'
import { ACADEMIC_DATE_PLACEHOLDER, formatAcademicDate, parseAcademicDate, typedDateValue } from '@/lib/academicDate'

/**
 * A date typed as MM-DD-YYYY (owner decision 2026-11-22). `value` and
 * `onChange` speak canonical YYYY-MM-DD, so the forms, Firestore and the APIs
 * behind them are unchanged:
 *   - a real date typed  -> onChange('2026-11-03')
 *   - cleared            -> onChange('')
 *   - anything else      -> onChange(<the raw text>), which no date check
 *     accepts, so the form's own validation refuses it; `onInvalid` lets the
 *     caller show why without waiting for submit.
 * A native date picker is not used: it renders in the browser's locale format,
 * which cannot be pinned to MM-DD-YYYY.
 */
export default function AcademicDateInput({ value, onChange, onInvalid, ...rest }) {
  const [text, setText] = useState(() => formatAcademicDate(value ?? ''))
  // Follow a value set from outside (e.g. "Use it" filling the school default)
  // without fighting what the user is typing: only when the text does not
  // already mean that value.
  const shown = (value ?? '') === typedDateValue(text) ? text : formatAcademicDate(value ?? '')

  function change(e) {
    const next = e.target.value
    setText(next)
    const passed = typedDateValue(next)
    onInvalid?.(passed !== '' && parseAcademicDate(next) == null)
    onChange?.(passed)
  }

  return (
    <input
      type="text"
      inputMode="numeric"
      autoComplete="off"
      placeholder={ACADEMIC_DATE_PLACEHOLDER}
      maxLength={10}
      value={shown}
      onChange={change}
      {...rest}
    />
  )
}
