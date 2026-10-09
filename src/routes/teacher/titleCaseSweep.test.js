/**
 * T-157 (maykel_64440-223..229, 231): Title Case across the teacher screens.
 *
 * Headings, card titles, buttons, and toggles switch to Title Case, with
 * specific rewordings requested by maykel:
 * - 223: "Enrollment mix" -> "Enrollment Overview"
 * - 224: "Largest section" -> "Largest Section", "Open seats" -> "Open Seats"
 * - 225: Quick actions array: New Class, Add a Section, Take Attendance,
 *        Mark Today's Attendance, Create a Quiz, Build or Generate with AI,
 *        Class Analytics, Select a Class Section
 * - 226: "Empty roster" -> "Empty Roster", "Your classes" -> "Your Classes",
 *        "Manage classes" -> "Manage Classes"
 * - 227: "Passing rate" -> "Passing Rate", "Not yet passing" -> "Needs Improvement",
 *        "By class" -> "By Class"
 * - 228: "Class average" -> "Class Average", "Passing rate" -> "Passing Rate",
 *        "Grade distribution" -> "Grade Distribution",
 *        "Component averages" -> "Component Averages", "Top performers" -> "Top Performers"
 * - 229: "By day" -> "By Day", "Whole term" -> "Whole Term", "All saved" -> "All Saved",
 *        and the attendance.jsx day tooltip updated to "on the By Day tab"
 * - 231: "Sign out" -> "Sign Out" in teacher account SignOutCard
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const dashboardSrc = readFileSync(fileURLToPath(new URL('./index.jsx', import.meta.url)), 'utf8')
const reportsSrc = readFileSync(fileURLToPath(new URL('./reports.jsx', import.meta.url)), 'utf8')
const perfSrc = readFileSync(fileURLToPath(new URL('./classes/$classId/performance.jsx', import.meta.url)), 'utf8')
const recordSrc = readFileSync(fileURLToPath(new URL('./classes/$classId/record.jsx', import.meta.url)), 'utf8')
const attendSrc = readFileSync(fileURLToPath(new URL('./classes/$classId/attendance.jsx', import.meta.url)), 'utf8')
const accountSrc = readFileSync(fileURLToPath(new URL('./account.jsx', import.meta.url)), 'utf8')

describe('T-157 — Teacher Dashboard (index.jsx)', () => {
  it('swaps Enrollment mix for Enrollment Overview (223)', () => {
    expect(dashboardSrc).toContain('title="Enrollment Overview"')
    expect(dashboardSrc).not.toContain('title="Enrollment mix"')
  })

  it('title-cases summary strip metrics (224)', () => {
    expect(dashboardSrc).toContain('>Largest Section</div>')
    expect(dashboardSrc).toContain("capped.length > 0 ? 'Open Seats' : 'Sections'")
  })

  it('updates quick actions labels and reworded hints (225)', () => {
    expect(dashboardSrc).toContain("label: 'New Class', hint: 'Add a Section'")
    expect(dashboardSrc).toContain("label: 'Take Attendance', hint: \"Mark Today's Attendance\"")
    expect(dashboardSrc).toContain("label: 'Create a Quiz', hint: 'Build or Generate with AI'")
    expect(dashboardSrc).toContain("label: 'Class Analytics', hint: 'Select a Class Section'")
  })

  it('title-cases class summary section and empty roster badge (226)', () => {
    expect(dashboardSrc).toContain("empty ? 'Empty Roster' : 'Active'")
    expect(dashboardSrc).toContain('>Your Classes</h2>')
    expect(dashboardSrc).toContain('Manage Classes <span')
  })
})

describe('T-157 — Reports (reports.jsx)', () => {
  it('title-cases Passing Rate and By Class (227)', () => {
    expect(reportsSrc).toContain('label="Passing Rate"')
    expect(reportsSrc).toContain('>By Class</h3>')
  })

  it('renames Not yet passing to Needs Improvement as owner decided (227)', () => {
    expect(reportsSrc).toContain('label="Needs Improvement"')
    expect(reportsSrc).not.toContain('label="Not yet passing"')
  })
})

describe('T-157 — Performance & Record metrics parity (228 & record.jsx)', () => {
  it('title-cases Class Average and Passing Rate in performance.jsx', () => {
    expect(perfSrc).toContain('label="Class Average"')
    expect(perfSrc).toContain('label="Passing Rate"')
  })

  it('title-cases cards in performance.jsx', () => {
    expect(perfSrc).toContain('title="Grade Distribution"')
    expect(perfSrc).toContain('title="Component Averages"')
    expect(perfSrc).toContain('title="Top Performers"')
  })

  it('title-cases Class Average and Passing Rate in record.jsx for screen parity', () => {
    expect(recordSrc).toContain('label="Class Average"')
    expect(recordSrc).toContain('label="Passing Rate"')
  })
})

describe('T-157 — Attendance & Record toolbar (229)', () => {
  it('title-cases By Day and Whole Term tabs in attendance.jsx', () => {
    expect(attendSrc).toContain("['day', 'By Day'], ['term', 'Whole Term']")
  })

  it('updates the day tooltip to name the renamed By Day tab', () => {
    expect(attendSrc).toContain('on the By Day tab')
    expect(attendSrc).not.toContain('on the By day tab')
  })

  it('title-cases All Saved in record.jsx', () => {
    expect(recordSrc).toContain("'All Saved'")
    expect(recordSrc).not.toContain("'All saved'")
  })
})

describe('T-157 — Profile / Account (account.jsx)', () => {
  it('title-cases Sign Out card heading (231)', () => {
    expect(accountSrc).toContain('>Sign Out</h2>')
    expect(accountSrc).not.toContain('>Sign out</h2>')
  })
})
