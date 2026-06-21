import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  addDoc,
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  updateDoc,
  writeBatch,
} from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { fetchUsersByIds } from '@/lib/roster'
import { computeFinalGrade, finalAcrossPeriods } from '@/lib/grading'
import { ArrowRight, Plus } from '@/components/icons'

const navy = '#0E2A5C'
const navyDeep = '#061840'
const ink = '#0A1733'
const gold = '#F5C518'
const goldDeep = '#8B6A00'
const muted = '#6A7A95'
const faint = '#9AA6BD'
const green = '#1F8A5B'
const blueText = '#1E6FB0'
const red = '#C0392B'
const line = 'rgba(14,42,92,0.08)'
const serif = { fontFamily: "'DM Serif Display', Georgia, serif" }
const mono = { fontFamily: "'JetBrains Mono', ui-monospace, monospace" }
const sans = "'Plus Jakarta Sans', sans-serif"

// --- shared modal + button styling ----------------------------------------
const overlayStyle = {
  position: 'fixed', inset: 0, background: 'rgba(14,23,51,0.55)',
  backdropFilter: 'blur(3px)', WebkitBackdropFilter: 'blur(3px)',
  display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 24,
}
const cardStyle = {
  width: '100%', background: '#FFFFFF', borderRadius: 20,
  boxShadow: '0 40px 80px -20px rgba(14,42,92,0.45)', overflow: 'hidden',
  display: 'flex', flexDirection: 'column', maxHeight: '90vh',
}
const headerStyle = {
  padding: '24px 28px 20px', borderBottom: '1px solid rgba(14,42,92,0.07)',
  display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0,
}
const iconSquare = {
  width: 36, height: 36, borderRadius: 10, background: navy, color: gold,
  display: 'grid', placeItems: 'center', flexShrink: 0,
}
const bodyStyle = { padding: '24px 28px', overflowY: 'auto' }
const footerStyle = {
  display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 12,
  padding: '16px 28px', borderTop: '1px solid rgba(14,42,92,0.07)',
  background: 'rgba(14,42,92,0.02)', flexShrink: 0,
}
const labelStyle = { display: 'block', fontSize: 13, fontWeight: 600, color: ink, marginBottom: 7 }
const fieldStyle = {
  width: '100%', padding: '12px 14px', fontSize: 14, fontFamily: sans, color: ink,
  background: '#FFFFFF', border: '1.5px solid rgba(14,42,92,0.14)', borderRadius: 10,
  transition: 'border-color 0.15s, box-shadow 0.15s',
}
const btnPrimary = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 9,
  padding: '12px 20px', fontSize: 14, fontWeight: 700, fontFamily: sans, color: '#FAFAF6',
  background: navy, border: 'none', borderRadius: 10, cursor: 'pointer', boxShadow: `0 3px 0 ${navyDeep}`,
}
const btnGhost = {
  padding: '12px 20px', fontSize: 14, fontWeight: 600, fontFamily: sans, color: '#3A4A6B',
  background: '#FFFFFF', border: '1.5px solid rgba(14,42,92,0.14)', borderRadius: 10, cursor: 'pointer',
}
// Toolbar (compact) variants
const btnGhostSm = {
  padding: '10px 16px', fontSize: 13, fontWeight: 700, fontFamily: sans, color: navy,
  background: '#FFFFFF', border: '1.5px solid rgba(14,42,92,0.14)', borderRadius: 10, cursor: 'pointer',
}
const btnPrimarySm = {
  display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 16px', fontSize: 13,
  fontWeight: 700, fontFamily: sans, color: '#FAFAF6', background: navy, border: 'none',
  borderRadius: 10, cursor: 'pointer', boxShadow: `0 2px 0 ${navyDeep}`,
}
const lockBtnActive = {
  padding: '10px 16px', fontSize: 13, fontWeight: 700, fontFamily: sans, color: goldDeep,
  background: 'rgba(245,197,24,0.18)', border: '1.5px solid rgba(245,197,24,0.55)', borderRadius: 10, cursor: 'pointer',
}

function GoldArrow() {
  return (
    <span style={{ display: 'inline-grid', placeItems: 'center', width: 20, height: 20, borderRadius: '50%', background: gold, color: navy }}>
      <ArrowRight className="h-3 w-3" />
    </span>
  )
}

function AlertBox({ tone = 'error', children }) {
  const t =
    tone === 'warn'
      ? { color: goldDeep, bg: 'rgba(245,197,24,0.12)', border: 'rgba(245,197,24,0.45)' }
      : { color: red, bg: 'rgba(192,57,43,0.07)', border: 'rgba(192,57,43,0.3)' }
  return (
    <div role="alert" style={{ fontSize: 13, color: t.color, background: t.bg, border: `1px solid ${t.border}`, borderRadius: 10, padding: '10px 12px' }}>
      {children}
    </div>
  )
}

function StatMini({ label, value, sub, color, highlight }) {
  return (
    <div
      style={{
        background: '#FFFFFF',
        borderRadius: 14,
        padding: '16px 18px',
        border: highlight ? '1px solid rgba(245,197,24,0.45)' : `1px solid ${line}`,
        boxShadow: highlight ? '0 0 0 3px rgba(245,197,24,0.08)' : 'none',
      }}
    >
      <div style={{ fontSize: 11, fontWeight: 700, color: highlight ? goldDeep : muted, letterSpacing: '0.06em', textTransform: 'uppercase' }}>{label}</div>
      <div style={{ ...serif, fontSize: 32, lineHeight: 1, color: color ?? ink, marginTop: 6 }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: faint, marginTop: 6 }}>{sub}</div>}
    </div>
  )
}

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

// Grade → colour band for the final-grade / summary cells.
function gradeColor(v) {
  if (v == null) return muted
  if (v >= 90) return green
  if (v >= 85) return blueText
  if (v >= 75) return ink
  if (v >= 70) return goldDeep
  return red
}

const KIND_OPTIONS = ['activity', 'quiz', 'exam', 'contest', 'other']

// ---------------------------------------------------------------- data loading

async function loadBundle(classId) {
  const gbSnap = await getDoc(doc(db, 'gradebooks', classId))
  const gb = gbSnap.exists() ? gbSnap.data() : {}
  const configured = Boolean(gb.configured && gb.periods?.length && gb.components?.length)

  const classSnap = await getDoc(doc(db, 'classes', classId))
  if (!classSnap.exists()) throw new Error('Class not found')
  const ids = classSnap.data().student_ids ?? []
  const users = ids.length ? await fetchUsersByIds(ids) : []
  const students = users
    .map((u) => ({ student_id: u.id, first_name: u.first_name, last_name: u.last_name }))
    .sort((a, b) =>
      `${a.last_name} ${a.first_name}`.localeCompare(`${b.last_name} ${b.first_name}`),
    )

  let assessments = []
  if (configured) {
    const aSnap = await getDocs(collection(db, 'gradebooks', classId, 'assessments'))
    assessments = aSnap.docs.map((d) => ({ id: d.id, ...d.data() }))
  }

  return {
    configured,
    periods: gb.periods ?? [],
    components: gb.components ?? [],
    mode: gb.grading_mode ?? 'deped_k12',
    overrides: gb.overrides ?? {},
    students,
    assessments,
  }
}

/* One student's grade for one period: component breakdown + (transmuted) grade,
   honouring a manual override. */
function gradeForPeriod(bundle, periodAssessments, studentId, periodId) {
  const studentScores = {}
  for (const a of periodAssessments) {
    const sc = a.scores?.[studentId]
    if (sc) studentScores[a.id] = sc
  }
  const componentsWithA = bundle.components.map((c) => ({
    ...c,
    assessments: periodAssessments.filter((a) => a.component_id === c.id),
  }))
  const { final, breakdown } = computeFinalGrade(componentsWithA, studentScores, bundle.mode)
  const override = bundle.overrides?.[periodId]?.[studentId]
  return {
    components: breakdown,
    period_grade: final,
    override: override ?? null,
    grade: override != null ? override : final,
  }
}

/* Shape one period's view the way RecordGrid expects it. */
function buildPeriodRecord(bundle, periodId) {
  const period = bundle.periods.find((p) => p.id === periodId) ?? bundle.periods[0]
  const periodAssessments = bundle.assessments.filter((a) => a.period_id === period.id)
  const scores = {}
  for (const a of periodAssessments) scores[a.id] = a.scores ?? {}
  const grades = {}
  for (const s of bundle.students) {
    grades[s.student_id] = gradeForPeriod(bundle, periodAssessments, s.student_id, period.id)
  }
  return {
    periods: bundle.periods,
    period,
    components: bundle.components,
    assessments: periodAssessments,
    scores,
    students: bundle.students,
    grades,
  }
}

/* Shape the cross-period summary the way SummaryView expects it. */
function buildSummary(bundle) {
  const grades = {}
  for (const s of bundle.students) {
    const perPeriod = {}
    const values = {}
    for (const p of bundle.periods) {
      const periodAssessments = bundle.assessments.filter((a) => a.period_id === p.id)
      const g = gradeForPeriod(bundle, periodAssessments, s.student_id, p.id)
      perPeriod[p.id] = { grade: g.grade, computed: g.period_grade, override: g.override }
      values[p.id] = g.grade
    }
    grades[s.student_id] = {
      periods: perPeriod,
      final_grade: finalAcrossPeriods(values, bundle.periods, bundle.mode),
    }
  }
  return { periods: bundle.periods, students: bundle.students, grades }
}

// ---------------------------------------------------------------- components

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
  const selectStyle = { ...fieldStyle, cursor: 'pointer' }

  async function submit(e) {
    e.preventDefault()
    const totalPoints = Number(form.total_points)
    if (!Number.isFinite(totalPoints) || totalPoints <= 0) {
      setError('Total points must be a positive number')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await addDoc(collection(db, 'gradebooks', classId, 'assessments'), {
        title: form.title.trim(),
        component_id: form.component_id,
        period_id: record.period.id,
        kind: form.kind,
        total_points: totalPoints,
        date_given: form.date_given || null,
        scores: {},
        created_at: serverTimestamp(),
      })
      onSaved()
    } catch (err) {
      setError(err.message)
      setSaving(false)
    }
  }

  return (
    <div style={overlayStyle}>
      <form onSubmit={submit} style={{ ...cardStyle, maxWidth: 460 }}>
        <div style={headerStyle}>
          <span style={iconSquare}>
            <Plus className="h-[18px] w-[18px]" />
          </span>
          <h2 style={{ ...serif, fontSize: 22, margin: 0, color: ink }}>New Assessment · {record.period.name}</h2>
        </div>
        <div style={bodyStyle} className="flex flex-col gap-4">
          {error && <AlertBox>{error}</AlertBox>}
          <div>
            <label style={labelStyle}>Title</label>
            <input className="ak-input" required placeholder="e.g. Quiz 1 — Fractions" value={form.title} onChange={set('title')} style={fieldStyle} />
          </div>
          <div className="grid grid-cols-2 gap-3.5">
            <div>
              <label style={labelStyle}>Component</label>
              <select className="ak-input" value={form.component_id} onChange={set('component_id')} style={selectStyle}>
                {record.components.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Type</label>
              <select className="ak-input capitalize" value={form.kind} onChange={set('kind')} style={selectStyle}>
                {KIND_OPTIONS.map((k) => (
                  <option key={k} value={k}>{k}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3.5">
            <div>
              <label style={labelStyle}>Total points</label>
              <input className="ak-input" required type="number" min="0.5" step="0.5" value={form.total_points} onChange={set('total_points')} style={fieldStyle} />
            </div>
            <div>
              <label style={labelStyle}>Date given</label>
              <input className="ak-input" type="date" value={form.date_given} onChange={set('date_given')} style={fieldStyle} />
            </div>
          </div>
        </div>
        <div style={footerStyle}>
          <button type="button" onClick={onClose} className="transition hover:brightness-105" style={btnGhost}>
            Cancel
          </button>
          <button type="submit" disabled={saving} className="transition hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed" style={btnPrimary}>
            {saving ? 'Adding…' : 'Add assessment'}
            <GoldArrow />
          </button>
        </div>
      </form>
      </div>
    </div>
  )
}

function cellInputStyle(dirty, locked) {
  return {
    ...mono,
    width: 60,
    padding: '6px 4px',
    textAlign: 'center',
    fontSize: 13,
    borderRadius: 8,
    border: dirty ? '1.5px solid #F5C518' : '1.5px solid rgba(14,42,92,0.14)',
    background: locked ? 'rgba(14,42,92,0.03)' : dirty ? 'rgba(245,197,24,0.12)' : '#FFFFFF',
    color: locked ? muted : ink,
    outline: 'none',
  }
}

const thHead = {
  padding: '10px 12px',
  fontSize: 11,
  fontWeight: 700,
  color: muted,
  letterSpacing: '0.05em',
  textTransform: 'uppercase',
  background: 'rgba(14,42,92,0.03)',
  borderBottom: '1px solid rgba(14,42,92,0.07)',
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

  // Class-level stats for the active period (computed from real grades).
  const gradeVals = record.students.map((s) => record.grades[s.student_id]?.grade).filter((v) => v != null)
  const avg = gradeVals.length ? gradeVals.reduce((a, b) => a + b, 0) / gradeVals.length : null
  const passed = gradeVals.filter((v) => v >= 75).length
  const atRisk = gradeVals.filter((v) => v < 85).length
  const hi = gradeVals.length ? Math.max(...gradeVals) : null
  const lo = gradeVals.length ? Math.min(...gradeVals) : null
  const passingRate = gradeVals.length ? `${Math.round((passed / gradeVals.length) * 100)}%` : '—'
  const nameForGrade = (t) => {
    if (t == null) return ''
    const s = record.students.find((st) => record.grades[st.student_id]?.grade === t)
    return s ? s.last_name : ''
  }

  async function saveAll() {
    setSaving(true)
    setError(null)
    try {
      const batch = writeBatch(db)

      for (const [assessmentId, cells] of Object.entries(dirty)) {
        const assessment = record.assessments.find((a) => a.id === assessmentId)
        const updates = {}
        for (const [studentId, text] of Object.entries(cells)) {
          const parsed = parseCell(text, assessment.total_points)
          if (parsed.error) throw new Error(`${assessment.title}: ${parsed.error}`)
          if (parsed.status === 'none') {
            updates[`scores.${studentId}`] = deleteField()
          } else if (parsed.status === 'graded') {
            updates[`scores.${studentId}`] = { status: 'graded', raw_score: parsed.raw_score }
          } else {
            updates[`scores.${studentId}`] = { status: parsed.status }
          }
        }
        if (Object.keys(updates).length) {
          batch.update(doc(db, 'gradebooks', classId, 'assessments', assessmentId), updates)
        }
      }

      const overrideUpdates = {}
      for (const [studentId, text] of Object.entries(dirtyOverrides)) {
        const value = String(text).trim()
        const path = `overrides.${record.period.id}.${studentId}`
        if (value === '') {
          overrideUpdates[path] = deleteField()
          continue
        }
        const num = Number(value)
        if (Number.isNaN(num) || num < 0 || num > 100) {
          throw new Error(`Override must be a number between 0 and 100 (got "${value}")`)
        }
        overrideUpdates[path] = num
      }
      if (Object.keys(overrideUpdates).length) {
        batch.update(doc(db, 'gradebooks', classId), overrideUpdates)
      }

      await batch.commit()
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
      await deleteDoc(doc(db, 'gradebooks', classId, 'assessments', assessment.id))
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
    const warning = locked
      ? 'Unlock this period? Scores and overrides become editable again.'
      : 'Lock this period? Scores, assessments, and overrides become read-only until unlocked.'
    if (!window.confirm(warning)) return
    try {
      const periods = record.periods.map((p) =>
        p.id === record.period.id ? { ...p, locked: !locked } : p,
      )
      await updateDoc(doc(db, 'gradebooks', classId), { periods })
      refetch()
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <>
      {record.students.length > 0 && (
        <div className="mb-5 grid grid-cols-2 gap-3.5 sm:grid-cols-3 lg:grid-cols-5">
          <StatMini label="Class average" value={fmt(avg)} sub={`across ${record.students.length} students`} />
          <StatMini label="Passing rate" value={passingRate} sub={`${passed} of ${gradeVals.length} ≥ 75`} color={green} />
          <StatMini label="At risk · below VS" value={atRisk} sub="candidates for scaffolds" color={goldDeep} highlight={atRisk > 0} />
          <StatMini label="Highest" value={hi == null ? '—' : fmt(hi)} sub={nameForGrade(hi)} color={green} />
          <StatMini label="Lowest" value={lo == null ? '—' : fmt(lo)} sub={nameForGrade(lo)} color={red} />
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3" style={{ marginBottom: 14 }}>
        <p style={{ fontSize: 12.5, color: muted, margin: 0 }}>
          Enter a score, <strong style={{ color: ink }}>M</strong> for missing (counts as 0),{' '}
          <strong style={{ color: ink }}>X</strong> for excused, or leave blank.
        </p>
        <div className="flex flex-wrap gap-2.5">
          <button onClick={toggleLock} className="transition hover:brightness-105" style={locked ? lockBtnActive : { ...btnGhostSm, color: muted }}>
            {locked ? '🔒 Unlock period' : 'Lock period'}
          </button>
          {!locked && (
            <>
              <button onClick={() => setShowAdd(true)} className="transition hover:brightness-105" style={btnGhostSm}>
                <span style={{ color: gold }}>+</span> Add assessment
              </button>
              <button
                onClick={saveAll}
                disabled={dirtyCount === 0 || saving}
                className="transition hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed"
                style={btnPrimarySm}
              >
                {saving ? 'Saving…' : dirtyCount > 0 ? `Save ${dirtyCount} change${dirtyCount === 1 ? '' : 's'}` : 'All saved'}
              </button>
            </>
          )}
        </div>
      </div>

      {locked && (
        <div style={{ marginBottom: 12 }}>
          <AlertBox tone="warn">This period is locked — grades are final and read-only. Unlock to make changes.</AlertBox>
        </div>
      )}
      {error && (
        <div style={{ marginBottom: 12 }}>
          <AlertBox>{error}</AlertBox>
        </div>
      )}

      <div className="overflow-x-auto" style={{ background: '#FFFFFF', border: `1px solid ${line}`, borderRadius: 16 }}>
        <table style={{ borderCollapse: 'collapse', fontSize: 13, minWidth: '100%' }}>
          <thead>
            <tr>
              <th rowSpan={2} style={{ ...thHead, position: 'sticky', left: 0, zIndex: 2, textAlign: 'left', borderRight: '1px solid rgba(14,42,92,0.07)', minWidth: 176 }}>
                Student
              </th>
              {byComponent.map((component) => (
                <th key={component.id} colSpan={component.assessments.length + 1} style={{ padding: '10px 12px', textAlign: 'center', fontSize: 12, fontWeight: 700, color: ink, background: 'rgba(14,42,92,0.03)', borderBottom: '1px solid rgba(14,42,92,0.07)', borderRight: '1px solid rgba(14,42,92,0.07)' }}>
                  {component.name} <span style={{ fontWeight: 600, color: faint }}>({fmt(component.weight_percent)}%)</span>
                </th>
              ))}
              <th rowSpan={2} style={{ ...thHead, minWidth: 80 }}>Override</th>
              <th rowSpan={2} style={{ ...thHead, color: navy, textAlign: 'center' }}>
                {record.period.name}
                <br />
                Grade
              </th>
            </tr>
            <tr>
              {byComponent.flatMap((component) => [
                ...component.assessments.map((a) => (
                  <th key={a.id} style={{ padding: '8px 8px', background: 'rgba(14,42,92,0.03)', borderBottom: '1px solid rgba(14,42,92,0.07)', fontSize: 11, fontWeight: 600, color: muted, minWidth: 84 }}>
                    <div className="flex items-center justify-center gap-1">
                      <span title={a.title} style={{ ...mono, maxWidth: 96, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.title}</span>
                      {!locked && (
                        <button onClick={() => deleteAssessment(a)} title="Delete assessment" style={{ color: faint, background: 'none', border: 'none', cursor: 'pointer', lineHeight: 1 }}>
                          ×
                        </button>
                      )}
                    </div>
                    <span style={{ ...mono, fontSize: 10, color: faint, fontWeight: 400 }}>/{fmt(a.total_points)}</span>
                  </th>
                )),
                <th key={`${component.id}-pct`} style={{ padding: '8px 8px', background: 'rgba(14,42,92,0.03)', borderBottom: '1px solid rgba(14,42,92,0.07)', borderRight: '1px solid rgba(14,42,92,0.07)', fontSize: 11, fontWeight: 700, color: navy, minWidth: 56 }}>
                  %
                </th>,
              ])}
            </tr>
          </thead>
          <tbody>
            {record.students.length === 0 ? (
              <tr>
                <td colSpan={99} style={{ padding: 32, textAlign: 'center', color: faint }}>
                  No students enrolled yet —{' '}
                  <Link to={`/teacher/classes/${classId}`} style={{ color: navy, fontWeight: 600 }}>
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
                  <tr key={student.student_id} style={{ borderBottom: '1px solid rgba(14,42,92,0.05)' }}>
                    <td style={{ position: 'sticky', left: 0, zIndex: 1, background: '#FFFFFF', padding: '8px 16px', fontWeight: 700, color: ink, borderRight: '1px solid rgba(14,42,92,0.07)', whiteSpace: 'nowrap' }}>
                      {student.last_name}, {student.first_name}
                    </td>
                    {byComponent.flatMap((component) => [
                      ...component.assessments.map((a) => {
                        const isDirty = dirty[a.id]?.[student.student_id] !== undefined
                        return (
                          <td key={a.id} style={{ padding: 4, textAlign: 'center' }}>
                            <input
                              className="ak-input"
                              value={getCell(a.id, student.student_id)}
                              onChange={(e) => setCell(a.id, student.student_id, e.target.value)}
                              disabled={locked}
                              style={cellInputStyle(isDirty, locked)}
                            />
                          </td>
                        )
                      }),
                      <td key={`${component.id}-pct`} style={{ ...mono, padding: '4px 8px', textAlign: 'center', color: navy, fontWeight: 700, borderRight: '1px solid rgba(14,42,92,0.07)' }}>
                        {fmt(grade?.components?.[component.id])}
                      </td>,
                    ])}
                    <td style={{ padding: 4, textAlign: 'center' }}>
                      <input
                        className="ak-input"
                        value={getOverride(student.student_id)}
                        onChange={(e) => setDirtyOverrides((d) => ({ ...d, [student.student_id]: e.target.value }))}
                        disabled={locked}
                        placeholder="—"
                        title="Type a grade (0–100) to override the computed grade; clear to restore"
                        style={cellInputStyle(overrideDirty, locked)}
                      />
                    </td>
                    <td
                      style={{ ...mono, padding: '6px 12px', textAlign: 'center', fontWeight: 800, color: gradeColor(grade?.grade) }}
                      title={grade?.override != null ? `Overridden (computed: ${fmt(grade?.period_grade)})` : undefined}
                    >
                      {fmt(grade?.grade)}
                      {grade?.override != null && <span style={{ color: gold }}>*</span>}
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      {dirtyCount > 0 && !locked && (
        <p style={{ fontSize: 12, color: goldDeep, marginTop: 8 }}>
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

function SummaryView({ summary }) {
  return (
    <div className="overflow-x-auto" style={{ background: '#FFFFFF', border: `1px solid ${line}`, borderRadius: 16 }}>
      <table className="w-full" style={{ borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr style={{ background: 'rgba(14,42,92,0.03)', borderBottom: '1px solid rgba(14,42,92,0.07)' }}>
            <th style={{ ...thHead, textAlign: 'left' }}>Student</th>
            {summary.periods.map((p) => (
              <th key={p.id} style={{ ...thHead, textAlign: 'center' }}>
                {p.name} {p.locked && <span title="Locked">🔒</span>}
                <span style={{ ...mono, display: 'block', fontWeight: 600, color: faint, marginTop: 2, textTransform: 'none', letterSpacing: 0 }}>{fmt(p.weight_percent)}%</span>
              </th>
            ))}
            <th style={{ ...thHead, color: navy, textAlign: 'center' }}>Final Grade</th>
          </tr>
        </thead>
        <tbody>
          {summary.students.length === 0 ? (
            <tr>
              <td colSpan={99} style={{ padding: 32, textAlign: 'center', color: faint }}>No students enrolled yet.</td>
            </tr>
          ) : (
            summary.students.map((student) => {
              const grades = summary.grades[student.student_id]
              return (
                <tr key={student.student_id} style={{ borderBottom: '1px solid rgba(14,42,92,0.05)' }}>
                  <td style={{ padding: '12px 18px', fontWeight: 700, color: ink, whiteSpace: 'nowrap' }}>
                    {student.last_name}, {student.first_name}
                  </td>
                  {summary.periods.map((p) => {
                    const cell = grades?.periods?.[p.id]
                    return (
                      <td
                        key={p.id}
                        style={{ ...mono, padding: '12px 18px', textAlign: 'center', color: '#3A4A6B' }}
                        title={cell?.override != null ? `Overridden (computed: ${fmt(cell?.computed)})` : undefined}
                      >
                        {fmt(cell?.grade)}
                        {cell?.override != null && <span style={{ color: gold }}>*</span>}
                      </td>
                    )
                  })}
                  <td style={{ ...mono, padding: '12px 18px', textAlign: 'center', fontWeight: 800, color: gradeColor(grades?.final_grade) }}>
                    {fmt(grades?.final_grade)}
                  </td>
                </tr>
              )
            })
          )}
        </tbody>
      </table>
    </div>
  )
}

function pillStyle(active) {
  return {
    padding: '8px 18px',
    fontSize: 13,
    fontWeight: 700,
    fontFamily: sans,
    borderRadius: 999,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    ...(active
      ? { color: navy, background: gold, border: `1.5px solid ${gold}`, boxShadow: '0 2px 0 rgba(14,42,92,0.18)' }
      : { color: muted, background: '#FFFFFF', border: '1.5px solid rgba(14,42,92,0.14)' }),
  }
}

export default function ClassRecordPage() {
  const { classId } = useParams()
  const queryClient = useQueryClient()
  const [tab, setTab] = useState(null) // period id, 'summary', or null = first period

  const { data: bundle, isLoading, isError } = useQuery({
    queryKey: ['fs-record', classId],
    queryFn: () => loadBundle(classId),
  })

  const refetch = () => queryClient.invalidateQueries({ queryKey: ['fs-record', classId] })

  if (isLoading) return <p style={{ color: faint }}>Loading class record…</p>
  if (isError || !bundle) return <p style={{ color: red }}>Class not found.</p>

  const subline =
    bundle.components.map((c) => `${c.name} ${fmt(c.weight_percent)}%`).join(' · ') +
    (bundle.mode === 'deped_k12' ? ' · transmuted per DepEd Order No. 8, s. 2015' : '')

  return (
    <div>
      <h1 className="text-[clamp(26px,3.5vw,32px)]" style={{ ...serif, lineHeight: 1.1, letterSpacing: '-0.01em', margin: '0 0 4px', color: ink }}>
        Class Record
      </h1>
      {bundle.configured && <p style={{ fontSize: 13.5, color: muted, margin: '0 0 22px' }}>{subline}</p>}

      {!bundle.configured ? (
        <div className="text-center" style={{ background: '#FFFFFF', border: `1px solid ${line}`, borderRadius: 16, padding: 40, marginTop: 8 }}>
          <p style={{ color: muted, margin: 0 }}>Set up grading periods and components before recording scores.</p>
          <Link
            to={`/teacher/classes/${classId}/grading`}
            className="mt-4 inline-flex transition hover:brightness-110"
            style={{ ...btnPrimary, textDecoration: 'none' }}
          >
            Open Grading Setup
            <GoldArrow />
          </Link>
        </div>
      ) : (
        (() => {
          const activePeriodId = tab && tab !== 'summary' ? tab : bundle.periods[0]?.id
          const record = buildPeriodRecord(bundle, activePeriodId)
          return (
            <>
              <div className="flex flex-wrap items-center gap-2" style={{ marginBottom: 20 }}>
                <span style={{ fontSize: 11, color: faint, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', marginRight: 6 }}>
                  Grading period
                </span>
                {bundle.periods.map((p) => (
                  <button key={p.id} onClick={() => setTab(p.id)} style={pillStyle(tab !== 'summary' && p.id === record.period.id)}>
                    {p.name}
                    {p.locked ? ' 🔒' : ''}
                  </button>
                ))}
                <button onClick={() => setTab('summary')} style={{ ...pillStyle(tab === 'summary'), marginLeft: 'auto' }}>
                  Summary
                </button>
              </div>
              {tab === 'summary' ? (
                <SummaryView summary={buildSummary(bundle)} />
              ) : (
                <RecordGrid
                  key={`${classId}-${record.period.id}-${record.period.locked}`}
                  classId={classId}
                  record={record}
                  refetch={refetch}
                />
              )}
            </>
          )
        })()
      )}
    </div>
  )
}
