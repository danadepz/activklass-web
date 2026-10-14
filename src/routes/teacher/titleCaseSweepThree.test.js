/**
 * T-176 (maykel_64440-252, -256, -257, -258, -259): Title Case, round three —
 * five more teacher screens T-157 and T-164 did not reach.
 *
 * Same convention as T-157/T-164 (headings, field labels, buttons and menu
 * options in Title Case; prose, placeholders and `<select>` values left
 * alone):
 * - 252 (StudentAccounts.jsx, Add Student form): "Into class" -> "Into Class",
 *   "First name" -> "First Name", "Middle name" -> "Middle Name", "Last name"
 *   -> "Last Name", "Student number" -> "Student Number", "Personal email" ->
 *   "Personal Email", "Add student" -> "Add Student". The Bulk tab's own
 *   "Into class" label is the same string in the same file, title-cased too.
 * - 256 (account.jsx + the components it mounts): "Your profile" ->
 *   "Your Profile", "First name"/"Middle name"/"Last name" -> Title Case,
 *   "(optional)" -> "(Optional)", "Save profile" -> "Save Profile",
 *   "Change password" -> "Change Password" (heading and button, shared
 *   ChangePassword.jsx), "Current password"/"New password"/"Confirm new
 *   password" -> Title Case, "Your school" -> "Your School" (all three states
 *   of SchoolColleagues.jsx, the card account.jsx mounts — Admin lane per
 *   OWNERSHIP.md). "Sign Out" was already Title Case on both the heading
 *   (T-157, ticket 231) and the card text below it — checked, not re-fixed.
 * - 257 (announcements.jsx): "All my classes (Global)" -> "All My Classes
 *   (Global)" (an <option> value="" label, not the value), "No announcements
 *   yet" -> "No Announcements Yet". The filtered-category empty state keeps
 *   its own wording. Two more (optional) markers in this same file —
 *   "Expires On" and "+ Link a resource" — are title-cased for the same
 *   consistency pass.
 * - 258 (classes/index.jsx): SORT_OPTIONS labels only — "Last accessed" ->
 *   "Last Accessed", "Subject name" -> "Subject Name". The sort keys
 *   ('default'/'subject') T-134 named are untouched.
 * - 259 (ClassFormModal.jsx): "Create class" -> "Create Class", both the
 *   modal's own submit button and saveConfirmSpec's confirmLabel for the
 *   same action. The "Syllabus (optional)" field label is also title-cased
 *   for the same consistency pass.
 *
 * (optional) -> (Optional) convention, decided here per the card's point 3:
 * applied everywhere touched in this pass (StudentAccounts.jsx,
 * account.jsx, ClassFormModal.jsx, announcements.jsx). NOT swept into other
 * screens this ticket does not touch — those are reported, not fixed:
 * admin/UsersTab.jsx still has "Department (optional)" lowercase beside its
 * own already-Title-Case "Middle Name (Optional)" (T-173's to settle,
 * per the convoy's cross-convoy warning); teacher/quizzes.jsx has both
 * "Extra context for the AI (optional)" and "Assign to Classes (Optional)"
 * on the same screen; register.jsx pairs "Middle Name" with a lowercase
 * "(optional)" right beside it; several labels in
 * teacher/classes/$classId/{attendance,record,modules}.jsx and
 * student/classes/$classId/index.jsx are lowercase too. None of those are
 * this ticket's five screens.
 *
 * Also found and reported, not fixed: SignOutButton.jsx (UI/UX lane,
 * shared across every portal) still defaults its own rendered button text
 * to lowercase "Sign out" (`children = 'Sign out'`) and repeats it on its
 * confirmation dialog's button — the account page's heading above it reads
 * "Sign Out" (verified already fixed, T-157), but the clickable control
 * underneath does not. Out of scope for this convoy (different lane, not
 * one of the five screens' own files); flagging for a follow-up ticket
 * rather than sweeping a shared component four other screens also render.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const studentAccountsSrc = readFileSync(fileURLToPath(new URL('./StudentAccounts.jsx', import.meta.url)), 'utf8')
const accountSrc = readFileSync(fileURLToPath(new URL('./account.jsx', import.meta.url)), 'utf8')
const schoolColleaguesSrc = readFileSync(fileURLToPath(new URL('./SchoolColleagues.jsx', import.meta.url)), 'utf8')
const changePasswordSrc = readFileSync(fileURLToPath(new URL('../../components/ChangePassword.jsx', import.meta.url)), 'utf8')
const announcementsSrc = readFileSync(fileURLToPath(new URL('./announcements.jsx', import.meta.url)), 'utf8')
const classesIndexSrc = readFileSync(fileURLToPath(new URL('./classes/index.jsx', import.meta.url)), 'utf8')
const classFormModalSrc = readFileSync(fileURLToPath(new URL('../../features/classes/ClassFormModal.jsx', import.meta.url)), 'utf8')

describe('T-176 — Add Student (StudentAccounts.jsx, 252)', () => {
  it('title-cases the Individual form\'s labels and submit button', () => {
    expect(studentAccountsSrc).toContain('First Name<input')
    expect(studentAccountsSrc).toContain('Middle Name {optional}<input')
    expect(studentAccountsSrc).toContain('Last Name<input')
    expect(studentAccountsSrc).toContain('Student Number<input')
    expect(studentAccountsSrc).toContain('Personal Email <span')
    expect(studentAccountsSrc).toContain("busy ? 'Adding…' : 'Add Student'")
    expect(studentAccountsSrc).not.toContain('First name<input')
    expect(studentAccountsSrc).not.toContain('Student number<input')
  })

  it('title-cases "Into Class" on both the Individual and the Bulk form', () => {
    const occurrences = studentAccountsSrc.match(/Into Class/g) ?? []
    expect(occurrences.length).toBeGreaterThanOrEqual(2)
    expect(studentAccountsSrc).not.toContain('Into class')
  })

  it('the shared (optional) marker is now (Optional)', () => {
    expect(studentAccountsSrc).toContain("const optional = <span style={{ color: faint, fontWeight: 400 }}>(Optional)</span>")
  })
})

describe('T-176 — Account page (account.jsx, 256)', () => {
  it('title-cases Your Profile, its name fields and Save Profile', () => {
    expect(accountSrc).toContain('>Your Profile</h2>')
    expect(accountSrc).toContain('First Name\n')
    expect(accountSrc).toContain('Middle Name <span style={{ color: muted, fontWeight: 400 }}>(Optional)</span>')
    expect(accountSrc).toContain('Last Name\n')
    expect(accountSrc).toContain("mut.isPending ? 'Saving…' : 'Save Profile'")
    expect(accountSrc).not.toContain('>Your profile</h2>')
  })

  it('Sign Out was already Title Case on the heading (T-157, ticket 231) -- checked, not re-fixed', () => {
    expect(accountSrc).toContain('>Sign Out</h2>')
    expect(accountSrc).not.toContain('>Sign out</h2>')
  })
})

describe('T-176 — Your School card (SchoolColleagues.jsx, 256)', () => {
  it('title-cases "Your School" on all three states: choose, listed, and locked', () => {
    const occurrences = schoolColleaguesSrc.match(/Your School/g) ?? []
    expect(occurrences.length).toBe(3)
    // The one remaining "Your school" is the file's own doc comment, not
    // user-facing text -- not this ticket's to touch.
    expect(schoolColleaguesSrc).not.toMatch(/title="Your school"|>Your school</)
  })
})

describe('T-176 — Change Password (shared ChangePassword.jsx, 256)', () => {
  it('title-cases the heading, the three field labels and the submit button', () => {
    expect(changePasswordSrc).toMatch(/>\s*Change Password\s*<\/h2>/)
    expect(changePasswordSrc).toMatch(/color: ink \}\}>\s*Current Password\s*<input/)
    expect(changePasswordSrc).toMatch(/color: ink \}\}>\s*New Password\s*<input/)
    expect(changePasswordSrc).toMatch(/color: ink \}\}>\s*Confirm New Password\s*<input/)
    expect(changePasswordSrc).toContain("busy ? 'Changing…' : 'Change Password'")
  })
})

describe('T-176 — Announcements (announcements.jsx, 257)', () => {
  it('title-cases the Global option label without changing its value', () => {
    expect(announcementsSrc).toContain('<option value="">All My Classes (Global)</option>')
    expect(announcementsSrc).not.toContain('All my classes (Global)')
  })

  it('title-cases the empty state, leaving the filtered-category wording alone', () => {
    expect(announcementsSrc).toContain("'No Announcements Yet'")
    expect(announcementsSrc).toMatch(/No [Aa]nnouncements (?:in this category|Found)/)
  })

  it('also title-cases the two other (optional) markers touched in this pass', () => {
    expect(announcementsSrc).toContain('Expires On (Optional)')
    expect(announcementsSrc).toContain('+ Link a resource (Optional)')
  })
})

describe('T-176 — My Classes sort menu (classes/index.jsx, 258)', () => {
  it('title-cases the sort labels only, leaving the sort keys untouched', () => {
    expect(classesIndexSrc).toContain("{ value: 'default', label: 'Last Accessed' }")
    expect(classesIndexSrc).toContain("{ value: 'subject', label: 'Subject Name' }")
  })
})

describe('T-176 — New Class dialog (ClassFormModal.jsx, 259)', () => {
  it('title-cases Create Class on both the footer button and the confirm dialog', () => {
    expect(classFormModalSrc).toContain("mode === 'edit' ? 'Save changes' : 'Create Class'")
    const occurrences = classFormModalSrc.match(/'Create Class'/g) ?? []
    expect(occurrences.length).toBe(2)
    expect(classFormModalSrc).not.toContain("'Create class'")
  })

  it('also title-cases the Syllabus (optional) field label touched in this pass', () => {
    expect(classFormModalSrc).toContain('Syllabus <span className="text-slate-400 font-normal">(Optional)</span>')
  })
})
