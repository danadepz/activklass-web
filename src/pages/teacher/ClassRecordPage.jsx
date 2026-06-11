import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../../lib/api'

/* Cell text → score entry. Number = graded, M = missing, X = excused, blank = not recorded. */
function parseCell(text, totalPoints) {
  const value = String(text ?? '').trim()
  if (value === '') return { status: 'none' }
  if (/^m$/i.test(value)) return { status: 'missing' }
  if (/^x$/i.test(value)) return { status: 'excused' }
  const num = Number(value)
  if (Number.isNaN(num)) return { error: `"${value}" is not a number, M, or X` }
  if (num < 0 || num > totalPoints) return { error: `Score must be 0–${totalPoints}` }
  return { status: 'graded', raw_score: num }
}

function cellText(score) {
  if (!score) return ''
  if (score.status === 'missing') return 'M'
  if (score.status === 'excused') return 'X'
  return String(score.raw_score ?? '')
}

function fmt(pct) {
  return pct === null || pct === undefined ? '—' : pct.toFixed(2).replace(/\.00$/, '')
}

const KIND_OPTIONS = ['activity', 'quiz', 'exam', 'contest', 'other']

function AddAssessmentModal({ classId, record, onClose, onSaved }) {
  const [form, setForm] = useState({
    title: '',
    component_id: record.components[0]?.id ?? '',
    kind: 'activity',
    total_points: '',
    date_given: '',
  })
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))

  async function submit(e) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      await api(`/api/classes/${classId}/assessments`, {
        method: 'POST',
        body: { ...form, grading_period_id: record.period.id },
      })
      onSaved()
    } catch (err) {
      setError(err.message)
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center px-4 z-10">
      <form onSubmit={submit} className="bg-white rounded-xl p-6 w-full max-w-md space-y-4">
        <h3 className="text-lg font-semibold text-slate-800">
          New Assessment — {record.period.name}
        </h3>
        {error && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
        )}
        <label className="block">
          <span className="text-sm font-medium text-slate-700">Title</span>
          <input
            required
            placeholder="e.g. Quiz 1 — Fractions"
            value={form.title}
            onChange={set('title')}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="text-sm font-medium text-slate-700">Component</span>
            <select
              value={form.component_id}
              onChange={set('component_id')}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              {record.components.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-sm font-medium text-slate-700">Type</span>
            <select
              value={form.kind}
              onChange={set('kind')}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 bg-white capitalize focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              {KIND_OPTIONS.map((k) => (
                <option key={k} value={k}>{k}</option>
              ))}
            </select>
          </label>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="text-sm font-medium text-slate-700">Total points</span>
            <input
              required
              type="number"
              min="0.5"
              step="0.5"
              value={form.total_points}
              onChange={set('total_points')}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-slate-700">Date given</span>
            <input
              type="date"
              value={form.date_given}
              onChange={set('date_given')}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </label>
        </div>
        <div className="flex gap-3 justify-end pt-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-300 px-4 py-2 text-slate-600 hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-indigo-600 text-white px-4 py-2 font-medium hover:bg-indigo-700 disabled:opacity-50"
          >
            {saving ? 'Adding…' : 'Add assessment'}
          </button>
        </div>
      </form>
    </div>
  )
}

function RecordGrid({ classId, record, refetch }) {
  const [dirty, setDirty] = useState({})
  const [dirtyOverrides, setDirtyOverrides] = useState({})
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)
  const [showAdd, setShowAdd] = useState(false)
  const locked = record.period.locked

  const byComponent = record.components.map((component) => ({
    ...component,
    assessments: record.assessments.filter((a) => a.component_id === component.id),
  }))
  const dirtyCount =
    Object.values(dirty).reduce((n, cells) => n + Object.keys(cells).length, 0) +
    Object.keys(dirtyOverrides).length

  const getCell = (assessmentId, studentId) =>
    dirty[assessmentId]?.[studentId] ?? cellText(record.scores[assessmentId]?.[studentId])

  const setCell = (assessmentId, studentId, value) =>
    setDirty((d) => ({
      ...d,
      [assessmentId]: { ...(d[assessmentId] ?? {}), [studentId]: value },
    }))

  const getOverride = (studentId) =>
    dirtyOverrides[studentId] ?? (record.grades[studentId]?.override != null
      ? String(record.grades[studentId].override)
      : '')

  async function saveAll() {
    setSaving(true)
    setError(null)
    try {
      for (const [assessmentId, cells] of Object.entries(dirty)) {
        const assessment = record.assessments.find((a) => a.id === assessmentId)
        const scores = []
        for (const [studentId, text] of Object.entries(cells)) {
          const parsed = parseCell(text, assessment.total_points)
          if (parsed.error) {
            throw new Error(`${assessment.title}: ${parsed.error}`)
          }
          scores.push({ student_id: studentId, ...parsed })
        }
        await api(`/api/classes/${classId}/assessments/${assessmentId}/scores`, {
          method: 'PUT',
          body: { scores },
        })
      }
      if (Object.keys(dirtyOverrides).length > 0) {
        const overrides = []
        for (const [studentId, text] of Object.entries(dirtyOverrides)) {
          const value = String(text).trim()
          if (value === '') {
            overrides.push({ student_id: studentId, grade: null })
            continue
          }
          const num = Number(value)
          if (Number.isNaN(num) || num < 0 || num > 100) {
            throw new Error(`Override must be a number between 0 and 100 (got "${value}")`)
          }
          overrides.push({ student_id: studentId, grade: num })
        }
        await api(`/api/classes/${classId}/periods/${record.period.id}/overrides`, {
          method: 'PUT',
          body: { overrides },
        })
      }
      setDirty({})
      setDirtyOverrides({})
      refetch()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  async function deleteAssessment(assessment) {
    if (!window.confirm(`Delete "${assessment.title}" and all its scores?`)) return
    try {
      await api(`/api/classes/${classId}/assessments/${assessment.id}`, { method: 'DELETE' })
      setDirty((d) => {
        const next = { ...d }
        delete next[assessment.id]
        return next
      })
      refetch()
    } catch (err) {
      setError(err.message)
    }
  }

  async function toggleLock() {
    const action = locked ? 'unlock' : 'lock'
    const warning = locked
      ? 'Unlock this period? Scores and overrides become editable again.'
      : 'Lock this period? Scores, assessments, and overrides become read-only until unlocked.'
    if (!window.confirm(warning)) return
    try {
      await api(`/api/classes/${classId}/periods/${record.period.id}/${action}`, { method: 'POST' })
      refetch()
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <>
      <div className="flex items-center justify-between mt-4">
        <p className="text-xs text-slate-400">
          Enter a score, <span className="font-semibold">M</span> for missing (counts as 0),{' '}
          <span className="font-semibold">X</span> for excused, or leave blank.
        </p>
        <div className="flex gap-2">
          <button
            onClick={toggleLock}
            className={`rounded-lg border px-4 py-2 text-sm font-medium ${
              locked
                ? 'border-amber-300 text-amber-700 bg-amber-50 hover:bg-amber-100'
                : 'border-slate-300 text-slate-600 hover:bg-slate-50'
            }`}
          >
            {locked ? '🔒 Unlock period' : 'Lock period'}
          </button>
          {!locked && (
            <>
              <button
                onClick={() => setShowAdd(true)}
                className="rounded-lg border border-indigo-200 text-indigo-700 px-4 py-2 text-sm font-medium hover:bg-indigo-50"
              >
                + Add assessment
              </button>
              <button
                onClick={saveAll}
                disabled={dirtyCount === 0 || saving}
                className="rounded-lg bg-indigo-600 text-white px-4 py-2 text-sm font-medium hover:bg-indigo-700 disabled:opacity-40"
              >
                {saving ? 'Saving…' : dirtyCount > 0 ? `Save ${dirtyCount} change${dirtyCount === 1 ? '' : 's'}` : 'All saved'}
              </button>
            </>
          )}
        </div>
      </div>

      {locked && (
        <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mt-3">
          This period is locked — grades are final and read-only. Unlock to make changes (audit-logged).
        </p>
      )}
      {error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mt-3">{error}</p>
      )}

      <div className="bg-white rounded-xl border border-slate-200 mt-3 overflow-x-auto">
        <table className="text-sm border-collapse min-w-full">
          <thead>
            <tr className="bg-slate-50">
              <th rowSpan={2} className="sticky left-0 bg-slate-50 px-4 py-2 text-left font-medium text-slate-600 border-b border-r border-slate-200 min-w-44">
                Student
              </th>
              {byComponent.map((component) => (
                <th
                  key={component.id}
                  colSpan={component.assessments.length + 1}
                  className="px-3 py-2 text-center font-semibold text-slate-700 border-b border-r border-slate-200"
                >
                  {component.name}{' '}
                  <span className="font-normal text-slate-400">({fmt(component.weight_percent)}%)</span>
                </th>
              ))}
              <th rowSpan={2} className="px-3 py-2 font-medium text-slate-500 border-b border-slate-200 min-w-20">
                Override
              </th>
              <th rowSpan={2} className="px-4 py-2 font-semibold text-slate-700 border-b border-slate-200">
                {record.period.name}
                <br />
                Grade
              </th>
            </tr>
            <tr className="bg-slate-50">
              {byComponent.flatMap((component) => [
                ...component.assessments.map((a) => (
                  <th key={a.id} className="px-2 py-1.5 border-b border-slate-200 font-medium text-slate-500 min-w-20">
                    <div className="flex items-center justify-center gap-1">
                      <span title={a.title} className="truncate max-w-28">{a.title}</span>
                      {!locked && (
                        <button
                          onClick={() => deleteAssessment(a)}
                          title="Delete assessment"
                          className="text-slate-300 hover:text-red-500"
                        >
                          ×
                        </button>
                      )}
                    </div>
                    <span className="text-xs text-slate-400 font-normal">/{fmt(a.total_points)}</span>
                  </th>
                )),
                <th key={`${component.id}-pct`} className="px-2 py-1.5 border-b border-r border-slate-200 text-xs font-semibold text-indigo-600 min-w-14">
                  %
                </th>,
              ])}
            </tr>
          </thead>
          <tbody>
            {record.students.length === 0 ? (
              <tr>
                <td colSpan={99} className="px-4 py-8 text-center text-slate-400">
                  No students enrolled yet —{' '}
                  <Link to={`/teacher/classes/${classId}`} className="text-indigo-600 hover:underline">
                    add students to the roster
                  </Link>
                  .
                </td>
              </tr>
            ) : (
              record.students.map((student) => {
                const grade = record.grades[student.student_id]
                const overrideDirty = dirtyOverrides[student.student_id] !== undefined
                return (
                  <tr key={student.student_id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/50">
                    <td className="sticky left-0 bg-white px-4 py-1.5 font-medium text-slate-700 border-r border-slate-200 whitespace-nowrap">
                      {student.last_name}, {student.first_name}
                    </td>
                    {byComponent.flatMap((component) => [
                      ...component.assessments.map((a) => {
                        const isDirty = dirty[a.id]?.[student.student_id] !== undefined
                        return (
                          <td key={a.id} className="px-1 py-1 text-center">
                            <input
                              value={getCell(a.id, student.student_id)}
                              onChange={(e) => setCell(a.id, student.student_id, e.target.value)}
                              disabled={locked}
                              className={`w-16 rounded-md border px-1 py-1 text-center text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-slate-50 disabled:text-slate-500 ${
                                isDirty ? 'border-amber-400 bg-amber-50' : 'border-slate-200'
                              }`}
                            />
                          </td>
                        )
                      }),
                      <td
                        key={`${component.id}-pct`}
                        className="px-2 py-1 text-center text-indigo-700 font-medium border-r border-slate-200"
                      >
                        {fmt(grade?.components?.[component.id])}
                      </td>,
                    ])}
                    <td className="px-1 py-1 text-center">
                      <input
                        value={getOverride(student.student_id)}
                        onChange={(e) =>
                          setDirtyOverrides((d) => ({ ...d, [student.student_id]: e.target.value }))
                        }
                        disabled={locked}
                        placeholder="—"
                        title="Type a grade (0–100) to override the computed grade; clear to restore"
                        className={`w-16 rounded-md border px-1 py-1 text-center text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-slate-50 disabled:text-slate-500 ${
                          overrideDirty ? 'border-amber-400 bg-amber-50' : 'border-slate-200'
                        }`}
                      />
                    </td>
                    <td
                      className="px-3 py-1 text-center font-bold text-slate-800"
                      title={
                        grade?.override != null
                          ? `Overridden (computed: ${fmt(grade?.period_grade)})`
                          : undefined
                      }
                    >
                      {fmt(grade?.grade)}
                      {grade?.override != null && <span className="text-amber-500">*</span>}
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      {dirtyCount > 0 && !locked && (
        <p className="text-xs text-amber-600 mt-2">
          Unsaved changes are highlighted. Computed grades update after saving. * = overridden grade.
        </p>
      )}

      {showAdd && (
        <AddAssessmentModal
          classId={classId}
          record={record}
          onClose={() => setShowAdd(false)}
          onSaved={() => {
            setShowAdd(false)
            refetch()
          }}
        />
      )}
    </>
  )
}

function SummaryView({ classId }) {
  const { data, isLoading } = useQuery({
    queryKey: ['final-grades', classId],
    queryFn: () => api(`/api/classes/${classId}/final-grades`),
  })

  if (isLoading) return <p className="text-slate-400 mt-6">Computing final grades…</p>
  if (!data?.configured) return <p className="text-slate-400 mt-6">Grading is not configured.</p>

  return (
    <div className="bg-white rounded-xl border border-slate-200 mt-4 overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-slate-50 text-left text-slate-500 border-b border-slate-200">
            <th className="px-4 py-2.5 font-medium">Student</th>
            {data.periods.map((p) => (
              <th key={p.id} className="px-4 py-2.5 font-medium text-center">
                {p.name} {p.locked && <span title="Locked">🔒</span>}
                <span className="block text-xs font-normal text-slate-400">{fmt(p.weight_percent)}%</span>
              </th>
            ))}
            <th className="px-4 py-2.5 font-semibold text-slate-700 text-center">Final Grade</th>
          </tr>
        </thead>
        <tbody>
          {data.students.map((student) => {
            const grades = data.grades[student.student_id]
            return (
              <tr key={student.student_id} className="border-b border-slate-100 last:border-0">
                <td className="px-4 py-2 font-medium text-slate-700 whitespace-nowrap">
                  {student.last_name}, {student.first_name}
                </td>
                {data.periods.map((p) => {
                  const cell = grades?.periods?.[p.id]
                  return (
                    <td
                      key={p.id}
                      className="px-4 py-2 text-center text-slate-700"
                      title={cell?.override != null ? `Overridden (computed: ${fmt(cell?.computed)})` : undefined}
                    >
                      {fmt(cell?.grade)}
                      {cell?.override != null && <span className="text-amber-500">*</span>}
                    </td>
                  )
                })}
                <td className="px-4 py-2 text-center font-bold text-slate-800">
                  {fmt(grades?.final_grade)}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

export default function ClassRecordPage() {
  const { classId } = useParams()
  const queryClient = useQueryClient()
  const [tab, setTab] = useState(null) // period id, 'summary', or null = first period

  const { data: classData } = useQuery({
    queryKey: ['class', classId],
    queryFn: () => api(`/api/classes/${classId}`),
  })

  const periodId = tab === 'summary' ? null : tab
  const { data: record, isLoading, isError } = useQuery({
    queryKey: ['record', classId, periodId],
    queryFn: () =>
      api(`/api/classes/${classId}/record${periodId ? `?period_id=${periodId}` : ''}`),
  })

  const refetch = () => {
    queryClient.invalidateQueries({ queryKey: ['record', classId] })
    queryClient.invalidateQueries({ queryKey: ['final-grades', classId] })
  }

  if (isLoading) return <p className="text-slate-400">Loading class record…</p>
  if (isError || !record) return <p className="text-red-600">Class not found.</p>

  return (
    <div>
      <Link to={`/teacher/classes/${classId}`} className="text-sm text-indigo-600 hover:underline">
        ← Back to {classData?.class?.name ?? 'class'}
      </Link>
      <h2 className="text-2xl font-bold text-slate-800 mt-2">Class Record</h2>

      {!record.configured ? (
        <div className="bg-white rounded-xl border border-slate-200 p-10 mt-6 text-center">
          <p className="text-slate-500">
            Set up grading periods and components before recording scores.
          </p>
          <Link
            to={`/teacher/classes/${classId}/grading`}
            className="inline-block mt-3 rounded-lg bg-indigo-600 text-white px-4 py-2 font-medium hover:bg-indigo-700"
          >
            Open Grading Setup
          </Link>
        </div>
      ) : (
        <>
          <div className="flex gap-1 mt-4 border-b border-slate-200">
            {record.periods.map((p) => (
              <button
                key={p.id}
                onClick={() => setTab(p.id)}
                className={`px-4 py-2 text-sm font-medium rounded-t-lg border border-b-0 ${
                  tab !== 'summary' && p.id === record.period.id
                    ? 'bg-white border-slate-200 text-indigo-700'
                    : 'bg-slate-100 border-transparent text-slate-500 hover:text-slate-700'
                }`}
              >
                {p.name} {p.locked && '🔒'}
              </button>
            ))}
            <button
              onClick={() => setTab('summary')}
              className={`px-4 py-2 text-sm font-medium rounded-t-lg border border-b-0 ml-auto ${
                tab === 'summary'
                  ? 'bg-white border-slate-200 text-indigo-700'
                  : 'bg-slate-100 border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              Summary
            </button>
          </div>
          {tab === 'summary' ? (
            <SummaryView classId={classId} />
          ) : (
            <RecordGrid
              key={`${classId}-${record.period.id}-${record.period.locked}`}
              classId={classId}
              record={record}
              refetch={refetch}
            />
          )}
        </>
      )}
    </div>
  )
}
