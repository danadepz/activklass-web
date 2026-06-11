import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../../lib/api'

const STATUSES = [
  { key: 'present', label: 'Present', short: 'P', active: 'bg-green-600 text-white border-green-600', count: 'text-green-700' },
  { key: 'late', label: 'Late', short: 'L', active: 'bg-amber-500 text-white border-amber-500', count: 'text-amber-600' },
  { key: 'absent', label: 'Absent', short: 'A', active: 'bg-red-600 text-white border-red-600', count: 'text-red-600' },
  { key: 'excused', label: 'Excused', short: 'E', active: 'bg-sky-600 text-white border-sky-600', count: 'text-sky-600' },
]

function todayIso() {
  return new Date().toISOString().slice(0, 10)
}

function AttendanceSheet({ classId, day, sheet, refetch }) {
  // dirty: {studentId: {status, remarks}} — status 'none' clears the record
  const [dirty, setDirty] = useState({})
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)

  const current = (sid) => {
    if (dirty[sid]) return dirty[sid]
    const record = sheet.records[sid]
    return record ? { status: record.status, remarks: record.remarks ?? '' } : { status: 'none', remarks: '' }
  }

  const setEntry = (sid, entry) => {
    setDirty((d) => ({ ...d, [sid]: entry }))
  }

  const toggle = (sid, status) => {
    const entry = current(sid)
    setEntry(sid, { ...entry, status: entry.status === status ? 'none' : status })
  }

  const markAllPresent = () => {
    const next = {}
    for (const s of sheet.students) {
      const entry = current(s.student_id)
      if (entry.status === 'none') next[s.student_id] = { ...entry, status: 'present' }
    }
    setDirty((d) => ({ ...d, ...next }))
  }

  const dirtyCount = Object.keys(dirty).length

  async function save() {
    setSaving(true)
    setError(null)
    try {
      await api(`/api/classes/${classId}/attendance`, {
        method: 'PUT',
        body: {
          date: day,
          entries: Object.entries(dirty).map(([student_id, entry]) => ({
            student_id,
            status: entry.status,
            remarks: entry.remarks,
          })),
        },
      })
      setDirty({})
      refetch()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <div className="flex items-center justify-between mt-4">
        <button
          onClick={markAllPresent}
          className="rounded-lg border border-green-200 text-green-700 px-4 py-2 text-sm font-medium hover:bg-green-50"
        >
          Mark all present
        </button>
        <button
          onClick={save}
          disabled={dirtyCount === 0 || saving}
          className="rounded-lg bg-indigo-600 text-white px-4 py-2 text-sm font-medium hover:bg-indigo-700 disabled:opacity-40"
        >
          {saving ? 'Saving…' : dirtyCount > 0 ? `Save ${dirtyCount} change${dirtyCount === 1 ? '' : 's'}` : 'All saved'}
        </button>
      </div>

      {error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mt-3">{error}</p>
      )}

      <div className="bg-white rounded-xl border border-slate-200 mt-3 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 text-left text-slate-500 border-b border-slate-200">
              <th className="px-4 py-2.5 font-medium">Student</th>
              <th className="px-4 py-2.5 font-medium">Status</th>
              <th className="px-4 py-2.5 font-medium">Remarks</th>
              <th className="px-4 py-2.5 font-medium text-center" title="Totals: Present / Late / Absent / Excused">
                P / L / A / E
              </th>
            </tr>
          </thead>
          <tbody>
            {sheet.students.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-slate-400">
                  No students enrolled yet —{' '}
                  <Link to={`/teacher/classes/${classId}`} className="text-indigo-600 hover:underline">
                    add students to the roster
                  </Link>
                  .
                </td>
              </tr>
            ) : (
              sheet.students.map((student) => {
                const sid = student.student_id
                const entry = current(sid)
                const totals = sheet.summary[sid] ?? {}
                const isDirty = dirty[sid] !== undefined
                return (
                  <tr key={sid} className={`border-b border-slate-100 last:border-0 ${isDirty ? 'bg-amber-50/50' : ''}`}>
                    <td className="px-4 py-2 font-medium text-slate-700 whitespace-nowrap">
                      {student.last_name}, {student.first_name}
                    </td>
                    <td className="px-4 py-2">
                      <div className="flex gap-1">
                        {STATUSES.map((s) => (
                          <button
                            key={s.key}
                            onClick={() => toggle(sid, s.key)}
                            title={s.label}
                            className={`w-9 h-8 rounded-lg border text-sm font-semibold transition ${
                              entry.status === s.key
                                ? s.active
                                : 'border-slate-200 text-slate-400 hover:border-slate-300'
                            }`}
                          >
                            {s.short}
                          </button>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-2">
                      <input
                        value={entry.remarks ?? ''}
                        onChange={(e) => setEntry(sid, { ...entry, remarks: e.target.value })}
                        placeholder="—"
                        disabled={entry.status === 'none'}
                        className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-slate-50"
                      />
                    </td>
                    <td className="px-4 py-2 text-center whitespace-nowrap text-xs font-medium">
                      {STATUSES.map((s, i) => (
                        <span key={s.key}>
                          {i > 0 && <span className="text-slate-300"> / </span>}
                          <span className={s.count}>{totals[s.key] ?? 0}</span>
                        </span>
                      ))}
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>
    </>
  )
}

export default function AttendancePage() {
  const { classId } = useParams()
  const queryClient = useQueryClient()
  const [day, setDay] = useState(todayIso())

  const { data: classData } = useQuery({
    queryKey: ['class', classId],
    queryFn: () => api(`/api/classes/${classId}`),
  })

  const { data: sheet, isLoading, isError } = useQuery({
    queryKey: ['attendance', classId, day],
    queryFn: () => api(`/api/classes/${classId}/attendance?date=${day}`),
  })

  const refetch = () => queryClient.invalidateQueries({ queryKey: ['attendance', classId] })

  return (
    <div className="max-w-4xl">
      <Link to={`/teacher/classes/${classId}`} className="text-sm text-indigo-600 hover:underline">
        ← Back to {classData?.class?.name ?? 'class'}
      </Link>
      <div className="flex items-center justify-between mt-2">
        <h2 className="text-2xl font-bold text-slate-800">Attendance</h2>
        <input
          type="date"
          value={day}
          max={todayIso()}
          onChange={(e) => e.target.value && setDay(e.target.value)}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
      </div>

      {isLoading ? (
        <p className="text-slate-400 mt-6">Loading attendance…</p>
      ) : isError || !sheet ? (
        <p className="text-red-600 mt-6">Class not found.</p>
      ) : (
        <AttendanceSheet
          key={`${classId}-${day}-${JSON.stringify(sheet.records)}`}
          classId={classId}
          day={day}
          sheet={sheet}
          refetch={refetch}
        />
      )}
    </div>
  )
}
