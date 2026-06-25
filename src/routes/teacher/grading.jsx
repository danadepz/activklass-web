import { useEffect, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { collection, doc, getDoc, getDocs, query, serverTimestamp, setDoc, where, writeBatch } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { api } from '@/lib/api'
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

function GlobalGradingForm({ setup, classes }) {
  const { profile } = useAuth()
  const queryClient = useQueryClient()
  const [periods, setPeriods] = useState(setup.periods?.length ? setup.periods : [newRow()])
  const [components, setComponents] = useState(setup.components?.length ? setup.components : [newRow()])
  const [gradingMode, setGradingMode] = useState(setup.grading_mode ?? 'deped_k12')
  const [selectedClassIds, setSelectedClassIds] = useState([])
  const [error, setError] = useState(null)
  const [saved, setSaved] = useState(false)

  const toggleClass = (id) => {
    setSelectedClassIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    )
  }

  async function persist(nextPeriods, nextComponents, nextMode) {
    if (!balanced(nextPeriods) || !balanced(nextComponents)) {
      throw new Error('Grading periods and components must each total 100%.')
    }

    const processedPeriods = withIds(nextPeriods)
    const processedComponents = withIds(nextComponents)

    // Save global preset
    await setDoc(doc(db, 'grading_presets', profile.id), {
      grading_mode: nextMode,
      periods: processedPeriods,
      components: processedComponents,
      updated_at: serverTimestamp(),
    })

    if (selectedClassIds.length > 0) {
      // 1. Sync classes SQLite
      await api('/api/grading-setup', {
        method: 'POST',
        body: {
          class_ids: selectedClassIds,
          periods: processedPeriods,
          components: processedComponents,
        },
      })

      // 2. Sync classes Firestore
      const batch = writeBatch(db)
      for (const cid of selectedClassIds) {
        const docRef = doc(db, 'gradebooks', cid)
        batch.set(docRef, {
          teacher_id: profile.id,
          grading_mode: nextMode,
          periods: processedPeriods.map(p => ({ ...p, locked: false })),
          components: processedComponents,
          configured: true,
          updated_at: serverTimestamp(),
        }, { merge: true })
      }
      await batch.commit()
    }

    queryClient.invalidateQueries({ queryKey: ['fs-grading-preset', profile.id] })
    for (const cid of selectedClassIds) {
      queryClient.invalidateQueries({ queryKey: ['fs-grading-setup', cid] })
      queryClient.invalidateQueries({ queryKey: ['fs-record', cid] })
    }
  }

  const flash = () => {
    setError(null)
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  const save = useMutation({
    mutationFn: () => persist(periods, components, gradingMode),
    onSuccess: flash,
    onError: (err) => {
      setError(err.message)
      setSaved(false)
    },
  })

  const applyPreset = useMutation({
    mutationFn: async (preset) => {
      const nextP = preset.periods.map((p) => ({ id: null, name: p[0], weight_percent: String(p[1]) }))
      const nextC = preset.components.map((c) => ({ id: null, name: c[0], weight_percent: String(c[1]) }))
      setPeriods(nextP)
      setComponents(nextC)
      await persist(nextP, nextC, gradingMode)
    },
    onSuccess: flash,
    onError: (err) => setError(err.message),
  })

  return (
    <div className="max-w-4xl pb-12">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-[clamp(26px,3.5vw,32px)]" style={{ ...serif, lineHeight: 1.1, letterSpacing: '-0.01em', margin: '0 0 4px', color: ink }}>
            Grade Config
          </h1>
          <p style={{ fontSize: 13.5, color: muted, margin: 0 }}>
            Define grading periods and components. Save as preset template and apply it to target classes.
          </p>
        </div>
        <button
          onClick={() => save.mutate()}
          disabled={save.isPending}
          className="transition hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed"
          style={btnPrimary}
        >
          {save.isPending ? 'Saving…' : 'Save & Sync'}
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
                if (window.confirm('Replace your current setup with this preset?')) {
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
      {saved && <Banner tone="ok">Grading setup saved and synced successfully.</Banner>}

      {/* Target Classes Selection */}
      <div className="mt-6" style={{ background: '#FFFFFF', border: `1px solid ${line}`, borderRadius: 16, padding: '20px 22px' }}>
        <h3 style={{ ...serif, fontSize: 18, color: ink, margin: '0 0 3px' }}>Target Classes</h3>
        <p style={{ fontSize: 12.5, color: muted, margin: '0 0 14px' }}>
          Select which classes to apply this configuration to on save.
        </p>
        <div className="flex flex-wrap gap-3 max-h-40 overflow-y-auto border border-slate-100 p-3 rounded-xl">
          {classes.length === 0 ? (
            <p style={{ fontSize: 13, color: faint, margin: 0 }}>No classes created yet.</p>
          ) : (
            classes.map((clazz) => {
              const checked = selectedClassIds.includes(clazz.id)
              return (
                <label
                  key={clazz.id}
                  className="flex items-center gap-2.5 px-3 py-2 border rounded-xl cursor-pointer hover:bg-slate-50 transition"
                  style={{
                    borderColor: checked ? gold : 'rgba(14,42,92,0.14)',
                    background: checked ? 'rgba(245,197,24,0.06)' : '#FFFFFF',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleClass(clazz.id)}
                    className="rounded text-indigo-600 focus:ring-indigo-500 h-4 w-4"
                  />
                  <span style={{ fontSize: 13, fontWeight: 600, color: ink }}>
                    {clazz.section} · {clazz.subject}
                  </span>
                </label>
              )
            })
          )}
        </div>
      </div>

      {/* Grading Type Selector */}
      <div className="mt-6" style={{ background: '#FFFFFF', border: `1px solid ${line}`, borderRadius: 16, padding: '20px 22px' }}>
        <h3 style={{ ...serif, fontSize: 18, color: ink, margin: '0 0 3px' }}>Grading Type</h3>
        <p style={{ fontSize: 12.5, color: muted, margin: '0 0 14px', maxWidth: 620 }}>
          DepEd K-12 transmutes the weighted grade per DepEd Order No. 8, s. 2015; CHED modes report raw
          percentages or the 1.0–5.0 point scale.
        </p>
        <div className="flex flex-wrap gap-3">
          {GRADING_MODES.map((m) => {
            const active = gradingMode === m.value
            return (
              <button
                key={m.value}
                type="button"
                onClick={() => setGradingMode(m.value)}
                className="transition hover:brightness-105"
                style={{
                  padding: '11px 18px', fontSize: 13, fontWeight: 700, fontFamily: sans, borderRadius: 11, cursor: 'pointer', textAlign: 'left',
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
      </div>

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

export default function GlobalGradingSetupPage() {
  const { profile } = useAuth()

  // Load all classes
  const { data: classes, isLoading: isClassesLoading } = useQuery({
    queryKey: ['fs-classes', profile?.id],
    queryFn: async () => {
      const snap = await getDocs(
        query(collection(db, 'classes'), where('teacher_id', '==', profile.id)),
      )
      return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
    },
    enabled: !!profile?.id,
  })

  // Load teacher global preset
  const { data: preset, isLoading: isPresetLoading } = useQuery({
    queryKey: ['fs-grading-preset', profile?.id],
    queryFn: async () => {
      const snap = await getDoc(doc(db, 'grading_presets', profile.id))
      if (!snap.exists()) return null
      return snap.data()
    },
    enabled: !!profile?.id,
  })

  if (isClassesLoading || isPresetLoading) return <p style={{ color: faint }}>Loading grading setup…</p>

  const initialSetup = preset || {
    periods: [
      { id: null, name: 'Quarter 1', weight_percent: '25' },
      { id: null, name: 'Quarter 2', weight_percent: '25' },
      { id: null, name: 'Quarter 3', weight_percent: '25' },
      { id: null, name: 'Quarter 4', weight_percent: '25' },
    ],
    components: [
      { id: null, name: 'Written Works', weight_percent: '40' },
      { id: null, name: 'Performance Tasks', weight_percent: '40' },
      { id: null, name: 'Quarterly Assessment', weight_percent: '20' },
    ],
    grading_mode: 'deped_k12',
  }

  return <GlobalGradingForm setup={initialSetup} classes={classes ?? []} />
}
