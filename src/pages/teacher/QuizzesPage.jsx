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
import { db } from '../../lib/firebase'
import { api } from '../../lib/api'
import { useAuth } from '../../context/useAuth'

const STATUS_STYLE = {
  draft: 'bg-slate-100 text-slate-600',
  published: 'bg-green-50 text-green-700',
  closed: 'bg-amber-50 text-amber-700',
}

const BLOOMS_LEVELS = ['remember', 'understand', 'apply', 'analyze', 'evaluate', 'create']
const COUNT_OPTIONS = [5, 10, 15, 20]

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
        body: { topic: topicText, count: Number(form.count), blooms_level: form.blooms_level },
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
    <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center px-4 z-10">
      <form onSubmit={generate} className="bg-white rounded-xl p-6 w-full max-w-md space-y-4 max-h-[90vh] overflow-y-auto">
        <h3 className="text-lg font-semibold text-slate-800">Generate Quiz with AI</h3>
        <p className="text-sm text-slate-500">
          Builds a multiple-choice draft (local Llama 3, with a math fallback). Review every question
          and answer key before publishing.
        </p>
        {error && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
        )}
        {topics.length > 0 ? (
          <label className="block">
            <span className="text-sm font-medium text-slate-700">Syllabus topic</span>
            <select
              value={form.topic_id}
              onChange={(e) => setForm((f) => ({ ...f, topic_id: e.target.value }))}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="">— Describe a topic instead —</option>
              {topics.map((t) => (
                <option key={t.id} value={t.id}>{t.label}</option>
              ))}
            </select>
          </label>
        ) : (
          <p className="text-xs text-slate-400">
            Tip: build a syllabus first and you can target its topics here.
          </p>
        )}
        {!form.topic_id && (
          <label className="block">
            <span className="text-sm font-medium text-slate-700">Topic</span>
            <input
              required={!form.topic_id}
              placeholder="e.g. Arithmetic sequences"
              value={form.topic}
              onChange={(e) => setForm((f) => ({ ...f, topic: e.target.value }))}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </label>
        )}
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="text-sm font-medium text-slate-700"># Questions</span>
            <select
              value={form.count}
              onChange={(e) => setForm((f) => ({ ...f, count: e.target.value }))}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              {COUNT_OPTIONS.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-sm font-medium text-slate-700">Bloom's level</span>
            <select
              value={form.blooms_level}
              onChange={(e) => setForm((f) => ({ ...f, blooms_level: e.target.value }))}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 bg-white capitalize focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              {BLOOMS_LEVELS.map((b) => (
                <option key={b} value={b}>{b}</option>
              ))}
            </select>
          </label>
        </div>
        <div className="flex gap-3 justify-end pt-2">
          <button type="button" onClick={onClose} disabled={generating} className="rounded-lg border border-slate-300 px-4 py-2 text-slate-600 hover:bg-slate-50 disabled:opacity-50">
            Cancel
          </button>
          <button type="submit" disabled={generating} className="rounded-lg bg-indigo-600 text-white px-4 py-2 font-medium hover:bg-indigo-700 disabled:opacity-50">
            {generating ? 'Generating… (can take a minute)' : 'Generate draft'}
          </button>
        </div>
      </form>
    </div>
  )
}

export default function QuizzesPage() {
  const { classId } = useParams()
  const navigate = useNavigate()
  const { profile } = useAuth()
  const [showGenerate, setShowGenerate] = useState(false)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState(null)

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
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Quizzes</h2>
          <p className="text-slate-500 mt-1">Build or generate quizzes, then publish to open them to students.</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowGenerate(true)}
            className="rounded-lg border border-indigo-200 text-indigo-700 px-4 py-2 text-sm font-medium hover:bg-indigo-50"
          >
            ✨ Generate with AI
          </button>
          <button
            onClick={newQuiz}
            disabled={creating}
            className="rounded-lg bg-indigo-600 text-white px-4 py-2 text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
          >
            + New Quiz
          </button>
        </div>
      </div>

      {error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mt-4">{error}</p>
      )}

      {isLoading ? (
        <p className="text-slate-400 mt-8">Loading quizzes…</p>
      ) : quizzes?.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 mt-6 text-center text-slate-400">
          No quizzes yet — create one manually or generate a draft with AI.
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 mt-6 divide-y divide-slate-100">
          {quizzes?.map((quiz) => {
            const count = quiz.questions?.length ?? 0
            return (
              <Link
                key={quiz.id}
                to={`/teacher/classes/${classId}/quizzes/${quiz.id}`}
                className="flex items-center justify-between px-5 py-3.5 hover:bg-slate-50"
              >
                <div>
                  <p className="font-medium text-slate-800">
                    {quiz.title}
                    {quiz.generated_by === 'ai_generated' && <span title="AI-generated"> ✨</span>}
                  </p>
                  <p className="text-sm text-slate-500">
                    {count} question{count === 1 ? '' : 's'} · {totalPoints(quiz.questions)} pts
                  </p>
                </div>
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ${STATUS_STYLE[quiz.status]}`}>
                  {quiz.status}
                </span>
              </Link>
            )
          })}
        </div>
      )}

      {showGenerate && (
        <GenerateQuizModal classId={classId} topics={topics} onClose={() => setShowGenerate(false)} />
      )}
    </div>
  )
}
