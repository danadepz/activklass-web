import { Link, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { doc, getDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { useAuth } from '@/context/useAuth'
import { correctAnswerText, studentAnswerText } from '@/lib/quizGrading'
import { Check, X, Clock, Sparkles } from '@/components/icons'
import { navy, ink, gold, goldDeep, muted, faint, green, blueText, red, line, serif, mono } from '@/theme'

async function loadFeedback(attemptId) {
  const aSnap = await getDoc(doc(db, 'quiz_attempts', attemptId))
  if (!aSnap.exists()) throw new Error('not_found')
  const attempt = { id: aSnap.id, ...aSnap.data() }
  const qSnap = await getDoc(doc(db, 'quizzes', attempt.quiz_id))
  const quiz = qSnap.exists() ? { id: qSnap.id, ...qSnap.data() } : null
  return { attempt, quiz }
}

function ResultIcon({ state }) {
  if (state === 'correct') return <span style={{ width: 26, height: 26, borderRadius: '50%', background: 'rgba(31,138,91,0.12)', color: green, display: 'grid', placeItems: 'center', flexShrink: 0 }}><Check className="h-4 w-4" /></span>
  if (state === 'pending') return <span style={{ width: 26, height: 26, borderRadius: '50%', background: 'rgba(63,169,245,0.12)', color: blueText, display: 'grid', placeItems: 'center', flexShrink: 0 }}><Clock className="h-4 w-4" /></span>
  return <span style={{ width: 26, height: 26, borderRadius: '50%', background: 'rgba(192,57,43,0.10)', color: red, display: 'grid', placeItems: 'center', flexShrink: 0 }}><X className="h-4 w-4" /></span>
}

export default function QuizFeedback() {
  const { attemptId } = useParams()
  const { profile } = useAuth()
  const { data, isLoading, isError } = useQuery({
    queryKey: ['quiz-feedback', attemptId],
    queryFn: () => loadFeedback(attemptId),
    retry: false,
  })

  if (isLoading) return <p style={{ color: faint }}>Loading results…</p>
  if (isError || !data?.quiz) {
    return (
      <div style={{ maxWidth: 560, margin: '0 auto', background: '#FFFFFF', border: `1px solid ${line}`, borderRadius: 18, padding: 44, textAlign: 'center' }}>
        <h2 style={{ ...serif, fontSize: 22, color: ink, margin: '0 0 8px' }}>Result not found</h2>
        <Link to="/student" style={{ fontSize: 13, fontWeight: 700, color: navy }}>← Back to dashboard</Link>
      </div>
    )
  }

  const { attempt, quiz } = data
  // Ownership guard (security rules also enforce this server-side).
  if (attempt.student_id !== profile.id) {
    return (
      <div style={{ maxWidth: 560, margin: '0 auto', background: '#FFFFFF', border: `1px solid ${line}`, borderRadius: 18, padding: 44, textAlign: 'center' }}>
        <h2 style={{ ...serif, fontSize: 22, color: ink, margin: '0 0 8px' }}>Not available</h2>
        <p style={{ fontSize: 14, color: muted, margin: 0 }}>This result belongs to another student.</p>
      </div>
    )
  }

  const pct = Math.round((attempt.score_ratio ?? 0) * 100)
  const pending = attempt.has_essays_pending
  const passed = pct >= 75
  const descriptor = pending ? 'Awaiting essay review' : passed ? 'Passed' : 'Need Remediation'
  const accent = pending ? blueText : passed ? green : red
  const byId = Object.fromEntries((attempt.per_question ?? []).map((p) => [p.id, p]))

  return (
    <div style={{ maxWidth: 760, margin: '0 auto' }}>
      <Link to={`/student/classes/${attempt.class_id}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 13, fontWeight: 600, color: muted, textDecoration: 'none', marginBottom: 14 }}>
        ← Back to class
      </Link>

      {/* Score summary */}
      <div style={{ background: 'linear-gradient(135deg, #0E2A5C, #061840)', borderRadius: 20, padding: 'clamp(22px, 4vw, 32px)', color: '#FFFFFF', position: 'relative', overflow: 'hidden' }}>
        <div aria-hidden="true" style={{ position: 'absolute', top: -60, right: -40, width: 180, height: 180, border: '1px solid rgba(245,197,24,0.14)', borderRadius: '50%' }} />
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between" style={{ position: 'relative' }}>
          <div>
            <div style={{ fontSize: 12.5, color: 'rgba(250,250,246,0.6)', letterSpacing: '0.05em', textTransform: 'uppercase' }}>{quiz.title}</div>
            <div className="flex items-baseline gap-2" style={{ marginTop: 8 }}>
              <span style={{ ...serif, fontSize: 52, lineHeight: 1 }}>{attempt.total_score}</span>
              <span style={{ fontSize: 20, color: 'rgba(250,250,246,0.7)' }}>/ {attempt.total_possible}</span>
            </div>
            <div style={{ fontSize: 14, color: 'rgba(250,250,246,0.82)', marginTop: 4 }}>{pct}% score</div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <span style={{ display: 'inline-block', padding: '8px 18px', fontSize: 14, fontWeight: 800, borderRadius: 999, color: navy, background: accent === green ? gold : '#FFFFFF', border: `2px solid ${accent}` }}>
              {descriptor}
            </span>
          </div>
        </div>
      </div>

      {pending && (
        <div style={{ display: 'flex', gap: 10, background: 'rgba(63,169,245,0.1)', border: '1px solid rgba(63,169,245,0.4)', borderRadius: 12, padding: '12px 16px', marginTop: 16 }}>
          <Clock className="h-4 w-4" style={{ color: blueText, flexShrink: 0, marginTop: 2 }} />
          <p style={{ fontSize: 13.5, color: muted, margin: 0 }}>
            Your objective answers are graded automatically. Essay questions are awaiting your teacher's review — your final score may rise once they're marked.
          </p>
        </div>
      )}

      {/* Question breakdown */}
      <h2 style={{ ...serif, fontSize: 22, color: ink, margin: '26px 0 14px' }}>Question breakdown</h2>
      <div className="flex flex-col gap-3">
        {(quiz.questions ?? []).map((q, i) => {
          const pq = byId[q.id] ?? {}
          const state = pq.pending ? 'pending' : pq.correct ? 'correct' : 'incorrect'
          const studentText = studentAnswerText(q, attempt.answers?.[q.id])
          const showExplanation = state === 'incorrect' || state === 'pending'
          return (
            <div key={q.id} style={{ background: '#FFFFFF', border: `1px solid ${line}`, borderRadius: 16, padding: 20 }}>
              <div className="flex items-start gap-3">
                <ResultIcon state={state} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="flex items-start justify-between gap-3">
                    <p style={{ fontSize: 15, fontWeight: 600, color: ink, margin: 0, lineHeight: 1.5 }}>
                      <span style={{ ...mono, color: faint, fontWeight: 700, marginRight: 6 }}>Q{i + 1}</span>{q.text}
                    </p>
                    <span style={{ ...mono, fontSize: 12.5, fontWeight: 700, color: state === 'correct' ? green : muted, flexShrink: 0, whiteSpace: 'nowrap' }}>
                      {pq.earned ?? 0}/{pq.possible ?? q.points} pts
                    </span>
                  </div>

                  <div style={{ marginTop: 10, fontSize: 13.5 }}>
                    <div style={{ color: muted }}>
                      <span style={{ fontWeight: 700, color: ink }}>Your answer:</span>{' '}
                      <span style={{ color: state === 'correct' ? green : state === 'pending' ? ink : red }}>{studentText}</span>
                    </div>
                    {state !== 'correct' && q.qtype !== 'essay' && (
                      <div style={{ color: muted, marginTop: 4 }}>
                        <span style={{ fontWeight: 700, color: ink }}>Correct answer:</span>{' '}
                        <span style={{ color: green }}>{correctAnswerText(q)}</span>
                      </div>
                    )}
                  </div>

                  {showExplanation && (
                    <div style={{ display: 'flex', gap: 9, background: 'rgba(63,169,245,0.07)', border: '1px solid rgba(63,169,245,0.28)', borderRadius: 11, padding: '11px 13px', marginTop: 12 }}>
                      <span style={{ color: blueText, flexShrink: 0, marginTop: 1 }}><Sparkles className="h-4 w-4" /></span>
                      <p style={{ fontSize: 13, color: muted, lineHeight: 1.55, margin: 0 }}>
                        {q.qtype === 'essay'
                          ? (q.rubric ? <><strong style={{ color: ink }}>What we look for:</strong> {q.rubric}</> : 'Your teacher will review and score this response.')
                          : q.explanation
                            ? <><strong style={{ color: ink }}>Explanation:</strong> {q.explanation}</>
                            : <><strong style={{ color: ink }}>Review:</strong> The correct answer is “{correctAnswerText(q)}”. Revisit this topic in your class materials.</>}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {!passed && !pending && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'rgba(245,197,24,0.14)', border: '1px solid rgba(245,197,24,0.5)', borderRadius: 14, padding: '14px 18px', marginTop: 18 }}>
          <span style={{ width: 36, height: 36, borderRadius: 10, background: '#FFFFFF', color: goldDeep, display: 'grid', placeItems: 'center', flexShrink: 0 }}><Sparkles className="h-5 w-5" /></span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: ink }}>Want to close the gaps?</div>
            <div style={{ fontSize: 13, color: muted, marginTop: 1 }}>Check your Remediation feed for a custom review guide.</div>
          </div>
          <Link to="/student/remediation" style={{ padding: '9px 15px', fontSize: 13, fontWeight: 700, color: navy, background: gold, borderRadius: 10, textDecoration: 'none', flexShrink: 0 }}>Open</Link>
        </div>
      )}
    </div>
  )
}
