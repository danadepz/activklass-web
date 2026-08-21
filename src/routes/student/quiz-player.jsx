import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { useAuth } from '@/context/useAuth'
import { questionsForAttempt, questionsForStudent } from '@/lib/quizPool'
import {
  attemptsAllowedFor,
  canStart,
  focusEvent,
  hasExpired,
  nextAttemptNumber,
  openAttempt,
  secondsRemaining,
  startBriefing,
} from '@/lib/quizAttempts'
import {
  finishAttempt,
  recordFocusEvent,
  recordReopen,
  startAttempt,
} from '@/hooks/useAttemptSession'
import { gradeQuiz, matchingChoices } from '@/lib/quizGrading'
import { Clock, ArrowRight, AlertCircle, Check } from '@/components/icons'
import { navy, navyDeep, ink, gold, muted, faint, green, red, line, serif, mono } from '@/theme'
import { useDialogBehavior } from '@/components/ui/useDialogBehavior'

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

/**
 * The rules, then a green Start.
 *
 * This screen exists because the clock is now real. Once Start is pressed the
 * attempt is written and the deadline is fixed on the server, so closing the
 * tab no longer stops it — which is only fair if the student was told first.
 * Every rule that will govern the sitting is listed here, in the same words on
 * both clients, and nothing is written until they press the button.
 */
function StartCard({ quiz, attempts, classId, onStarted }) {
  const { profile } = useAuth()
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState(null)

  const attemptNumber = nextAttemptNumber(attempts)
  const questions = useMemo(
    () => questionsForStudent(quiz, { studentId: profile.id, attemptNumber }),
    [quiz, profile.id, attemptNumber],
  )
  const rules = startBriefing({
    quiz,
    attempts,
    studentId: profile.id,
    drawCount: quiz.pool_enabled ? questions.length : null,
  })

  async function begin() {
    setStarting(true)
    setError(null)
    try {
      await startAttempt({ quiz, classId, studentId: profile.id, questions, attemptNumber })
      onStarted()
    } catch (err) {
      setError(err.message)
      setStarting(false)
    }
  }

  return (
    <div style={{ maxWidth: 560, margin: '0 auto' }}>
      <Link to={`/student/classes/${classId}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 13, fontWeight: 600, color: muted, textDecoration: 'none', marginBottom: 14 }}>
        ← Back to class
      </Link>

      <div style={{ background: '#FFFFFF', border: `1px solid ${line}`, borderRadius: 18, overflow: 'hidden' }}>
        <div style={{ background: navy, color: '#FAFAF6', padding: '22px 26px' }}>
          <div style={{ ...mono, fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', color: gold }}>
            Before you start
          </div>
          <h1 style={{ ...serif, fontSize: 26, lineHeight: 1.15, margin: '8px 0 0' }}>{quiz.title}</h1>
        </div>

        <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {rules.map((rule) => (
            <li key={rule.key} style={{ display: 'flex', gap: 14, padding: '15px 26px', borderBottom: '1px solid rgba(14,42,92,0.06)' }}>
              <span aria-hidden="true" style={{ width: 7, height: 7, borderRadius: '50%', background: gold, flexShrink: 0, marginTop: 7 }} />
              <span>
                <span style={{ display: 'block', fontSize: 15, fontWeight: 700, color: ink }}>{rule.label}</span>
                <span style={{ display: 'block', fontSize: 13, color: muted, marginTop: 2, lineHeight: 1.5 }}>{rule.detail}</span>
              </span>
            </li>
          ))}
        </ul>

        <div style={{ padding: '20px 26px' }}>
          {error && (
            <p role="alert" style={{ fontSize: 13, color: red, background: 'rgba(192,57,43,0.07)', border: '1px solid rgba(192,57,43,0.3)', borderRadius: 10, padding: '10px 12px', margin: '0 0 14px' }}>
              {error}
            </p>
          )}
          <button
            onClick={begin}
            disabled={starting}
            className="transition hover:brightness-110 disabled:opacity-60 disabled:cursor-not-allowed"
            style={{
              width: '100%',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 10,
              padding: '15px 22px',
              fontSize: 16,
              fontWeight: 800,
              fontFamily: 'inherit',
              color: '#FFFFFF',
              background: green,
              border: 'none',
              borderRadius: 12,
              cursor: 'pointer',
              boxShadow: '0 3px 0 #14663F',
            }}
          >
            {starting ? 'Starting…' : 'Start'}
          </button>
          <p style={{ fontSize: 12, color: faint, textAlign: 'center', margin: '12px 0 0' }}>
            Your timer begins the moment you press this.
          </p>
        </div>
      </div>
    </div>
  )
}

/**
 * Turn a failed submission into something a student can act on.
 *
 * Only the discarded case can be named with certainty; everything else is
 * reported as itself rather than guessed at.
 */
async function explainSubmitFailure(attemptId, err) {
  try {
    const snap = await getDoc(doc(db, 'quiz_attempts', attemptId))
    const status = snap.data()?.status
    if (status === 'discarded') {
      return 'Your teacher ended this attempt. Nothing was saved — go back to your class and start again.'
    }
    if (status && status !== 'in_progress') {
      return 'This attempt has already been submitted. Check your results from your class page.'
    }
  } catch {
    /* If the check itself fails, the original error is still the best answer. */
  }
  return err.message
}

function Runner({ quiz, attempt, isResume }) {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const attemptNumber = attempt.attempt_number ?? 1
  /* The paper this student sits: the pool draw, the question order and the
     option order, all derived from (quiz, student, attempt).

     Read from the attempt's own `question_ids`, fixed when Start was pressed,
     rather than re-derived from the quiz. A teacher editing the quiz mid-quiz
     cannot make questions appear or vanish under someone halfway through it.
     Option order is still derived from the same seed, so it reproduces. */
  const questions = useMemo(
    () => questionsForAttempt(quiz, attempt, { studentId: profile.id }),
    [quiz, attempt, profile.id],
  )

  /* Answers used to live only in component state, so a refresh, a stray back
     swipe or a browser crash lost the whole attempt with nothing written
     anywhere — and on a timed quiz the student had no way to get the minutes
     back either. They are mirrored into sessionStorage now.

     The key carries the student and the attempt number, so a second attempt
     never inherits the first one's answers, and two students sharing a machine
     never see each other's. sessionStorage rather than localStorage: the draft
     should not outlive the tab. Answers are keyed by question id, so the
     shuffled order above does not have to be restored with them. */
  const draftKey = `activklass:quiz-draft:${quiz.id}:${profile.id}:${attemptNumber}`
  const [answers, setAnswers] = useState(() => {
    try {
      return JSON.parse(sessionStorage.getItem(draftKey) ?? '{}') ?? {}
    } catch {
      return {} // private mode, or a draft written by an older shape
    }
  })
  const [idx, setIdx] = useState(0)
  /* Mirrors for the visibility and reopen listeners below. Those are
     registered once for the whole attempt; reading idx/questions directly
     would either capture the first render's values forever or force the
     listener to re-subscribe on every keystroke. */
  const idxRef = useRef(0)
  const questionsRef = useRef(questions)
  useEffect(() => { idxRef.current = idx }, [idx])
  useEffect(() => { questionsRef.current = questions }, [questions])
  const [confirm, setConfirm] = useState(false)
  const { overlayProps: confirmOverlay, panelProps: confirmPanel } =
    useDialogBehavior(() => setConfirm(false), { open: confirm, label: 'Submit assessment' })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)
  const submittedRef = useRef(false)

  const total = questions.length
  const q = questions[idx]
  const answeredCount = questions.filter((qq) => isAnswered(qq, answers[qq.id])).length
  const unanswered = total - answeredCount

  /* Closes the attempt that already exists rather than creating one. The
     document was written when Start was pressed, which is what anchors the
     deadline to the server clock instead of to whenever this tab opened. */
  async function submit({ expired = false } = {}) {
    if (submittedRef.current) return
    submittedRef.current = true
    setSubmitting(true)
    setError(null)
    try {
      // The drawn paper, not the whole pool: grading `quiz` directly would
      // mark a pooled student against 30 questions they never saw.
      const result = gradeQuiz({ ...quiz, questions }, answers)
      await finishAttempt(attempt.id, { result, answers, expired })
      try { sessionStorage.removeItem(draftKey) } catch { /* nothing to clean up */ }
      navigate(`/student/quizzes/${attempt.id}/result`)
    } catch (err) {
      submittedRef.current = false
      /* The security rule refuses an update once the attempt is no longer
         `in_progress`, so a teacher discarding it lands here as a permissions
         error. "Missing or insufficient permissions" is the wrong thing to
         read halfway through an exam; one extra read buys the real reason. */
      setError(await explainSubmitFailure(attempt.id, err))
      setSubmitting(false)
    }
  }

  // Mirror every change into the draft. Cheap enough at this size that
  // debouncing would only add a window in which the last answer is lost.
  useEffect(() => {
    if (submittedRef.current) return
    try { sessionStorage.setItem(draftKey, JSON.stringify(answers)) } catch { /* quota, or private mode */ }
  }, [draftKey, answers])

  /* Warn before a reload or a tab close mid-attempt. The draft above means the
     answers survive either way, but a timed quiz keeps counting down while the
     tab is gone, so leaving still costs the student — which is exactly the
     thing worth asking about. */
  useEffect(() => {
    const onBeforeUnload = (e) => {
      if (submittedRef.current) return
      e.preventDefault()
      e.returnValue = '' // required by Chrome to show its own generic prompt
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [])

  // Keep a ref to the latest submit so the timer always calls the current one.
  const submitRef = useRef(submit)
  useEffect(() => {
    submitRef.current = submit
  })

  /* Countdown, measured against the deadline the server stamped on the
     attempt rather than counted down from a number held in this tab. Every
     tick re-derives the remainder, so a reload, a sleeping laptop or a
     backgrounded tab all resume at the right number instead of at the number
     this tab last saw. Reaching zero submits what the student has. */
  const hasTimer = secondsRemaining(attempt) !== null
  const [remaining, setRemaining] = useState(() => secondsRemaining(attempt))
  useEffect(() => {
    if (!hasTimer) return
    const tick = () => {
      const left = secondsRemaining(attempt)
      setRemaining(left)
      if (left <= 0) {
        clearInterval(id)
        // Marked expired: an attempt the clock ended and one the student ended
        // are both real marks, but a teacher reading a low score should be able
        // to tell which happened.
        queueMicrotask(() => submitRef.current({ expired: true }))
      }
    }
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [hasTimer, attempt])

  /* An attempt whose deadline passed while nobody was looking -- the tab was
     closed at 4 minutes left and reopened an hour later. Submitting on sight
     is the honest reading: the time was spent, and the answers in the draft
     are what the student had when it ran out. */
  useEffect(() => {
    if (hasExpired(attempt)) queueMicrotask(() => submitRef.current({ expired: true }))
  }, [attempt])

  /* Coming back to an attempt that was already open is a reopen. Recorded, not
     prevented: a dropped connection and a deliberate walk-away look identical
     from here, and which of the two it was is the teacher's call. */
  const reopenLogged = useRef(false)
  useEffect(() => {
    if (!isResume || reopenLogged.current) return
    reopenLogged.current = true
    recordReopen(attempt.id, {
      questionIndex: idxRef.current,
      remainingSeconds: secondsRemaining(attempt),
    }).catch(() => { /* best effort: never interrupt a student mid-quiz */ })
  }, [isResume, attempt])

  /* Leaving the page: tab switch, app switch, minimise, screen lock. Recorded
     with the question that was on screen and how long they were gone.

     `visibilitychange` rather than window blur: blur also fires for clicking
     the devtools or another window on a second monitor, which would report a
     student who never looked away. This sees the tab actually being hidden.

     What it cannot see, and what the teacher's screen must therefore not
     claim: a second device, a phone on the desk, or notes on paper. It is
     evidence that attention left the page, and nothing more. */
  const awayRef = useRef(null)
  const focusCountRef = useRef(
    Array.isArray(attempt.focus_events) ? attempt.focus_events.length : 0,
  )
  useEffect(() => {
    const onVisibility = () => {
      if (document.hidden) {
        awayRef.current = { at: Date.now(), index: idxRef.current }
        return
      }
      const left = awayRef.current
      awayRef.current = null
      if (!left || submittedRef.current) return
      const event = focusEvent({
        at: new Date(left.at).toISOString(),
        questionIndex: left.index,
        questionId: questionsRef.current[left.index]?.id ?? null,
        awayMs: Date.now() - left.at,
      })
      recordFocusEvent(attempt.id, event, focusCountRef.current).catch(() => {})
      focusCountRef.current += 1
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [attempt.id])

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
              style={{ width: 30, height: 30, borderRadius: 8, fontSize: 12, fontWeight: 700, ...mono, cursor: quiz.prevent_backtracking ? 'default' : 'pointer', color: active ? '#FAFAF6' : done ? green : muted, background: active ? navy : done ? 'rgba(31,138,91,0.12)' : '#FFFFFF', border: active ? `1.5px solid ${navy}` : done ? '1.5px solid rgba(31,138,91,0.4)' : '1.5px solid rgba(14,42,92,0.14)' }}
            >
              {i + 1}
            </button>
          )
        })}
      </div>

      {/* Submit confirmation modal */}
      {confirm && (
        <div {...confirmOverlay} style={{ position: 'fixed', inset: 0, background: 'rgba(14,23,51,0.55)', backdropFilter: 'blur(3px)', WebkitBackdropFilter: 'blur(3px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 24 }}>
          <div {...confirmPanel} style={{ width: '100%', maxWidth: 420, background: '#FFFFFF', borderRadius: 18, padding: 28, boxShadow: '0 40px 80px -20px rgba(14,42,92,0.45)' }}>
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
  const queryClient = useQueryClient()
  /* Set when this tab is the one that pressed Start, so the Runner does not
     record its own opening as a reopen. State rather than a ref because it is
     read during render, and it only ever flips once per mount. */
  const [startedNow, setStartedNow] = useState(false)
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['quiz-player', quizId, profile.id],
    queryFn: () => loadPlayerData(classId, quizId, profile.id),
    retry: false,
    refetchOnWindowFocus: false,
  })
  const refetch = () => queryClient.invalidateQueries({ queryKey: ['quiz-player', quizId, profile.id] })

  if (isLoading) return <p style={{ color: faint }}>Loading quiz…</p>
  if (isError) {
    if (error?.message === 'not_enrolled') return <Gate title="Not enrolled" classId={classId}>You can only take quizzes for classes you're enrolled in.</Gate>
    if (error?.message === 'not_assigned') return <Gate title="Not assigned to you" classId={classId}>Your teacher assigned this quiz to specific students, and you're not on the list.</Gate>
    return <Gate title="Quiz not found" classId={classId}>This quiz may have been removed.</Gate>
  }

  const { quiz, attempts } = data
  const last = attempts.find((a) => a.status !== 'in_progress')

  /* One shared decision, from lib/quizAttempts, rather than four checks
     written out here and a different four in the phone app. */
  const gate = canStart({ quiz, attempts, studentId: profile.id })
  if (!gate.ok) {
    const resultLink = last && (
      <> <Link to={`/student/quizzes/${last.id}/result`} style={{ color: navy, fontWeight: 700 }}>View your result</Link>.</>
    )
    if (gate.reason === 'not_published') {
      return <Gate title="Quiz unavailable" classId={classId}>This quiz isn&apos;t open right now.{resultLink}</Gate>
    }
    if (gate.reason === 'not_assigned') {
      return <Gate title="Not assigned to you" classId={classId}>Your teacher assigned this quiz to specific students, and you&apos;re not on the list.</Gate>
    }
    if (gate.reason === 'not_open') {
      return <Gate title="Not open yet" classId={classId}>This quiz opens at {new Date(quiz.opens_at).toLocaleString()}.</Gate>
    }
    if (gate.reason === 'closed') {
      return <Gate title="Quiz closed" classId={classId}>The window for this quiz has passed.</Gate>
    }
    const allowed = attemptsAllowedFor(quiz, profile.id)
    return (
      <Gate title="No attempts left" classId={classId}>
        You&apos;ve used all {allowed} attempt{allowed === 1 ? '' : 's'} for this quiz. Ask your
        teacher if you need another.{resultLink}
      </Gate>
    )
  }

  const open = openAttempt(attempts)
  if (!open) {
    return (
      <StartCard
        quiz={quiz}
        attempts={attempts}
        classId={classId}
        onStarted={() => {
          // Remembered so the Runner does not log its own opening as a reopen.
          setStartedNow(true)
          refetch()
        }}
      />
    )
  }

  return <Runner quiz={quiz} attempt={open} isResume={!startedNow} />
}
