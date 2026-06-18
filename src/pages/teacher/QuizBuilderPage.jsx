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
import { db } from '../../lib/firebase'
import { fetchUsersByIds } from '../../lib/roster'

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

const inputCls = 'rounded-lg border border-slate-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500'

function QuestionCard({ q, index, update, remove, moveUp, moveDown }) {
  const setOptions = (options) => update({ options })
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 mt-3">
      <div className="flex items-center gap-2">
        <span className="rounded-lg bg-slate-100 text-slate-600 text-xs font-bold px-2 py-1">Q{index + 1}</span>
        <select
          value={q.qtype}
          onChange={(e) => update({ qtype: e.target.value })}
          className={`${inputCls} bg-white`}
        >
          {Object.entries(TYPE_LABELS).map(([k, label]) => (
            <option key={k} value={k}>{label}</option>
          ))}
        </select>
        <div className="relative ml-auto">
          <input
            type="number" min="0.5" step="0.5" value={q.points}
            onChange={(e) => update({ points: e.target.value })}
            className={`${inputCls} w-20 pr-8 text-right`}
          />
          <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-400">pts</span>
        </div>
        <button onClick={moveUp} className="text-slate-400 hover:text-slate-600 px-1">↑</button>
        <button onClick={moveDown} className="text-slate-400 hover:text-slate-600 px-1">↓</button>
        <button onClick={remove} title="Remove question" className="text-slate-400 hover:text-red-600 px-1 text-lg leading-none">×</button>
      </div>

      <textarea
        rows={2}
        placeholder="Question text"
        value={q.text}
        onChange={(e) => update({ text: e.target.value })}
        className={`${inputCls} w-full mt-2`}
      />

      {q.qtype === 'mcq' && (
        <div className="mt-2 space-y-1.5">
          {q.options.map((o, i) => (
            <div key={o._key} className="flex items-center gap-2">
              <input
                type="radio"
                name={`correct-${q._key}`}
                checked={o.is_correct}
                onChange={() => setOptions(q.options.map((x, j) => ({ ...x, is_correct: j === i })))}
                title="Correct answer"
              />
              <input
                placeholder={`Option ${i + 1}`}
                value={o.text}
                onChange={(e) => setOptions(q.options.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)))}
                className={`${inputCls} flex-1`}
              />
              <button
                onClick={() => setOptions(q.options.filter((_, j) => j !== i))}
                disabled={q.options.length <= 2}
                className="text-slate-400 hover:text-red-600 disabled:opacity-30"
              >
                ×
              </button>
            </div>
          ))}
          <button
            onClick={() => setOptions([...q.options, { _key: newKey(), id: null, text: '', is_correct: false }])}
            className="text-sm text-indigo-600 font-medium hover:underline"
          >
            + Add option
          </button>
        </div>
      )}

      {q.qtype === 'true_false' && (
        <div className="flex gap-4 mt-2 text-sm text-slate-700">
          {[true, false].map((v) => (
            <label key={String(v)} className="flex items-center gap-1.5">
              <input type="radio" name={`tf-${q._key}`} checked={q.tfValue === v} onChange={() => update({ tfValue: v })} />
              {v ? 'True' : 'False'} is correct
            </label>
          ))}
        </div>
      )}

      {q.qtype === 'short_answer' && (
        <textarea
          rows={2}
          placeholder={'Accepted answers — one per line (case-insensitive)'}
          value={q.answersText}
          onChange={(e) => update({ answersText: e.target.value })}
          className={`${inputCls} w-full mt-2`}
        />
      )}

      {q.qtype === 'matching' && (
        <div className="mt-2 space-y-1.5">
          {q.pairs.map((p, i) => (
            <div key={p._key} className="flex items-center gap-2">
              <input
                placeholder="Left item"
                value={p.left}
                onChange={(e) => update({ pairs: q.pairs.map((x, j) => (j === i ? { ...x, left: e.target.value } : x)) })}
                className={`${inputCls} flex-1`}
              />
              <span className="text-slate-400">→</span>
              <input
                placeholder="Matches with"
                value={p.right}
                onChange={(e) => update({ pairs: q.pairs.map((x, j) => (j === i ? { ...x, right: e.target.value } : x)) })}
                className={`${inputCls} flex-1`}
              />
              <button onClick={() => update({ pairs: q.pairs.filter((_, j) => j !== i) })} className="text-slate-400 hover:text-red-600">×</button>
            </div>
          ))}
          <button
            onClick={() => update({ pairs: [...q.pairs, { _key: newKey(), left: '', right: '' }] })}
            className="text-sm text-indigo-600 font-medium hover:underline"
          >
            + Add pair
          </button>
        </div>
      )}

      {q.qtype === 'essay' && (
        <textarea
          rows={2}
          placeholder="Grading rubric (what a full-credit answer includes)"
          value={q.rubric}
          onChange={(e) => update({ rubric: e.target.value })}
          className={`${inputCls} w-full mt-2`}
        />
      )}
    </div>
  )
}

function ResultsView({ classId, quizId, totalPoints }) {
  const { data, isLoading } = useQuery({
    queryKey: ['fs-quiz-results', classId, quizId],
    queryFn: async () => {
      const classSnap = await getDoc(doc(db, 'classes', classId))
      const ids = classSnap.data()?.student_ids ?? []
      const users = ids.length ? await fetchUsersByIds(ids) : []
      const students = users
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
  if (isLoading) return <p className="text-slate-400 mt-4">Loading results…</p>

  return (
    <div className="bg-white rounded-xl border border-slate-200 mt-4 overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-slate-50 text-left text-slate-500 border-b border-slate-200">
            <th className="px-4 py-2.5 font-medium">Student</th>
            <th className="px-4 py-2.5 font-medium text-center">Attempts</th>
            <th className="px-4 py-2.5 font-medium text-center">Best Score</th>
            <th className="px-4 py-2.5 font-medium">Status</th>
          </tr>
        </thead>
        <tbody>
          {data.students.map((s) => {
            const attempts = data.attempts[s.student_id] ?? []
            const scores = attempts.filter((a) => a.total_score != null).map((a) => a.total_score)
            const best = scores.length ? Math.max(...scores) : null
            const pendingEssay = attempts.some((a) => a.status === 'submitted')
            return (
              <tr key={s.student_id} className="border-b border-slate-100 last:border-0">
                <td className="px-4 py-2 font-medium text-slate-700">{s.last_name}, {s.first_name}</td>
                <td className="px-4 py-2 text-center text-slate-600">{attempts.length || '—'}</td>
                <td className="px-4 py-2 text-center font-semibold text-slate-800">
                  {best !== null ? `${best} / ${totalPoints}` : '—'}
                </td>
                <td className="px-4 py-2 text-slate-500">
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

function BuilderForm({ classId, quiz, refetch }) {
  const navigate = useNavigate()
  const [settings, setSettings] = useState({
    title: quiz.title,
    instructions: quiz.instructions ?? '',
    time_limit_minutes: quiz.time_limit_minutes ?? '',
    attempts_allowed: quiz.attempts_allowed ?? 1,
    shuffle_questions: quiz.shuffle_questions ?? false,
    opens_at: quiz.opens_at?.slice(0, 16) ?? '',
    closes_at: quiz.closes_at?.slice(0, 16) ?? '',
  })
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
      opens_at: settings.opens_at || null,
      closes_at: settings.closes_at || null,
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
      {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mt-4">{error}</p>}
      {saved && <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2 mt-4">Quiz saved.</p>}

      <div className="bg-white rounded-xl border border-slate-200 p-5 mt-4 space-y-3">
        <div className="grid grid-cols-3 gap-3">
          <label className="block col-span-2">
            <span className="text-sm font-medium text-slate-700">Title</span>
            <input value={settings.title} onChange={set('title')} className={`${inputCls} w-full mt-1`} />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-slate-700">Time limit (min)</span>
            <input type="number" min="1" placeholder="None" value={settings.time_limit_minutes} onChange={set('time_limit_minutes')} className={`${inputCls} w-full mt-1`} />
          </label>
        </div>
        <label className="block">
          <span className="text-sm font-medium text-slate-700">Instructions (optional)</span>
          <input value={settings.instructions} onChange={set('instructions')} className={`${inputCls} w-full mt-1`} />
        </label>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 items-end">
          <label className="block">
            <span className="text-sm font-medium text-slate-700">Attempts</span>
            <input type="number" min="1" max="10" value={settings.attempts_allowed} onChange={set('attempts_allowed')} className={`${inputCls} w-full mt-1`} />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-slate-700">Opens</span>
            <input type="datetime-local" value={settings.opens_at} onChange={set('opens_at')} className={`${inputCls} w-full mt-1`} />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-slate-700">Closes</span>
            <input type="datetime-local" value={settings.closes_at} onChange={set('closes_at')} className={`${inputCls} w-full mt-1`} />
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-700 pb-2">
            <input type="checkbox" checked={settings.shuffle_questions} onChange={set('shuffle_questions')} className="rounded" />
            Shuffle questions
          </label>
        </div>
      </div>

      <div className="flex items-center justify-between mt-5">
        <h3 className="font-semibold text-slate-700">
          Questions <span className="text-slate-400 font-normal">({questions.length} · {totalPoints} pts)</span>
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

      <div className="flex items-center justify-between mt-4 pb-8">
        <div className="flex gap-2">
          <button onClick={() => setQuestions([...questions, blankQuestion()])} className="rounded-lg border border-indigo-200 text-indigo-700 px-4 py-2 text-sm font-medium hover:bg-indigo-50">
            + Add question
          </button>
          <button onClick={deleteQuiz} className="rounded-lg border border-red-200 text-red-600 px-4 py-2 text-sm hover:bg-red-50">
            Delete draft
          </button>
        </div>
        <div className="flex gap-2">
          <button onClick={save} disabled={saving} className="rounded-lg bg-indigo-600 text-white px-5 py-2 font-medium hover:bg-indigo-700 disabled:opacity-50">
            {saving ? 'Saving…' : 'Save draft'}
          </button>
          <button
            onClick={publish}
            disabled={saving || publishing || questions.length === 0}
            className="rounded-lg bg-green-600 text-white px-5 py-2 font-medium hover:bg-green-700 disabled:opacity-40"
          >
            {publishing ? 'Publishing…' : 'Publish'}
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

  if (isLoading) return <p className="text-slate-400">Loading quiz…</p>
  if (isError || !quiz) return <p className="text-red-600">Quiz not found.</p>

  const editable = quiz.status === 'draft'
  const questionCount = quiz.questions?.length ?? 0
  const totalPoints = sumPoints(quiz.questions)

  return (
    <div>
      <Link to={`/teacher/classes/${classId}/quizzes`} className="text-sm text-indigo-600 hover:underline">
        ← Back to quizzes
      </Link>
      <div className="flex items-start justify-between mt-2 max-w-3xl">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">
            {quiz.title}
            {quiz.generated_by === 'ai_generated' && <span title="AI-generated"> ✨</span>}
          </h2>
          <p className="text-slate-500 mt-1 capitalize">
            {quiz.status} · {questionCount} questions · {totalPoints} pts
          </p>
        </div>
        {quiz.status === 'published' && (
          <button
            onClick={closeQuiz}
            className="rounded-lg border border-amber-300 text-amber-700 px-4 py-2 text-sm font-medium hover:bg-amber-50"
          >
            Close quiz
          </button>
        )}
      </div>

      {editable ? (
        <>
          {quiz.generated_by === 'ai_generated' && (
            <p className="text-sm text-indigo-800 bg-indigo-50 border border-indigo-200 rounded-lg px-3 py-2 mt-4 max-w-3xl">
              ✨ AI-generated draft — review every question and answer key before publishing.
            </p>
          )}
          <BuilderForm key={quiz.id} classId={classId} quiz={quiz} refetch={refetch} />
        </>
      ) : (
        <div className="max-w-3xl">
          <ResultsView classId={classId} quizId={quizId} totalPoints={totalPoints} />
          <div className="bg-white rounded-xl border border-slate-200 p-5 mt-4">
            <h3 className="font-semibold text-slate-700 mb-3">Questions (read-only)</h3>
            {(quiz.questions ?? []).map((q, i) => (
              <div key={q.id} className="border-b border-slate-100 last:border-0 py-2">
                <p className="text-sm text-slate-700">
                  <span className="font-semibold">Q{i + 1}.</span> {q.text}
                  <span className="text-slate-400"> · {TYPE_LABELS[q.qtype]} · {q.points} pts</span>
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
