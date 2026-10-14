/**
 * T-178: Title Case, round four: the whole product, and six items that are not casing at all.
 * Tickets: andecobs-262..270, 272..278, maykel_64440-279..284 (22 tickets).
 *
 * Covers Admin (Lane 1), Teacher Chrome & Setup (Lane 2), Class Detail (Lane 3),
 * Quizzes (Lane 4), and Student (Lane 5) across 20 touched files.
 * Pinned strictly so verify_fix.py proves bite when source files are reverted.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const read = (relPath) => readFileSync(fileURLToPath(new URL(relPath, import.meta.url)), 'utf8')

const signOutBtnSrc = read('../components/SignOutButton.jsx')
const adminIndexSrc = read('./admin/index.jsx')
const adminClassesSrc = read('./admin/ClassesTab.jsx')
const adminSubSrc = read('./admin/SubscriptionTab.jsx')
const adminUsersSrc = read('./admin/UsersTab.jsx')
const adminBulkSrc = read('./admin/BulkUpload.jsx')

const teacherLayoutSrc = read('./teacher/_layout.jsx')
const teacherGradingSrc = read('./teacher/grading.jsx')
const teacherStudentsSrc = read('./teacher/students.jsx')
const teacherReportsSrc = read('./teacher/reports.jsx')
const teacherAnnouncementsSrc = read('./teacher/announcements.jsx')
const teacherDashboardSrc = read('./teacher/index.jsx')

const classDetailSrc = read('./teacher/classes/$classId/index.jsx')
const classRecordSrc = read('./teacher/classes/$classId/record.jsx')
const quizEditorSrc = read('./teacher/quizzes.$quizId.jsx')

const studentDashboardSrc = read('./student/index.jsx')
const studentUpNextSrc = read('./student/deliverables/UpNextPanel.jsx')
const studentProfileSrc = read('./student/profile.jsx')
const parentalAccessPanelSrc = read('../components/ParentalAccessPanel.jsx')
const parentalAccessDefSrc = read('../components/parentalAccess.js')

describe('T-178 — Lane 1: Admin Screens', () => {
  it('SignOutButton defaults to Title Case and uses Title Case on confirm', () => {
    expect(signOutBtnSrc).toContain("children = 'Sign Out'")
    expect(signOutBtnSrc).toMatch(/Sign Out\s*<\/Button>/)
    expect(signOutBtnSrc).not.toContain("children = 'Sign out'")
  })

  it('admin/index.jsx uses Class Overview tab label (approved owner rename)', () => {
    expect(adminIndexSrc).toContain("label: 'Class Overview'")
    expect(adminIndexSrc).not.toContain("label: 'Class oversight'")
  })

  it('admin/ClassesTab.jsx uses Title Case and approved Show Archive label', () => {
    expect(adminClassesSrc).toContain('School Average')
    expect(adminClassesSrc).toContain('All Classes')
    expect(adminClassesSrc).toContain('Show Archive')
    expect(adminClassesSrc).not.toContain('Show archived')
  })

  it('admin/SubscriptionTab.jsx title-cases card headers and transforms display values without altering enums', () => {
    expect(adminSubSrc).toContain('Teachers Included in Your Plan')
    expect(adminSubSrc).toContain('Teacher Seats')
    expect(adminSubSrc).toContain('Student Seats')
    expect(adminSubSrc).toContain('Available Plans')
    expect(adminSubSrc).toContain("textTransform: 'capitalize'")
  })

  it('admin/UsersTab.jsx title-cases card header, action, and fields with (Optional)', () => {
    expect(adminUsersSrc).toContain('School & Login Prefix')
    expect(adminUsersSrc).toContain('School Name')
    expect(adminUsersSrc).toContain('Save Term Dates')
    expect(adminUsersSrc).toContain('Student Number')
    expect(adminUsersSrc).toContain('Grade &amp; Section <span style={{ color: faint, fontWeight: 400 }}>(Optional)</span>')
    expect(adminUsersSrc).toContain('Course &amp; Year <span style={{ color: faint, fontWeight: 400 }}>(Optional)</span>')
    expect(adminUsersSrc).toContain('Department <span style={{ color: faint, fontWeight: 400 }}>(Optional)</span>')
  })

  it('admin/BulkUpload.jsx title-cases button and template link', () => {
    expect(adminBulkSrc).toContain('Choose File')
    expect(adminBulkSrc).toContain('Download Template')
  })
})

describe('T-178 — Lane 2: Teacher Chrome & Setup', () => {
  it('teacher navigation and grading page use Grade Configuration (approved owner rename)', () => {
    expect(teacherLayoutSrc).toContain("label: 'Grade Configuration'")
    expect(teacherGradingSrc).toContain('Grade Configuration')
    expect(teacherGradingSrc).not.toContain('Grade Config\n')
  })

  it('teacher/students.jsx scopes link strictly to Performance Tab', () => {
    expect(teacherStudentsSrc).toContain("· open the{' '}")
    expect(teacherStudentsSrc).toContain('>Performance Tab</Link>')
  })

  it('teacher/reports.jsx title-cases metrics and removes em tag to fix assessed once spacing', () => {
    expect(teacherReportsSrc).toContain('With Grading Setup')
    expect(teacherReportsSrc).toContain('Assessed Across Classes')
    expect(teacherReportsSrc).toContain('Passing')
    expect(teacherReportsSrc).toContain('Of Students Assessed')
    expect(teacherReportsSrc).toContain('counts as assessed once')
    expect(teacherReportsSrc).not.toContain('counts as <em>assessed</em> once')
  })

  it('teacher/announcements.jsx uses No Announcements Found for empty state', () => {
    expect(teacherAnnouncementsSrc).toContain('No Announcements Found')
  })

  it('teacher/index.jsx title-cases dashboard greetings and metrics', () => {
    expect(teacherDashboardSrc).toContain('Welcome Back!')
    expect(teacherDashboardSrc).toContain('Average Class Size')
    expect(teacherDashboardSrc).toContain('Rosters to Fill')
    expect(teacherDashboardSrc).toContain('title="Class Sizes"')
  })
})

describe('T-178 — Lane 3: Class Detail & Record', () => {
  it('classes/$classId/index.jsx title-cases student modal fields and sign-in toggle', () => {
    expect(classDetailSrc).toContain('First Name <span')
    expect(classDetailSrc).toContain('Last Name <span')
    expect(classDetailSrc).toContain('Middle Name <span style={optHint}>(Optional)</span>')
    expect(classDetailSrc).toContain('Program <span style={optHint}>(Optional)</span>')
    expect(classDetailSrc).toContain('Year <span style={optHint}>(Optional)</span>')
    expect(classDetailSrc).toContain('LRN <span style={optHint}>(Basic Ed, Optional)</span>')
    expect(classDetailSrc).toContain('Remarks <span style={optHint}>(Optional)</span>')
    expect(classDetailSrc).toContain('Academic Progress')
    expect(classDetailSrc).toContain('Disable Sign-In')
    expect(classDetailSrc).toContain('Enable Sign-In')
  })

  it('classes/$classId/record.jsx title-cases assessment modal, lock button, and metric header', () => {
    expect(classRecordSrc).toContain('Total Points')
    expect(classRecordSrc).toContain('Date Given')
    expect(classRecordSrc).toContain('Add Assessment')
    expect(classRecordSrc).toContain('Lock Period')
    expect(classRecordSrc).toContain('Unlock Period')
    expect(classRecordSrc).toContain('At Risk · Below VS')
  })
})

describe('T-178 — Lane 4: Quizzes', () => {
  it('quizzes.$quizId.jsx title-cases quiz settings, checkboxes, pool, and approved Result Visibility', () => {
    expect(quizEditorSrc).toContain('Time Limit')
    expect(quizEditorSrc).toContain('Syllabus Topic')
    expect(quizEditorSrc).toContain('Instructions (Optional)')
    expect(quizEditorSrc).toContain('Unlimited Until It Closes')
    expect(quizEditorSrc).toContain('Shuffle Questions')
    expect(quizEditorSrc).toContain('Shuffle Options')
    expect(quizEditorSrc).toContain('Prevent Backtracking')
    expect(quizEditorSrc).toContain('Marks Count From')
    expect(quizEditorSrc).toContain('Release Results')
    expect(quizEditorSrc).toContain('Result Visibility')
    expect(quizEditorSrc).toContain('Draw Random Subset')
    expect(quizEditorSrc).toContain('Questions to Draw')
  })
})

describe('T-178 — Lane 5: Student Portal', () => {
  it('student/index.jsx title-cases classes section header and view all link', () => {
    expect(studentDashboardSrc).toContain('Your Classes</h2>')
    expect(studentDashboardSrc).toContain('View All <span')
  })

  it('student UpNextPanel title-cases Up Next header', () => {
    expect(studentUpNextSrc).toContain('Up Next</h2>')
  })

  it('student profile title-cases Student Number, Password Recovery Email, and Sign Out', () => {
    expect(studentProfileSrc).toContain('label="Student Number"')
    expect(studentProfileSrc).toContain('Password Recovery Email')
    expect(studentProfileSrc).toContain('Sign Out</h2>')
  })

  it('ParentalAccessPanel title-cases code header, show button, and section headings', () => {
    expect(parentalAccessPanelSrc).toContain('Guardian Link Code</h3>')
    expect(parentalAccessPanelSrc).toContain('Show My Code')
    expect(parentalAccessPanelSrc).toContain('What Guardians Can See</h3>')
    expect(parentalAccessPanelSrc).toContain('Connected Guardians')
  })

  it('parentalAccess.js title-cases permission labels while preserving data keys', () => {
    expect(parentalAccessDefSrc).toContain("label: 'Quiz & Activity Scores'")
    expect(parentalAccessDefSrc).toContain("label: 'Attendance Record'")
    expect(parentalAccessDefSrc).toContain("label: 'Subject Analytics'")
  })
})
