import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { addDoc, collection, doc, getDoc, getDocs, query, serverTimestamp, where } from 'firebase/firestore'
import { db } from '../../lib/firebase'
import { api } from '../../lib/api'
import { fetchUsersByIds } from '../../lib/roster'
import { useAuth } from '../../context/useAuth'
import { Sparkles } from '../../components/icons'

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

const PASS = 75 // an attempt at/above this % counts as mastered for that student

const newId = () =>
  globalThis.crypto?.randomUUID?.() ?? `id-${Date.now()}-${Math.random().toString(36).slice(2)}`

function aiToQuestions(quiz) {
  return (quiz.questions ?? []).map((q) => ({
    id: newId(),
    qtype: 'mcq',
    text: q.text ?? '',
    points: 1,
    ai_generated: true,
    options: (q.options ?? []).map((o) => ({ id: newId(), text: o.text ?? '', is_correct: !!o.correct })),
  }))
}

async function loadScaffolds(classId) {
  const sylSnap = await getDoc(doc(db, 'classes', classId, 'syllabus', 'current'))
  const syl = sylSnap.exists() ? sylSnap.data() : null
  const topics = (syl?.modules ?? []).flatMap((m) =>
    (m.topics ?? []).map((t) => ({ id: t.id, title: t.title, moduleTitle: m.title })),
  )

  const qSnap = await getDocs(query(collection(db, 'quizzes'), where('class_id', '==', classId)))
  const quizzes = qSnap.docs.map((d) => ({ id: d.id, ...d.data() }))

  // Attempts per quiz (quiz_attempts carry quiz_id, student_id, total_score).
  const attemptsByQuiz = {}
  await Promise.all(
    quizzes.map(async (q) => {
      const aSnap = await getDocs(query(collection(db, 'quiz_attempts'), where('quiz_id', '==', q.id)))
      attemptsByQuiz[q.id] = aSnap.docs.map((d) => d.data())
    }),
  )

  const classSnap = await getDoc(doc(db, 'classes', classId))
  const ids = classSnap.exists() ? classSnap.data().student_ids ?? [] : []
  const users = ids.length ? await fetchUsersByIds(ids) : []
  const nameById = {}
  users.forEach((u) => { nameById[u.id] = `${u.last_name}, ${u.first_name}` })

  const rows = []
  for (const topic of topics) {
    const tq = quizzes.filter((q) => q.topic_id === topic.id)
    if (!tq.length) continue
    const bestByStudent = {}
    let attemptCount = 0
    for (const q of tq) {
      const tp = (q.questions ?? []).reduce((s, x) => s + (Number(x.points) || 0), 0)
      if (!tp) continue
      for (const a of attemptsByQuiz[q.id] ?? []) {
        if (a.total_score == null) continue
        const pct = (a.total_score / tp) * 100
        attemptCount++
        const prev = bestByStudent[a.student_id]
        if (prev == null || pct > prev) bestByStudent[a.student_id] = pct
      }
    }
    const pcts = Object.values(bestByStudent)
    if (!pcts.length) continue // no graded submissions yet — can't compute mastery
    const mastery = Math.round(pcts.reduce((s, x) => s + x, 0) / pcts.length)
    const affected = Object.entries(bestByStudent)
      .filter(([, p]) => p < PASS)
      .map(([sid]) => nameById[sid] ?? sid)
    rows.push({
      ...topic,
      mastery,
      quizCount: tq.length,
      attemptCount,
      studentsAffected: affected.length,
      affectedNames: affected,
    })
  }

  const linkedQuizzes = quizzes.filter((q) => q.topic_id).length
  return { rows, topicCount: topics.length, linkedQuizzes }
}

function bucketOf(m) {
  if (m < 60) return 'needs'
  if (m < 80) return 'developing'
  return 'mastered'
}

function CountCard({ label, value, sub, color, borderColor }) {
  return (
    <div style={{ background: '#FFFFFF', border: `1px solid ${borderColor ?? line}`, borderRadius: 14, padding: '16px 18px' }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: color ?? muted, letterSpacing: '0.06em', textTransform: 'uppercase' }}>{label}</div>
      <div style={{ ...serif, fontSize: 28, lineHeight: 1, color: color ?? ink, marginTop: 5 }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: muted, marginTop: 5 }}>{sub}</div>}
    </div>
  )
}

function SectionHead({ dot, title, note }) {
  return (
    <div className="mb-2.5 flex items-center gap-2.5">
      <span style={{ width: 10, height: 10, borderRadius: '50%', background: dot }} />
      <h3 style={{ ...serif, fontSize: 20, color: ink, margin: 0 }}>{title}</h3>
      <span style={{ ...mono, fontSize: 12, color: faint }}>{note}</span>
    </div>
  )
}

export default function ScaffoldTopicsPage() {
  const { classId } = useParams()
  const navigate = useNavigate()
  const { profile } = useAuth()
  const [busy, setBusy] = useState(null)
  const [error, setError] = useState(null)

  const { data, isLoading, isError } = useQuery({
    queryKey: ['fs-scaffolds', classId],
    queryFn: () => loadScaffolds(classId),
  })

  async function buildPack(topic) {
    setBusy(topic.id)
    setError(null)
    try {
      const quiz = await api('/api/generate_quiz', {
        method: 'POST',
        body: { topic: topic.title, count: 10, blooms_level: 'apply' },
      })
      const ref = await addDoc(collection(db, 'quizzes'), {
        class_id: classId,
        teacher_id: profile.id,
        title: `Remediation · ${topic.title}`,
        status: 'draft',
        instructions: '',
        time_limit_minutes: null,
        attempts_allowed: 1,
        shuffle_questions: false,
        opens_at: null,
        closes_at: null,
        generated_by: 'ai_generated',
        questions: aiToQuestions(quiz),
        topic_id: topic.id,
        ai_source: quiz.source ?? null,
        created_at: serverTimestamp(),
        updated_at: serverTimestamp(),
      })
      navigate(`/teacher/classes/${classId}/quizzes/${ref.id}`)
    } catch (err) {
      setError(err.message)
      setBusy(null)
    }
  }

  const header = (
    <div className="mb-[22px] flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="text-[clamp(26px,3.5vw,32px)]" style={{ ...serif, lineHeight: 1.1, letterSpacing: '-0.01em', margin: '0 0 4px', color: ink }}>
          Scaffold Topics
        </h1>
        <p style={{ fontSize: 13.5, color: muted, margin: 0, maxWidth: 640 }}>
          Per-topic mastery across the class, computed from quiz attempts on syllabus-linked quizzes. Weak topics get a one-click remediation quiz.
        </p>
      </div>
    </div>
  )

  if (isLoading) return <p style={{ color: faint }}>Loading scaffold topics…</p>
  if (isError || !data) return <p style={{ color: red }}>Class not found.</p>

  const { rows, topicCount, linkedQuizzes } = data
  const needs = rows.filter((r) => bucketOf(r.mastery) === 'needs').sort((a, b) => a.mastery - b.mastery)
  const developing = rows.filter((r) => bucketOf(r.mastery) === 'developing').sort((a, b) => a.mastery - b.mastery)
  const mastered = rows.filter((r) => bucketOf(r.mastery) === 'mastered').sort((a, b) => b.mastery - a.mastery)

  if (rows.length === 0) {
    return (
      <div>
        {header}
        <div className="text-center" style={{ background: '#FFFFFF', border: `1px solid ${line}`, borderRadius: 16, padding: 40 }}>
          <p style={{ color: muted, margin: '0 0 6px' }}>No topic mastery to show yet.</p>
          <p style={{ fontSize: 13, color: faint, margin: 0, maxWidth: 520, marginInline: 'auto', lineHeight: 1.5 }}>
            {topicCount === 0
              ? 'Build a syllabus first, then generate quizzes from its topics so attempts can be mapped to topics.'
              : linkedQuizzes === 0
                ? 'Generate quizzes from syllabus topics (Quizzes → Generate with AI) so their attempts map to topics here.'
                : 'No graded quiz submissions yet for syllabus-linked quizzes. Mastery appears once students submit.'}
          </p>
          <Link to={`/teacher/classes/${classId}/quizzes`} className="mt-4 inline-flex transition hover:brightness-110" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '12px 20px', fontSize: 14, fontWeight: 700, fontFamily: sans, color: '#FAFAF6', background: navy, borderRadius: 11, textDecoration: 'none', boxShadow: `0 3px 0 ${navyDeep}` }}>
            Go to Quizzes
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className="mb-[22px] flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-[clamp(26px,3.5vw,32px)]" style={{ ...serif, lineHeight: 1.1, letterSpacing: '-0.01em', margin: '0 0 4px', color: ink }}>
            Scaffold Topics
          </h1>
          <p style={{ fontSize: 13.5, color: muted, margin: 0, maxWidth: 640 }}>
            Per-topic mastery across the class, computed from quiz attempts on syllabus-linked quizzes.
          </p>
        </div>
        <div className="inline-flex items-center gap-2.5" style={{ padding: '10px 14px', background: 'rgba(63,169,245,0.08)', border: '1.5px solid rgba(63,169,245,0.3)', borderRadius: 11 }}>
          <span style={{ color: blueText, display: 'inline-flex' }}><Sparkles className="h-3.5 w-3.5" /></span>
          <span style={{ fontSize: 12.5, fontWeight: 700, color: blueText }}>{rows.length} topics from {linkedQuizzes} linked quiz{linkedQuizzes === 1 ? '' : 'zes'}</span>
        </div>
      </div>

      {error && (
        <p role="alert" className="mb-4" style={{ fontSize: 13, color: red, background: 'rgba(192,57,43,0.07)', border: '1px solid rgba(192,57,43,0.3)', borderRadius: 10, padding: '10px 12px' }}>{error}</p>
      )}

      {/* count strip */}
      <div className="mb-[22px] grid grid-cols-2 gap-3.5 lg:grid-cols-4">
        <CountCard label="Topics tracked" value={rows.length} />
        <CountCard label="Needs scaffolding" value={needs.length} sub="below 60% mastery" color={red} borderColor="rgba(192,57,43,0.35)" />
        <CountCard label="Developing" value={developing.length} sub="60–80% mastery" color={goldDeep} borderColor="rgba(245,197,24,0.45)" />
        <CountCard label="Mastered" value={mastered.length} sub="≥ 80% mastery" color={green} borderColor="rgba(31,138,91,0.4)" />
      </div>

      {/* needs scaffolding */}
      {needs.length > 0 && (
        <div className="mb-[22px]">
          <SectionHead dot={red} title="Needs scaffolding" note={`${needs.length} topic${needs.length === 1 ? '' : 's'} · urgent`} />
          <div className="flex flex-col gap-3">
            {needs.map((t) => (
              <div key={t.id} style={{ background: '#FFFFFF', border: '1px solid rgba(192,57,43,0.25)', borderRadius: 16, padding: '20px 22px' }}>
                <div className="mb-3.5 flex items-start justify-between gap-4">
                  <div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: ink }}>{t.title}</div>
                    <div className="mt-1 flex items-center gap-2.5" style={{ fontSize: 12, color: muted }}>
                      <span style={{ ...mono, color: blueText, fontWeight: 600 }}>{t.moduleTitle}</span>
                      <span>·</span>
                      <span>{t.studentsAffected} student{t.studentsAffected === 1 ? '' : 's'} need help</span>
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ ...serif, fontSize: 26, lineHeight: 1, color: red }}>{t.mastery}%</div>
                    <div style={{ ...mono, fontSize: 11, color: faint, marginTop: 4 }}>class mastery</div>
                  </div>
                </div>
                <div style={{ height: 8, background: 'rgba(192,57,43,0.08)', borderRadius: 999, overflow: 'hidden', marginBottom: 16 }}>
                  <div style={{ width: `${t.mastery}%`, height: '100%', background: red, borderRadius: 999 }} />
                </div>

                <div style={{ background: 'rgba(63,169,245,0.05)', border: '1px solid rgba(63,169,245,0.25)', borderRadius: 12, padding: '14px 16px' }}>
                  <div className="mb-2 flex items-center gap-2">
                    <span style={{ display: 'inline-grid', placeItems: 'center', width: 20, height: 20, borderRadius: 6, background: 'rgba(63,169,245,0.2)', color: blueText }}><Sparkles className="h-3 w-3" /></span>
                    <span style={{ fontSize: 11, fontWeight: 700, color: blueText, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Suggested intervention</span>
                  </div>
                  <div style={{ fontSize: 13.5, color: ink, lineHeight: 1.45, marginBottom: 10 }}>
                    Re-teach <strong>{t.title}</strong> with worked examples, then assign a targeted remediation quiz to the {t.studentsAffected} student{t.studentsAffected === 1 ? '' : 's'} below mastery.
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div style={{ fontSize: 12, color: muted }}>
                      <span style={{ fontWeight: 700, color: ink }}>Affected:</span> {t.affectedNames.slice(0, 4).join(' · ') || '—'}
                      {t.affectedNames.length > 4 ? ` +${t.affectedNames.length - 4}` : ''}
                    </div>
                    <button
                      onClick={() => buildPack(t)}
                      disabled={busy === t.id}
                      className="transition hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed"
                      style={{ padding: '9px 16px', fontSize: 12.5, fontWeight: 700, fontFamily: sans, color: '#FAFAF6', background: navy, border: 'none', borderRadius: 9, cursor: 'pointer', boxShadow: `0 2px 0 ${navyDeep}` }}
                    >
                      {busy === t.id ? 'Building…' : 'Build scaffold pack'}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* developing */}
      {developing.length > 0 && (
        <div className="mb-[22px]">
          <SectionHead dot={gold} title="Developing" note={`${developing.length} topic${developing.length === 1 ? '' : 's'} · watch`} />
          <div style={{ background: '#FFFFFF', border: `1px solid ${line}`, borderRadius: 16, overflow: 'hidden' }}>
            {developing.map((t) => (
              <div key={t.id} className="grid items-center gap-4" style={{ gridTemplateColumns: '1fr 160px 120px 80px 120px', padding: '14px 22px', borderBottom: '1px solid rgba(14,42,92,0.05)' }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: ink }}>{t.title}</div>
                <div style={{ ...mono, fontSize: 12, color: blueText, fontWeight: 600 }}>{t.moduleTitle}</div>
                <div style={{ fontSize: 12, color: muted }}>{t.studentsAffected} need help</div>
                <div style={{ ...mono, fontSize: 13, fontWeight: 700, color: goldDeep, textAlign: 'right' }}>{t.mastery}%</div>
                <div style={{ height: 6, background: 'rgba(14,42,92,0.07)', borderRadius: 999, overflow: 'hidden' }}>
                  <div style={{ width: `${t.mastery}%`, height: '100%', background: gold, borderRadius: 999 }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* mastered */}
      {mastered.length > 0 && (
        <div>
          <SectionHead dot={green} title="Mastered" note={`${mastered.length} topic${mastered.length === 1 ? '' : 's'} · on track`} />
          <div style={{ background: '#FFFFFF', border: `1px solid ${line}`, borderRadius: 16, overflow: 'hidden' }}>
            {mastered.map((t) => (
              <div key={t.id} className="grid items-center gap-4" style={{ gridTemplateColumns: '1fr 180px 80px 140px', padding: '14px 22px', borderBottom: '1px solid rgba(14,42,92,0.05)' }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: ink }}>{t.title}</div>
                <div style={{ ...mono, fontSize: 12, color: blueText, fontWeight: 600 }}>{t.moduleTitle}</div>
                <div style={{ ...mono, fontSize: 13, fontWeight: 700, color: green, textAlign: 'right' }}>{t.mastery}%</div>
                <div style={{ height: 6, background: 'rgba(14,42,92,0.07)', borderRadius: 999, overflow: 'hidden' }}>
                  <div style={{ width: `${t.mastery}%`, height: '100%', background: green, borderRadius: 999 }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
