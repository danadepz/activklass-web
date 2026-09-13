# Plan — Module content, open/due windows, and the student's deliverables view

**Status: in build, 2026-09-13.** Written as a proposal that morning; by the evening the
convoy was mostly through. Where each step stands (the Modules pane keeps this list current):

| Step | Pane | State |
|---|---|---|
| 1 Rules, storage, schema, seed | Backend | done and **deployed 2026-09-13** (owner ran it) — backend `9b99c5f` `5f69451` `ff33ed2` `b75736f`. Proven on the live project from a Node script with custom tokens, against two scratch tasks planted and deleted by the Admin SDK: Carlo (on Newton) reads the published task with the two-field query and is refused the same query without the status filter and a direct read of the draft; Fina (not on Newton) is refused the two-field query; the `(class_id, status)` index is listed; a signed-in `task_files` write, read-URL and delete all succeed. **The seed's three demo tasks are not on the live project** — `seed_demo.py` was committed, not run; whoever reseeds gets them. |
| 2 Shared logic + rules test | Data/logic | done — `c364352` `ded328a` `72982f0` `0063710`; `npm run test:rules` 56/56. |
| 3 Teacher Modules tab | Class detail | done — `74ce9e0` `58d3b64` `662c115` (Keel's work; committed from the Modules pane after that session closed). `modules.test.jsx` (11); **browser walk owed** to Step 6. |
| 4 Student Modules chips + Up next | Student | done — `70de02c` `393cfac` `5061576`; verified headless as Carlo; live task rows blocked on the Step 1 deploy. |
| 5 Quiz card chip + `?topic=` | Quizzes | done — `describeWindow` on every card, `?topic=` preselect, landed with the Generate-dialog work (`9c800db` and before). |
| 6 Verify + ROADMAP entry | Verify | dispatched 2026-09-13 — both halves unblocked once the deploy landed (same day). |

Every prompt in section 6 is paste-ready and self-contained; a pane that receives one
should still read `CLAUDE.md`, `OWNERSHIP.md` and `docs/DATA-MODEL.md` before its first
edit. Sections 1–5 are the plan as proposed and are left as written.

---

## 1. The owner's ideas, restated

1. **Teacher-side content under a module.** The student already sees a class's modules
   (syllabus → modules → sub-modules → materials). The teacher should be able to add, under
   a module, new content of these kinds: a topic, activities, assignments, exams.
2. **Attachments on that content.** PDF, Word, anything — uploaded or linked — because
   students often need a template to follow in the teacher's format.
3. **Open and due indicators.** Quizzes, activities, exams and assignments each show when
   they open (date and time) and their deadline.
4. **Student deliverables view.** The student dashboard lists what they must finish, ordered
   by the dates coming up, as a list or as a calendar.

## 2. What already exists (read before deciding anything)

Derived from the call sites, not from memory. File references are where a pane should look.

| Idea | Already there | Where |
|---|---|---|
| Modules → sub-modules → materials | Yes. `syllabi/{id}.modules[].topics[].resources[]`, `resource_type` ∈ `file` / `link` / `rich_text`. The UI calls a topic a **sub-module**. | `teacher/syllabus.jsx` (`toDraftState`, `TopicResourceEditor`), `student/classes/$classId/index.jsx` (`TopicsTab`), `student/scaffolding.js` (`RESOURCE_META`) |
| Adding a topic under a module | Yes — the Syllabus page adds sub-modules and modules. | `teacher/syllabus.jsx` |
| File upload for materials | Yes, live since 2026-09-12 on Blaze. Any type, < 25 MB, under `learning_materials/{syllabusId}/`. Link paste is a first-class alternative. | `lib/attachments.js` (`uploadAttachment`, `isSafeLink`), `../activklass-backend/storage.rules` |
| Open / close window on a **quiz** | Yes. `opens_at`, `closes_at` (zone-less `YYYY-MM-DDTHH:mm` strings from `datetime-local`), `time_limit_minutes`, `attempts_allowed`, `status`. `lifecycleOf()` derives scheduled / open / past; the player gates with "Not open yet" / "Quiz closed". The teacher's Quizzes page filters by lifecycle. | `lib/quizAttempts.js` (`canStart`, `lifecycleOf`), `teacher/quizzes.$quizId.jsx`, `student/quiz-player.jsx` |
| Window **shown to the student** | **No.** The student's Quizzes tab shows only a "Closed" chip and attempts used. The Modules tab shows linked quizzes with no dates. | `student/classes/$classId/index.jsx` (`QuizzesTab`) |
| Activities / assignments / exams as things a student can see | **No.** They exist only as gradebook columns: `gradebooks/{classId}/assessments/{id}` with `title, kind ('activity' default), component_id, period_id, total_points, date_given, scores{}`. Students may read only the derived `entries` doc — never the assessment, and it carries no instructions, attachments or due date. | `teacher/classes/$classId/record.jsx`, `lib/gradebook.js` |
| Student dashboard "what's due" | **No.** The dashboard reads mastery, attendance, gaps and consent; zero references to quizzes or dates. | `student/index.jsx` |
| Calendar component | **No.** Only a calendar icon exists. | `components/icons.jsx` |
| Telling students something changed | Yes. `notifyStudents({studentIds, classId, type, message, link})` writes one `notifications` doc per student. | `lib/notifications.js` |
| Teacher-side view of a class's modules | **No.** The class detail tabs are Overview · Class Record · Performance · Attendance · Scaffold Topics · Logs. The teacher edits modules on the Syllabus page, which is per syllabus, not per class. | `teacher/classes/$classId/_layout.jsx`, `src/App.jsx:109-115` |

Two facts that shape the design:

- **A syllabus is per teacher and shared across classes** (`syllabi/{id}.class_ids[]`), so a
  due date cannot live on the syllabus tree: the same sub-module is taught to BSIT-C in one
  week and to another section in another. Anything with a date has to be keyed by **class**.
- **Quizzes already are a deliverable with a window.** Nothing about them should be
  duplicated; the new work makes the window *visible* and gives the other kinds a home.

## 3. Decisions (recommended answers; the owner confirms or overrides)

| # | Question | Recommendation | Why |
|---|---|---|---|
| D1 | Where do activities / assignments / exams live? | **New top-level collection `class_tasks/{taskId}`**, one document per task, keyed by `class_id`. Quizzes stay in `quizzes`. | Dates are per class (see above). A separate collection keeps the syllabus document small and lets the student query "everything due for my classes" without loading every syllabus. |
| D2 | What is a task's shape? | `class_id, teacher_id, syllabus_id, module_id, topic_id, kind ('activity' \| 'assignment' \| 'exam' \| 'other'), title, instructions_markdown, attachments[] ({title, resource_type: 'file' \| 'link', url} — the same shape as a material), opens_at, due_at, points (nullable), status ('draft' \| 'published'), created_at, updated_at`. | Reuses the material shape so the student page renders attachments with the code it already has. `points` is informational; grading stays in the class record. |
| D3 | Do dates on tasks and quizzes use one format? | **Yes — the quiz format**, zone-less `YYYY-MM-DDTHH:mm` local strings, until both move together. One helper in `lib/deliverables.js` parses both. | The comparison code must be one function or the two kinds will disagree about "open". Changing the quiz format is a separate, riskier task. |
| D4 | Where does a teacher add a task? | **A new Modules tab on the class detail page** (`teacher/classes/$classId/modules.jsx`), mirroring the student's Modules tab, with **+ Add** under each sub-module. Materials stay editable on the Syllabus page; the tab links there. | The teacher sees exactly what the student sees, per class. The Syllabus page cannot hold per-class dates. |
| D5 | How does "exam" fit? | An **online** exam is a quiz (already has windows, timer, attempts). An **in-person or paper** exam is a `class_tasks` document of kind `exam` with no submission: it puts the date, the coverage and any reviewer/template on the student's calendar. | Nothing new to build for online exams. |
| D6 | Where do task attachments go in Storage? | New path `task_files/{classId}/{taskId}/{fileName}`; signed-in read, signed-in write, any type, < 25 MB (same cap as materials). **Cross-repo: `storage.rules`.** | Keeping them under `learning_materials/{syllabusId}/` would key a class's file by a syllabus id and lose it when the class changes syllabus. |
| D7 | Do students submit work through the app? | **Not in this plan.** The ask is templates *down* to students and deadlines *visible* to them. A "Mark as done" tick for the student's own list is a possible later step; file submissions are a separate decision with grading implications. | Scope. The defense demo needs the deliverables view, not an LMS dropbox. |
| D8 | Late submissions / a grace window? | Not modelled. `due_at` is the deadline shown; nothing enforces it because nothing is submitted. | Follows from D7. |
| D9 | Reminders before a deadline? | **No scheduled reminders.** The dashboard *is* the reminder. Publishing a task fires one `notifyStudents` call. | No scheduler exists: Cloud Functions are not approved (Blaze ≠ Functions) and Flask has no job runner. |
| D10 | List or calendar? | **List first, calendar second.** The list is the demo slice; the month grid is a stretch in the same pane. | The list is where the ordering-by-date value is; a calendar is presentation on top of the same data. |
| D11 | Which pane owns the new shared module? | `lib/deliverables.js` + tests and the two hooks → **Data/logic lane**. New route files → the page lane that owns the folder, added to `OWNERSHIP.md` in the same commit. | Existing rule: new shared queries go in `src/hooks/`, a domain rule goes in `lib/`. |

Record D1–D11 in `docs/OPEN-QUESTIONS.md` under DECIDED once confirmed.

## 4. Proposed data model additions

```
class_tasks/{taskId}
  class_id               string   the class this task belongs to — the field every rule reads
  teacher_id             string   owner; must equal request.auth.uid on create
  syllabus_id            string|null
  module_id              string|null   syllabi[].modules[].id
  topic_id               string|null   syllabi[].modules[].topics[].id  (the sub-module)
  kind                   'activity' | 'assignment' | 'exam' | 'other'
  title                  string   required, ≤ 120 chars
  instructions_markdown  string
  attachments            [{ title, resource_type: 'file'|'link', url }]
  opens_at               string|null  'YYYY-MM-DDTHH:mm'  (same as quizzes)
  due_at                 string|null  'YYYY-MM-DDTHH:mm'
  points                 number|null  informational only
  status                 'draft' | 'published'
  created_at, updated_at server timestamps
```

Rules (cross-repo, `../activklass-backend/firestore.rules`):

```
match /class_tasks/{taskId} {
  allow read: if isAdmin()
    || teachesClass(resource.data.class_id)
    || (isStudent() && resource.data.status == 'published'
        && request.auth.uid in get(/databases/$(database)/documents/classes/$(resource.data.class_id)).data.student_ids);
  allow create: if isTeacher()
    && request.resource.data.teacher_id == request.auth.uid
    && teachesClass(request.resource.data.class_id);
  allow update, delete: if isAdmin() || teachesClass(resource.data.class_id);
}
```

Query shapes the rules can prove:
- teacher: `where('class_id', '==', classId)`
- student: `where('class_id', 'in', enrolledClassIds)` chunked at `IN_CHUNK` (10) from
  `lib/roster.js`, **plus** `where('status', '==', 'published')` — the rule reads both.
  Composite index `(class_id, status)` → `firestore.indexes.json` (cross-repo).

Storage (cross-repo, `storage.rules`): `task_files/{classId}/{taskId}/{fileName}` — signed-in
read, signed-in write < 25 MB, signed-in delete.

The one normalised shape every screen renders, produced by `lib/deliverables.js`:

```
{ id, source: 'quiz' | 'task', kind, title, classId, className,
  opensAt: Date|null, dueAt: Date|null,   // a quiz's closes_at is its dueAt
  state: 'scheduled' | 'open' | 'due_today' | 'overdue' | 'closed' | 'done',
  href }
```

## 5. Build order — one convoy, six steps

Ordered so no two steps edit the same file, and each step's tests pass without the next.
Steps 3, 4 and 5 can run in parallel once Step 2 has landed.

| Step | Pane | Files | Depends on |
|---|---|---|---|
| 1 | **Backend pane** (activklass-backend) | `firestore.rules`, `storage.rules`, `firestore.indexes.json`, `docs/02-database-schema.md`, `seed_demo.py` | owner confirms D1–D6 |
| 2 | **Data/logic lane** | `src/lib/deliverables.js` (+ test), `src/lib/classTasks.js`, `src/hooks/useClassTasks.js`, `src/hooks/useStudentDeliverables.js`, `src/lib/validation.js` (new rules only), `src/lib/firestoreRules.test.js`, `docs/DATA-MODEL.md` | Step 1 (the rules test reads the backend file across the repo boundary) |
| 3 | **Class detail pane** | `src/routes/teacher/classes/$classId/modules.jsx` (new), `$classId/_layout.jsx`; **Shared, announce:** one `<Route>` in `src/App.jsx` | Step 2 |
| 4 | **Student pane** | `src/routes/student/index.jsx`, `src/routes/student/classes/$classId/index.jsx`, new `src/routes/student/deliverables/*.jsx` (add to `OWNERSHIP.md`) | Step 2 |
| 5 | **Quizzes pane** | `src/routes/teacher/quizzes.jsx`, `quizzes.$quizId.jsx` (small: the window chip, a `?topic=` preselect) | Step 2 |
| 6 | **Verify pane** | browser walk teacher + student, regression locks, `docs/ROADMAP.md` entry | Steps 3–5 |

**Demo cut** (what the defense needs, nothing more): Steps 1–4 with the **list** view. A teacher
opens BSIT-C → Modules, adds an assignment with a PDF template under Sub-module 1.1, opens it
now with a due date next week, publishes; Hana signs in, the dashboard shows it under "This
week" with the PDF, and the class's Modules tab shows the chip. The calendar grid and Step 5
are stretch.

---

## 6. Paste-ready prompts

Each block is complete on its own. The pane reads the repo for the rest.

### Step 1 — Backend pane (`C:\CAPSTONE\activklass-backend`)

```
You are the backend pane. Read CLAUDE.md, then docs/02-database-schema.md and firestore.rules.
Then read ../activklass-web/docs/plans/modules-content-and-deliverables.md sections 3–4; the
decisions there are confirmed by the owner.

Build the server side of "class tasks" — activities, assignments and paper exams a teacher
publishes under a syllabus sub-module for ONE class, with an open time and a deadline. The web
client writes them directly to Firestore; your job is the rules, the index, the storage path,
the schema doc and demo seed data. No Flask route is needed for this.

1. firestore.rules — add `match /class_tasks/{taskId}` exactly as section 4 of the plan
   writes it: a teacher who owns the class (teachesClass) creates with their own teacher_id
   and updates/deletes; an enrolled student reads only `status == 'published'`; admin reads
   all. Do not use a bare isTeacher() as a read guard — that means any teacher at any school.
   The student list query will be `where('class_id','in',[...≤10]) + where('status','==',
   'published')`, so the rule must be provable from those two fields.
2. firestore.indexes.json — composite (class_id ASC, status ASC) on class_tasks.
3. storage.rules — `match /task_files/{classId}/{taskId}/{fileName}`: signed-in read,
   signed-in write < 25 MB (same cap as learning_materials), signed-in delete. Mirror the
   comment style already in the file.
4. docs/02-database-schema.md — a `class_tasks` section listing every field in the plan's
   section 4, the zone-less 'YYYY-MM-DDTHH:mm' date format quizzes already use, and a
   sentence saying quizzes are NOT copied into it.
5. seed_demo.py — two published tasks on demo-sci9-newton (an activity due in 3 days with a
   link attachment; a paper exam in 10 days) and one on BSIT-C (an assignment due in 5 days,
   opens now), each with module_id/topic_id pointing at a real sub-module in that class's
   syllabus. Idempotent like the rest of the seed.
6. Tell the web Data/logic pane the rule block is in place so it can write the emulator test
   (npm run test:rules lives in the web repo and reads ../activklass-backend/firestore.rules).

Deploy nothing yet — the owner runs `firebase deploy --only firestore:rules,storage` after
the web rules test passes; the predeploy gate re-runs it. Focused commits, explicit paths,
commit bodies with the reasoning. Report which files changed and the exact query shapes the
rule accepts.
```

### Step 2 — Data/logic lane (`C:\CAPSTONE\activklass-web`)

```
You are the Data/logic lane (OWNERSHIP.md: src/hooks/**, the lib/ files listed there). Read
CLAUDE.md, OWNERSHIP.md, docs/DATA-MODEL.md, then
docs/plans/modules-content-and-deliverables.md in full. The backend pane has added the
class_tasks rule block, index and storage path (section 4 of the plan); confirm with
`grep -n class_tasks ../activklass-backend/firestore.rules` before you start.

Build the shared logic every screen will use. No route files — three page panes are waiting
on you and will edit those.

1. src/lib/deliverables.js — PURE, no Firebase import, fully unit-tested:
   - parseWindowDate(str): the zone-less 'YYYY-MM-DDTHH:mm' string quizzes store → Date|null.
     Read lib/quizAttempts.js canStart/lifecycleOf first and use the same interpretation.
   - fromQuiz(quiz, {className, classId, attempts}) and fromTask(task, {className}) → the
     normalised deliverable in plan section 4. A quiz's closes_at is its dueAt. A quiz with a
     finished attempt (finishedAttempts from lib/quizAttempts.js) is state 'done'.
   - stateOf(deliverable, now): scheduled | open | due_today | overdue | closed | done.
     'closed' only when nothing can be done any more (a quiz past closes_at); a task past
     due_at is 'overdue', not closed, because nothing enforces it.
   - bucket(list, now) → { overdue, today, thisWeek, later, notYetOpen, done } sorted by dueAt
     then opensAt; undated tasks go to 'later'.
   - describeWindow(deliverable, now) → the ONE sentence every chip shows, e.g.
     "Opens Mon 15 Sep, 8:00 AM" · "Due Fri 19 Sep, 11:59 PM" · "Due today, 11:59 PM" ·
     "Overdue since Thu 18 Sep" · "Closed Fri 19 Sep". Teacher-readable; no vendor or error
     text, ever.
   - KIND_LABEL: quiz / activity / assignment / exam / other → the label shown.
   Test file lib/deliverables.test.js: every state, the day boundary at 23:59 vs 00:00,
   undated items, a quiz with an open (unfinished) attempt is not 'done'.
2. src/lib/classTasks.js — the write helpers: createTask, updateTask, publishTask, deleteTask,
   uploadTaskFile(classId, taskId, file) → uses uploadAttachment from lib/attachments.js
   under `task_files/{classId}/{taskId}/{fileName}`. publishTask calls notifyStudents
   (lib/notifications.js) with type 'task_published', a message naming the kind and title,
   and link `/student/classes/{classId}?tab=topics&topic={topic_id}` — the deep link the
   Modules tab already highlights. Best-effort: a notification failure never blocks the save.
3. src/hooks/useClassTasks.js (teacher, `where('class_id','==',classId)`, key
   ['fs-class-tasks', classId]) and src/hooks/useStudentDeliverables.js (student: enrolled
   classes → quizzes by `class_ids array-contains` per class + class_tasks by
   `where('class_id','in',chunk) + where('status','==','published')`, chunked with IN_CHUNK
   from lib/roster.js, Promise.allSettled per class so one class failing never blanks the
   list, plus the student's own quiz_attempts → fromQuiz/fromTask → one sorted array).
4. src/lib/validation.js — NEW rules only (announce if you touch an existing one): task title
   required ≤ 120, kind in the four values, due_at must not be before opens_at, attachments
   need isSafeLink or a storage URL. Tests in validation.test.js.
5. src/lib/firestoreRules.test.js — extend: owner creates/reads/updates a class_task; a
   foreign teacher is refused on all three; an enrolled student reads a published one and is
   refused a draft; a non-enrolled student is refused; the exact student list query shape
   passes and a query missing the status filter is refused. Run `npm run test:rules`.
6. docs/DATA-MODEL.md — a `class_tasks` row in the collections table and a line in "The
   four rules" section 4 about the two-field query shape. Say what is built, nothing more.

Do not touch any route file, App.jsx or _layout.jsx. npm run test and npm run build must pass.
Focused commits with `git commit --only -- <paths>`; bodies carry the reasoning and the test
counts. When done, tell the Class detail, Student and Quizzes panes the exports are ready and
paste the signatures of fromQuiz, fromTask, bucket, describeWindow, useClassTasks,
useStudentDeliverables, createTask, publishTask, uploadTaskFile.
```

### Step 3 — Class detail pane (`teacher/classes/$classId/**`)

```
You are the Class detail pane (OWNERSHIP.md: src/routes/teacher/classes/$classId/**). Read
CLAUDE.md, OWNERSHIP.md, then docs/plans/modules-content-and-deliverables.md. The Data/logic
lane has landed lib/deliverables.js, lib/classTasks.js and hooks/useClassTasks.js — read
their exports before writing UI. Validation rules come from lib/validation.js only.

Build the teacher's Modules tab for one class: the same tree the student sees, with the power
to add content under any sub-module.

1. New file src/routes/teacher/classes/$classId/modules.jsx, tab label "Modules", placed
   after "Overview" in $classId/_layout.jsx. Resolve the syllabus the way scaffolds.jsx does
   (classes.syllabus_id first, fall back to classes/{id}/syllabus/current) — do not write a
   third resolver. Module n · title › Sub-module n · title, the numbering the student's
   Modules tab uses.
2. Under each sub-module show: its materials (read-only, each with the RESOURCE_META icon;
   one "Edit materials on the Syllabus page" link → /teacher/syllabus), the quizzes whose
   topic_id is this sub-module (from useQuizzes, with the describeWindow chip), and its
   class_tasks (useClassTasks). Empty state: "Nothing here yet for this class."
3. A "+ Add" menu per sub-module: Activity · Assignment · Exam (paper) · Quiz. Quiz navigates
   to /teacher/quizzes?topic={topic_id} (the Quizzes pane is adding the preselect; the link
   alone is your part). The other three open one dialog (useDialogBehavior like the rest of
   the app): kind (preset), title, instructions (Markdown, the components/Markdown renderer
   previews it), attachments — Upload file (uploadTaskFile) or Paste link (isSafeLink,
   LINK_HINT from lib/attachments.js), with the same three-button pattern
   TopicResourceEditor on the Syllabus page uses — opens at, due at (datetime-local; due
   before opens is refused by the validation rule with its sentence), points (optional),
   and two buttons: Save as draft · Publish. Publish calls publishTask, which notifies the
   roster.
4. Each task row: kind label, title, the describeWindow chip, attachment icons, a Draft
   badge when unpublished, Edit and Delete (Delete confirms the way irreversible deletes do
   elsewhere, wording matched). Editing a published task saves without re-notifying.
5. Shared file, announce first in the other panes and keep it to one line: register
   `<Route path="modules" element={ModulesPage} />` beside the others at src/App.jsx:109-115,
   with a lazyRoute import beside ScaffoldTopicsPage.
6. No string a teacher reads names Firebase, Storage or a raw error. Reuse
   uploadAttachment's messages; they are already written for this.

Verify in the browser as the seeded teacher on BSIT-C (m9u4k7zaG5qLTSEDhxDr) and on
demo-sci9-newton: add an assignment with a real PDF under a sub-module, publish it, confirm
the document in Firestore has class_id/topic_id/opens_at/due_at/status and the file is in the
bucket under task_files/; edit its due date; delete a draft. Delete the walkthrough
documents afterwards unless the owner wants them for the demo. Static-markup tests for the
row states (draft, scheduled, open, overdue) in a *.test.jsx beside the file. npm run test
and npm run build pass. Focused commits, `git commit --only`. modules.jsx needs no
OWNERSHIP.md line — $classId/** already covers it.
```

### Step 4 — Student pane (`student/index.jsx`, `student/classes/**`)

```
You are the Student pane (OWNERSHIP.md: student/index.jsx, student/classes/**, profile,
remediation). Read CLAUDE.md, OWNERSHIP.md, then
docs/plans/modules-content-and-deliverables.md. The Data/logic lane has landed
lib/deliverables.js and hooks/useStudentDeliverables.js — read their exports first; every
date sentence on your screens comes from describeWindow, never formatted locally.

Build what the student sees: deadlines everywhere a deliverable appears, and an "Up next"
view on the dashboard.

1. student/classes/$classId/index.jsx, Modules tab (TopicsTab): under each sub-module,
   beside the materials, list the class's published class_tasks for that topic_id — kind
   label, title, describeWindow chip, attachments rendered with the same RESOURCE_META
   rows materials use (a template PDF opens in a new tab, a link likewise), and the
   instructions Markdown behind a "Read instructions" disclosure or the existing lesson-note
   dialog pattern. Quizzes already listed there get the same chip. The ?tab=topics&topic=
   highlight must land on a task's sub-module too (publishTask's notification links there).
2. Same file, Quizzes tab (QuizzesTab): add the describeWindow chip to every card and make
   the card's state match lib/deliverables stateOf — "Not open yet" for scheduled, "Closed"
   for past, "Due today" when closes_at is today.
3. student/index.jsx: an "Up next" panel above "Your classes", from useStudentDeliverables
   → bucket(). Sections in this order, each hidden when empty: Overdue · Due today · This
   week · Later · Not open yet; 'done' items collapsed under "Finished". Each row: kind
   label, class name, title, chip, and a link — a quiz to its player route, a task to
   /student/classes/{classId}?tab=topics&topic={topic_id}. Empty state: "Nothing due. Check
   your classes' Modules tabs for what to read." Never let one class's failed read blank the
   panel (the hook returns partial results; show them).
4. List ⇄ Calendar toggle on that panel, remembered in localStorage. The calendar is a
   plain month grid you write yourself in a new file src/routes/student/deliverables/
   MonthCalendar.jsx — no dependency (CLAUDE.md: none without approval). One dot per
   deliverable on its due day, coloured by state with theme.js tokens (never a hex literal),
   click a day to list that day's items below the grid, ‹ › for months, today outlined.
   Phone width (~400px) must work. Add the new folder to OWNERSHIP.md's Student row in the
   same commit; if the teacher side wants the same calendar later it lifts to components/.
5. Nothing a student reads names Firebase or shows raw error text.

Verify in the browser as a student through the headless driver
(C:/CAPSTONE/_tools/verify/drive.mjs, page.login('Hana') or 'Carlo' — see the memory notes)
against the seeded tasks: the dashboard buckets them correctly relative to today, the
Modules tab shows the chip and opens the attachment, the calendar shows the dots and the
day list, the deep link highlights the sub-module. Static-markup tests (like
remediation.test.jsx) for the panel's buckets and the empty state. npm run test and
npm run build pass. Focused commits with `git commit --only`.
```

### Step 5 — Quizzes pane (small)

```
You are the Quizzes pane (OWNERSHIP.md: teacher/quizzes.jsx, quizzes.$quizId.jsx,
student/quiz-player.jsx, student/quiz-feedback.jsx). Read CLAUDE.md, OWNERSHIP.md, then
docs/plans/modules-content-and-deliverables.md sections 3–5. The Data/logic lane has landed
lib/deliverables.js (describeWindow, fromQuiz).

Two small changes so quizzes speak the same language as the new class tasks:
1. teacher/quizzes.jsx: every quiz card shows the describeWindow chip (from fromQuiz) beside
   the lifecycle wording it has now — one sentence, the same one the student sees. Keep the
   lifecycle filter tabs.
2. teacher/quizzes.jsx: accept ?topic={topicId} on the URL — when present, the New Quiz /
   Generate dialog opens with that topic preselected in the topic dropdown (the dropdown
   already resolves the class's syllabus; if the class is ambiguous, preselect the topic and
   leave the class picker to the teacher). The Class detail pane's Modules tab links here
   from "+ Add → Quiz".
3. quizzes.$quizId.jsx: no data change. If the settings panel's opens/closes fields have a
   helper sentence, make it the describeWindow sentence so the editor and the cards agree.

Browser check as the seeded teacher: a scheduled, an open and a closed quiz each read
correctly on the Quizzes page; /teacher/quizzes?topic=<a BSIT-C sub-module id> opens the
dialog with that topic picked. Do not edit the student's class page (Student pane) or
lib/quizAttempts.js (Data/logic, and it has a mobile port). npm run test and npm run build
pass. Focused commits with `git commit --only`.
```

### Step 6 — Verify pane

```
Run /verify on the class-tasks convoy once Steps 3–5 report done. Prove, not read:
teacher (Chrome, seeded teacher): BSIT-C → Modules → add assignment with PDF → publish;
Firestore document and Storage object exist; edit; delete a draft.
student (headless drive.mjs as Hana): dashboard buckets — overdue, today, this week —
against the seeded tasks and the one just published; Modules tab chip + attachment opens;
calendar dots; notification deep link highlights the sub-module; a draft task is invisible.
rules: npm run test:rules green including the new class_tasks block; a student query without
the status filter is refused. Lock each with a regression test where one is missing. Then add
the Phase 7 entry to docs/ROADMAP.md with the date and how each half was verified, and list
what was NOT covered.
```

---

## 7. Out of scope for this plan (say so if it changes)

- Student file submissions, grading of tasks, late penalties (D7, D8).
- Scheduled reminders before a deadline (D9).
- Moving quiz dates to a zoned format (D3).
- A mobile port of `lib/deliverables.js`. It is written pure so a TS port under
  `portParity.test.js` is possible later; not now.
- A teacher-side calendar. The Class detail Modules tab is a list; if the demo wants a
  teacher calendar, lift `MonthCalendar.jsx` to `components/` (UI/UX lane) then.

## 8. Risks worth knowing before dispatch

- **Rules before UI.** Step 2's emulator test is the only thing that proves a student can
  read a task and a foreign teacher cannot; Steps 3–4 must not start on a rule block that has
  not passed it. The roster-scope lesson (T-57): a list query must carry every field the rule
  reads, chunked at 10.
- **`App.jsx` and `_layout.jsx` are Shared.** Step 3 touches one route line; announce it.
- **Six panes, one checkout.** Each step commits with `git commit --only -- <paths>` and reads
  `git status` first. The convoy is ordered so no two steps share a file; keep it that way.
- **"Exam" will be read as "online exam" by testers.** The + Add menu says "Exam (paper)"
  and the Quiz option sits beside it for a reason. Keep the label.
- **Date strings are zone-less.** Fine on one demo machine; a teacher and a student in
  different zones would disagree. Recorded in D3, not fixed here.
- **This is Phase 7 and the roadmap says not to build ahead of the demo.** The demo cut in
  section 5 is the argument for doing it now; everything past it is labelled stretch so a
  pane does not spend demo time on a calendar.
