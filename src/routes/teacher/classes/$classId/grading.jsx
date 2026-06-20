import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { GRADING_MODES, GRADING_PRESETS } from '@/lib/grading'
import { useAuth } from '@/context/useAuth'
import { ArrowRight } from '@/components/icons'

const navy = '#0E2A5C'
const navyDeep = '#061840'
const ink = '#0A1733'
const gold = '#F5C518'
const muted = '#6A7A95'
const faint = '#9AA6BD'
const green = '#1F8A5B'
const red = '#C0392B'
const line = 'rgba(14,42,92,0.08)'
const serif = { fontFamily: "'DM Serif Display', Georgia, serif" }
const sans = "'Plus Jakarta Sans', sans-serif"

const fieldStyle = {
  padding: '10px 12px', fontSize: 13, fontFamily: sans, color: ink, background: '#FFFFFF',
  border: '1.5px solid rgba(14,42,92,0.14)', borderRadius: 9, transition: 'border-color 0.15s, box-shadow 0.15s',
}
const iconBtn = { color: faint, background: 'none', border: 'none', cursor: 'pointer', padding: '2px 6px', fontSize: 18, lineHeight: 1 }
const btnPrimary = {
  display: 'inline-flex', alignItems: 'center', gap: 9, padding: '12px 20px', fontSize: 14,
  fontWeight: 700, fontFamily: sans, color: '#FAFAF6', background: navy, border: 'none',
  borderRadius: 11, cursor: 'pointer', boxShadow: `0 3px 0 ${navyDeep}`,
}

function GoldArrow() {
  return (
    <span style={{ display: 'inline-grid', placeItems: 'center', width: 20, height: 20, borderRadius: '50%', background: gold, color: navy }}>
      <ArrowRight className="h-3 w-3" />
    </span>
  )
}

function Banner({ tone, children }) {
  const t =
    tone === 'ok'
      ? { color: green, bg: 'rgba(31,138,91,0.08)', border: 'rgba(31,138,91,0.35)' }
      : { color: red, bg: 'rgba(192,57,43,0.07)', border: 'rgba(192,57,43,0.3)' }
  return (
    <p className="mt-4" style={{ fontSize: 13, color: t.color, background: t.bg, border: `1px solid ${t.border}`, borderRadius: 10, padding: '10px 12px' }}>
      {children}
    </p>
  )
}

function WeightBadge({ ok, children }) {
  return (
    <span
      style={{
        display: 'inline-flex', alignItems: 'center', padding: '4px 12px', fontSize: 12, fontWeight: 700, borderRadius: 999,
        ...(ok
          ? { color: green, background: 'rgba(31,138,91,0.10)', border: '1px solid rgba(31,138,91,0.4)' }
          : { color: red, background: 'rgba(192,57,43,0.08)', border: '1px solid rgba(192,57,43,0.35)' }),
      }}
    >
      {children}
    </span>
  )
}

const newId = () =>
  globalThis.crypto?.randomUUID?.() ?? `id-${Date.now()}-${Math.random().toString(36).slice(2)}`

function newRow() {
  return { id: null, name: '', weight_percent: '' }
}

function weightSum(rows) {
  return rows.reduce((sum, r) => sum + (parseFloat(r.weight_percent) || 0), 0)
}

function balanced(rows) {
  return Math.abs(weightSum(rows) - 100) < 0.01
}

function withIds(rows, extraKeys = []) {
  return rows
    .filter((r) => r.name.trim())
    .map((r) => {
      const out = { id: r.id || newId(), name: r.name.trim(), weight_percent: Number(r.weight_percent) || 0 }
      for (const k of extraKeys) out[k] = r[k] ?? false
      return out
    })
}

function EditorCard({ title, hint, rows, setRows, addLabel }) {
  const sum = weightSum(rows)
  const ok = Math.abs(sum - 100) < 0.01

  const update = (index, key, value) =>
    setRows(rows.map((r, i) => (i === index ? { ...r, [key]: value } : r)))

  return (
    <div style={{ background: '#FFFFFF', border: `1px solid ${line}`, borderRadius: 16, padding: '20px 22px' }}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 style={{ ...serif, fontSize: 18, color: ink, margin: '0 0 3px' }}>{title}</h3>
          <p style={{ fontSize: 12, color: faint, margin: 0 }}>{hint}</p>
        </div>
        <WeightBadge ok={ok}>{sum.toFixed(sum % 1 === 0 ? 0 : 2)}%</WeightBadge>
      </div>

      <div style={{ height: 1, background: 'rgba(14,42,92,0.06)', margin: '14px 0' }} />

      <div className="flex flex-col gap-2.5">
        {rows.map((row, i) => (
          <div key={row.id ?? `new-${i}`} className="flex items-center gap-2.5">
            <input
              className="ak-input"
              placeholder="Name"
              value={row.name}
              onChange={(e) => update(i, 'name', e.target.value)}
              style={{ ...fieldStyle, flex: 1 }}
            />
            <input
              type="range"
              min="0"
              max="100"
              step="5"
              value={parseFloat(row.weight_percent) || 0}
              onChange={(e) => update(i, 'weight_percent', e.target.value)}
              style={{ width: 112, accentColor: navy }}
            />
            <div className="relative">
              <input
                className="ak-input"
                type="number"
                min="0"
                max="100"
                step="0.5"
                placeholder="0"
                value={row.weight_percent}
                onChange={(e) => update(i, 'weight_percent', e.target.value)}
                style={{ ...fieldStyle, width: 88, paddingRight: 26, textAlign: 'right' }}
              />
              <span style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', color: faint, fontSize: 13 }}>%</span>
            </div>
            <button
              type="button"
              onClick={() => setRows(rows.filter((_, j) => j !== i))}
              disabled={rows.length === 1}
              title="Remove"
              className="transition hover:text-[#C0392B] disabled:cursor-not-allowed"
              style={{ ...iconBtn, opacity: rows.length === 1 ? 0.3 : 1 }}
            >
              ×
            </button>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={() => setRows([...rows, newRow()])}
        className="mt-3 transition hover:opacity-70"
        style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 700, fontFamily: sans, color: navy, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
      >
        <span style={{ color: gold }}>+</span> {addLabel}
      </button>
    </div>
  )
}

/**
 * DepEd K-12 vs CHED tertiary calculation toggle (PREPARE.md §1.7).
 * Persisted on the Firestore gradebooks/{classId} doc, where the class
 * record reads it when computing finals via lib/grading.js.
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

  const disabled = saving || mode === null

  return (
    <div className="mt-6" style={{ background: '#FFFFFF', border: `1px solid ${line}`, borderRadius: 16, padding: '20px 22px' }}>
      <h3 style={{ ...serif, fontSize: 18, color: ink, margin: '0 0 3px' }}>Grading Type</h3>
      <p style={{ fontSize: 12.5, color: muted, margin: '0 0 14px', maxWidth: 620 }}>
        DepEd K-12 transmutes the weighted grade per DepEd Order No. 8, s. 2015; CHED modes report raw
        percentages or the 1.0–5.0 point scale.
      </p>
      <div className="flex flex-wrap gap-3">
        {GRADING_MODES.map((m) => {
          const active = mode === m.value
          return (
            <button
              key={m.value}
              type="button"
              onClick={() => select(m.value)}
              disabled={disabled}
              className="transition hover:brightness-105 disabled:cursor-not-allowed"
              style={{
                padding: '11px 18px', fontSize: 13, fontWeight: 700, fontFamily: sans, borderRadius: 11, cursor: 'pointer', textAlign: 'left',
                opacity: disabled ? 0.6 : 1,
                ...(active
                  ? { color: navy, background: 'rgba(245,197,24,0.16)', border: `1.5px solid ${gold}` }
                  : { color: '#3A4A6B', background: '#FFFFFF', border: '1.5px solid rgba(14,42,92,0.14)' }),
              }}
            >
              {m.label}
            </button>
          )
        })}
      </div>
      {error && <Banner tone="err">{error}</Banner>}
    </div>
  )
}

function GradingSetupForm({ classId, setup }) {
  const { profile } = useAuth()
  const queryClient = useQueryClient()
  const [periods, setPeriods] = useState(setup.periods.length ? setup.periods : [newRow()])
  const [components, setComponents] = useState(
    setup.components.length ? setup.components : [newRow()],
  )
  const [error, setError] = useState(null)
  const [saved, setSaved] = useState(false)

  async function persist(nextPeriods, nextComponents) {
    if (!balanced(nextPeriods) || !balanced(nextComponents)) {
      throw new Error('Grading periods and components must each total 100%.')
    }
    await setDoc(
      doc(db, 'gradebooks', classId),
      {
        teacher_id: profile.id,
        periods: withIds(nextPeriods, ['locked']),
        components: withIds(nextComponents),
        configured: true,
        updated_at: serverTimestamp(),
      },
      { merge: true },
    )
    queryClient.invalidateQueries({ queryKey: ['fs-grading-setup', classId] })
    queryClient.invalidateQueries({ queryKey: ['fs-record', classId] })
  }

  const flash = () => {
    setError(null)
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  const save = useMutation({
    mutationFn: () => persist(periods, components),
    onSuccess: flash,
    onError: (err) => {
      setError(err.message)
      setSaved(false)
    },
  })

  const applyPreset = useMutation({
    mutationFn: async (preset) => {
      setPeriods(preset.periods.map((p) => ({ ...p, id: null })))
      setComponents(preset.components.map((c) => ({ ...c, id: null })))
      await persist(preset.periods, preset.components)
    },
    onSuccess: flash,
    onError: (err) => setError(err.message),
  })

  return (
    <div className="max-w-4xl">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-[clamp(26px,3.5vw,32px)]" style={{ ...serif, lineHeight: 1.1, letterSpacing: '-0.01em', margin: '0 0 4px', color: ink }}>
            Grading Setup
          </h1>
          <p style={{ fontSize: 13.5, color: muted, margin: 0 }}>
            Define your grading periods and grade components. Each set must total 100%.
          </p>
        </div>
        <button
          onClick={() => save.mutate()}
          disabled={save.isPending}
          className="transition hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed"
          style={btnPrimary}
        >
          {save.isPending ? 'Saving…' : 'Save setup'}
          <GoldArrow />
        </button>
      </div>

      <div className="mt-4" style={{ background: 'rgba(14,42,92,0.04)', border: `1px solid ${line}`, borderRadius: 16, padding: '16px 18px' }}>
        <div className="flex items-center gap-2" style={{ marginBottom: 12 }}>
          <span style={{ color: gold }}>✦</span>
          <span style={{ fontSize: 12, color: muted, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Quick-start with a preset</span>
        </div>
        <div className="flex flex-wrap gap-3">
          {GRADING_PRESETS.map((p) => (
            <button
              key={p.key}
              onClick={() => {
                if (!setup.configured || window.confirm('Replace your current setup with this preset?')) {
                  applyPreset.mutate(p)
                }
              }}
              disabled={applyPreset.isPending}
              className="transition hover:brightness-[0.99] disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ textAlign: 'left', background: '#FFFFFF', border: '1.5px solid rgba(14,42,92,0.14)', borderRadius: 12, padding: '14px 16px', cursor: 'pointer', fontFamily: sans }}
            >
              <div style={{ fontSize: 14, fontWeight: 800, color: ink, marginBottom: 4 }}>{p.label}</div>
              <div style={{ fontSize: 12, color: muted, lineHeight: 1.4 }}>
                {p.periods.length} period{p.periods.length === 1 ? '' : 's'} · {p.components.length} component{p.components.length === 1 ? '' : 's'}
              </div>
            </button>
          ))}
        </div>
      </div>

      {error && <Banner tone="err">{error}</Banner>}
      {saved && <Banner tone="ok">Grading setup saved.</Banner>}

      <GradingTypeSelector classId={classId} />

      <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-2">
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
    queryKey: ['fs-grading-setup', classId],
    queryFn: async () => {
      const snap = await getDoc(doc(db, 'gradebooks', classId))
      const d = snap.exists() ? snap.data() : {}
      return {
        periods: d.periods ?? [],
        components: d.components ?? [],
        configured: !!d.configured,
      }
    },
  })

  if (isLoading) return <p style={{ color: faint }}>Loading grading setup…</p>
  if (isError || !data) return <p style={{ color: red }}>Class not found.</p>

  return <GradingSetupForm key={classId} classId={classId} setup={data} />
}
