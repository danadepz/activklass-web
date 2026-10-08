/**
 * Modules -- the class as the student sees it on their Modules tab, plus the
 * power to put work under any sub-module.
 *
 * The teacher's only view of a class's modules used to be the Syllabus page,
 * which is per syllabus, not per class: the same sub-module is taught to
 * BSIT-C one week and to another section another week, so nothing dated can
 * live on the syllabus tree. This tab is keyed by the class. Under each
 * sub-module it lists the syllabus materials (read-only here -- the Syllabus
 * page edits them), the quizzes linked to the sub-module, and the class's
 * own tasks (`class_tasks`: activities, assignments, paper exams), each with
 * the same window sentence the student reads (`describeWindow`).
 *
 * The syllabus is resolved the way Scaffold Topics resolves it
 * (`classSyllabus.js`): `classes.syllabus_id` first, the seeded per-class
 * document second, so Newton and BSIT-C both show their modules.
 */
import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { doc, getDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { useAuth } from '@/context/useAuth'
import { useQuizzes } from '@/hooks/useQuizzes'
import { useClassTasks, classTasksKey } from '@/hooks/useClassTasks'
import { useTaskSubmissions } from '@/hooks/useTaskSubmissions'
import { fetchUsersByIds } from '@/lib/roster'
import { describeSubmission, isLate } from '@/lib/taskSubmissions'
import { KIND_LABEL, describeWindow, fromQuiz, fromTask, stateOf } from '@/lib/deliverables'
import { createTask, deleteTask, newTaskId, publishTask, syncTaskToRecord, updateTask, uploadTaskFile } from '@/lib/classTasks'
import { suggestMapping, taskCountsTowardRecord } from '@/lib/recordMapping'
import { LINK_HINT, isSafeLink, uploadsPossible } from '@/lib/attachments'
import {
  TASK_TITLE_MAX,
  taskAttachmentsError,
  taskKindError,
  taskTitleError,
  taskWindowError,
} from '@/lib/validation'
import { RESOURCE_META, quizzesForTopic } from '@/routes/student/scaffolding'
import { resolveSyllabus } from './classSyllabus'
import InfoTooltip from './InfoTooltip'
import Markdown from '@/components/Markdown'
import { confirmDialog } from '@/components/ui/dialogs'
import { toast } from '@/components/ui/toast'
import { SkeletonList } from '@/components/ui/Skeleton'
import { useDialogBehavior } from '@/components/ui/useDialogBehavior'
import { navy, navyDeep, ink, goldDeep, muted, faint, green, blueText, red, line, serif, mono, sansFamily as sans } from '@/theme'

/* The + Add menu, in the order the plan fixes. "Exam (paper)" is deliberate:
   an online exam is a quiz, and the Quiz item sits beside it for that reason. */
const ADD_MENU = [
  { kind: 'activity', label: 'Activity' },
  { kind: 'assignment', label: 'Assignment' },
  { kind: 'exam', label: 'Exam (paper)' },
  { kind: 'quiz', label: 'Quiz' },
]

/* The chip's colour by state -- the sentence itself comes from describeWindow. */
const STATE_STYLE = {
  scheduled: { fg: blueText, bg: 'rgba(63,169,245,0.10)', border: 'rgba(63,169,245,0.35)' },
  open: { fg: green, bg: 'rgba(31,138,91,0.10)', border: 'rgba(31,138,91,0.35)' },
  due_today: { fg: goldDeep, bg: 'rgba(245,197,24,0.18)', border: 'rgba(245,197,24,0.5)' },
  overdue: { fg: red, bg: 'rgba(192,57,43,0.08)', border: 'rgba(192,57,43,0.3)' },
  closed: { fg: muted, bg: 'rgba(14,42,92,0.05)', border: 'rgba(14,42,92,0.14)' },
  done: { fg: muted, bg: 'rgba(14,42,92,0.05)', border: 'rgba(14,42,92,0.14)' },
}

async function loadClassModules(classId) {
  const classSnap = await getDoc(doc(db, 'classes', classId))
  const clazz = classSnap.exists() ? { id: classSnap.id, ...classSnap.data() } : null
  const syllabus = await resolveSyllabus(classId, clazz)
  return { clazz, syllabusId: syllabus.id, syllabus: syllabus.data }
}

/** The one window chip every quiz and task row shows. */
function WindowChip({ deliverable, now }) {
  const state = stateOf(deliverable, now)
  const s = STATE_STYLE[state] ?? STATE_STYLE.open
  return (
    <span
      data-state={state}
      style={{
        display: 'inline-flex', alignItems: 'center', flexShrink: 0,
        fontSize: 11, fontWeight: 700, borderRadius: 999, padding: '3px 10px',
        color: s.fg, background: s.bg, border: `1px solid ${s.border}`, whiteSpace: 'nowrap',
      }}
    >
      {describeWindow(deliverable, now)}
    </span>
  )
}

function KindTag({ children }) {
  return (
    <span style={{ ...mono, fontSize: 10.5, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: navy, background: 'rgba(14,42,92,0.07)', padding: '3px 8px', borderRadius: 6, flexShrink: 0 }}>
      {children}
    </span>
  )
}

const rowStyle = { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, background: '#FFFFFF', border: `1px solid ${line}`, borderRadius: 10, padding: '9px 12px' }
const smallBtn = { fontSize: 12, fontWeight: 700, fontFamily: sans, color: navy, background: '#FFFFFF', border: '1.5px solid rgba(14,42,92,0.18)', borderRadius: 8, padding: '5px 10px', cursor: 'pointer' }

/** One syllabus material, read-only: the Syllabus page is where these change. */
function MaterialRow({ resource }) {
  const meta = RESOURCE_META[resource.resource_type] ?? RESOURCE_META.file
  const opens = resource.resource_type !== 'rich_text' && resource.url
  return (
    <div style={rowStyle}>
      <span aria-hidden="true" style={{ fontSize: 15 }}>{meta.icon}</span>
      <KindTag>{meta.label}</KindTag>
      {opens ? (
        <a href={resource.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 13.5, fontWeight: 600, color: blueText, minWidth: 0, overflowWrap: 'anywhere' }}>
          {resource.title || 'Material'}
        </a>
      ) : (
        <span style={{ fontSize: 13.5, fontWeight: 600, color: ink }}>{resource.title || 'Material'}</span>
      )}
    </div>
  )
}

/** A quiz linked to this sub-module, with the window a student will read. */
function QuizRow({ quiz, classId, now }) {
  const d = fromQuiz(quiz, { classId, now })
  return (
    <div style={rowStyle} data-testid="quiz-row">
      <KindTag>{KIND_LABEL.quiz}</KindTag>
      <Link to={`/teacher/quizzes/${quiz.id}`} style={{ fontSize: 13.5, fontWeight: 600, color: ink, textDecoration: 'none', minWidth: 0, overflowWrap: 'anywhere' }}>
        {quiz.title || 'Quiz'}
      </Link>
      {quiz.status === 'draft' && <DraftBadge />}
      <WindowChip deliverable={d} now={now} />
    </div>
  )
}

function DraftBadge() {
  return (
    <span data-testid="draft-badge" style={{ fontSize: 11, fontWeight: 700, color: goldDeep, background: 'rgba(245,197,24,0.18)', border: '1px solid rgba(245,197,24,0.5)', borderRadius: 999, padding: '2px 9px', flexShrink: 0 }}>
      Draft
    </span>
  )
}

/**
 * One class task. Everything a student sees is here in the teacher's order:
 * kind, title, the window sentence, what is attached, and whether it is
 * still a draft the student cannot see.
 */
export function TaskRow({ task, now, onEdit, onDelete, classId = '', roster = [] }) {
  const d = fromTask(task, { now })
  const attachments = d.attachments
  const hasBin = d.status === 'published' && d.acceptsSubmissions
  const [binOpen, setBinOpen] = useState(false)
  return (
    <div data-testid="task-row" data-status={d.status} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
    <div style={rowStyle}>
      <KindTag>{KIND_LABEL[d.kind]}</KindTag>
      <span style={{ fontSize: 13.5, fontWeight: 600, color: ink, minWidth: 0, overflowWrap: 'anywhere' }}>{d.title}</span>
      {d.status !== 'published' && <DraftBadge />}
      <WindowChip deliverable={d} now={now} />
      {hasBin && (
        <SubmissionsChip classId={classId} taskId={task.id} roster={roster} open={binOpen} onToggle={() => setBinOpen((o) => !o)} />
      )}
      {d.points != null && (
        <span style={{ ...mono, fontSize: 11.5, color: muted }}>{d.points} pts</span>
      )}
      {attachments.length > 0 && (
        <span style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }} title={attachments.map((a) => a.title).join(', ')}>
          {attachments.map((a, i) => {
            const meta = RESOURCE_META[a.resource_type] ?? RESOURCE_META.file
            return (
              <a key={i} href={a.url} target="_blank" rel="noopener noreferrer" aria-label={`${meta.label}: ${a.title}`} title={a.title} style={{ fontSize: 14, textDecoration: 'none' }}>
                {meta.icon}
              </a>
            )
          })}
        </span>
      )}
      <span style={{ marginLeft: 'auto', display: 'inline-flex', gap: 6 }}>
        <button type="button" onClick={onEdit} style={smallBtn}>Edit</button>
        <button type="button" onClick={onDelete} style={{ ...smallBtn, color: red, borderColor: 'rgba(192,57,43,0.3)' }}>Delete</button>
      </span>
    </div>
    {hasBin && binOpen && <SubmissionsList classId={classId} task={task} roster={roster} now={now} />}
    </div>
  )
}

/**
 * "3 of 24 submitted" on a task whose bin is open. The count is the rows
 * the rule lets this teacher read (useTaskSubmissions: class_id AND
 * task_id, or the query is refused) over the roster the class document
 * lists. A button, so the list under the row is one click away and closed
 * by default -- eight tasks each unfolded would bury the modules.
 */
function SubmissionsChip({ classId, taskId, roster, open, onToggle }) {
  const { data: rows, isError } = useTaskSubmissions(classId, taskId)
  const submitted = rows?.length ?? 0
  const total = roster.length
  const label = isError ? 'Submissions could not be loaded' : rows ? `${submitted} of ${total} submitted` : 'Loading submissions…'
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      data-testid="submissions-chip"
      style={{ ...smallBtn, fontSize: 11, padding: '3px 10px', borderRadius: 999, color: isError ? goldDeep : submitted === total && total > 0 ? green : navy, borderColor: 'rgba(14,42,92,0.18)' }}
    >
      {label} {open ? '▴' : '▾'}
    </button>
  )
}

/**
 * One line per student on the roster: name, when they handed in (and late,
 * per isLate against the task's due_at), their file or link, their note,
 * and a way to the class record where the mark is typed. Students with no
 * row are listed too, greyed, so the teacher sees who is missing without
 * counting. Nothing is graded here (plan S9).
 */
export function SubmissionsList({ classId, task, roster, now }) {
  const { data: rows = [] } = useTaskSubmissions(classId, task.id)
  const byStudent = new Map(rows.map((r) => [r.student_id, r]))
  const students = roster.length ? roster : rows.map((r) => ({ id: r.student_id }))
  const name = (u) => [u?.last_name, u?.first_name].filter(Boolean).join(', ') || u?.id || 'Student'
  const sorted = [...students].sort((a, b) => name(a).localeCompare(name(b)))
  return (
    <div data-testid="submissions-list" style={{ marginLeft: 12, borderLeft: `2px solid ${line}`, paddingLeft: 12, display: 'flex', flexDirection: 'column', gap: 4 }}>
      {sorted.length === 0 && <p style={{ fontSize: 12.5, color: faint, margin: 0 }}>No students on this class yet.</p>}
      {sorted.map((u) => {
        const sub = byStudent.get(u.id)
        const meta = sub ? (RESOURCE_META[sub.attachment?.resource_type] ?? RESOURCE_META.file) : null
        return (
          <div key={u.id} data-testid="submission-row" data-submitted={!!sub} style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, fontSize: 12.5, color: sub ? ink : faint, padding: '4px 0' }}>
            <span style={{ fontWeight: 600, minWidth: 140 }}>{name(u)}</span>
            {sub ? (
              <>
                <span style={{ color: isLate(sub, task) ? red : muted }}>{describeSubmission(sub, task, now)}</span>
                {sub.attachment?.url && (
                  <a href={sub.attachment.url} target="_blank" rel="noopener noreferrer" style={{ color: blueText, fontWeight: 600, textDecoration: 'none' }}>
                    {meta.icon} {sub.attachment.title || meta.label}
                  </a>
                )}
                {sub.note && <span style={{ color: muted, fontStyle: 'italic', overflowWrap: 'anywhere' }}>“{sub.note}”</span>}
                {sub.resubmitted_count > 0 && <span style={{ ...mono, fontSize: 11, color: faint }}>re-submitted ×{sub.resubmitted_count}</span>}
              </>
            ) : (
              <span>— not yet</span>
            )}
            <Link to={`/teacher/classes/${classId}/record`} style={{ marginLeft: 'auto', fontSize: 11.5, fontWeight: 600, color: blueText, textDecoration: 'none' }}>
              Class record →
            </Link>
          </div>
        )
      })}
    </div>
  )
}

const label = { display: 'block', fontSize: 11.5, fontWeight: 700, color: muted, letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 6 }
const field = { width: '100%', padding: '10px 12px', fontSize: 14, fontFamily: sans, color: ink, background: '#FFFFFF', border: '1.5px solid rgba(14,42,92,0.14)', borderRadius: 9 }
const miniField = { ...field, padding: '7px 10px', fontSize: 13 }

/**
 * Create or edit one task. `task` is null for a new one; `kind` presets the
 * kind from the + Add menu. Files are uploaded against the task's id before
 * the first save, which is why a new task gets its id up front (newTaskId).
 */
export function TaskDialog({ classId, clazz, syllabusId, module, topic, task, kind, teacherId, onClose, onSaved }) {
  const editing = !!task
  const { overlayProps, panelProps } = useDialogBehavior(onClose, { labelledBy: 'task-dialog-title', closeOnBackdrop: false })
  const [taskId] = useState(() => task?.id ?? newTaskId())
  const [form, setForm] = useState({
    kind: task?.kind ?? kind ?? 'activity',
    title: task?.title ?? '',
    instructions_markdown: task?.instructions_markdown ?? '',
    attachments: task?.attachments ?? [],
    opens_at: task?.opens_at ?? '',
    due_at: task?.due_at ?? '',
    points: task?.points ?? '',
    // Where it counts in the class record (owner decision 2026-09-13). Both
    // blank means "for information only", which is what every task was.
    component_id: task?.component_id ?? '',
    grading_period_id: task?.grading_period_id ?? '',
    // The submission bin (plan section 9): opt-in per task, off by default,
    // and never on a paper exam.
    accepts_submissions: task?.accepts_submissions === true,
  })
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))

  /* The class's gradebook, for the Counts toward selects. Read here rather
     than through the record page's bundle because the dialog needs only the
     components and periods, and a class with no Grade Config gets a link
     instead of the selects. */
  const { data: gradebook } = useQuery({
    queryKey: ['fs-gradebook-lite', classId],
    queryFn: async () => {
      const snap = await getDoc(doc(db, 'gradebooks', classId))
      return snap.exists() ? snap.data() : null
    },
  })
  const gradable = !!suggestMapping(gradebook, form.kind)
  // The component is guessed from the kind and the component's name (a quiz
  // to Written Works, an activity to Performance Tasks, an exam to Quarterly
  // Assessment...) until the teacher picks one themselves; then the pick
  // stands through later kind changes. A task being edited opens on what it
  // has.
  const [mappingTouched, setMappingTouched] = useState(!!task?.component_id)
  useEffect(() => {
    if (mappingTouched || !gradebook) return
    const guess = suggestMapping(gradebook, form.kind)
    if (!guess) return
    setForm((f) => ({ ...f, component_id: guess.component_id, grading_period_id: guess.grading_period_id }))
  }, [gradebook, form.kind, mappingTouched])
  const setMapping = (key) => (e) => {
    setMappingTouched(true)
    setForm((f) => ({ ...f, [key]: e.target.value }))
  }
  const countsToward = taskCountsTowardRecord(form)
  const [preview, setPreview] = useState(false)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(null) // 'draft' | 'publish' | 'save'

  // Attachment sub-form: the same three-button pattern the Syllabus page's
  // material editor uses -- pick a route, fill the small form, it lands in
  // the list. Here the two routes are a file and a link.
  const [adding, setAdding] = useState(null) // null | 'file' | 'link'
  const [attTitle, setAttTitle] = useState('')
  const [attUrl, setAttUrl] = useState('')
  const [uploading, setUploading] = useState(false)
  const [attError, setAttError] = useState('')
  const resetAttach = () => { setAdding(null); setAttTitle(''); setAttUrl(''); setAttError('') }

  async function onFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    setAttError('')
    try {
      const url = await uploadTaskFile(classId, taskId, file)
      setForm((f) => ({ ...f, attachments: [...f.attachments, { title: attTitle.trim() || file.name, resource_type: 'file', url }] }))
      resetAttach()
    } catch (err) {
      setAttError(err.message)
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }

  function addLink() {
    if (!isSafeLink(attUrl)) {
      setAttError(attUrl.trim() ? 'That is not a valid link. It should start with https://' : 'Paste the link.')
      return
    }
    setForm((f) => ({ ...f, attachments: [...f.attachments, { title: attTitle.trim() || attUrl.trim(), resource_type: 'link', url: attUrl.trim() }] }))
    resetAttach()
  }

  const removeAttachment = (i) => setForm((f) => ({ ...f, attachments: f.attachments.filter((_, j) => j !== i) }))

  function validate() {
    return taskTitleError(form.title)
      || taskKindError(form.kind)
      || taskWindowError(form.opens_at, form.due_at)
      || taskAttachmentsError(form.attachments)
  }

  const fields = () => ({
    ...form,
    title: form.title.trim(),
    // A paper exam is handed in on paper; the box is hidden for it and the
    // field is written false so a kind change cannot leave a bin open.
    accepts_submissions: form.kind === 'exam' ? false : form.accepts_submissions === true,
    // A task edited from the "Not under a sub-module" list keeps the ids it
    // has; one opened under a sub-module is pinned to that sub-module.
    syllabus_id: topic ? (syllabusId ?? null) : (task?.syllabus_id ?? null),
    module_id: module?.id ?? task?.module_id ?? null,
    topic_id: topic?.id ?? task?.topic_id ?? null,
  })

  /**
   * mode 'draft'   save unpublished (a new task, or a draft being edited)
   *      'publish' save and publish; a first publish notifies the roster
   *      'save'    a published task's edits -- saved without notifying again
   */
  async function save(mode) {
    const problem = validate()
    if (problem) { setError(problem); return }
    setError('')
    setSaving(mode)
    const f = fields()
    try {
      if (!editing) {
        await createTask({ classId, teacherId, id: taskId, task: { ...f, status: 'draft' } })
      }
      if (mode === 'publish') {
        await publishTask({
          taskId,
          task: { class_id: classId, ...(task ?? {}), ...f },
          teacherId,
          studentIds: clazz?.student_ids ?? [],
          changes: editing ? f : {},
        })
      } else if (editing) {
        await updateTask(taskId, mode === 'save' ? f : { ...f, status: 'draft' })
      }
      // A published task with a component and points owns a column in the
      // class record, created on publish and kept in step by later saves
      // (a retitled task retitles its column). A draft creates nothing.
      if (mode === 'publish' || mode === 'save') {
        try {
          await syncTaskToRecord({ classId, task: { ...f, id: taskId } })
        } catch (err) {
          // The task is published; the column can be recreated by saving it
          // again. Said in the toast rather than failing the publish.
          console.error('class task published but its record column was not written', err)
          toast.error('Published, but the Class Record column could not be added. Open the task and save it again.')
        }
      }
      onSaved(mode)
    } catch (err) {
      // The teacher gets a sentence; the reason stays here for whoever is
      // asked why (a rule not yet deployed reads as permission-denied).
      console.error('class task save failed', err)
      setError(mode === 'publish'
        ? 'The task could not be published. Check your connection and try again.'
        : 'The task could not be saved. Check your connection and try again.')
      setSaving(null)
    }
  }

  const published = task?.status === 'published'
  const heading = editing ? `Edit ${KIND_LABEL[form.kind].toLowerCase()}` : `New ${KIND_LABEL[form.kind].toLowerCase()}`

  return (
    <div {...overlayProps} className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto" style={{ background: 'rgba(10,20,40,0.55)', padding: 24 }}>
      <div {...panelProps} style={{ background: '#FFFFFF', border: `1px solid ${line}`, borderRadius: 18, padding: 26, width: '100%', maxWidth: 640 }}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 id="task-dialog-title" style={{ ...serif, fontSize: 21, color: ink, margin: 0 }}>{heading}</h3>
            <p style={{ fontSize: 12.5, color: muted, margin: '4px 0 0' }}>
              {topic?.title ?? 'Sub-module'} · {published ? 'published — students see it now' : 'draft — students cannot see this yet'}
            </p>
          </div>
          <button type="button" onClick={onClose} style={{ fontSize: 13, fontWeight: 600, color: muted, background: 'none', border: 'none', cursor: 'pointer' }}>Close</button>
        </div>

        <div className="mt-5 grid gap-4" style={{ gridTemplateColumns: 'minmax(0,1fr) minmax(0,2fr)' }}>
          <div>
            <label style={label} htmlFor="task-kind">Kind</label>
            <select id="task-kind" className="ak-input" value={form.kind} onChange={set('kind')} style={{ ...field, cursor: 'pointer' }}>
              <option value="activity">Activity</option>
              <option value="assignment">Assignment</option>
              <option value="exam">Exam (paper)</option>
              <option value="other">Other task</option>
            </select>
          </div>
          <div>
            <label style={label} htmlFor="task-title">Title</label>
            <input id="task-title" className="ak-input" value={form.title} onChange={set('title')} maxLength={TASK_TITLE_MAX} placeholder="e.g. Lab report 1 — Newton's second law" style={field} />
          </div>
        </div>

        <div className="mt-4">
          <div className="flex items-center justify-between">
            <label style={{ ...label, marginBottom: 0 }} htmlFor="task-instructions">Instructions</label>
            <button type="button" onClick={() => setPreview((p) => !p)} style={{ fontSize: 11.5, fontWeight: 600, color: blueText, background: 'none', border: 'none', cursor: 'pointer' }}>
              {preview ? 'Write' : 'Preview'}
            </button>
          </div>
          {preview ? (
            <div style={{ marginTop: 6, minHeight: 96, padding: '10px 12px', border: '1.5px dashed rgba(14,42,92,0.14)', borderRadius: 9, fontSize: 14 }}>
              {form.instructions_markdown.trim() ? <Markdown text={form.instructions_markdown} /> : <span style={{ color: faint }}>Nothing written yet.</span>}
            </div>
          ) : (
            <textarea
              id="task-instructions"
              className="ak-input"
              rows={4}
              value={form.instructions_markdown}
              onChange={set('instructions_markdown')}
              placeholder="What should the student do, and how will it be checked? Markdown works: **bold**, lists, headings."
              style={{ ...field, marginTop: 6, resize: 'vertical' }}
            />
          )}
        </div>

        {/* Attachments */}
        <div className="mt-4" style={{ background: 'rgba(14,42,92,0.03)', border: `1px solid ${line}`, borderRadius: 11, padding: '12px 14px' }}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span style={{ ...label, marginBottom: 0 }}>Attachments</span>
            {!adding && (
              <span style={{ display: 'inline-flex', gap: 6 }}>
                {uploadsPossible() && (
                  <button type="button" onClick={() => setAdding('file')} style={smallBtn}>📄 Upload file</button>
                )}
                <button type="button" onClick={() => setAdding('link')} style={smallBtn}>🔗 Paste link</button>
              </span>
            )}
          </div>

          {form.attachments.length > 0 && (
            <div className="mt-2 flex flex-col gap-1.5">
              {form.attachments.map((a, i) => {
                const meta = RESOURCE_META[a.resource_type] ?? RESOURCE_META.file
                return (
                  <div key={`${a.url}-${i}`} className="flex items-center gap-2" style={{ fontSize: 13, color: ink }}>
                    <span aria-hidden="true">{meta.icon}</span>
                    <span style={{ minWidth: 0, overflowWrap: 'anywhere', fontWeight: 600 }}>{a.title}</span>
                    <button type="button" onClick={() => removeAttachment(i)} aria-label={`Remove ${a.title}`} title="Remove" style={{ marginLeft: 'auto', color: muted, background: 'none', border: 'none', cursor: 'pointer', fontWeight: 700 }}>×</button>
                  </div>
                )
              })}
            </div>
          )}
          {form.attachments.length === 0 && !adding && (
            <p style={{ fontSize: 12.5, color: faint, margin: '6px 0 0' }}>A template, a rubric, a reviewer — anything the student should follow.</p>
          )}

          {adding && (
            <div className="mt-3" style={{ background: '#FFFFFF', border: `1px solid ${line}`, borderRadius: 9, padding: 12 }}>
              <div className="flex items-center justify-between">
                <span style={{ fontSize: 12.5, fontWeight: 700, color: ink }}>{adding === 'file' ? '📄 Upload file' : '🔗 Paste link'}</span>
                <button type="button" onClick={resetAttach} aria-label="Cancel adding this attachment" title="Cancel" style={{ color: muted, background: 'none', border: 'none', cursor: 'pointer', fontWeight: 700 }}>×</button>
              </div>
              <input
                className="ak-input"
                value={attTitle}
                onChange={(e) => setAttTitle(e.target.value)}
                placeholder={adding === 'file' ? 'Display title (optional, defaults to the file name)' : 'Link title (e.g. Report template)'}
                style={{ ...miniField, marginTop: 8 }}
              />
              {adding === 'file' ? (
                <div className="mt-2 flex items-center gap-2">
                  <input type="file" disabled={uploading} onChange={onFile} style={{ fontSize: 12.5 }} />
                  {uploading && <span style={{ fontSize: 12.5, color: blueText }}>Uploading…</span>}
                </div>
              ) : (
                <>
                  <input
                    className="ak-input"
                    type="url"
                    value={attUrl}
                    onChange={(e) => setAttUrl(e.target.value)}
                    placeholder="https://drive.google.com/…"
                    style={{ ...miniField, marginTop: 8 }}
                  />
                  <p style={{ ...mono, fontSize: 11, color: faint, margin: '6px 0 0', lineHeight: 1.5 }}>{LINK_HINT}</p>
                  <div className="mt-2 flex justify-end gap-2">
                    <button type="button" onClick={resetAttach} style={{ ...smallBtn, color: muted, borderColor: 'transparent' }}>Cancel</button>
                    <button type="button" onClick={addLink} style={{ ...smallBtn, color: '#FAFAF6', background: navy, borderColor: navy }}>Add link</button>
                  </div>
                </>
              )}
              {attError && (
                <p role="alert" style={{ fontSize: 12.5, color: red, background: 'rgba(192,57,43,0.07)', border: '1px solid rgba(192,57,43,0.3)', borderRadius: 8, padding: '7px 10px', margin: '8px 0 0' }}>{attError}</p>
              )}
            </div>
          )}
        </div>

        <div className="mt-4 grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
          <div>
            <label style={label} htmlFor="task-opens">Opens at</label>
            <input id="task-opens" className="ak-input" type="datetime-local" value={form.opens_at} onChange={set('opens_at')} style={field} />
          </div>
          <div>
            <label style={label} htmlFor="task-due">Due at</label>
            <input id="task-due" className="ak-input" type="datetime-local" value={form.due_at} onChange={set('due_at')} style={field} />
          </div>
          <div>
            <label style={label} htmlFor="task-points">Points{gradable ? '' : ' (optional)'}</label>
            <input id="task-points" className="ak-input" type="number" min="0" step="1" value={form.points} onChange={set('points')} placeholder="—" style={field} />
          </div>
        </div>
        <p style={{ fontSize: 11.5, color: faint, margin: '8px 0 0', lineHeight: 1.45 }}>
          Leave a date blank if it does not apply.
        </p>

        {/* The submission bin. Hidden for a paper exam: nothing is handed in
            through an app for one. */}
        {form.kind !== 'exam' && (
          <div className="mt-4" style={{ background: 'rgba(14,42,92,0.03)', border: `1px solid ${line}`, borderRadius: 11, padding: '12px 14px' }}>
            <label className="flex items-start gap-2.5" style={{ cursor: 'pointer' }}>
              <input
                type="checkbox"
                id="task-accepts-submissions"
                checked={form.accepts_submissions}
                onChange={(e) => setForm((f) => ({ ...f, accepts_submissions: e.target.checked }))}
                style={{ marginTop: 3, accentColor: navy, width: 15, height: 15 }}
              />
              <span>
                <span style={{ display: 'block', fontSize: 13, fontWeight: 600, color: ink }}>Accept submissions through the app</span>
                <span style={{ display: 'block', fontSize: 11.5, color: faint, marginTop: 2, lineHeight: 1.45 }}>
                  {form.accepts_submissions
                    ? 'Students hand in a file or a link on their class page, and can replace it until you untick this — unticking is how the bin closes. You see who submitted and when; grading stays in the class record.'
                    : 'Students hand in a file or a link on their class page. You see who submitted and when; grading stays in the class record.'}
                </span>
              </span>
            </label>
          </div>
        )}

        {/* Counts toward: the record column this task creates on publish.
            Pre-filled from the kind; "Not graded" leaves the record alone. */}
        <div className="mt-4" style={{ background: 'rgba(14,42,92,0.03)', border: `1px solid ${line}`, borderRadius: 11, padding: '12px 14px' }}>
          <span style={{ ...label, marginBottom: 0 }}>Counts toward</span>
          {gradable ? (
            <>
              <div className="mt-2 grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
                <div>
                  <label style={{ ...label, fontSize: 11.5 }} htmlFor="task-component">Grade component</label>
                  <select id="task-component" className="ak-input" value={form.component_id} onChange={setMapping('component_id')} style={{ ...field, cursor: 'pointer' }}>
                    <option value="">— Not graded —</option>
                    {gradebook.components.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}{c.weight_percent != null ? ` (${c.weight_percent}%)` : ''}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={{ ...label, fontSize: 11.5 }} htmlFor="task-period">Grading period</label>
                  <select id="task-period" className="ak-input" value={form.grading_period_id} onChange={setMapping('grading_period_id')} disabled={!form.component_id} style={{ ...field, cursor: form.component_id ? 'pointer' : 'not-allowed', opacity: form.component_id ? 1 : 0.55 }}>
                    <option value="">—</option>
                    {gradebook.periods.map((p) => (
                      <option key={p.id} value={p.id}>{p.name}{p.locked ? ' (locked)' : ''}</option>
                    ))}
                  </select>
                </div>
              </div>
              <p role="status" style={{ fontSize: 11.5, color: form.component_id && !countsToward ? goldDeep : faint, margin: '8px 0 0', lineHeight: 1.45 }}>
                {!form.component_id
                  ? 'Not graded: the points are for the student’s information and nothing is added to the Class Record.'
                  : countsToward
                    ? `Publishing adds a "${form.title.trim() || 'Untitled'}" column out of ${Number(form.points)} under this component and period in the Class Record. Scores are typed there.`
                    : 'Enter the points it is out of, or the column has nothing to score against.'}
              </p>
            </>
          ) : (
            <p style={{ fontSize: 12, color: muted, margin: '6px 0 0', lineHeight: 1.5 }}>
              This class has no Grade Config yet, so the task cannot count toward a grade — the points are for the student’s information.{' '}
              <Link to={`/teacher/classes/${classId}/grading`} style={{ color: blueText, fontWeight: 600 }}>Open Grade Config →</Link>
            </p>
          )}
        </div>

        {error && (
          <p role="alert" className="mt-4" style={{ fontSize: 13, color: red, background: 'rgba(192,57,43,0.07)', border: '1px solid rgba(192,57,43,0.3)', borderRadius: 10, padding: '10px 12px', margin: '16px 0 0' }}>{error}</p>
        )}

        <div className="mt-5 flex flex-wrap gap-3">
          {published ? (
            <button
              type="button"
              onClick={() => save('save')}
              disabled={!!saving || uploading}
              className="transition hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ flex: 1, minWidth: 170, padding: '11px 18px', fontSize: 13.5, fontWeight: 700, fontFamily: sans, color: '#FAFAF6', background: navy, border: 'none', borderRadius: 10, cursor: 'pointer', boxShadow: `0 3px 0 ${navyDeep}` }}
            >
              {saving ? 'Saving…' : 'Save changes'}
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={() => save('publish')}
                disabled={!!saving || uploading}
                className="transition hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ flex: 1, minWidth: 170, padding: '11px 18px', fontSize: 13.5, fontWeight: 700, fontFamily: sans, color: '#FAFAF6', background: navy, border: 'none', borderRadius: 10, cursor: 'pointer', boxShadow: `0 3px 0 ${navyDeep}` }}
              >
                {saving === 'publish' ? 'Publishing…' : 'Publish'}
              </button>
              <button
                type="button"
                onClick={() => save('draft')}
                disabled={!!saving || uploading}
                className="transition hover:brightness-95 disabled:opacity-50"
                style={{ flex: 1, minWidth: 140, padding: '11px 18px', fontSize: 13.5, fontWeight: 700, fontFamily: sans, color: navy, background: '#FFFFFF', border: '1.5px solid rgba(14,42,92,0.25)', borderRadius: 10, cursor: 'pointer' }}
              >
                {saving === 'draft' ? 'Saving…' : 'Save as draft'}
              </button>
            </>
          )}
        </div>
        <p style={{ fontSize: 11.5, color: faint, margin: '10px 0 0', lineHeight: 1.45 }}>
          {published
            ? 'Students were notified when this was published. Saving changes does not notify them again.'
            : 'Publishing notifies every student on the roster. A draft is yours alone until then.'}
        </p>
      </div>
    </div>
  )
}

/** "+ Add" under a sub-module: three task kinds here, a quiz on the Quizzes page. */
function AddMenu({ open, onToggle, onPick }) {
  return (
    <span style={{ position: 'relative', display: 'inline-block' }}>
      <button
        type="button"
        onClick={onToggle}
        aria-haspopup="menu"
        aria-expanded={open}
        style={{ ...smallBtn, color: '#FAFAF6', background: navy, borderColor: navy }}
      >
        + Add
      </button>
      {open && (
        <div role="menu" style={{ position: 'absolute', right: 0, top: 'calc(100% + 4px)', zIndex: 20, minWidth: 160, background: '#FFFFFF', border: `1px solid ${line}`, borderRadius: 10, boxShadow: '0 8px 24px -8px rgba(14,42,92,0.35)', padding: 4 }}>
          {ADD_MENU.map((item) => (
            <button
              key={item.kind}
              type="button"
              role="menuitem"
              onClick={() => onPick(item.kind)}
              className="hover:bg-slate-50"
              style={{ display: 'block', width: '100%', textAlign: 'left', fontSize: 13, fontWeight: 600, fontFamily: sans, color: ink, background: 'none', border: 'none', borderRadius: 7, padding: '8px 10px', cursor: 'pointer' }}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </span>
  )
}

export default function ModulesPage() {
  const { classId } = useParams()
  const navigate = useNavigate()
  const { profile } = useAuth()
  const queryClient = useQueryClient()
  // Read once per mount: the chips only need "now" to the minute, and a value
  // that moved between renders would flip a state mid-paint.
  const [now] = useState(() => Date.now())

  const { data, isLoading, isError } = useQuery({
    queryKey: ['fs-class-modules', classId],
    queryFn: () => loadClassModules(classId),
  })
  const { data: quizzes = [] } = useQuizzes()
  const { data: tasks = [], isError: tasksFailed } = useClassTasks(classId)
  // The roster's names, for a task's submissions list. Chunked at IN_CHUNK
  // inside fetchUsersByIds (T-57); read once for the page, not per task.
  const studentIds = data?.clazz?.student_ids ?? []
  const { data: rosterData } = useQuery({
    queryKey: ['fs-class-roster-lite', classId, studentIds.join(',')],
    queryFn: () => fetchUsersByIds(studentIds),
    enabled: studentIds.length > 0,
  })
  const roster = Array.isArray(rosterData) ? rosterData : []

  const [menuFor, setMenuFor] = useState(null)
  const [dialog, setDialog] = useState(null) // { module, topic, task, kind }

  // The quizzes assigned to this class; class_ids is the canonical link and
  // the scalar class_id the legacy one, as Scaffold Topics reads them.
  const classQuizzes = useMemo(
    () => quizzes.filter((q) => (q.class_ids ?? []).includes(classId) || q.class_id === classId),
    [quizzes, classId],
  )
  const tasksByTopic = useMemo(() => {
    const map = new Map()
    for (const t of tasks) {
      const key = t.topic_id ?? ''
      if (!map.has(key)) map.set(key, [])
      map.get(key).push(t)
    }
    return map
  }, [tasks])

  const refreshTasks = () => queryClient.invalidateQueries({ queryKey: classTasksKey(classId) })

  function pick(module, topic, kind) {
    setMenuFor(null)
    if (kind === 'quiz') {
      navigate(`/teacher/quizzes?topic=${encodeURIComponent(topic.id ?? '')}`)
      return
    }
    setDialog({ module, topic, task: null, kind })
  }

  async function remove(task) {
    const published = task.status === 'published'
    const ok = await confirmDialog({
      title: `Delete "${task.title}"?`,
      message: published
        ? `It is removed from every student's Modules tab and dashboard. This cannot be undone.${task.component_id ? ' Its column in the Class Record stays, with any scores typed into it — delete that from the record if it should go too.' : ''}`
        : 'It was never published, so no student has seen it. This cannot be undone.',
      confirmLabel: `Delete ${KIND_LABEL[task.kind]?.toLowerCase() ?? 'task'}`,
      tone: 'danger',
      ...(published ? { typeToConfirm: 'DELETE' } : {}),
    })
    if (!ok) return
    try {
      await deleteTask(task.id)
      toast.success('Deleted.')
      refreshTasks()
    } catch (err) {
      console.error('class task delete failed', err)
      toast.error('The task could not be deleted. Check your connection and try again.')
    }
  }

  if (isLoading) return <SkeletonList count={3} height={140} label="Loading modules" />
  if (isError || !data?.clazz) {
    return (
      <p role="alert" style={{ fontSize: 13, color: red, background: 'rgba(192,57,43,0.07)', border: '1px solid rgba(192,57,43,0.3)', borderRadius: 10, padding: '10px 12px' }}>
        The modules could not be loaded. Check your connection and refresh the page.
      </p>
    )
  }

  const { clazz, syllabus, syllabusId } = data
  const modules = syllabus?.modules ?? []
  const knownTopicIds = new Set(modules.flatMap((m) => (m.topics ?? []).map((t) => t.id).filter(Boolean)))
  const unplaced = tasks.filter((t) => !t.topic_id || !knownTopicIds.has(t.topic_id))

  const header = (
    <div className="mb-[22px] flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="text-[clamp(26px,3.5vw,32px)]" style={{ ...serif, lineHeight: 1.1, letterSpacing: '-0.01em', margin: '0 0 4px', color: ink, display: 'flex', alignItems: 'center' }}>
          Modules
          <InfoTooltip label="What this tab is for">
            Manage the learning content for this class. Add activities, assignments, and exams to
            each sub-module. Edit learning materials on the Syllabus page.
          </InfoTooltip>
        </h1>
      </div>
      <Link to="/teacher/syllabus" style={{ ...smallBtn, textDecoration: 'none', padding: '8px 14px' }}>Open Syllabus page</Link>
    </div>
  )

  if (modules.length === 0) {
    return (
      <div>
        {header}
        <div className="text-center" style={{ background: '#FFFFFF', border: `1px solid ${line}`, borderRadius: 16, padding: 40 }}>
          <p style={{ color: muted, margin: '0 0 6px' }}>No modules yet for this class.</p>
          <p style={{ fontSize: 13, color: faint, margin: 0, maxWidth: 520, marginInline: 'auto', lineHeight: 1.5 }}>
            Build a syllabus and assign it to this class on the Syllabus page. Its modules and sub-modules appear here and on every student's Modules tab.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div>
      {header}

      {tasksFailed && (
        <p role="alert" className="mb-4" style={{ fontSize: 13, color: red, background: 'rgba(192,57,43,0.07)', border: '1px solid rgba(192,57,43,0.3)', borderRadius: 10, padding: '10px 12px' }}>
          The class's activities, assignments and exams could not be loaded. The modules below are complete; refresh to try again.
        </p>
      )}

      <div className="flex flex-col gap-6">
        {modules.map((m, mi) => (
          <div key={m.id ?? mi} style={{ background: '#FFFFFF', border: `1px solid ${line}`, borderRadius: 16, padding: 20 }}>
            <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 pb-4 mb-4">
              <span style={{ ...mono, fontSize: 11, fontWeight: 700, color: navy, background: 'rgba(14,42,92,0.07)', padding: '4px 9px', borderRadius: 7 }}>M{mi + 1}</span>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 16, fontWeight: 700, color: ink }}>Module {mi + 1} · {m.title || 'Untitled module'}</div>
                {m.description && <div style={{ fontSize: 13.5, color: muted, marginTop: 2, whiteSpace: 'pre-wrap' }}>{m.description}</div>}
              </div>
              {m.published === false && (
                <span title="Unpublished on the Syllabus page. Students do not see this module or anything under it." style={{ fontSize: 11, fontWeight: 700, color: muted, background: 'rgba(14,42,92,0.05)', border: '1px solid rgba(14,42,92,0.14)', borderRadius: 999, padding: '3px 10px' }}>
                  Hidden from students
                </span>
              )}
            </div>

            <div className="flex flex-col gap-6 pl-2">
              {(m.topics ?? []).map((t, ti) => {
                const resources = t.resources ?? []
                const linkedQuizzes = quizzesForTopic(t.id, classQuizzes)
                const topicTasks = t.id ? tasksByTopic.get(t.id) ?? [] : []
                const empty = resources.length === 0 && linkedQuizzes.length === 0 && topicTasks.length === 0
                const key = t.id ?? `${mi}-${ti}`
                return (
                  <div key={key} className="border-l-2 pl-4 relative" style={{ borderColor: 'rgb(226 232 240)' }} data-testid="topic">
                    <div className="absolute -left-[5px] top-1.5 w-2.5 h-2.5 rounded-full" style={{ background: 'rgb(203 213 225)' }} />
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div style={{ fontSize: 14, fontWeight: 600, color: ink }}>
                        Sub-module {ti + 1} · {t.title || 'Untitled sub-module'}
                      </div>
                      {t.id && (
                        <AddMenu
                          open={menuFor === key}
                          onToggle={() => setMenuFor((cur) => (cur === key ? null : key))}
                          onPick={(kind) => pick(m, t, kind)}
                        />
                      )}
                    </div>

                    {empty ? (
                      <p style={{ fontSize: 12.5, color: faint, margin: '8px 0 0' }}>Nothing here yet for this class.</p>
                    ) : (
                      <div className="mt-3 flex flex-col gap-3">
                        {resources.length > 0 && (
                          <div>
                            <div className="flex flex-wrap items-center justify-between gap-2" style={{ marginBottom: 6 }}>
                              <span style={{ fontSize: 10.5, fontWeight: 700, color: faint, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Materials</span>
                              <Link to="/teacher/syllabus" style={{ fontSize: 11.5, fontWeight: 600, color: blueText }}>Edit materials on the Syllabus page</Link>
                            </div>
                            <div className="flex flex-col gap-1.5">
                              {resources.map((r, ri) => <MaterialRow key={r.id ?? r._key ?? ri} resource={r} />)}
                            </div>
                          </div>
                        )}
                        {linkedQuizzes.length > 0 && (
                          <div>
                            <span style={{ display: 'block', fontSize: 10.5, fontWeight: 700, color: faint, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 6 }}>Quizzes</span>
                            <div className="flex flex-col gap-1.5">
                              {linkedQuizzes.map((q) => <QuizRow key={q.id} quiz={q} classId={classId} now={now} />)}
                            </div>
                          </div>
                        )}
                        {topicTasks.length > 0 && (
                          <div>
                            <span style={{ display: 'block', fontSize: 10.5, fontWeight: 700, color: faint, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 6 }}>Activities, assignments &amp; exams</span>
                            <div className="flex flex-col gap-1.5">
                              {topicTasks.map((task) => (
                                <TaskRow
                                  key={task.id}
                                  task={task}
                                  now={now}
                                  classId={classId}
                                  roster={roster}
                                  onEdit={() => setDialog({ module: m, topic: t, task, kind: task.kind })}
                                  onDelete={() => remove(task)}
                                />
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        ))}

        {/* A task whose sub-module was removed from the syllabus, or that was
            never linked to one. Kept visible: a task the teacher cannot find
            cannot be edited or deleted, and the student still sees it. */}
        {unplaced.length > 0 && (
          <div style={{ background: '#FFFFFF', border: '1px solid rgba(245,197,24,0.5)', borderRadius: 16, padding: 20 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: ink, marginBottom: 4 }}>Not under a sub-module</div>
            <p style={{ fontSize: 12.5, color: muted, margin: '0 0 12px' }}>
              These tasks point at a sub-module that is no longer in the syllabus. Students still see them on their dashboard; edit one to keep it, or delete it.
            </p>
            <div className="flex flex-col gap-1.5">
              {unplaced.map((task) => (
                <TaskRow
                  key={task.id}
                  task={task}
                  now={now}
                  classId={classId}
                  roster={roster}
                  onEdit={() => setDialog({ module: null, topic: null, task, kind: task.kind })}
                  onDelete={() => remove(task)}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {dialog && (
        <TaskDialog
          classId={classId}
          clazz={clazz}
          syllabusId={syllabusId}
          module={dialog.module}
          topic={dialog.topic}
          task={dialog.task}
          kind={dialog.kind}
          teacherId={profile?.id}
          onClose={() => setDialog(null)}
          onSaved={(mode) => {
            setDialog(null)
            refreshTasks()
            toast.success(mode === 'publish' ? 'Published. Every student on the roster has been notified.' : mode === 'draft' ? 'Saved as a draft.' : 'Saved.')
          }}
        />
      )}
    </div>
  )
}
