import { useState, useRef, useEffect } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { doc, getDoc, collection, getDocs, query, where, setDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { useAuth } from '@/context/useAuth'
import { fetchUsersByIds } from '@/lib/roster'
import { loadStudentEntry, loadStudentAttendance, loadSyllabus, loadStudentContests, loadStudentGradeContests } from '@/lib/studentData'
import { BookOpen, ClipboardList, CalendarCheck, Megaphone, FileText, BarChart, Check, Clock, X } from '@/components/icons'
import { navy, ink, gold, goldDeep, muted, faint, green, blueText, red, line, serif, mono } from '@/theme'
import { attemptsAllowedFor, attemptsLabel, finishedAttempts, openAttempt } from '@/lib/quizAttempts'
import { BUCKETS, RESOURCE_META, assignedToStudent, isRemediationQuiz, quizzesForTopic, resourceState, topicAnchorId, topicMastery } from '../../scaffolding'
import { formatGrade, gradeColor, isPointScale, passNote } from '../../gradeDisplay'
import ClassStandingForecast from '@/components/ClassStandingForecast'
import AttachmentField from '@/components/AttachmentField'
import { useDialogBehavior } from '@/components/ui/useDialogBehavior'
import { MetricCard } from '@/components/ui/Card'
import { formatSchedule } from '@/lib/schedule'
import { KIND_LABEL, describeWindow, fromQuiz, fromTask } from '@/lib/deliverables'
import { describeSubmission, isLate, submissionFilePath, submitWork } from '@/lib/taskSubmissions'
import { studentDeliverablesKey } from '@/hooks/useStudentDeliverables'
import { SUBMISSION_NOTE_MAX } from '@/lib/validation'
import Markdown from '@/components/Markdown'
import { WindowChip, toneOf } from '../../deliverables/WindowChip'

const ATT_META = {
  present: { label: 'Present', fg: green, bg: 'rgba(31,138,91,0.10)', border: 'rgba(31,138,91,0.4)' },
  late: { label: 'Late', fg: goldDeep, bg: 'rgba(245,197,24,0.18)', border: 'rgba(245,197,24,0.55)' },
  absent: { label: 'Absent', fg: red, bg: 'rgba(192,57,43,0.08)', border: 'rgba(192,57,43,0.38)' },
  excused: { label: 'Excused', fg: blueText, bg: 'rgba(63,169,245,0.12)', border: 'rgba(63,169,245,0.45)' },
}

const TABS = [
  { key: 'announcements', label: 'Announcements', Icon: Megaphone },
  { key: 'topics', label: 'Modules', Icon: BookOpen },
  { key: 'analytics', label: 'Analytics', Icon: BarChart },
  { key: 'attendance', label: 'Attendance', Icon: CalendarCheck },
  { key: 'quizzes', label: 'Quizzes', Icon: FileText },
  { key: 'grades', label: 'Grade Center', Icon: ClipboardList },
]

const quizPoints = (quiz) => (quiz.questions ?? []).reduce((s, q) => s + (Number(q.points) || 0), 0)


async function loadClassDetail(classId, profile) {
  const classSnap = await getDoc(doc(db, 'classes', classId))
  if (!classSnap.exists()) throw new Error('Class not found')
  const clazz = { id: classSnap.id, ...classSnap.data() }

  // Authorization mirror of the security rule: a student may only open a class
  // they are enrolled in.
  if (!(clazz.student_ids ?? []).includes(profile.id)) {
    throw new Error('not_enrolled')
  }

  const [entry, attendance, contestsByDate, gradeContestsByAssessment, syllabus, announcementsSnap, teachers, quizzesSnap, attemptsSnap, remSnap, tasksSnap, submissionsSnap] =
    await Promise.all([
      loadStudentEntry(classId, profile.id),
      loadStudentAttendance(classId, profile.id),
      loadStudentContests(classId, profile.id),
      loadStudentGradeContests(classId, profile.id),
      loadSyllabus(classId),
      getDocs(query(collection(db, 'announcements'), where('class_id', '==', classId))),
      clazz.teacher_id ? fetchUsersByIds([clazz.teacher_id]).catch(() => []) : Promise.resolve([]),
      getDocs(query(collection(db, 'quizzes'), where('class_ids', 'array-contains', classId))),
      getDocs(query(collection(db, 'quiz_attempts'), where('student_id', '==', profile.id))),
      // Same query the Remediation page runs, filtered to this class below. It
      // only marks which sub-modules have a review guide; if it fails, the
      // Modules tab loses the markers and nothing else.
      getDocs(query(collection(db, 'remediations'), where('student_id', '==', profile.id))).catch(() => null),
      // This class's published tasks (activities, assignments, paper exams).
      // Both filters are what the student branch of the class_tasks rule
      // reads; without `status` the whole query is refused. Its own catch:
      // a refused read costs the Modules tab its task rows, not the page.
      getDocs(query(collection(db, 'class_tasks'), where('class_id', '==', classId), where('status', '==', 'published')))
        .catch((err) => { console.error('Class tasks did not load', err); return null }),
      // This student's own hand-ins (the submission bin): the one shape the
      // task_submissions rule lets a student read. A failed read means every
      // task reads as not yet handed in; the page still shows.
      getDocs(query(collection(db, 'task_submissions'), where('student_id', '==', profile.id)))
        .catch((err) => { console.error('Task submissions did not load', err); return null }),
    ])

  const teacher = teachers[0] ?? null
  const announcements = announcementsSnap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (b.created_at?.seconds ?? 0) - (a.created_at?.seconds ?? 0))

  // Students see only published/closed quizzes (never drafts).
  const quizzes = quizzesSnap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((q) => (q.status === 'published' || q.status === 'closed') && assignedToStudent(q, profile.id))
    .sort((a, b) => (b.created_at?.seconds ?? 0) - (a.created_at?.seconds ?? 0))
  const attemptsByQuiz = {}
  attemptsSnap.docs.forEach((d) => {
    const a = { id: d.id, ...d.data() }
    if (a.class_id !== classId) return
    ;(attemptsByQuiz[a.quiz_id] ??= []).push(a)
  })
  for (const list of Object.values(attemptsByQuiz)) {
    list.sort((a, b) => (b.submitted_at?.seconds ?? 0) - (a.submitted_at?.seconds ?? 0))
  }

  // Topic ids this student has a review guide for in this class.
  const scaffoldedTopicIds = new Set(
    (remSnap?.docs ?? [])
      .map((d) => d.data())
      .filter((r) => r.class_id === classId && r.topic_id)
      .map((r) => r.topic_id),
  )

  const tasks = (tasksSnap?.docs ?? [])
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((t) => t.status === 'published')
  const submissionByTask = {}
  ;(submissionsSnap?.docs ?? []).forEach((d) => {
    const sub = { id: d.id, ...d.data() }
    if (sub.class_id === classId) submissionByTask[sub.task_id] = sub
  })

  return {
    clazz,
    teacher,
    entry,
    attendance,
    contestsByDate,
    gradeContestsByAssessment,
    syllabus,
    announcements,
    quizzes,
    attemptsByQuiz,
    scaffoldedTopicIds,
    tasks,
    submissionByTask,
  }
}

function Pill({ meta }) {
  return (
    <span style={{ display: 'inline-block', padding: '3px 10px', fontSize: 11.5, fontWeight: 700, borderRadius: 999, color: meta.fg, background: meta.bg, border: `1px solid ${meta.border}`, whiteSpace: 'nowrap' }}>
      {meta.label}
    </span>
  )
}

/**
 * One class task -- an activity, assignment or paper exam -- under the
 * sub-module it was published to. Nothing is submitted through the app, so
 * the row has no button of its own: it says what the task is, when it is
 * due, and hands over the template or link the teacher attached, drawn with
 * the same RESOURCE_META rows a material uses. The instructions open in the
 * lesson-note dialog, rendered as Markdown.
 */
function TaskRow({ task, onReadInstructions, classId = '', studentId = '', onSubmitted }) {
  const attachments = (task.attachments ?? []).filter((a) => a?.url)
  // The bin shows when the teacher opened it, or when this student already
  // handed in (then read-only if it has since closed). Never otherwise.
  const showBin = task.acceptsSubmissions || !!task.submission
  return (
    <div className="flex flex-col gap-2.5 p-3 rounded-xl border border-amber-100 bg-amber-50/30 w-full sm:col-span-2" data-task-id={task.id}>
      <div className="flex items-start gap-3">
        <span className="text-lg bg-white w-9 h-9 rounded-lg border border-amber-100 flex items-center justify-center shadow-sm flex-shrink-0">📋</span>
        <div className="min-w-0 flex-1">
          <div className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: goldDeep }}>
            {KIND_LABEL[task.kind]}{task.points != null ? ` · ${task.points} pts` : ''}
          </div>
          <div className="text-sm font-bold text-slate-800" title={task.title}>{task.title}</div>
          <div className="flex flex-wrap items-center gap-2" style={{ marginTop: 5 }}>
            <WindowChip item={task} />
            {task.instructions?.trim() && (
              <button
                type="button"
                onClick={onReadInstructions}
                style={{ fontSize: 11.5, fontWeight: 700, color: navy, background: 'transparent', border: 'none', padding: 0, cursor: 'pointer', textDecoration: 'underline' }}
              >
                Read instructions
              </button>
            )}
          </div>
        </div>
      </div>
      {attachments.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pl-12">
          {attachments.map((att, i) => {
            const meta = RESOURCE_META[att.resource_type] ?? RESOURCE_META.file
            return (
              <button
                key={i}
                type="button"
                onClick={() => window.open(att.url, '_blank', 'noopener,noreferrer')}
                className="flex items-center gap-3 p-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-left transition w-full cursor-pointer"
              >
                <span className="text-base bg-slate-50 w-8 h-8 rounded-lg border border-slate-200 flex items-center justify-center flex-shrink-0">{meta.icon}</span>
                <div className="min-w-0 flex-1">
                  <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">{meta.label}</div>
                  <div className="text-[13px] font-bold text-slate-800 truncate" title={att.title}>{att.title || meta.label}</div>
                </div>
              </button>
            )
          })}
        </div>
      )}
      {showBin && (
        <SubmitBox task={task} classId={classId} studentId={studentId} onSubmitted={onSubmitted} />
      )}
    </div>
  )
}

/**
 * The submission bin, student side (plan section 9). One file or one link,
 * an optional note, Submit. After it lands the box reads Submitted · when
 * (late per isLate) with the work shown and a Replace that re-submits while
 * the task still accepts submissions; once the teacher closes the bin a
 * submission shows read-only with "Submissions are closed". Files go to
 * task_files/{classId}/{taskId}/submissions/{uid}/ through the same
 * AttachmentField materials use, so the size cap and the wording are the
 * ones a student has already met. Nothing is graded here.
 */
function SubmitBox({ task, classId, studentId, onSubmitted }) {
  const existing = task.submission ?? null
  const open = task.acceptsSubmissions
  const [editing, setEditing] = useState(!existing)
  const [attachment, setAttachment] = useState(null)
  const [note, setNote] = useState(existing?.note ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const taskDoc = { due_at: task.dueAt ? toWindowString(task.dueAt) : null }

  async function submit() {
    setError('')
    if (!attachment) { setError('Attach your work first — upload a file or paste a link.'); return }
    setBusy(true)
    try {
      await submitWork({ taskId: task.id, classId, studentId, attachment, note, existing })
      setEditing(false)
      setAttachment(null)
      onSubmitted?.()
    } catch (err) {
      // A rule refusal or a dropped connection reads the same to the
      // student; the reason goes to the console for whoever is asked.
      console.error('submission failed', err)
      setError(/too long|web address|Attach|Paste|uploading/.test(err.message) ? err.message : 'Your work could not be submitted. Check your connection and try again, or paste a link instead.')
    } finally {
      setBusy(false)
    }
  }

  const meta = existing ? (RESOURCE_META[existing.attachment?.resource_type] ?? RESOURCE_META.file) : null

  return (
    <div className="pl-12" data-testid="submit-box" data-state={!open ? 'closed' : existing && !editing ? 'submitted' : 'editing'}>
      <div className="rounded-xl border border-slate-200 bg-white p-3 flex flex-col gap-2.5">
        {existing && (
          <div className="flex flex-wrap items-center gap-2" style={{ fontSize: 12.5 }}>
            <span style={{ fontWeight: 700, color: isLate(existing, taskDoc) ? red : green }}>{describeSubmission(existing, taskDoc)}</span>
            {existing.attachment?.url && (
              <a href={existing.attachment.url} target="_blank" rel="noopener noreferrer" style={{ color: blueText, fontWeight: 600 }}>
                {meta.icon} {existing.attachment.title || meta.label}
              </a>
            )}
            {existing.note && <span style={{ color: muted, fontStyle: 'italic' }}>“{existing.note}”</span>}
            {open && !editing && (
              <button type="button" onClick={() => setEditing(true)} style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 700, color: navy, background: 'transparent', border: `1.5px solid ${line}`, borderRadius: 8, padding: '4px 10px', cursor: 'pointer' }}>
                Replace
              </button>
            )}
          </div>
        )}
        {!open && (
          <p style={{ fontSize: 12, color: faint, margin: 0 }}>
            {existing ? 'Submissions are closed. Your work above is what the teacher has.' : 'Submissions are closed.'}
          </p>
        )}
        {open && editing && (
          <>
            {!existing && (
              <p style={{ fontSize: 12.5, color: ink, margin: 0, fontWeight: 600 }}>Hand in your work</p>
            )}
            <AttachmentField
              compact
              label={attachment ? `Attached: ${attachment.title}` : 'Your work — a file or a link'}
              storagePath={submissionFilePath(classId, task.id, studentId, '').replace(/\/$/, '')}
              onAttached={(url, info) => setAttachment({ title: info?.name ?? url, resource_type: info?.kind === 'link' ? 'link' : 'file', url })}
            />
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={SUBMISSION_NOTE_MAX}
              rows={2}
              placeholder="A note for your teacher (optional)"
              style={{ width: '100%', padding: '8px 10px', fontSize: 13, color: ink, border: `1.5px solid rgba(14,42,92,0.14)`, borderRadius: 9, resize: 'vertical' }}
            />
            {error && (
              <p role="alert" style={{ fontSize: 12.5, color: red, margin: 0 }}>{error}</p>
            )}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={submit}
                disabled={busy}
                className="transition hover:brightness-110 disabled:opacity-50"
                style={{ padding: '8px 16px', fontSize: 13, fontWeight: 700, color: '#FAFAF6', background: navy, border: 'none', borderRadius: 9, cursor: 'pointer' }}
              >
                {busy ? 'Submitting…' : existing ? 'Submit replacement' : 'Submit'}
              </button>
              {existing && (
                <button type="button" onClick={() => { setEditing(false); setError(''); setAttachment(null) }} disabled={busy} style={{ fontSize: 12.5, fontWeight: 600, color: muted, background: 'transparent', border: 'none', cursor: 'pointer' }}>
                  Keep what I submitted
                </button>
              )}
              <span style={{ fontSize: 11.5, color: faint, marginLeft: 'auto' }}>
                {existing ? 'Replacing overwrites your earlier submission.' : 'You can replace it until the teacher closes submissions.'}
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

/* fromTask parsed the deadline into a Date; isLate / describeSubmission read
   the document's zone-less string, so it is put back the way the task
   document stores it. */
function toWindowString(date) {
  const p = (n) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}T${p(date.getHours())}:${p(date.getMinutes())}`
}

function TopicsTab({ syllabus, classId, quizzes = [], attemptsByQuiz = {}, tasks = [], submissionByTask = {}, onSubmitted, scaffoldedTopicIds, focusTopicId = null }) {
  // Needed for the per-student attempt grant below, and for the submission bin.
  const { profile } = useAuth()
  const queryClient = useQueryClient()
  const afterSubmit = () => {
    onSubmitted?.()
    // The dashboard's Up next reads the same rows; a task just handed in
    // should read Submitted there too, not on the next reload.
    queryClient.invalidateQueries({ queryKey: studentDeliverablesKey(profile?.id) })
  }
  const [activeNote, setActiveNote] = useState(null)
  const { overlayProps: noteOverlay, panelProps: notePanel } =
    useDialogBehavior(() => setActiveNote(null), { open: !!activeNote, label: 'Lesson note' })

  // A link from a review guide lands on one sub-module: scroll to it and hold
  // a highlight on it for a moment, so the student sees which one they were
  // sent to rather than a page of modules that all look the same.
  const [highlighted, setHighlighted] = useState(null)
  useEffect(() => {
    if (!focusTopicId) return undefined
    const el = document.getElementById(topicAnchorId(focusTopicId))
    if (!el) return undefined
    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    setHighlighted(focusTopicId)
    const timer = setTimeout(() => setHighlighted(null), 3500)
    return () => clearTimeout(timer)
  }, [focusTopicId])

  if (!syllabus || !(syllabus.modules?.length)) {
    return <Empty icon={<BookOpen className="h-6 w-6" />} title="No modules yet" text="Your teacher hasn't published the modules and sub-modules for this class." />
  }

  return (
    <div className="flex flex-col gap-6">
      {syllabus.modules.map((m, mi) => (
        <div key={m.id ?? mi} style={{ background: '#FFFFFF', border: `1px solid ${line}`, borderRadius: 16, padding: 20 }}>
          <div className="flex items-center gap-3 border-b border-slate-100 pb-4 mb-4">
            <span style={{ ...mono, fontSize: 11, fontWeight: 700, color: navy, background: 'rgba(14,42,92,0.07)', padding: '4px 9px', borderRadius: 7 }}>M{mi + 1}</span>
            <div>
              <div style={{ fontSize: 16, fontWeight: 700, color: ink }}>{m.title || `Module ${mi + 1}`}</div>
              {m.description && <div style={{ fontSize: 13.5, color: muted, marginTop: 2, whiteSpace: 'pre-wrap' }}>{m.description}</div>}
            </div>
          </div>
          <div className="flex flex-col gap-6 pl-2">
            {(m.topics ?? []).map((t, ti) => {
              const linkedQuizzes = quizzesForTopic(t.id, quizzes)
              // The class's published tasks under this sub-module, in the
              // shape the dashboard renders, so the chip reads the same here.
              const linkedTasks = t.id ? tasks.filter((task) => task.topic_id === t.id).map((task) => fromTask(task, { submission: submissionByTask[task.id] ?? null })) : []
              const resources = t.resources ?? []
              // Derived from this student's own best attempt, so it moves the
              // moment they finish a quiz linked to this topic.
              const mastery = topicMastery(t.id, quizzes, attemptsByQuiz)
              const bucket = BUCKETS[mastery.bucket]
              const scaffolded = !!t.id && scaffoldedTopicIds?.has(t.id)
              const isFocus = !!t.id && highlighted === t.id

              return (
                <div
                  key={t.id ?? ti}
                  id={t.id ? topicAnchorId(t.id) : undefined}
                  className="border-l-2 pl-4 relative transition-colors duration-700"
                  style={{
                    borderColor: isFocus ? gold : 'rgb(226 232 240)',
                    background: isFocus ? 'rgba(245,197,24,0.10)' : 'transparent',
                    borderRadius: isFocus ? '0 12px 12px 0' : 0,
                    marginRight: isFocus ? -8 : 0,
                    paddingRight: isFocus ? 8 : 0,
                    paddingTop: isFocus ? 6 : 0,
                    paddingBottom: isFocus ? 6 : 0,
                    scrollMarginTop: 96,
                  }}
                >
                  <div className="absolute -left-[5px] top-1.5 w-2.5 h-2.5 rounded-full" style={{ background: isFocus ? gold : 'rgb(203 213 225)' }} />
                  <div className="flex flex-wrap items-center gap-2">
                    <div style={{ fontSize: 14, fontWeight: 600, color: ink }}>{t.title || `Sub-module ${ti + 1}`}</div>
                    {scaffolded && (
                      /* The other direction of the same link: a student reading
                         the modules sees which sub-module has a review guide
                         waiting for them, and can go straight to it. */
                      <Link
                        to="/student/remediation"
                        title="Your teacher published a review guide for this sub-module."
                        style={{
                          display: 'inline-flex', alignItems: 'center', gap: 5, flexShrink: 0,
                          fontSize: 11, fontWeight: 700, borderRadius: 999, padding: '3px 10px', textDecoration: 'none',
                          color: goldDeep, background: 'rgba(245,197,24,0.18)', border: '1px solid rgba(245,197,24,0.5)',
                        }}
                      >
                        Review guide →
                      </Link>
                    )}
                    {linkedQuizzes.length > 0 && (
                      <span
                        title={mastery.pct == null
                          ? 'Take a quiz on this topic to see your mastery.'
                          : `Your best result across ${mastery.attempts} attempt${mastery.attempts === 1 ? '' : 's'} on this topic.`}
                        style={{
                          display: 'inline-flex', alignItems: 'center', gap: 6, flexShrink: 0,
                          fontSize: 11, fontWeight: 700, borderRadius: 999, padding: '3px 10px',
                          color: bucket.fg, background: bucket.bg, border: `1px solid ${bucket.border}`,
                        }}
                      >
                        {mastery.pct == null ? bucket.label : `${bucket.label} · ${mastery.pct}%`}
                      </span>
                    )}
                  </div>

                  {linkedQuizzes.length > 0 && mastery.pct != null && (
                    <div style={{ height: 6, borderRadius: 999, background: 'rgba(14,42,92,0.07)', overflow: 'hidden', marginTop: 7, maxWidth: 260 }}>
                      <div style={{ height: '100%', width: `${Math.min(100, mastery.pct)}%`, background: bucket.fg, borderRadius: 999, transition: 'width 0.6s' }} />
                    </div>
                  )}
                  
                  {(t.learning_objectives ?? t.objectives ?? []).length > 0 && (
                    <div className="mt-2.5">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Learning Objectives</span>
                      <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {(t.learning_objectives ?? t.objectives).map((o, oi) => (
                          <li key={oi} style={{ display: 'flex', gap: 7, fontSize: 12.5, color: muted }}>
                            <Check className="h-3.5 w-3.5" style={{ color: green, flexShrink: 0, marginTop: 2 }} />
                            {o}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {(resources.length > 0 || linkedQuizzes.length > 0 || linkedTasks.length > 0) && (
                    <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {resources.map((res) => {
                        const meta = RESOURCE_META[res.resource_type] ?? RESOURCE_META.file
                        const state = resourceState(res)

                        /* Storage is off, so a file resource has no object to
                           fetch. Rendering it as a dead button would look like a
                           bug; this says what happened and what to do. */
                        if (!state.available) {
                          return (
                            <div
                              key={res.id ?? res._key}
                              className="flex items-start gap-3 p-3 rounded-xl border border-dashed border-slate-300 bg-slate-50/40 w-full"
                            >
                              <span className="text-lg bg-white w-9 h-9 rounded-lg border border-slate-200 flex items-center justify-center flex-shrink-0 opacity-45">
                                {meta.icon}
                              </span>
                              <div className="min-w-0 flex-1">
                                <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">{meta.label} · unavailable</div>
                                <div className="text-sm font-bold text-slate-500 truncate" title={res.title}>{res.title}</div>
                                <div className="text-[11px] text-slate-400 mt-1 leading-snug">{state.reason}</div>
                              </div>
                            </div>
                          )
                        }

                        const open = res.resource_type === 'rich_text'
                          ? () => setActiveNote(res)
                          : () => window.open(res.url, '_blank', 'noopener,noreferrer')

                        return (
                          <button
                            key={res.id ?? res._key}
                            onClick={open}
                            className="flex items-center gap-3 p-3 rounded-xl border border-slate-200 bg-slate-50/50 hover:bg-slate-50 text-left transition w-full cursor-pointer"
                          >
                            <span className="text-lg bg-white w-9 h-9 rounded-lg border border-slate-200 flex items-center justify-center shadow-sm flex-shrink-0">
                              {meta.icon}
                            </span>
                            <div className="min-w-0 flex-1">
                              <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">{meta.label}</div>
                              <div className="text-sm font-bold text-slate-800 truncate" title={res.title}>{res.title}</div>
                            </div>
                          </button>
                        )
                      })}

                      {linkedQuizzes.map((quiz) => {
                        const attempts = attemptsByQuiz[quiz.id] ?? []
                        /* An attempt that is still open is not a used one. It
                           used to be counted here, so a student who pressed
                           Start and came back found the quiz greyed out with
                           their attempt still running — locked out of the
                           sitting they were in. */
                        const finished = finishedAttempts(attempts)
                        const live = openAttempt(attempts)
                        const latest = finished[finished.length - 1] ?? null
                        const allowed = attemptsAllowedFor(quiz, profile.id)
                        const used = finished.length
                        const points = quizPoints(quiz)
                        const canTake = quiz.status === 'published' && (live || used < allowed)
                        const scored = finished
                          .map((a) => a.total_score)
                          .filter((v) => v != null)
                        const best = scored.length ? Math.max(...scored) : null
                        const window = fromQuiz(quiz, { classId, attempts })

                        let statusText = 'Not taken'
                        if (live) {
                          statusText = 'In progress — carry on'
                        } else if (best != null) {
                          statusText = `Best: ${best}/${quiz.total_possible ?? points} pts`
                        }

                        return (
                          <div
                            key={quiz.id}
                            className="flex items-center justify-between gap-3 p-3 rounded-xl border border-indigo-100 bg-indigo-50/20 text-left w-full"
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <span className="text-lg bg-white w-9 h-9 rounded-lg border border-indigo-100 flex items-center justify-center shadow-sm flex-shrink-0 text-indigo-600">
                                📝
                              </span>
                              <div className="min-w-0">
                                <div className="text-[10px] font-semibold text-indigo-500 uppercase tracking-wider">
                                  {isRemediationQuiz(quiz) ? 'Mastery test' : 'Quiz'} · {statusText}
                                </div>
                                <div className="text-sm font-bold text-slate-800 truncate" title={quiz.title}>{quiz.title}</div>
                                <div style={{ marginTop: 5 }}><WindowChip item={window} /></div>
                              </div>
                            </div>
                            <div>
                              {canTake ? (
                                <Link
                                  to={`/student/classes/${classId}/quizzes/${quiz.id}`}
                                  className="text-xs font-bold bg-indigo-600 text-white px-2.5 py-1.5 rounded-lg hover:bg-indigo-700 transition"
                                  style={{ textDecoration: 'none', display: 'inline-block' }}
                                >
                                  {used > 0 ? 'Retake' : 'Take'}
                                </Link>
                              ) : latest ? (
                                <Link
                                  to={`/student/quizzes/${latest.id}/result`}
                                  className="text-xs font-bold border border-indigo-200 text-indigo-700 bg-white px-2.5 py-1.5 rounded-lg hover:bg-indigo-50 transition"
                                  style={{ textDecoration: 'none', display: 'inline-block' }}
                                >
                                  Result
                                </Link>
                              ) : (
                                <span className="text-xs text-slate-400">Closed</span>
                              )}
                            </div>
                          </div>
                        )
                      })}

                      {linkedTasks.map((task) => (
                        <TaskRow
                          key={task.id}
                          task={task}
                          classId={classId}
                          studentId={profile?.id}
                          onSubmitted={afterSubmit}
                          onReadInstructions={() => setActiveNote({ title: task.title, content_markdown: task.instructions, markdown: true })}
                        />
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      ))}

      {/* Note view modal */}
      {activeNote && (
        <div {...noteOverlay} style={{ position: 'fixed', inset: 0, background: 'rgba(14,23,51,0.55)', backdropFilter: 'blur(3px)', WebkitBackdropFilter: 'blur(3px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 24 }}>
          <div {...notePanel} style={{ width: '100%', maxWidth: 600, background: '#FFFFFF', borderRadius: 18, boxShadow: '0 40px 80px -20px rgba(14,42,92,0.45)', overflow: 'hidden' }}>
            <div className="flex items-center justify-between" style={{ padding: '20px 24px 16px', borderBottom: `1px solid ${line}` }}>
              <div className="flex items-center gap-2">
                <span className="text-xl">{activeNote.markdown ? '📋' : '✍️'}</span>
                <h3 style={{ ...serif, fontSize: 20, color: ink, margin: 0 }}>{activeNote.title}</h3>
              </div>
              <button onClick={() => setActiveNote(null)} aria-label="Close" style={{ width: 30, height: 30, borderRadius: 8, border: 'none', background: 'transparent', color: faint, cursor: 'pointer', display: 'grid', placeItems: 'center' }}>
                <X className="h-4 w-4" />
              </button>
            </div>
            <div style={{ padding: '24px', maxHeight: '60vh', overflowY: 'auto' }}>
              {activeNote.markdown ? (
                <Markdown text={activeNote.content_markdown} />
              ) : (
                <div className="text-slate-700 text-sm leading-relaxed whitespace-pre-wrap font-sans">
                  {activeNote.content_markdown}
                </div>
              )}
            </div>
            <div className="flex justify-end gap-3" style={{ padding: '14px 24px', borderTop: `1px solid ${line}`, background: 'rgba(14,42,92,0.02)' }}>
              <button onClick={() => setActiveNote(null)} style={{ padding: '8px 16px', fontSize: 13.5, fontWeight: 600, color: '#3A4A6B', background: '#FFFFFF', border: '1.5px solid rgba(14,42,92,0.14)', borderRadius: 10, cursor: 'pointer' }}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/* Student's own component percentage (mirrors the teacher gradebook math:
   graded → earned+possible, missing → possible only, excused/pending excluded). */
function studentComponentPercent(asmts) {
  let earned = 0
  let possible = 0
  for (const a of asmts) {
    if (a.status === 'graded' && a.raw_score != null) {
      earned += a.raw_score
      possible += a.total_points
    } else if (a.status === 'missing') {
      possible += a.total_points
    }
  }
  return possible ? Math.round((earned / possible) * 1000) / 10 : null
}

function ScoreCell({ a }) {
  if (a.status === 'graded' && a.raw_score != null) {
    const ratio = a.total_points ? a.raw_score / a.total_points : 0
    return (
      <span style={{ fontWeight: 700, color: ratio < 0.6 ? red : ink }}>
        {a.raw_score}
        <span style={{ color: faint, fontWeight: 400 }}>/{a.total_points}</span>
      </span>
    )
  }
  if (a.status === 'missing') return <span style={{ color: red, fontWeight: 700 }}>Missing</span>
  if (a.status === 'excused') return <Pill meta={ATT_META.excused} />
  return <span style={{ color: faint }}>—</span>
}

function ContestCellGrade({ contest, onContest }) {
  if (contest) {
    const tone = CONTEST_TONE[contest.status] ?? CONTEST_TONE.pending
    return (
      <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
        <span style={{ display: 'inline-block', padding: '3px 10px', fontSize: 10.5, fontWeight: 700, borderRadius: 999, color: tone.fg, background: tone.bg, border: `1px solid ${tone.border}`, whiteSpace: 'nowrap' }}>
          {tone.label}
        </span>
        {contest.excuse_url && (
          <a href={contest.excuse_url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, fontWeight: 600, color: blueText }}>
            View document
          </a>
        )}
        {contest.status === 'rejected' && contest.resolution_note && (
          <span style={{ fontSize: 10.5, color: faint, maxWidth: 150, textAlign: 'right', lineHeight: 1.35 }}>{contest.resolution_note}</span>
        )}
      </div>
    )
  }
  if (!onContest) return null
  return (
    <button onClick={onContest} className="transition hover:bg-slate-50" style={{ padding: '4px 9px', fontSize: 11.5, fontWeight: 700, color: navy, background: '#FFFFFF', border: '1.5px solid rgba(14,42,92,0.16)', borderRadius: 8, cursor: 'pointer', whiteSpace: 'nowrap' }}>
      Contest
    </button>
  )
}

function GradeContestModal({ classId, studentId, studentName, assessment, onClose, onSubmitted }) {
  const { overlayProps, panelProps } = useDialogBehavior(onClose, { label: 'Contest a score', closeOnBackdrop: false })
  const [reason, setReason] = useState('')
  const [excuseUrl, setExcuseUrl] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  async function submit() {
    if (!reason.trim()) {
      setError('Please explain why you are contesting this score.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      await setDoc(doc(db, 'grade_contests', `${classId}_${assessment.id}_${studentId}`), {
        class_id: classId,
        student_id: studentId,
        student_name: studentName ?? null,
        assessment_id: assessment.id,
        assessment_title: assessment.title,
        period_id: assessment.period_id ?? null,
        component_id: assessment.component_id ?? null,
        current_score: assessment.status === 'graded' ? assessment.raw_score : null,
        total_points: assessment.total_points ?? null,
        reason: reason.trim(),
        excuse_url: excuseUrl,
        status: 'pending',
        created_at: serverTimestamp(),
      })
      onSubmitted()
    } catch (err) {
      setError(err.message || 'Could not submit your contest.')
      setBusy(false)
    }
  }

  const scoreText = assessment.status === 'graded' ? `${assessment.raw_score}/${assessment.total_points}` : assessment.status
  return (
    <div {...overlayProps} style={{ position: 'fixed', inset: 0, background: 'rgba(14,23,51,0.55)', backdropFilter: 'blur(3px)', WebkitBackdropFilter: 'blur(3px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 24 }}>
      <div {...panelProps} style={{ width: '100%', maxWidth: 460, background: '#FFFFFF', borderRadius: 18, boxShadow: '0 40px 80px -20px rgba(14,42,92,0.45)', overflow: 'hidden' }}>
        <div className="flex items-center justify-between" style={{ padding: '20px 24px 16px', borderBottom: `1px solid ${line}` }}>
          <h3 style={{ ...serif, fontSize: 22, color: ink, margin: 0 }}>Contest score</h3>
          <button onClick={onClose} aria-label="Close" style={{ width: 30, height: 30, borderRadius: 8, border: 'none', background: 'transparent', color: faint, cursor: 'pointer', display: 'grid', placeItems: 'center' }}>
            <X className="h-4 w-4" />
          </button>
        </div>
        <div style={{ padding: '20px 24px' }}>
          <div className="flex items-center gap-3" style={{ marginBottom: 16, fontSize: 13.5, color: muted, flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 700, color: ink }}>{assessment.title}</span>
            <span>your score</span>
            <span style={{ ...mono, fontWeight: 700, color: ink }}>{scoreText}</span>
          </div>

          <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: ink, marginBottom: 7 }}>
            Reason <span style={{ color: red }}>*</span>
          </label>
          <textarea
            rows={4}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. I believe item 4 was marked wrong, or my essay wasn't graded yet."
            style={{ width: '100%', padding: '11px 13px', fontSize: 14, color: ink, background: '#FFFFFF', border: '1.5px solid rgba(14,42,92,0.14)', borderRadius: 10, resize: 'vertical' }}
          />

          <div style={{ margin: '16px 0 0' }}>
            <AttachmentField
              storagePath={`contest_files/${classId}/${studentId}/${assessment.id}`}
              accept=".pdf,.doc,.docx,image/*"
              onAttached={(url) => setExcuseUrl(url)}
              label="Attach supporting evidence (optional)"
            />
          </div>

          {error && (
            <p role="alert" style={{ fontSize: 13, color: red, background: 'rgba(192,57,43,0.07)', border: '1px solid rgba(192,57,43,0.3)', borderRadius: 10, padding: '10px 12px', marginTop: 14 }}>{error}</p>
          )}
        </div>
        <div className="flex justify-end gap-3" style={{ padding: '14px 24px', borderTop: `1px solid ${line}`, background: 'rgba(14,42,92,0.02)' }}>
          <button onClick={onClose} disabled={busy} style={{ padding: '10px 18px', fontSize: 14, fontWeight: 600, color: '#3A4A6B', background: '#FFFFFF', border: '1.5px solid rgba(14,42,92,0.14)', borderRadius: 10, cursor: 'pointer' }}>
            Cancel
          </button>
          <button onClick={submit} disabled={busy} className="transition hover:brightness-110 disabled:opacity-50" style={{ padding: '10px 20px', fontSize: 14, fontWeight: 700, color: '#FAFAF6', background: navy, border: 'none', borderRadius: 10, cursor: 'pointer' }}>
            {busy ? 'Submitting…' : 'Submit contest'}
          </button>
        </div>
      </div>
    </div>
  )
}

function GradesTab({ entry, classId, studentId, studentName, gradeContestsByAssessment, onContested }) {
  const [contestAsmt, setContestAsmt] = useState(null)
  if (!entry || entry.final_grade == null) {
    return <Empty icon={<ClipboardList className="h-6 w-6" />} title="No grades yet" text="Your grade summary appears here once your teacher records and saves your scores." />
  }
  const components = entry.components ?? []
  const assessments = entry.assessments ?? []
  const hasDetail = components.length > 0 && assessments.length > 0
  const periods = (entry.periods ?? []).filter(
    (p) => p.grade != null || assessments.some((a) => a.period_id === p.id),
  )
  const canContest = (a) => a.status === 'graded' || a.status === 'missing'

  return (
    <div className="flex flex-col gap-4">
      {/* Final grade */}
      <div style={{ background: '#FFFFFF', border: `1px solid ${line}`, borderRadius: 16, padding: '18px 22px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: muted }}>Current grade</div>
          <div style={{ fontSize: 13, color: faint, marginTop: 2 }}>Your latest computed grade for this class · {passNote(entry.mode, entry)}</div>
        </div>
        <div style={{ ...serif, fontSize: 44, lineHeight: 1, color: gradeColor(entry.final_grade, entry.mode, entry) }}>
          {formatGrade(entry.final_grade, entry.mode)}
        </div>
      </div>

      {!hasDetail
        ? periods.map((p) => (
            <div key={p.id} style={{ background: '#FFFFFF', border: `1px solid ${line}`, borderRadius: 16, padding: '16px 20px', display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontWeight: 700, color: ink }}>{p.name}</span>
              <span style={{ fontWeight: 700, color: gradeColor(p.grade, entry.mode, entry) }}>{formatGrade(p.grade, entry.mode)}</span>
            </div>
          ))
        : periods.map((period) => {
            const periodAsmts = assessments.filter((a) => a.period_id === period.id)
            const usedComponents = components.filter((c) => periodAsmts.some((a) => a.component_id === c.id))
            return (
              <div key={period.id} style={{ background: '#FFFFFF', border: `1px solid ${line}`, borderRadius: 16, overflow: 'hidden' }}>
                {/* Period header */}
                <div className="flex items-center justify-between" style={{ padding: '14px 20px', borderBottom: `1px solid ${line}`, background: 'rgba(14,42,92,0.02)' }}>
                  <span style={{ ...serif, fontSize: 18, color: ink }}>{period.name}</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: gradeColor(period.grade, entry.mode, entry) }}>
                    Grade {formatGrade(period.grade, entry.mode)}
                  </span>
                </div>

                {usedComponents.length === 0 ? (
                  <div style={{ padding: '18px 20px', fontSize: 13, color: faint }}>No graded work in this period yet.</div>
                ) : (
                  /* One fixed-layout table per period → score / avg / action columns
                     line up across every component and assessment. */
                  <div className="overflow-x-auto">
                    <table style={{ tableLayout: 'fixed', width: '100%', minWidth: 500, borderCollapse: 'collapse', fontSize: 13 }}>
                      <colgroup>
                        <col />
                        <col style={{ width: 88 }} />
                        <col style={{ width: 76 }} />
                        <col style={{ width: 132 }} />
                      </colgroup>
                      <tbody>
                        {usedComponents.map((c) => {
                          const ca = periodAsmts.filter((a) => a.component_id === c.id)
                          const pct = studentComponentPercent(ca)
                          return [
                            <tr key={`h-${c.id}`} style={{ background: 'rgba(14,42,92,0.012)', borderTop: `1px solid ${line}` }}>
                              <td colSpan={2} style={{ padding: '11px 20px', fontSize: 13.5, fontWeight: 700, color: ink }}>
                                {c.name} <span style={{ color: faint, fontWeight: 500 }}>({c.weight_percent}%)</span>
                              </td>
                              <td style={{ ...mono, padding: '11px 8px', textAlign: 'right', fontSize: 13, fontWeight: 700, color: pct == null ? faint : gradeColor(pct) }}>
                                {pct == null ? '—' : `${pct}%`}
                              </td>
                              <td />
                            </tr>,
                            ...ca.map((a) => (
                              <tr key={a.id} style={{ borderTop: '1px solid rgba(14,42,92,0.05)' }}>
                                <td style={{ padding: '9px 12px 9px 20px', color: ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.title}</td>
                                <td style={{ padding: '9px 8px', textAlign: 'right', whiteSpace: 'nowrap' }}><ScoreCell a={a} /></td>
                                <td style={{ ...mono, padding: '9px 8px', textAlign: 'right', color: faint, fontSize: 12, whiteSpace: 'nowrap' }}>
                                  {a.class_average == null ? '' : `avg ${a.class_average}`}
                                </td>
                                <td style={{ padding: '9px 16px 9px 8px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                                  <ContestCellGrade
                                    contest={gradeContestsByAssessment[a.id]}
                                    onContest={canContest(a) ? () => setContestAsmt(a) : null}
                                  />
                                </td>
                              </tr>
                            )),
                          ]
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )
          })}

      <p style={{ fontSize: 12.5, color: faint, margin: 0 }}>
        Scores in <span style={{ color: red, fontWeight: 700 }}>red</span> are below 60% — focus your review there. “avg” is the class average. Tap <strong style={{ color: ink }}>Contest</strong> to dispute a score.
      </p>

      {contestAsmt && (
        <GradeContestModal
          classId={classId}
          studentId={studentId}
          studentName={studentName}
          assessment={contestAsmt}
          onClose={() => setContestAsmt(null)}
          onSubmitted={() => {
            setContestAsmt(null)
            onContested()
          }}
        />
      )}
    </div>
  )
}

const CONTEST_TONE = {
  pending: { label: 'Contest pending', fg: goldDeep, bg: 'rgba(245,197,24,0.18)', border: 'rgba(245,197,24,0.55)' },
  approved: { label: 'Contest approved', fg: green, bg: 'rgba(31,138,91,0.10)', border: 'rgba(31,138,91,0.4)' },
  rejected: { label: 'Contest rejected', fg: red, bg: 'rgba(192,57,43,0.08)', border: 'rgba(192,57,43,0.38)' },
}

function ContestModal({ classId, studentId, studentName, day, onClose, onSubmitted }) {
  const { overlayProps, panelProps } = useDialogBehavior(onClose, { label: 'Contest an attendance record', closeOnBackdrop: false })
  const [reason, setReason] = useState('')
  const [excuseUrl, setExcuseUrl] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  async function submit() {
    if (!reason.trim()) {
      setError('Please explain why you are contesting this record.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      // Deterministic id → one active dispute per date per student.
      await setDoc(doc(db, 'attendance_contests', `${classId}_${day.date}_${studentId}`), {
        class_id: classId,
        student_id: studentId,
        student_name: studentName ?? null,
        date: day.date,
        current_status: day.status,
        reason: reason.trim(),
        excuse_url: excuseUrl,
        status: 'pending',
        created_at: serverTimestamp(),
      })
      onSubmitted()
    } catch (err) {
      setError(err.message || 'Could not submit your contest.')
      setBusy(false)
    }
  }

  const meta = ATT_META[day.status] ?? ATT_META.absent
  return (
    <div {...overlayProps} style={{ position: 'fixed', inset: 0, background: 'rgba(14,23,51,0.55)', backdropFilter: 'blur(3px)', WebkitBackdropFilter: 'blur(3px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 24 }}>
      <div {...panelProps} style={{ width: '100%', maxWidth: 460, background: '#FFFFFF', borderRadius: 18, boxShadow: '0 40px 80px -20px rgba(14,42,92,0.45)', overflow: 'hidden' }}>
        <div className="flex items-center justify-between" style={{ padding: '20px 24px 16px', borderBottom: `1px solid ${line}` }}>
          <h3 style={{ ...serif, fontSize: 22, color: ink, margin: 0 }}>Contest attendance</h3>
          <button onClick={onClose} aria-label="Close" style={{ width: 30, height: 30, borderRadius: 8, border: 'none', background: 'transparent', color: faint, cursor: 'pointer', display: 'grid', placeItems: 'center' }}>
            <X className="h-4 w-4" />
          </button>
        </div>
        <div style={{ padding: '20px 24px' }}>
          <div className="flex items-center gap-3" style={{ marginBottom: 16, fontSize: 13.5, color: muted }}>
            <span style={{ ...mono, color: ink, fontWeight: 700 }}>{day.date}</span>
            <span>marked as</span>
            <Pill meta={meta} />
          </div>

          <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: ink, marginBottom: 7 }}>
            Reason <span style={{ color: red }}>*</span>
          </label>
          <textarea
            rows={4}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. I attended class that day, or I have a medical certificate for my absence."
            style={{ width: '100%', padding: '11px 13px', fontSize: 14, color: ink, background: '#FFFFFF', border: '1.5px solid rgba(14,42,92,0.14)', borderRadius: 10, resize: 'vertical' }}
          />

          <div style={{ margin: '16px 0 0' }}>
            <AttachmentField
              storagePath={`excuse_letters/${classId}/${studentId}/${day.date}`}
              accept=".pdf,.doc,.docx,image/*"
              onAttached={(url) => setExcuseUrl(url)}
              label="Attach excuse document (optional)"
            />
          </div>

          {error && (
            <p role="alert" style={{ fontSize: 13, color: red, background: 'rgba(192,57,43,0.07)', border: '1px solid rgba(192,57,43,0.3)', borderRadius: 10, padding: '10px 12px', marginTop: 14 }}>{error}</p>
          )}
        </div>
        <div className="flex justify-end gap-3" style={{ padding: '14px 24px', borderTop: `1px solid ${line}`, background: 'rgba(14,42,92,0.02)' }}>
          <button onClick={onClose} disabled={busy} style={{ padding: '10px 18px', fontSize: 14, fontWeight: 600, color: '#3A4A6B', background: '#FFFFFF', border: '1.5px solid rgba(14,42,92,0.14)', borderRadius: 10, cursor: 'pointer' }}>
            Cancel
          </button>
          <button onClick={submit} disabled={busy} className="transition hover:brightness-110 disabled:opacity-50" style={{ padding: '10px 20px', fontSize: 14, fontWeight: 700, color: '#FAFAF6', background: navy, border: 'none', borderRadius: 10, cursor: 'pointer' }}>
            {busy ? 'Submitting…' : 'Submit contest'}
          </button>
        </div>
      </div>
    </div>
  )
}

function AttendanceTab({ attendance, contestsByDate, classId, studentId, studentName, onContested }) {
  const { log, tally, rate } = attendance
  const [contestDay, setContestDay] = useState(null)

  return (
    <div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5" style={{ marginBottom: 18 }}>
        {/* icon-less MetricCards: five across, so the chips would crowd */}
        <MetricCard label="Rate" value={rate == null ? '—' : `${rate}%`} valueColor={blueText} tint="rgba(14,42,92,0.07)" />
        <MetricCard label="Present" value={tally.present} valueColor={green} tint="rgba(31,138,91,0.1)" />
        <MetricCard label="Late" value={tally.late} valueColor={goldDeep} tint="rgba(245,197,24,0.15)" />
        <MetricCard label="Absent" value={tally.absent} valueColor={red} tint="rgba(192,57,43,0.07)" />
        <MetricCard label="Excused" value={tally.excused} valueColor={blueText} tint="rgba(63,169,245,0.13)" />
      </div>

      {log.length === 0 ? (
        <Empty icon={<CalendarCheck className="h-6 w-6" />} title="No attendance recorded" text="Your daily attendance will appear here once your teacher starts marking the sheet." />
      ) : (
        <div style={{ background: '#FFFFFF', border: `1px solid ${line}`, borderRadius: 16, overflow: 'hidden' }}>
          <div className="overflow-x-auto">
            <table className="w-full" style={{ borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: 'rgba(14,42,92,0.03)', borderBottom: '1px solid rgba(14,42,92,0.07)' }}>
                  <th style={thStyle}>Date</th>
                  <th style={thStyle}>Status</th>
                  <th style={thStyle}>Remarks</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>Contest</th>
                </tr>
              </thead>
              <tbody>
                {log.map((d) => {
                  const meta = ATT_META[d.status] ?? ATT_META.absent
                  const contest = contestsByDate[d.date]
                  const tone = contest ? CONTEST_TONE[contest.status] : null
                  return (
                    <tr key={d.date} style={{ borderBottom: '1px solid rgba(14,42,92,0.05)' }}>
                      <td style={{ ...tdStyle, ...mono, color: ink }}>{d.date}</td>
                      <td style={tdStyle}><Pill meta={meta} /></td>
                      <td style={{ ...tdStyle, color: muted }}>{d.remarks || '—'}</td>
                      <td style={{ ...tdStyle, textAlign: 'right' }}>
                        {contest ? (
                          <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                            <span style={{ display: 'inline-block', padding: '3px 10px', fontSize: 11.5, fontWeight: 700, borderRadius: 999, color: tone.fg, background: tone.bg, border: `1px solid ${tone.border}` }}>
                              {tone.label}
                            </span>
                            {contest.excuse_url && (
                              <a href={contest.excuse_url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11.5, fontWeight: 600, color: blueText }}>
                                View document
                              </a>
                            )}
                            {contest.status === 'rejected' && contest.resolution_note && (
                              <span style={{ fontSize: 11, color: faint, maxWidth: 180, textAlign: 'right' }}>{contest.resolution_note}</span>
                            )}
                          </div>
                        ) : (
                          <button
                            onClick={() => setContestDay(d)}
                            className="transition hover:bg-slate-50"
                            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px', fontSize: 12.5, fontWeight: 700, color: navy, background: '#FFFFFF', border: '1.5px solid rgba(14,42,92,0.16)', borderRadius: 9, cursor: 'pointer' }}
                          >
                            <FileText className="h-3.5 w-3.5" /> Contest
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <p style={{ fontSize: 12.5, color: faint, marginTop: 12 }}>
        Disagree with a record? Use <strong style={{ color: ink }}>Contest</strong> to explain and optionally attach an excuse letter — your teacher reviews and resolves it.
      </p>

      {contestDay && (
        <ContestModal
          classId={classId}
          studentId={studentId}
          studentName={studentName}
          day={contestDay}
          onClose={() => setContestDay(null)}
          onSubmitted={() => {
            setContestDay(null)
            onContested()
          }}
        />
      )}
    </div>
  )
}

function QuizzesTab({ classId, quizzes, attemptsByQuiz, studentId }) {
  if (quizzes.length === 0) {
    return <Empty icon={<FileText className="h-6 w-6" />} title="No quizzes yet" text="Quizzes your teacher publishes for this class will show up here." />
  }
  return (
    <div className="flex flex-col gap-3">
      {quizzes.map((quiz) => {
        const attempts = attemptsByQuiz[quiz.id] ?? []
        // An open attempt is not a used one. Counting it showed "Attempts 1/1"
        // and no Take button to the student still sitting it, with a "View
        // result" link to an unfinished attempt. Same rule as the Topics tab
        // and lib/quizAttempts; extra attempts a teacher granted count too.
        const finished = finishedAttempts(attempts)
        const live = openAttempt(attempts)
        const latest = finished[finished.length - 1] ?? null
        const allowed = attemptsAllowedFor(quiz, studentId)
        const used = finished.length
        const points = quizPoints(quiz)
        const canTake = quiz.status === 'published' && (live || used < allowed)
        const scored = finished.map((a) => a.total_score).filter((v) => v != null)
        const best = scored.length ? Math.max(...scored) : null
        // The card's state is the one lib/deliverables derives, so "Not open
        // yet", "Due today" and "Closed" here mean what the dashboard and the
        // player mean. A quiz the player would refuse (not open yet, or
        // closed by date or by hand) shows no Take button; before this a
        // closed-by-date quiz still offered one that led to "Quiz closed".
        const window = fromQuiz(quiz, { classId, attempts })
        // The badge names the state only when the chip does not already open
        // with it: "Not open yet" beside "Opens Mon 15 Sep", but not "Closed"
        // beside "Closed Tue 30 Jun".
        const sentence = describeWindow(window)
        const badgeWord = toneOf(window.state).badge
        const badge = window.state === 'done' || !badgeWord || sentence.startsWith(badgeWord) ? null : badgeWord
        const startable = canTake && window.state !== 'scheduled' && window.state !== 'closed'
        return (
          <div key={quiz.id} data-state={window.state} style={{ background: '#FFFFFF', border: `1px solid ${line}`, borderRadius: 16, padding: 20 }}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div style={{ minWidth: 0 }}>
                <div className="flex flex-wrap items-center gap-2" style={{ marginBottom: 4 }}>
                  <span style={{ fontSize: 16, fontWeight: 700, color: ink }}>{quiz.title}</span>
                  {badge && (
                    <span style={{ fontSize: 10.5, fontWeight: 700, color: toneOf(window.state).fg, background: toneOf(window.state).bg, border: `1px solid ${toneOf(window.state).border}`, borderRadius: 999, padding: '2px 9px' }}>{badge}</span>
                  )}
                  <WindowChip item={window} />
                </div>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1" style={{ ...mono, fontSize: 12, color: muted }}>
                  <span>{(quiz.questions ?? []).length} items</span>
                  <span>{points} pts</span>
                  {quiz.time_limit_minutes && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Clock className="h-3 w-3" />{quiz.time_limit_minutes} min</span>}
                  <span>Attempts {used}/{attemptsLabel(allowed)}</span>
                </div>
                {best != null && (
                  <div style={{ fontSize: 13, color: muted, marginTop: 8 }}>
                    Best score: <strong style={{ color: ink }}>{best}/{quiz.total_possible ?? points}</strong>
                    {latest?.has_essays_pending && <span style={{ color: blueText }}> · essay pending review</span>}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {latest && (
                  <Link
                    to={`/student/quizzes/${latest.id}/result`}
                    style={{ padding: '9px 15px', fontSize: 13, fontWeight: 700, color: navy, background: '#FFFFFF', border: '1.5px solid rgba(14,42,92,0.14)', borderRadius: 10, textDecoration: 'none' }}
                  >
                    View result
                  </Link>
                )}
                {startable ? (
                  <Link
                    to={`/student/classes/${classId}/quizzes/${quiz.id}`}
                    style={{ padding: '9px 16px', fontSize: 13, fontWeight: 700, color: '#FAFAF6', background: navy, borderRadius: 10, textDecoration: 'none' }}
                  >
                    {live ? 'Resume' : used > 0 ? 'Retake' : 'Take quiz'}
                  </Link>
                ) : !latest ? (
                  <span style={{ fontSize: 12.5, color: faint }}>
                    {window.state === 'scheduled' ? 'Opens later' : window.state === 'closed' ? 'Not taken' : 'No attempts left'}
                  </span>
                ) : null}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

/* Dependency-free SVG line chart: the student's % vs the class average % across
   graded assessments, with a 75% passing reference line. */
/* Chart series colours are validated, not picked by eye.
 *
 *   you #1C5CAB  ·  class average #8C8C86
 *   CVD ΔE 19.2 (protan) / 16.8 (tritan), normal-vision ΔE 21.8, both ≥ 3:1 on
 *   the card. The previous pair — brand navy #0E2A5C with #3FA9F5 — failed:
 *   navy is an ink colour, too dark and too grey to carry data, and the light
 *   blue sat at 2.49:1 against white, so a 2px line in it barely showed.
 *
 * Only the student's own line carries colour. The class average is deliberately
 * neutral grey because it is a benchmark, not a competing identity — the reader
 * should see their own trend first and the comparison second.
 */
const C_YOU = '#1C5CAB'
const C_AVG = '#8C8C86'
const C_PASS = '#8B6A00'
const PASS_MARK = 75

/* Sits in the card header rather than under the plot, so the legend costs no
   vertical space of its own. */
function PerfLegend() {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1" style={{ fontSize: 11.5, color: muted }}>
      <span className="inline-flex items-center gap-1.5"><span style={{ width: 16, height: 3, borderRadius: 2, background: C_YOU, display: 'inline-block' }} /> You</span>
      <span className="inline-flex items-center gap-1.5"><span style={{ width: 16, height: 3, borderRadius: 2, background: C_AVG, display: 'inline-block' }} /> Class</span>
      <span className="inline-flex items-center gap-1.5"><span style={{ width: 16, height: 0, borderTop: `2px dashed ${C_PASS}`, display: 'inline-block' }} /> Pass {PASS_MARK}</span>
    </div>
  )
}

function PerfChart({ points, active, onActive }) {
  /* A wide, short viewBox. The svg is width:100%, so the rendered height is
     width ÷ aspect — at 4.5:1 a 900px card gives ~200px of chart instead of the
     ~315px the old 2.9:1 box produced. maxHeight is the belt-and-braces cap for
     very wide windows. */
  const W = 720
  const H = 186
  const padL = 28
  const padR = 12
  const padT = 12
  const padB = 20
  const innerW = W - padL - padR
  const innerH = H - padT - padB
  const x = (i) => padL + (points.length === 1 ? innerW / 2 : (i / (points.length - 1)) * innerW)
  const y = (v) => padT + (1 - Math.max(0, Math.min(100, v)) / 100) * innerH

  const svgRef = useRef(null)

  const youLine = points.map((p, i) => `${x(i)},${y(p.you)}`).join(' ')
  const youArea = `${padL},${y(0)} ${youLine} ${x(points.length - 1)},${y(0)}`
  const avgLine = points.map((p, i) => (p.avg == null ? null : `${x(i)},${y(p.avg)}`)).filter(Boolean).join(' ')
  const avgPts = points.filter((p) => p.avg != null)
  const last = points.length - 1

  /* With a long list the 1..N ticks collide, so thin them out and let the
     tooltip and the table carry the rest. */
  const tickEvery = Math.ceil(points.length / 12)
  const showTick = (i) => points.length <= 12 || i % tickEvery === 0 || i === last

  /* Nearest-point hover across the full plot width, so reading a value never
     depends on landing on an 8px dot. */
  function pick(e) {
    const rect = svgRef.current?.getBoundingClientRect()
    if (!rect || !rect.width) return
    const px = ((e.clientX - rect.left) / rect.width) * W
    let best = 0
    let bestD = Infinity
    for (let i = 0; i < points.length; i++) {
      const d = Math.abs(x(i) - px)
      if (d < bestD) { bestD = d; best = i }
    }
    onActive(best)
  }

  function onKey(e) {
    if (e.key === 'ArrowRight') { e.preventDefault(); onActive(Math.min(last, (active ?? -1) + 1)) }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); onActive(Math.max(0, (active ?? last + 1) - 1)) }
    else if (e.key === 'Escape') onActive(null)
  }

  const hot = active == null ? null : points[active]

  return (
    <div style={{ position: 'relative' }}>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        style={{ display: 'block', maxHeight: 230, touchAction: 'none' }}
        preserveAspectRatio="xMidYMid meet"
        tabIndex={0}
        role="img"
        aria-label="Your score against the class average on each graded item. The table below lists the same values."
        onMouseMove={pick}
        onMouseLeave={() => onActive(null)}
        onKeyDown={onKey}
      >
        <defs>
          <linearGradient id="ak-you-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={C_YOU} stopOpacity="0.15" />
            <stop offset="100%" stopColor={C_YOU} stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Solid hairline grid — dashing a plain gridline reads as a threshold. */}
        {[0, 50, 100].map((g) => (
          <g key={g}>
            <line x1={padL} y1={y(g)} x2={W - padR} y2={y(g)} stroke="rgba(14,42,92,0.07)" strokeWidth="1" />
            <text x={padL - 6} y={y(g) + 3} textAnchor="end" fontSize="9" fill="#9AA6BD" fontFamily="ui-monospace, monospace">{g}</text>
          </g>
        ))}

        {/* Passing threshold: the one line here that genuinely is a threshold,
            so it is the only dashed rule on the chart. */}
        <line x1={padL} y1={y(PASS_MARK)} x2={W - padR} y2={y(PASS_MARK)} stroke={C_PASS} strokeWidth="1.25" strokeDasharray="5 4" opacity="0.75" />
        <text x={padL - 6} y={y(PASS_MARK) + 3} textAnchor="end" fontSize="9" fill={C_PASS} fontFamily="ui-monospace, monospace" fontWeight="700">{PASS_MARK}</text>

        {/* Crosshair for the hovered item, behind the marks. */}
        {active != null && (
          <line x1={x(active)} y1={padT} x2={x(active)} y2={H - padB} stroke="rgba(14,42,92,0.22)" strokeWidth="1" />
        )}

        {/* A whisper of fill under the student's line — enough to give the trend
            some body without reading as an area chart. */}
        {points.length >= 2 && <polygon points={youArea} fill="url(#ak-you-fill)" />}

        {/* Class average — recessive benchmark. */}
        {avgPts.length >= 2 && <polyline points={avgLine} fill="none" stroke={C_AVG} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />}
        {avgPts.map((p) => {
          const i = points.indexOf(p)
          return <circle key={`a${i}`} cx={x(i)} cy={y(p.avg)} r="3.5" fill="#FFFFFF" stroke={C_AVG} strokeWidth="1.75" />
        })}

        {/* The student's own line, carrying the only colour. */}
        {points.length >= 2 && <polyline points={youLine} fill="none" stroke={C_YOU} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />}
        {points.map((p, i) => (
          <circle key={`y${i}`} cx={x(i)} cy={y(p.you)} r={active === i ? 5 : 3.5} fill={C_YOU} stroke="#FFFFFF" strokeWidth="1.75" />
        ))}
        {points.map((p, i) => (
          showTick(i) || active === i ? (
            <text
              key={`t${i}`}
              x={x(i)} y={H - 6}
              textAnchor="middle" fontSize="9"
              fill={active === i ? ink : '#9AA6BD'}
              fontWeight={active === i ? 700 : 400}
              fontFamily="ui-monospace, monospace"
            >
              {i + 1}
            </text>
          ) : null
        ))}

        {/* One direct label, on the latest score — the number a student looks
            for. Every other value lives in the tooltip and the table below.
            The y flips below the point when the score would clip off the top. */}
        {points.length >= 2 && active == null && (
          <text
            x={x(last)}
            y={y(points[last].you) - 9 < padT + 8 ? y(points[last].you) + 15 : y(points[last].you) - 9}
            textAnchor="end"
            fontSize="11"
            fontWeight="700"
            fill={C_YOU}
            fontFamily="ui-monospace, monospace"
          >
            {points[last].you}%
          </text>
        )}
      </svg>

      {hot && (
        <div
          role="status"
          style={{
            position: 'absolute',
            left: `${(x(active) / W) * 100}%`,
            top: 0,
            transform: active > last / 2 ? 'translateX(calc(-100% - 10px))' : 'translateX(10px)',
            background: '#FFFFFF',
            border: `1px solid ${line}`,
            borderRadius: 10,
            boxShadow: '0 10px 28px -12px rgba(14,42,92,0.35)',
            padding: '8px 10px',
            minWidth: 128,
            pointerEvents: 'none',
            zIndex: 2,
          }}
        >
          <div style={{ fontSize: 11.5, fontWeight: 700, color: ink, lineHeight: 1.25 }}>
            {active + 1}. {hot.title}
          </div>
          {hot.date && <div style={{ fontSize: 10.5, color: faint, marginTop: 1 }}>{hot.date}</div>}
          <div className="flex items-center justify-between gap-3" style={{ marginTop: 5, fontSize: 11.5 }}>
            <span className="inline-flex items-center gap-1.5" style={{ color: muted }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: C_YOU, display: 'inline-block' }} /> You
            </span>
            <span style={{ ...mono, fontWeight: 700, color: ink }}>{hot.you}%</span>
          </div>
          <div className="flex items-center justify-between gap-3" style={{ marginTop: 2, fontSize: 11.5 }}>
            <span className="inline-flex items-center gap-1.5" style={{ color: muted }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', border: `2px solid ${C_AVG}`, display: 'inline-block' }} /> Class
            </span>
            <span style={{ ...mono, fontWeight: 700, color: hot.avg == null ? faint : ink }}>
              {hot.avg == null ? '—' : `${hot.avg}%`}
            </span>
          </div>
        </div>
      )}
    </div>
  )
}

/* rgba(14,42,92,0.03) flattened over white: a translucent sticky header would
   let table rows scroll visibly through it. */
const stickyTh = { position: 'sticky', top: 0, background: '#F8F9FA', zIndex: 1 }

function SubjectAnalyticsTab({ entry, attendance, studentId, quizAverage, attempts, quizzes, attemptedQuizIds }) {
  // Held here, not in PerfChart: the table and the chart share it.
  // Must sit above the early return below -- hooks run unconditionally.
  const [active, setActive] = useState(null)

  const assessments = entry?.assessments ?? []
  const components = entry?.components ?? []
  const graded = assessments
    .filter((a) => a.status === 'graded' && a.raw_score != null && a.total_points > 0)
    .sort((a, b) => (a.date_given ?? '').localeCompare(b.date_given ?? '') || a.title.localeCompare(b.title))

  const forecast = (
    <ClassStandingForecast
      studentId={studentId}
      // The forecast's prior-grade input is a percent. A 1.0–5.0 point grade
      // fed in as one reads as a certain fail, so on that scale it is withheld
      // and the model works from attendance and quiz scores alone.
      grade={isPointScale(entry?.mode) ? null : (entry?.final_grade ?? null)}
      attendanceRate={attendance?.rate ?? null}
      quizAverage={quizAverage ?? null}
      attendanceLog={attendance?.log}
      attempts={attempts}
      assessments={assessments}
      quizzes={quizzes}
      attemptedQuizIds={attemptedQuizIds}
    />
  )

  if (!entry || entry.final_grade == null || graded.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        {forecast}
        <Empty icon={<BarChart className="h-6 w-6" />} title="No analytics yet" text="Once your teacher records and saves graded work, your performance trends will appear here." />
      </div>
    )
  }

  const points = graded.map((a) => ({
    title: a.title,
    date: a.date_given,
    you: Math.round((a.raw_score / a.total_points) * 100),
    avg: a.class_average != null ? Math.round((a.class_average / a.total_points) * 100) : null,
  }))
  const youAvg = Math.round(points.reduce((s, p) => s + p.you, 0) / points.length)
  const withAvg = points.filter((p) => p.avg != null)
  const classAvg = withAvg.length ? Math.round(withAvg.reduce((s, p) => s + p.avg, 0) / withAvg.length) : null
  const diff = classAvg != null ? youAvg - classAvg : null

  // Per-component performance across the whole subject.
  const compRows = components
    .map((c) => ({ name: c.name, weight: c.weight_percent, pct: studentComponentPercent(assessments.filter((a) => a.component_id === c.id)) }))
    .filter((r) => r.pct != null)
  const ranked = [...compRows].sort((a, b) => b.pct - a.pct)
  const strongest = ranked[0]
  const weakest = ranked[ranked.length - 1]

  return (
    <div className="flex flex-col gap-4">
      {/* Summary stats */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MetricCard label="Current grade" value={formatGrade(entry.final_grade, entry.mode)} valueColor={gradeColor(entry.final_grade, entry.mode)} tint="rgba(14,42,92,0.07)" />
        <MetricCard label="Your average" value={`${youAvg}%`} sub="across graded items" valueColor={gradeColor(youAvg)} tint="rgba(63,169,245,0.13)" />
        <MetricCard
          label="vs class"
          value={diff == null ? '—' : `${diff >= 0 ? '+' : ''}${diff}`}
          sub={classAvg == null ? '' : `class avg ${classAvg}%`}
          valueColor={diff == null ? faint : diff >= 0 ? green : red}
          tint="rgba(245,197,24,0.15)"
        />
        <MetricCard label="Attendance" value={attendance.rate == null ? '—' : `${attendance.rate}%`} valueColor={blueText} tint="rgba(31,138,91,0.1)" />
      </div>

      {/* Trend and the same numbers as a table, side by side.
          The table is the chart's accessible twin and its row numbers ARE the
          chart's x-axis ticks, so `active` is held here and hovering either one
          highlights the other. Stacks below lg, where two columns would squeeze
          the assessment titles to nothing. */}
      <div className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
        <div style={{ background: '#FFFFFF', border: `1px solid ${line}`, borderRadius: 16, padding: 20, display: 'flex', flexDirection: 'column' }}>
          <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2" style={{ marginBottom: 10 }}>
            <div>
              <div style={{ fontSize: 14.5, fontWeight: 700, color: ink }}>Performance trend</div>
              <div style={{ fontSize: 12.5, color: faint, marginTop: 2 }}>Your score vs the class average on each graded item, over time.</div>
            </div>
            <PerfLegend />
          </div>
          <div style={{ flex: 1, display: 'flex', alignItems: 'center' }}>
            <div style={{ width: '100%' }}>
              <PerfChart points={points} active={active} onActive={setActive} />
            </div>
          </div>
        </div>

        <div style={{ background: '#FFFFFF', border: `1px solid ${line}`, borderRadius: 16, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ fontSize: 14.5, fontWeight: 700, color: ink, padding: '18px 20px 10px' }}>Item scores</div>
          <div className="overflow-auto" style={{ flex: 1, maxHeight: 264 }}>
            <table className="w-full" style={{ borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr>
                  {/* Sticky headers need an opaque fill -- the translucent grey
                      the rest of the app uses would let rows scroll through. */}
                  <th style={{ ...thStyle, ...stickyTh, width: 34 }}>#</th>
                  <th style={{ ...thStyle, ...stickyTh }}>Assessment</th>
                  <th style={{ ...thStyle, ...stickyTh, textAlign: 'right' }}>You</th>
                  <th style={{ ...thStyle, ...stickyTh, textAlign: 'right' }}>Class</th>
                </tr>
              </thead>
              <tbody>
                {points.map((p, i) => (
                  <tr
                    key={i}
                    onMouseEnter={() => setActive(i)}
                    onMouseLeave={() => setActive(null)}
                    style={{
                      borderTop: '1px solid rgba(14,42,92,0.05)',
                      background: active === i ? 'rgba(28,92,171,0.08)' : 'transparent',
                      transition: 'background 0.12s',
                    }}
                  >
                    <td style={{ ...tdStyle, ...mono, color: active === i ? C_YOU : faint, fontWeight: active === i ? 700 : 400 }}>{i + 1}</td>
                    <td style={{ ...tdStyle, color: ink }}>{p.title}</td>
                    <td style={{ ...tdStyle, ...mono, textAlign: 'right', fontWeight: 700, color: gradeColor(p.you) }}>{p.you}%</td>
                    <td style={{ ...tdStyle, ...mono, textAlign: 'right', color: muted }}>{p.avg == null ? '—' : `${p.avg}%`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Component breakdown */}
      <div style={{ background: '#FFFFFF', border: `1px solid ${line}`, borderRadius: 16, padding: 20 }}>
        <div style={{ fontSize: 14.5, fontWeight: 700, color: ink, marginBottom: 14 }}>Component breakdown</div>
        <div className="flex flex-col gap-3">
          {compRows.map((r) => (
            <div key={r.name}>
              <div className="flex items-center justify-between" style={{ fontSize: 13, marginBottom: 5 }}>
                <span style={{ color: ink, fontWeight: 600 }}>{r.name} <span style={{ color: faint, fontWeight: 400 }}>({r.weight}%)</span></span>
                <span style={{ ...mono, fontWeight: 700, color: gradeColor(r.pct) }}>{r.pct}%</span>
              </div>
              <div style={{ height: 9, borderRadius: 999, background: 'rgba(14,42,92,0.07)', overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${Math.min(100, r.pct)}%`, background: gradeColor(r.pct), borderRadius: 999, transition: 'width 0.6s' }} />
              </div>
            </div>
          ))}
        </div>
        {strongest && weakest && strongest.name !== weakest.name && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 16 }}>
            <span style={{ fontSize: 12.5, color: muted, background: 'rgba(31,138,91,0.08)', border: '1px solid rgba(31,138,91,0.3)', borderRadius: 999, padding: '5px 12px' }}>
              💪 Strongest: <strong style={{ color: ink }}>{strongest.name}</strong> ({strongest.pct}%)
            </span>
            <span style={{ fontSize: 12.5, color: muted, background: 'rgba(192,57,43,0.06)', border: '1px solid rgba(192,57,43,0.28)', borderRadius: 999, padding: '5px 12px' }}>
              🎯 Focus on: <strong style={{ color: ink }}>{weakest.name}</strong> ({weakest.pct}%)
            </span>
          </div>
        )}
      </div>
    </div>
  )
}

function AnnouncementsTab({ announcements }) {
  if (announcements.length === 0) {
    return <Empty icon={<Megaphone className="h-6 w-6" />} title="No announcements" text="Class announcements from your teacher will show up here." />
  }
  return (
    <div className="flex flex-col gap-3">
      {announcements.map((a) => {
        const when = a.created_at?.seconds ? new Date(a.created_at.seconds * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : ''
        return (
          <div key={a.id} style={{ background: '#FFFFFF', border: `1px solid ${line}`, borderRadius: 16, padding: 20 }}>
            <div className="flex items-center justify-between gap-3" style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: ink }}>{a.title || 'Announcement'}</div>
              {when && <div style={{ ...mono, fontSize: 11.5, color: faint }}>{when}</div>}
            </div>
            <div style={{ fontSize: 14, color: muted, lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>{a.body || a.message}</div>
          </div>
        )
      })}
    </div>
  )
}

function Empty({ icon, title, text }) {
  return (
    <div style={{ background: '#FFFFFF', border: `1px solid ${line}`, borderRadius: 16, padding: 44, textAlign: 'center' }}>
      <div style={{ display: 'inline-grid', placeItems: 'center', width: 48, height: 48, borderRadius: 12, background: 'rgba(14,42,92,0.08)', color: navy }}>{icon}</div>
      <h3 style={{ ...serif, fontSize: 20, margin: '14px 0 6px', color: ink }}>{title}</h3>
      <p style={{ fontSize: 13.5, color: muted, margin: 0 }}>{text}</p>
    </div>
  )
}

const thStyle = { padding: '12px 18px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: muted, letterSpacing: '0.06em', textTransform: 'uppercase', whiteSpace: 'nowrap' }
const tdStyle = { padding: '13px 18px', fontSize: 13, color: ink, verticalAlign: 'middle' }

export default function StudentClassDetail() {
  const { classId } = useParams()
  const { profile } = useAuth()
  const queryClient = useQueryClient()
  // `?tab=` picks the opening tab and `?topic=` a sub-module to land on — the
  // link a review guide uses to bring a student back to the modules.
  const [searchParams] = useSearchParams()
  const requestedTab = searchParams.get('tab')
  const [tab, setTab] = useState(TABS.some((t) => t.key === requestedTab) ? requestedTab : 'topics')
  const focusTopicId = searchParams.get('topic')

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['student-class-detail', classId, profile.id],
    queryFn: () => loadClassDetail(classId, profile),
    retry: false,
  })

  if (isLoading) return <p style={{ color: faint }}>Loading class…</p>
  if (isError) {
    const notEnrolled = error?.message === 'not_enrolled'
    return (
      <div style={{ background: '#FFFFFF', border: `1px solid ${line}`, borderRadius: 16, padding: 44, textAlign: 'center' }}>
        <h3 style={{ ...serif, fontSize: 22, color: ink, margin: '0 0 6px' }}>
          {notEnrolled ? "You're not enrolled in this class" : 'Class not found'}
        </h3>
        <p style={{ fontSize: 14, color: muted, margin: '0 0 16px' }}>
          {notEnrolled ? 'You can only view classes you have been added to.' : 'This class may have been removed.'}
        </p>
        <Link to="/student/classes" style={{ fontSize: 13, fontWeight: 700, color: navy }}>← Back to My Classes</Link>
      </div>
    )
  }

  const { clazz, teacher, entry, attendance, contestsByDate, gradeContestsByAssessment, syllabus, announcements, quizzes, attemptsByQuiz, scaffoldedTopicIds, tasks = [], submissionByTask = {} } = data
  const finalGrade = entry?.final_grade ?? null
  const schedule = formatSchedule(clazz.schedule) || null
  const studentName = `${profile.last_name ?? ''}, ${profile.first_name ?? ''}`.trim().replace(/^,\s*/, '')
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['student-class-detail', classId, profile.id] })

  // Best percentage per quiz, averaged — one input to the standing forecast.
  // Best rather than latest, matching how the teacher's mastery figures read
  // attempts, so the two never disagree about the same student.
  const quizBests = Object.values(attemptsByQuiz)
    .map((attempts) => {
      const scored = attempts.filter((a) => a.total_score != null && a.total_possible)
      if (!scored.length) return null
      return Math.max(...scored.map((a) => (a.total_score / a.total_possible) * 100))
    })
    .filter((v) => v != null)
  const quizAverage = quizBests.length
    ? Math.round(quizBests.reduce((s, v) => s + v, 0) / quizBests.length)
    : null

  // Flat and chronological, unlike quizBests: the forecast needs to see which
  // way scores are moving, and a per-quiz maximum hides a decline behind one
  // good early attempt.
  const allAttempts = Object.values(attemptsByQuiz).flat()

  // Which quizzes this student actually sat. An attempt document only exists
  // once submitted, so the quizzes NOT in here are the ones they never opened —
  // which is the half of disengagement that leaves no trace in quiz_attempts.
  const attemptedQuizIds = new Set(Object.keys(attemptsByQuiz))

  return (
    <div>
      {/* Breadcrumb */}
      <Link to="/student/classes" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 13, fontWeight: 600, color: muted, textDecoration: 'none', marginBottom: 14 }}>
        ← My Classes
      </Link>

      {/* Course header */}
      <div style={{ background: 'linear-gradient(135deg, #0E2A5C, #061840)', borderRadius: 20, padding: 'clamp(20px, 3.5vw, 28px)', color: '#FAFAF6', position: 'relative', overflow: 'hidden' }}>
        <div aria-hidden="true" style={{ position: 'absolute', top: -60, right: -40, width: 180, height: 180, border: '1px solid rgba(245,197,24,0.14)', borderRadius: '50%' }} />
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between" style={{ position: 'relative' }}>
          <div>
            <h1 className="text-[clamp(24px,3.5vw,34px)]" style={{ ...serif, lineHeight: 1.1, margin: '0 0 6px' }}>
              {clazz.subject_code ? `${clazz.subject_code} · ` : ''}{clazz.subject || clazz.section}
            </h1>
            <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5" style={{ fontSize: 13.5, color: 'rgba(250,250,246,0.82)' }}>
              <span>{clazz.section}</span>
              {schedule && <span>· {schedule}</span>}
              {teacher && <span>· {teacher.first_name} {teacher.last_name}</span>}
              {teacher?.email && <span style={{ color: 'rgba(250,250,246,0.6)' }}>· {teacher.email}</span>}
            </div>
          </div>
          <div style={{ textAlign: 'right', flexShrink: 0 }}>
            <div style={{ fontSize: 11, color: 'rgba(250,250,246,0.6)', letterSpacing: '0.05em' }}>CURRENT GRADE</div>
            <div style={{ ...serif, fontSize: 40, lineHeight: 1, color: finalGrade == null ? 'rgba(255,255,255,0.6)' : gold, marginTop: 2 }}>
              {formatGrade(finalGrade, entry?.mode)}
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="mt-6 mb-5 flex gap-1.5 overflow-x-auto" style={{ background: '#FFFFFF', border: `1px solid ${line}`, borderRadius: 14, padding: 6 }}>
        {TABS.map(({ key, label, Icon }) => {
          const active = tab === key
          return (
            <button
              key={key}
              onClick={() => setTab(key)}
              className="transition"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '9px 16px', fontSize: 13.5, fontWeight: 700, borderRadius: 10, border: 'none', cursor: 'pointer', whiteSpace: 'nowrap', color: active ? '#FAFAF6' : muted, background: active ? navy : 'transparent' }}
            >
              <Icon className="h-4 w-4" style={{ color: active ? gold : faint }} />
              {label}
            </button>
          )
        })}
      </div>

      {tab === 'topics' && (
        <TopicsTab
          syllabus={syllabus}
          classId={classId}
          quizzes={quizzes}
          attemptsByQuiz={attemptsByQuiz}
          tasks={tasks}
          submissionByTask={submissionByTask}
          onSubmitted={invalidate}
          scaffoldedTopicIds={scaffoldedTopicIds}
          focusTopicId={focusTopicId}
        />
      )}
      {tab === 'quizzes' && <QuizzesTab classId={classId} quizzes={quizzes} attemptsByQuiz={attemptsByQuiz} studentId={profile.id} />}
      {tab === 'grades' && (
        <GradesTab
          entry={entry}
          classId={classId}
          studentId={profile.id}
          studentName={studentName}
          gradeContestsByAssessment={gradeContestsByAssessment}
          onContested={invalidate}
        />
      )}
      {tab === 'analytics' && (
        <SubjectAnalyticsTab
          entry={entry}
          attendance={attendance}
          studentId={profile.id}
          quizAverage={quizAverage}
          attempts={allAttempts}
          quizzes={quizzes}
          attemptedQuizIds={attemptedQuizIds}
        />
      )}
      {tab === 'attendance' && (
        <AttendanceTab
          attendance={attendance}
          contestsByDate={contestsByDate}
          classId={classId}
          studentId={profile.id}
          studentName={studentName}
          onContested={invalidate}
        />
      )}
      {tab === 'announcements' && <AnnouncementsTab announcements={announcements} />}
    </div>
  )
}
