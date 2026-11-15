/** Every subscription starts with a free month; billing begins after it. */
export const TRIAL_DAYS = 30

/**
 * Academic calendars a school can run on. Recorded on the profile and the
 * school request so we know how their year is divided; NOT a billing period —
 * every subscription is one payment per school year (owner's call,
 * 2026-08-29), whatever the calendar.
 */
export const CALENDARS = [
  { value: 'school_year', label: 'School year (DepEd K-12)' },
  { value: 'semestral', label: 'Semesters (2 per year)' },
  { value: 'trimestral', label: 'Trimesters (3 per year)' },
]

/** When a trial that starts now ends — a Date, for a Firestore Timestamp. */
export function trialEndsFrom(start = new Date()) {
  return new Date(start.getTime() + TRIAL_DAYS * 24 * 60 * 60 * 1000)
}

/** ₱-formatted, whole pesos, thousands separated. */
export function pesos(amount) {
  return `₱${Math.round(amount).toLocaleString('en-PH')}`
}
