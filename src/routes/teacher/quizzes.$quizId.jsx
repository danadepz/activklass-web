import { useEffect, useState } from 'react'
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
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { api } from '@/lib/api'
import { useAuth } from '@/context/useAuth'
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

const btnModalGhost = {
  padding: '12px 20px', fontSize: 14, fontWeight: 600, fontFamily: sans, color: '#3A4A6B',
  background: '#FFFFFF', border: '1.5px solid rgba(14,42,92,0.14)', borderRadius: 10, cursor: 'pointer',
}
const btnModalPrimary = {
  display: 'inline-flex', alignItems: 'center', gap: 9, padding: '12px 20px', fontSize: 14,
  fontWeight: 700, fontFamily: sans, color: '#FAFAF6', background: navy, border: 'none',
  borderRadius: 10, cursor: 'pointer', boxShadow: `0 3px 0 ${navyDeep}`,
}

function GoldArrow() {
  return (
    <span style={{ display: 'inline-grid', placeItems: 'center', width: 20, height: 20, borderRadius: '50%', background: gold, color: navy }}>
      <ArrowRight className="h-3 w-3" />
    </span>
  )
}

function AlertBox({ children }) {
  return (
    <div role="alert" style={{ fontSize: 13, color: red, background: 'rgba(192,57,43,0.07)', border: '1px solid rgba(192,57,43,0.3)', borderRadius: 10, padding: '10px 12px' }}>
      {children}
    </div>
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

function QuestionCard({ q, index, update, remove, moveUp, moveDown, saveToBank }) {
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
        <button type="button" onClick={saveToBank} title="Save to Quiz Bank" style={{ ...iconBtn, fontSize: 14 }} className="transition hover:text-indigo-600 flex items-center gap-0.5">
          💾 <span className="text-[10px] font-bold">Save</span>
        </button>
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
        // filter attempts for this specific class
        if (a.class_id === classId) {
          ;(attempts[a.student_id] ??= []).push(a)
        }
      })
      return { students, attempts }
    },
    enabled: !!classId,
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
            const studentAttempts = data.attempts[s.student_id] ?? []
            const scores = studentAttempts.filter((a) => a.total_score != null).map((a) => a.total_score)
            const best = scores.length ? Math.max(...scores) : null
            const pendingEssay = studentAttempts.some((a) => a.status === 'submitted')
            return (
              <tr key={s.student_id} style={{ borderBottom: '1px solid rgba(14,42,92,0.05)' }}>
                <td style={{ padding: '12px 18px', fontWeight: 700, color: ink }}>{s.last_name}, {s.first_name}</td>
                <td style={{ ...mono, padding: '12px 18px', textAlign: 'center', color: '#3A4A6B' }}>{studentAttempts.length || '—'}</td>
                <td style={{ ...mono, padding: '12px 18px', textAlign: 'center', fontWeight: 700, color: best !== null ? ink : faint }}>
                  {best !== null ? `${best} / ${totalPoints}` : '—'}
                </td>
                <td style={{ padding: '12px 18px', color: muted }}>
                  {studentAttempts.length === 0 ? 'Not taken' : pendingEssay ? 'Essay pending review' : 'Graded'}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function PublishModal({ isOpen, onClose, assignedClasses, gradebooksMap, onConfirm, isPublishing }) {
  const [mappings, setMappings] = useState({})
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!isOpen) return
    const initial = {}
    let err = null
    for (const c of assignedClasses) {
      const gb = gradebooksMap?.[c.id]
      if (!gb || !gb.configured || !gb.components?.length || !gb.periods?.length) {
        err = `Class "${c.section} · ${c.subject}" has not configured its Grade Config yet. Please go to Grade Config and configure it before publishing.`
        continue
      }
      initial[c.id] = {
        component_id: gb.components[0].id,
        grading_period_id: gb.periods[0].id,
      }
    }
    setMappings(initial)
    setError(err)
  }, [isOpen, assignedClasses, gradebooksMap])

  if (!isOpen) return null

  const handleConfirm = () => {
    for (const c of assignedClasses) {
      if (!mappings[c.id]?.component_id || !mappings[c.id]?.grading_period_id) {
        setError(`Please map the grading component and period for "${c.section}".`)
        return
      }
    }
    onConfirm(mappings)
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(14,23,51,0.55)', backdropFilter: 'blur(3px)', WebkitBackdropFilter: 'blur(3px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 24 }}>
      <div style={{ width: '100%', maxWidth: 500, background: '#FFFFFF', borderRadius: 20, boxShadow: '0 40px 80px -20px rgba(14,42,92,0.45)', overflow: 'hidden', display: 'flex', flexDirection: 'column', maxHeight: '90vh' }}>
        <div style={{ padding: '24px 28px 20px', borderBottom: '1px solid rgba(14,42,92,0.07)', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
          <h2 style={{ ...serif, fontSize: 22, margin: 0, color: ink }}>Publish Quiz</h2>
        </div>
        <div style={{ padding: '24px 28px', overflowY: 'auto' }} className="flex flex-col gap-4">
          <p style={{ fontSize: 13.5, color: muted, lineHeight: 1.55, margin: 0 }}>
            Map this quiz to a grading component and grading period for each assigned class to create score records in their gradebooks.
          </p>
          {error && <AlertBox>{error}</AlertBox>}

          {!error && assignedClasses.map((c) => {
            const gb = gradebooksMap?.[c.id]
            const current = mappings[c.id] || {}
            return (
              <div key={c.id} style={{ border: `1px solid ${line}`, borderRadius: 12, padding: 14 }} className="space-y-3">
                <div style={{ fontWeight: 700, color: ink, fontSize: 14 }}>{c.section} · {c.subject}</div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: muted, marginBottom: 4 }}>Grading Component</label>
                    <select
                      className="ak-input w-full"
                      value={current.component_id || ''}
                      onChange={(e) => setMappings({ ...mappings, [c.id]: { ...current, component_id: e.target.value } })}
                      style={{ ...fieldStyle, fontSize: 13, padding: '8px 10px' }}
                    >
                      {gb?.components?.map((comp) => (
                        <option key={comp.id} value={comp.id}>{comp.name} ({comp.weight_percent}%)</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: muted, marginBottom: 4 }}>Grading Period</label>
                    <select
                      className="ak-input w-full"
                      value={current.grading_period_id || ''}
                      onChange={(e) => setMappings({ ...mappings, [c.id]: { ...current, grading_period_id: e.target.value } })}
                      style={{ ...fieldStyle, fontSize: 13, padding: '8px 10px' }}
                    >
                      {gb?.periods?.map((per) => (
                        <option key={per.id} value={per.id}>{per.name} ({per.weight_percent}%)</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, padding: '16px 28px', borderTop: '1px solid rgba(14,42,92,0.07)', background: 'rgba(14,42,92,0.02)', flexShrink: 0 }}>
          <button type="button" onClick={onClose} disabled={isPublishing} className="transition hover:brightness-105" style={btnModalGhost}>
            Cancel
          </button>
          <button type="button" onClick={handleConfirm} disabled={isPublishing || !!error || assignedClasses.length === 0} className="transition hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed" style={btnModalPrimary}>
            {isPublishing ? 'Publishing…' : 'Publish Quiz'}
            <GoldArrow />
          </button>
        </div>
      </div>
    </div>
  )
}

function BuilderForm({ quiz, classes, gradebooksMap, refetch, syllabi }) {
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
  const [assignedClassIds, setAssignedClassIds] = useState(quiz.class_ids ?? [])
  const [questions, setQuestions] = useState((quiz.questions ?? []).map(toEditable))
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [isPublishModalOpen, setIsPublishModalOpen] = useState(false)
  const [isImportModalOpen, setIsImportModalOpen] = useState(false)

  const handleSaveToBank = async (q) => {
    try {
      const payload = {
        ...toPayload(q),
        topic_id: quiz.topic_id || null,
      }
      delete payload.id
      await api('/api/quizzes/bank', {
        method: 'POST',
        body: payload
      })
      alert('Question saved to Quiz Bank successfully!')
    } catch (err) {
      alert(`Failed to save question to bank: ${err.message}`)
    }
  }

  const set = (key) => (e) =>
    setSettings((s) => ({ ...s, [key]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }))

  const totalPoints = questions.reduce((sum, q) => sum + (Number(q.points) || 0), 0)

  const toggleClass = (id) => {
    setAssignedClassIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    )
  }

  async function persist(extra = {}) {
    const payload = {
      title: settings.title,
      instructions: settings.instructions,
      time_limit_minutes: settings.time_limit_minutes ? Number(settings.time_limit_minutes) : null,
      attempts_allowed: Number(settings.attempts_allowed) || 1,
      shuffle_questions: !!settings.shuffle_questions,
      prevent_backtracking: !!settings.prevent_backtracking,
      opens_at: settings.opens_at || null,
      closes_at: settings.closes_at || null,
      class_ids: assignedClassIds,
      questions: questions.map(toPayload),
      ...extra,
    }

    // Save to SQLite
    await api(`/api/quizzes/${quiz.id}`, {
      method: 'PUT',
      body: payload,
    })

    // Save to Firestore
    await updateDoc(doc(db, 'quizzes', quiz.id), {
      ...payload,
      updated_at: serverTimestamp(),
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
    if (assignedClassIds.length === 0) {
      setError('Please assign this quiz to at least one class before publishing.')
      return
    }
    // Open publish mapping modal
    setIsPublishModalOpen(true)
  }

  async function handleConfirmPublish(classMappings) {
    setIsPublishModalOpen(false)
    setPublishing(true)
    setError(null)
    try {
      // First save draft state changes to both db
      await persist()

      // Call Flask publish endpoint
      await api(`/api/quizzes/${quiz.id}/publish`, {
        method: 'POST',
        body: { class_mappings: classMappings },
      })

      // Update Firestore quiz status to published and store class mappings
      await updateDoc(doc(db, 'quizzes', quiz.id), {
        status: 'published',
        published_at: serverTimestamp(),
        class_mappings: classMappings,
      })

      refetch()
    } catch (err) {
      setError(err.message)
    } finally {
      setPublishing(false)
    }
  }

  async function deleteQuiz() {
    if (!window.confirm('Delete this draft quiz?')) return
    try {
      await api(`/api/quizzes/${quiz.id}`, {
        method: 'DELETE',
      })
      await deleteDoc(doc(db, 'quizzes', quiz.id))
      navigate(`/teacher/quizzes`)
    } catch (err) {
      setError(err.message)
    }
  }

  const assignedClassesList = classes.filter(c => assignedClassIds.includes(c.id))

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

        {/* Class assignments checklist */}
        <div style={{ borderTop: `1px solid ${line}`, paddingTop: 14 }}>
          <label style={labelStyle}>Assign to Classes</label>
          <div className="space-y-1.5 max-h-40 overflow-y-auto border border-slate-100 p-2 rounded-lg">
            {classes.map((clazz) => {
              const checked = assignedClassIds.includes(clazz.id)
              return (
                <label key={clazz.id} className="flex items-center gap-2 p-1.5 hover:bg-slate-50 rounded cursor-pointer text-sm">
                  <input type="checkbox" checked={checked} onChange={() => toggleClass(clazz.id)} className="rounded text-indigo-600 focus:ring-indigo-500 h-4 w-4" />
                  <span>{clazz.section} · {clazz.subject}</span>
                </label>
              )
            })}
          </div>
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
          saveToBank={() => handleSaveToBank(q)}
        />
      ))}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 pb-8">
        <div className="flex gap-2.5">
          <button onClick={() => setQuestions([...questions, blankQuestion()])} className="transition hover:brightness-105" style={btnGhost}>
            <span style={{ color: gold }}>+</span> Add question
          </button>
          <button onClick={() => setIsImportModalOpen(true)} className="transition hover:brightness-105" style={btnGhost}>
            📚 Import from Bank
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

      <PublishModal
        isOpen={isPublishModalOpen}
        onClose={() => setIsPublishModalOpen(false)}
        assignedClasses={assignedClassesList}
        gradebooksMap={gradebooksMap}
        onConfirm={handleConfirmPublish}
        isPublishing={publishing}
      />

      <ImportFromBankModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        syllabi={syllabi}
        onImport={(importedQuestions) => {
          const formatted = importedQuestions.map(q => ({
            ...toEditable(q),
            id: null
          }))
          setQuestions(prev => [...prev, ...formatted])
        }}
      />
    </div>
  )
}


function ImportFromBankModal({ isOpen, onClose, syllabi, onImport }) {
  const [selectedNode, setSelectedNode] = useState({ type: 'uncategorized' })
  const [expandedSyllabi, setExpandedSyllabi] = useState({})
  const [expandedModules, setExpandedModules] = useState({})
  const [search, setSearch] = useState('')
  const [selectedIds, setSelectedIds] = useState([])

  const toggleSyllabus = (id) => {
    setExpandedSyllabi(prev => ({ ...prev, [id]: !prev[id] }))
  }
  const toggleModule = (id) => {
    setExpandedModules(prev => ({ ...prev, [id]: !prev[id] }))
  }

  const { data: bankedQuestions = [], isLoading } = useQuery({
    queryKey: ['import-banked-questions', selectedNode?.type, selectedNode?.syllabusId, selectedNode?.topicId],
    queryFn: async () => {
      let url = '/api/quizzes/bank'
      if (selectedNode?.type === 'uncategorized') {
        url += '?syllabus_id=uncategorized'
      } else if (selectedNode?.type === 'topic') {
        url += `?topic_id=${selectedNode.topicId}`
      } else if (selectedNode?.type === 'syllabus') {
        url += `?syllabus_id=${selectedNode.syllabusId}`
      }
      const res = await api(url)
      return res.questions || []
    },
    enabled: isOpen && !!selectedNode,
  })

  if (!isOpen) return null

  const filteredQuestions = bankedQuestions.filter(q => {
    const term = search.toLowerCase().trim()
    if (!term) return true
    const textMatch = q.text.toLowerCase().includes(term)
    const tagMatch = q.tags?.toLowerCase().includes(term)
    return textMatch || tagMatch
  })

  const toggleSelect = (id) => {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    )
  }

  const handleImport = () => {
    const selected = bankedQuestions.filter(q => selectedIds.includes(q.id))
    onImport(selected)
    setSelectedIds([])
    onClose()
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(14,23,51,0.55)', backdropFilter: 'blur(3px)', WebkitBackdropFilter: 'blur(3px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 24 }}>
      <div style={{ width: '100%', maxWidth: 760, background: '#FFFFFF', borderRadius: 20, boxShadow: '0 40px 80px -20px rgba(14,42,92,0.45)', overflow: 'hidden', display: 'flex', flexDirection: 'column', maxHeight: '90vh' }}>
        <div style={{ padding: '24px 28px 20px', borderBottom: '1px solid rgba(14,42,92,0.07)', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
          <h2 style={{ ...serif, fontSize: 22, margin: 0, color: ink }}>Import Questions from Quiz Bank</h2>
        </div>

        <div className="flex-1 flex overflow-hidden min-h-0">
          {/* Sidebar */}
          <div className="w-56 border-r border-slate-100 p-4 overflow-y-auto">
            <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Folders</h4>
            <div className="space-y-1">
              <button
                type="button"
                onClick={() => setSelectedNode({ type: 'uncategorized' })}
                className={`w-full flex items-center gap-1.5 px-2 py-1.5 rounded text-left text-xs font-semibold transition ${
                  selectedNode.type === 'uncategorized'
                    ? 'bg-indigo-50 text-indigo-700'
                    : 'text-slate-600 hover:bg-slate-50'
                }`}
              >
                <span>📦</span>
                <span>Uncategorized</span>
              </button>

              {syllabi.map(s => {
                const isExpanded = !!expandedSyllabi[s.id]
                const isSelected = selectedNode.type === 'syllabus' && selectedNode.syllabusId === s.id
                return (
                  <div key={s.id} className="space-y-1">
                    <div className="flex items-center justify-between gap-1">
                      <button
                        type="button"
                        onClick={() => setSelectedNode({ type: 'syllabus', syllabusId: s.id })}
                        className={`flex-1 flex items-center gap-1.5 px-2 py-1.5 rounded text-left text-xs font-semibold transition ${
                          isSelected
                            ? 'bg-indigo-50 text-indigo-700'
                            : 'text-slate-600 hover:bg-slate-50'
                        }`}
                      >
                        <span>📚</span>
                        <span className="truncate text-xs">{s.title}</span>
                      </button>
                      {s.modules?.length > 0 && (
                        <button
                          type="button"
                          onClick={() => toggleSyllabus(s.id)}
                          className="p-0.5 hover:bg-slate-100 rounded text-slate-400"
                        >
                          <span className={`block text-[8px] transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''}`}>
                            ▶
                          </span>
                        </button>
                      )}
                    </div>

                    {isExpanded && s.modules?.map(m => {
                      const isModExpanded = !!expandedModules[m.id]
                      return (
                        <div key={m.id} className="pl-3 space-y-1">
                          <div className="flex items-center justify-between gap-1">
                            <span className="text-[10px] font-bold text-slate-400 truncate py-1">
                              📂 {m.title}
                            </span>
                            {m.topics?.length > 0 && (
                              <button
                                type="button"
                                onClick={() => toggleModule(m.id)}
                                className="p-0.5 hover:bg-slate-100 rounded text-slate-400"
                              >
                                <span className={`block text-[6px] transition-transform duration-200 ${isModExpanded ? 'rotate-90' : ''}`}>
                                  ▶
                                </span>
                              </button>
                            )}
                          </div>

                          {isModExpanded && m.topics?.map(t => {
                            const isTopicSelected = selectedNode.type === 'topic' && selectedNode.topicId === t.id
                            return (
                              <button
                                key={t.id}
                                type="button"
                                onClick={() => setSelectedNode({ type: 'topic', topicId: t.id, syllabusId: s.id })}
                                className={`w-full pl-4 pr-1 py-1 rounded text-left text-[11px] font-medium transition truncate block ${
                                  isTopicSelected
                                    ? 'text-indigo-600 bg-indigo-50/50 font-semibold'
                                    : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50'
                                }`}
                              >
                                📄 {t.title}
                              </button>
                            )
                          })}
                        </div>
                      )
                    })}
                  </div>
                )
              })}
            </div>
          </div>

          {/* Main Area */}
          <div className="flex-1 p-4 overflow-y-auto flex flex-col gap-3">
            <input
              placeholder="Search questions by text or tag..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="ak-input w-full flex-shrink-0"
              style={{ ...fieldStyle, padding: '7px 10px', fontSize: 12.5 }}
            />

            {isLoading ? (
              <div className="p-8 text-center text-xs text-slate-500">Loading questions...</div>
            ) : filteredQuestions.length === 0 ? (
              <div className="p-8 text-center border border-dashed border-slate-200 rounded-xl text-xs text-slate-400">
                No questions found in this folder.
              </div>
            ) : (
              <div className="space-y-2">
                {filteredQuestions.map(q => {
                  const checked = selectedIds.includes(q.id)
                  return (
                    <label
                      key={q.id}
                      className={`flex items-start gap-3 p-3 rounded-lg border transition cursor-pointer text-xs ${
                        checked
                          ? 'border-indigo-300 bg-indigo-50/20'
                          : 'border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleSelect(q.id)}
                        className="rounded text-indigo-600 mt-0.5"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                          <span className="font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 text-[10px]">
                            {TYPE_LABELS[q.qtype] || q.qtype}
                          </span>
                          <span className="text-slate-400 text-[10px]">{q.points} pts</span>
                          {q.tags && q.tags.split(',').map((t, idx) => (
                            <span key={idx} className="text-[9px] text-indigo-600">
                              #{t.trim()}
                            </span>
                          ))}
                        </div>
                        <p className="font-semibold text-slate-800 leading-normal">{q.text}</p>
                        
                        {q.qtype === 'mcq' && q.options && (
                          <div className="mt-1 space-y-0.5 text-[11px] text-slate-500">
                            {q.options.map((o, idx) => (
                              <div key={idx} className="flex items-center gap-1.5">
                                <span className={`h-1.5 w-1.5 rounded-full ${o.is_correct ? 'bg-green-500' : 'bg-slate-300'}`} />
                                <span className={o.is_correct ? 'font-semibold text-slate-700' : ''}>{o.text}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </label>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, padding: '16px 28px', borderTop: '1px solid rgba(14,42,92,0.07)', background: 'rgba(14,42,92,0.02)', flexShrink: 0 }}>
          <button type="button" onClick={onClose} className="transition hover:brightness-105" style={btnModalGhost}>
            Cancel
          </button>
          <button
            type="button"
            disabled={selectedIds.length === 0}
            onClick={handleImport}
            className="transition hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed"
            style={btnModalPrimary}
          >
            Import Selected ({selectedIds.length})
          </button>
        </div>
      </div>
    </div>
  )
}


export default function QuizBuilderPage() {
  const { quizId } = useParams()
  const queryClient = useQueryClient()
  const { profile } = useAuth()
  const navigate = useNavigate()

  const { data: quiz, isLoading, isError } = useQuery({
    queryKey: ['fs-quiz', quizId],
    queryFn: async () => {
      const snap = await getDoc(doc(db, 'quizzes', quizId))
      if (!snap.exists()) throw new Error('Quiz not found')
      return { id: snap.id, ...snap.data() }
    },
  })

  // Load all syllabi
  const { data: syllabi } = useQuery({
    queryKey: ['api-syllabus'],
    queryFn: async () => {
      const res = await api('/api/syllabus')
      return res.syllabi || []
    },
  })

  // Load all teacher classes
  const { data: classes } = useQuery({
    queryKey: ['fs-classes', profile?.id],
    queryFn: async () => {
      const snap = await getDocs(
        query(collection(db, 'classes'), where('teacher_id', '==', profile.id)),
      )
      return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
    },
    enabled: !!profile?.id,
  })

  // Load all teacher gradebooks
  const { data: gradebooks } = useQuery({
    queryKey: ['fs-gradebooks', profile?.id],
    queryFn: async () => {
      const snap = await getDocs(
        query(collection(db, 'gradebooks'), where('teacher_id', '==', profile.id)),
      )
      return Object.fromEntries(snap.docs.map((d) => [d.id, d.data()]))
    },
    enabled: !!profile?.id,
  })

  const assignedClasses = (classes ?? []).filter((c) => (quiz?.class_ids ?? []).includes(c.id))
  const [selectedResultsClassId, setSelectedResultsClassId] = useState('')

  useEffect(() => {
    if (assignedClasses.length > 0 && !selectedResultsClassId) {
      setSelectedResultsClassId(assignedClasses[0].id)
    }
  }, [assignedClasses, selectedResultsClassId])

  const refetch = () => {
    queryClient.invalidateQueries({ queryKey: ['fs-quiz', quizId] })
    queryClient.invalidateQueries({ queryKey: ['fs-quizzes'] })
    if (selectedResultsClassId) {
      queryClient.invalidateQueries({ queryKey: ['fs-quiz-results', selectedResultsClassId, quizId] })
    }
  }

  async function closeQuiz() {
    if (!window.confirm('Close this quiz? Students will no longer be able to take it.')) return
    try {
      await api(`/api/quizzes/${quizId}/close`, {
        method: 'POST',
      })
      await updateDoc(doc(db, 'quizzes', quizId), { status: 'closed', updated_at: serverTimestamp() })
      refetch()
    } catch (err) {
      alert(err.message)
    }
  }

  if (isLoading) return <p style={{ color: faint }}>Loading quiz…</p>
  if (isError || !quiz) return <p style={{ color: red }}>Quiz not found.</p>

  const editable = quiz.status === 'draft'
  const questionCount = quiz.questions?.length ?? 0
  const totalPoints = sumPoints(quiz.questions)

  return (
    <div>
      <Link to="/teacher/quizzes" className="inline-flex items-center gap-1.5 transition hover:opacity-70" style={{ fontSize: 13, fontWeight: 600, color: navy, textDecoration: 'none' }}>
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
            {assignedClasses.length === 0 ? (
              'not assigned'
            ) : (
              `assigned to ${assignedClasses.length} class${assignedClasses.length === 1 ? '' : 'es'}`
            )}
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
          <BuilderForm key={quiz.id} quiz={quiz} classes={classes ?? []} gradebooksMap={gradebooks ?? {}} refetch={refetch} syllabi={syllabi ?? []} />
        </>
      ) : (
        <div className="max-w-3xl mt-6">
          {assignedClasses.length > 0 ? (
            <div>
              <div className="flex items-center gap-3 mb-4">
                <label style={{ ...labelStyle, marginBottom: 0 }}>View Results For Class:</label>
                <select
                  className="ak-input"
                  value={selectedResultsClassId}
                  onChange={(e) => setSelectedResultsClassId(e.target.value)}
                  style={{ ...fieldStyle, width: 'auto', cursor: 'pointer' }}
                >
                  {assignedClasses.map((c) => (
                    <option key={c.id} value={c.id}>{c.section} ({c.subject})</option>
                  ))}
                </select>
              </div>
              {selectedResultsClassId && (
                <ResultsView classId={selectedResultsClassId} quizId={quizId} totalPoints={totalPoints} assignedTo={quiz.assigned_to} />
              )}
            </div>
          ) : (
            <p style={{ color: faint }}>This quiz is not assigned to any classes yet.</p>
          )}

          <div className="mt-4" style={{ background: '#FFFFFF', border: `1px solid ${line}`, borderRadius: 16, padding: 22 }}>
            <h3 style={{ ...serif, fontSize: 18, color: ink, margin: '0 0 12px' }}>Questions (read-only)</h3>
            {(quiz.questions ?? []).map((q, i) => (
              <div key={q.id || i} style={{ borderBottom: '1px solid rgba(14,42,92,0.05)', padding: '8px 0' }}>
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
