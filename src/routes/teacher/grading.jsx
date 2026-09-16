import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { doc, getDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { api } from '@/lib/api'
import { syncEntries } from '@/lib/gradebook'
import {
  GRADING_MODES,
  GRADING_PRESETS,
  POINT_SCALE_DIRECTIONS,
  gradePolicy,
  pointScaleBands,
  rebalanceWeights,
  redistributeWeights,
  weightsValid,
} from '@/lib/grading'
import { passingPercentError } from '@/lib/validation'
import { describeFormula, fmtFinal, fmtPoint, namedRows, simulateGrade } from './gradePreview'
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

/* namedRows (./gradePreview.js): the rows that survive the save. withIds()
   drops anything without a name, so an unnamed row must not count toward the
   100% check either — every weight check below runs on those rows, not the
   raw ones, and so does the preview. */

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

function EditorCard({ title, hint, rows, setRows, addLabel, busy = false }) {
  // Badge reflects what would actually be saved, so it agrees with the check
  // in persist() rather than counting weights on unnamed rows.
  const counted = namedRows(rows)
  const sum = weightSum(counted)
  const ok = balanced(rows)
  const ignored = rows.length - counted.length

  /* Weights are reactive: setting one rescales the others so the card always
     totals 100 (rebalanceWeights in lib/grading.js). Names edit normally. */
  const update = (index, key, value) =>
    setRows(
      key === 'weight_percent'
        ? rebalanceWeights(rows, index, value)
        : rows.map((r, i) => (i === index ? { ...r, [key]: value } : r)),
    )

  return (
    <div style={{ background: '#FFFFFF', border: `1px solid ${line}`, borderRadius: 16, padding: '20px 22px' }}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 style={{ ...serif, fontSize: 18, color: ink, margin: '0 0 3px' }}>{title}</h3>
          <p style={{ fontSize: 12, color: faint, margin: 0 }}>{hint}</p>
        </div>
        <WeightBadge ok={ok}>{sum.toFixed(sum % 1 === 0 ? 0 : 2)}%</WeightBadge>
      </div>

      <p style={{ fontSize: 11.5, color: faint, margin: '6px 0 0' }}>
        Change one weight and the others rescale so the total stays 100%.
      </p>

      {ignored > 0 && (
        <p style={{ fontSize: 11.5, color: faint, margin: '6px 0 0' }}>
          {ignored} row{ignored === 1 ? '' : 's'} without a name {ignored === 1 ? 'is' : 'are'} not
          counted and will not be saved.
        </p>
      )}

      <div style={{ height: 1, background: 'rgba(14,42,92,0.06)', margin: '14px 0' }} />

      <div className="flex flex-col gap-2.5">
        {rows.map((row, i) => (
          /* Rows must never poke out of the card: the name input is the only
             piece allowed to shrink (minWidth: 0 beats the browser's built-in
             input minimum), the slider gives ground next, and the number box
             and × stay fixed. Before this, the × sat outside the card edge
             whenever the two-column grid left the card narrower than the
             fixed widths added up to. */
          <div key={row.id ?? `new-${i}`} className="flex items-center gap-2">
            <input
              className="ak-input"
              placeholder="Name"
              value={row.name}
              onChange={(e) => update(i, 'name', e.target.value)}
              style={{ ...fieldStyle, flex: '1 1 90px', minWidth: 0 }}
            />
            <input
              type="range"
              min="0"
              max="100"
              step="5"
              value={parseFloat(row.weight_percent) || 0}
              onChange={(e) => update(i, 'weight_percent', e.target.value)}
              style={{ flex: '0 1 112px', minWidth: 64, accentColor: navy }}
            />
            <div className="relative" style={{ flexShrink: 0 }}>
              <input
                className="ak-input"
                type="number"
                min="0"
                max="100"
                step="0.5"
                placeholder="0"
                value={row.weight_percent}
                onChange={(e) => update(i, 'weight_percent', e.target.value)}
                style={{ ...fieldStyle, width: 92, paddingRight: 26, textAlign: 'right' }}
              />
              <span style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', color: faint, fontSize: 13 }}>%</span>
            </div>
            <IconButton
              onClick={() => setRows(redistributeWeights(rows.filter((_, j) => j !== i)))}
              disabled={rows.length === 1 || busy}
              label="Remove"
              className="transition hover:text-[#C0392B] disabled:cursor-not-allowed"
              style={{ color: faint, fontSize: 18, flexShrink: 0, opacity: rows.length === 1 || busy ? 0.3 : 1 }}
            >
              ×
            </IconButton>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={() => setRows([...rows, newRow()])}
        disabled={busy}
        className="mt-3 transition hover:opacity-70 disabled:opacity-40 disabled:cursor-not-allowed"
        style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 700, fontFamily: sans, color: navy, background: 'none', border: 'none', cursor: busy ? 'not-allowed' : 'pointer', padding: 0 }}
      >
        <span style={{ color: gold }}>+</span> {addLabel}
      </button>
    </div>
  )
}

/*
 * What passes, per grading type (T-45). DepEd K-12 has nothing to set: DepEd
 * Order No. 8, s. 2015 fixes 75 on the transmuted grade. The CHED modes take a
 * passing score, and the point scale also takes its direction -- 1.0 highest
 * (standard) or 5.0 highest (reversed) -- with the ranges the choice produces
 * generated from lib/grading.js, the same function the record computes with,
 * so the table can never show a band the gradebook would not apply.
 */
function PassRules({ mode, passingPercent, setPassingPercent, direction, setDirection, busy }) {
  if (mode === 'deped_k12') {
    return (
      <p style={{ fontSize: 12.5, color: muted, margin: '14px 0 0' }}>
        DepEd K-12 passes at <strong style={{ color: ink }}>75</strong> on the transmuted grade
        (DepEd Order No. 8, s. 2015), so there is no passing score to set.
      </p>
    )
  }
  const error = passingPercentError(passingPercent)
  const policy = gradePolicy({ passing_percent: passingPercent, point_scale_direction: direction })
  const bands = pointScaleBands(policy)
  return (
    <div style={{ marginTop: 16, borderTop: '1px solid rgba(14,42,92,0.06)', paddingTop: 14 }}>
      <div className="flex flex-wrap items-start gap-x-8 gap-y-4">
        <label style={{ display: 'block' }}>
          <span style={{ display: 'block', fontSize: 12, fontWeight: 700, color: ink, marginBottom: 6 }}>Passing score</span>
          <span className="relative" style={{ display: 'inline-block' }}>
            <input
              className="ak-input"
              type="number"
              min="1"
              max="99"
              step="1"
              value={passingPercent}
              disabled={busy}
              onChange={(e) => setPassingPercent(e.target.value)}
              aria-invalid={Boolean(error)}
              style={{ ...fieldStyle, width: 96, paddingRight: 26, textAlign: 'right', borderColor: error ? red : undefined }}
            />
            <span style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', color: faint, fontSize: 13 }}>%</span>
          </span>
          <span style={{ display: 'block', fontSize: 11.5, color: error ? red : faint, marginTop: 5 }}>
            {error || 'The lowest weighted percent that passes.'}
          </span>
        </label>

        {mode === 'ched_point' && (
          <div>
            <span style={{ display: 'block', fontSize: 12, fontWeight: 700, color: ink, marginBottom: 6 }}>Point scale</span>
            <div className="flex flex-wrap gap-2">
              {POINT_SCALE_DIRECTIONS.map((d) => {
                const active = direction === d.value
                return (
                  <button
                    key={d.value}
                    type="button"
                    onClick={() => setDirection(d.value)}
                    disabled={busy}
                    className="transition hover:brightness-105 disabled:opacity-50 disabled:cursor-not-allowed"
                    style={{
                      padding: '9px 14px', fontSize: 12.5, fontWeight: 700, fontFamily: sans, borderRadius: 10, cursor: busy ? 'not-allowed' : 'pointer', textAlign: 'left',
                      ...(active
                        ? { color: navy, background: 'rgba(245,197,24,0.16)', border: `1.5px solid ${gold}` }
                        : { color: '#3A4A6B', background: '#FFFFFF', border: '1.5px solid rgba(14,42,92,0.14)' }),
                    }}
                  >
                    <div>{d.label}</div>
                    <div style={{ fontSize: 11, fontWeight: 500, color: muted, marginTop: 2 }}>{d.hint}</div>
                  </button>
                )
              })}
            </div>
          </div>
        )}
      </div>

      {mode === 'ched_point' && (
        <div className="overflow-x-auto" style={{ marginTop: 14 }}>
          <table style={{ borderCollapse: 'collapse', fontSize: 12.5, minWidth: 320 }} data-testid="point-scale-table">
            <thead>
              <tr style={{ color: muted, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                <th style={{ textAlign: 'left', padding: '4px 12px 6px 0', fontWeight: 700 }}>Weighted percent</th>
                <th style={{ textAlign: 'right', padding: '4px 12px 6px 0', fontWeight: 700 }}>Grade</th>
                <th style={{ textAlign: 'left', padding: '4px 0 6px', fontWeight: 700 }}></th>
              </tr>
            </thead>
            <tbody>
              {bands.map((b, i) => {
                const failing = i === bands.length - 1
                const lowestPass = i === bands.length - 2
                return (
                  <tr key={b.point} style={{ borderTop: '1px solid rgba(14,42,92,0.06)', color: failing ? red : ink }}>
                    <td style={{ padding: '5px 12px 5px 0', whiteSpace: 'nowrap' }}>
                      {failing ? `below ${b.to}` : `${b.from} and above`}
                    </td>
                    <td style={{ padding: '5px 12px 5px 0', textAlign: 'right', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                      {fmtPoint(b.point)}
                    </td>
                    <td style={{ padding: '5px 0', color: failing ? red : muted, fontSize: 11.5 }}>
                      {failing ? 'Failed' : lowestPass ? 'lowest passing grade' : i === 0 ? 'highest' : ''}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

/*
 * The Preview card (T-45 Tier 2): a read-only simulation of the setup above,
 * computed by simulateGrade (./gradePreview.js) -- the record's own function
 * on the typed numbers, so what it says is what the record will say.
 */
export function PreviewPanel({ components, mode, policy, initialSamples }) {
  const rows = namedRows(components)
  // Keyed by row position; a removed row shifts the ones after it, which a
  // simulation can live with. `initialSamples` exists for the test, which
  // renders static markup and cannot type.
  const [samples, setSamples] = useState(initialSamples ?? {})
  const sim = simulateGrade(components, samples, mode, policy)
  const formula = describeFormula(sim, mode, policy)

  return (
    <div className="mt-6" style={{ background: '#FFFFFF', border: `1px solid ${line}`, borderRadius: 16, padding: '20px 22px' }} data-testid="preview-panel">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 style={{ ...serif, fontSize: 18, color: ink, margin: '0 0 3px' }}>Preview</h3>
          <p style={{ fontSize: 12, color: faint, margin: 0, maxWidth: 560 }}>
            Type a sample percent per component to see the grade this setup gives for one grading period.
            Components left blank are not counted and the rest are re-weighted, as in the record.
          </p>
        </div>
        <span style={{ display: 'inline-flex', alignItems: 'center', padding: '4px 12px', fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', borderRadius: 999, color: muted, background: 'rgba(14,42,92,0.06)', border: `1px solid ${line}` }}>
          Simulation · nothing is saved
        </span>
      </div>

      <div style={{ height: 1, background: 'rgba(14,42,92,0.06)', margin: '14px 0' }} />

      {rows.length === 0 ? (
        <p style={{ fontSize: 13, color: faint, margin: 0 }}>Name at least one component above to preview a grade.</p>
      ) : (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          <div className="flex flex-col gap-2.5">
            {rows.map((row, i) => (
              <label key={row.id ?? `sample-${i}`} className="flex items-center gap-3">
                <span style={{ flex: '1 1 120px', minWidth: 0, fontSize: 13, color: ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {String(row.name).trim()}
                  <span style={{ color: faint }}> · {Number(row.weight_percent) || 0}%</span>
                </span>
                <span className="relative" style={{ flexShrink: 0 }}>
                  <input
                    className="ak-input"
                    type="number"
                    min="0"
                    max="100"
                    step="1"
                    placeholder="—"
                    aria-label={`Sample score for ${String(row.name).trim()}`}
                    value={samples[i] ?? ''}
                    onChange={(e) => setSamples((s) => ({ ...s, [i]: e.target.value }))}
                    style={{ ...fieldStyle, width: 88, paddingRight: 26, textAlign: 'right' }}
                  />
                  <span style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', color: faint, fontSize: 13 }}>%</span>
                </span>
              </label>
            ))}
          </div>

          <div style={{ background: 'rgba(14,42,92,0.04)', border: `1px solid ${line}`, borderRadius: 12, padding: '14px 16px' }} aria-live="polite">
            {sim.final == null ? (
              <p style={{ fontSize: 13, color: faint, margin: 0 }}>Type a sample score to see the grade.</p>
            ) : (
              <>
                <div className="flex items-baseline gap-3 flex-wrap">
                  <span style={{ ...serif, fontSize: 36, lineHeight: 1, color: sim.passed ? green : red }} data-testid="preview-final">
                    {fmtFinal(sim.final, mode)}
                  </span>
                  <WeightBadge ok={Boolean(sim.passed)}>{sim.passed ? 'Passed' : 'Failed'}</WeightBadge>
                  {mode === 'deped_k12' && sim.descriptor && (
                    <span style={{ fontSize: 12.5, color: muted }}>{sim.descriptor}</span>
                  )}
                </div>
                <div style={{ fontSize: 12, color: muted, marginTop: 6 }}>
                  Weighted percent {sim.initial}
                  {sim.weightUsed !== 100 && ` · ${sim.used.length} of ${rows.length} components counted`}
                </div>
                {formula && (
                  <ul style={{ margin: '10px 0 0', paddingLeft: 18, fontSize: 12.5, color: ink, lineHeight: 1.5 }}>
                    {formula.map((l) => (
                      <li key={l}>{l}</li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </div>
        </div>
      )}
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
  /* Pass mark + point-scale direction, seeded from the preset with the
     defaults filled (a preset saved before the fields existed reads 75 and
     1.0-is-highest). The percent is kept as the input's string so a teacher
     can clear the box and retype. */
  const savedPolicy = gradePolicy(setup)
  const [passingPercent, setPassingPercent] = useState(String(savedPolicy.passing_percent))
  const [scaleDirection, setScaleDirection] = useState(savedPolicy.point_scale_direction)
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
    /* The pass mark only matters in the CHED modes, and only those show the
       box -- so under DepEd an unfinished value is dropped rather than
       rejected, and the backend keeps whatever was stored. */
    const passError = passingPercentError(passingPercent)
    if (nextMode !== 'deped_k12' && passError) throw new Error(passError)

    const processedPeriods = withIds(nextPeriods)
    const processedComponents = withIds(nextComponents)

    /* One request; the backend does the whole save — the preset doc, the
       per-class SQLite rows, and the per-class gradebook docs. Those last two
       used to be written from here after the API answered, so a tab closed
       mid-save left the stores disagreeing. Now, once this request reaches
       the server, the save completes whether or not this page is still open;
       keepalive lets the browser finish sending it even on unload. */
    const res = await api('/api/grading-setup', {
      method: 'POST',
      keepalive: true,
      body: {
        class_ids: selectedClassIds,
        grading_mode: nextMode,
        periods: processedPeriods,
        components: processedComponents,
        // Stored beside the mode on the preset and on every applied
        // gradebook; the record, the reports and the student's screens all
        // read them back through gradePolicy (lib/grading.js).
        passing_percent: passError ? undefined : Number(passingPercent),
        point_scale_direction: scaleDirection,
      },
    })

    const skipped = res?.skipped ?? []
    const firestoreSynced = res?.firestore_synced !== false
    const skippedIds = new Set(skipped.map((s) => s.class_id))
    const applied = selectedClassIds.filter((cid) => !skippedIds.has(cid))

    /* New weights change every computed grade, and the teacher's grid
       recomputes from `assessments` on its own -- but a student reads only
       the derived `entries` doc (DATA-MODEL §1), which nobody rewrites unless
       we do it here. Without this the student keeps the old grade until some
       unrelated score edit happens to sync. Only when the gradebook docs
       actually updated: syncing off a stale gradebook would just re-stamp
       the old weights. */
    let entriesSynced = true
    if (firestoreSynced) {
      const results = await Promise.allSettled(applied.map((cid) => syncEntries(cid)))
      entriesSynced = results.every((r) => r.status === 'fulfilled')
    }

    queryClient.invalidateQueries({ queryKey: ['fs-grading-preset', profile.id] })
    for (const cid of selectedClassIds) {
      queryClient.invalidateQueries({ queryKey: ['fs-grading-setup', cid] })
      queryClient.invalidateQueries({ queryKey: ['fs-record', cid] })
    }

    return { skipped, requested: selectedClassIds.length, firestoreSynced, entriesSynced }
  }

  const flash = ({ skipped = [], requested = 0, firestoreSynced = true, entriesSynced = true } = {}) => {
    setError(null)
    if (!firestoreSynced) {
      // SQLite took the save but the cloud mirror did not — the one state the
      // teacher can fix themselves by saving again.
      reportError('Saved to the class records, but the cloud copy did not update. Save again to retry.')
      setSaved('')
      return
    }
    if (!entriesSynced) {
      reportError('Grading setup saved, but the grades students see were not refreshed. Save again to retry.')
      setSaved('')
      return
    }
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

  // Every button on the form keys off this: a second click mid-save would
  // race the request in flight (two saves, last-write-wins on the backend).
  const busy = save.isPending || applyPreset.isPending

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
        <Button onClick={() => save.mutate()} disabled={busy} radius={11}>
          {busy ? 'Saving…' : 'Save & Sync'}
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
              disabled={busy}
              className="transition hover:brightness-[0.99] disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ textAlign: 'left', background: '#FFFFFF', border: '1.5px solid rgba(14,42,92,0.14)', borderRadius: 12, padding: '14px 16px', cursor: busy ? 'not-allowed' : 'pointer', fontFamily: sans }}
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
                    disabled={busy}
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
                disabled={busy}
                className="transition hover:brightness-105 disabled:opacity-50 disabled:cursor-not-allowed"
                style={{
                  padding: '11px 18px', fontSize: 13, fontWeight: 700, fontFamily: sans, borderRadius: 11, cursor: busy ? 'not-allowed' : 'pointer', textAlign: 'left',
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
        <PassRules
          mode={gradingMode}
          passingPercent={passingPercent}
          setPassingPercent={setPassingPercent}
          direction={scaleDirection}
          setDirection={setScaleDirection}
          busy={busy}
        />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-2">
        <EditorCard
          title="Grading Periods"
          hint="e.g. Quarters 1–4, or Prelim / Midterm / Finals"
          rows={periods}
          setRows={setPeriods}
          addLabel="Add period"
          busy={busy}
        />
        <EditorCard
          title="Grade Components"
          hint="e.g. Written Works, Performance Tasks, Quarterly Assessment"
          rows={components}
          setRows={setComponents}
          addLabel="Add component"
          busy={busy}
        />
      </div>

      {/* Reads the unsaved form state on purpose: the point is to try a
          setup before saving it. */}
      <PreviewPanel
        components={components}
        mode={gradingMode}
        policy={gradePolicy({ passing_percent: passingPercent, point_scale_direction: scaleDirection })}
      />
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
