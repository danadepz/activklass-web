import { Fragment, useMemo, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { collection, doc, getDoc, getDocs, query, serverTimestamp, where } from 'firebase/firestore'
import { loadQuizWithKey, writeQuizWithKey } from '@/lib/quizAnswerKey'
import { db } from '@/lib/firebase'
import { draftToQuestions, generateQuiz, generateScaffoldMaterials } from '@/lib/ai'
import { fetchUsersByIds } from '@/lib/roster'
import { finishedAttempts } from '@/lib/quizAttempts'
import {
  REMEDIATION_PUBLISHED,
  createRemediationPlan,
  deleteRemediationPlan,
  loadClassRemediations,
  publishRemediation,
  unpublishRemediation,
  updateRemediationPlan,
} from '@/features/classes/remediation'
import {
  applyRecoveryToAssessment,
  loadRecoveryTargets,
  previewRecovery,
} from '@/features/classes/gradeRecovery'
import {
  remediationEvidenceInstructions,
  remediationPracticeConfig,
  scaffoldMaterialsToGuidance,
  scaffoldMaterialsToStageContent,
  targetedRemediationEvidence,
} from '@/features/classes/remediationEvidence'
import {
  PASSING,
  RECOVERY_POLICIES,
  CAPPED_REPLACE,
  describeRecoveryResult,
} from '@/lib/remediationRecovery'
import { useAuth } from '@/context/useAuth'
import { Sparkles } from '@/components/icons'
import Markdown from '@/components/Markdown'
import { navy, navyDeep, ink, gold, goldDeep, muted, faint, green, blueText, red, line, serif, mono, sansFamily as sans } from '@/theme'
import { confirmDialog } from '@/components/ui/dialogs'
import { toast } from '@/components/ui/toast'
import { SkeletonList } from '@/components/ui/Skeleton'
import { MetricCard } from '@/components/ui/Card'
import BloomsBreakdown from '@/components/BloomsBreakdown'
import { aggregateBloomPerformance } from '@/lib/bloomsPerformance'
import { useDialogBehavior } from '@/components/ui/useDialogBehavior'
import { resolveSyllabus } from './classSyllabus'
import InfoTooltip from './InfoTooltip'

const PASS = 75 // an attempt at/above this % counts as mastered for that student

async function loadScaffolds(classId) {
  const classSnap = await getDoc(doc(db, 'classes', classId))
  const clazz = classSnap.exists() ? classSnap.data() : null

  // syllabus_id first, per-class document second (classSyllabus.js): a
  // remediation must carry topic ids from the document the student reads, or
  // the student's card can never find the module it came from.
  const { data: syl } = await resolveSyllabus(classId, clazz)
  let extraTopics = []
  if (clazz?.syllabus_id) {
    const curSnap = await getDoc(doc(db, 'classes', classId, 'syllabus', 'current')).catch(() => null)
    if (curSnap?.exists()) {
      const curSyl = curSnap.data()
      extraTopics = (curSyl?.modules ?? []).flatMap((m) =>
        (m.topics ?? []).map((t) => ({
          id: t.id,
          title: t.title,
          moduleTitle: m.title,
          objectives: (t.learning_objectives ?? t.objectives ?? []).filter((o) => typeof o === 'string' && o.trim()),
        })),
      )
    }
  }
  const knownTopicIds = new Set()
  const topics = []
  const allTopicSources = [
    ...(syl?.modules ?? []).flatMap((m) => (m.topics ?? []).map((t) => ({ ...t, moduleTitle: m.title }))),
    ...extraTopics,
  ]
  for (const t of allTopicSources) {
    if (t.id && !knownTopicIds.has(t.id)) {
      knownTopicIds.add(t.id)
      topics.push({
        id: t.id,
        title: t.title,
        moduleTitle: t.moduleTitle,
        objectives: (t.learning_objectives ?? t.objectives ?? []).filter((o) => typeof o === 'string' && o.trim()),
      })
    }
  }

  // class_ids (array) is the canonical link -- a quiz can belong to several
  // classes. Older docs carried a scalar class_id; both are queried until the
  // backfill is confirmed everywhere, since array-contains cannot match a
  // scalar field and would silently return nothing for them.
  const [qNew, qOld] = await Promise.all([
    getDocs(query(collection(db, 'quizzes'), where('class_ids', 'array-contains', classId))),
    getDocs(query(collection(db, 'quizzes'), where('class_id', '==', classId))),
  ])
  const qSnap = { docs: [...qNew.docs, ...qOld.docs.filter((d) => !qNew.docs.some((n) => n.id === d.id))] }
  const quizzes = qSnap.docs.map((d) => ({ id: d.id, ...d.data() }))

  // Attempts per quiz (quiz_attempts carry quiz_id, student_id, total_score).
  const attemptsByQuiz = {}
  await Promise.all(
    quizzes.map(async (q) => {
      const aSnap = await getDocs(query(collection(db, 'quiz_attempts'), where('quiz_id', '==', q.id), where('class_id', '==', classId)))
      attemptsByQuiz[q.id] = aSnap.docs.map((d) => d.data())
    }),
  )

  // Gradebook assessments (so teacher-entered scores on quizzes and topics are counted too)
  const aDocsSnap = await getDocs(collection(db, 'gradebooks', classId, 'assessments')).catch(() => ({ docs: [] }))
  const recordAssessments = aDocsSnap.docs.map((d) => ({ id: d.id, ...d.data() }))

  const ids = clazz ? clazz.student_ids ?? [] : []
  const users = ids.length ? await fetchUsersByIds(ids) : []
  const nameById = {}
  users.forEach((u) => { nameById[u.id] = `${u.last_name}, ${u.first_name}` })

  const rows = []
  for (const topic of topics) {
    const tq = quizzes.filter((q) => q.topic_id === topic.id)
    const raList = recordAssessments.filter(
      (a) => a.topic_id === topic.id || (a.source_quiz_id && tq.some((q) => q.id === a.source_quiz_id)),
    )
    if (!tq.length && !raList.length) continue
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
    for (const ra of raList) {
      const maxPts = Number(ra.total_points) || 0
      if (maxPts <= 0) continue
      const scores = ra.scores || {}
      for (const [sid, entry] of Object.entries(scores)) {
        const raw = typeof entry === 'object' ? entry?.raw_score : entry
        if (raw != null && Number.isFinite(Number(raw))) {
          const pct = (Number(raw) / maxPts) * 100
          attemptCount++
          const prev = bestByStudent[sid]
          if (prev == null || pct > prev) bestByStudent[sid] = pct
        }
      }
    }
    const pcts = Object.values(bestByStudent)
    if (!pcts.length) continue // no graded submissions yet — can't compute mastery
    const mastery = Math.round(pcts.reduce((s, x) => s + x, 0) / pcts.length)
    const affectedIds = Object.entries(bestByStudent)
      .filter(([, p]) => p < PASS)
      .map(([sid]) => sid)
    rows.push({
      ...topic,
      mastery,
      quizCount: tq.length + raList.length,
      attemptCount,
      studentsAffected: affectedIds.length,
      affectedNames: affectedIds.map((sid) => nameById[sid] ?? sid),
      evidenceByStudent: bestByStudent,
      // Ids as well as names: a remediation plan targets student_ids, and the
      // display names cannot be turned back into uids.
      affectedIds,
    })
  }

  const linkedQuizzes = quizzes.filter((q) => q.topic_id).length
  const remediation = await loadClassRemediations(classId).catch(() => ({ plans: [], legacy: [] }))
  const stageQuizIds = [...new Set(remediation.plans
    .filter((plan) => plan.progression_version === 1)
    .flatMap((plan) => [plan.guided_practice_quiz_id, plan.independent_practice_quiz_id, plan.recommended_quiz_id])
    .filter((id) => typeof id === 'string' && id && !quizzes.some((quiz) => quiz.id === id)))]
  const stageQuizzes = await Promise.all(stageQuizIds.map((id) => loadQuizWithKey(id).catch(() => null)))
  for (const quiz of stageQuizzes) {
    if (!quiz) continue
    quizzes.push(quiz)
    const attempts = await getDocs(query(
      collection(db, 'quiz_attempts'),
      where('quiz_id', '==', quiz.id),
      where('class_id', '==', classId),
    )).catch(() => ({ docs: [] }))
    attemptsByQuiz[quiz.id] = attempts.docs.map((attempt) => ({ id: attempt.id, ...attempt.data() }))
  }
  return {
    rows,
    // The syllabus topics themselves, for the practice-quiz fence: a plan
    // remembers only its topic's id and title, not the objectives.
    topics,
    topicCount: topics.length,
    linkedQuizzes,
    clazz,
    nameById,
    rosterIds: ids,
    remediation,
    // Kept for the remediation panel: a plan is "completed" by a student when
    // they have a FINISHED attempt on its practice quiz. Nothing is written --
    // completion is read off the same attempts mastery is.
    attemptsByQuiz,
    quizzes,
  }
}

/* Per-student completion of one plan, from attempts on its practice quiz.
   Returns null when the plan has no quiz -- there is then nothing a student
   can finish, and saying "0 of 5 completed" would read as a failing class. */
function completionOf(plan, attemptsByQuiz, quizzes) {
  const quizId = plan.recommended_quiz_id
  if (!quizId) return null
  const quiz = quizzes.find((q) => q.id === quizId)
  const total = (quiz?.questions ?? []).reduce((s, x) => s + (Number(x.points) || 0), 0)
  const targets = (plan.assignments ?? []).map((a) => a.student_id).filter(Boolean)
  const byStudent = {}
  for (const a of attemptsByQuiz[quizId] ?? []) (byStudent[a.student_id] ??= []).push(a)
  const rows = targets.map((sid) => {
    const done = finishedAttempts(byStudent[sid] ?? [])
    const best = done.reduce((m, a) => (a.total_score != null && (m == null || a.total_score > m) ? a.total_score : m), null)
    return {
      student_id: sid,
      completed: done.length > 0,
      bestPct: best != null && total ? Math.round((best / total) * 100) : null,
    }
  })
  return { rows, completed: rows.filter((r) => r.completed).length, total: rows.length }
}

function bucketOf(m) {
  if (m < 60) return 'needs'
  if (m < 80) return 'developing'
  return 'mastered'
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

/* T-248: an AI practice quiz is saved as a draft and only the quiz editor can
   publish it, so a plan whose quiz is still a draft would hand students a quiz
   they cannot open -- and invite publishing it unread. The plan waits for it. */
function practiceQuizBlocker(plan, quizzes, attemptsByQuiz = {}, targetStudentIds = []) {
  if (plan.progression_version === 1) {
    const stageContent = plan.stage_content ?? {}
    for (const [field, label] of [
      ['concept_review', 'Concept Review'],
      ['worked_example', 'Worked Example'],
      ['guided_practice', 'Guided Practice'],
      ['independent_practice', 'Independent Practice'],
    ]) {
      if (typeof stageContent[field] !== 'string' || !stageContent[field].trim()) return `Add teacher-reviewed content for ${label} before publishing the staged plan.`
    }
    if (!/\bhint\s*:/i.test(stageContent.guided_practice) || !/\bfeedback\s*:/i.test(stageContent.guided_practice)) {
      return 'Guided Practice needs both a Hint and Feedback for each exercise before publishing.'
    }
    if (/\b(hint|feedback)\s*:/i.test(stageContent.independent_practice)) {
      return 'Remove hints and instructional feedback from Independent Practice before publishing.'
    }
    const stageQuizIds = [plan.guided_practice_quiz_id, plan.independent_practice_quiz_id, plan.recommended_quiz_id]
    if (stageQuizIds.some((id) => !id) || new Set(stageQuizIds).size !== 3) {
      return 'Each scored stage needs its own distinct assessment.'
    }
    const reassessment = (quizzes ?? []).find((q) => q.id === plan.recommended_quiz_id)
    const hasPriorTargetAttempt = (attemptsByQuiz[plan.recommended_quiz_id] ?? []).some((attempt) => targetStudentIds.includes(attempt.student_id))
    if (plan.recommended_quiz_id && (!reassessment?.title?.startsWith('Remediation ·') || reassessment?.class_mappings || hasPriorTargetAttempt)) {
      return 'Generate a dedicated Reassessment quiz for this plan. The current linked quiz has prior use or class assessment settings, so it cannot safely serve as this stage.'
    }
    const required = [
      ['guided_practice_quiz_id', 'Guided Practice'],
      ['independent_practice_quiz_id', 'Independent Practice'],
      ['recommended_quiz_id', 'Reassessment'],
    ]
    for (const [field, label] of required) {
      const id = plan[field]
      const quiz = (quizzes ?? []).find((q) => q.id === id)
      if (!id || quiz?.status !== 'published') return `Review and publish the ${label} assessment in the quiz editor before publishing this remediation plan.`
    }
    return null
  }
  if (!plan.recommended_quiz_id) return null
  const quiz = (quizzes ?? []).find((q) => q.id === plan.recommended_quiz_id)
  if (quiz?.status === 'published') return null
  return 'Review the practice quiz first: open it in the quiz editor, check every question, and publish it there. Then publish this plan.'
}

function stageQuizField(stage) {
  if (stage === 'guided_practice') return 'guided_practice_quiz_id'
  if (stage === 'independent_practice') return 'independent_practice_quiz_id'
  return 'recommended_quiz_id'
}

function duplicateQuestionStem(candidate, existingStems) {
  const normalize = (value) => String(value ?? '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
  const stop = new Set(['a', 'an', 'the', 'and', 'or', 'to', 'of', 'in', 'on', 'is', 'are', 'what', 'which', 'how', 'for'])
  const candidateText = normalize(candidate)
  const candidateWords = new Set(candidateText.split(/\s+/).filter((word) => word && !stop.has(word)))
  return existingStems.some((stem) => {
    const existingText = normalize(stem)
    if (candidateText === existingText) return true
    const existingWords = new Set(existingText.split(/\s+/).filter((word) => word && !stop.has(word)))
    if (!candidateWords.size || !existingWords.size) return false
    const intersection = [...candidateWords].filter((word) => existingWords.has(word)).length
    return intersection / Math.min(candidateWords.size, existingWords.size) >= 0.8
  })
}

/**
 * Remediation plans for the class, with their own edit and publish actions.
 *
 * A draft reaches nobody: the plan document carries no student_id, so neither
 * the student query nor the security rule can see it. Publishing is what fans
 * it out into per-student assignments — see features/classes/remediation.js.
 */
function RemediationPanel({ plans, legacy, nameById, attemptsByQuiz, quizzes, busy, onEdit, onPublish, onUnpublish, onDelete, onRecover }) {
  const [openId, setOpenId] = useState(null)
  if (!plans.length && !legacy.length) return null

  return (
    <div className="mb-[26px]">
      <SectionHead
        dot={blueText}
        title="Remediation"
        note={`${plans.length} plan${plans.length === 1 ? '' : 's'}`}
      />
      <div style={{ background: '#FFFFFF', border: `1px solid ${line}`, borderRadius: 16, overflow: 'hidden' }}>
        {plans.map((plan) => {
          const published = plan.status === REMEDIATION_PUBLISHED
          const reach = (plan.assignments ?? []).length
          const targets = plan.target_student_ids ?? []
          // A plan edited after publishing has targets that no longer match what
          // students actually hold; saying so is the difference between "done"
          // and "you still have to re-publish".
          const stale = published && reach !== targets.length
          const quizBlock = practiceQuizBlocker(plan, quizzes)
          const completion = published ? completionOf(plan, attemptsByQuiz ?? {}, quizzes ?? []) : null
          const open = openId === plan.id
          return (
            <div key={plan.id} style={{ padding: '16px 22px', borderBottom: '1px solid rgba(14,42,92,0.05)' }}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div style={{ minWidth: 240, flex: 1 }}>
                <div className="flex items-center gap-2.5">
                  <span style={{ fontSize: 15, fontWeight: 700, color: ink }}>{plan.title}</span>
                  <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', padding: '3px 8px', borderRadius: 999, color: published ? green : goldDeep, background: published ? 'rgba(39,174,96,0.10)' : 'rgba(212,160,23,0.12)' }}>
                    {published ? 'Published' : 'Draft'}
                  </span>
                  {stale && (
                    <span style={{ fontSize: 11, fontWeight: 700, color: goldDeep }}>
                      edited — re-publish to apply
                    </span>
                  )}
                </div>
                <div className="mt-1" style={{ fontSize: 12, color: muted }}>
                  {published
                    ? `Visible to ${reach} student${reach === 1 ? '' : 's'}`
                    : `Targets ${targets.length} student${targets.length === 1 ? '' : 's'} · not visible yet`}
                  {targets.length > 0 && (
                    <>
                      {' · '}
                      {targets.slice(0, 3).map((id) => nameById[id] ?? id).join(' · ')}
                      {targets.length > 3 ? ` +${targets.length - 3}` : ''}
                    </>
                  )}
                </div>
                {published && (
                  <div className="mt-1.5" style={{ fontSize: 12 }}>
                    {completion ? (
                      <button
                        type="button"
                        onClick={() => setOpenId(open ? null : plan.id)}
                        aria-expanded={open}
                        style={{ fontWeight: 700, color: completion.completed === completion.total && completion.total > 0 ? green : navy, background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: sans }}
                      >
                        {completion.completed} of {completion.total} completed the practice quiz {open ? '▴' : '▾'}
                      </button>
                    ) : (
                      <span style={{ color: faint }}>No practice quiz attached — completion is not tracked for this plan.</span>
                    )}
                  </div>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={() => onEdit(plan)}
                  className="transition hover:brightness-95"
                  style={{ padding: '8px 14px', fontSize: 12, fontWeight: 700, fontFamily: sans, color: navy, background: '#FFFFFF', border: `1.5px solid rgba(14,42,92,0.25)`, borderRadius: 9, cursor: 'pointer' }}
                >
                  Edit
                </button>
                {published && plan.recommended_quiz_id ? (
                  <button
                    onClick={() => onRecover(plan)}
                    title="Use this plan's practice quiz results to repair the marks it was prescribed for"
                    className="transition hover:brightness-95"
                    style={{ padding: '8px 14px', fontSize: 12, fontWeight: 700, fontFamily: sans, color: green, background: '#FFFFFF', border: '1.5px solid rgba(39,174,96,0.45)', borderRadius: 9, cursor: 'pointer' }}
                  >
                    Recover Marks
                  </button>
                ) : null}
                {published ? (
                  <button
                    onClick={() => onUnpublish(plan)}
                    disabled={busy === `unpublish:${plan.id}`}
                    className="transition hover:brightness-95 disabled:opacity-50"
                    style={{ padding: '8px 14px', fontSize: 12, fontWeight: 700, fontFamily: sans, color: goldDeep, background: '#FFFFFF', border: '1.5px solid rgba(212,160,23,0.45)', borderRadius: 9, cursor: 'pointer' }}
                  >
                    {busy === `unpublish:${plan.id}` ? 'Withdrawing…' : 'Withdraw'}
                  </button>
                ) : null}
                <button
                  onClick={() => onPublish(plan)}
                  disabled={busy === `publish:${plan.id}` || targets.length === 0 || !!quizBlock}
                  title={targets.length === 0 ? 'Pick at least one student first' : quizBlock ?? undefined}
                  className="transition hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{ padding: '8px 14px', fontSize: 12, fontWeight: 700, fontFamily: sans, color: '#FAFAF6', background: navy, border: 'none', borderRadius: 9, cursor: 'pointer', boxShadow: `0 2px 0 ${navyDeep}` }}
                >
                  {busy === `publish:${plan.id}`
                    ? 'Publishing…'
                    : published
                      ? 'Re-publish'
                      : 'Publish'}
                </button>
                <button
                  onClick={() => onDelete(plan)}
                  disabled={busy === `delete:${plan.id}`}
                  className="transition hover:underline disabled:opacity-50"
                  style={{ padding: '8px 6px', fontSize: 12, fontWeight: 600, fontFamily: sans, color: red, background: 'none', border: 'none', cursor: 'pointer' }}
                >
                  Delete
                </button>
              </div>
            </div>
            {open && completion && (
              <ul className="grid grid-cols-1 gap-1.5 sm:grid-cols-2" style={{ listStyle: 'none', margin: '12px 0 0', padding: 0 }}>
                {completion.rows.map((r) => (
                  <li key={r.student_id} className="flex items-center justify-between gap-3" style={{ fontSize: 12.5, padding: '6px 10px', borderRadius: 8, background: r.completed ? 'rgba(31,138,91,0.07)' : 'rgba(14,42,92,0.03)' }}>
                    <span style={{ color: ink }}>{nameById[r.student_id] ?? r.student_id}</span>
                    <span style={{ ...mono, fontSize: 11.5, fontWeight: 700, color: r.completed ? green : faint }}>
                      {r.completed ? `Completed${r.bestPct != null ? ` · best ${r.bestPct}%` : ''}` : 'Not started'}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            </div>
          )
        })}

        {legacy.length > 0 && (
          <div style={{ padding: '12px 22px', fontSize: 12, color: faint, background: 'rgba(14,42,92,0.02)' }}>
            {legacy.length} older remediation record{legacy.length === 1 ? '' : 's'} from the AI
            recommender are already live for the students who own them. They predate plans, so they
            have no draft state to edit here.
          </div>
        )}
      </div>
    </div>
  )
}

/**
 * Recover the marks a remediation was prescribed for.
 *
 * The teacher picks which assessment the failing marks sit on, because only
 * they know it: the plan is filed against a topic, and a topic's failing mark
 * may be on an AI-posted quiz column, on a hand-entered long test, or on both.
 * Guessing would be worse than asking -- the wrong guess silently rewrites the
 * wrong column.
 *
 * Nothing is written until Apply. The preview above the button is the same
 * computation the write uses, so what the teacher approves is exactly what
 * lands.
 */
function RecoverMarksModal({ plan, classId, nameById, teacherId, onClose, onApplied }) {
  const { overlayProps, panelProps } = useDialogBehavior(onClose, { label: 'Recover marks from a remediation', closeOnBackdrop: false })
  const [assessmentId, setAssessmentId] = useState('')
  const [policy, setPolicy] = useState(CAPPED_REPLACE)
  // null = "the class's own pass mark", which arrives with the targets below.
  // A teacher who types a ceiling overrides it for this dialog only.
  const [capOverride, setCapOverride] = useState(null)
  const [applying, setApplying] = useState(false)
  const [error, setError] = useState(null)

  const { data: recovery, isLoading: loadingTargets } = useQuery({
    queryKey: ['fs-recovery-targets', classId],
    queryFn: () => loadRecoveryTargets(classId),
  })
  const targets = recovery?.targets ?? []
  const classCap = recovery?.cap ?? PASSING
  const cap = capOverride ?? classCap

  // Re-runs on every policy or ceiling change, so the table below is always
  // the arithmetic that Apply would perform -- never a stale earlier one.
  const { data: preview, isFetching: previewing, error: previewError } = useQuery({
    queryKey: ['fs-recovery-preview', classId, plan.id, assessmentId, policy, cap],
    queryFn: () => previewRecovery({ plan, classId, assessmentId, policy, cap }),
    enabled: !!assessmentId,
    retry: false,
  })

  const chosen = targets.find((t) => t.id === assessmentId)
  const recoveries = Object.entries(preview?.recoveries ?? {})
  const policyMeta = RECOVERY_POLICIES.find((r) => r.id === policy)

  async function apply() {
    setApplying(true)
    setError(null)
    try {
      const result = await applyRecoveryToAssessment({ plan, classId, assessmentId, policy, cap, teacherId })
      onApplied(describeRecoveryResult(result))
    } catch (err) {
      setError(err.message)
      setApplying(false)
    }
  }

  const selectStyle = { width: '100%', marginTop: 6, padding: '10px 12px', fontSize: 14, fontFamily: sans, color: ink, background: '#FFFFFF', border: '1.5px solid rgba(14,42,92,0.14)', borderRadius: 9, cursor: 'pointer' }
  const fieldLabel = { fontSize: 11.5, fontWeight: 700, color: muted, letterSpacing: '0.05em', textTransform: 'uppercase' }

  return (
    <div {...overlayProps} style={{ position: 'fixed', inset: 0, background: 'rgba(14,23,51,0.55)', backdropFilter: 'blur(3px)', WebkitBackdropFilter: 'blur(3px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 24 }}>
      <div {...panelProps} style={{ margin: 'auto', width: '100%', maxWidth: 620, background: '#FFFFFF', borderRadius: 20, boxShadow: '0 40px 80px -20px rgba(14,42,92,0.45)', overflow: 'hidden', display: 'flex', flexDirection: 'column', maxHeight: '90vh' }}>
        <div style={{ padding: '22px 26px 18px', borderBottom: '1px solid rgba(14,42,92,0.07)' }}>
          <h2 style={{ ...serif, fontSize: 21, margin: 0, color: ink }}>Recover marks &middot; {plan.topic}</h2>
          <p style={{ fontSize: 12.5, color: muted, margin: '5px 0 0', lineHeight: 1.5 }}>
            Uses each targeted student&apos;s best attempt on this plan&apos;s practice quiz to repair
            the mark they failed. The original score is kept on the record.
          </p>
        </div>

        <div style={{ padding: '20px 26px', overflowY: 'auto' }} className="flex flex-col gap-4">
          {(error || previewError) && (
            <div role="alert" style={{ fontSize: 13, color: red, background: 'rgba(192,57,43,0.07)', border: '1px solid rgba(192,57,43,0.3)', borderRadius: 10, padding: '10px 12px' }}>
              {error || previewError.message}
            </div>
          )}

          <div>
            <label style={fieldLabel}>Which mark are you repairing?</label>
            <select className="ak-input" value={assessmentId} onChange={(e) => setAssessmentId(e.target.value)} style={selectStyle}>
              <option value="">{loadingTargets ? 'Loading the class record…' : '— Pick an assessment —'}</option>
              {targets.map((t) => (
                <option key={t.id} value={t.id} disabled={t.locked}>
                  {t.period_name} &middot; {t.title} ({t.graded_count} scored, out of {t.total_points})
                  {t.source_quiz_id ? ' · from a quiz' : ''}
                  {t.locked ? ' — period locked' : ''}
                </option>
              ))}
            </select>
            {!loadingTargets && targets.length === 0 && (
              <p style={{ fontSize: 12, color: muted, margin: '8px 0 0' }}>
                This class record has no assessments yet, so there is no mark to repair.
              </p>
            )}
          </div>

          <div className="flex flex-wrap gap-3">
            <div style={{ flex: '1 1 260px' }}>
              <label style={fieldLabel}>Policy</label>
              <select className="ak-input" value={policy} onChange={(e) => setPolicy(e.target.value)} style={selectStyle}>
                {RECOVERY_POLICIES.map((r) => (
                  <option key={r.id} value={r.id}>{r.label}</option>
                ))}
              </select>
            </div>
            <div style={{ width: 130 }}>
              <label style={fieldLabel}>Ceiling %</label>
              <input
                type="number"
                min="1"
                max="100"
                className="ak-input"
                value={cap}
                onChange={(e) => setCapOverride(Number(e.target.value) || null)}
                style={{ ...selectStyle, ...mono, cursor: 'text' }}
              />
            </div>
          </div>
          <p style={{ fontSize: 12, color: muted, margin: 0, lineHeight: 1.5 }}>
            {policyMeta?.describe(cap)} A recovery can only raise a mark, never lower one.
            {' '}{cap === classCap
              ? `${classCap}% is this class's pass mark from Grade Config.`
              : `This class's pass mark is ${classCap}%.`}
          </p>

          {assessmentId && (
            <div style={{ border: `1px solid ${line}`, borderRadius: 12, overflow: 'hidden' }}>
              <div style={{ padding: '10px 14px', background: 'rgba(14,42,92,0.03)', fontSize: 11.5, fontWeight: 700, color: muted, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                {previewing
                  ? 'Working it out…'
                  : `${recoveries.length} of ${(plan.target_student_ids ?? []).length} targeted would be recovered`}
              </div>
              {recoveries.length > 0 && (
                <table className="w-full" style={{ borderCollapse: 'collapse', fontSize: 13 }}>
                  <tbody>
                    {recoveries.map(([studentId, r]) => (
                      <tr key={studentId} style={{ borderTop: '1px solid rgba(14,42,92,0.05)' }}>
                        <td style={{ padding: '9px 14px', color: ink, fontWeight: 600 }}>{nameById[studentId] ?? studentId}</td>
                        <td style={{ ...mono, padding: '9px 14px', color: muted, textAlign: 'right' }}>
                          {r.original_score}/{chosen?.total_points}
                        </td>
                        <td style={{ padding: '9px 4px', color: faint }}>&rarr;</td>
                        <td style={{ ...mono, padding: '9px 14px', color: green, fontWeight: 700 }}>
                          {r.applied_score}/{chosen?.total_points}
                        </td>
                        <td style={{ ...mono, padding: '9px 14px', color: faint, textAlign: 'right' }}>
                          practice {Math.round(r.remediation_pct)}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              {preview && !previewing && (
                <div style={{ padding: '10px 14px', borderTop: `1px solid ${line}`, fontSize: 12, color: muted, lineHeight: 1.5 }}>
                  {describeRecoveryResult({
                    applied: recoveries.length,
                    notAttempted: preview.notAttempted.length,
                    noOriginal: preview.noOriginal.length,
                    noImprovement: preview.noImprovement.length,
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, padding: '15px 26px', borderTop: '1px solid rgba(14,42,92,0.07)', background: 'rgba(14,42,92,0.02)' }}>
          <button onClick={onClose} disabled={applying} className="transition hover:brightness-105 disabled:opacity-50" style={{ padding: '11px 18px', fontSize: 13.5, fontWeight: 600, fontFamily: sans, color: '#3A4A6B', background: '#FFFFFF', border: '1.5px solid rgba(14,42,92,0.14)', borderRadius: 10, cursor: 'pointer' }}>
            Cancel
          </button>
          <button
            onClick={apply}
            disabled={applying || previewing || !recoveries.length}
            title={!recoveries.length ? 'Nothing to recover with these settings' : undefined}
            className="transition hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ padding: '11px 18px', fontSize: 13.5, fontWeight: 700, fontFamily: sans, color: '#FAFAF6', background: navy, border: 'none', borderRadius: 10, cursor: 'pointer', boxShadow: `0 3px 0 ${navyDeep}` }}
          >
            {applying ? 'Applying…' : `Apply to ${recoveries.length} mark${recoveries.length === 1 ? '' : 's'}`}
          </button>
        </div>
      </div>
    </div>
  )
}

/** Edit a plan: its text, its linked practice quiz, and who receives it. */
/* ── Remediation editor ─────────────────────────────────────────────────────
   Presentation only. Every value it reads and every handler it calls is the
   same one the single-column dialog used (patch(), onSave, onSaveAndPublish,
   onGenerateMaterials, onGenerateQuiz, onViewQuiz); only the layout changed:
   a step list on the left, one focused panel on the right, and a footer that
   stays put, so a teacher sees one job at a time instead of one long scroll. */

const EDITOR_TONE = {
  ok: { color: green, bg: 'rgba(46,160,110,0.14)' },
  warn: { color: goldDeep, bg: 'rgba(230,170,40,0.20)' },
  bad: { color: red, bg: 'rgba(192,57,43,0.10)' },
}

/** Where a stage's quiz stands, in the words the step list and its panel share. */
function quizState(quizId, quizzes) {
  if (!quizId) return { label: 'Not generated', tone: 'bad', step: 1 }
  const q = (quizzes ?? []).find((item) => item.id === quizId)
  if (!q) return { label: 'Unavailable', tone: 'bad', step: 1 }
  if (q.status === 'published') return { label: 'Published', tone: 'ok', step: 3 }
  return { label: 'Draft', tone: 'warn', step: 2 }
}

const EDITOR_STAGES = [
  { key: 'concept_review', n: 1, label: 'Concept Review', sub: '', hint: 'The idea in plain words. Students read this first.' },
  { key: 'worked_example', n: 2, label: 'Worked Example', sub: '', hint: 'One problem solved step by step.' },
  { key: 'guided_practice', n: 3, label: 'Guided Practice', sub: 'Hints and feedback', hint: 'Give each exercise a "Hint:" line and a "Feedback:" line.' },
  { key: 'independent_practice', n: 4, label: 'Independent Practice', sub: 'No hints', hint: 'No hints or feedback in this stage.' },
]

const EDITOR_STAGE_QUIZZES = [
  { stage: 'guided_practice', field: 'guided_practice_quiz_id', label: 'Guided Practice Assessment', n: 3, after: 'guided_practice' },
  { stage: 'independent_practice', field: 'independent_practice_quiz_id', label: 'Independent Practice Assessment', n: 4, after: 'independent_practice' },
  { stage: 'reassessment', field: 'recommended_quiz_id', label: 'Reassessment', n: 5, after: null },
]

function EditorNavItem({ active, onClick, marker, label, sub, subTone, indent }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? 'step' : undefined}
      className="flex items-start gap-2.5 text-left transition hover:brightness-95"
      style={{
        width: indent ? 'calc(100% - 16px)' : '100%',
        marginLeft: indent ? 16 : 0,
        padding: '8px 10px',
        borderRadius: 10,
        border: `1.5px solid ${active ? navy : 'transparent'}`,
        background: active ? 'rgba(63,169,245,0.15)' : 'transparent',
        cursor: 'pointer',
        fontFamily: sans,
      }}
    >
      <span
        aria-hidden="true"
        style={{
          flex: 'none', width: 24, height: 24, borderRadius: indent ? 7 : 999, display: 'grid', placeItems: 'center',
          fontSize: 12, fontWeight: 700, color: active ? '#FAFAF6' : ink, background: active ? navy : '#FFFFFF',
          border: `1.5px solid ${active ? navy : 'rgba(14,42,92,0.25)'}`,
        }}
      >
        {marker}
      </span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: 'block', fontSize: 13, fontWeight: 700, color: ink, lineHeight: 1.3 }}>{label}</span>
        {sub && <span style={{ display: 'block', fontSize: 11.5, fontWeight: 600, color: subTone ? EDITOR_TONE[subTone].color : muted, marginTop: 1 }}>{sub}</span>}
      </span>
    </button>
  )
}

function EditorNavGroup({ children }) {
  return <div style={{ fontSize: 10.5, fontWeight: 700, color: muted, letterSpacing: '0.08em', textTransform: 'uppercase', margin: '14px 4px 6px' }}>{children}</div>
}

function EditorStepHead({ title, sub }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <h4 style={{ ...serif, fontSize: 20, color: ink, margin: 0 }}>{title}</h4>
      {sub && <p style={{ fontSize: 13, color: muted, margin: '4px 0 0' }}>{sub}</p>}
    </div>
  )
}

function EditorBadge({ tone, children }) {
  return (
    <span style={{ fontSize: 11.5, fontWeight: 700, padding: '3px 10px', borderRadius: 999, color: EDITOR_TONE[tone].color, background: EDITOR_TONE[tone].bg, whiteSpace: 'nowrap' }}>
      {children}
    </span>
  )
}

const editorFieldLabel = { fontSize: 11.5, fontWeight: 700, color: muted, letterSpacing: '0.05em', textTransform: 'uppercase' }
const editorInput = { marginTop: 6, width: '100%', padding: '10px 12px', fontSize: 14, fontFamily: sans, color: ink, border: '1.5px solid rgba(14,42,92,0.14)', borderRadius: 9 }
const editorGhostBtn = { padding: '8px 14px', fontSize: 12.5, fontWeight: 700, fontFamily: sans, color: navy, background: '#FFFFFF', border: '1.5px solid rgba(14,42,92,0.25)', borderRadius: 8, cursor: 'pointer' }
const editorPrimaryBtn = { padding: '9px 16px', fontSize: 13, fontWeight: 700, fontFamily: sans, color: '#FAFAF6', background: navy, border: 'none', borderRadius: 9, cursor: 'pointer', boxShadow: `0 2px 0 ${navyDeep}` }

function RemediationEditor({ plan, quizzes, attemptsByQuiz, nameById, rosterIds, busy, onClose, onSave, onSaveAndPublish, onGenerateQuiz, onGenerateMaterials, onViewQuiz }) {
  const { overlayProps, panelProps } = useDialogBehavior(onClose, { label: 'Edit a remediation plan', closeOnBackdrop: false })
  const [title, setTitle] = useState(plan.title ?? '')
  const [guidance, setGuidance] = useState(plan.guidance ?? '')
  const [targets, setTargets] = useState(plan.target_student_ids ?? [])
  const [progressive, setProgressive] = useState(plan.progression_version === 1)
  const [stageContent, setStageContent] = useState(plan.stage_content ?? {
    concept_review: plan.guidance ?? '', worked_example: '', guided_practice: '', independent_practice: '',
  })
  const [materialsError, setMaterialsError] = useState(null)
  const [step, setStep] = useState('guidance')
  const [focusId, setFocusId] = useState(null)

  const working = !!busy
  const generatingMaterials = busy === `materials:${plan.id}`
  const generatingLegacyQuiz = busy === `quiz:${plan.id}:legacy`
  const activePlan = { ...plan, progression_version: progressive ? 1 : null, stage_content: stageContent }
  const quizBlock = practiceQuizBlocker(activePlan, quizzes, attemptsByQuiz, targets)
  const quiz = (quizzes ?? []).find((q) => q.id === plan.recommended_quiz_id)
  const targetedEvidence = useMemo(() => targetedRemediationEvidence({
    topicId: plan.topic_id,
    topicLabel: plan.topic,
    targetStudentIds: targets,
    nameById,
    quizzes,
    attemptsByQuiz,
  }), [plan.topic_id, plan.topic, targets, nameById, quizzes, attemptsByQuiz])
  // The whole roster, so the recipient list can say why each student is (or is
  // not) flagged without that depending on who is ticked right now.
  const rosterEvidence = useMemo(() => targetedRemediationEvidence({
    topicId: plan.topic_id,
    topicLabel: plan.topic,
    targetStudentIds: rosterIds,
    nameById,
    quizzes,
    attemptsByQuiz,
  }), [plan.topic_id, plan.topic, rosterIds, nameById, quizzes, attemptsByQuiz])
  const flagged = useMemo(() => new Set(plan.target_student_ids ?? []), [plan.target_student_ids])
  const patch = () => ({
    title: title.trim() || plan.title,
    guidance: guidance.trim(),
    target_student_ids: targets,
    progression_version: progressive ? 1 : null,
    ...(progressive ? {
      stage_content: stageContent,
      guided_practice_quiz_id: plan.guided_practice_quiz_id ?? null,
      independent_practice_quiz_id: plan.independent_practice_quiz_id ?? null,
    } : {}),
  })

  const toggle = (id) =>
    setTargets((t) => (t.includes(id) ? t.filter((x) => x !== id) : [...t, id]))

  async function draftMaterials() {
    setMaterialsError(null)
    try {
      const materials = await onGenerateMaterials(targetedEvidence)
      const markdown = scaffoldMaterialsToGuidance(materials)
      if (!markdown) throw new Error('The generated study guide was empty. Please try again or write the guidance yourself.')
      setGuidance((current) => [current.trim(), markdown].filter(Boolean).join('\n\n'))
      const generatedStages = scaffoldMaterialsToStageContent(materials)
      if (generatedStages) {
        setStageContent((current) => Object.fromEntries(Object.keys(generatedStages).map((key) => [key, [current?.[key], generatedStages[key]].filter(Boolean).join('\n\n')])))
        setProgressive(true)
      }
    } catch (err) {
      setMaterialsError(err.message)
    }
  }

  const enableProgressive = () => {
    if (!progressive && !stageContent.concept_review && guidance.trim()) {
      setStageContent((current) => ({ ...current, concept_review: guidance.trim() }))
    }
    setProgressive(true)
  }

  // Turning it off keeps what was typed in each stage in this dialog (turn it
  // back on and it is all still there); the saved plan simply stops being a
  // staged one. A published staged plan has students on it, so ask first.
  const toggleProgressive = async () => {
    if (!progressive) { enableProgressive(); return }
    if (plan.status === REMEDIATION_PUBLISHED && plan.progression_version === 1) {
      const ok = await confirmDialog({
        title: 'Turn off the Five-Stage Scaffold?',
        message: 'When you re-publish, students get the single guidance and practice quiz instead of the five stages. Anything they have already unlocked is not carried over. Your stage text stays here until you close this window.',
        confirmLabel: 'Turn off',
        tone: 'danger',
      })
      if (!ok) return
    }
    setProgressive(false)
  }

  // A step that only exists in one mode falls back to the first panel when the
  // mode changes underneath it (Draft with AI can switch the staged plan on).
  const stepGone = (progressive && step === 'practice_quiz')
    || (!progressive && (step.startsWith('quiz:') || EDITOR_STAGES.some((s) => s.key === step)))
  const activeStep = stepGone ? 'guidance' : step

  const evidenceStudents = useMemo(() => [...targetedEvidence.students].sort((a, b) =>
    (b.items.length - a.items.length) || String(a.displayName).localeCompare(String(b.displayName))), [targetedEvidence])
  const flaggedItemCount = evidenceStudents.reduce((sum, s) => sum + s.items.length, 0)
  const focus = evidenceStudents.find((s) => s.studentId === focusId) ?? evidenceStudents[0] ?? null

  const rosterRows = useMemo(() => {
    const byId = new Map(rosterEvidence.students.map((s) => [s.studentId, s]))
    return [...rosterIds]
      .map((id) => ({ id, name: nameById[id] ?? id, evidence: byId.get(id) ?? null, isFlagged: flagged.has(id) }))
      .sort((a, b) => (Number(b.isFlagged) - Number(a.isFlagged)) || String(a.name).localeCompare(String(b.name)))
  }, [rosterIds, rosterEvidence, nameById, flagged])

  const aiDraftBar = (
    <div className="mt-3">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={draftMaterials}
          disabled={!!busy || !targetedEvidence.hasScoredEvidence}
          title={!targetedEvidence.hasScoredEvidence ? 'No finalized scored evidence is available for the selected students.' : undefined}
          className="transition hover:brightness-95 disabled:opacity-50 disabled:cursor-not-allowed"
          style={editorGhostBtn}
        >
          {generatingMaterials ? 'Drafting materials…' : 'Draft targeted learning materials'}
        </button>
        <span style={{ fontSize: 11.5, color: muted, flex: 1, minWidth: 200 }}>
          Generated content is appended for your review and editing{progressive ? ' (the guidance and every stage)' : ''}. Pending work is excluded.
        </span>
      </div>
      {materialsError && <p role="alert" style={{ fontSize: 12, color: red, margin: '6px 0 0' }}>{materialsError}</p>}
    </div>
  )

  const previewBox = (children) => (
    <div style={{ background: '#F7F9FC', border: `1px solid ${line}`, borderRadius: 12, padding: '14px 16px', minHeight: 160 }}>
      <div style={{ ...editorFieldLabel, marginBottom: 8 }}>What students see</div>
      {children}
    </div>
  )

  const renderGuidance = () => (
    <div>
      <EditorStepHead title="Title and guidance" sub="What should they review, and how? This is the part a quiz cannot carry." />
      <div className="grid gap-4 lg:grid-cols-2">
        <div>
          <label style={editorFieldLabel}>Title</label>
          <input className="ak-input" value={title} onChange={(e) => setTitle(e.target.value)} style={editorInput} />
          <label style={{ ...editorFieldLabel, display: 'block', marginTop: 14 }}>Guidance for the student</label>
          <textarea
            className="ak-input"
            rows={12}
            value={guidance}
            onChange={(e) => setGuidance(e.target.value)}
            placeholder="What should they review, and how? This is the part a quiz cannot carry."
            style={{ ...editorInput, resize: 'vertical' }}
          />
          <p style={{ fontSize: 11.5, color: muted, margin: '6px 0 0' }}>You can use ## headings, **bold** and lists.</p>
        </div>
        {previewBox(
          <>
            <div style={{ ...serif, fontSize: 18, color: ink, marginBottom: 8 }}>{title.trim() || plan.title}</div>
            {guidance.trim() ? <Markdown text={guidance} /> : <p style={{ fontSize: 13, color: faint, margin: 0 }}>Nothing written yet.</p>}
          </>,
        )}
      </div>
      {aiDraftBar}
    </div>
  )

  const renderStageContent = (stage) => (
    <div data-testid="teacher-stage-content">
      <EditorStepHead title={stage.label} sub={`Stage ${stage.n}${stage.sub ? ` · ${stage.sub}` : ''} — students receive only the content for their currently unlocked stage.`} />
      <div className="grid gap-4 lg:grid-cols-2">
        <div>
          <label style={editorFieldLabel}>{stage.label} content</label>
          <textarea
            className="ak-input"
            rows={14}
            value={stageContent[stage.key] ?? ''}
            onChange={(event) => setStageContent((current) => ({ ...current, [stage.key]: event.target.value }))}
            style={{ ...editorInput, resize: 'vertical' }}
          />
          <p style={{ fontSize: 11.5, color: muted, margin: '6px 0 0' }}>{stage.hint}</p>
        </div>
        {previewBox(
          (stageContent[stage.key] ?? '').trim()
            ? <Markdown text={stageContent[stage.key]} />
            : <p style={{ fontSize: 13, color: faint, margin: 0 }}>Nothing written yet.</p>,
        )}
      </div>
      {aiDraftBar}
    </div>
  )

  const quizSteps = (current) => (
    <ol style={{ listStyle: 'none', margin: '12px 0 0', padding: 0, display: 'grid', gap: 8 }}>
      {['Generate the quiz with AI', 'Open it in the quiz editor, review and edit every question, then publish the quiz there', 'Come back here and publish this plan'].map((text, index) => {
        const n = index + 1
        const isCurrent = n === current
        const done = n < current
        return (
          <li key={text} className="flex items-start gap-2.5" style={{ fontSize: 13, color: isCurrent ? ink : muted, fontWeight: isCurrent ? 700 : 400 }}>
            <span aria-hidden="true" style={{
              flex: 'none', width: 22, height: 22, borderRadius: 999, display: 'grid', placeItems: 'center', fontSize: 11.5, fontWeight: 700,
              color: isCurrent || done ? '#FAFAF6' : muted, background: done ? green : isCurrent ? navy : '#FFFFFF',
              border: `1.5px solid ${done ? green : isCurrent ? navy : 'rgba(14,42,92,0.25)'}`,
            }}>{done ? '✓' : n}</span>
            <span style={{ paddingTop: 1 }}>{text}</span>
          </li>
        )
      })}
    </ol>
  )

  const renderStageQuiz = ({ stage, field, label, n }) => {
    const quizId = plan[field]
    const state = quizState(quizId, quizzes)
    const currentBusy = busy === `quiz:${plan.id}:${stage}`
    return (
      <div data-testid="teacher-stage-assessments">
        <EditorStepHead title={label} sub={n === 5 ? 'Stage 5 · Scored quiz' : `Scored quiz for stage ${n}`} />
        <div style={{ border: `1px solid ${line}`, borderRadius: 14, padding: '16px 18px' }}>
          <div className="flex items-center justify-between gap-3">
            <span style={editorFieldLabel}>Status</span>
            <EditorBadge tone={state.tone}>{state.label}</EditorBadge>
          </div>
          <p style={{ fontSize: 13, color: muted, margin: '8px 0 0', lineHeight: 1.5 }}>
            This quiz is built in the Quiz editor, which opens as a separate page. Review and edit every question there, then publish the quiz and come back here.
          </p>
          {quizSteps(state.step)}
          <div className="mt-4 flex flex-wrap gap-3">
            {quizId ? (
              <>
                <button type="button" onClick={() => onViewQuiz(stage, patch())} disabled={working} className="disabled:opacity-50" style={editorPrimaryBtn}>Open in editor</button>
                <button type="button" onClick={() => onGenerateQuiz(stage, targetedEvidence)} disabled={!!busy} className="disabled:opacity-50" style={editorGhostBtn}>
                  {currentBusy ? 'Generating…' : 'Regenerate'}
                </button>
              </>
            ) : (
              <button type="button" onClick={() => onGenerateQuiz(stage, targetedEvidence)} disabled={!!busy} className="disabled:opacity-50" style={editorPrimaryBtn}>
                {currentBusy ? 'Generating…' : 'Generate with AI'}
              </button>
            )}
          </div>
        </div>
        <p style={{ fontSize: 12, color: goldDeep, fontWeight: 600, margin: '10px 2px 0' }}>Each scored stage needs its own distinct assessment.</p>
      </div>
    )
  }

  const renderPracticeQuiz = () => {
    const state = quizState(plan.recommended_quiz_id, quizzes)
    return (
      <div>
        <EditorStepHead title="Practice quiz" sub="An optional quiz students take with this review." />
        <div style={{ border: `1px solid ${line}`, borderRadius: 14, padding: '16px 18px', background: 'rgba(63,169,245,0.05)' }}>
          <div className="flex items-center justify-between gap-3">
            <div style={{ fontSize: 13.5, color: ink }}>
              <strong>Practice quiz:</strong>{' '}
              {plan.recommended_quiz_id ? (
                <button
                  type="button"
                  onClick={() => onViewQuiz(patch())}
                  disabled={working}
                  className="underline disabled:opacity-50"
                  style={{ color: blueText, fontWeight: 700, background: 'none', border: 0, padding: 0, cursor: 'pointer' }}
                >
                  {quiz?.generated_by === 'ai_generated' ? 'View AI-Generated Quiz' : 'Open Quiz in Editor'}
                </button>
              ) : (
                <span style={{ color: muted }}>none attached</span>
              )}
            </div>
            {plan.recommended_quiz_id && <EditorBadge tone={state.tone}>{state.label}</EditorBadge>}
          </div>
          <p style={{ fontSize: 12.5, color: muted, margin: '8px 0 0', lineHeight: 1.5 }}>
            Saving a draft is always allowed. To publish this plan with a quiz, the quiz has to be reviewed and published first.
          </p>
          {quizSteps(plan.recommended_quiz_id ? state.step : 1)}
          <div className="mt-4">
            <button
              type="button"
              onClick={() => onGenerateQuiz('legacy', targetedEvidence)}
              disabled={!!busy}
              className="transition hover:brightness-110 disabled:opacity-50"
              style={{ padding: '8px 14px', fontSize: 12.5, fontWeight: 700, fontFamily: sans, color: blueText, background: '#FFFFFF', border: '1.5px solid rgba(63,169,245,0.45)', borderRadius: 8, cursor: 'pointer' }}
            >
              {generatingLegacyQuiz ? 'Generating…' : plan.recommended_quiz_id ? 'Regenerate' : 'Generate with AI'}
            </button>
          </div>
        </div>
      </div>
    )
  }

  const renderWhy = () => {
    const scored = evidenceStudents.filter((s) => s.topicScore).length
    const showQuiz = new Set(focus?.items.map((item) => item.quizTitle)).size > 1
    const showBloom = focus?.items.some((item) => item.bloomsLevel)
    const showObjective = focus?.items.some((item) => item.objective)
    const th = { textAlign: 'left', padding: '8px 12px', fontSize: 10.5, fontWeight: 700, color: muted, letterSpacing: '0.06em', textTransform: 'uppercase' }
    const td = { padding: '9px 12px', fontSize: 13, color: ink, borderTop: `1px solid ${line}`, verticalAlign: 'top' }
    return (
      <div data-testid="remediation-performance-explanation">
        <EditorStepHead
          title="Why this review is suggested"
          sub={evidenceStudents.length
            ? `Graded quiz evidence for each selected student (${scored} of ${evidenceStudents.length} have graded results for this topic). Select a student to see their items.`
            : 'No students are selected.'}
        />
        {evidenceStudents.length > 0 && (
          <div className="grid gap-4 md:grid-cols-[240px_minmax(0,1fr)]">
            <ul data-testid="targeted-remediation-evidence" aria-label="Students" style={{ listStyle: 'none', margin: 0, padding: 2, display: 'grid', gap: 8, alignContent: 'start', maxHeight: 'min(48vh, 440px)', overflowY: 'auto' }}>
              {evidenceStudents.map((student) => {
                const active = focus?.studentId === student.studentId
                const pct = student.topicScore ? Math.max(0, Math.min(100, Number(student.topicScore.percentage))) : null
                return (
                  <li key={student.studentId}>
                    <button
                      type="button"
                      onClick={() => setFocusId(student.studentId)}
                      aria-pressed={active}
                      className="w-full text-left"
                      style={{ padding: '10px 12px', borderRadius: 11, cursor: 'pointer', fontFamily: sans, background: active ? 'rgba(63,169,245,0.12)' : '#FFFFFF', border: `1.5px solid ${active ? navy : line}` }}
                    >
                      <div style={{ fontSize: 13, fontWeight: 700, color: ink }}>{student.displayName}</div>
                      {pct != null ? (
                        <>
                          <div style={{ fontSize: 11.5, color: muted, marginTop: 2 }}>{student.topicScore.percentage}% · {student.topicScore.earnedPoints}/{student.topicScore.maximumPoints} pts</div>
                          <div style={{ height: 5, background: 'rgba(14,42,92,0.08)', borderRadius: 999, overflow: 'hidden', marginTop: 6 }}>
                            <div style={{ width: `${pct}%`, height: '100%', background: pct < 60 ? red : pct < 75 ? goldDeep : green }} />
                          </div>
                        </>
                      ) : (
                        <div style={{ fontSize: 11.5, color: muted, marginTop: 2 }}>No eligible scored item results</div>
                      )}
                      <div style={{ fontSize: 11.5, color: muted, marginTop: 4 }}>{student.items.length} incorrect or partial-credit item{student.items.length === 1 ? '' : 's'}</div>
                    </button>
                  </li>
                )
              })}
            </ul>
            <div style={{ minWidth: 0 }}>
              {focus && (
                <>
                  <div style={{ fontSize: 14, color: ink }}>
                    <strong>{focus.displayName}</strong>
                    <span style={{ color: muted }}> · {focus.topicScore ? `${focus.topicScore.percentage}% topic evidence (${focus.topicScore.earnedPoints}/${focus.topicScore.maximumPoints} pts)` : 'no eligible scored item results'}</span>
                  </div>
                  {focus.items.length > 0 ? (
                    <div style={{ marginTop: 10, border: `1px solid ${line}`, borderRadius: 12, overflow: 'auto', maxHeight: 'min(42vh, 380px)' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                          <tr style={{ background: '#F7F9FC', position: 'sticky', top: 0 }}>
                            {showQuiz && <th style={th}>Quiz</th>}
                            <th style={th}>Question</th>
                            <th style={th}>Result</th>
                            <th style={th}>Points</th>
                            {showBloom && <th style={th}>Bloom</th>}
                            {showObjective && <th style={th}>Objective</th>}
                          </tr>
                        </thead>
                        <tbody>
                          {focus.items.map((item, index) => (
                            <tr key={`${item.quizTitle}-${item.questionLabel}-${index}`}>
                              {showQuiz && <td style={td}>{item.quizTitle}</td>}
                              <td style={td}>{item.questionLabel}</td>
                              <td style={td}><EditorBadge tone={item.outcome === 'incorrect' ? 'bad' : 'warn'}>{item.outcome === 'incorrect' ? 'Incorrect' : 'Partial credit'}</EditorBadge></td>
                              <td style={{ ...td, fontFamily: mono, whiteSpace: 'nowrap' }}>{item.earnedPoints} / {item.maximumPoints}</td>
                              {showBloom && <td style={td}>{item.bloomsLevel ?? 'Unknown'}</td>}
                              {showObjective && <td style={td}>{item.objective ?? 'Not recorded'}</td>}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <p style={{ fontSize: 13, color: muted, margin: '10px 0 0' }}>No scored incorrect or partial-credit question details are available for this student.</p>
                  )}
                  {focus.pendingCount > 0 && <p style={{ fontSize: 12, color: muted, margin: '8px 0 0' }}>{focus.pendingCount} pending question{focus.pendingCount === 1 ? '' : 's'} ({focus.pendingPoints} pts) excluded from scored evidence.</p>}
                  {focus.unitemizedAttempts > 0 && <p style={{ fontSize: 12, color: muted, margin: '8px 0 0' }}>Item-level results unavailable for {focus.unitemizedAttempts} attempt{focus.unitemizedAttempts === 1 ? '' : 's'}.</p>}
                </>
              )}
            </div>
          </div>
        )}
        {flaggedItemCount === 0 && evidenceStudents.length > 0 && (
          <p style={{ fontSize: 12.5, color: muted, margin: '12px 0 0' }}>None of the selected students has an incorrect or partial-credit item on this topic yet.</p>
        )}
        <div style={{ marginTop: 14, background: '#FFFBEB', border: '1px solid rgba(230,170,40,0.45)', borderRadius: 10, padding: '10px 12px', fontSize: 12, color: muted, lineHeight: 1.5 }}>
          Only finalized scored items inform question-level difficulties. Pending items are set aside; missing snapshot fields stay Unknown. These results guide teacher review and do not diagnose cognitive mastery or assign remediation automatically.
        </div>
      </div>
    )
  }

  const renderWho = () => (
    <div>
      <EditorStepHead title="Who receives it" sub="Choose the students who get this remediation." />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span style={{ fontSize: 12.5, color: muted }}>Flagged students are marked. {targets.length} of {rosterIds.length} selected.</span>
        <button
          type="button"
          onClick={() => setTargets(targets.length === rosterIds.length ? [] : [...rosterIds])}
          style={{ fontSize: 12, fontWeight: 700, color: blueText, background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}
        >
          {targets.length === rosterIds.length ? 'Clear all' : 'Select whole class'}
        </button>
      </div>
      <div className="mt-2" style={{ maxHeight: 'min(52vh, 480px)', overflowY: 'auto', display: 'grid', gap: 8, alignContent: 'start', padding: 2 }}>
        {rosterRows.length === 0 ? (
          <p style={{ fontSize: 12.5, color: faint, padding: '12px 14px', margin: 0 }}>No students on this roster.</p>
        ) : rosterRows.map((row) => {
          const checked = targets.includes(row.id)
          const items = row.evidence?.items.length ?? 0
          const sub = row.isFlagged
            ? (row.evidence?.topicScore ? `${items} incorrect or partial-credit item${items === 1 ? '' : 's'}` : 'No eligible scored item results')
            : 'Not flagged for this topic'
          return (
            <label key={row.id} className="flex items-center gap-3" style={{ padding: '10px 14px', borderRadius: 11, cursor: 'pointer', background: checked ? 'rgba(63,169,245,0.10)' : '#FFFFFF', border: `1.5px solid ${checked ? navy : line}` }}>
              <input type="checkbox" checked={checked} onChange={() => toggle(row.id)} />
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: 13.5, fontWeight: 700, color: ink }}>{row.name}</span>
                <span style={{ display: 'block', fontSize: 11.5, color: muted }}>{sub}</span>
              </span>
              {row.isFlagged && <EditorBadge tone="warn">Flagged</EditorBadge>}
            </label>
          )
        })}
      </div>
    </div>
  )

  let panel
  if (activeStep === 'guidance') panel = renderGuidance()
  else if (activeStep === 'practice_quiz') panel = renderPracticeQuiz()
  else if (activeStep === 'why') panel = renderWhy()
  else if (activeStep === 'who') panel = renderWho()
  else if (activeStep.startsWith('quiz:')) panel = renderStageQuiz(EDITOR_STAGE_QUIZZES.find((q) => `quiz:${q.stage}` === activeStep))
  else panel = renderStageContent(EDITOR_STAGES.find((s) => s.key === activeStep))

  const go = (key) => () => setStep(key)

  return (
    <div {...overlayProps} className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(10,20,40,0.55)', padding: 20 }}>
      <div {...panelProps} className="flex flex-col" style={{ background: '#FFFFFF', border: `1px solid ${line}`, borderRadius: 18, width: '100%', maxWidth: 1080, height: 'min(92vh, 860px)', overflow: 'hidden' }}>
        <div className="flex items-start justify-between gap-4" style={{ padding: '18px 24px', borderBottom: `1px solid ${line}` }}>
          <div>
            <h3 style={{ ...serif, fontSize: 21, color: ink, margin: 0 }}>Edit Remediation</h3>
            <p style={{ fontSize: 12.5, color: muted, margin: '4px 0 0' }}>
              {plan.topic ?? 'Topic'} ·{' '}
              {plan.status === REMEDIATION_PUBLISHED
                ? 'published — changes reach students when you re-publish'
                : 'draft — students cannot see this yet'}
            </p>
          </div>
          <button type="button" onClick={onClose} style={{ ...editorGhostBtn, padding: '8px 16px', fontSize: 13 }}>
            Close
          </button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col md:flex-row">
          <nav aria-label="Remediation steps" className="max-h-[34%] shrink-0 overflow-y-auto md:max-h-none md:w-72 md:border-r" style={{ padding: '6px 12px 14px', background: '#F7F9FC', borderColor: line }}>
            <EditorNavGroup>How to build</EditorNavGroup>
            <div className="flex items-center justify-between gap-3" style={{ background: '#FFFFFF', border: `1px solid ${line}`, borderRadius: 11, padding: '9px 12px' }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: ink }}>Enable Five-Stage Scaffold</div>
                <div style={{ fontSize: 11.5, color: muted }}>{progressive ? 'On — students see only their unlocked stage.' : 'Off — students get one guidance and one practice quiz.'}</div>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={progressive}
                aria-label="Enable Five-Stage Scaffold"
                onClick={toggleProgressive}
                disabled={!!busy}
                className="disabled:opacity-50"
                style={{ flex: 'none', width: 42, height: 24, borderRadius: 999, border: 0, padding: 2, background: progressive ? navy : 'rgba(14,42,92,0.25)', cursor: 'pointer', textAlign: progressive ? 'right' : 'left' }}
              >
                <span style={{ display: 'inline-block', width: 20, height: 20, borderRadius: 999, background: '#FFFFFF' }} />
              </button>
            </div>

            <EditorNavGroup>What students get</EditorNavGroup>
            <div className="grid gap-1">
              <EditorNavItem active={activeStep === 'guidance'} onClick={go('guidance')} marker="✎" label="Title and guidance" sub={guidance.trim() ? undefined : 'Not written yet'} subTone="warn" />
              {progressive && EDITOR_STAGES.map((stage) => {
                const empty = !(stageContent[stage.key] ?? '').trim()
                const quizzesAfter = EDITOR_STAGE_QUIZZES.filter((q) => q.after === stage.key)
                return (
                  <Fragment key={stage.key}>
                    <EditorNavItem active={activeStep === stage.key} onClick={go(stage.key)} marker={stage.n} label={stage.label} sub={empty ? 'Needs content' : stage.sub || undefined} subTone={empty ? 'warn' : undefined} />
                    {quizzesAfter.map((q) => {
                      const state = quizState(plan[q.field], quizzes)
                      return <EditorNavItem key={q.stage} indent active={activeStep === `quiz:${q.stage}`} onClick={go(`quiz:${q.stage}`)} marker="✓" label={q.label} sub={state.label} subTone={state.tone} />
                    })}
                  </Fragment>
                )
              })}
              {progressive && (() => {
                const q = EDITOR_STAGE_QUIZZES[2]
                const state = quizState(plan[q.field], quizzes)
                return <EditorNavItem active={activeStep === `quiz:${q.stage}`} onClick={go(`quiz:${q.stage}`)} marker={5} label={q.label} sub={state.label} subTone={state.tone} />
              })()}
              {!progressive && (() => {
                const state = quizState(plan.recommended_quiz_id, quizzes)
                return <EditorNavItem active={activeStep === 'practice_quiz'} onClick={go('practice_quiz')} marker="✓" label="Practice quiz" sub={plan.recommended_quiz_id ? state.label : 'None attached'} subTone={plan.recommended_quiz_id ? state.tone : undefined} />
              })()}
            </div>

            <EditorNavGroup>Why and who</EditorNavGroup>
            <div className="grid gap-1">
              <EditorNavItem active={activeStep === 'why'} onClick={go('why')} marker="?" label="Why this review is suggested" sub={`${flaggedItemCount} flagged item${flaggedItemCount === 1 ? '' : 's'} · ${evidenceStudents.length} student${evidenceStudents.length === 1 ? '' : 's'}`} />
              <EditorNavItem active={activeStep === 'who'} onClick={go('who')} marker={targets.length} label={`Who receives it (${targets.length})`} sub={targets.length === 0 ? 'Choose at least one student' : undefined} subTone="warn" />
            </div>
          </nav>

          <div className="min-w-0 flex-1 overflow-y-auto" style={{ padding: '20px 24px' }}>
            {panel}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3" style={{ padding: '12px 24px', borderTop: `1px solid ${line}`, background: '#FFFFFF' }}>
          <div style={{ flex: 1, minWidth: 220 }}>
            {quizBlock ? (
              <p role="status" data-testid="quiz-review-block" style={{ fontSize: 12.5, color: goldDeep, fontWeight: 600, margin: 0, lineHeight: 1.45 }}>{quizBlock}</p>
            ) : targets.length === 0 ? (
              <p role="status" style={{ fontSize: 12.5, color: goldDeep, fontWeight: 600, margin: 0 }}>Choose at least one student under Who receives it before publishing.</p>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => onSave(patch())}
              disabled={working}
              className="transition hover:brightness-95 disabled:opacity-50"
              style={{ ...editorGhostBtn, padding: '10px 18px', fontSize: 13.5, borderRadius: 10 }}
            >
              {busy === `save:${plan.id}` ? 'Saving…' : 'Save draft'}
            </button>
            <button
              type="button"
              onClick={() => onSaveAndPublish(patch())}
              disabled={working || targets.length === 0 || !!quizBlock}
              title={quizBlock ?? undefined}
              className="transition hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ ...editorPrimaryBtn, padding: '10px 20px', fontSize: 13.5, borderRadius: 10, boxShadow: `0 3px 0 ${navyDeep}` }}
            >
              {busy === `publish:${plan.id}`
                ? 'Publishing…'
                : plan.status === REMEDIATION_PUBLISHED
                  ? 'Save & re-publish'
                  : 'Save & publish'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function ScaffoldTopicsPage() {
  const { classId } = useParams()
  const navigate = useNavigate()
  const { profile } = useAuth()
  const queryClient = useQueryClient()
  const [busy, setBusy] = useState(null)
  const [recoveringPlan, setRecoveringPlan] = useState(null)
  const [error, setError] = useState(null)
  const [editingPlan, setEditingPlan] = useState(null)
  const [searchParams, setSearchParams] = useSearchParams()

  const { data, isLoading, isError } = useQuery({
    queryKey: ['fs-scaffolds', classId],
    queryFn: () => loadScaffolds(classId),
  })
  const bloomPerformance = data ? aggregateBloomPerformance(data) : null

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['fs-scaffolds', classId] })

  const planToRestore = searchParams.get('editPlan')
  const restoredPlan = data?.remediation?.plans?.find((item) => item.id === planToRestore)
  const activeEditingPlan = editingPlan ?? restoredPlan

  function closePlanEditor() {
    setEditingPlan(null)
    if (searchParams.has('editPlan')) {
      const next = new URLSearchParams(searchParams)
      next.delete('editPlan')
      setSearchParams(next, { replace: true })
    }
  }

  /**
   * Start a remediation for a weak topic.
   *
   * Creates the plan as a DRAFT and opens the editor. It does not navigate to
   * the quiz builder: that was the old behaviour, and it meant the only thing a
   * teacher could edit or publish was the quiz. The plan is what carries the
   * guidance and the target list, and it stays invisible to students until
   * published.
   */
  async function startRemediation(topic) {
    setBusy(topic.id)
    setError(null)
    try {
      const targets = focusId && !(topic.affectedIds ?? []).includes(focusId)
        ? [...(topic.affectedIds ?? []), focusId]
        : (topic.affectedIds ?? [])
      const ref = await createRemediationPlan({
        classId,
        teacherId: profile.id,
        topicId: topic.id,
        topicTitle: topic.title,
        targetStudentIds: targets,
        mastery: topic.mastery ?? 0,
      })
      await refresh()
      setEditingPlan({
        id: ref.id,
        class_id: classId,
        topic_id: topic.id,
        topic: topic.title,
        title: `Remediation · ${topic.title}`,
        guidance: '',
        recommended_quiz_id: null,
        target_student_ids: targets,
        status: 'draft',
        assignments: [],
      })
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(null)
    }
  }

  /**
   * Generate a practice quiz for a plan's topic and attach it.
   *
   * Returns the new quiz id instead of navigating. Navigating away was what
   * made remediation feel like a quiz: the teacher lost the plan they were
   * building and landed in the quiz editor with no way back to it.
   */
  async function buildPack(topic, plan = null, targetedEvidence = null, stage = 'reassessment') {
    setBusy(plan ? `quiz:${plan.id}:${stage}` : topic.id)
    setError(null)
    try {
      // A plan carries only the topic's id and title; the objectives live on
      // the syllabus topic this page already loaded.
      const objectives = topic.objectives ?? data?.topics?.find((t) => t.id === topic.id)?.objectives ?? []
      const practiceConfig = remediationPracticeConfig(targetedEvidence, 10)
      // Applying is the existing topic-only practice default. It does not
      // assign a Bloom weakness when snapshots are absent; the request remains
      // structured so the approved quotas and generated-tag checks still run.
      const evidenceInstructions = remediationEvidenceInstructions(targetedEvidence)
      const otherStageQuizIds = plan ? [
        plan.guided_practice_quiz_id,
        plan.independent_practice_quiz_id,
        plan.recommended_quiz_id,
      ].filter((id) => id && id !== plan[stageQuizField(stage)]) : []
      const existingQuestionTexts = otherStageQuizIds.flatMap((id) =>
        (data?.quizzes ?? []).find((item) => item.id === id)?.questions?.map((q) => String(q.text ?? '').trim()).filter(Boolean) ?? [],
      )
      const stageInstructions = !plan || stage === 'legacy' ? '' : `Create the ${stage === 'reassessment' ? 'Reassessment' : stage === 'guided_practice' ? 'Guided Practice' : 'Independent Practice'} assessment for a five-stage remediation. Use the same recorded learning objectives as the other stage assessments, but create distinct questions. Do not reuse or lightly reword these existing question stems: ${JSON.stringify(existingQuestionTexts)}.`
      const stageLabel = stage === 'guided_practice' ? 'Guided Practice'
        : stage === 'independent_practice' ? 'Independent Practice'
          : stage === 'reassessment' ? 'Reassessment' : null
      const quiz = await generateQuiz({
        topic: topic.title,
        topicId: topic.id ?? null,
        objectives,
        numQuestions: 10,
        types: practiceConfig.types,
        bloomsLevels: practiceConfig.bloomsLevels,
        bloomAllocation: practiceConfig.bloomAllocation,
        difficulty: 'medium',
        instructions: [evidenceInstructions, stageInstructions].filter(Boolean).join('\n\n'),
        hints: { subject: data?.clazz?.subject, ...(!practiceConfig.usedRecordedBloomLevels ? { targetLevel: 'apply' } : {}) },
      })
      const questions = draftToQuestions(quiz)
      if (plan && existingQuestionTexts.length) {
        if (questions.some((question) => duplicateQuestionStem(question.text, existingQuestionTexts))) {
          throw new Error('The generated assessment repeated a question from another stage. The draft was not saved; try generation again after reviewing the existing questions.')
        }
      }
      // The id is minted here rather than by addDoc: the answer key lands in
      // `quiz_keys/{id}` (Group 7), so the quiz id has to be known before the
      // write, not handed back by it.
      const ref = doc(collection(db, 'quizzes'))
      const quizFields = {
        // The ordinary quiz document is only a stage shell; question text is
        // stored separately and server-released after assignment checks.
        class_ids: [classId],
        teacher_id: profile.id,
        title: `Remediation · ${topic.title}${stageLabel ? ` · ${stageLabel}` : ''}`,
        status: 'draft',
        instructions: '',
        time_limit_minutes: null,
        attempts_allowed: 1,
        shuffle_questions: false,
        prevent_backtracking: false,
        opens_at: null,
        closes_at: null,
        generated_by: 'ai_generated',
        topic_id: topic.id,
        ai_source: 'anthropic',
        created_at: serverTimestamp(),
        ...(plan && ['guided_practice', 'independent_practice', 'reassessment'].includes(stage)
          ? { remediation_plan_id: plan.id, remediation_stage: stage }
          : {}),
      }
      await writeQuizWithKey(ref.id, quizFields, questions, {
        teacherId: profile.id,
        schoolId: profile.school_id ?? null,
      })

      if (plan) {
        const field = stageQuizField(stage)
        const stagedUpdate = stage === 'legacy' ? { [field]: ref.id } : { [field]: ref.id, progression_version: 1 }
        await updateRemediationPlan(plan.id, stagedUpdate)
        setEditingPlan((p) => (p && p.id === plan.id ? { ...p, ...stagedUpdate } : p))
        await refresh()
        return ref.id
      }
      // No plan in hand (topic has no remediation yet) — the quiz is still
      // useful on its own, so behave as before and open the builder.
      navigate(`/teacher/quizzes/${ref.id}`)
      return ref.id
    } catch (err) {
      setError(err.message)
      return null
    } finally {
      setBusy(null)
    }
  }

  async function buildMaterials(plan, evidence) {
    if (!evidence?.hasScoredEvidence) {
      throw new Error('No finalized scored evidence is available for these students.')
    }
    setBusy(`materials:${plan.id}`)
    setError(null)
    try {
      return await generateScaffoldMaterials({
        topic: plan.topic,
        difficultyLevel: 'Targeted from recorded results',
        learningEvidence: evidence.aiEvidence,
      })
    } catch (err) {
      setError(err.message)
      throw err
    } finally {
      setBusy(null)
    }
  }

  async function runPlanAction(plan, action, fn) {
    setBusy(`${action}:${plan.id}`)
    setError(null)
    try {
      await fn()
      await refresh()
      return true
    } catch (err) {
      setError(err.message)
      return false
    } finally {
      setBusy(null)
    }
  }

  const header = (
    <div className="mb-[22px] flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="text-[clamp(26px,3.5vw,32px)]" style={{ ...serif, lineHeight: 1.1, letterSpacing: '-0.01em', margin: '0 0 4px', color: ink, display: 'flex', alignItems: 'center' }}>
          Scaffold Topics
          <InfoTooltip label="What this tab is for">
            Per-topic mastery across the class, computed from quiz attempts on syllabus-linked
            quizzes. Weak topics get a one-click remediation quiz.
          </InfoTooltip>
        </h1>
      </div>
    </div>
  )

  if (isLoading) return <SkeletonList count={5} height={72} label="Loading scaffold topics" />
  if (isError || !data) return <p style={{ color: red }}>Class not found.</p>

  /* Arriving from the Performance page's below-85 list carries the student
     in the URL; the page then opens on the topics that student is weak in.
     Every plan started from here still targets topic.affectedIds, so the
     student is one of the targets, never the only one. */
  const focusId = searchParams.get('student')
  const focusName = focusId ? data.nameById?.[focusId] : null
  const allRows = data.rows ?? []
  const matchingRows = focusName ? allRows.filter((r) => (r.affectedIds ?? []).includes(focusId)) : allRows
  const hasMatching = focusName ? matchingRows.length > 0 : true
  const rows = hasMatching ? matchingRows : allRows
  const { linkedQuizzes } = data
  const focusBanner = focusName && (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3" style={{ background: 'rgba(245,197,24,0.1)', border: '1px solid rgba(245,197,24,0.4)', borderRadius: 12, padding: '10px 14px' }}>
      <span style={{ fontSize: 13.5, color: ink }}>
        {hasMatching ? (
          <>
            Showing the {rows.length} topic{rows.length === 1 ? '' : 's'} where <strong>{focusName}</strong> is below mastery (score under 75%).
          </>
        ) : (
          <>
            <strong>{focusName}</strong> has a grade under 75% in the class record, with no recorded quiz failures on tracked topics yet. Showing all {allRows.length} topic{allRows.length === 1 ? '' : 's'} so you can create a remediation for them.
          </>
        )}
      </span>
      <button onClick={() => setSearchParams({})} style={{ fontSize: 12.5, fontWeight: 700, color: navy, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
        {hasMatching ? 'Show all topics' : 'Clear filter'}
      </button>
    </div>
  )
  // When a student is focused, any topic where they are affected belongs in "needs" for that student!
  const needs = rows.filter((r) => (focusName && (r.affectedIds ?? []).includes(focusId)) || bucketOf(r.mastery) === 'needs').sort((a, b) => a.mastery - b.mastery)
  const developing = rows.filter((r) => !(focusName && (r.affectedIds ?? []).includes(focusId)) && bucketOf(r.mastery) === 'developing').sort((a, b) => a.mastery - b.mastery)
  const mastered = rows.filter((r) => !(focusName && (r.affectedIds ?? []).includes(focusId)) && bucketOf(r.mastery) === 'mastered').sort((a, b) => b.mastery - a.mastery)

  // Topics in the syllabus that do not yet have quiz/assessment attempts:
  const untrackedSyllabusTopics = (data.topics ?? []).filter((t) => !allRows.some((r) => r.id === t.id))

  if (rows.length === 0 && untrackedSyllabusTopics.length === 0) {
    return (
      <div>
        {header}
        {focusBanner}
        <div className="text-center" style={{ background: '#FFFFFF', border: `1px solid ${line}`, borderRadius: 16, padding: 40 }}>
          <p style={{ color: muted, margin: '0 0 6px' }}>No topic mastery yet.</p>
          <p style={{ fontSize: 13, color: faint, margin: 0, maxWidth: 520, marginInline: 'auto', lineHeight: 1.5 }}>
            Create a syllabus and generate quizzes linked to its topics to see mastery here.
          </p>
          <Link to="/teacher/quizzes" className="mt-4 inline-flex transition hover:brightness-110" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '12px 20px', fontSize: 14, fontWeight: 700, fontFamily: sans, color: '#FAFAF6', background: navy, borderRadius: 11, textDecoration: 'none', boxShadow: `0 3px 0 ${navyDeep}` }}>
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
          <h1 className="text-[clamp(26px,3.5vw,32px)]" style={{ ...serif, lineHeight: 1.1, letterSpacing: '-0.01em', margin: '0 0 4px', color: ink, display: 'flex', alignItems: 'center' }}>
            Scaffold Topics
            <InfoTooltip label="What this tab is for">
              Per-topic mastery across the class, computed from quiz attempts on syllabus-linked
              quizzes. Weak topics get a one-click remediation quiz.
            </InfoTooltip>
          </h1>
        </div>
        <div className="inline-flex items-center gap-2.5" style={{ padding: '10px 14px', background: 'rgba(63,169,245,0.08)', border: '1.5px solid rgba(63,169,245,0.3)', borderRadius: 11 }}>
          <span style={{ color: blueText, display: 'inline-flex' }}><Sparkles className="h-3.5 w-3.5" /></span>
          <span style={{ fontSize: 12.5, fontWeight: 700, color: blueText }}>{rows.length} topics from {linkedQuizzes} linked quiz{linkedQuizzes === 1 ? '' : 'zes'}</span>
        </div>
      </div>

      {error && (
        <p role="alert" className="mb-4" style={{ fontSize: 13, color: red, background: 'rgba(192,57,43,0.07)', border: '1px solid rgba(192,57,43,0.3)', borderRadius: 10, padding: '10px 12px' }}>{error}</p>
      )}

      {focusBanner}

      {/* count strip */}
      <div className="mb-[22px] grid grid-cols-2 gap-3.5 lg:grid-cols-4">
        <MetricCard label="Topics tracked" value={rows.length} tint="rgba(14,42,92,0.07)" />
        <MetricCard label="Needs scaffolding" value={needs.length} sub="below 60% mastery" valueColor={red} tint="rgba(192,57,43,0.07)" />
        <MetricCard label="Developing" value={developing.length} sub="60–80% mastery" valueColor={goldDeep} tint="rgba(245,197,24,0.15)" />
        <MetricCard label="Mastered" value={mastered.length} sub="≥ 80% mastery" valueColor={green} tint="rgba(31,138,91,0.1)" />
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
                    <span style={{ fontSize: 11, fontWeight: 700, color: blueText, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Suggested Intervention</span>
                  </div>
                  <div style={{ fontSize: 13.5, color: ink, lineHeight: 1.45, marginBottom: 10 }}>
                    Re-teach <strong>{t.title}</strong> with worked examples, then assign a targeted remediation quiz to the {t.studentsAffected} student{t.studentsAffected === 1 ? '' : 's'} below mastery.
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div style={{ fontSize: 12, color: muted }}>
                      <span style={{ fontWeight: 700, color: ink }}>Affected:</span> {t.affectedNames.slice(0, 4).join(' · ') || '—'}
                      {t.affectedNames.length > 4 ? ` +${t.affectedNames.length - 4}` : ''}
                    </div>
                    {(() => {
                      // One remediation plan per topic. If one exists, this
                      // becomes the way back into it rather than a second copy.
                      const existing = (data.remediation?.plans ?? []).find(
                        (p) => p.topic_id === t.id,
                      )
                      if (existing) {
                        return (
                          <button
                            onClick={() => setEditingPlan(existing)}
                            className="transition hover:brightness-110"
                            style={{ padding: '9px 16px', fontSize: 12.5, fontWeight: 700, fontFamily: sans, color: navy, background: '#FFFFFF', border: `1.5px solid ${navy}`, borderRadius: 9, cursor: 'pointer' }}
                          >
                            {existing.status === REMEDIATION_PUBLISHED
                              ? 'Edit remediation (published)'
                              : 'Edit remediation (draft)'}
                          </button>
                        )
                      }
                      return (
                        <button
                          onClick={() => startRemediation(t)}
                          disabled={busy === t.id}
                          className="transition hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed"
                          style={{ padding: '9px 16px', fontSize: 12.5, fontWeight: 700, fontFamily: sans, color: '#FAFAF6', background: navy, border: 'none', borderRadius: 9, cursor: 'pointer', boxShadow: `0 2px 0 ${navyDeep}` }}
                        >
                          {busy === t.id ? 'Creating…' : 'Create remediation'}
                        </button>
                      )
                    })()}
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
          <div className="overflow-x-auto" style={{ background: '#FFFFFF', border: `1px solid ${line}`, borderRadius: 16 }}>
            {developing.map((t) => (
              <div key={t.id} className="grid items-center gap-4 min-w-[720px]" style={{ gridTemplateColumns: '1fr 160px 120px 80px 120px', padding: '14px 22px', borderBottom: '1px solid rgba(14,42,92,0.05)' }}>
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

      {/* untracked syllabus topics ready to scaffold */}
      {untrackedSyllabusTopics.length > 0 && (
        <div className="mb-[22px]">
          <SectionHead dot={blueText} title="Syllabus topics" note={`${untrackedSyllabusTopics.length} topic${untrackedSyllabusTopics.length === 1 ? '' : 's'} · ready for remediation`} />
          <div className="flex flex-col gap-3">
            {untrackedSyllabusTopics.map((t) => (
              <div key={t.id} style={{ background: '#FFFFFF', border: `1px solid ${line}`, borderRadius: 16, padding: '20px 22px' }}>
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: ink }}>{t.title}</div>
                    <div className="mt-1 flex items-center gap-2.5" style={{ fontSize: 12, color: muted }}>
                      <span style={{ ...mono, color: blueText, fontWeight: 600 }}>{t.moduleTitle}</span>
                      <span>·</span>
                      <span>No quiz scores tracked yet</span>
                    </div>
                  </div>
                  <div>
                    <button
                      type="button"
                      onClick={() => startRemediation(t)}
                      disabled={busy === t.id}
                      className="transition hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed"
                      style={{ padding: '9px 16px', fontSize: 12.5, fontWeight: 700, fontFamily: sans, color: '#FAFAF6', background: navy, border: 'none', borderRadius: 9, cursor: 'pointer', boxShadow: `0 2px 0 ${navyDeep}` }}
                    >
                      {busy === t.id ? 'Creating…' : 'Create remediation'}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* remediation plans — the edit/publish surface */}
      <RemediationPanel
        plans={data.remediation?.plans ?? []}
        legacy={data.remediation?.legacy ?? []}
        nameById={data.nameById ?? {}}
        attemptsByQuiz={data.attemptsByQuiz ?? {}}
        quizzes={data.quizzes ?? []}
        busy={busy}
        onEdit={setEditingPlan}
        onRecover={setRecoveringPlan}
        onPublish={(plan) =>
          runPlanAction(plan, 'publish', () => publishRemediation(plan))
        }
        onUnpublish={async (plan) => {
          if (!(await confirmDialog({
            title: `Withdraw "${plan.title}"?`,
            message: `${plan.assignments?.length ?? 0} student(s) lose access to it immediately. The plan itself is kept and can be published again.`,
            confirmLabel: 'Withdraw',
            tone: 'danger',
          }))) return
          runPlanAction(plan, 'unpublish', () => unpublishRemediation(plan))
        }}
        onDelete={async (plan) => {
          if (!(await confirmDialog({
            title: `Delete "${plan.title}"?`,
            message: 'It is removed from every student it was assigned to. This cannot be undone.',
            confirmLabel: 'Delete Plan',
            tone: 'danger',
            typeToConfirm: 'DELETE',
          }))) return
          runPlanAction(plan, 'delete', () => deleteRemediationPlan(plan))
        }}
      />

      {recoveringPlan && (
        <RecoverMarksModal
          plan={recoveringPlan}
          classId={classId}
          nameById={data.nameById ?? {}}
          teacherId={profile?.id}
          onClose={() => setRecoveringPlan(null)}
          onApplied={async (message) => {
            setRecoveringPlan(null)
            // Mastery on this page is computed from quiz attempts, not from
            // the record, so it will not move -- the refresh is for the plan
            // list and for anything else reading the class.
            await refresh()
            toast.success(message)
          }}
        />
      )}

      {activeEditingPlan && (
        <RemediationEditor
          plan={activeEditingPlan}
          quizzes={data.quizzes ?? []}
          attemptsByQuiz={data.attemptsByQuiz ?? {}}
          nameById={data.nameById ?? {}}
          rosterIds={data.rosterIds ?? []}
          busy={busy}
          onClose={closePlanEditor}
          onSave={async (patch) => {
            const ok = await runPlanAction(activeEditingPlan, 'save', () =>
              updateRemediationPlan(activeEditingPlan.id, patch),
            )
            if (ok) closePlanEditor()
          }}
          onSaveAndPublish={async (patch) => {
            const merged = { ...activeEditingPlan, ...patch }
            const ok = await runPlanAction(activeEditingPlan, 'publish', async () => {
              await updateRemediationPlan(activeEditingPlan.id, patch)
              await publishRemediation(merged)
            })
            if (ok) closePlanEditor()
          }}
          onGenerateQuiz={(stage, targetedEvidence) =>
            buildPack({ id: activeEditingPlan.topic_id, title: activeEditingPlan.topic }, activeEditingPlan, targetedEvidence, stage)
          }
          onGenerateMaterials={(targetedEvidence) => buildMaterials(activeEditingPlan, targetedEvidence)}
          onViewQuiz={async (stage, patch) => {
            const quizId = activeEditingPlan[stageQuizField(stage)]
            if (!quizId) return
            setBusy(`save:${activeEditingPlan.id}`)
            setError(null)
            try {
              await updateRemediationPlan(activeEditingPlan.id, patch)
              await refresh()
              navigate(`/teacher/quizzes/${quizId}`, {
                state: { remediationReturn: { classId, planId: activeEditingPlan.id } },
              })
            } catch (err) {
              setError(err.message)
            } finally {
              setBusy(null)
            }
          }}
        />
      )}

      {/* mastered */}
      {mastered.length > 0 && (
        <div>
          <SectionHead dot={green} title="Mastered" note={`${mastered.length} topic${mastered.length === 1 ? '' : 's'} · on track`} />
          <div className="overflow-x-auto" style={{ background: '#FFFFFF', border: `1px solid ${line}`, borderRadius: 16 }}>
            {mastered.map((t) => (
              <div key={t.id} className="grid items-center gap-4 min-w-[720px]" style={{ gridTemplateColumns: '1fr 180px 80px 120px 90px', padding: '14px 22px', borderBottom: '1px solid rgba(14,42,92,0.05)' }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: ink }}>{t.title}</div>
                <div style={{ ...mono, fontSize: 12, color: blueText, fontWeight: 600 }}>{t.moduleTitle}</div>
                <div style={{ ...mono, fontSize: 13, fontWeight: 700, color: green, textAlign: 'right' }}>{t.mastery}%</div>
                <div style={{ height: 6, background: 'rgba(14,42,92,0.07)', borderRadius: 999, overflow: 'hidden' }}>
                  <div style={{ width: `${t.mastery}%`, height: '100%', background: green, borderRadius: 999 }} />
                </div>
                <div style={{ textAlign: 'right' }}>
                  <button
                    type="button"
                    onClick={() => startRemediation(t)}
                    disabled={busy === t.id}
                    className="transition hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed"
                    style={{ padding: '6px 12px', fontSize: 11.5, fontWeight: 700, fontFamily: sans, color: navy, background: '#FFFFFF', border: `1px solid ${navy}`, borderRadius: 8, cursor: 'pointer' }}
                  >
                    Scaffold
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ marginTop: 22 }}>
        <BloomsBreakdown performance={bloomPerformance} />
      </div>
    </div>
  )
}
