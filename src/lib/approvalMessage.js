/**
 * The message a school receives when its access request is approved.
 *
 * Sent BY HAND (owner's decision, 2026-08-30): the superadmin copies this
 * from the console into whatever mail client they use. No mail provider is
 * wired in and none is planned for the demo, so this text is the whole
 * notification path -- it has to carry everything the school needs to get in
 * and get started, and nothing that is not true yet.
 *
 * Pure: no Firestore, no window. Callers pass the sign-in URL so the same
 * text is right on a forwarded port and on a real host.
 */

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

/* "29 September 2026" -- spelled out by hand rather than through toLocale-
   DateString, whose en-PH output differs between browsers and Node, and a
   date in a letter should read the same on every machine that copies it. */
function fmtDate(value) {
  const d = value?.toDate?.() ?? (value instanceof Date ? value : value ? new Date(value) : null)
  if (!d || Number.isNaN(d.getTime())) return null
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`
}

function n(v) {
  return Number(v ?? 0).toLocaleString('en-PH')
}

/**
 * @param {object} p
 * @param {string} p.schoolName
 * @param {string} [p.campus]
 * @param {string} [p.firstName]   the admin's first name, for the greeting
 * @param {string} p.email         what they sign in with
 * @param {number} p.teacherSeats
 * @param {number} p.studentSeats
 * @param {Date|{toDate:Function}|string|null} [p.trialEndsAt]
 * @param {string} p.signInUrl
 * @returns {{ subject: string, body: string }}
 */
export function approvalMessage({
  schoolName,
  campus,
  firstName,
  email,
  teacherSeats,
  studentSeats,
  trialEndsAt,
  signInUrl,
}) {
  const school = campus ? `${schoolName}, ${campus}` : schoolName
  const until = fmtDate(trialEndsAt)
  const trialLine = until
    ? `Your first 30 days are free, until ${until}. We will send the invoice for the school year before then; nothing is due today.`
    : 'Your first 30 days are free. We will send the invoice for the school year before then; nothing is due today.'

  const subject = `Your ActivKlass school account is ready — ${schoolName}`
  const body = [
    `Hi ${firstName || 'there'},`,
    '',
    `Good news: ${school} has been approved on ActivKlass, and your account is now its admin.`,
    '',
    `Sign in: ${signInUrl}`,
    `Email: ${email}`,
    'Password: the one you chose when you registered.',
    '',
    `Your plan: ${n(teacherSeats)} teacher seats and ${n(studentSeats)} student seats. ${trialLine}`,
    '',
    'First steps once you are in:',
    '1. Set your school’s login prefix (Users tab, "Login prefix" card). Every teacher and student login starts with it.',
    '2. Add your teachers, one at a time or from a file. Each gets a login of prefix-last 6 digits of their employee ID, starting password pass1234, which they change on first sign-in.',
    '3. Add students the same way, using the last 6 digits of the LRN (or student number for college).',
    '',
    'Reply to this email if anything does not look right.',
    '',
    '— The ActivKlass team',
  ].join('\n')

  return { subject, body }
}
