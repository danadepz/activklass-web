import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { collection, getDocs, query, where, documentId } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { loadSyllabus } from '@/lib/studentData'
import { useAuth } from '@/context/useAuth'
import Markdown from '@/components/Markdown'
import { TrendingUp, ArrowRight, Check, X } from '@/components/icons'
import { navy, ink, goldDeep, muted, faint, green, line, serif, mono } from '@/theme'
import { attemptsAllowedFor, finishedAttempts, openAttempt } from '@/lib/quizAttempts'
import {
  BUCKETS,
  RESOURCE_META,
  assignedToStudent,
  findTopic,
  masteryOf,
  quizTotalPoints,
  remediationQuizzes,
  resourceState,
} from './scaffolding'
import { SkeletonList } from '@/components/ui/Skeleton'
import { useDialogBehavior } from '@/components/ui/useDialogBehavior'

/**
 * Scaffolded Learning, student side.
 *
 * Each remediation is one weak topic, and carries the two modules that act on
 * it: Take Test Mastery (sit the quiz linked to the topic; the result moves the
 * mastery figure) and Review Materials (the resources the teacher attached to
 * that topic in the syllabus).
 *
 * What a card can show is exactly what the publish path writes onto each
 * student's copy — see assignmentFrom() in features/classes/remediation.js:
 * topic, title, guidance, recommended_quiz_id, class_id. This page used to
 * read study_guide_markdown / practice_items / recommended_materials /
 * weakness_description, which nothing on the web or in /api/remediate has
 * ever written, so the teacher's guidance never reached the student and every
 * card was a heading over two empty modules.
 */
async function loadScaffolding(studentId) {
  const remSnap = await getDocs(query(collection(db, 'remediations'), where('student_id', '==', studentId)))
  const remediations = remSnap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (b.created_at?.seconds ?? 0) - (a.created_at?.seconds ?? 0))

  const classIds = [...new Set(remediations.map((r) => r.class_id).filter(Boolean))]

  // Class labels in batched reads (enrolled classes are readable). Tolerant
  // like every other read below: a remediation can outlive its class (deleted,
  // or unreadable under current rules), and one bad chunk must cost only its
  // labels -- not the whole page. This exact query throwing is what made the
  // dashboard say "1 review guide waiting" while this page showed none.
  const labels = {}
  for (let i = 0; i < classIds.length; i += 30) {
    const chunk = classIds.slice(i, i + 30)
    const cSnap = await getDocs(query(collection(db, 'classes'), where(documentId(), 'in', chunk))).catch(() => null)
    cSnap?.forEach((d) => {
      const c = d.data()
      labels[d.id] = c.subject_code || c.subject || c.section || 'Class'
    })
  }

  /* Every read is individually tolerant: a class whose syllabus or quizzes are
     unreadable should cost that one card its extras, not blank the page. */
  const [syllabi, quizSnaps, attemptsSnap] = await Promise.all([
    Promise.all(classIds.map((id) => loadSyllabus(id).catch(() => null))),
    Promise.all(
      classIds.map((id) =>
        getDocs(query(collection(db, 'quizzes'), where('class_ids', 'array-contains', id))).catch(() => null),
      ),
    ),
    getDocs(query(collection(db, 'quiz_attempts'), where('student_id', '==', studentId))).catch(() => null),
  ])

  const syllabusByClass = {}
  const quizzesByClass = {}
  classIds.forEach((id, i) => {
    syllabusByClass[id] = syllabi[i] ?? null
    // Students never see drafts, and only quizzes actually assigned to them.
    quizzesByClass[id] = (quizSnaps[i]?.docs ?? [])
      .map((d) => ({ id: d.id, ...d.data() }))
      .filter((q) => (q.status === 'published' || q.status === 'closed') && assignedToStudent(q, studentId))
  })

  const attemptsByQuiz = {}
  ;(attemptsSnap?.docs ?? []).forEach((d) => {
    const a = { id: d.id, ...d.data() }
    ;(attemptsByQuiz[a.quiz_id] ??= []).push(a)
  })
  for (const list of Object.values(attemptsByQuiz)) {
    list.sort((a, b) => (b.submitted_at?.seconds ?? 0) - (a.submitted_at?.seconds ?? 0))
  }

  return {
    remediations: remediations.map((r) => ({ ...r, class_label: labels[r.class_id] ?? null })),
    syllabusByClass,
    quizzesByClass,
    attemptsByQuiz,
  }
}

function SectionLabel({ children }) {
  return (
    <div style={{ fontSize: 11, fontWeight: 700, color: faint, letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: 10 }}>
      {children}
    </div>
  )
}

/* ─────────────────────── Take Test Mastery ─────────────────────── */

/**
 * The quiz(zes) wired to this topic, plus what the student's result has done to
 * their mastery of it. Nothing here writes: mastery is recomputed from attempts,
 * so finishing a quiz is what moves the number.
 */
function TakeTestMastery({ r, quizzes, attemptsByQuiz, studentId }) {
  const linked = remediationQuizzes(r, quizzes)
  const mastery = masteryOf(linked, attemptsByQuiz)
  const bucket = BUCKETS[mastery.bucket]

  if (linked.length === 0) {
    return (
      <p style={{ fontSize: 13, color: muted, lineHeight: 1.55, border: `1px dashed ${line}`, borderRadius: 12, padding: '14px 16px', margin: 0 }}>
        {r.topic_id
          ? 'No mastery test has been published for this topic yet. Work through the materials above — your teacher may publish one to check your progress.'
          : 'This review guide isn’t linked to a module topic, and no mastery test has been attached to it yet.'}
      </p>
    )
  }

  return (
    <>
      <div
        className="flex flex-wrap items-center gap-3"
        style={{ background: 'rgba(14,42,92,0.025)', border: `1px solid ${line}`, borderRadius: 12, padding: '13px 15px', marginBottom: 12 }}
      >
        <span
          style={{
            display: 'inline-flex', alignItems: 'center', flexShrink: 0,
            fontSize: 12, fontWeight: 700, borderRadius: 999, padding: '4px 12px',
            color: bucket.fg, background: bucket.bg, border: `1px solid ${bucket.border}`,
          }}
        >
          {mastery.pct == null ? bucket.label : `${bucket.label} · ${mastery.pct}%`}
        </span>
        <span style={{ flex: '1 1 200px', minWidth: 0, fontSize: 12.5, color: muted, lineHeight: 1.5 }}>
          {mastery.pct == null
            ? 'You have not been scored on this topic yet. Your first result sets your mastery.'
            : `Your best of ${mastery.attempts} scored attempt${mastery.attempts === 1 ? '' : 's'}. A higher score replaces it.`}
        </span>
      </div>

      {mastery.pct != null && (
        <div style={{ height: 8, borderRadius: 999, background: 'rgba(14,42,92,0.07)', overflow: 'hidden', marginBottom: 14 }}>
          <div style={{ height: '100%', width: `${Math.min(100, mastery.pct)}%`, background: bucket.fg, borderRadius: 999, transition: 'width 0.6s' }} />
        </div>
      )}

      <div className="flex flex-col gap-2.5">
        {mastery.quizzes.map((quiz) => {
          const attempts = attemptsByQuiz[quiz.id] ?? []
          // An open attempt is not a used one. Counting it showed "1 of 1
          // used" and no button to the student who was still sitting it.
          // Same rule as the class page's Topics tab and lib/quizAttempts.
          const finished = finishedAttempts(attempts)
          const live = openAttempt(attempts)
          const allowed = attemptsAllowedFor(quiz, studentId)
          const used = finished.length
          const total = quizTotalPoints(quiz)
          const scored = finished.map((a) => a.total_score).filter((v) => v != null)
          const best = scored.length ? Math.max(...scored) : null
          const canTake = quiz.status === 'published' && (live || used < allowed)
          const latest = finished[finished.length - 1] ?? null

          return (
            <div
              key={quiz.id}
              className="flex flex-wrap items-center justify-between gap-3"
              style={{ background: '#FFFFFF', border: `1px solid ${line}`, borderRadius: 12, padding: '13px 15px' }}
            >
              <div style={{ minWidth: 0, flex: '1 1 180px' }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: ink }}>{quiz.title}</div>
                <div style={{ fontSize: 12.5, color: faint, marginTop: 2 }}>
                  {live
                    ? 'In progress — carry on where you left off'
                    : best == null
                      ? `${total} point${total === 1 ? '' : 's'} · not taken`
                      : `Best ${best}/${total} · ${used} of ${allowed} attempt${allowed === 1 ? '' : 's'} used`}
                </div>
              </div>

              {canTake ? (
                <Link
                  to={`/student/classes/${r.class_id}/quizzes/${quiz.id}`}
                  className="transition hover:brightness-110"
                  style={{ flexShrink: 0, padding: '9px 16px', fontSize: 13, fontWeight: 700, color: '#FAFAF6', background: navy, borderRadius: 10, textDecoration: 'none' }}
                >
                  {live ? 'Resume' : used > 0 ? 'Retake' : 'Take test'}
                </Link>
              ) : latest ? (
                <Link
                  to={`/student/quizzes/${latest.id}/result`}
                  className="transition hover:brightness-105"
                  style={{ flexShrink: 0, padding: '9px 16px', fontSize: 13, fontWeight: 700, color: navy, background: '#FFFFFF', border: '1.5px solid rgba(14,42,92,0.16)', borderRadius: 10, textDecoration: 'none' }}
                >
                  View result
                </Link>
              ) : (
                <span style={{ flexShrink: 0, fontSize: 12.5, color: faint }}>Closed</span>
              )}
            </div>
          )
        })}
      </div>
    </>
  )
}

/* ─────────────────────── Review Materials ─────────────────────── */

/** One resource row. Unavailable ones say why instead of offering a dead link. */
function ResourceRow({ res, onOpenNote }) {
  const meta = RESOURCE_META[res.resource_type] ?? RESOURCE_META.file
  const state = resourceState(res)

  if (!state.available) {
    return (
      <div
        className="flex items-start gap-3"
        style={{ border: `1px dashed ${line}`, borderRadius: 12, padding: '13px 15px', background: 'rgba(14,42,92,0.015)' }}
      >
        <span style={{ width: 36, height: 36, borderRadius: 9, background: '#FFFFFF', border: `1px solid ${line}`, display: 'grid', placeItems: 'center', flexShrink: 0, fontSize: 17, opacity: 0.45 }}>
          {meta.icon}
        </span>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 10.5, fontWeight: 700, color: faint, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
            {meta.label} · unavailable
          </div>
          <div style={{ fontSize: 14, fontWeight: 700, color: muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={res.title}>
            {res.title}
          </div>
          <div style={{ fontSize: 11.5, color: faint, marginTop: 3, lineHeight: 1.45 }}>{state.reason}</div>
        </div>
      </div>
    )
  }

  const inner = (
    <>
      <span style={{ width: 36, height: 36, borderRadius: 9, background: 'rgba(63,169,245,0.12)', display: 'grid', placeItems: 'center', flexShrink: 0, fontSize: 17 }}>
        {meta.icon}
      </span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: 'block', fontSize: 10.5, fontWeight: 700, color: faint, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
          {meta.label}
        </span>
        <span style={{ display: 'block', fontSize: 14, fontWeight: 700, color: ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {res.title}
        </span>
      </span>
      <ArrowRight className="h-4 w-4 shrink-0" style={{ color: '#CBD5E1' }} />
    </>
  )

  const shell = {
    display: 'flex', alignItems: 'center', gap: 12, width: '100%', textAlign: 'left',
    background: '#FFFFFF', border: `1px solid ${line}`, borderRadius: 12, padding: '13px 15px',
    textDecoration: 'none', cursor: 'pointer',
  }

  if (res.resource_type === 'rich_text') {
    return (
      <button type="button" className="ak-card-hov" style={shell} onClick={() => onOpenNote(res)}>
        {inner}
      </button>
    )
  }

  return (
    <a href={res.url} target="_blank" rel="noopener noreferrer" className="ak-card-hov" style={shell}>
      {inner}
    </a>
  )
}

function ReviewMaterials({ syllabus, topicId, onOpenNote }) {
  const found = findTopic(syllabus, topicId)
  const resources = found?.topic?.resources ?? []

  if (!found) {
    return (
      <p style={{ fontSize: 13, color: muted, lineHeight: 1.55, border: `1px dashed ${line}`, borderRadius: 12, padding: '14px 16px', margin: 0 }}>
        {syllabus
          ? 'This topic is no longer in the published modules, so its materials cannot be shown.'
          : 'The modules for this class have not been published yet.'}
      </p>
    )
  }

  if (resources.length === 0) {
    return (
      <p style={{ fontSize: 13, color: muted, lineHeight: 1.55, border: `1px dashed ${line}`, borderRadius: 12, padding: '14px 16px', margin: 0 }}>
        Your teacher hasn&apos;t attached any materials to <strong style={{ color: ink }}>{found.topic.title}</strong> yet.
      </p>
    )
  }

  return (
    <>
      {(found.topic.learning_objectives ?? found.topic.objectives ?? []).length > 0 && (
        <ul style={{ margin: '0 0 12px', padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 4 }}>
          {(found.topic.learning_objectives ?? found.topic.objectives).map((o, oi) => (
            <li key={oi} style={{ display: 'flex', gap: 7, fontSize: 12.5, color: muted }}>
              <Check className="h-3.5 w-3.5" style={{ color: green, flexShrink: 0, marginTop: 2 }} />
              {o}
            </li>
          ))}
        </ul>
      )}
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        {resources.map((res, i) => (
          <ResourceRow key={res.id ?? res._key ?? i} res={res} onOpenNote={onOpenNote} />
        ))}
      </div>
    </>
  )
}

/* ─────────────────────────── card ─────────────────────────── */

function RemediationCard({ r, syllabus, quizzes, attemptsByQuiz, studentId, onOpenNote }) {
  return (
    <article style={{ background: '#FFFFFF', border: `1px solid ${line}`, borderRadius: 18, padding: 'clamp(18px, 3vw, 26px)' }}>
      <div className="flex flex-wrap items-center gap-2" style={{ marginBottom: 10 }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 700, color: goldDeep, background: 'rgba(245,197,24,0.18)', border: '1px solid rgba(245,197,24,0.5)', borderRadius: 999, padding: '4px 11px' }}>
          <TrendingUp className="h-3.5 w-3.5" /> Remediation
        </span>
        {r.class_label && (
          <span style={{ ...mono, fontSize: 11.5, color: muted, background: 'rgba(14,42,92,0.05)', borderRadius: 999, padding: '4px 10px' }}>{r.class_label}</span>
        )}
      </div>

      <h2 style={{ ...serif, fontSize: 24, color: ink, margin: '0 0 8px', lineHeight: 1.15 }}>
        {r.topic || r.topic_id || 'Review Guide'}
      </h2>

      {/* What the teacher wrote when they published this — the one field on
          the assignment that is theirs, and the reason the card exists. */}
      {r.guidance?.trim() && (
        <section style={{ marginBottom: 20 }}>
          <SectionLabel>From your teacher</SectionLabel>
          <div style={{ background: 'rgba(245,197,24,0.07)', border: '1px solid rgba(245,197,24,0.4)', borderRadius: 14, padding: '16px 18px' }}>
            <Markdown text={r.guidance} />
          </div>
        </section>
      )}

      {/* Module: Review Materials — what the teacher attached to this topic. */}
      <section style={{ marginBottom: 20 }}>
        <SectionLabel>Review materials</SectionLabel>
        <ReviewMaterials syllabus={syllabus} topicId={r.topic_id} onOpenNote={onOpenNote} />
      </section>

      {/* Module: Take Test Mastery — sit the quiz, move the mastery figure. */}
      <section>
        <SectionLabel>Take test mastery</SectionLabel>
        <TakeTestMastery r={r} quizzes={quizzes} attemptsByQuiz={attemptsByQuiz} studentId={studentId} />
      </section>
    </article>
  )
}

export default function StudentRemediation() {
  const { profile } = useAuth()
  const [activeNote, setActiveNote] = useState(null)
  const { panelProps: notePanel } =
    useDialogBehavior(() => setActiveNote(null), { open: !!activeNote, label: 'Practice note' })

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['student-scaffolding', profile.id],
    queryFn: () => loadScaffolding(profile.id),
  })

  const list = data?.remediations ?? []

  return (
    <div style={{ maxWidth: 1040, margin: '0 auto' }}>
      <h1 className="text-[clamp(28px,4vw,38px)]" style={{ ...serif, lineHeight: 1.1, margin: '0 0 4px', color: ink }}>
        Scaffolded Learning
      </h1>
      <p style={{ fontSize: 14, color: muted, margin: '0 0 24px' }}>
        Review guides generated when a learning gap is detected — with the materials for each
        topic and a mastery test to prove you have closed it.
      </p>

      {isLoading ? (
        <SkeletonList count={2} height={220} label="Loading your practice plans" />
      ) : isError ? (
        /* A failed load must never wear the "all caught up" face -- that is
           how a student with a pending review guide was told they had none. */
        <div style={{ background: '#FFFFFF', border: `1px solid ${line}`, borderRadius: 18, padding: 48, textAlign: 'center' }}>
          <h3 style={{ ...serif, fontSize: 22, margin: '0 0 6px', color: ink }}>Could not load your review guides</h3>
          <p style={{ fontSize: 14, color: muted, margin: '0 0 18px', maxWidth: 420, marginInline: 'auto' }}>
            Something went wrong while fetching your practice plans. Check your connection and try again.
          </p>
          <button
            onClick={() => refetch()}
            style={{ padding: '9px 18px', fontSize: 13, fontWeight: 700, color: '#FAFAF6', background: ink, border: 'none', borderRadius: 9, cursor: 'pointer' }}
          >
            Try again
          </button>
        </div>
      ) : list.length === 0 ? (
        <div style={{ background: '#FFFFFF', border: `1px solid ${line}`, borderRadius: 18, padding: 48, textAlign: 'center' }}>
          <div style={{ display: 'inline-grid', placeItems: 'center', width: 52, height: 52, borderRadius: 13, background: 'rgba(31,138,91,0.12)', color: green }}>
            <TrendingUp className="h-6 w-6" />
          </div>
          <h3 style={{ ...serif, fontSize: 22, margin: '16px 0 6px', color: ink }}>You&apos;re all caught up!</h3>
          <p style={{ fontSize: 14, color: muted, margin: 0, maxWidth: 420, marginInline: 'auto' }}>
            No learning gaps have been flagged. When a quiz shows you&apos;re struggling with a topic, a
            custom review guide will appear here.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          {list.map((r) => (
            <RemediationCard
              key={r.id}
              r={r}
              syllabus={data.syllabusByClass[r.class_id] ?? null}
              quizzes={data.quizzesByClass[r.class_id] ?? []}
              attemptsByQuiz={data.attemptsByQuiz}
              studentId={profile.id}
              onOpenNote={setActiveNote}
            />
          ))}
        </div>
      )}

      {activeNote && (
        <div
          onClick={(e) => { if (e.target === e.currentTarget) setActiveNote(null) }}
          style={{ position: 'fixed', inset: 0, background: 'rgba(14,23,51,0.55)', backdropFilter: 'blur(3px)', WebkitBackdropFilter: 'blur(3px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 24 }}
        >
          <div {...notePanel} style={{ width: '100%', maxWidth: 600, background: '#FFFFFF', borderRadius: 18, boxShadow: '0 40px 80px -20px rgba(14,42,92,0.45)', overflow: 'hidden' }}>
            <div className="flex items-center justify-between" style={{ padding: '20px 24px 16px', borderBottom: `1px solid ${line}` }}>
              <div className="flex items-center gap-2">
                <span style={{ fontSize: 19 }}>✍️</span>
                <h3 style={{ ...serif, fontSize: 20, color: ink, margin: 0 }}>{activeNote.title}</h3>
              </div>
              <button onClick={() => setActiveNote(null)} aria-label="Close" style={{ width: 30, height: 30, borderRadius: 8, border: 'none', background: 'transparent', color: faint, cursor: 'pointer', display: 'grid', placeItems: 'center' }}>
                <X className="h-4 w-4" />
              </button>
            </div>
            <div style={{ padding: 24, maxHeight: '60vh', overflowY: 'auto' }}>
              <Markdown text={activeNote.content_markdown} />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
