import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  where,
  deleteDoc,
} from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { api } from '@/lib/api'
import { useAuth } from '@/context/useAuth'
import { ArrowRight, Plus, Sparkles, Trash, Edit } from '@/components/icons'

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

const STATUS_PILL = {
  draft: { label: 'Draft', color: muted, bg: 'rgba(14,42,92,0.06)', border: 'rgba(14,42,92,0.15)' },
  published: { label: 'Published', color: green, bg: 'rgba(31,138,91,0.10)', border: 'rgba(31,138,91,0.4)' },
  closed: { label: 'Closed', color: goldDeep, bg: 'rgba(245,197,24,0.18)', border: 'rgba(245,197,24,0.5)' },
}
const FILTERS = ['all', 'draft', 'published', 'closed']

const labelStyle = { display: 'block', fontSize: 13, fontWeight: 600, color: ink, marginBottom: 7 }
const fieldStyle = {
  width: '100%', padding: '12px 14px', fontSize: 14, fontFamily: sans, color: ink,
  background: '#FFFFFF', border: '1.5px solid rgba(14,42,92,0.14)', borderRadius: 10,
}
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

const newId = () =>
  globalThis.crypto?.randomUUID?.() ?? `id-${Date.now()}-${Math.random().toString(36).slice(2)}`

function totalPoints(questions) {
  return (questions ?? []).reduce((sum, q) => sum + (Number(q.points) || 0), 0)
}

function blankQuiz({ classIds, teacherId, title, generatedBy = 'manual', questions = [], extra = {} }) {
  return {
    class_ids: classIds,
    teacher_id: teacherId,
    title,
    status: 'draft',
    instructions: '',
    time_limit_minutes: null,
    attempts_allowed: 1,
    shuffle_questions: false,
    prevent_backtracking: false,
    opens_at: null,
    closes_at: null,
    assigned_to: 'all',
    generated_by: generatedBy,
    questions,
    created_at: serverTimestamp(),
    updated_at: serverTimestamp(),
    ...extra,
  }
}

function aiToQuestions(quiz) {
  return (quiz.questions ?? []).map((q) => ({
    id: newId(),
    qtype: 'mcq',
    text: q.text ?? '',
    points: 1,
    ai_generated: true,
    options: (q.options ?? []).map((o) => ({
      id: newId(),
      text: o.text ?? '',
      is_correct: !!o.correct,
    })),
  }))
}

function GenerateQuizModal({ classes, onClose }) {
  const navigate = useNavigate()
  const { profile } = useAuth()
  const [selectedClassId, setSelectedClassId] = useState(classes[0]?.id ?? '')
  const [form, setForm] = useState({
    topic_id: '',
    topic: '',
    count: 10,
    blooms_level: 'apply',
  })
  const [error, setError] = useState(null)
  const [generating, setGenerating] = useState(false)
  const selectStyle = { ...fieldStyle, cursor: 'pointer' }
  const BLOOMS_LEVELS = ['remember', 'understand', 'apply', 'analyze', 'evaluate', 'create']
  const COUNT_OPTIONS = [5, 10, 15, 20]

  const { data: selectedClassMeta } = useQuery({
    queryKey: ['fs-class-meta-gen', selectedClassId],
    queryFn: async () => {
      const snap = await getDoc(doc(db, 'classes', selectedClassId))
      return snap.exists() ? snap.data() : null
    },
    enabled: !!selectedClassId,
  })

  // Load syllabus for the selected class to list topics
  const { data: syllabus } = useQuery({
    queryKey: ['fs-syllabus-gen', selectedClassId, selectedClassMeta?.syllabus_id],
    queryFn: async () => {
      if (!selectedClassMeta?.syllabus_id) return null
      const snap = await getDoc(doc(db, 'syllabi', selectedClassMeta.syllabus_id))
      return snap.exists() ? snap.data() : null
    },
    enabled: !!selectedClassId && !!selectedClassMeta?.syllabus_id,
  })

  const topics = []
  if (syllabus?.modules) {
    syllabus.modules.forEach((m) => {
      if (m.topics) {
        m.topics.forEach((t) => {
          topics.push({ id: t.id, label: `${m.title} · ${t.title}`, title: t.title, module_id: m.id })
        })
      }
    })
  }

  async function generate(e) {
    e.preventDefault()
    const picked = topics.find((t) => t.id === form.topic_id)
    const topicText = (picked?.title || form.topic).trim()
    if (!topicText) {
      setError('Pick a syllabus topic or describe one')
      return
    }
    setGenerating(true)
    setError(null)
    try {
      const quiz = await api('/api/quizzes/generate', {
        method: 'POST',
        body: {
          topic: topicText,
          count: Number(form.count),
          blooms_level: form.blooms_level,
          subject_code: selectedClassMeta?.subject_code || '',
          subject_description: selectedClassMeta?.subject || '',
        },
      })

      const quizId = newId()
      const payload = blankQuiz({
        classIds: selectedClassId ? [selectedClassId] : [],
        teacherId: profile.id,
        title: quiz.title || `Quiz: ${topicText}`,
        generatedBy: 'ai_generated',
        questions: aiToQuestions(quiz),
        extra: {
          topic_id: form.topic_id || null,
          module_id: picked?.module_id || null,
          ai_source: quiz.source || null,
        },
      })

      // Save to SQLite
      await api(`/api/quizzes`, {
        method: 'POST',
        body: {
          id: quizId,
          title: payload.title,
          class_ids: selectedClassId ? [selectedClassId] : [],
          generated_by: 'ai_generated',
        },
      })

      // Save to Firestore
      await setDoc(doc(db, 'quizzes', quizId), {
        ...payload,
        id: quizId,
        updated_at: serverTimestamp(),
      })

      navigate(`/teacher/quizzes/${quizId}`)
    } catch (err) {
      setError(err.message)
      setGenerating(false)
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(14,23,51,0.55)', backdropFilter: 'blur(3px)', WebkitBackdropFilter: 'blur(3px)', display: 'flex', alignItems: 'center', justifycenter: 'center', zIndex: 100, padding: 24 }}>
      <form onSubmit={generate} style={{ margin: 'auto', width: '100%', maxWidth: 460, background: '#FFFFFF', borderRadius: 20, boxShadow: '0 40px 80px -20px rgba(14,42,92,0.45)', overflow: 'hidden', display: 'flex', flexDirection: 'column', maxHeight: '90vh' }}>
        <div style={{ padding: '24px 28px 20px', borderBottom: '1px solid rgba(14,42,92,0.07)', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
          <span style={{ width: 36, height: 36, borderRadius: 10, background: navy, color: gold, display: 'grid', placeItems: 'center', flexShrink: 0 }}>
            <Sparkles className="h-[18px] w-[18px]" />
          </span>
          <h2 style={{ ...serif, fontSize: 22, margin: 0, color: ink }}>Generate Quiz with AI</h2>
        </div>
        <div style={{ padding: '24px 28px', overflowY: 'auto' }} className="flex flex-col gap-4">
          <p style={{ fontSize: 13.5, color: muted, lineHeight: 1.55, margin: 0 }}>
            Builds a multiple-choice draft (local Llama 3, with a math fallback). Review every question and
            answer key before publishing.
          </p>
          {error && <AlertBox>{error}</AlertBox>}

          <div>
            <label style={labelStyle}>Target Class Context</label>
            <select className="ak-input" value={selectedClassId} onChange={(e) => { setSelectedClassId(e.target.value); setForm(f => ({ ...f, topic_id: '' })) }} style={selectStyle}>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>{c.section} ({c.subject})</option>
              ))}
            </select>
          </div>

          {topics.length > 0 ? (
            <div>
              <label style={labelStyle}>Syllabus topic</label>
              <select className="ak-input" value={form.topic_id} onChange={(e) => setForm((f) => ({ ...f, topic_id: e.target.value }))} style={selectStyle}>
                <option value="">— Describe a topic instead —</option>
                {topics.map((t) => (
                  <option key={t.id} value={t.id}>{t.label}</option>
                ))}
              </select>
            </div>
          ) : (
            <p style={{ fontSize: 12, color: faint, margin: 0 }}>Tip: build a syllabus first and you can target its topics here.</p>
          )}
          {!form.topic_id && (
            <div>
              <label style={labelStyle}>Topic Description</label>
              <input className="ak-input" required={!form.topic_id} placeholder="e.g. Arithmetic sequences" value={form.topic} onChange={(e) => setForm((f) => ({ ...f, topic: e.target.value }))} style={fieldStyle} />
            </div>
          )}
          <div className="grid grid-cols-2 gap-3.5">
            <div>
              <label style={labelStyle}># Questions</label>
              <select className="ak-input" value={form.count} onChange={(e) => setForm((f) => ({ ...f, count: e.target.value }))} style={selectStyle}>
                {COUNT_OPTIONS.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Bloom's level</label>
              <select className="ak-input capitalize" value={form.blooms_level} onChange={(e) => setForm((f) => ({ ...f, blooms_level: e.target.value }))} style={selectStyle}>
                {BLOOMS_LEVELS.map((b) => (
                  <option key={b} value={b}>{b}</option>
                ))}
              </select>
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, padding: '16px 28px', borderTop: '1px solid rgba(14,42,92,0.07)', background: 'rgba(14,42,92,0.02)', flexShrink: 0 }}>
          <button type="button" onClick={onClose} disabled={generating} className="transition hover:brightness-105 disabled:opacity-50" style={btnModalGhost}>
            Cancel
          </button>
          <button type="submit" disabled={generating} className="transition hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed" style={btnModalPrimary}>
            {generating ? 'Generating…' : 'Generate draft'}
            <GoldArrow />
          </button>
        </div>
      </form>
    </div>
  )
}

function CreateQuizModal({ classes, onClose }) {
  const navigate = useNavigate()
  const { profile } = useAuth()
  const [title, setTitle] = useState('')
  const [selectedClassIds, setSelectedClassIds] = useState([])
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)

  const toggleClass = (id) => {
    setSelectedClassIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    )
  }

  async function create(e) {
    e.preventDefault()
    if (!title.trim()) {
      setError('Quiz title is required')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const quizId = newId()
      const payload = blankQuiz({
        classIds: selectedClassIds,
        teacherId: profile.id,
        title: title.trim(),
      })

      // SQLite
      await api('/api/quizzes', {
        method: 'POST',
        body: {
          id: quizId,
          title: payload.title,
          class_ids: selectedClassIds,
        },
      })

      // Firestore
      await setDoc(doc(db, 'quizzes', quizId), {
        ...payload,
        id: quizId,
        updated_at: serverTimestamp(),
      })

      navigate(`/teacher/quizzes/${quizId}`)
    } catch (err) {
      setError(err.message)
      setSaving(false)
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(14,23,51,0.55)', backdropFilter: 'blur(3px)', WebkitBackdropFilter: 'blur(3px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 24 }}>
      <form onSubmit={create} style={{ width: '100%', maxWidth: 460, background: '#FFFFFF', borderRadius: 20, boxShadow: '0 40px 80px -20px rgba(14,42,92,0.45)', overflow: 'hidden', display: 'flex', flexDirection: 'column', maxHeight: '90vh' }}>
        <div style={{ padding: '24px 28px 20px', borderBottom: '1px solid rgba(14,42,92,0.07)', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
          <h2 style={{ ...serif, fontSize: 22, margin: 0, color: ink }}>Create New Quiz</h2>
        </div>
        <div style={{ padding: '24px 28px', overflowY: 'auto' }} className="flex flex-col gap-4">
          {error && <AlertBox>{error}</AlertBox>}
          <div>
            <label style={labelStyle}>Quiz Title</label>
            <input className="ak-input" required placeholder="e.g. Chapter 1 Quiz" value={title} onChange={(e) => setTitle(e.target.value)} style={fieldStyle} />
          </div>
          <div>
            <label style={labelStyle}>Assign to Classes (Optional)</label>
            <div className="space-y-1.5 max-h-40 overflow-y-auto border border-slate-100 p-2 rounded-lg">
              {classes.map((clazz) => {
                const checked = selectedClassIds.includes(clazz.id)
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
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, padding: '16px 28px', borderTop: '1px solid rgba(14,42,92,0.07)', background: 'rgba(14,42,92,0.02)', flexShrink: 0 }}>
          <button type="button" onClick={onClose} disabled={saving} className="transition hover:brightness-105" style={btnModalGhost}>
            Cancel
          </button>
          <button type="submit" disabled={saving} className="transition hover:brightness-110" style={btnModalPrimary}>
            {saving ? 'Creating…' : 'Create Quiz'}
            <GoldArrow />
          </button>
        </div>
      </form>
    </div>
  )
}

function QuizCard({ quiz, classes, onDelete }) {
  const count = quiz.question_count ?? 0
  const s = STATUS_PILL[quiz.status] ?? STATUS_PILL.draft
  const isAi = quiz.generated_by === 'ai_generated'

  const assignedClasses = classes.filter((c) => (quiz.class_ids ?? []).includes(c.id))

  return (
    <div
      className="ak-card-hov block relative bg-white rounded-xl border border-slate-200 p-5 hover:shadow-md transition"
    >
      <div className="flex items-center justify-between gap-2" style={{ marginBottom: 10 }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', padding: '3px 10px', fontSize: 11, fontWeight: 700, color: s.color, background: s.bg, border: `1px solid ${s.border}`, borderRadius: 999 }}>
          {s.label}
        </span>
        <div className="flex items-center gap-2">
          {isAi && (
            <span className="inline-flex items-center gap-1" style={{ ...mono, fontSize: 11, color: blueText, fontWeight: 600 }}>
              <Sparkles className="h-3 w-3" /> AI
            </span>
          )}
          <button onClick={() => onDelete(quiz.id)} className="text-red-500 hover:text-red-700 hover:bg-red-50 p-1 rounded transition">
            <Trash className="h-4 w-4" />
          </button>
        </div>
      </div>
      <div style={{ fontSize: 16, fontWeight: 700, color: ink, lineHeight: 1.3 }}>{quiz.title}</div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {assignedClasses.length === 0 ? (
          <span className="text-xs text-slate-400 bg-slate-50 px-2 py-0.5 rounded border border-slate-100">Not assigned</span>
        ) : (
          assignedClasses.map((c) => (
            <span key={c.id} className="text-xs font-semibold text-slate-600 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
              {c.section}
            </span>
          ))
        )}
      </div>

      <div className="flex items-center gap-4" style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid rgba(14,42,92,0.07)' }}>
        <div>
          <div style={{ fontSize: 10.5, fontWeight: 700, color: faint, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Items</div>
          <div style={{ ...mono, fontSize: 14, fontWeight: 700, color: ink, marginTop: 2 }}>{count}</div>
        </div>
        <div>
          <div style={{ fontSize: 10.5, fontWeight: 700, color: faint, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Points</div>
          <div style={{ ...mono, fontSize: 14, fontWeight: 700, color: ink, marginTop: 2 }}>{quiz.total_points ?? 0}</div>
        </div>
        <Link to={`/teacher/quizzes/${quiz.id}`} style={{ ...mono, marginLeft: 'auto', fontSize: 12, fontWeight: 700, color: navy, textDecoration: 'none' }} className="hover:underline">
          Open →
        </Link>
      </div>
    </div>
  )
}

export default function QuizzesIndexPage() {
  const queryClient = useQueryClient()
  const { profile } = useAuth()
  const [filter, setFilter] = useState('all')
  const [showCreate, setShowCreate] = useState(false)
  const [showGenerate, setShowGenerate] = useState(false)

  // Fetch classes
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

  // Fetch quizzes
  const { data: sqliteQuizzes, isLoading, refetch } = useQuery({
    queryKey: ['sqlite-quizzes'],
    queryFn: async () => {
      const res = await api('/api/quizzes')
      return res.quizzes || []
    },
  })

  async function handleDelete(quizId) {
    if (!window.confirm('Are you sure you want to delete this quiz? This cannot be undone.')) return
    try {
      await api(`/api/quizzes/${quizId}`, { method: 'DELETE' })
      await deleteDoc(doc(db, 'quizzes', quizId))
      refetch()
    } catch (err) {
      alert(`Delete failed: ${err.message}`)
    }
  }

  if (isLoading) {
    return <div className="p-8 text-slate-500">Loading Quizzes...</div>
  }

  const filteredQuizzes = sqliteQuizzes.filter((q) => {
    if (filter === 'all') return true
    return q.status === filter
  })

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-[clamp(28px,4vw,36px)]" style={{ fontFamily: "'DM Serif Display', Georgia, serif", color: ink }}>Quiz Manager</h2>
          <p className="text-slate-500 mt-1">
            Build, generate, and manage all your quizzes globally.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-1.5 rounded-lg border border-indigo-200 text-indigo-700 bg-white px-4 py-2 text-sm font-medium hover:bg-indigo-50"
          >
            <Plus className="h-4 w-4" /> Add Manually
          </button>
          <button
            onClick={() => setShowGenerate(true)}
            className="flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium transition hover:brightness-110"
            style={{ background: '#0E2A5C', color: '#FAFAF6', border: 'none', cursor: 'pointer' }}
          >
            ✨ Generate with AI
          </button>
        </div>
      </div>

      <div className="flex items-center gap-1.5 border-b border-slate-100 pb-2">
        {FILTERS.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg capitalize transition ${
              filter === f
                ? 'bg-[#0E2A5C] text-white shadow-sm'
                : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50'
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      {filteredQuizzes.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
          <p className="text-slate-500">No quizzes match your filter.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredQuizzes.map((quiz) => (
            <QuizCard
              key={quiz.id}
              quiz={quiz}
              classes={classes ?? []}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}

      {showCreate && (
        <CreateQuizModal
          classes={classes ?? []}
          onClose={() => setShowCreate(false)}
        />
      )}

      {showGenerate && (
        <GenerateQuizModal
          classes={classes ?? []}
          onClose={() => setShowGenerate(false)}
        />
      )}
    </div>
  )
}
