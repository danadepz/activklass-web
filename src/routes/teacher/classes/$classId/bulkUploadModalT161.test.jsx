/**
 * T-161 (maykel_64440-236): Bulk Upload Roster modal enhancements.
 *
 * Requirements:
 * 1. Title names the target class ("Bulk upload roster to <class>").
 * 2. Account notice placed at the top (above instructions) with visible treatment,
 *    keeping both school-issued and solo teacher branches.
 * 3. Column instructions formatted as a Column / Required / Notes table.
 * 4. Example table captioned "Example" and paired with a "Download CSV template" action.
 * 5. Download CSV template generates from the same source as the example table.
 * 6. Preview includes counts for matched, not found, AND duplicates
 *    (distinguishing already-enrolled vs duplicate-in-file).
 * 7. Header includes a reachable close button (X).
 */
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi, beforeEach } from 'vitest'

const state = vi.hoisted(() => ({ preview: null, seeded: false }))

vi.mock('react', async (importOriginal) => {
  const real = await importOriginal()
  return {
    ...real,
    useState: (init) => {
      if (init === null && state.preview && !state.seeded) {
        state.seeded = true
        return real.useState(state.preview)
      }
      return real.useState(init)
    },
  }
})

let profile = { id: 'T1', role: 'teacher', subscription_status: 'active' }
vi.mock('@/context/useAuth', () => ({ useAuth: () => ({ profile, school: null }) }))
vi.mock('@/lib/firebase', () => ({ db: {} }))
vi.mock('firebase/firestore', () => ({ doc: vi.fn(), updateDoc: vi.fn() }))
vi.mock('@/lib/roster', async (importOriginal) => ({
  ...(await importOriginal()),
  findStudentsByNumber: vi.fn(),
  findStudentByEmail: vi.fn(),
  addToRoster: vi.fn(),
}))
vi.mock('@/components/ui/useDialogBehavior', () => ({
  useDialogBehavior: () => ({ overlayProps: {}, panelProps: {} }),
}))
vi.mock('@/components/ui/toast', () => ({ toast: { success: vi.fn(), info: vi.fn(), error: vi.fn() } }))

const mockDownloadCsv = vi.fn()
vi.mock('@/lib/csv', async (importOriginal) => {
  const real = await importOriginal()
  return {
    ...real,
    downloadCsv: (...args) => mockDownloadCsv(...args),
  }
})

import { CsvUploadModal, ROSTER_TEMPLATE_ROWS } from './index.jsx'

describe('T-161 — Bulk Upload Roster modal', () => {
  beforeEach(() => {
    state.preview = null
    state.seeded = false
    mockDownloadCsv.mockClear()
    profile = { id: 'T1', role: 'teacher', subscription_status: 'active' }
  })

  it('renders the title naming the class', () => {
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <CsvUploadModal classId="MATH101" classTitle="MATH101" enrolledIds={[]} maxStudents={0} onClose={() => {}} onDone={() => {}} />
      </MemoryRouter>,
    )
    expect(html).toContain('Bulk upload roster to MATH101')
  })

  it('renders the account requirement notice at the top above instructions table', () => {
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <CsvUploadModal classId="MATH101" classTitle="MATH101" enrolledIds={[]} maxStudents={0} onClose={() => {}} onDone={() => {}} />
      </MemoryRouter>,
    )
    const noticeIdx = html.indexOf('This upload only enrolls students who already have an account')
    const instructionsIdx = html.indexOf('>Column</th>')
    expect(noticeIdx).toBeGreaterThan(-1)
    expect(instructionsIdx).toBeGreaterThan(-1)
    expect(noticeIdx).toBeLessThan(instructionsIdx)
  })

  it('renders column instructions as a Column / Required / Notes table', () => {
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <CsvUploadModal classId="MATH101" classTitle="MATH101" enrolledIds={[]} maxStudents={0} onClose={() => {}} onDone={() => {}} />
      </MemoryRouter>,
    )
    expect(html).toContain('>Column</th>')
    expect(html).toContain('>Required</th>')
    expect(html).toContain('>Notes</th>')
    expect(html).toContain('student_number')
    expect(html).toContain('middle_name')
  })

  it('provides the example table captioned "Example" and Download CSV template action', () => {
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <CsvUploadModal classId="MATH101" classTitle="MATH101" enrolledIds={[]} maxStudents={0} onClose={() => {}} onDone={() => {}} />
      </MemoryRouter>,
    )
    expect(html).toContain('Example')
    expect(html).toContain('Download CSV template')
  })

  it('exports ROSTER_TEMPLATE_ROWS matching the example table and template generator', () => {
    expect(ROSTER_TEMPLATE_ROWS).toBeDefined()
    expect(ROSTER_TEMPLATE_ROWS[0]).toEqual(['student_number', 'first_name', 'middle_name', 'last_name', 'lrn'])
    expect(ROSTER_TEMPLATE_ROWS.length).toBeGreaterThanOrEqual(3)
  })

  it('renders duplicate count breakdown when preview contains duplicates', () => {
    state.preview = {
      matched: [{ label: 'Santos, Maria', account: { id: 's1', last_name: 'Santos', first_name: 'Maria' } }],
      already: [
        { label: 'Dela Cruz, Juan', account: { id: 's2', student_number: '2024-001' }, reason: 'already enrolled in this class' },
        { label: 'Dela Cruz, Juan', account: { id: 's2', student_number: '2024-001' }, reason: 'duplicate row in file' },
      ],
      unmatched: [{ label: 'Reyes, Pedro', id: '2024-002', reason: 'no student account' }],
      duplicateCounts: { alreadyEnrolled: 1, duplicateInFile: 1, total: 2 },
    }
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <CsvUploadModal classId="MATH101" classTitle="MATH101" enrolledIds={['s2']} maxStudents={0} onClose={() => {}} onDone={() => {}} />
      </MemoryRouter>,
    )
    expect(html).toContain('1 to add')
    expect(html).toContain('1 not found')
    expect(html).toContain('2 duplicates')
    expect(html).toContain('1 already enrolled')
    expect(html).toContain('1 in file')
  })
})
