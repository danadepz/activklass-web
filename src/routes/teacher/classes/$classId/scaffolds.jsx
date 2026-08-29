import { useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { addDoc, collection, doc, getDoc, getDocs, query, serverTimestamp, where } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { draftToQuestions, generateQuiz } from '@/lib/ai'
import { fetchUsersByIds } from '@/lib/roster'
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
  PASSING,
  RECOVERY_POLICIES,
  CAPPED_REPLACE,
  describeRecoveryResult,
} from '@/lib/remediationRecovery'
import { useAuth } from '@/context/useAuth'
import { Sparkles } from '@/components/icons'
import { navy, navyDeep, ink, gold, goldDeep, muted, faint, green, blueText, red, line, serif, mono, sansFamily as sans } from '@/theme'
import { confirmDialog } from '@/components/ui/dialogs'
import { toast } from '@/components/ui/toast'
import { SkeletonList } from '@/components/ui/Skeleton'
import { MetricCard } from '@/components/ui/Card'
import { useDialogBehavior } from '@/components/ui/useDialogBehavior'

const PASS = 75 // an attempt at/above this % counts as mastered for that student

async function loadScaffolds(classId) {
  const sylSnap = await getDoc(doc(db, 'classes', classId, 'syllabus', 'current'))
  const syl = sylSnap.exists() ? sylSnap.data() : null
  const topics = (syl?.modules ?? []).flatMap((m) =>
    (m.topics ?? []).map((t) => ({ id: t.id, title: t.title, moduleTitle: m.title })),
  )

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
      const aSnap = await getDocs(query(collection(db, 'quiz_attempts'), where('quiz_id', '==', q.id)))
      attemptsByQuiz[q.id] = aSnap.docs.map((d) => d.data())
    }),
  )

  const classSnap = await getDoc(doc(db, 'classes', classId))
  const clazz = classSnap.exists() ? classSnap.data() : null
  const ids = clazz ? clazz.student_ids ?? [] : []
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
    const affectedIds = Object.entries(bestByStudent)
      .filter(([, p]) => p < PASS)
      .map(([sid]) => sid)
    rows.push({
      ...topic,
      mastery,
      quizCount: tq.length,
      attemptCount,
      studentsAffected: affectedIds.length,
      affectedNames: affectedIds.map((sid) => nameById[sid] ?? sid),
      // Ids as well as names: a remediation plan targets student_ids, and the
      // display names cannot be turned back into uids.
      affectedIds,
    })
  }

  const linkedQuizzes = quizzes.filter((q) => q.topic_id).length
  const remediation = await loadClassRemediations(classId).catch(() => ({ plans: [], legacy: [] }))
  return {
    rows,
    topicCount: topics.length,
    linkedQuizzes,
    clazz,
    nameById,
    rosterIds: ids,
    remediation,
  }
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

/**
 * Remediation plans for the class, with their own edit and publish actions.
 *
 * A draft reaches nobody: the plan document carries no student_id, so neither
 * the student query nor the security rule can see it. Publishing is what fans
 * it out into per-student assignments — see features/classes/remediation.js.
 */
function RemediationPanel({ plans, legacy, nameById, busy, onEdit, onPublish, onUnpublish, onDelete, onRecover }) {
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
          return (
            <div key={plan.id} className="flex flex-wrap items-center justify-between gap-3" style={{ padding: '16px 22px', borderBottom: '1px solid rgba(14,42,92,0.05)' }}>
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
                    Recover marks
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
                  disabled={busy === `publish:${plan.id}` || targets.length === 0}
                  title={targets.length === 0 ? 'Pick at least one student first' : undefined}
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
  const [cap, setCap] = useState(PASSING)
  const [applying, setApplying] = useState(false)
  const [error, setError] = useState(null)

  const { data: targets = [], isLoading: loadingTargets } = useQuery({
    queryKey: ['fs-recovery-targets', classId],
    queryFn: () => loadRecoveryTargets(classId),
  })

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
                min="60"
                max="100"
                className="ak-input"
                value={cap}
                onChange={(e) => setCap(Number(e.target.value) || PASSING)}
                style={{ ...selectStyle, ...mono, cursor: 'text' }}
              />
            </div>
          </div>
          <p style={{ fontSize: 12, color: muted, margin: 0, lineHeight: 1.5 }}>
            {policyMeta?.describe(cap)} A recovery can only raise a mark, never lower one.
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
function RemediationEditor({ plan, nameById, rosterIds, busy, onClose, onSave, onSaveAndPublish, onGenerateQuiz }) {
  const { overlayProps, panelProps } = useDialogBehavior(onClose, { label: 'Edit a remediation plan', closeOnBackdrop: false })
  const [title, setTitle] = useState(plan.title ?? '')
  const [guidance, setGuidance] = useState(plan.guidance ?? '')
  const [targets, setTargets] = useState(plan.target_student_ids ?? [])

  const working = busy === `save:${plan.id}` || busy === `publish:${plan.id}`
  const generating = busy === `quiz:${plan.id}`
  const patch = () => ({
    title: title.trim() || plan.title,
    guidance: guidance.trim(),
    target_student_ids: targets,
  })

  const toggle = (id) =>
    setTargets((t) => (t.includes(id) ? t.filter((x) => x !== id) : [...t, id]))

  return (
    <div {...overlayProps} className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto" style={{ background: 'rgba(10,20,40,0.55)', padding: 24 }}>
      <div {...panelProps} style={{ background: '#FFFFFF', border: `1px solid ${line}`, borderRadius: 18, padding: 26, width: '100%', maxWidth: 620 }}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 style={{ ...serif, fontSize: 21, color: ink, margin: 0 }}>Edit remediation</h3>
            <p style={{ fontSize: 12.5, color: muted, margin: '4px 0 0' }}>
              {plan.topic ?? 'Topic'} ·{' '}
              {plan.status === REMEDIATION_PUBLISHED
                ? 'published — changes reach students when you re-publish'
                : 'draft — students cannot see this yet'}
            </p>
          </div>
          <button onClick={onClose} style={{ fontSize: 13, fontWeight: 600, color: muted, background: 'none', border: 'none', cursor: 'pointer' }}>
            Close
          </button>
        </div>

        <div className="mt-5">
          <label style={{ fontSize: 11.5, fontWeight: 700, color: muted, letterSpacing: '0.05em', textTransform: 'uppercase' }}>Title</label>
          <input
            className="ak-input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            style={{ marginTop: 6, width: '100%', padding: '10px 12px', fontSize: 14, fontFamily: sans, color: ink, border: '1.5px solid rgba(14,42,92,0.14)', borderRadius: 9 }}
          />
        </div>

        <div className="mt-4">
          <label style={{ fontSize: 11.5, fontWeight: 700, color: muted, letterSpacing: '0.05em', textTransform: 'uppercase' }}>Guidance for the student</label>
          <textarea
            className="ak-input"
            rows={4}
            value={guidance}
            onChange={(e) => setGuidance(e.target.value)}
            placeholder="What should they review, and how? This is the part a quiz cannot carry."
            style={{ marginTop: 6, width: '100%', padding: '10px 12px', fontSize: 14, fontFamily: sans, color: ink, border: '1.5px solid rgba(14,42,92,0.14)', borderRadius: 9, resize: 'vertical' }}
          />
        </div>

        <div className="mt-4" style={{ background: 'rgba(63,169,245,0.05)', border: '1px solid rgba(63,169,245,0.25)', borderRadius: 11, padding: '12px 14px' }}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div style={{ fontSize: 13, color: ink }}>
              <strong>Practice quiz:</strong>{' '}
              {plan.recommended_quiz_id ? (
                <Link to={`/teacher/classes/${plan.class_id}/quizzes/${plan.recommended_quiz_id}`} style={{ color: blueText, fontWeight: 600 }}>
                  open in quiz editor
                </Link>
              ) : (
                <span style={{ color: muted }}>none attached</span>
              )}
            </div>
            <button
              onClick={onGenerateQuiz}
              disabled={generating}
              className="transition hover:brightness-110 disabled:opacity-50"
              style={{ padding: '7px 13px', fontSize: 12, fontWeight: 700, fontFamily: sans, color: blueText, background: '#FFFFFF', border: `1.5px solid rgba(63,169,245,0.45)`, borderRadius: 8, cursor: 'pointer' }}
            >
              {generating ? 'Generating…' : plan.recommended_quiz_id ? 'Regenerate' : 'Generate with AI'}
            </button>
          </div>
          <p style={{ fontSize: 11.5, color: muted, margin: '8px 0 0', lineHeight: 1.45 }}>
            Generating a quiz no longer navigates away — it attaches here so you keep the plan you
            are editing. Publishing the plan does not publish the quiz; open it to do that.
          </p>
        </div>

        <div className="mt-4">
          <div className="flex items-center justify-between">
            <label style={{ fontSize: 11.5, fontWeight: 700, color: muted, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
              Who receives it ({targets.length})
            </label>
            <button
              onClick={() => setTargets(targets.length === rosterIds.length ? [] : [...rosterIds])}
              style={{ fontSize: 11.5, fontWeight: 600, color: blueText, background: 'none', border: 'none', cursor: 'pointer' }}
            >
              {targets.length === rosterIds.length ? 'Clear all' : 'Select whole class'}
            </button>
          </div>
          <div className="mt-2" style={{ maxHeight: 190, overflowY: 'auto', border: '1px solid rgba(14,42,92,0.12)', borderRadius: 9 }}>
            {rosterIds.length === 0 ? (
              <p style={{ fontSize: 12.5, color: faint, padding: '12px 14px', margin: 0 }}>No students on this roster.</p>
            ) : (
              rosterIds.map((id) => (
                <label key={id} className="flex items-center gap-2.5" style={{ padding: '8px 14px', borderBottom: '1px solid rgba(14,42,92,0.05)', fontSize: 13, color: ink, cursor: 'pointer' }}>
                  <input type="checkbox" checked={targets.includes(id)} onChange={() => toggle(id)} />
                  {nameById[id] ?? id}
                </label>
              ))
            )}
          </div>
        </div>

        <div className="mt-5 flex flex-wrap gap-3">
          <button
            onClick={() => onSaveAndPublish(patch())}
            disabled={working || targets.length === 0}
            className="transition hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ flex: 1, minWidth: 170, padding: '11px 18px', fontSize: 13.5, fontWeight: 700, fontFamily: sans, color: '#FAFAF6', background: navy, border: 'none', borderRadius: 10, cursor: 'pointer', boxShadow: `0 3px 0 ${navyDeep}` }}
          >
            {busy === `publish:${plan.id}`
              ? 'Publishing…'
              : plan.status === REMEDIATION_PUBLISHED
                ? 'Save & re-publish'
                : 'Save & publish'}
          </button>
          <button
            onClick={() => onSave(patch())}
            disabled={working}
            className="transition hover:brightness-95 disabled:opacity-50"
            style={{ flex: 1, minWidth: 140, padding: '11px 18px', fontSize: 13.5, fontWeight: 700, fontFamily: sans, color: navy, background: '#FFFFFF', border: `1.5px solid rgba(14,42,92,0.25)`, borderRadius: 10, cursor: 'pointer' }}
          >
            {busy === `save:${plan.id}` ? 'Saving…' : 'Save draft'}
          </button>
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

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['fs-scaffolds', classId] })

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
      const ref = await createRemediationPlan({
        classId,
        teacherId: profile.id,
        topicId: topic.id,
        topicTitle: topic.title,
        targetStudentIds: topic.affectedIds ?? [],
        mastery: topic.mastery,
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
        target_student_ids: topic.affectedIds ?? [],
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
  async function buildPack(topic, plan = null) {
    setBusy(plan ? `quiz:${plan.id}` : topic.id)
    setError(null)
    try {
      const quiz = await generateQuiz({
        topic: topic.title,
        numQuestions: 10,
        difficulty: 'medium',
        hints: { subject: data?.clazz?.subject, targetLevel: 'apply' },
      })
      const ref = await addDoc(collection(db, 'quizzes'), {
        // Canonical link. Writing the scalar class_id here is what made
        // remediation quizzes invisible to the student class page, which
        // queries class_ids with array-contains.
        class_ids: [classId],
        teacher_id: profile.id,
        title: `Remediation · ${topic.title}`,
        status: 'draft',
        instructions: '',
        time_limit_minutes: null,
        attempts_allowed: 1,
        shuffle_questions: false,
        prevent_backtracking: false,
        opens_at: null,
        closes_at: null,
        generated_by: 'ai_generated',
        questions: draftToQuestions(quiz),
        topic_id: topic.id,
        ai_source: 'anthropic',
        created_at: serverTimestamp(),
        updated_at: serverTimestamp(),
      })

      if (plan) {
        await updateRemediationPlan(plan.id, { recommended_quiz_id: ref.id })
        setEditingPlan((p) => (p && p.id === plan.id ? { ...p, recommended_quiz_id: ref.id } : p))
        await refresh()
        return ref.id
      }
      // No plan in hand (topic has no remediation yet) — the quiz is still
      // useful on its own, so behave as before and open the builder.
      navigate(`/teacher/classes/${classId}/quizzes/${ref.id}`)
      return ref.id
    } catch (err) {
      setError(err.message)
      return null
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
        <h1 className="text-[clamp(26px,3.5vw,32px)]" style={{ ...serif, lineHeight: 1.1, letterSpacing: '-0.01em', margin: '0 0 4px', color: ink }}>
          Scaffold Topics
        </h1>
        <p style={{ fontSize: 13.5, color: muted, margin: 0, maxWidth: 640 }}>
          Per-topic mastery across the class, computed from quiz attempts on syllabus-linked quizzes. Weak topics get a one-click remediation quiz.
        </p>
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
  const allRows = data.rows
  const rows = focusName ? allRows.filter((r) => (r.affectedIds ?? []).includes(focusId)) : allRows
  const { topicCount, linkedQuizzes } = data
  const focusBanner = focusName && (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3" style={{ background: 'rgba(245,197,24,0.1)', border: '1px solid rgba(245,197,24,0.4)', borderRadius: 12, padding: '10px 14px' }}>
      <span style={{ fontSize: 13.5, color: ink }}>
        Showing the {rows.length} topic{rows.length === 1 ? '' : 's'} where <strong>{focusName}</strong> is below mastery
        {rows.length === 0 && allRows.length > 0 ? ' — none; this student is at or above mastery on every tracked topic' : ''}.
      </span>
      <button onClick={() => setSearchParams({})} style={{ fontSize: 12.5, fontWeight: 700, color: navy, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
        Show all topics
      </button>
    </div>
  )
  const needs = rows.filter((r) => bucketOf(r.mastery) === 'needs').sort((a, b) => a.mastery - b.mastery)
  const developing = rows.filter((r) => bucketOf(r.mastery) === 'developing').sort((a, b) => a.mastery - b.mastery)
  const mastered = rows.filter((r) => bucketOf(r.mastery) === 'mastered').sort((a, b) => b.mastery - a.mastery)

  if (rows.length === 0 && allRows.length > 0) {
    return (
      <div>
        {header}
        {focusBanner}
      </div>
    )
  }
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

      {/* remediation plans — the edit/publish surface */}
      <RemediationPanel
        plans={data.remediation?.plans ?? []}
        legacy={data.remediation?.legacy ?? []}
        nameById={data.nameById ?? {}}
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
            confirmLabel: 'Delete plan',
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

      {editingPlan && (
        <RemediationEditor
          plan={editingPlan}
          nameById={data.nameById ?? {}}
          rosterIds={data.rosterIds ?? []}
          busy={busy}
          onClose={() => setEditingPlan(null)}
          onSave={async (patch) => {
            const ok = await runPlanAction(editingPlan, 'save', () =>
              updateRemediationPlan(editingPlan.id, patch),
            )
            if (ok) setEditingPlan(null)
          }}
          onSaveAndPublish={async (patch) => {
            const merged = { ...editingPlan, ...patch }
            const ok = await runPlanAction(editingPlan, 'publish', async () => {
              await updateRemediationPlan(editingPlan.id, patch)
              await publishRemediation(merged)
            })
            if (ok) setEditingPlan(null)
          }}
          onGenerateQuiz={() =>
            buildPack({ id: editingPlan.topic_id, title: editingPlan.topic }, editingPlan)
          }
        />
      )}

      {/* mastered */}
      {mastered.length > 0 && (
        <div>
          <SectionHead dot={green} title="Mastered" note={`${mastered.length} topic${mastered.length === 1 ? '' : 's'} · on track`} />
          <div className="overflow-x-auto" style={{ background: '#FFFFFF', border: `1px solid ${line}`, borderRadius: 16 }}>
            {mastered.map((t) => (
              <div key={t.id} className="grid items-center gap-4 min-w-[640px]" style={{ gridTemplateColumns: '1fr 180px 80px 140px', padding: '14px 22px', borderBottom: '1px solid rgba(14,42,92,0.05)' }}>
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
