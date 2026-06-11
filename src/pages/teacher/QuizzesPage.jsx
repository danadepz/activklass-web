import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api } from '../../lib/api'

const STATUS_STYLE = {
  draft: 'bg-slate-100 text-slate-600',
  published: 'bg-green-50 text-green-700',
  closed: 'bg-amber-50 text-amber-700',
}

const TYPE_OPTIONS = [
  { key: 'mcq', label: 'Multiple choice' },
  { key: 'true_false', label: 'True / False' },
  { key: 'matching', label: 'Matching' },
  { key: 'short_answer', label: 'Short answer' },
  { key: 'essay', label: 'Essay' },
]

/* Maps the AI draft format into the builder's PUT format. */
function draftToQuestions(draft) {
  return (draft.questions ?? []).map((q) => {
    const base = {
      qtype: q.type,
      text: q.text,
      points: q.points || 1,
      ai_generated: true,
    }
    if (q.type === 'mcq') {
      base.options = (q.options ?? []).map((o) => ({ text: o.text, is_correct: !!o.correct }))
    } else if (q.type === 'true_false') {
      base.answer_key = { value: !!q.answer }
    } else if (q.type === 'short_answer') {
      base.answer_key = { answers: q.accepted_answers ?? [] }
    } else if (q.type === 'matching') {
      base.answer_key = { pairs: q.pairs ?? [] }
    } else if (q.type === 'essay') {
      base.rubric = q.rubric ?? ''
    }
    return base
  })
}

function GenerateQuizModal({ classId, topics, onClose }) {
  const navigate = useNavigate()
  const [form, setForm] = useState({
    topic_id: '',
    topic: '',
    num_questions: 10,
    types: ['mcq', 'true_false'],
    difficulty: 'mixed',
    notes: '',
  })
  const [error, setError] = useState(null)
  const [generating, setGenerating] = useState(false)

  const toggleType = (key) =>
    setForm((f) => ({
      ...f,
      types: f.types.includes(key) ? f.types.filter((t) => t !== key) : [...f.types, key],
    }))

  async function generate(e) {
    e.preventDefault()
    if (form.types.length === 0) {
      setError('Pick at least one question type')
      return
    }
    setGenerating(true)
    setError(null)
    try {
      const { draft } = await api(`/api/classes/${classId}/quizzes/generate`, {
        method: 'POST',
        body: form,
      })
      // Save the reviewed-draft as a draft quiz, then open the builder on it.
      const { quiz } = await api(`/api/classes/${classId}/quizzes`, {
        method: 'POST',
        body: { title: draft.title || 'AI Quiz', generated_by: 'ai_generated' },
      })
      await api(`/api/classes/${classId}/quizzes/${quiz.id}`, {
        method: 'PUT',
        body: {
          title: draft.title || 'AI Quiz',
          topic_id: form.topic_id || null,
          questions: draftToQuestions(draft),
        },
      })
      navigate(`/teacher/classes/${classId}/quizzes/${quiz.id}`)
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
          The quiz is created as a draft — review every question before publishing.
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
            Tip: build a syllabus first and the AI can target its topics and objectives.
          </p>
        )}
        {!form.topic_id && (
          <label className="block">
            <span className="text-sm font-medium text-slate-700">Topic</span>
            <input
              required={!form.topic_id}
              placeholder="e.g. Adding and subtracting fractions"
              value={form.topic}
              onChange={(e) => setForm((f) => ({ ...f, topic: e.target.value }))}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </label>
        )}
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="text-sm font-medium text-slate-700"># Questions</span>
            <input
              type="number"
              min="1"
              max="30"
              value={form.num_questions}
              onChange={(e) => setForm((f) => ({ ...f, num_questions: e.target.value }))}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-slate-700">Difficulty</span>
            <select
              value={form.difficulty}
              onChange={(e) => setForm((f) => ({ ...f, difficulty: e.target.value }))}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 bg-white capitalize focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              {['easy', 'medium', 'hard', 'mixed'].map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </label>
        </div>
        <div>
          <span className="text-sm font-medium text-slate-700">Question types</span>
          <div className="grid grid-cols-2 gap-1.5 mt-1.5">
            {TYPE_OPTIONS.map((t) => (
              <label key={t.key} className="flex items-center gap-2 text-sm text-slate-600">
                <input
                  type="checkbox"
                  checked={form.types.includes(t.key)}
                  onChange={() => toggleType(t.key)}
                  className="rounded"
                />
                {t.label}
              </label>
            ))}
          </div>
        </div>
        <label className="block">
          <span className="text-sm font-medium text-slate-700">Notes for the AI (optional)</span>
          <input
            value={form.notes}
            onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
            placeholder="e.g. use word problems with peso amounts"
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </label>
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
  const [showGenerate, setShowGenerate] = useState(false)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState(null)

  const { data: classData } = useQuery({
    queryKey: ['class', classId],
    queryFn: () => api(`/api/classes/${classId}`),
  })
  const { data, isLoading } = useQuery({
    queryKey: ['quizzes', classId],
    queryFn: () => api(`/api/classes/${classId}/quizzes`),
  })
  const { data: syllabusData } = useQuery({
    queryKey: ['syllabus', classId],
    queryFn: () => api(`/api/classes/${classId}/syllabus`),
  })

  const topics = (syllabusData?.syllabus?.modules ?? []).flatMap((m) =>
    m.topics.map((t) => ({ id: t.id, label: `${m.title} — ${t.title}` })),
  )
  const aiAvailable = syllabusData?.ai_available

  async function newQuiz() {
    const title = window.prompt('Quiz title:')
    if (!title?.trim()) return
    setCreating(true)
    try {
      const { quiz } = await api(`/api/classes/${classId}/quizzes`, {
        method: 'POST',
        body: { title: title.trim() },
      })
      navigate(`/teacher/classes/${classId}/quizzes/${quiz.id}`)
    } catch (err) {
      setError(err.message)
      setCreating(false)
    }
  }

  return (
    <div>
      <Link to={`/teacher/classes/${classId}`} className="text-sm text-indigo-600 hover:underline">
        ← Back to {classData?.class?.name ?? 'class'}
      </Link>
      <div className="flex items-start justify-between mt-2">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Quizzes</h2>
          <p className="text-slate-500 mt-1">Build or generate quizzes; publishing adds a class record column.</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowGenerate(true)}
            disabled={!aiAvailable}
            title={aiAvailable ? undefined : 'Set ANTHROPIC_API_KEY in backend/.env to enable AI generation'}
            className="rounded-lg border border-indigo-200 text-indigo-700 px-4 py-2 text-sm font-medium hover:bg-indigo-50 disabled:opacity-40"
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
      ) : data?.quizzes?.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 mt-6 text-center text-slate-400">
          No quizzes yet — create one manually or generate a draft with AI.
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 mt-6 divide-y divide-slate-100">
          {data?.quizzes?.map((quiz) => (
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
                  {quiz.question_count} question{quiz.question_count === 1 ? '' : 's'} · {quiz.total_points} pts
                  {quiz.status !== 'draft' && ` · ${quiz.attempt_count} attempt${quiz.attempt_count === 1 ? '' : 's'}`}
                </p>
              </div>
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ${STATUS_STYLE[quiz.status]}`}>
                {quiz.status}
              </span>
            </Link>
          ))}
        </div>
      )}

      {showGenerate && (
        <GenerateQuizModal classId={classId} topics={topics} onClose={() => setShowGenerate(false)} />
      )}
    </div>
  )
}
