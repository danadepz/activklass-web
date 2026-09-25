/**
 * Institution seat pricing — the ONE place a peso figure comes from.
 *
 * A school buys seats, not a plan: N teacher seats and M student seats, and
 * the price follows from those two numbers. Billed per school year (10
 * months), because that is how a Philippine school budgets.
 *
 * Why these numbers (worked out 2026-08-29; the owner may revise):
 *
 *   Teacher seat — ₱1,200 / school year (₱120 / month).
 *     A teacher is the only seat that spends money on AI. On the current
 *     model (gemini-3.6-flash, $0.75 in / $3.75 out per 1M tokens) one quiz
 *     draft is ≈ $0.017 and a syllabus or module ≈ 5× that. A typical month —
 *     8 quizzes, 2 syllabi, 2 modules — is ≈ $0.46 ≈ ₱26; a teacher who hits
 *     the daily cap (AI_DAILY_LIMIT, 20/day) every school day is ≈ ₱430,
 *     which the cap is there to bound. Firestore reads for a gradebook-heavy
 *     user are a few centavos more. ₱120 / month covers the typical teacher
 *     ~4×, so the heavy ones are paid for by the light ones, and leaves room
 *     for the model price rising when the introductory rate ends (2026-12-31).
 *
 *   Student seat — ₱60 / school year (₱6 / month).
 *     A student spends nothing on AI: the risk model is local (0 tokens) and
 *     students never trigger generation. Their cost is Firestore — dashboard
 *     and class reads, one attendance write a day, quiz attempts — about
 *     ₱2–3 / month on Blaze pricing, plus their share of storage (a school's
 *     records are hundreds of MB, i.e. centavos). ₱6 / month is ~2× that.
 *
 *   A school sizes students PER TEACHER (owner's call, 2026-08-29): the total
 *   is teachers × students-per-teacher, so 20 teachers at 120 each is 2,400
 *   students and ₱168,000 a year — ₱8,400 per teacher, exactly what one solo
 *   teacher with 120 students pays. The two paths cannot be played against
 *   each other.
 *
 *   Solo teacher — the same two rates, one teacher seat plus the students
 *   they handle: ₱1,200 + ₱60 × students per school year. 120 students (the
 *   solo cap on the trial) is ₱8,400 a year, ₱840 a month. Same per-seat
 *   price as a school so nobody games the split; the school pays more only
 *   because it has more people.
 *
 * The register page shows these numbers and, since T-82 (Option B,
 * 2026-09-26), charges them: an Institution sign-up pays for the seats it
 * picked here before the ActivKlass team ever reviews the request — not an
 * estimate reconciled later. A solo teacher sees the same figure and pays it
 * whenever they choose, from the Account page (T-68).
 */
/** Every subscription starts with a free month; billing begins after it. */
export const TRIAL_DAYS = 30

export const TEACHER_SEAT_PER_YEAR = 1200
export const STUDENT_SEAT_PER_YEAR = 60
export const MONTHS_PER_SCHOOL_YEAR = 10

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

/** @returns {number} pesos per school year, before any negotiated discount */
export function estimateAnnual(teacherSeats, studentSeats) {
  const t = Math.max(0, Math.floor(Number(teacherSeats) || 0))
  const s = Math.max(0, Math.floor(Number(studentSeats) || 0))
  return t * TEACHER_SEAT_PER_YEAR + s * STUDENT_SEAT_PER_YEAR
}

/** A solo teacher: their own seat plus the students they handle. */
export function estimateSolo(studentSeats) {
  return estimateAnnual(1, studentSeats)
}

/** When a trial that starts now ends — a Date, for a Firestore Timestamp. */
export function trialEndsFrom(start = new Date()) {
  return new Date(start.getTime() + TRIAL_DAYS * 24 * 60 * 60 * 1000)
}

/** ₱-formatted, whole pesos, thousands separated. */
export function pesos(amount) {
  return `₱${Math.round(amount).toLocaleString('en-PH')}`
}
