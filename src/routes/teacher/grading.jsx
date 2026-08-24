import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { doc, getDoc, serverTimestamp, setDoc, writeBatch } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { api } from '@/lib/api'
import { GRADING_MODES, GRADING_PRESETS, weightsValid } from '@/lib/grading'
import { useAuth } from '@/context/useAuth'
import { ArrowRight } from '@/components/icons'
import Button, { GoldArrowDot, IconButton } from '@/components/ui/Button'
import { navy, ink, gold, muted, faint, green, red, line, serif, sansFamily as sans } from '@/theme'
import { useTeacherClasses } from '@/hooks/useTeacherClasses'
import { confirmDialog } from '@/components/ui/dialogs'
import { toast } from '@/components/ui/toast'

const fieldStyle = {
  padding: '10px 12px', fontSize: 13, fontFamily: sans, color: ink, background: '#FFFFFF',
  border: '1.5px solid rgba(14,42,92,0.14)', borderRadius: 9, transition: 'border-color 0.15s, box-shadow 0.15s',
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

/* A GRADING_PRESETS row -> an editable form row.
   Preset entries are objects ({ name, weight_percent }). Reading them as
   tuples (p[0]/p[1]) is what crashed "Quick-start with a preset": name came
   back undefined and withIds() below calls .trim() on it. One converter now,
   used by both the preset buttons and the first-run default. */
function presetRows(rows) {
  return (rows ?? []).map((r) => ({
    id: null,
    name: r.name,
    weight_percent: String(r.weight_percent),
  }))
}

// Same coercion weightsValid uses, so the badge total can never disagree with
// the check that gates the save.
function weightSum(rows) {
  return rows.reduce((sum, r) => sum + (Number(r.weight_percent) || 0), 0)
}

/* Rows that survive the save. withIds() drops anything without a name, so an
   unnamed row must not count toward the 100% check either — otherwise you can
   park 20% on a nameless row, pass validation, and save a config that really
   only totals 80%. Every weight check below runs on these rows, not the raw ones. */
function namedRows(rows) {
  return rows.filter((r) => String(r.name ?? '').trim())
}

/* The 100% rule has exactly one definition: weightsValid in lib/grading.js.
   It used to be restated here and again inside EditorCard, which is how the
   lib copy drifted into a float-equality bug nobody noticed — it was dead. */
function balanced(rows) {
  return weightsValid(namedRows(rows))
}

/* Why a selected class did not get the setup. The API skips both cases on
   purpose, so these are explanations rather than errors -- but they have to
   reach the teacher, because the class they picked is not configured. */
const SKIP_REASONS = {
  locked: 'a grading period is already locked',
  not_found: 'the class could not be found',
}

function describeSkips(skipped, classes) {
  const nameOf = (id) => {
    const match = classes.find((c) => c.id === id)
    return match ? `${match.section} · ${match.subject}` : id
  }
  return skipped
    .map((s) => `${nameOf(s.class_id)} (${SKIP_REASONS[s.reason] ?? s.reason})`)
    .join(', ')
}

function withIds(rows, extraKeys = []) {
  return namedRows(rows)
    .map((r) => {
      const out = { id: r.id || newId(), name: String(r.name).trim(), weight_percent: Number(r.weight_percent) || 0 }
      for (const k of extraKeys) out[k] = r[k] ?? false
      return out
    })
}

function EditorCard({ title, hint, rows, setRows, addLabel }) {
  // Badge reflects what would actually be saved, so it agrees with the check
  // in persist() rather than counting weights on unnamed rows.
  const counted = namedRows(rows)
  const sum = weightSum(counted)
  const ok = balanced(rows)
  const ignored = rows.length - counted.length

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

      {ignored > 0 && (
        <p style={{ fontSize: 11.5, color: faint, margin: '6px 0 0' }}>
          {ignored} row{ignored === 1 ? '' : 's'} without a name {ignored === 1 ? 'is' : 'are'} not
          counted and will not be saved.
        </p>
      )}

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
            <IconButton
              onClick={() => setRows(rows.filter((_, j) => j !== i))}
              disabled={rows.length === 1}
              label="Remove"
              className="transition hover:text-[#C0392B] disabled:cursor-not-allowed"
              style={{ color: faint, fontSize: 18, opacity: rows.length === 1 ? 0.3 : 1 }}
            >
              ×
            </IconButton>
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

function GlobalGradingForm({ setup, classes, focusClassId }) {
  const { profile } = useAuth()
  const queryClient = useQueryClient()
  /* Reached from a class ("Open Grading Setup" on Class Record or Performance)
     means that class is the one they came to configure, so tick it rather than
     making them find it in the list they just came from. Resolved against their
     own classes so a stale or hand-typed id cannot preselect something the API
     would only skip. */
  const focusClass = focusClassId ? classes.find((c) => c.id === focusClassId) : null
  const [periods, setPeriods] = useState(setup.periods?.length ? setup.periods : [newRow()])
  const [components, setComponents] = useState(setup.components?.length ? setup.components : [newRow()])
  const [gradingMode, setGradingMode] = useState(setup.grading_mode ?? 'deped_k12')
  const [selectedClassIds, setSelectedClassIds] = useState(focusClass ? [focusClass.id] : [])
  const [error, setError] = useState(null)
  // The message itself, not a flag: what synced varies per save, and the fixed
  // "saved and synced successfully" line was printed even when the API had
  // applied the setup to none of the selected classes.
  const [saved, setSaved] = useState('')

  /* Banner and Save button are both near the top here, so the banner is
     usually in view -- but a partial sync is the one message the teacher has to
     act on, and the toast holds until dismissed rather than depending on where
     the page happens to be scrolled. */
  const reportError = (message) => {
    setError(message)
    toast.error(message)
  }

  const toggleClass = (id) => {
    setSelectedClassIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    )
  }

  async function persist(nextPeriods, nextComponents, nextMode) {
    if (!balanced(nextPeriods) || !balanced(nextComponents)) {
      throw new Error('Every weight must be above 0%, and each group must total 100%.')
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

    let skipped = []
    if (selectedClassIds.length > 0) {
      // 1. Sync classes SQLite
      const res = await api('/api/grading-setup', {
        method: 'POST',
        body: {
          class_ids: selectedClassIds,
          periods: processedPeriods,
          components: processedComponents,
        },
      })
      skipped = res?.skipped ?? []

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

    return { skipped, requested: selectedClassIds.length }
  }

  const flash = ({ skipped = [], requested = 0 } = {}) => {
    setError(null)
    if (skipped.length) {
      // Left on screen. A partial sync is something the teacher has to act on,
      // and a banner that clears itself after 2.5s is one they can miss.
      reportError(
        `Preset saved, but ${skipped.length} of ${requested} `
        + `${requested === 1 ? 'class was' : 'classes were'} not updated: `
        + `${describeSkips(skipped, classes)}.`,
      )
      setSaved('')
      return
    }
    setSaved(
      requested
        ? `Grading setup saved and applied to ${requested} ${requested === 1 ? 'class' : 'classes'}.`
        : 'Preset saved. Tick target classes below to apply it to a class.',
    )
    setTimeout(() => setSaved(''), 2500)
  }

  const save = useMutation({
    mutationFn: () => persist(periods, components, gradingMode),
    onSuccess: flash,
    onError: (err) => {
      reportError(err.message)
      setSaved('')
    },
  })

  const applyPreset = useMutation({
    mutationFn: async (preset) => {
      const nextP = presetRows(preset.periods)
      const nextC = presetRows(preset.components)
      setPeriods(nextP)
      setComponents(nextC)
      return persist(nextP, nextC, gradingMode)
    },
    onSuccess: flash,
    onError: (err) => reportError(err.message),
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
          {focusClass && (
            <p style={{ fontSize: 13, color: muted, margin: '6px 0 0' }}>
              <strong style={{ color: ink }}>{focusClass.section} · {focusClass.subject}</strong>
              {' '}is ticked below — saving applies this setup to it.
            </p>
          )}
          {focusClassId && !focusClass && (
            <p style={{ fontSize: 13, color: red, margin: '6px 0 0' }}>
              That class is not in your list, so nothing was preselected.
            </p>
          )}
        </div>
        <Button onClick={() => save.mutate()} disabled={save.isPending} radius={11}>
          {save.isPending ? 'Saving…' : 'Save & Sync'}
          <GoldArrowDot>
            <ArrowRight className="h-3 w-3" />
          </GoldArrowDot>
        </Button>
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
              onClick={async () => {
                if (await confirmDialog({
                  title: `Apply the "${p.label}" preset?`,
                  message: 'Your current periods and components are replaced by this preset. Grades already recorded are not affected.',
                  confirmLabel: 'Apply preset',
                })) {
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
      {saved && <Banner tone="ok">{saved}</Banner>}

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
  // Present under /teacher/classes/:classId/grading, absent under /teacher/grading.
  const { classId } = useParams()

  // Load all classes
  const { data: classes, isLoading: isClassesLoading } = useTeacherClasses()

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

  /* First-run default is the DepEd K-12 preset itself, not a second copy of it.
     The copy that used to live here said 40/40/20; DepEd Order No. 8 s. 2015
     is 30/50/20, which is what lib/grading.js has always used. Deriving it
     means the button and the default can no longer disagree. */
  const depedPreset = GRADING_PRESETS.find((p) => p.key === 'deped_k12') ?? GRADING_PRESETS[0]
  const initialSetup = preset || {
    periods: presetRows(depedPreset.periods),
    components: presetRows(depedPreset.components),
    grading_mode: 'deped_k12',
  }

  /* Keyed on the class so navigating straight from one class's grading setup to
     another re-seeds the ticked box; without it the form stays mounted and keeps
     the first class selected. */
  return (
    <GlobalGradingForm
      key={classId ?? 'global'}
      setup={initialSetup}
      classes={classes ?? []}
      focusClassId={classId}
    />
  )
}
