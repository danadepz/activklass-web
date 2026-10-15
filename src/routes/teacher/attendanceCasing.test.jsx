/**
 * T-181 (maykel_64440-288): Attendance: "Open attendance", "All saved", and "Save attendance" in Title Case.
 *
 * Screen: Teacher > Dashboard > Take Attendance (/teacher/attendance)
 * - Class card link: "Open attendance →" -> "Open Attendance →"
 *
 * Screen: Teacher > Classes > [Class] > Attendance (/teacher/classes/$classId/attendance)
 * - Save button (clean / initial): "All saved" -> "All Saved"
 * - Save button (dirty / modified): "Save attendance · N" -> "Save Attendance · N"
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

const read = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')
const attendanceIndexSrc = read('./attendance.jsx')
const classAttendanceSrc = read('./classes/$classId/attendance.jsx')

vi.mock('@/lib/firebase', () => ({ db: {}, storage: {} }))
vi.mock('firebase/firestore', () => ({
  collection: vi.fn(), doc: vi.fn(), getDoc: vi.fn(), getDocs: vi.fn(),
  query: vi.fn(), serverTimestamp: vi.fn(), setDoc: vi.fn(), updateDoc: vi.fn(), where: vi.fn(),
}))
vi.mock('@/lib/roster', () => ({ fetchUsersByIds: vi.fn() }))
vi.mock('@/lib/notifications', () => ({ notifyStudents: vi.fn() }))
vi.mock('@/lib/attendanceMirror', () => ({ syncAttendanceSummaries: vi.fn() }))
vi.mock('@/lib/schedule', () => ({ scheduleMeetings: vi.fn(() => []) }))
vi.mock('@/context/useAuth', () => ({ useAuth: () => ({ profile: { id: 'T1', role: 'teacher' } }) }))
vi.mock('@tanstack/react-query', async (importOriginal) => ({
  ...(await importOriginal()),
  useQuery: ({ queryKey }) => {
    if (queryKey?.[0] === 'fs-classes') {
      return {
        data: [{ id: 'C1', name: 'Math 10', subject: 'Math', students: ['S1'] }],
        isLoading: false,
        isError: false,
      }
    }
    if (queryKey?.[0] === 'fs-contests') {
      return {
        data: [],
        isLoading: false,
        isError: false,
      }
    }
    // fs-attendance
    return {
      data: { students: [], records: {} },
      isLoading: false,
      isError: false,
    }
  },
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}))
vi.mock('react-router-dom', async (importOriginal) => ({
  ...(await importOriginal()),
  useParams: () => ({ classId: 'C1' }),
}))

import AttendanceIndexPage from './attendance.jsx'
import ClassAttendancePage from './classes/$classId/attendance.jsx'

describe('T-181 — Attendance casing (/teacher/attendance and /teacher/classes/$classId/attendance)', () => {
  describe('Teacher attendance picker (/teacher/attendance)', () => {
    it('pins linkLabel="Open Attendance" in source', () => {
      expect(attendanceIndexSrc).toContain('linkLabel="Open Attendance"')
      expect(attendanceIndexSrc).not.toContain('linkLabel="Open attendance"')
    })

    it('renders "Open Attendance →" on the class picker card', () => {
      const html = renderToStaticMarkup(
        <MemoryRouter>
          <AttendanceIndexPage />
        </MemoryRouter>
      )
      expect(html).toContain('Open Attendance →')
      expect(html).not.toContain('Open attendance →')
    })
  })

  describe('Class attendance sheet (/teacher/classes/$classId/attendance)', () => {
    it('pins "All Saved" and "Save Attendance" in source', () => {
      expect(classAttendanceSrc).toContain("'All Saved'")
      expect(classAttendanceSrc).not.toContain("'All saved'")
      expect(classAttendanceSrc).toMatch(/Save Attendance(?:\$\{dirtyCount)/)
      expect(classAttendanceSrc).not.toMatch(/Save attendance(?:\$\{dirtyCount)/)
    })

    it('renders "All Saved" on clean attendance sheet button', () => {
      const html = renderToStaticMarkup(
        <MemoryRouter>
          <ClassAttendancePage />
        </MemoryRouter>
      )
      expect(html).toContain('All Saved')
      expect(html).not.toContain('All saved')
    })
  })
})
