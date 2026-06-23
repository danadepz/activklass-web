import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  where,
} from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { api } from '@/lib/api'
import { useAuth } from '@/context/useAuth'
import { ArrowRight, Plus, Sparkles } from '@/components/icons'

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
  transition: 'border-color 0.15s, box-shadow 0.15s',
}
const btnPrimary = {
  display: 'inline-flex', alignItems: 'center', gap: 8, padding: '11px 18px', fontSize: 13,
  fontWeight: 700, fontFamily: sans, color: '#FAFAF6', background: navy, border: 'none',
  borderRadius: 11, cursor: 'pointer', boxShadow: `0 3px 0 ${navyDeep}`,
}
const btnGhost = {
  display: 'inline-flex', alignItems: 'center', gap: 7, padding: '11px 16px', fontSize: 13,
  fontWeight: 700, fontFamily: sans, color: navy, background: '#FFFFFF',
  border: '1.5px solid rgba(14,42,92,0.14)', borderRadius: 11, cursor: 'pointer',
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

/* A fresh draft quiz document. */
function blankQuiz({ classId, teacherId, title, generatedBy = 'manual', questions = [], extra = {} }) {
  return {
    class_id: classId,
    teacher_id: teacherId,
    title,
    status: 'draft',
    instructions: '',
    time_limit_minutes: null,
    attempts_allowed: 1,
    shuffle_questions: false,
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

/* Map the AI microservice's MCQ output (POST /api/generate_quiz) into the
   builder's question shape. */
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

function GenerateQuizModal({ classId, topics, onClose }) {
  const navigate = useNavigate()
  const { profile } = useAuth()
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

  const { data: clazz } = useQuery({
    queryKey: ['fs-class', classId],
    queryFn: async () => {
      const snap = await getDoc(doc(db, 'classes', classId))
      return snap.exists() ? snap.data() : null
    },
  })

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
      const quiz = await api('/api/generate_quiz', {
        method: 'POST',
        body: {
          topic: topicText,
          count: Number(form.count),
          blooms_level: form.blooms_level,
          subject_code: clazz?.subject_code || '',
          subject_description: clazz?.subject || '',
        },
      })
      const ref = await addDoc(
        collection(db, 'quizzes'),
        blankQuiz({
          classId,
          teacherId: profile.id,
          title: quiz.title || `Quiz: ${topicText}`,
          generatedBy: 'ai_generated',
          questions: aiToQuestions(quiz),
          extra: {
            topic_id: form.topic_id || null,
            module_id: picked?.module_id || null,
            ai_source: quiz.source || null,
          },
        }),
      )
      navigate(`/teacher/classes/${classId}/quizzes/${ref.id}`)
    } catch (err) {
      setError(err.message)
      setGenerating(false)
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(14,23,51,0.55)', backdropFilter: 'blur(3px)', WebkitBackdropFilter: 'blur(3px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 24 }}>
      <form onSubmit={generate} style={{ width: '100%', maxWidth: 460, background: '#FFFFFF', borderRadius: 20, boxShadow: '0 40px 80px -20px rgba(14,42,92,0.45)', overflow: 'hidden', display: 'flex', flexDirection: 'column', maxHeight: '90vh' }}>
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
              <label style={labelStyle}>Topic</label>
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
            {generating ? 'Generating… (can take a minute)' : 'Generate draft'}
            <GoldArrow />
          </button>
        </div>
      </form>
    </div>
  )
}

function QuizCard({ classId, quiz }) {
  const count = quiz.questions?.length ?? 0
  const s = STATUS_PILL[quiz.status] ?? STATUS_PILL.draft
  const isAi = quiz.generated_by === 'ai_generated'
  return (
    <Link
      to={`/teacher/classes/${classId}/quizzes/${quiz.id}`}
      className="ak-card-hov block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0E2A5C]"
      style={{ background: '#FFFFFF', border: `1px solid ${line}`, borderRadius: 16, padding: '20px 22px', textDecoration: 'none' }}
    >
      <div className="flex items-center justify-between gap-2" style={{ marginBottom: 10 }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', padding: '3px 10px', fontSize: 11, fontWeight: 700, color: s.color, background: s.bg, border: `1px solid ${s.border}`, borderRadius: 999 }}>
          {s.label}
        </span>
        {isAi && (
          <span className="inline-flex items-center gap-1" style={{ ...mono, fontSize: 11, color: blueText, fontWeight: 600 }}>
            <Sparkles className="h-3 w-3" /> AI
          </span>
        )}
      </div>
      <div style={{ fontSize: 15.5, fontWeight: 700, color: ink, lineHeight: 1.3 }}>{quiz.title}</div>
      <div className="flex items-center gap-4" style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid rgba(14,42,92,0.07)' }}>
        <div>
          <div style={{ fontSize: 10.5, fontWeight: 700, color: faint, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Items</div>
          <div style={{ ...mono, fontSize: 15, fontWeight: 700, color: ink, marginTop: 2 }}>{count}</div>
        </div>
        <div>
          <div style={{ fontSize: 10.5, fontWeight: 700, color: faint, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Points</div>
          <div style={{ ...mono, fontSize: 15, fontWeight: 700, color: ink, marginTop: 2 }}>{totalPoints(quiz.questions)}</div>
        </div>
        <span style={{ ...mono, marginLeft: 'auto', fontSize: 12, fontWeight: 700, color: navy }}>Open →</span>
      </div>
    </Link>
  )
}

export default function QuizzesPage() {
  const { classId } = useParams()
  const navigate = useNavigate()
  const { profile } = useAuth()
  const [showGenerate, setShowGenerate] = useState(false)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState(null)
  const [filter, setFilter] = useState('all')

  const { data: quizzes, isLoading } = useQuery({
    queryKey: ['fs-quizzes', classId],
    queryFn: async () => {
      const snap = await getDocs(query(collection(db, 'quizzes'), where('class_id', '==', classId)))
      return snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (b.created_at?.seconds ?? 0) - (a.created_at?.seconds ?? 0))
    },
  })

  const { data: syllabus } = useQuery({
    queryKey: ['fs-syllabus', classId],
    queryFn: async () => {
      const snap = await getDoc(doc(db, 'classes', classId, 'syllabus', 'current'))
      return snap.exists() ? snap.data() : null
    },
  })

  const topics = (syllabus?.modules ?? []).flatMap((m) =>
    (m.topics ?? []).map((t) => ({
      id: t.id,
      module_id: m.id,
      title: t.title,
      label: `${m.title} — ${t.title}`,
    })),
  )

  const list = quizzes ?? []
  const counts = { all: list.length, draft: 0, published: 0, closed: 0 }
  for (const q of list) if (q.status in counts) counts[q.status] += 1
  const shown = filter === 'all' ? list : list.filter((q) => q.status === filter)

  async function newQuiz() {
    const title = window.prompt('Quiz title:')
    if (!title?.trim()) return
    setCreating(true)
    try {
      const ref = await addDoc(
        collection(db, 'quizzes'),
        blankQuiz({ classId, teacherId: profile.id, title: title.trim() }),
      )
      navigate(`/teacher/classes/${classId}/quizzes/${ref.id}`)
    } catch (err) {
      setError(err.message)
      setCreating(false)
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-[clamp(26px,3.5vw,32px)]" style={{ ...serif, lineHeight: 1.1, letterSpacing: '-0.01em', margin: '0 0 4px', color: ink }}>
            Quizzes
          </h1>
          <p style={{ fontSize: 13.5, color: muted, margin: 0 }}>Build or generate quizzes, then publish to open them to students.</p>
        </div>
        <div className="flex flex-wrap gap-2.5">
          <button onClick={newQuiz} disabled={creating} className="transition hover:brightness-105 disabled:opacity-50" style={btnGhost}>
            <Plus className="h-4 w-4" /> New quiz
          </button>
          <button onClick={() => setShowGenerate(true)} className="transition hover:brightness-110" style={btnPrimary}>
            <span style={{ color: gold, display: 'inline-flex' }}>
              <Sparkles className="h-4 w-4" />
            </span>
            Generate with AI
          </button>
        </div>
      </div>

      {error && <div className="mt-4">{<AlertBox>{error}</AlertBox>}</div>}

      {!isLoading && list.length > 0 && (
        <div className="mt-5 flex flex-wrap items-center gap-2">
          {FILTERS.map((f) => {
            const active = filter === f
            const labelMap = { all: 'All', draft: 'Draft', published: 'Published', closed: 'Closed' }
            return (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className="transition hover:brightness-105"
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 7, padding: '7px 14px', fontSize: 13,
                  fontWeight: 700, fontFamily: sans, borderRadius: 999, cursor: 'pointer',
                  ...(active
                    ? { color: '#FAFAF6', background: navy, border: `1.5px solid ${navy}` }
                    : { color: muted, background: '#FFFFFF', border: '1.5px solid rgba(14,42,92,0.14)' }),
                }}
              >
                {labelMap[f]}
                <span style={{ display: 'inline-block', padding: '1px 7px', fontSize: 11, fontWeight: 800, borderRadius: 999, background: active ? 'rgba(245,197,24,0.8)' : 'rgba(14,42,92,0.08)', color: active ? navy : muted }}>
                  {counts[f]}
                </span>
              </button>
            )
          })}
        </div>
      )}

      {isLoading ? (
        <p className="mt-8" style={{ color: faint }}>Loading quizzes…</p>
      ) : list.length === 0 ? (
        <div className="mt-6 text-center" style={{ background: '#FFFFFF', border: `1px solid ${line}`, borderRadius: 16, padding: 48, color: faint, fontSize: 14 }}>
          No quizzes yet — create one manually or generate a draft with AI.
        </div>
      ) : (
        <div className="mt-5 grid gap-3.5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))' }}>
          {shown.map((quiz) => (
            <QuizCard key={quiz.id} classId={classId} quiz={quiz} />
          ))}
        </div>
      )}

      {showGenerate && (
        <GenerateQuizModal classId={classId} topics={topics} onClose={() => setShowGenerate(false)} />
      )}
    </div>
  )
}
