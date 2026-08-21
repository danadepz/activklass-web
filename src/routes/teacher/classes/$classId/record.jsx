import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  addDoc,
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDocs,
  query,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { useAuth } from '@/context/useAuth'
import { fetchUsersByIds } from '@/lib/roster'
import { notifyStudents } from '@/lib/notifications'
import { buildPeriodRecord, buildSummary, loadBundle, syncEntries } from '@/lib/gradebook'
import { ArrowRight, Plus } from '@/components/icons'
import { navy, navyDeep, ink, gold, goldDeep, muted, faint, green, blueText, red, line, serif, mono, sansFamily as sans } from '@/theme'
import { confirmDialog, promptDialog } from '@/components/ui/dialogs'
import { SkeletonStats, SkeletonTable } from '@/components/ui/Skeleton'
import { useAsyncAction } from '@/components/ui/useAsyncAction'
import { useDialogBehavior } from '@/components/ui/useDialogBehavior'

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

// ---------------------------------------------------------------- components

function AddAssessmentModal({ classId, record, onClose, onSaved }) {
  const { overlayProps, panelProps } = useDialogBehavior(onClose, { label: 'Add an assessment', closeOnBackdrop: false })
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
    <div {...overlayProps} style={overlayStyle}>
      <form {...panelProps} onSubmit={submit} style={{ ...cardStyle, maxWidth: 460 }}>
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
  )
}

function cellInputStyle(dirty, locked, recovered) {
  return {
    ...mono,
    width: 60,
    padding: '6px 4px',
    textAlign: 'center',
    fontSize: 13,
    borderRadius: 8,
    // Unsaved edits win the border: a teacher mid-edit needs to see what they
    // have not committed more than they need to see where the mark came from.
    border: dirty
      ? '1.5px solid #F5C518'
      : recovered
        ? '1.5px solid rgba(39,174,96,0.55)'
        : '1.5px solid rgba(14,42,92,0.14)',
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
  const { profile } = useAuth()
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
          /* The recovery entry describes a score this edit is replacing, so it
             stops being true the moment the teacher types. Leaving it would
             show "was 40" beside a mark nobody recovered. */
          if (assessment.recovery?.[studentId]) {
            updates[`recovery.${studentId}`] = deleteField()
          }
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
      // Refresh each student's readable grade entry (best-effort).
      try { await syncEntries(classId) } catch { /* entries are derived; next save re-syncs */ }
      // Notify students whose scores changed (best-effort).
      const affected = new Set()
      for (const cells of Object.values(dirty)) for (const sid of Object.keys(cells)) affected.add(sid)
      for (const sid of Object.keys(dirtyOverrides)) affected.add(sid)
      if (affected.size) {
        notifyStudents({
          studentIds: [...affected],
          classId,
          createdBy: profile.id,
          type: 'score',
          message: `New scores were posted in ${record.period?.name ?? 'your class'}. Check your grades.`,
          link: `/student/classes/${classId}`,
        }).catch(() => {})
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

  const [removeAssessment, removingAssessment] = useAsyncAction(deleteAssessment)

  async function deleteAssessment(assessment) {
    if (!(await confirmDialog({
      title: `Delete "${assessment.title}"?`,
      // A quiz column is reproducible, unlike a hand-entered one -- saying so
      // stops a teacher from treating the deletion as unrecoverable, and warns
      // them it will reappear if they post from the quiz again.
      message: assessment.source_quiz_id
        ? 'Every score recorded against it goes too, and the class average is recomputed without it. This column came from a quiz — posting its scores again recreates it.'
        : 'Every score recorded against it goes too, and the class average is recomputed without it. This cannot be undone.',
      confirmLabel: 'Delete assessment',
      tone: 'danger',
    }))) return
    try {
      await deleteDoc(doc(db, 'gradebooks', classId, 'assessments', assessment.id))
      try { await syncEntries(classId) } catch { /* entries are derived; next save re-syncs */ }
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
    const ask = locked
      ? {
          title: 'Unlock this period?',
          message: 'Scores, assessments and overrides become editable again.',
          confirmLabel: 'Unlock',
        }
      : {
          title: 'Lock this period?',
          message: 'Scores, assessments and overrides become read-only until you unlock it again.',
          confirmLabel: 'Lock period',
        }
    if (!(await confirmDialog(ask))) return
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
                      {/* Marks a column the teacher did not type: its scores
                          come from quiz attempts and are re-posted from the
                          quiz's results tab, not edited to stay correct. */}
                      {a.source_quiz_id && (
                        <span title={`Posted from the quiz "${a.title}"`} style={{ color: blueText, flexShrink: 0 }} aria-label="From a quiz">◆</span>
                      )}
                      <span title={a.title} style={{ ...mono, maxWidth: 96, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.title}</span>
                      {!locked && (
                        <button
                          onClick={() => removeAssessment(a)}
                          disabled={removingAssessment}
                          title="Delete assessment"
                          aria-label={`Delete ${a.title}`}
                          className="disabled:opacity-40"
                          style={{ color: faint, background: 'none', border: 'none', cursor: 'pointer', lineHeight: 1 }}
                        >
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
                        /* A mark raised by remediation, with what it used to
                           be. Showing the original in the grid is the whole
                           point of the audit trail -- a score that changed
                           with no visible cause is the one that gets
                           contested. */
                        const recovered = a.recovery?.[student.student_id]
                        return (
                          <td key={a.id} style={{ padding: 4, textAlign: 'center' }}>
                            <input
                              className="ak-input"
                              value={getCell(a.id, student.student_id)}
                              onChange={(e) => setCell(a.id, student.student_id, e.target.value)}
                              disabled={locked}
                              style={cellInputStyle(isDirty, locked, !!recovered)}
                            />
                            {recovered && !isDirty && (
                              <div
                                title={`Recovered after remediation: was ${recovered.original_score}/${a.total_points}, practice quiz ${Math.round(recovered.remediation_pct)}%, ceiling ${recovered.cap}%. Typing over this cell clears the recovery.`}
                                style={{ ...mono, fontSize: 9.5, color: green, marginTop: 2, cursor: 'help', whiteSpace: 'nowrap' }}
                              >
                                &#8635; was {recovered.original_score}
                              </div>
                            )}
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

const GC_STATUS = {
  pending: { label: 'Pending', fg: goldDeep, bg: 'rgba(245,197,24,0.18)', border: 'rgba(245,197,24,0.55)' },
  approved: { label: 'Accepted', fg: green, bg: 'rgba(31,138,91,0.10)', border: 'rgba(31,138,91,0.4)' },
  rejected: { label: 'Rejected', fg: red, bg: 'rgba(192,57,43,0.08)', border: 'rgba(192,57,43,0.38)' },
}

/* Score disputes filed by students. Resolving records the teacher's decision;
   accepting does NOT auto-change the grade — the teacher edits the cell in the
   grid (the student's reason tells them what to re-check). */
function GradeContestsPanel({ classId }) {
  const { profile } = useAuth()
  const queryClient = useQueryClient()
  const [busyId, setBusyId] = useState(null)
  const [error, setError] = useState(null)

  const { data: contests } = useQuery({
    queryKey: ['fs-grade-contests', classId],
    queryFn: async () => {
      const snap = await getDocs(
        query(collection(db, 'grade_contests'), where('class_id', '==', classId)),
      )
      const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
      const ids = [...new Set(rows.map((c) => c.student_id))]
      const users = ids.length ? await fetchUsersByIds(ids) : []
      const nameOf = (id) => {
        const u = users.find((x) => x.id === id)
        return u ? `${u.last_name}, ${u.first_name}` : 'Student'
      }
      return rows
        .map((c) => ({ ...c, student_name: c.student_name || nameOf(c.student_id) }))
        .sort((a, b) => {
          if ((a.status === 'pending') !== (b.status === 'pending')) return a.status === 'pending' ? -1 : 1
          return (b.created_at?.seconds ?? 0) - (a.created_at?.seconds ?? 0)
        })
    },
  })

  const list = contests ?? []
  if (list.length === 0) return null
  const pendingCount = list.filter((c) => c.status === 'pending').length

  const refetch = () => {
    queryClient.invalidateQueries({ queryKey: ['fs-grade-contests', classId] })
    queryClient.invalidateQueries({ queryKey: ['fs-pending-grade-contests'] }) // refresh the bell
  }

  async function resolve(c, status) {
    let note = null
    if (status === 'rejected') {
      // Cancel now aborts. window.prompt returning null was coerced straight
      // into "no reason given" by the `?? ''`, so backing out of the box
      // rejected the dispute anyway - there was no way not to.
      const reason = await promptDialog({
        title: 'Reject this score dispute',
        message: 'The student is notified of the outcome and sees this note with it.',
        label: 'Reason (optional)',
        placeholder: 'e.g. The recorded score matches the answer sheet.',
        confirmLabel: 'Reject dispute',
        multiline: true,
        tone: 'danger',
      })
      if (reason == null) return
      note = reason.trim() || null
    }
    setBusyId(c.id)
    setError(null)
    try {
      await updateDoc(doc(db, 'grade_contests', c.id), {
        status,
        resolution_note: note,
        resolved_at: serverTimestamp(),
        resolved_by: profile.id,
      })
      await notifyStudents({
        studentIds: [c.student_id],
        classId,
        createdBy: profile.id,
        type: 'grade_contest',
        message: `Your score contest for “${c.assessment_title}” was ${status === 'approved' ? 'accepted' : 'rejected'}.`,
        link: `/student/classes/${classId}`,
      }).catch(() => {})
      refetch()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="mb-6" style={{ background: '#FFFFFF', border: `1px solid ${pendingCount ? 'rgba(245,197,24,0.55)' : line}`, borderRadius: 16, overflow: 'hidden' }}>
      <div className="flex items-center justify-between" style={{ padding: '14px 18px', borderBottom: `1px solid ${line}`, background: pendingCount ? 'rgba(245,197,24,0.08)' : 'rgba(14,42,92,0.02)' }}>
        <div style={{ fontSize: 14.5, fontWeight: 700, color: ink }}>
          Score disputes
          {pendingCount > 0 && (
            <span style={{ marginLeft: 8, fontSize: 11.5, fontWeight: 700, color: goldDeep, background: 'rgba(245,197,24,0.22)', borderRadius: 999, padding: '2px 9px' }}>
              {pendingCount} pending
            </span>
          )}
        </div>
      </div>

      {error && (
        <div role="alert" style={{ margin: '12px 18px 0', fontSize: 13, color: red, background: 'rgba(192,57,43,0.07)', border: '1px solid rgba(192,57,43,0.3)', borderRadius: 10, padding: '10px 12px' }}>{error}</div>
      )}

      <div>
        {list.map((c) => {
          const tone = GC_STATUS[c.status] ?? GC_STATUS.pending
          const scoreText = c.current_score != null ? `${c.current_score}/${c.total_points}` : '—'
          return (
            <div key={c.id} className="flex flex-wrap items-start justify-between gap-3" style={{ padding: '14px 18px', borderTop: '1px solid rgba(14,42,92,0.05)' }}>
              <div style={{ flex: 1, minWidth: 220 }}>
                <div className="flex flex-wrap items-center gap-2" style={{ marginBottom: 4 }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: ink }}>{c.student_name}</span>
                  <span style={{ ...mono, fontSize: 12, color: muted }}>· {c.assessment_title}</span>
                  <span style={{ ...mono, fontSize: 12, color: faint }}>({scoreText})</span>
                  <span style={{ display: 'inline-block', padding: '2px 9px', fontSize: 11, fontWeight: 700, borderRadius: 999, color: tone.fg, background: tone.bg, border: `1px solid ${tone.border}` }}>{tone.label}</span>
                </div>
                <div style={{ fontSize: 13, color: muted, lineHeight: 1.5 }}>{c.reason}</div>
                {c.excuse_url && (
                  <a href={c.excuse_url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12.5, fontWeight: 600, color: blueText }}>📎 View attached file</a>
                )}
                {c.status === 'rejected' && c.resolution_note && (
                  <div style={{ fontSize: 12, color: faint, marginTop: 2 }}>Note: {c.resolution_note}</div>
                )}
              </div>
              {c.status === 'pending' && (
                <div className="flex gap-2 flex-shrink-0">
                  <button onClick={() => resolve(c, 'approved')} disabled={busyId === c.id} className="transition hover:brightness-110 disabled:opacity-50" style={{ padding: '8px 14px', fontSize: 13, fontWeight: 700, color: '#FAFAF6', background: green, border: 'none', borderRadius: 9, cursor: 'pointer' }}>
                    Accept
                  </button>
                  <button onClick={() => resolve(c, 'rejected')} disabled={busyId === c.id} className="transition hover:brightness-105 disabled:opacity-50" style={{ padding: '8px 14px', fontSize: 13, fontWeight: 700, color: red, background: '#FFFFFF', border: '1.5px solid rgba(192,57,43,0.35)', borderRadius: 9, cursor: 'pointer' }}>
                    Reject
                  </button>
                </div>
              )}
            </div>
          )
        })}
      </div>
      {pendingCount > 0 && (
        <div style={{ padding: '10px 18px', fontSize: 11.5, color: faint, borderTop: `1px solid ${line}` }}>
          Accepting a dispute records your decision — adjust the actual score in the grid below if a change is warranted.
        </div>
      )}
    </div>
  )
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

  if (isLoading) {
    // Five KPI tiles then the score table, which is the shape that lands.
    return (
      <>
        <div className="mb-5"><SkeletonStats count={4} label="Loading class record" /></div>
        <SkeletonTable rows={8} cols={6} label="Loading scores" />
      </>
    )
  }
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

      <GradeContestsPanel classId={classId} />

      {!bundle.configured ? (
        <div className="text-center" style={{ background: '#FFFFFF', border: `1px solid ${line}`, borderRadius: 16, padding: 40, marginTop: 8 }}>
          <p style={{ color: muted, margin: 0 }}>Set up grading periods and components before recording scores. Grade Config covers every class you teach, so tick this one there.</p>
          <Link
            to="/teacher/grading"
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
