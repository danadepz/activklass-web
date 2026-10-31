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
  GRADING_STRUCTURES,
  LAB,
  LAB_COMPONENT_PRESET,
  LECTURE,
  LECTURE_LAB,
  POINT_SCALE_DIRECTIONS,
  componentTrack,
  gradePolicy,
  labWeightError,
  pointScaleBands,
  redistributeWeights,
  weightsValid,
} from '@/lib/grading'
import { passingPercentError } from '@/lib/validation'
import {
  TEMPLATE_SCOPES,
  countClassesUsing,
  createTemplate,
  deleteTemplate,
  describeTemplate,
  duplicateTemplate,
  listTemplates,
  setupFromTemplate,
  templateFromSetup,
  updateTemplate,
} from '@/lib/gradingTemplates'
import { fmtFinal, fmtPoint, namedRows, previewWarnings, simulateAllPeriods } from './gradePreview'
import { useAuth } from '@/context/useAuth'
import { ArrowRight } from '@/components/icons'
import Button, { GoldArrowDot, IconButton } from '@/components/ui/Button'
import { navy, ink, gold, muted, faint, green, red, line, serif, sansFamily as sans } from '@/theme'
import { useTeacherClasses } from '@/hooks/useTeacherClasses'
import { confirmDialog, promptDialog } from '@/components/ui/dialogs'
import { toast } from '@/components/ui/toast'

const fieldStyle = {
  padding: '10px 12px', fontSize: 13, fontFamily: sans, color: ink, background: '#FFFFFF',
  border: '1.5px solid rgba(14,42,92,0.14)', borderRadius: 9, transition: 'border-color 0.15s, box-shadow 0.15s',
}

/* The chip-style choice button the Grading Type, point scale and course
   structure selectors all use. It existed three times inline before the
   structure selector would have made it four. */
function ChoiceButton({ active, disabled, onClick, label, hint, testId }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      data-testid={testId}
      className="transition hover:brightness-105 disabled:opacity-50 disabled:cursor-not-allowed"
      style={{
        padding: '11px 18px', fontSize: 13, fontWeight: 700, fontFamily: sans, borderRadius: 11,
        cursor: disabled ? 'not-allowed' : 'pointer', textAlign: 'left',
        ...(active
          ? { color: navy, background: 'rgba(245,197,24,0.16)', border: `1.5px solid ${gold}` }
          : { color: '#3A4A6B', background: '#FFFFFF', border: '1.5px solid rgba(14,42,92,0.14)' }),
      }}
    >
      <div>{label}</div>
      {hint && <div style={{ fontSize: 11, fontWeight: 500, color: muted, marginTop: 2 }}>{hint}</div>}
    </button>
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

const WEIGHT_BADGE_PALETTE = {
  ok: { color: green, background: 'rgba(31,138,91,0.10)', border: '1px solid rgba(31,138,91,0.4)' },
  warn: { color: '#8A6400', background: 'rgba(245,197,24,0.16)', border: '1px solid rgba(245,197,24,0.6)' },
  bad: { color: red, background: 'rgba(192,57,43,0.08)', border: '1px solid rgba(192,57,43,0.35)' },
}

function WeightBadge({ tone = 'ok', children }) {
  return (
    <span
      style={{
        display: 'inline-flex', alignItems: 'center', padding: '4px 12px', fontSize: 12, fontWeight: 700, borderRadius: 999,
        ...WEIGHT_BADGE_PALETTE[tone],
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
    track: componentTrack(r),
    /* A template-required component: the teacher may change its weight but
       not delete it or rename it away, or the laboratory half silently stops
       being the thing the template promised. */
    required: Boolean(r.required),
  }))
}

/* Saved components split into the two editors. A component with no track is a
   lecture component (lib/grading.js), so a gradebook saved before laboratory
   grading existed loads entirely into the lecture card. */
const rowsForTrack = (rows, track) =>
  (rows ?? []).filter((r) => componentTrack(r) === track)

// Same coercion weightsValid uses, so the badge total can never disagree with
// the check that gates the save.
const round2 = (n) => Math.round(n * 100) / 100

function weightSum(rows) {
  return rows.reduce((sum, r) => sum + (Number(r.weight_percent) || 0), 0)
}

// Whole percents print bare, halves and other fractions keep two decimals —
// the same rule the badge total always used, now shared with the
// remaining/over amounts beside it.
function fmtPct(n) {
  return n.toFixed(n % 1 === 0 ? 0 : 2)
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

/* T-152 (andecobs-218): the Target Classes row used to read
   `{section} · {subject}` -- subject is the long free-text description, which
   is what broke the tester's layout. Reads education level · section ·
   subject code instead (subject code is what he meant by "Subject"), and
   drops a missing segment -- and its separator -- rather than printing a
   hole like "· 5-Diamond ·". */
function classLabel(clazz) {
  return [clazz.education_level, clazz.section, clazz.subject_code]
    .map((v) => String(v ?? '').trim())
    .filter(Boolean)
    .join(' · ')
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

function withIds(rows, extraKeys = [], track = null) {
  return namedRows(rows)
    .map((r) => {
      const out = { id: r.id || newId(), name: String(r.name).trim(), weight_percent: Number(r.weight_percent) || 0 }
      /* The id is what a track, a quiz mapping and a score record all hang
         off; it is generated once and kept, so renaming "Lab Exercise" moves
         nothing and a laboratory component can never be mistaken for a
         lecture one that happens to share a label. */
      if (track) out.track = track
      if (r.required) out.required = true
      for (const k of extraKeys) out[k] = r[k] ?? false
      return out
    })
}

function EditorCard({ title, hint, rows, setRows, addLabel, busy = false, onSave }) {
  // Badge reflects what would actually be saved, so it agrees with the check
  // in persist() rather than counting weights on unnamed rows.
  const counted = namedRows(rows)
  const sum = weightSum(counted)
  const ok = balanced(rows)
  const ignored = rows.length - counted.length
  const tone = ok ? 'ok' : sum > 100 ? 'bad' : 'warn'

  // Every weight is typed, not dragged into place — no row's change ever
  // touches another row's value. The one place weights still move each
  // other is the explicit "Split evenly" button below.
  const update = (index, key, value) =>
    setRows(rows.map((r, i) => (i === index ? { ...r, [key]: value } : r)))

  /* A template-required row keeps its name and its place; its weight is still
     the teacher's to set. Enforced again in persist(), since disabling an
     input is a hint, not a rule. */
  const removable = rows.filter((r) => !r.required).length

  return (
    <div style={{ background: '#FFFFFF', border: `1px solid ${line}`, borderRadius: 16, padding: '20px 22px' }}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 style={{ ...serif, fontSize: 18, color: ink, margin: '0 0 3px' }}>{title}</h3>
          <p style={{ fontSize: 12, color: faint, margin: 0 }}>{hint}</p>
        </div>
        <WeightBadge tone={tone}>
          {ok
            ? `${fmtPct(sum)}%`
            : sum > 100
              ? `${fmtPct(sum)}% · ${fmtPct(sum - 100)}% over`
              : `${fmtPct(sum)}% · ${fmtPct(100 - sum)}% remaining`}
        </WeightBadge>
      </div>

      <p style={{ fontSize: 11.5, color: faint, margin: '6px 0 0' }}>
        Enter weights manually. Total must equal 100% to save.
      </p>

      {rows.some((r) => r.required) && (
        <p style={{ fontSize: 11.5, color: faint, margin: '6px 0 0' }}>
          Greyed rows are required by this grading template — set their weights, but they cannot be
          renamed or removed. Add optional components alongside them.
        </p>
      )}

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
             input minimum); the number box and × stay fixed. Before this, the
             × sat outside the card edge whenever the two-column grid left the
             card narrower than the fixed widths added up to. */
          <div key={row.id ?? `new-${i}`} className="flex items-center gap-2">
            <input
              className="ak-input"
              placeholder="Name"
              value={row.name}
              onChange={(e) => update(i, 'name', e.target.value)}
              readOnly={!!row.required}
              title={row.required ? 'Required by this grading template — its weight can change, its name cannot.' : undefined}
              style={{
                ...fieldStyle, flex: '1 1 90px', minWidth: 0,
                ...(row.required ? { background: 'rgba(14,42,92,0.04)', color: muted } : null),
              }}
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
              onClick={() => setRows(rows.filter((_, j) => j !== i))}
              disabled={row.required || removable === 0 || (rows.length === 1) || busy}
              label="Remove"
              title={row.required ? 'Required by this grading template.' : 'Remove'}
              className="transition hover:text-[#C0392B] disabled:cursor-not-allowed"
              style={{ color: faint, fontSize: 18, flexShrink: 0, opacity: row.required || rows.length === 1 || busy ? 0.3 : 1 }}
            >
              ×
            </IconButton>
          </div>
        ))}
      </div>

      <div className="mt-3 flex items-center gap-4">
        <button
          type="button"
          onClick={() => setRows([...rows, newRow()])}
          disabled={busy}
          className="transition hover:opacity-70 disabled:opacity-40 disabled:cursor-not-allowed"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 700, fontFamily: sans, color: navy, background: 'none', border: 'none', cursor: busy ? 'not-allowed' : 'pointer', padding: 0 }}
        >
          <span style={{ color: gold }}>+</span> {addLabel}
        </button>

        {/* Convenience only -- the one place this card still moves more than
            one row's weight at once, and only on a click the teacher asked
            for, not as a side effect of typing. */}
        <button
          type="button"
          onClick={() => setRows(redistributeWeights(rows))}
          disabled={busy || rows.length === 0}
          className="transition hover:opacity-70 disabled:opacity-40 disabled:cursor-not-allowed"
          style={{ fontSize: 13, fontWeight: 700, fontFamily: sans, color: muted, background: 'none', border: 'none', cursor: busy ? 'not-allowed' : 'pointer', padding: 0 }}
        >
          Split evenly
        </button>
      </div>

      {onSave && (
        /* This card's own Save & Sync -- it still saves the whole grading
           setup (periods, components, passing score, target classes), the
           same single request the top button sends. The backend's
           /api/grading-setup always needs both groups together, so there is
           no such thing as saving just this card; the button lives here
           only so the action sits beside the weights a teacher just
           changed, instead of a scroll away. */
        <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid rgba(14,42,92,0.06)', display: 'flex', justifyContent: 'flex-end' }}>
          <Button onClick={onSave} disabled={busy} radius={11}>
            {busy ? 'Saving…' : 'Save & Sync'}
            <GoldArrowDot>
              <ArrowRight className="h-3 w-3" />
            </GoldArrowDot>
          </Button>
        </div>
      )}
    </div>
  )
}

/*
 * What passes, per grading type (T-45). DepEd K-12 has nothing to set: DepEd
 * Order No. 015, s. 2026 fixes 75 on the transmuted grade. The CHED modes take a
 * passing score, and the point scale also takes its direction -- 1.0 highest
 * (standard) or 5.0 highest (reversed) -- with the ranges the choice produces
 * generated from lib/grading.js, the same function the record computes with,
 * so the table can never show a band the gradebook would not apply.
 */
function PassRules({ mode, passingPercent, setPassingPercent, direction, setDirection, busy }) {
  if (mode === 'deped_k12') {
    return (
      <p style={{ fontSize: 12.5, color: muted, margin: '14px 0 0' }}>
        Passing score is fixed at <strong style={{ color: ink }}>75</strong> following DepEd guidelines
        (Order No. 015, s. 2026), so there is no passing score to set.
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

/* One period's column in the simulator: its sample inputs and its result. */
function PreviewPeriod({ period, mode, labOn, onSample, samples }) {
  const lecture = period.contributions.filter((c) => c.track !== LAB)
  const lab = period.contributions.filter((c) => c.track === LAB)
  const groups = labOn ? [['Lecture', lecture], ['Laboratory', lab]] : [[null, period.contributions]]

  return (
    <div style={{ border: `1px solid ${line}`, borderRadius: 12, padding: '14px 16px', background: '#FFFFFF' }}>
      <div className="flex flex-wrap items-baseline justify-between gap-2" style={{ marginBottom: 10 }}>
        <span style={{ fontSize: 14, fontWeight: 800, color: ink }}>{period.name}</span>
        <span style={{ fontSize: 11.5, color: faint }}>{fmtPct(period.weight)}% of the course</span>
      </div>

      {groups.map(([label, rows]) => (
        <div key={label ?? 'all'} style={{ marginBottom: 8 }}>
          {label && rows.length > 0 && (
            <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: muted, margin: '6px 0 4px' }}>
              {label}
            </div>
          )}
          {rows.map((c) => (
            <label key={c.id} className="flex items-center gap-2" style={{ marginBottom: 5 }}>
              <span style={{ flex: '1 1 90px', minWidth: 0, fontSize: 12.5, color: ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {c.name}
                <span style={{ color: faint }}> · {fmtPct(c.weight)}%</span>
              </span>
              <span className="relative" style={{ flexShrink: 0 }}>
                <input
                  className="ak-input"
                  type="number"
                  min="0"
                  max="100"
                  step="1"
                  placeholder="—"
                  aria-label={`Sample score for ${c.name} in ${period.name}`}
                  value={samples?.[c.id.slice(1)] ?? ''}
                  onChange={(e) => onSample(Number(c.id.slice(1)), e.target.value)}
                  style={{ ...fieldStyle, width: 78, padding: '7px 22px 7px 8px', textAlign: 'right' }}
                />
                <span style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', color: faint, fontSize: 12 }}>%</span>
              </span>
            </label>
          ))}
        </div>
      ))}

      {/* This period's result: the two track halves, then the combined grade. */}
      <div style={{ borderTop: '1px solid rgba(14,42,92,0.06)', marginTop: 8, paddingTop: 10 }} aria-live="polite">
        {period.countedCount === 0 ? (
          <p style={{ fontSize: 12, color: faint, margin: 0 }}>No samples typed — this period is left out.</p>
        ) : (
          <>
            {labOn && (
              <div style={{ fontSize: 12, color: muted, marginBottom: 6, lineHeight: 1.5 }}>
                Lecture{' '}
                <strong style={{ color: period.tracks?.lecture == null ? faint : ink }}>
                  {period.tracks?.lecture == null ? 'not yet graded' : period.tracks.lecture}
                </strong>{' '}
                × {fmtPct(round2(period.tracks?.lecture_weight_percent ?? 0))}%
                {' · '}Laboratory{' '}
                <strong style={{ color: period.tracks?.lab == null ? faint : ink }}>
                  {period.tracks?.lab == null ? 'not yet graded' : period.tracks.lab}
                </strong>{' '}
                × {fmtPct(round2(period.tracks?.lab_weight_percent ?? 0))}%
              </div>
            )}
            <div className="flex items-baseline gap-2 flex-wrap">
              <span style={{ ...serif, fontSize: 26, lineHeight: 1, color: period.passed ? green : red }}>
                {fmtFinal(period.final, mode)}
              </span>
              <span style={{ fontSize: 11.5, color: muted }}>
                {labOn ? 'combined' : 'period grade'}
                {mode !== 'ched_percentage' && period.initial != null && ` · raw ${period.initial}`}
              </span>
            </div>
            {mode === 'deped_k12' && period.descriptor && (
              <div style={{ fontSize: 11.5, color: muted, marginTop: 3 }}>{period.descriptor}</div>
            )}
            {period.countedCount < period.componentCount && (
              <div style={{ fontSize: 11, color: '#8A6400', marginTop: 4 }}>
                {period.countedCount} of {period.componentCount} components counted — the rest are re-weighted.
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

/*
 * The Preview card: a read-only simulation of the WHOLE course -- every
 * configured grading period, each one's lecture and laboratory halves, and
 * the overall grade the student would be given.
 *
 * It computes nothing itself. `simulateAllPeriods` (./gradePreview.js) runs
 * the record's own `computeFinalGrade` per period and `finalAcrossPeriods`
 * over them -- the same pair lib/gradebook.js uses -- so what this card says
 * is what the record will say. `previewMatchesGradebook.test.js` holds the
 * two against each other and fails if they ever drift.
 */
export function PreviewPanel({ periods, components, mode, policy, labOn = false, initialSamples }) {
  /* Keyed by period index, then component index; a removed row shifts the
     ones after it, which a simulation can live with. `initialSamples` exists
     for the tests, which render static markup and cannot type. */
  const [samples, setSamples] = useState(initialSamples ?? {})
  const sim = simulateAllPeriods(periods, components, samples, mode, policy)
  const warnings = previewWarnings(sim, { labOn })

  const setSample = (periodIndex, componentIndex, value) =>
    setSamples((s) => ({ ...s, [periodIndex]: { ...(s[periodIndex] ?? {}), [componentIndex]: value } }))

  const noRows = sim.periods.length === 0 || sim.periods[0].componentCount === 0

  return (
    <div className="mt-6" style={{ background: 'rgba(14,42,92,0.025)', border: `1px solid ${line}`, borderRadius: 16, padding: '20px 22px' }} data-testid="preview-panel">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 style={{ ...serif, fontSize: 18, color: ink, margin: '0 0 3px' }}>Preview the whole course</h3>
          <p style={{ fontSize: 12, color: faint, margin: 0, maxWidth: 600 }}>
            Type a sample percent per component, per period, to see the grade this setup gives —
            each period and the overall grade. A blank is <strong>not</strong> a zero: it is left out and
            the rest are re-weighted, exactly as ungraded work is in the class record.
          </p>
        </div>
        <span style={{ display: 'inline-flex', alignItems: 'center', padding: '4px 12px', fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', borderRadius: 999, color: muted, background: 'rgba(14,42,92,0.06)', border: `1px solid ${line}` }}>
          Simulation · sample scores · nothing is saved
        </span>
      </div>

      <div style={{ height: 1, background: 'rgba(14,42,92,0.06)', margin: '14px 0' }} />

      {noRows ? (
        <p style={{ fontSize: 13, color: faint, margin: 0 }}>
          Name at least one grading period and one component above to preview a grade.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
            {sim.periods.map((p) => (
              <PreviewPeriod
                key={p.id}
                period={p}
                mode={mode}
                labOn={labOn}
                samples={samples[p.index]}
                onSample={(ci, v) => setSample(p.index, ci, v)}
              />
            ))}
          </div>

          {/* The overall grade -- the number the course actually ends on. */}
          <div
            className="mt-4 flex flex-wrap items-center justify-between gap-3"
            style={{ background: '#FFFFFF', border: `1px solid ${line}`, borderRadius: 12, padding: '14px 18px' }}
            aria-live="polite"
            data-testid="preview-overall"
          >
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: muted }}>
                Overall course grade
              </div>
              <div style={{ fontSize: 12, color: faint, marginTop: 3 }}>
                {sim.overall == null
                  ? 'Type a sample score in any period to see it.'
                  : `Periods weighted ${sim.periods.map((p) => `${p.name} ${fmtPct(p.weight)}%`).join(' · ')}`}
              </div>
            </div>
            {sim.overall != null && (
              <div className="flex items-baseline gap-3 flex-wrap">
                <span style={{ ...serif, fontSize: 38, lineHeight: 1, color: sim.overallPassed ? green : red }} data-testid="preview-final">
                  {fmtFinal(sim.overall, mode)}
                </span>
                <WeightBadge tone={sim.overallPassed ? 'ok' : 'bad'}>
                  {sim.overallPassed ? 'Passed' : 'Failed'}
                </WeightBadge>
              </div>
            )}
          </div>

          {warnings.length > 0 && (
            <ul style={{ margin: '12px 0 0', paddingLeft: 18, fontSize: 12, lineHeight: 1.55 }} data-testid="preview-warnings">
              {warnings.map((w) => (
                <li key={w.text} style={{ color: w.level === 'error' ? red : '#8A6400' }}>{w.text}</li>
              ))}
            </ul>
          )}

          <p style={{ fontSize: 11.5, color: faint, margin: '12px 0 0' }}>
            {mode === 'deped_k12'
              ? 'Each period grade is transmuted per DepEd Order No. 015, s. 2026, then the periods are averaged by their weights.'
              : mode === 'ched_point'
                ? 'Each period grade is mapped onto the point scale, then the periods are averaged by their weights.'
                : 'Each period grade is the weighted percent, and the periods are averaged by their weights.'}
          </p>
        </>
      )}
    </div>
  )
}

/*
 * Saved grading templates (Phase 2 §3).
 *
 * A template is a named configuration, not a link to a class. "Use" loads it
 * into the editors below; nothing reaches a class until the teacher presses
 * Save & Sync, which already names the affected classes and warns that
 * recorded grades are recomputed. So editing a template never silently
 * changes a class configured from it earlier -- a class holds its own copy.
 */
function TemplatesCard({ busy, onUse, buildBody, classGradebooks }) {
  const queryClient = useQueryClient()
  const { data, isLoading } = useQuery({
    queryKey: ['fs-grading-templates'],
    queryFn: listTemplates,
  })
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)
  const templates = data?.templates ?? []

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['fs-grading-templates'] })

  const run = async (fn) => {
    setSaving(true)
    setError(null)
    try {
      await fn()
      refresh()
    } catch (err) {
      setError(err.message)
      toast.error(err.message)
    } finally {
      setSaving(false)
    }
  }

  async function saveAsTemplate() {
    const name = await promptDialog({
      title: 'Save this setup as a template',
      message: 'Templates are configurations you can reuse on other classes. Saving one changes no class.',
      label: 'Template name',
      placeholder: 'e.g. College — Lecture with Laboratory',
      confirmLabel: 'Save template',
    })
    if (!name?.trim()) return
    const body = buildBody(name.trim())
    if (!body) return // the form is invalid; buildBody has already said so
    await run(() => createTemplate(body))
    toast.success(`Saved "${name.trim()}" to your templates.`)
  }

  async function use(t) {
    const ok = await confirmDialog({
      title: `Use "${t.name}"?`,
      message:
        'This replaces the grading periods, components and settings in the form below with the '
        + 'template\u2019s. No class changes until you press Save & Sync.',
      confirmLabel: 'Load into the form',
    })
    if (ok) {
      onUse(setupFromTemplate(t))
      toast.success(`Loaded "${t.name}". Tick target classes and Save & Sync to apply it.`)
    }
  }

  async function rename(t) {
    const name = await promptDialog({
      title: 'Rename template',
      label: 'Template name',
      defaultValue: t.name,
      confirmLabel: 'Rename',
    })
    if (!name?.trim() || name.trim() === t.name) return
    await run(() => updateTemplate(t.id, { ...t, name: name.trim() }))
  }

  async function remove(t) {
    const ok = await confirmDialog({
      title: `Delete "${t.name}"?`,
      message:
        'The template is removed from your list. Classes already configured from it keep their '
        + 'grading setup and their grades — a class holds its own copy.',
      confirmLabel: 'Delete template',
      tone: 'danger',
    })
    if (ok) await run(() => deleteTemplate(t.id))
  }

  async function share(t) {
    const next = t.scope === 'school' ? 'private' : 'school'
    await run(() => updateTemplate(t.id, { ...t, scope: next }))
  }

  return (
    <div className="mt-6" style={{ background: '#FFFFFF', border: `1px solid ${line}`, borderRadius: 16, padding: '20px 22px' }} data-testid="templates-card">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 style={{ ...serif, fontSize: 18, color: ink, margin: '0 0 3px' }}>Saved Templates</h3>
          <p style={{ fontSize: 12.5, color: muted, margin: 0, maxWidth: 620 }}>
            Reusable grading setups. <strong style={{ color: ink }}>Use</strong> loads one into the form
            below — nothing reaches a class until you press Save &amp; Sync.
          </p>
        </div>
        <Button onClick={saveAsTemplate} disabled={busy || saving} radius={11}>
          Save current setup
          <GoldArrowDot><ArrowRight className="h-3 w-3" /></GoldArrowDot>
        </Button>
      </div>

      {error && <Banner tone="err">{error}</Banner>}

      <div style={{ height: 1, background: 'rgba(14,42,92,0.06)', margin: '14px 0' }} />

      {isLoading ? (
        <p style={{ fontSize: 13, color: faint, margin: 0 }}>Loading templates…</p>
      ) : data?.available === false ? (
        <p style={{ fontSize: 13, color: faint, margin: 0 }}>
          Templates are unavailable right now. Your grading setup still saves normally.
        </p>
      ) : templates.length === 0 ? (
        <p style={{ fontSize: 13, color: faint, margin: 0 }}>
          No templates yet. Set up the periods and components below, then <strong>Save current setup</strong> to
          reuse them on another class.
        </p>
      ) : (
        <div className="flex flex-col gap-2.5">
          {templates.map((t) => {
            const used = countClassesUsing(t, classGradebooks)
            return (
              <div key={t.id} style={{ border: `1px solid ${line}`, borderRadius: 12, padding: '12px 14px' }}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div style={{ minWidth: 0 }}>
                    <div className="flex flex-wrap items-center gap-2">
                      <span style={{ fontSize: 14, fontWeight: 800, color: ink }}>{t.name}</span>
                      {t.scope === 'school' && (
                        <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: navy, background: 'rgba(245,197,24,0.18)', border: `1px solid ${gold}`, borderRadius: 999, padding: '2px 8px' }}>
                          Shared with school
                        </span>
                      )}
                      {!t.is_owner && (
                        <span style={{ fontSize: 11, color: muted }}>· from a colleague</span>
                      )}
                    </div>
                    {t.description && (
                      <p style={{ fontSize: 12, color: muted, margin: '3px 0 0' }}>{t.description}</p>
                    )}
                    <p style={{ fontSize: 11.5, color: faint, margin: '3px 0 0' }}>
                      {describeTemplate(t)}
                      {used > 0 && ` · ${used} class${used === 1 ? '' : 'es'} use it`}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2" style={{ flexShrink: 0 }}>
                    <button type="button" onClick={() => use(t)} disabled={busy || saving} style={templateBtn(navy)}>
                      Use
                    </button>
                    <button type="button" onClick={() => run(() => duplicateTemplate(t.id))} disabled={busy || saving} style={templateBtn(muted)}>
                      Duplicate
                    </button>
                    {t.is_owner && (
                      <>
                        <button type="button" onClick={() => rename(t)} disabled={busy || saving} style={templateBtn(muted)}>
                          Rename
                        </button>
                        <button type="button" onClick={() => share(t)} disabled={busy || saving} style={templateBtn(muted)}>
                          {t.scope === 'school' ? 'Make private' : 'Share with school'}
                        </button>
                        <button type="button" onClick={() => remove(t)} disabled={busy || saving} style={templateBtn(red)}>
                          Delete
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <p style={{ fontSize: 11.5, color: faint, margin: '12px 0 0' }}>
        Editing a template never changes a class that already uses it — each class keeps its own copy of
        the setup, written when you pressed Save &amp; Sync.
        {' '}{TEMPLATE_SCOPES[1].hint}
      </p>
    </div>
  )
}

const templateBtn = (color) => ({
  fontSize: 12,
  fontWeight: 700,
  fontFamily: sans,
  color,
  background: 'none',
  border: 'none',
  padding: '2px 0',
  cursor: 'pointer',
})

/*
 * The lecture-to-laboratory ratio, plus the combined-weight summary §6 asks
 * for. One input, not two: the two shares always total 100%, so a second box
 * would only be a way to type a pair that does not.
 */
function LabRatio({ value, setValue, busy }) {
  const error = labWeightError(value)
  const lab = Number(value)
  const lecture = error ? null : round2(100 - lab)
  return (
    <div style={{ marginTop: 16, borderTop: '1px solid rgba(14,42,92,0.06)', paddingTop: 14 }}>
      <div className="flex flex-wrap items-start gap-x-8 gap-y-4">
        <label style={{ display: 'block' }}>
          <span style={{ display: 'block', fontSize: 12, fontWeight: 700, color: ink, marginBottom: 6 }}>
            Laboratory share of the grade
          </span>
          <span className="relative" style={{ display: 'inline-block' }}>
            <input
              className="ak-input"
              type="number"
              min="1"
              max="99"
              step="0.01"
              value={value}
              disabled={busy}
              onChange={(e) => setValue(e.target.value)}
              aria-invalid={Boolean(error)}
              aria-label="Laboratory share of the grade"
              style={{ ...fieldStyle, width: 110, paddingRight: 26, textAlign: 'right', borderColor: error ? red : undefined }}
            />
            <span style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', color: faint, fontSize: 13 }}>%</span>
          </span>
          <span style={{ display: 'block', fontSize: 11.5, color: error ? red : faint, marginTop: 5 }}>
            {error || 'Lecture takes the rest. 33.33% is lecture twice, laboratory once.'}
          </span>
        </label>

        <div style={{ minWidth: 220 }}>
          <span style={{ display: 'block', fontSize: 12, fontWeight: 700, color: ink, marginBottom: 6 }}>
            Combined period grade
          </span>
          {error ? (
            <p style={{ fontSize: 12.5, color: red, margin: 0 }}>Set a valid laboratory share to see the split.</p>
          ) : (
            <>
              <div className="flex flex-wrap gap-2" data-testid="lab-ratio-summary">
                <WeightBadge tone="ok">Lecture {fmtPct(lecture)}%</WeightBadge>
                <WeightBadge tone="ok">Laboratory {fmtPct(round2(lab))}%</WeightBadge>
                <WeightBadge tone="ok">Total 100%</WeightBadge>
              </div>
              <p style={{ fontSize: 11.5, color: faint, margin: '6px 0 0', lineHeight: 1.45 }}>
                Each period grade = (lecture result × {fmtPct(lecture)}% + laboratory result ×{' '}
                {fmtPct(round2(lab))}%). The grading standard above is applied once, to that combined
                result — never to each half separately.
              </p>
            </>
          )}
        </div>
      </div>
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
  /* Two editors, one saved list. Components are split on their `track` and
     rejoined at save time; a component saved before laboratory grading existed
     has no track and loads as lecture, which is what it has always been. */
  const savedLecture = rowsForTrack(setup.components, LECTURE)
  const savedLab = rowsForTrack(setup.components, LAB)
  const initialLab = savedLab.length
    ? savedLab
    : (setup.archived_lab_components?.length
        ? setup.archived_lab_components
        : presetRows(LAB_COMPONENT_PRESET))
  const [components, setComponents] = useState(savedLecture.length ? savedLecture : [newRow()])
  const [labComponents, setLabComponents] = useState(initialLab)
  const [gradingMode, setGradingMode] = useState(setup.grading_mode ?? 'deped_k12')
  /* Pass mark + point-scale direction, seeded from the preset with the
     defaults filled (a preset saved before the fields existed reads 75 and
     1.0-is-highest). The percent is kept as the input's string so a teacher
     can clear the box and retype. */
  const savedPolicy = gradePolicy(setup)
  const [passingPercent, setPassingPercent] = useState(String(savedPolicy.passing_percent))
  const [scaleDirection, setScaleDirection] = useState(savedPolicy.point_scale_direction)
  const [structure, setStructure] = useState(savedPolicy.grading_structure)
  /* Kept as the input's string, like the pass mark. Seeded rounded, because
     the default share is 100/3 and a box reading 33.333333333333336 is not a
     box anyone can edit; saving re-stamps the rounded value, which moves a
     combined grade by less than 0.001 — below anything displayed. */
  const [labWeight, setLabWeight] = useState(String(round2(savedPolicy.lab_weight_percent)))
  const labOn = structure === LECTURE_LAB
  const [selectedClassIds, setSelectedClassIds] = useState(focusClass ? [focusClass.id] : [])
  /* The teacher's own gradebooks, only so a template can say how many classes
     use it (§3 "where practical"). One getDoc per class the teacher already
     has listed -- a handful -- and cached by React Query, so opening this page
     does not re-read them on every keystroke. */
  const { data: classGradebooks = [] } = useQuery({
    queryKey: ['fs-grading-gradebooks', classes.map((c) => c.id).join(',')],
    queryFn: async () => {
      const snaps = await Promise.all(classes.map((c) => getDoc(doc(db, 'gradebooks', c.id))))
      return snaps.filter((snap) => snap.exists()).map((snap) => ({ id: snap.id, ...snap.data() }))
    },
    enabled: classes.length > 0,
  })
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

  async function persist(nextPeriods, nextComponents, nextMode, opts = {}) {
    const nextStructure = opts.structure ?? structure
    const nextLab = opts.labComponents ?? labComponents
    const nextLabOn = nextStructure === LECTURE_LAB
    if (!balanced(nextPeriods) || !balanced(nextComponents)) {
      throw new Error('Every weight must be above 0%, and each group must total 100%.')
    }
    if (nextLabOn && !balanced(nextLab)) {
      throw new Error('Laboratory component weights must each be above 0% and total 100%.')
    }
    const labError = nextLabOn ? labWeightError(labWeight) : null
    if (labError) throw new Error(labError)
    if (nextLabOn) {
      /* The template's required rows have to survive the save, not just the
         disabled inputs in the editor. A missing one means the laboratory is
         no longer the structure the template describes. */
      const missing = LAB_COMPONENT_PRESET.filter(
        (req) => !namedRows(nextLab).some((r) => String(r.name).trim() === req.name),
      )
      if (missing.length) {
        throw new Error(
          `Lecture with Laboratory requires ${missing.map((m) => `"${m.name}"`).join(' and ')}.`
          + ' Restore the component, or switch back to Lecture only.',
        )
      }
    }
    /* The pass mark only matters in the CHED modes, and only those show the
       box -- so under DepEd an unfinished value is dropped rather than
       rejected, and the backend keeps whatever was stored. */
    const passError = passingPercentError(passingPercent)
    if (nextMode !== 'deped_k12' && passError) throw new Error(passError)

    const processedPeriods = withIds(nextPeriods)
    /* One list, each row tagged. The backend validates each track's weights
       separately and stores the tag, so the record can split them again. */
    const processedComponents = [
      ...withIds(nextComponents, [], LECTURE),
      ...(nextLabOn ? withIds(nextLab, [], LAB) : []),
    ]

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
        grading_structure: nextStructure,
        // Only meaningful with a laboratory; sent regardless so switching the
        // structure back and forth does not lose the teacher's ratio.
        lab_weight_percent: nextLabOn ? Number(labWeight) : undefined,
        // Preserve laboratory components if switching to Lecture only,
        // so switching back restores their IDs and reconnects existing assessments.
        archived_lab_components: !nextLabOn && labComponents.length ? withIds(labComponents, [], LAB) : undefined,
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
      const all = presetRows(preset.components)
      const nextC = rowsForTrack(all, LECTURE)
      const nextLab = rowsForTrack(all, LAB)
      const nextStructure = preset.grading_structure ?? 'lecture_only'
      setPeriods(nextP)
      setComponents(nextC.length ? nextC : [newRow()])
      setStructure(nextStructure)
      if (nextStructure === LECTURE_LAB) {
        setLabComponents(nextLab.length ? nextLab : presetRows(LAB_COMPONENT_PRESET))
        if (preset.lab_weight_percent != null) setLabWeight(String(round2(preset.lab_weight_percent)))
      }
      /* The setState calls above have not landed yet when persist runs, so the
         preset's own values are passed in rather than read from state. */
      return persist(nextP, nextC, gradingMode, {
        structure: nextStructure,
        labComponents: nextLab.length ? nextLab : presetRows(LAB_COMPONENT_PRESET),
      })
    },
    onSuccess: flash,
    onError: (err) => reportError(err.message),
  })

  // Every button on the form keys off this: a second click mid-save would
  // race the request in flight (two saves, last-write-wins on the backend).
  const busy = save.isPending || applyPreset.isPending

  /* --- saved templates (Phase 2 §3) --------------------------------------
     Loading a template only fills these editors. Nothing reaches a class
     until Save & Sync, which keeps its existing confirmation. */
  const applyTemplate = (setup) => {
    const savedLab = rowsForTrack(setup.components, LAB)
    setPeriods(setup.periods.length ? setup.periods : [newRow()])
    setComponents(rowsForTrack(setup.components, LECTURE).length
      ? rowsForTrack(setup.components, LECTURE)
      : [newRow()])
    setStructure(setup.grading_structure)
    setGradingMode(setup.grading_mode)
    if (setup.grading_structure === LECTURE_LAB) {
      setLabComponents(savedLab.length ? savedLab : presetRows(LAB_COMPONENT_PRESET))
      if (setup.lab_weight_percent != null) setLabWeight(String(round2(setup.lab_weight_percent)))
    } else if (setup.archived_lab_components?.length) {
      // Keep the archived pair in hand so switching the structure back on
      // restores the same component ids (Phase 1 archived_lab_components).
      setLabComponents(setup.archived_lab_components)
    }
    if (setup.passing_percent != null) setPassingPercent(String(setup.passing_percent))
    if (setup.point_scale_direction) setScaleDirection(setup.point_scale_direction)
    setError(null)
    setSaved('')
  }

  /* The current form as a template body, or null when the form is not valid.
     Validated with the SAME checks the save runs, so a template can never
     hold a configuration that Save & Sync would reject. */
  const buildTemplateBody = (name) => {
    if (!balanced(periods) || !balanced(components)) {
      reportError('Every weight must be above 0%, and each group must total 100% before saving a template.')
      return null
    }
    if (labOn && !balanced(labComponents)) {
      reportError('Laboratory component weights must each be above 0% and total 100%.')
      return null
    }
    const labError = labOn ? labWeightError(labWeight) : null
    if (labError) {
      reportError(labError)
      return null
    }
    const passError = gradingMode !== 'deped_k12' ? passingPercentError(passingPercent) : null
    if (passError) {
      reportError(passError)
      return null
    }
    return templateFromSetup({
      name,
      scope: 'private',
      gradingMode,
      passingPercent: passError ? undefined : passingPercent,
      scaleDirection,
      structure,
      labWeight,
      periods: withIds(periods),
      components: [
        ...withIds(components, [], LECTURE),
        ...(labOn ? withIds(labComponents, [], LAB) : []),
      ],
      archivedLabComponents: !labOn && labComponents.length ? withIds(labComponents, [], LAB) : undefined,
    })
  }

  /* Gates every Save & Sync button on the page (the top one and the one on
     each weight card -- all three save the same whole setup, see the note
     in EditorCard). An unbalanced group or a bad pass mark goes straight to
     the same error persist() would throw anyway, with no confirmation step
     -- asking "are you sure?" about a save that cannot succeed has nothing
     to confirm. Only a setup that would actually save asks first, because
     saving recomputes every grade on every selected class immediately. */
  async function requestSave() {
    if (busy) return
    if (!balanced(periods) || !balanced(components)) {
      reportError('Every weight must be above 0%, and each group must total 100%.')
      return
    }
    if (labOn && !balanced(labComponents)) {
      reportError('Laboratory component weights must each be above 0% and total 100%.')
      return
    }
    const labError = labOn ? labWeightError(labWeight) : null
    if (labError) {
      reportError(labError)
      return
    }
    const passError = gradingMode !== 'deped_k12' ? passingPercentError(passingPercent) : null
    if (passError) {
      reportError(passError)
      return
    }
    /* A structure change is the one edit that can move a grade without any
       weight changing -- a laboratory switched off stops counting laboratory
       scores entirely -- so it is named in the confirmation rather than
       folded into "recomputed under the new weights". */
    const structureChanged = structure !== savedPolicy.grading_structure
    const structureNote = !structureChanged
      ? ''
      : labOn
        ? ' This class group switches to Lecture with Laboratory: laboratory scores start counting'
          + ` for ${fmtPct(Number(labWeight))}% of each period.`
        : ' This class group switches to Lecture only: laboratory components are removed from the'
          + ' setup and laboratory scores stop counting toward the grade. Existing scores are kept,'
          + ' not deleted.'
    const targets = classes
      .filter((c) => selectedClassIds.includes(c.id))
      .map(classLabel)
      .join(', ')
    const ok = await confirmDialog({
      title: 'Save this grading setup?',
      message: selectedClassIds.length
        ? `Saves these grading periods and components, and applies them to ${selectedClassIds.length} `
          + `selected class${selectedClassIds.length === 1 ? '' : 'es'} (${targets}). Grades already `
          + `recorded are recomputed under the new weights.${structureNote}`
        : 'Saves these grading periods and components as a preset. Tick target classes below to apply '
          + `it to a class.${structureNote}`,
      confirmLabel: 'Save & Sync',
    })
    if (!ok) return
    save.mutate()
  }

  return (
    <div className="max-w-4xl mx-auto pb-12">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-[clamp(26px,3.5vw,32px)]" style={{ ...serif, lineHeight: 1.1, letterSpacing: '-0.01em', margin: '0 0 4px', color: ink }}>
            Grade Configuration
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
        <Button onClick={requestSave} disabled={busy} radius={11}>
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
              {/* A preset whose policy basis we could not verify says so on
                  its own face, rather than looking as settled as the others. */}
              {p.note && (
                <div style={{ fontSize: 11, color: '#8A6400', lineHeight: 1.4, marginTop: 4, maxWidth: 230 }}>
                  {p.note}
                </div>
              )}
            </button>
          ))}
        </div>
      </div>

      {error && <Banner tone="err">{error}</Banner>}
      {saved && <Banner tone="ok">{saved}</Banner>}

      <TemplatesCard
        busy={busy}
        onUse={applyTemplate}
        buildBody={buildTemplateBody}
        classGradebooks={classGradebooks}
      />

      {/* Target Classes Selection */}
      <div className="mt-6" style={{ background: '#FFFFFF', border: `1px solid ${line}`, borderRadius: 16, padding: '20px 22px' }}>
        <h3 style={{ ...serif, fontSize: 18, color: ink, margin: '0 0 3px' }}>Target Classes</h3>
        <p style={{ fontSize: 12.5, color: muted, margin: '0 0 14px' }}>
          Choose the classes that will use these grading settings.
        </p>
        <div className="flex flex-col gap-2 max-h-40 overflow-y-auto border border-slate-100 p-3 rounded-xl">
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
                  {/* T-154: classLabel can still carry an old, unbounded
                      section or subject_code -- clamp the row to one line
                      instead of letting it stretch the picker. */}
                  <span
                    title={classLabel(clazz)}
                    style={{ fontSize: 13, fontWeight: 600, color: ink, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                  >
                    {classLabel(clazz)}
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
          Choose a grading system based on your institution's standards (DepEd K-12 uses transmutation tables; CHED uses raw percentages or a 1.0–5.0 scale).
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

      {/* Course Structure — independent of the grading standard above: a
          DepEd class and a CHED class can each have a laboratory. */}
      <div className="mt-6" style={{ background: '#FFFFFF', border: `1px solid ${line}`, borderRadius: 16, padding: '20px 22px' }}>
        <h3 style={{ ...serif, fontSize: 18, color: ink, margin: '0 0 3px' }}>Course Structure</h3>
        <p style={{ fontSize: 12.5, color: muted, margin: '0 0 14px', maxWidth: 620 }}>
          Whether this class is graded as one set of components, or as a lecture and a laboratory
          weighted separately and then combined. This is separate from the grading standard above.
        </p>
        <div className="flex flex-wrap gap-3">
          {GRADING_STRUCTURES.map((st) => (
            <ChoiceButton
              key={st.value}
              testId={`structure-${st.value}`}
              active={structure === st.value}
              disabled={busy}
              onClick={() => {
                setStructure(st.value)
                // Switching on with nothing configured starts from the
                // template's required pair rather than an empty card.
                if (st.value === LECTURE_LAB && !labComponents.length) {
                  setLabComponents(presetRows(LAB_COMPONENT_PRESET))
                }
              }}
              label={st.label}
              hint={st.hint}
            />
          ))}
        </div>

        {labOn && <LabRatio value={labWeight} setValue={setLabWeight} busy={busy} />}
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-2">
        <EditorCard
          title="Grading Periods"
          hint="e.g. Quarters 1–4, or Prelim / Midterm / Finals"
          rows={periods}
          setRows={setPeriods}
          addLabel="Add period"
          busy={busy}
          onSave={requestSave}
        />
        <EditorCard
          title={labOn ? 'Lecture Components' : 'Grade Components'}
          hint={
            labOn
              ? 'Weighted among themselves to give the lecture result for each period.'
              : 'e.g. Written Works, Performance Tasks, Quarterly Assessment'
          }
          rows={components}
          setRows={setComponents}
          addLabel={labOn ? 'Add lecture component' : 'Add component'}
          busy={busy}
          onSave={requestSave}
        />
        {labOn && (
          <EditorCard
            title="Laboratory Components"
            hint="Weighted among themselves to give the laboratory result for each period."
            rows={labComponents}
            setRows={setLabComponents}
            addLabel="Add laboratory component"
            busy={busy}
            onSave={requestSave}
          />
        )}
      </div>

      {/* Reads the unsaved form state on purpose: the point is to try a
          setup before saving it. */}
      <PreviewPanel
        periods={periods}
        components={labOn ? [...components, ...labComponents] : components}
        mode={gradingMode}
        labOn={labOn}
        policy={gradePolicy({
          passing_percent: passingPercent,
          point_scale_direction: scaleDirection,
          grading_structure: structure,
          lab_weight_percent: labWeight,
        })}
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
