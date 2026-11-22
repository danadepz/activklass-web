/**
 * Academic dates as people read and type them: MM-DD-YYYY (owner decision
 * 2026-11-22). Storage, document ids, the rules and every API keep the
 * canonical YYYY-MM-DD, which sorts and compares as plain strings.
 *
 * Pure string work -- no Date object touches a displayed value, so nothing can
 * shift by a time zone. Validity is `isCalendarDate` (real Gregorian days).
 */
import { isCalendarDate } from './classForm'

export const ACADEMIC_DATE_PLACEHOLDER = 'MM-DD-YYYY'
export const ACADEMIC_DATE_HINT = 'Use MM-DD-YYYY, for example 02-29-2024.'
const TYPED = /^(\d{2})-(\d{2})-(\d{4})$/

/** '2026-11-03' -> '11-03-2026'. Anything else is returned unchanged (never invented). */
export function formatAcademicDate(iso) {
  if (typeof iso !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso ?? ''
  const [y, m, d] = iso.split('-')
  return `${m}-${d}-${y}`
}

/** '11-03-2026' -> '2026-11-03'; null when it is not MM-DD-YYYY or not a real day. */
export function parseAcademicDate(text) {
  const match = TYPED.exec(String(text ?? '').trim())
  if (!match) return null
  const iso = `${match[3]}-${match[1]}-${match[2]}`
  return isCalendarDate(iso) ? iso : null
}

/**
 * What a typed MM-DD-YYYY field passes on: canonical YYYY-MM-DD for a real
 * day, '' when cleared, else the raw text -- which no date check accepts, so
 * the form's own validation refuses it.
 */
export function typedDateValue(text) {
  const raw = String(text ?? '')
  return parseAcademicDate(raw) ?? (raw.trim() === '' ? '' : raw)
}
