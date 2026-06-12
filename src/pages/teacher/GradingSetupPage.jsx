import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useQuery, useMutation } from '@tanstack/react-query'
import { doc, getDoc, setDoc } from 'firebase/firestore'
import { api } from '../../lib/api'
import { db } from '../../lib/firebase'
import { GRADING_MODES } from '../../lib/grading'
import { useAuth } from '../../context/useAuth'

function newRow() {
  return { id: null, name: '', weight_percent: '' }
}

function weightSum(rows) {
  return rows.reduce((sum, r) => sum + (parseFloat(r.weight_percent) || 0), 0)
}

function EditorCard({ title, hint, rows, setRows, addLabel }) {
  const sum = weightSum(rows)
  const balanced = Math.abs(sum - 100) < 0.001

  const update = (index, key, value) =>
    setRows(rows.map((r, i) => (i === index ? { ...r, [key]: value } : r)))

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-slate-800">{title}</h3>
          <p className="text-xs text-slate-400 mt-0.5">{hint}</p>
        </div>
        <span
          className={`rounded-full px-3 py-1 text-sm font-semibold ${
            balanced ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'
          }`}
        >
          {sum.toFixed(sum % 1 === 0 ? 0 : 2)}%
        </span>
      </div>

      <div className="mt-4 space-y-2">
        {rows.map((row, i) => (
          <div key={row.id ?? `new-${i}`} className="flex gap-2 items-center">
            <input
              placeholder="Name"
              value={row.name}
              onChange={(e) => update(i, 'name', e.target.value)}
              className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <input
              type="range"
              min="0"
              max="100"
              step="5"
              value={parseFloat(row.weight_percent) || 0}
              onChange={(e) => update(i, 'weight_percent', e.target.value)}
              className="w-28 accent-indigo-600"
            />
            <div className="relative">
              <input
                type="number"
                min="0"
                max="100"
                step="0.5"
                placeholder="0"
                value={row.weight_percent}
                onChange={(e) => update(i, 'weight_percent', e.target.value)}
                className="w-24 rounded-lg border border-slate-300 px-3 py-2 pr-7 text-sm text-right focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">%</span>
            </div>
            <button
              type="button"
              onClick={() => setRows(rows.filter((_, j) => j !== i))}
              disabled={rows.length === 1}
              title="Remove"
              className="text-slate-400 hover:text-red-600 disabled:opacity-30 px-1 text-lg leading-none"
            >
              ×
            </button>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={() => setRows([...rows, newRow()])}
        className="mt-3 text-sm text-indigo-600 font-medium hover:underline"
      >
        + {addLabel}
      </button>
    </div>
  )
}

/**
 * DepEd K-12 vs CHED tertiary calculation toggle (PREPARE.md §1.7).
 * Persisted on the Firestore gradebooks/{classId} doc, where the class
 * record will read it when computing finals via lib/grading.js.
 */
function GradingTypeSelector({ classId }) {
  const { profile } = useAuth()
  const [mode, setMode] = useState(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    getDoc(doc(db, 'gradebooks', classId)).then(
      (snap) => {
        if (!cancelled) setMode(snap.exists() ? (snap.data().grading_mode ?? 'deped_k12') : 'deped_k12')
      },
      () => {
        if (!cancelled) setMode('deped_k12')
      },
    )
    return () => {
      cancelled = true
    }
  }, [classId])

  async function select(value) {
    const previous = mode
    setMode(value)
    setSaving(true)
    setError(null)
    try {
      await setDoc(
        doc(db, 'gradebooks', classId),
        { grading_mode: value, teacher_id: profile.id },
        { merge: true },
      )
    } catch {
      setMode(previous)
      setError('Could not save the grading type. Check your connection and Firestore rules.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mt-6 bg-white rounded-xl border border-slate-200 p-5">
      <h3 className="font-semibold text-slate-800">Grading Type</h3>
      <p className="text-xs text-slate-400 mt-0.5">
        DepEd K-12 transmutes the weighted grade per DepEd Order No. 8, s. 2015; CHED modes
        report raw percentages or the 1.0–5.0 point scale.
      </p>
      <div className="flex flex-wrap gap-2 mt-3">
        {GRADING_MODES.map((m) => (
          <button
            key={m.value}
            type="button"
            onClick={() => select(m.value)}
            disabled={saving || mode === null}
            className={`rounded-lg border px-3 py-1.5 text-sm font-medium disabled:opacity-50 ${
              mode === m.value
                ? 'bg-indigo-600 border-indigo-600 text-white'
                : 'bg-white border-slate-300 text-slate-600 hover:border-indigo-400'
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>
      {error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mt-3">
          {error}
        </p>
      )}
    </div>
  )
}

function GradingSetupForm({ classId, setup, className }) {
  const [periods, setPeriods] = useState(setup.periods.length ? setup.periods : [newRow()])
  const [components, setComponents] = useState(
    setup.components.length ? setup.components : [newRow()],
  )
  const [configured, setConfigured] = useState(setup.configured)
  const [error, setError] = useState(null)
  const [saved, setSaved] = useState(false)

  const afterChange = (body) => {
    setPeriods(body.periods)
    setComponents(body.components)
    setConfigured(body.configured)
    setError(null)
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  const save = useMutation({
    mutationFn: () =>
      api(`/api/classes/${classId}/grading-setup`, {
        method: 'PUT',
        body: { periods, components },
      }),
    onSuccess: afterChange,
    onError: (err) => {
      setError(err.message)
      setSaved(false)
    },
  })

  const applyPreset = useMutation({
    mutationFn: (preset) =>
      api(`/api/classes/${classId}/grading-setup/preset`, { method: 'POST', body: { preset } }),
    onSuccess: afterChange,
    onError: (err) => setError(err.message),
  })

  return (
    <div className="max-w-4xl">
      <Link to={`/teacher/classes/${classId}`} className="text-sm text-indigo-600 hover:underline">
        ← Back to {className}
      </Link>
      <div className="flex items-start justify-between mt-2">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Grading Setup</h2>
          <p className="text-slate-500 mt-1">
            Define your grading periods and grade components. Each set must total 100%.
          </p>
        </div>
        <button
          onClick={() => save.mutate()}
          disabled={save.isPending}
          className="rounded-lg bg-indigo-600 text-white px-5 py-2 font-medium hover:bg-indigo-700 disabled:opacity-50"
        >
          {save.isPending ? 'Saving…' : 'Save setup'}
        </button>
      </div>

      <div className="mt-4 bg-indigo-50 border border-indigo-100 rounded-xl p-4">
        <p className="text-sm font-medium text-indigo-900">Quick start with a DepEd K-12 preset:</p>
        <div className="flex flex-wrap gap-2 mt-2">
          {setup.presets.map((p) => (
            <button
              key={p.key}
              onClick={() => {
                if (!configured || window.confirm('Replace your current setup with this preset?')) {
                  applyPreset.mutate(p.key)
                }
              }}
              disabled={applyPreset.isPending}
              className="rounded-lg bg-white border border-indigo-200 text-indigo-700 px-3 py-1.5 text-sm font-medium hover:bg-indigo-100 disabled:opacity-50"
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mt-4">
          {error}
        </p>
      )}
      {saved && (
        <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2 mt-4">
          Grading setup saved.
        </p>
      )}

      <GradingTypeSelector classId={classId} />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
        <EditorCard
          title="Grading Periods"
          hint="e.g. Quarters 1–4, or Prelim / Midterm / Finals"
          rows={periods}
          setRows={setPeriods}
          addLabel="Add period"
        />
        <EditorCard
          title="Grade Components"
          hint="e.g. Written Works, Performance Tasks, Quarterly Assessment"
          rows={components}
          setRows={setComponents}
          addLabel="Add component"
        />
      </div>
    </div>
  )
}

export default function GradingSetupPage() {
  const { classId } = useParams()

  const { data, isLoading, isError } = useQuery({
    queryKey: ['grading-setup', classId],
    queryFn: () => api(`/api/classes/${classId}/grading-setup`),
  })

  const { data: classData } = useQuery({
    queryKey: ['class', classId],
    queryFn: () => api(`/api/classes/${classId}`),
  })

  if (isLoading) return <p className="text-slate-400">Loading grading setup…</p>
  if (isError || !data) return <p className="text-red-600">Class not found.</p>

  return (
    <GradingSetupForm
      key={classId}
      classId={classId}
      setup={data}
      className={classData?.class?.name ?? 'class'}
    />
  )
}
