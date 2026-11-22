/**
 * The student's attendance log carries each day's session status, so the
 * forecast can count held sessions only (the teacher panel's rule) while the
 * log, tally and display rate still show every recorded mark (2026-11-23).
 */
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/firebase', () => ({ db: {} }))
vi.mock('firebase/firestore', async (importOriginal) => ({
  ...(await importOriginal()),
  collection: vi.fn(() => ({})),
  getDocs: vi.fn(async () => {
    const days = [
      { id: '2026-03-01', records: { S1: { status: 'present' } } },
      { id: '2026-03-02', records: { S1: { status: 'late' } } },
      { id: '2026-03-03', session_status: 'cancelled', records: { S1: { status: 'absent' } } },
      { id: '2026-03-04', session_status: 'rescheduled', records: { S1: { status: 'absent' } } },
      { id: '2026-03-05', records: { S2: { status: 'absent' } } },
    ]
    return { forEach: (fn) => days.forEach((d) => fn({ id: d.id, data: () => d })) }
  }),
}))

const { loadStudentAttendance } = await import('./studentData')
const { attendanceRateFromLog } = await import('./riskSignals')
const { sessionStatus } = await import('./attendanceSessions')

describe('loadStudentAttendance session status', () => {
  it('tags each day; display figures unchanged; the model rate counts held days only', async () => {
    const att = await loadStudentAttendance('c1', 'S1')
    expect(att.log.map((d) => `${d.date}:${d.session_status}`)).toEqual([
      '2026-03-04:rescheduled', '2026-03-03:cancelled', '2026-03-02:held', '2026-03-01:held',
    ])
    expect(att.tally).toEqual({ present: 1, late: 1, absent: 2, excused: 0 }) // every recorded mark, as before
    expect(att.rate).toBe(25) // display: present / all
    expect(attendanceRateFromLog(att.log.filter((r) => sessionStatus(r) === 'held'))).toBe(75) // (1 + 0.5) / 2
  })
})
