import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { addDoc, collection, doc, getDoc, getDocs, query, serverTimestamp, where } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { useAuth } from '@/context/useAuth'
import { gradeQuiz, matchingChoices } from '@/lib/quizGrading'
import { Clock, ArrowRight, AlertCircle, Check } from '@/components/icons'
import { navy, navyDeep, ink, gold, muted, faint, green, red } from '@/theme'

const line = 'rgba(14,42,92,0.08)'
const serif = { fontFamily: "'DM Serif Display', Georgia, serif" }
const mono = { fontFamily: "'JetBrains Mono', ui-monospace, monospace" }

function isAnswered(q, a) {
  switch (q.qtype) {
    case 'mcq': return a != null
    case 'true_false': return typeof a === 'boolean'
    case 'short_answer':
    case 'essay': return typeof a === 'string' && a.trim() !== ''
    case 'matching': return a != null && Object.keys(a).length > 0
    default: return false
  }
}

async function loadPlayerData(classId, quizId, studentId) {
  const [quizSnap, classSnap] = await Promise.all([
    getDoc(doc(db, 'quizzes', quizId)),
    getDoc(doc(db, 'classes', classId)),
  ])
  if (!quizSnap.exists()) throw new Error('not_found')
  if (!classSnap.exists()) throw new Error('not_found')
  const quiz = { id: quizSnap.id, ...quizSnap.data() }
  const clazz = classSnap.data()
  if (!(clazz.student_ids ?? []).includes(studentId)) throw new Error('not_enrolled')
  // Respect targeted assignment ('all'/legacy = everyone; otherwise an id list).
  const assignedTo = quiz.assigned_to
  if (assignedTo && assignedTo !== 'all' && !(Array.isArray(assignedTo) && assignedTo.includes(studentId))) {
    throw new Error('not_assigned')
  }

  const attemptsSnap = await getDocs(
    query(
      collection(db, 'quiz_attempts'),
      where('quiz_id', '==', quizId),
      where('student_id', '==', studentId),
    ),
  )
  const attempts = attemptsSnap.docs.map((d) => ({ id: d.id, ...d.data() }))
  return { quiz, attempts }
}

/** Optional open/close window check (datetime-local strings, local time). */
function windowState(quiz) {
  const now = Date.now()
  if (quiz.opens_at && now < new Date(quiz.opens_at).getTime()) return 'not_open'
  if (quiz.closes_at && now > new Date(quiz.closes_at).getTime()) return 'closed'
  return 'open'
}

function fmtTime(secs) {
  const m = Math.floor(secs / 60)
  const s = secs % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

function Gate({ title, children, classId }) {
  return (
    <div style={{ maxWidth: 560, margin: '0 auto', background: '#FFFFFF', border: `1px solid ${line}`, borderRadius: 18, padding: 44, textAlign: 'center' }}>
      <h2 style={{ ...serif, fontSize: 24, color: ink, margin: '0 0 8px' }}>{title}</h2>
      <p style={{ fontSize: 14, color: muted, margin: '0 0 18px' }}>{children}</p>
      <Link to={`/student/classes/${classId}`} style={{ fontSize: 13, fontWeight: 700, color: navy }}>← Back to class</Link>
    </div>
  )
}

function OptionRow({ selected, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="transition"
      style={{
        display: 'flex', alignItems: 'center', gap: 12, width: '100%', textAlign: 'left',
        padding: '13px 16px', borderRadius: 12, cursor: 'pointer', fontSize: 14.5, color: ink,
        background: selected ? 'rgba(14,42,92,0.05)' : '#FFFFFF',
        border: selected ? `1.5px solid ${navy}` : '1.5px solid rgba(14,42,92,0.14)',
      }}
    >
      <span style={{ width: 20, height: 20, borderRadius: '50%', flexShrink: 0, display: 'grid', placeItems: 'center', border: selected ? `6px solid ${navy}` : '2px solid #C3CCDB', background: '#FFFFFF' }} />
      {children}
    </button>
  )
}

function QuestionView({ q, answer, setAnswer }) {
  if (q.qtype === 'mcq') {
    return (
      <div className="flex flex-col gap-2.5">
        {(q.options ?? []).map((o) => (
          <OptionRow key={o.id} selected={answer === o.id} onClick={() => setAnswer(o.id)}>{o.text}</OptionRow>
        ))}
      </div>
    )
  }
  if (q.qtype === 'true_false') {
    return (
      <div className="flex flex-col gap-2.5">
        {[true, false].map((v) => (
          <OptionRow key={String(v)} selected={answer === v} onClick={() => setAnswer(v)}>{v ? 'True' : 'False'}</OptionRow>
        ))}
      </div>
    )
  }
  if (q.qtype === 'short_answer') {
    return (
      <input
        autoFocus
        value={answer ?? ''}
        onChange={(e) => setAnswer(e.target.value)}
        placeholder="Type your answer…"
        style={{ width: '100%', padding: '13px 15px', fontSize: 15, color: ink, background: '#FFFFFF', border: '1.5px solid rgba(14,42,92,0.14)', borderRadius: 12 }}
      />
    )
  }
  if (q.qtype === 'essay') {
    const words = (answer ?? '').trim() ? (answer).trim().split(/\s+/).length : 0
    return (
      <div>
        <textarea
          rows={8}
          value={answer ?? ''}
          onChange={(e) => setAnswer(e.target.value)}
          placeholder="Write your response…"
          style={{ width: '100%', padding: '14px 16px', fontSize: 15, lineHeight: 1.6, color: ink, background: '#FFFFFF', border: '1.5px solid rgba(14,42,92,0.14)', borderRadius: 12, resize: 'vertical' }}
        />
        <div style={{ ...mono, fontSize: 12, color: faint, marginTop: 6, textAlign: 'right' }}>{words} word{words === 1 ? '' : 's'}</div>
      </div>
    )
  }
  if (q.qtype === 'matching') {
    const pairs = q.answer_key?.pairs ?? []
    const choices = matchingChoices(q)
    return (
      <div className="flex flex-col gap-2.5">
        {pairs.map((p, i) => (
          <div key={i} className="flex items-center gap-3" style={{ background: '#FFFFFF', border: '1.5px solid rgba(14,42,92,0.14)', borderRadius: 12, padding: '11px 14px' }}>
            <span style={{ flex: 1, fontSize: 14.5, color: ink }}>{p.left}</span>
            <span style={{ color: faint }}>→</span>
            <select
              value={answer?.[i] ?? ''}
              onChange={(e) => setAnswer({ ...(answer ?? {}), [i]: e.target.value })}
              style={{ flex: 1, padding: '9px 11px', fontSize: 14, color: ink, background: '#FFFFFF', border: '1.5px solid rgba(14,42,92,0.14)', borderRadius: 9, cursor: 'pointer' }}
            >
              <option value="">— choose —</option>
              {choices.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
        ))}
      </div>
    )
  }
  return null
}

function Runner({ classId, quiz, attemptNumber }) {
  const { profile } = useAuth()
  const navigate = useNavigate()
  // Shuffle once, in a lazy state initializer (impure work belongs here, not in
  // render/useMemo — keeps the order stable across re-renders).
  const [questions] = useState(() => {
    const qs = [...(quiz.questions ?? [])]
    if (quiz.shuffle_questions) {
      for (let i = qs.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1))
        ;[qs[i], qs[j]] = [qs[j], qs[i]]
      }
    }
    return qs
  })

  const [answers, setAnswers] = useState({})
  const [idx, setIdx] = useState(0)
  const [confirm, setConfirm] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)
  const submittedRef = useRef(false)

  const total = questions.length
  const q = questions[idx]
  const answeredCount = questions.filter((qq) => isAnswered(qq, answers[qq.id])).length
  const unanswered = total - answeredCount

  async function submit() {
    if (submittedRef.current) return
    submittedRef.current = true
    setSubmitting(true)
    setError(null)
    try {
      const result = gradeQuiz(quiz, answers)
      const ref = await addDoc(collection(db, 'quiz_attempts'), {
        quiz_id: quiz.id,
        class_id: classId,
        student_id: profile.id,
        module_id: quiz.module_id ?? null,
        attempt_number: attemptNumber,
        answers,
        per_question: result.per_question,
        // total_score is what the teacher results screen reads; score mirrors
        // the documented quiz_attempts schema.
        total_score: result.total_score,
        score: result.total_score,
        total_possible: result.total_possible,
        score_ratio: result.score_ratio,
        has_essays_pending: result.has_essays,
        status: result.has_essays ? 'submitted' : 'graded',
        submitted_at: serverTimestamp(),
      })
      navigate(`/student/quizzes/${ref.id}/result`)
    } catch (err) {
      submittedRef.current = false
      setError(err.message)
      setSubmitting(false)
    }
  }

  // Keep a ref to the latest submit so the timer always calls the current one.
  const submitRef = useRef(submit)
  useEffect(() => {
    submitRef.current = submit
  })

  // Countdown timer (auto-submits at zero). The auto-submit is fired from the
  // interval callback via a microtask, not synchronously in the effect body.
  const hasTimer = quiz.time_limit_minutes != null
  const [remaining, setRemaining] = useState(hasTimer ? quiz.time_limit_minutes * 60 : null)
  useEffect(() => {
    if (!hasTimer) return
    const id = setInterval(() => {
      setRemaining((r) => {
        if (r <= 1) {
          clearInterval(id)
          queueMicrotask(() => submitRef.current())
          return 0
        }
        return r - 1
      })
    }, 1000)
    return () => clearInterval(id)
  }, [hasTimer])

  const lowTime = remaining != null && remaining <= 30

  return (
    <div style={{ maxWidth: 720, margin: '0 auto' }}>
      {/* Header: progress + timer */}
      <div className="flex items-center justify-between" style={{ marginBottom: 14 }}>
        <div>
          <div style={{ ...serif, fontSize: 22, color: ink, lineHeight: 1.1 }}>{quiz.title}</div>
          <div style={{ fontSize: 12.5, color: muted, marginTop: 2 }}>Question {idx + 1} of {total}</div>
        </div>
        {remaining != null && (
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '8px 14px', borderRadius: 999, fontWeight: 700, ...mono, fontSize: 14, color: lowTime ? red : navy, background: lowTime ? 'rgba(192,57,43,0.08)' : 'rgba(14,42,92,0.06)', border: `1px solid ${lowTime ? 'rgba(192,57,43,0.35)' : 'rgba(14,42,92,0.12)'}` }}>
            <Clock className="h-4 w-4" /> {fmtTime(remaining)}
          </div>
        )}
      </div>

      {/* Progress bar */}
      <div style={{ height: 6, borderRadius: 999, background: 'rgba(14,42,92,0.08)', overflow: 'hidden', marginBottom: 20 }}>
        <div style={{ height: '100%', width: `${((idx + 1) / total) * 100}%`, background: `linear-gradient(90deg, ${gold}, #3FA9F5)`, transition: 'width 0.3s' }} />
      </div>

      {/* Question card */}
      <div style={{ background: 'rgba(255,255,255,0.85)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)', border: `1px solid ${line}`, borderRadius: 18, padding: 'clamp(20px, 3vw, 28px)' }}>
        <div className="flex items-start gap-3" style={{ marginBottom: 18 }}>
          <span style={{ ...mono, background: navy, color: gold, fontSize: 12, fontWeight: 700, padding: '5px 10px', borderRadius: 8, flexShrink: 0 }}>Q{idx + 1}</span>
          <p style={{ fontSize: 16.5, color: ink, lineHeight: 1.5, margin: 0, fontWeight: 600 }}>{q.text}</p>
        </div>
        <QuestionView q={q} answer={answers[q.id]} setAnswer={(v) => setAnswers((a) => ({ ...a, [q.id]: v }))} />
      </div>

      {error && (
        <p role="alert" style={{ fontSize: 13, color: red, background: 'rgba(192,57,43,0.07)', border: '1px solid rgba(192,57,43,0.3)', borderRadius: 10, padding: '10px 12px', marginTop: 14 }}>{error}</p>
      )}

      {/* Nav controls */}
      <div className="flex items-center justify-between" style={{ marginTop: 20 }}>
        {!quiz.prevent_backtracking ? (
          <button
            onClick={() => setIdx((i) => Math.max(0, i - 1))}
            disabled={idx === 0}
            style={{ padding: '11px 18px', fontSize: 14, fontWeight: 700, color: navy, background: '#FFFFFF', border: '1.5px solid rgba(14,42,92,0.14)', borderRadius: 11, cursor: idx === 0 ? 'not-allowed' : 'pointer', opacity: idx === 0 ? 0.4 : 1 }}
          >
            ← Previous
          </button>
        ) : (
          <div />
        )}
        {idx < total - 1 ? (
          <button
            onClick={() => setIdx((i) => Math.min(total - 1, i + 1))}
            className="transition hover:brightness-110"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '11px 20px', fontSize: 14, fontWeight: 700, color: '#FAFAF6', background: navy, border: 'none', borderRadius: 11, cursor: 'pointer', boxShadow: `0 3px 0 ${navyDeep}` }}
          >
            Next
            <span style={{ display: 'inline-grid', placeItems: 'center', width: 20, height: 20, borderRadius: '50%', background: gold, color: navy }}>
              <ArrowRight className="h-3 w-3" />
            </span>
          </button>
        ) : (
          <button
            onClick={() => setConfirm(true)}
            className="transition hover:brightness-110"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '11px 22px', fontSize: 14, fontWeight: 700, color: navy, background: gold, border: 'none', borderRadius: 11, cursor: 'pointer', boxShadow: '0 3px 0 #B89200' }}
          >
            <Check className="h-4 w-4" /> Submit
          </button>
        )}
      </div>

      {/* Question dots */}
      <div className="flex flex-wrap gap-2" style={{ marginTop: 20, justifyContent: 'center' }}>
        {questions.map((qq, i) => {
          const done = isAnswered(qq, answers[qq.id])
          const active = i === idx
          return (
            <button
              key={qq.id}
              onClick={quiz.prevent_backtracking ? undefined : () => setIdx(i)}
              title={quiz.prevent_backtracking ? `Question ${i + 1}` : `Question ${i + 1}${done ? ' (answered)' : ''}`}
              style={{ width: 30, height: 30, borderRadius: 8, fontSize: 12, fontWeight: 700, ...mono, cursor: quiz.prevent_backtracking ? 'default' : 'pointer', color: active ? '#FFFFFF' : done ? green : muted, background: active ? navy : done ? 'rgba(31,138,91,0.12)' : '#FFFFFF', border: active ? `1.5px solid ${navy}` : done ? '1.5px solid rgba(31,138,91,0.4)' : '1.5px solid rgba(14,42,92,0.14)' }}
            >
              {i + 1}
            </button>
          )
        })}
      </div>

      {/* Submit confirmation modal */}
      {confirm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(14,23,51,0.55)', backdropFilter: 'blur(3px)', WebkitBackdropFilter: 'blur(3px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 24 }}>
          <div style={{ width: '100%', maxWidth: 420, background: '#FFFFFF', borderRadius: 18, padding: 28, boxShadow: '0 40px 80px -20px rgba(14,42,92,0.45)' }}>
            <h3 style={{ ...serif, fontSize: 22, color: ink, margin: '0 0 8px' }}>Submit assessment?</h3>
            {unanswered > 0 ? (
              <div style={{ display: 'flex', gap: 10, background: 'rgba(245,197,24,0.14)', border: '1px solid rgba(245,197,24,0.5)', borderRadius: 12, padding: '12px 14px', margin: '4px 0 16px' }}>
                <AlertCircle className="h-4 w-4" style={{ color: '#8B6A00', flexShrink: 0, marginTop: 2 }} />
                <p style={{ fontSize: 13.5, color: muted, margin: 0 }}>
                  You have <strong style={{ color: ink }}>{unanswered}</strong> unanswered question{unanswered === 1 ? '' : 's'}. You can't change answers after submitting.
                </p>
              </div>
            ) : (
              <p style={{ fontSize: 14, color: muted, margin: '0 0 16px' }}>All questions answered. You can't change answers after submitting.</p>
            )}
            <div className="flex justify-end gap-3">
              <button onClick={() => setConfirm(false)} disabled={submitting} style={{ padding: '11px 18px', fontSize: 14, fontWeight: 600, color: '#3A4A6B', background: '#FFFFFF', border: '1.5px solid rgba(14,42,92,0.14)', borderRadius: 10, cursor: 'pointer' }}>
                Keep working
              </button>
              <button onClick={submit} disabled={submitting} className="transition hover:brightness-110 disabled:opacity-50" style={{ padding: '11px 20px', fontSize: 14, fontWeight: 700, color: '#FAFAF6', background: navy, border: 'none', borderRadius: 10, cursor: 'pointer' }}>
                {submitting ? 'Submitting…' : 'Submit now'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default function QuizPlayer() {
  const { classId, quizId } = useParams()
  const { profile } = useAuth()
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['quiz-player', quizId, profile.id],
    queryFn: () => loadPlayerData(classId, quizId, profile.id),
    retry: false,
    refetchOnWindowFocus: false,
  })

  if (isLoading) return <p style={{ color: faint }}>Loading quiz…</p>
  if (isError) {
    if (error?.message === 'not_enrolled') return <Gate title="Not enrolled" classId={classId}>You can only take quizzes for classes you're enrolled in.</Gate>
    if (error?.message === 'not_assigned') return <Gate title="Not assigned to you" classId={classId}>Your teacher assigned this quiz to specific students, and you're not on the list.</Gate>
    return <Gate title="Quiz not found" classId={classId}>This quiz may have been removed.</Gate>
  }

  const { quiz, attempts } = data
  const allowed = quiz.attempts_allowed ?? 1
  const taken = attempts.length

  if (quiz.status !== 'published') {
    const last = attempts[0]
    return (
      <Gate title="Quiz unavailable" classId={classId}>
        This quiz isn't open right now.
        {last && <> <Link to={`/student/quizzes/${last.id}/result`} style={{ color: navy, fontWeight: 700 }}>View your last result</Link>.</>}
      </Gate>
    )
  }

  const win = windowState(quiz)
  if (win === 'not_open') return <Gate title="Not open yet" classId={classId}>This quiz opens at {new Date(quiz.opens_at).toLocaleString()}.</Gate>
  if (win === 'closed') return <Gate title="Quiz closed" classId={classId}>The window for this quiz has passed.</Gate>

  if (taken >= allowed) {
    const last = attempts[0]
    return (
      <Gate title="No attempts left" classId={classId}>
        You've used all {allowed} attempt{allowed === 1 ? '' : 's'} for this quiz.
        {last && <> <Link to={`/student/quizzes/${last.id}/result`} style={{ color: navy, fontWeight: 700 }}>View your result</Link>.</>}
      </Gate>
    )
  }

  return <Runner classId={classId} quiz={quiz} attemptNumber={taken + 1} />
}
