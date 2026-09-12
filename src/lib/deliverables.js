/**
 * Deliverables: the one shape a quiz and a class task share once a screen
 * has to say "this is open", "this is due today", "this closed on Friday".
 *
 * Owned by the Data/logic lane (see OWNERSHIP.md). Pure -- no Firebase, no
 * React -- so the student's dashboard, the student's class page, the
 * teacher's Modules tab and the teacher's Quizzes page all read a window the
 * same way and print the same sentence for it. Before this, the student's
 * Quizzes tab showed a "Closed" chip and nothing about when a quiz opens or
 * closes, and activities, assignments and paper exams had no home a student
 * could see at all (docs/plans/modules-content-and-deliverables.md).
 *
 * Dates. A quiz stores `opens_at` / `closes_at` as the zone-less
 * 'YYYY-MM-DDTHH:mm' string a datetime-local input gives, and a class task
 * stores `opens_at` / `due_at` the same way (plan D3). `new Date(str)` reads
 * that as LOCAL time, which is exactly how canStart() and lifecycleOf() in
 * quizAttempts.js already read it, so a quiz the player calls closed is
 * closed here too. One demo machine, one zone; a teacher and a student in
 * different zones would disagree, and that is recorded in the plan, not
 * fixed here.
 */
import { finishedAttempts } from './quizAttempts'

/** The label a chip shows for each kind. 'other' reads as a plain task. */
export const KIND_LABEL = Object.freeze({
  quiz: 'Quiz',
  activity: 'Activity',
  assignment: 'Assignment',
  exam: 'Exam',
  other: 'Task',
})

/** The kinds a class task may carry, in the order a menu offers them. */
export const TASK_KINDS = Object.freeze(['activity', 'assignment', 'exam', 'other'])

export const STATES = Object.freeze(['scheduled', 'open', 'due_today', 'overdue', 'closed', 'done'])

/**
 * The zone-less 'YYYY-MM-DDTHH:mm' string a quiz or task stores, as a Date,
 * or null when there is nothing there or it does not parse.
 *
 * A Date passed in comes back as is, so a caller holding a value it already
 * parsed loses nothing. Anything else -- a Firestore Timestamp, a number --
 * is not a window this app writes and reads as "no date" rather than as a
 * guess.
 */
export function parseWindowDate(value) {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value
  if (typeof value !== 'string' || !value.trim()) return null
  const d = new Date(value.trim())
  return Number.isNaN(d.getTime()) ? null : d
}

/**
 * Where the student opens a task: the class's Modules tab with the task's
 * sub-module scrolled into view and highlighted -- the `?tab=topics&topic=`
 * deep link that tab already handles for review guides. Also the link a
 * publish notification carries (lib/classTasks.js), so it is defined once.
 */
export function taskHref(classId, topicId) {
  const base = `/student/classes/${classId}?tab=topics`
  return topicId ? `${base}&topic=${encodeURIComponent(topicId)}` : base
}

/** Where the student sits a quiz: the player route in App.jsx. */
export function quizHref(classId, quizId) {
  return `/student/classes/${classId}/quizzes/${quizId}`
}

/**
 * A quiz reaches a student if it is assigned to everyone ('all', or a legacy
 * undefined) or names them. The same rule student/scaffolding.js applies on
 * the class page; kept here as well because a hook may not import a route.
 */
export function assignedToStudent(quiz, studentId) {
  const a = quiz?.assigned_to
  return !a || a === 'all' || (Array.isArray(a) && a.includes(studentId))
}

/**
 * A quiz as a deliverable.
 *
 * `closes_at` is the deadline: after it the player refuses to start, so it
 * is the date a student has to plan around. A quiz the teacher closed by
 * hand (`status: 'closed'`) is closed whatever its dates say, as
 * lifecycleOf() already treats it. A finished attempt -- submitted or
 * graded, never one still in progress -- makes it done: the student has
 * nothing left to do even if the window is still open.
 *
 * @param {object} quiz the quizzes/{id} document, with `id`
 * @param {object} ctx
 * @param {string} ctx.classId  the class this listing is for (a quiz may be
 *   assigned to several; the player route needs the one being viewed)
 * @param {string} [ctx.className]
 * @param {object[]} [ctx.attempts]  this student's attempts at this quiz
 * @param {number|Date} [ctx.now]
 */
export function fromQuiz(quiz, { classId, className = '', attempts = [], now = Date.now() } = {}) {
  const d = {
    id: quiz?.id ?? '',
    source: 'quiz',
    kind: 'quiz',
    title: quiz?.title ?? 'Quiz',
    classId,
    className,
    topicId: quiz?.topic_id ?? null,
    opensAt: parseWindowDate(quiz?.opens_at),
    dueAt: parseWindowDate(quiz?.closes_at),
    closedByTeacher: quiz?.status === 'closed',
    done: finishedAttempts(attempts).length > 0,
    href: quizHref(classId, quiz?.id ?? ''),
  }
  d.state = stateOf(d, now)
  return d
}

/**
 * A class task (activity, assignment, paper exam) as a deliverable.
 *
 * Nothing is submitted through the app (plan D7), so a task is never done
 * and never closed -- past its deadline it is overdue, which is a fact about
 * the date, not a lock. The attachments and instructions ride along so a
 * screen listing tasks under a sub-module has what it needs to render them.
 *
 * @param {object} task the class_tasks/{id} document, with `id`
 * @param {object} ctx
 * @param {string} [ctx.className]
 * @param {number|Date} [ctx.now]
 */
export function fromTask(task, { className = '', now = Date.now() } = {}) {
  const kind = TASK_KINDS.includes(task?.kind) ? task.kind : 'other'
  const d = {
    id: task?.id ?? '',
    source: 'task',
    kind,
    title: task?.title ?? KIND_LABEL[kind],
    classId: task?.class_id ?? '',
    className,
    topicId: task?.topic_id ?? null,
    moduleId: task?.module_id ?? null,
    opensAt: parseWindowDate(task?.opens_at),
    dueAt: parseWindowDate(task?.due_at),
    points: pointsOf(task?.points),
    attachments: Array.isArray(task?.attachments) ? task.attachments : [],
    instructions: task?.instructions_markdown ?? '',
    status: task?.status ?? 'draft',
    closedByTeacher: false,
    done: false,
    href: taskHref(task?.class_id ?? '', task?.topic_id ?? null),
  }
  d.state = stateOf(d, now)
  return d
}

/** Informational points, or null when none were given. */
function pointsOf(raw) {
  if (raw == null || raw === '') return null
  const n = Number(raw)
  return Number.isFinite(n) ? n : null
}

function toMs(value) {
  return value instanceof Date ? value.getTime() : Number(value)
}

function sameLocalDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

/**
 * Where a deliverable stands right now.
 *
 * Order matters and mirrors lifecycleOf(): done beats everything (the
 * student has finished, whatever the window says); a quiz that can no longer
 * be started is closed before anything about opening is considered; then
 * not-yet-open, then past-due, then due-today, then plain open.
 *
 * 'closed' is reserved for a quiz: past closes_at, or closed by the teacher,
 * the player will refuse it, so nothing can be done. A task past due_at is
 * 'overdue' because nothing enforces a task's deadline -- the student can
 * still hand the work in on paper tomorrow, and the chip should say late,
 * not shut.
 *
 * Comparisons are strict, as canStart() has them: at the exact minute a
 * window closes the quiz is still open.
 */
export function stateOf(d, now = Date.now()) {
  const t = toMs(now)
  const nowDate = new Date(t)
  const opens = d?.opensAt ? toMs(d.opensAt) : null
  const due = d?.dueAt ? toMs(d.dueAt) : null

  if (d?.done) return 'done'
  if (d?.source === 'quiz' && (d.closedByTeacher || (due != null && t > due))) return 'closed'
  if (opens != null && t < opens) return 'scheduled'
  if (due != null && t > due) return 'overdue'
  if (due != null && sameLocalDay(new Date(due), nowDate)) return 'due_today'
  return 'open'
}

const DAY_MS = 24 * 60 * 60 * 1000

/** Midnight at the start of the local day `now` falls in. */
function startOfDay(now) {
  const d = new Date(toMs(now))
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

/**
 * Sort key: soonest deadline first, then soonest opening, then title.
 * Undated items sink to the end of whichever bucket they land in.
 */
function compareDeliverables(a, b) {
  const ad = a.dueAt ? toMs(a.dueAt) : Infinity
  const bd = b.dueAt ? toMs(b.dueAt) : Infinity
  if (ad !== bd) return ad - bd
  const ao = a.opensAt ? toMs(a.opensAt) : Infinity
  const bo = b.opensAt ? toMs(b.opensAt) : Infinity
  if (ao !== bo) return ao - bo
  return String(a.title ?? '').localeCompare(String(b.title ?? ''))
}

/** Every deliverable in one list, in the order the dashboard shows them. */
export function sortDeliverables(list) {
  return [...(list ?? [])].sort(compareDeliverables)
}

/**
 * The student's "Up next" sections, each sorted by deadline then opening.
 *
 * overdue     past its deadline and not done -- including a quiz that closed
 *             without an attempt: it is no less missed for being un-startable,
 *             and the chip will say "Closed", not "Overdue", so nothing lies.
 * today       due before this local day ends
 * thisWeek    due within the next seven days
 * later       due further out, or with no deadline at all
 * notYetOpen  opening in the future
 * done        finished (a quiz with a submitted attempt)
 *
 * States are recomputed against `now` here rather than read from the item,
 * so a list built earlier in the session still buckets correctly.
 */
export function bucket(list, now = Date.now()) {
  const out = { overdue: [], today: [], thisWeek: [], later: [], notYetOpen: [], done: [] }
  const weekEnd = startOfDay(now) + 7 * DAY_MS
  for (const d of sortDeliverables(list)) {
    const state = stateOf(d, now)
    if (state === 'done') out.done.push(d)
    else if (state === 'overdue' || state === 'closed') out.overdue.push(d)
    else if (state === 'scheduled') out.notYetOpen.push(d)
    else if (state === 'due_today') out.today.push(d)
    else if (d.dueAt && toMs(d.dueAt) < weekEnd) out.thisWeek.push(d)
    else out.later.push(d)
  }
  return out
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/**
 * "Mon 15 Sep", with the year added only when it is not this year.
 * Formatted by hand rather than through Intl so the sentence is the same on
 * every machine and in every test run -- locale data has changed "Sep" to
 * "Sept" under some ICU versions.
 */
export function formatDay(date, now = Date.now()) {
  const d = new Date(toMs(date))
  const base = `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`
  return d.getFullYear() === new Date(toMs(now)).getFullYear() ? base : `${base} ${d.getFullYear()}`
}

/** "8:00 AM", "11:59 PM", "12:00 AM". */
export function formatTime(date) {
  const d = new Date(toMs(date))
  const h = d.getHours()
  const m = String(d.getMinutes()).padStart(2, '0')
  const hour12 = h % 12 === 0 ? 12 : h % 12
  return `${hour12}:${m} ${h < 12 ? 'AM' : 'PM'}`
}

function formatDayTime(date, now) {
  return `${formatDay(date, now)}, ${formatTime(date)}`
}

/**
 * The one sentence every chip shows for a window. No vendor names, no error
 * text: every branch is something a teacher or a student would say aloud.
 *
 *   scheduled  Opens Mon 15 Sep, 8:00 AM
 *   open       Due Fri 19 Sep, 11:59 PM     · No deadline (undated)
 *   due_today  Due today, 11:59 PM
 *   overdue    Overdue since Thu 18 Sep
 *   closed     Closed Fri 19 Sep            · Closed (by the teacher, no date)
 *   done       Done
 */
export function describeWindow(d, now = Date.now()) {
  switch (stateOf(d, now)) {
    case 'done':
      return 'Done'
    case 'scheduled':
      return `Opens ${formatDayTime(d.opensAt, now)}`
    case 'due_today':
      return `Due today, ${formatTime(d.dueAt)}`
    case 'overdue':
      return `Overdue since ${formatDay(d.dueAt, now)}`
    case 'closed':
      return d.dueAt && !(d.closedByTeacher && toMs(now) <= toMs(d.dueAt))
        ? `Closed ${formatDay(d.dueAt, now)}`
        : 'Closed'
    default:
      return d.dueAt ? `Due ${formatDayTime(d.dueAt, now)}` : 'No deadline'
  }
}
