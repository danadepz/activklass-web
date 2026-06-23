import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { fetchUsersByIds } from '@/lib/roster'
import { ArrowRight, Sparkles } from '@/components/icons'

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

const labelStyle = { display: 'block', fontSize: 12.5, fontWeight: 600, color: ink, marginBottom: 6 }
const fieldStyle = {
  width: '100%', padding: '9px 12px', fontSize: 13, fontFamily: sans, color: ink,
  background: '#FFFFFF', border: '1.5px solid rgba(14,42,92,0.14)', borderRadius: 9,
  transition: 'border-color 0.15s, box-shadow 0.15s',
}
const btnGhost = {
  display: 'inline-flex', alignItems: 'center', gap: 7, padding: '10px 16px', fontSize: 13,
  fontWeight: 700, fontFamily: sans, color: navy, background: '#FFFFFF',
  border: '1.5px solid rgba(14,42,92,0.14)', borderRadius: 10, cursor: 'pointer',
}
const btnDanger = {
  padding: '10px 16px', fontSize: 13, fontWeight: 600, fontFamily: sans, color: red,
  background: '#FFFFFF', border: '1.5px solid rgba(192,57,43,0.3)', borderRadius: 10, cursor: 'pointer',
}
const btnPrimary = {
  display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 18px', fontSize: 14,
  fontWeight: 700, fontFamily: sans, color: '#FAFAF6', background: navy, border: 'none',
  borderRadius: 11, cursor: 'pointer', boxShadow: `0 3px 0 ${navyDeep}`,
}
const btnGold = {
  padding: '10px 16px', fontSize: 13, fontWeight: 700, fontFamily: sans, color: goldDeep,
  background: 'rgba(245,197,24,0.18)', border: '1.5px solid rgba(245,197,24,0.55)', borderRadius: 10, cursor: 'pointer',
}
const linkBtn = { display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 700, fontFamily: sans, color: navy, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }
const iconBtn = { color: faint, background: 'none', border: 'none', cursor: 'pointer', padding: '2px 6px', fontSize: 14, lineHeight: 1 }

function GoldArrow() {
  return (
    <span style={{ display: 'inline-grid', placeItems: 'center', width: 20, height: 20, borderRadius: '50%', background: gold, color: navy }}>
      <ArrowRight className="h-3 w-3" />
    </span>
  )
}

let keyCounter = 0
const newKey = () => `qk${++keyCounter}`
const newId = () =>
  globalThis.crypto?.randomUUID?.() ?? `id-${Date.now()}-${Math.random().toString(36).slice(2)}`

const TYPE_LABELS = {
  mcq: 'Multiple choice',
  true_false: 'True / False',
  matching: 'Matching',
  short_answer: 'Short answer',
  essay: 'Essay',
}

function sumPoints(questions) {
  return (questions ?? []).reduce((sum, q) => sum + (Number(q.points) || 0), 0)
}

function toEditable(question) {
  return {
    _key: newKey(),
    id: question.id ?? null,
    qtype: question.qtype,
    text: question.text ?? '',
    points: String(question.points ?? 1),
    ai_generated: question.ai_generated ?? false,
    options: (question.options ?? []).map((o) => ({
      _key: newKey(), id: o.id ?? null, text: o.text ?? '', is_correct: !!o.is_correct,
    })),
    tfValue: question.answer_key?.value ?? true,
    answersText: (question.answer_key?.answers ?? []).join('\n'),
    pairs: (question.answer_key?.pairs ?? []).map((p) => ({
      _key: newKey(), left: p.left ?? '', right: p.right ?? '',
    })),
    rubric: question.rubric ?? '',
  }
}

function blankQuestion() {
  return toEditable({
    qtype: 'mcq', text: '', points: 1,
    options: [
      { text: '', is_correct: true },
      { text: '', is_correct: false },
      { text: '', is_correct: false },
    ],
  })
}

function toPayload(q) {
  const base = { id: q.id || newId(), qtype: q.qtype, text: q.text, points: Number(q.points), ai_generated: q.ai_generated }
  if (q.qtype === 'mcq') {
    base.options = q.options.map((o) => ({ id: o.id || newId(), text: o.text, is_correct: o.is_correct }))
  } else if (q.qtype === 'true_false') {
    base.answer_key = { value: q.tfValue }
  } else if (q.qtype === 'short_answer') {
    base.answer_key = { answers: q.answersText.split('\n').map((s) => s.trim()).filter(Boolean) }
  } else if (q.qtype === 'matching') {
    base.answer_key = { pairs: q.pairs.map((p) => ({ left: p.left, right: p.right })) }
  } else if (q.qtype === 'essay') {
    base.rubric = q.rubric
  }
  return base
}

function QuestionCard({ q, index, update, remove, moveUp, moveDown }) {
  const setOptions = (options) => update({ options })
  return (
    <div className="mt-3" style={{ background: '#FFFFFF', border: `1px solid ${line}`, borderRadius: 14, padding: 18 }}>
      <div className="flex items-center gap-2">
        <span style={{ ...mono, background: navy, color: gold, fontSize: 11, fontWeight: 700, padding: '5px 9px', borderRadius: 7 }}>Q{index + 1}</span>
        <select value={q.qtype} onChange={(e) => update({ qtype: e.target.value })} className="ak-input" style={{ ...fieldStyle, width: 'auto', cursor: 'pointer' }}>
          {Object.entries(TYPE_LABELS).map(([k, label]) => (
            <option key={k} value={k}>{label}</option>
          ))}
        </select>
        <div className="relative ml-auto">
          <input type="number" min="0.5" step="0.5" value={q.points} onChange={(e) => update({ points: e.target.value })} className="ak-input" style={{ ...fieldStyle, width: 80, paddingRight: 30, textAlign: 'right' }} />
          <span style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 11, color: faint }}>pts</span>
        </div>
        <button onClick={moveUp} title="Move up" style={iconBtn} className="transition hover:text-[#0A1733]">↑</button>
        <button onClick={moveDown} title="Move down" style={iconBtn} className="transition hover:text-[#0A1733]">↓</button>
        <button onClick={remove} title="Remove question" style={{ ...iconBtn, fontSize: 18 }} className="transition hover:text-[#C0392B]">×</button>
      </div>

      <textarea rows={2} placeholder="Question text" value={q.text} onChange={(e) => update({ text: e.target.value })} className="ak-input" style={{ ...fieldStyle, marginTop: 10, resize: 'vertical' }} />

      {q.qtype === 'mcq' && (
        <div className="mt-2 flex flex-col gap-1.5">
          {q.options.map((o, i) => (
            <div key={o._key} className="flex items-center gap-2">
              <input type="radio" name={`correct-${q._key}`} checked={o.is_correct} onChange={() => setOptions(q.options.map((x, j) => ({ ...x, is_correct: j === i })))} title="Correct answer" style={{ accentColor: navy, width: 16, height: 16 }} />
              <input placeholder={`Option ${i + 1}`} value={o.text} onChange={(e) => setOptions(q.options.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)))} className="ak-input" style={{ ...fieldStyle, flex: 1 }} />
              <button onClick={() => setOptions(q.options.filter((_, j) => j !== i))} disabled={q.options.length <= 2} style={{ ...iconBtn, opacity: q.options.length <= 2 ? 0.3 : 1 }} className="transition hover:text-[#C0392B] disabled:cursor-not-allowed">×</button>
            </div>
          ))}
          <button onClick={() => setOptions([...q.options, { _key: newKey(), id: null, text: '', is_correct: false }])} className="transition hover:opacity-70" style={{ ...linkBtn, fontSize: 12.5, alignSelf: 'flex-start', marginTop: 2 }}>
            <span style={{ color: gold }}>+</span> Add option
          </button>
        </div>
      )}

      {q.qtype === 'true_false' && (
        <div className="mt-2 flex gap-4" style={{ fontSize: 13, color: '#3A4A6B' }}>
          {[true, false].map((v) => (
            <label key={String(v)} className="flex items-center gap-1.5" style={{ cursor: 'pointer' }}>
              <input type="radio" name={`tf-${q._key}`} checked={q.tfValue === v} onChange={() => update({ tfValue: v })} style={{ accentColor: navy }} />
              {v ? 'True' : 'False'} is correct
            </label>
          ))}
        </div>
      )}

      {q.qtype === 'short_answer' && (
        <textarea rows={2} placeholder={'Accepted answers — one per line (case-insensitive)'} value={q.answersText} onChange={(e) => update({ answersText: e.target.value })} className="ak-input" style={{ ...fieldStyle, marginTop: 8, resize: 'vertical' }} />
      )}

      {q.qtype === 'matching' && (
        <div className="mt-2 flex flex-col gap-1.5">
          {q.pairs.map((p, i) => (
            <div key={p._key} className="flex items-center gap-2">
              <input placeholder="Left item" value={p.left} onChange={(e) => update({ pairs: q.pairs.map((x, j) => (j === i ? { ...x, left: e.target.value } : x)) })} className="ak-input" style={{ ...fieldStyle, flex: 1 }} />
              <span style={{ color: faint }}>→</span>
              <input placeholder="Matches with" value={p.right} onChange={(e) => update({ pairs: q.pairs.map((x, j) => (j === i ? { ...x, right: e.target.value } : x)) })} className="ak-input" style={{ ...fieldStyle, flex: 1 }} />
              <button onClick={() => update({ pairs: q.pairs.filter((_, j) => j !== i) })} style={iconBtn} className="transition hover:text-[#C0392B]">×</button>
            </div>
          ))}
          <button onClick={() => update({ pairs: [...q.pairs, { _key: newKey(), left: '', right: '' }] })} className="transition hover:opacity-70" style={{ ...linkBtn, fontSize: 12.5, alignSelf: 'flex-start', marginTop: 2 }}>
            <span style={{ color: gold }}>+</span> Add pair
          </button>
        </div>
      )}

      {q.qtype === 'essay' && (
        <textarea rows={2} placeholder="Grading rubric (what a full-credit answer includes)" value={q.rubric} onChange={(e) => update({ rubric: e.target.value })} className="ak-input" style={{ ...fieldStyle, marginTop: 8, resize: 'vertical' }} />
      )}
    </div>
  )
}

const thHead = { padding: '13px 18px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: muted, letterSpacing: '0.06em', textTransform: 'uppercase' }

function ResultsView({ classId, quizId, totalPoints, assignedTo }) {
  const { data, isLoading } = useQuery({
    queryKey: ['fs-quiz-results', classId, quizId, Array.isArray(assignedTo) ? assignedTo.join(',') : 'all'],
    queryFn: async () => {
      const classSnap = await getDoc(doc(db, 'classes', classId))
      const ids = classSnap.data()?.student_ids ?? []
      const users = ids.length ? await fetchUsersByIds(ids) : []
      const students = users
        .filter((u) => !Array.isArray(assignedTo) || assignedTo.includes(u.id))
        .map((u) => ({ student_id: u.id, first_name: u.first_name, last_name: u.last_name }))
        .sort((a, b) =>
          `${a.last_name} ${a.first_name}`.localeCompare(`${b.last_name} ${b.first_name}`),
        )
      const attemptsSnap = await getDocs(
        query(collection(db, 'quiz_attempts'), where('quiz_id', '==', quizId)),
      )
      const attempts = {}
      attemptsSnap.forEach((d) => {
        const a = d.data()
        ;(attempts[a.student_id] ??= []).push(a)
      })
      return { students, attempts }
    },
  })
  if (isLoading) return <p className="mt-4" style={{ color: faint }}>Loading results…</p>

  return (
    <div className="mt-4 overflow-x-auto" style={{ background: '#FFFFFF', border: `1px solid ${line}`, borderRadius: 16 }}>
      <table className="w-full" style={{ borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr style={{ background: 'rgba(14,42,92,0.03)', borderBottom: '1px solid rgba(14,42,92,0.07)' }}>
            <th style={thHead}>Student</th>
            <th style={{ ...thHead, textAlign: 'center' }}>Attempts</th>
            <th style={{ ...thHead, textAlign: 'center' }}>Best Score</th>
            <th style={thHead}>Status</th>
          </tr>
        </thead>
        <tbody>
          {data.students.map((s) => {
            const attempts = data.attempts[s.student_id] ?? []
            const scores = attempts.filter((a) => a.total_score != null).map((a) => a.total_score)
            const best = scores.length ? Math.max(...scores) : null
            const pendingEssay = attempts.some((a) => a.status === 'submitted')
            return (
              <tr key={s.student_id} style={{ borderBottom: '1px solid rgba(14,42,92,0.05)' }}>
                <td style={{ padding: '12px 18px', fontWeight: 700, color: ink }}>{s.last_name}, {s.first_name}</td>
                <td style={{ ...mono, padding: '12px 18px', textAlign: 'center', color: '#3A4A6B' }}>{attempts.length || '—'}</td>
                <td style={{ ...mono, padding: '12px 18px', textAlign: 'center', fontWeight: 700, color: best !== null ? ink : faint }}>
                  {best !== null ? `${best} / ${totalPoints}` : '—'}
                </td>
                <td style={{ padding: '12px 18px', color: muted }}>
                  {attempts.length === 0 ? 'Not taken' : pendingEssay ? 'Essay pending review' : 'Graded'}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

/* Reusable roster checklist for "assign to specific students". */
function StudentChecklist({ students, ids, setIds }) {
  if (students.length === 0) {
    return <p style={{ fontSize: 12.5, color: faint, padding: '12px 14px', margin: 0 }}>No students enrolled in this class yet.</p>
  }
  const allSelected = ids.length === students.length
  return (
    <div style={{ border: `1px solid ${line}`, borderRadius: 10, marginTop: 10, maxHeight: 220, overflowY: 'auto' }}>
      <div className="flex items-center justify-between" style={{ padding: '8px 14px', borderBottom: `1px solid ${line}`, position: 'sticky', top: 0, background: '#FFFFFF' }}>
        <span style={{ fontSize: 12, color: muted }}>{ids.length} of {students.length} selected</span>
        <button type="button" onClick={() => setIds(allSelected ? [] : students.map((s) => s.id))} style={{ fontSize: 12, fontWeight: 700, color: navy, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
          {allSelected ? 'Clear all' : 'Select all'}
        </button>
      </div>
      {students.map((s) => (
        <label key={s.id} className="flex items-center gap-2.5 hover:bg-slate-50" style={{ padding: '8px 14px', fontSize: 13, color: ink, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={ids.includes(s.id)}
            onChange={() => setIds((prev) => (prev.includes(s.id) ? prev.filter((x) => x !== s.id) : [...prev, s.id]))}
            style={{ accentColor: navy, width: 15, height: 15 }}
          />
          {s.name}
        </label>
      ))}
    </div>
  )
}

/* Change who a (published) quiz is assigned to without unpublishing it. */
function AssignmentEditor({ quizId, assignedTo, students, onSaved }) {
  const [editing, setEditing] = useState(false)
  const [mode, setMode] = useState(Array.isArray(assignedTo) ? 'specific' : 'all')
  const [ids, setIds] = useState(Array.isArray(assignedTo) ? assignedTo : [])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const summary = Array.isArray(assignedTo) ? `${assignedTo.length} student${assignedTo.length === 1 ? '' : 's'}` : 'All students'

  function open() {
    setMode(Array.isArray(assignedTo) ? 'specific' : 'all')
    setIds(Array.isArray(assignedTo) ? assignedTo : [])
    setError(null)
    setEditing(true)
  }

  async function save() {
    if (mode === 'specific' && ids.length === 0) {
      setError('Select at least one student, or choose "All students".')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await updateDoc(doc(db, 'quizzes', quizId), {
        assigned_to: mode === 'specific' ? ids : 'all',
        updated_at: serverTimestamp(),
      })
      setEditing(false)
      onSaved()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mt-4" style={{ background: '#FFFFFF', border: `1px solid ${line}`, borderRadius: 16, padding: 18 }}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: ink }}>Assignment</div>
          <div style={{ fontSize: 13, color: muted, marginTop: 2 }}>{editing ? 'Choose who can take this quiz.' : `Assigned to: ${summary}`}</div>
        </div>
        {!editing && (
          <button onClick={open} className="transition hover:brightness-105" style={btnGhost}>Edit assignment</button>
        )}
      </div>

      {editing && (
        <div style={{ marginTop: 14 }}>
          <div className="flex gap-5" style={{ fontSize: 13, color: '#3A4A6B' }}>
            <label className="flex items-center gap-1.5" style={{ cursor: 'pointer' }}>
              <input type="radio" name="assign-edit" checked={mode === 'all'} onChange={() => setMode('all')} style={{ accentColor: navy }} />
              All students
            </label>
            <label className="flex items-center gap-1.5" style={{ cursor: 'pointer' }}>
              <input type="radio" name="assign-edit" checked={mode === 'specific'} onChange={() => setMode('specific')} style={{ accentColor: navy }} />
              Specific students
            </label>
          </div>
          {mode === 'specific' && <StudentChecklist students={students} ids={ids} setIds={setIds} />}
          {error && (
            <p role="alert" className="mt-3" style={{ fontSize: 13, color: red, background: 'rgba(192,57,43,0.07)', border: '1px solid rgba(192,57,43,0.3)', borderRadius: 10, padding: '10px 12px' }}>{error}</p>
          )}
          <div className="flex gap-2.5" style={{ marginTop: 14 }}>
            <button onClick={save} disabled={saving} className="transition hover:brightness-110 disabled:opacity-50" style={btnPrimary}>
              {saving ? 'Saving…' : 'Save assignment'}
            </button>
            <button onClick={() => setEditing(false)} disabled={saving} className="transition hover:brightness-105" style={btnGhost}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  )
}

function BuilderForm({ classId, quiz, students, refetch }) {
  const navigate = useNavigate()
  const [settings, setSettings] = useState({
    title: quiz.title,
    instructions: quiz.instructions ?? '',
    time_limit_minutes: quiz.time_limit_minutes ?? '',
    attempts_allowed: quiz.attempts_allowed ?? 1,
    shuffle_questions: quiz.shuffle_questions ?? false,
    prevent_backtracking: quiz.prevent_backtracking ?? false,
    opens_at: quiz.opens_at?.slice(0, 16) ?? '',
    closes_at: quiz.closes_at?.slice(0, 16) ?? '',
  })
  // Assignment: 'all' (string) or an explicit list of student ids.
  const [assignMode, setAssignMode] = useState(Array.isArray(quiz.assigned_to) ? 'specific' : 'all')
  const [assignedIds, setAssignedIds] = useState(Array.isArray(quiz.assigned_to) ? quiz.assigned_to : [])
  const [questions, setQuestions] = useState((quiz.questions ?? []).map(toEditable))
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [publishing, setPublishing] = useState(false)

  const set = (key) => (e) =>
    setSettings((s) => ({ ...s, [key]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }))

  const totalPoints = questions.reduce((sum, q) => sum + (Number(q.points) || 0), 0)

  async function persist(extra = {}) {
    await updateDoc(doc(db, 'quizzes', quiz.id), {
      title: settings.title,
      instructions: settings.instructions,
      time_limit_minutes: settings.time_limit_minutes ? Number(settings.time_limit_minutes) : null,
      attempts_allowed: Number(settings.attempts_allowed) || 1,
      shuffle_questions: !!settings.shuffle_questions,
      prevent_backtracking: !!settings.prevent_backtracking,
      opens_at: settings.opens_at || null,
      closes_at: settings.closes_at || null,
      assigned_to: assignMode === 'specific' ? assignedIds : 'all',
      questions: questions.map(toPayload),
      updated_at: serverTimestamp(),
      ...extra,
    })
  }

  async function save() {
    setSaving(true)
    setError(null)
    setSaved(false)
    try {
      await persist()
      refetch()
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  async function publish() {
    if (questions.length === 0) return
    if (assignMode === 'specific' && assignedIds.length === 0) {
      setError('Select at least one student, or choose "All students".')
      return
    }
    if (
      !window.confirm(
        'Publish this quiz? It opens to students and locks editing. (You can close it later.)',
      )
    )
      return
    setPublishing(true)
    setError(null)
    try {
      await persist({ status: 'published', published_at: serverTimestamp() })
      refetch()
    } catch (err) {
      setError(err.message)
      setPublishing(false)
    }
  }

  async function deleteQuiz() {
    if (!window.confirm('Delete this draft quiz?')) return
    try {
      await deleteDoc(doc(db, 'quizzes', quiz.id))
      navigate(`/teacher/classes/${classId}/quizzes`)
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <div className="max-w-3xl">
      {error && (
        <p className="mt-4" style={{ fontSize: 13, color: red, background: 'rgba(192,57,43,0.07)', border: '1px solid rgba(192,57,43,0.3)', borderRadius: 10, padding: '10px 12px' }}>{error}</p>
      )}
      {saved && (
        <p className="mt-4" style={{ fontSize: 13, color: green, background: 'rgba(31,138,91,0.08)', border: '1px solid rgba(31,138,91,0.35)', borderRadius: 10, padding: '10px 12px' }}>Quiz saved.</p>
      )}

      <div className="mt-4 flex flex-col gap-3" style={{ background: '#FFFFFF', border: `1px solid ${line}`, borderRadius: 16, padding: 22 }}>
        <div className="grid grid-cols-3 gap-3">
          <div className="col-span-2">
            <label style={labelStyle}>Title</label>
            <input className="ak-input" value={settings.title} onChange={set('title')} style={fieldStyle} />
          </div>
          <div>
            <label style={labelStyle}>Time limit (min)</label>
            <input className="ak-input" type="number" min="1" placeholder="None" value={settings.time_limit_minutes} onChange={set('time_limit_minutes')} style={fieldStyle} />
          </div>
        </div>
        <div>
          <label style={labelStyle}>Instructions (optional)</label>
          <input className="ak-input" value={settings.instructions} onChange={set('instructions')} style={fieldStyle} />
        </div>
        <div className="grid grid-cols-2 items-end gap-3 sm:grid-cols-4">
          <div>
            <label style={labelStyle}>Attempts</label>
            <input className="ak-input" type="number" min="1" max="10" value={settings.attempts_allowed} onChange={set('attempts_allowed')} style={fieldStyle} />
          </div>
          <div>
            <label style={labelStyle}>Opens</label>
            <input className="ak-input" type="datetime-local" value={settings.opens_at} onChange={set('opens_at')} style={fieldStyle} />
          </div>
          <div>
            <label style={labelStyle}>Closes</label>
            <input className="ak-input" type="datetime-local" value={settings.closes_at} onChange={set('closes_at')} style={fieldStyle} />
          </div>
          <div className="flex flex-col gap-2 pb-2">
            <label className="flex items-center gap-2" style={{ fontSize: 13, color: '#3A4A6B', cursor: 'pointer' }}>
              <input type="checkbox" checked={settings.shuffle_questions} onChange={set('shuffle_questions')} style={{ accentColor: navy, width: 16, height: 16 }} />
              Shuffle questions
            </label>
            <label className="flex items-center gap-2" style={{ fontSize: 13, color: '#3A4A6B', cursor: 'pointer' }}>
              <input type="checkbox" checked={settings.prevent_backtracking} onChange={set('prevent_backtracking')} style={{ accentColor: navy, width: 16, height: 16 }} />
              Prevent backtracking
            </label>
          </div>
        </div>

        {/* Assignment — all students or a specific subset */}
        <div style={{ borderTop: `1px solid ${line}`, paddingTop: 14 }}>
          <label style={labelStyle}>Assign to</label>
          <div className="flex gap-5" style={{ fontSize: 13, color: '#3A4A6B' }}>
            <label className="flex items-center gap-1.5" style={{ cursor: 'pointer' }}>
              <input type="radio" name="assign-mode" checked={assignMode === 'all'} onChange={() => setAssignMode('all')} style={{ accentColor: navy }} />
              All students
            </label>
            <label className="flex items-center gap-1.5" style={{ cursor: 'pointer' }}>
              <input type="radio" name="assign-mode" checked={assignMode === 'specific'} onChange={() => setAssignMode('specific')} style={{ accentColor: navy }} />
              Specific students
            </label>
          </div>
          {assignMode === 'specific' && <StudentChecklist students={students} ids={assignedIds} setIds={setAssignedIds} />}
        </div>
      </div>

      <div className="mt-5 flex items-center justify-between">
        <h3 style={{ ...serif, fontSize: 18, color: ink, margin: 0 }}>
          Questions <span style={{ ...mono, fontSize: 13, color: faint, fontWeight: 400 }}>({questions.length} · {totalPoints} pts)</span>
        </h3>
      </div>

      {questions.map((q, i) => (
        <QuestionCard
          key={q._key}
          q={q}
          index={i}
          update={(patch) => setQuestions(questions.map((x, j) => (j === i ? { ...x, ...patch } : x)))}
          remove={() => setQuestions(questions.filter((_, j) => j !== i))}
          moveUp={() => i > 0 && setQuestions(questions.map((x, j) => (j === i - 1 ? questions[i] : j === i ? questions[i - 1] : x)))}
          moveDown={() => i < questions.length - 1 && setQuestions(questions.map((x, j) => (j === i ? questions[i + 1] : j === i + 1 ? questions[i] : x)))}
        />
      ))}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 pb-8">
        <div className="flex gap-2.5">
          <button onClick={() => setQuestions([...questions, blankQuestion()])} className="transition hover:brightness-105" style={btnGhost}>
            <span style={{ color: gold }}>+</span> Add question
          </button>
          <button onClick={deleteQuiz} className="transition hover:brightness-105" style={btnDanger}>
            Delete draft
          </button>
        </div>
        <div className="flex gap-2.5">
          <button onClick={save} disabled={saving} className="transition hover:brightness-105 disabled:opacity-50 disabled:cursor-not-allowed" style={btnGhost}>
            {saving ? 'Saving…' : 'Save draft'}
          </button>
          <button onClick={publish} disabled={saving || publishing || questions.length === 0} className="transition hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed" style={btnPrimary}>
            {publishing ? 'Publishing…' : 'Publish'}
            <GoldArrow />
          </button>
        </div>
      </div>
    </div>
  )
}

export default function QuizBuilderPage() {
  const { classId, quizId } = useParams()
  const queryClient = useQueryClient()

  const { data: quiz, isLoading, isError } = useQuery({
    queryKey: ['fs-quiz', classId, quizId],
    queryFn: async () => {
      const snap = await getDoc(doc(db, 'quizzes', quizId))
      if (!snap.exists()) throw new Error('Quiz not found')
      return { id: snap.id, ...snap.data() }
    },
  })

  // Roster for the "assign to specific students" picker.
  const { data: roster } = useQuery({
    queryKey: ['fs-quiz-roster', classId],
    queryFn: async () => {
      const snap = await getDoc(doc(db, 'classes', classId))
      const ids = snap.data()?.student_ids ?? []
      const users = ids.length ? await fetchUsersByIds(ids) : []
      return users
        .map((u) => ({ id: u.id, name: `${u.last_name ?? ''}, ${u.first_name ?? ''}`.replace(/^,\s*/, '').trim() }))
        .sort((a, b) => a.name.localeCompare(b.name))
    },
  })

  const refetch = () => {
    queryClient.invalidateQueries({ queryKey: ['fs-quiz', classId, quizId] })
    queryClient.invalidateQueries({ queryKey: ['fs-quizzes', classId] })
    queryClient.invalidateQueries({ queryKey: ['fs-quiz-results', classId, quizId] })
  }

  async function closeQuiz() {
    if (!window.confirm('Close this quiz? Students will no longer be able to take it.')) return
    await updateDoc(doc(db, 'quizzes', quizId), { status: 'closed', updated_at: serverTimestamp() })
    refetch()
  }

  if (isLoading) return <p style={{ color: faint }}>Loading quiz…</p>
  if (isError || !quiz) return <p style={{ color: red }}>Quiz not found.</p>

  const editable = quiz.status === 'draft'
  const questionCount = quiz.questions?.length ?? 0
  const totalPoints = sumPoints(quiz.questions)

  return (
    <div>
      <Link to={`/teacher/classes/${classId}/quizzes`} className="inline-flex items-center gap-1.5 transition hover:opacity-70" style={{ fontSize: 13, fontWeight: 600, color: navy, textDecoration: 'none' }}>
        ← Back to quizzes
      </Link>
      <div className="mt-2 flex max-w-3xl items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-[clamp(24px,3.2vw,30px)]" style={{ ...serif, lineHeight: 1.1, letterSpacing: '-0.01em', margin: '0 0 4px', color: ink }}>
            {quiz.title}
            {quiz.generated_by === 'ai_generated' && (
              <span title="AI-generated" style={{ color: blueText, display: 'inline-flex' }}>
                <Sparkles className="h-5 w-5" />
              </span>
            )}
          </h1>
          <p className="capitalize" style={{ ...mono, fontSize: 13, color: muted, margin: 0 }}>
            {quiz.status} · {questionCount} questions · {totalPoints} pts ·{' '}
            {Array.isArray(quiz.assigned_to) ? `${quiz.assigned_to.length} student${quiz.assigned_to.length === 1 ? '' : 's'}` : 'all students'}
          </p>
        </div>
        {quiz.status === 'published' && (
          <button onClick={closeQuiz} className="transition hover:brightness-105" style={btnGold}>
            Close quiz
          </button>
        )}
      </div>

      {editable ? (
        <>
          {quiz.generated_by === 'ai_generated' && (
            <div className="mt-4 flex max-w-3xl items-center gap-2.5" style={{ background: 'rgba(63,169,245,0.06)', border: '1px solid rgba(63,169,245,0.3)', borderRadius: 11, padding: '12px 14px', fontSize: 13, color: ink }}>
              <span style={{ display: 'inline-grid', placeItems: 'center', width: 22, height: 22, borderRadius: 7, background: 'rgba(63,169,245,0.2)', color: blueText, flexShrink: 0 }}>
                <Sparkles className="h-3 w-3" />
              </span>
              AI-generated draft — review every question and answer key before publishing.
            </div>
          )}
          <BuilderForm key={quiz.id} classId={classId} quiz={quiz} students={roster ?? []} refetch={refetch} />
        </>
      ) : (
        <div className="max-w-3xl">
          <AssignmentEditor quizId={quizId} assignedTo={quiz.assigned_to} students={roster ?? []} onSaved={refetch} />
          <ResultsView classId={classId} quizId={quizId} totalPoints={totalPoints} assignedTo={quiz.assigned_to} />
          <div className="mt-4" style={{ background: '#FFFFFF', border: `1px solid ${line}`, borderRadius: 16, padding: 22 }}>
            <h3 style={{ ...serif, fontSize: 18, color: ink, margin: '0 0 12px' }}>Questions (read-only)</h3>
            {(quiz.questions ?? []).map((q, i) => (
              <div key={q.id} style={{ borderBottom: '1px solid rgba(14,42,92,0.05)', padding: '8px 0' }}>
                <p style={{ fontSize: 13, color: '#3A4A6B', margin: 0 }}>
                  <span style={{ fontWeight: 700, color: ink }}>Q{i + 1}.</span> {q.text}
                  <span style={{ color: faint }}> · {TYPE_LABELS[q.qtype]} · {q.points} pts</span>
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
