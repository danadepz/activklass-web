# Plan — Module content, open/due windows, and the student's deliverables view

**Status: built and verified, 2026-09-13.** Written as a proposal that morning; every step
landed and was verified the same day. Where each step stands (the Modules pane keeps this list current):

| Step | Pane | State |
|---|---|---|
| 1 Rules, storage, schema, seed | Backend | done and **deployed 2026-09-13** (owner ran it) — backend `9b99c5f` `5f69451` `ff33ed2` `b75736f`. Proven on the live project from a Node script with custom tokens, against two scratch tasks planted and deleted by the Admin SDK: Carlo (on Newton) reads the published task with the two-field query and is refused the same query without the status filter and a direct read of the draft; Fina (not on Newton) is refused the two-field query; the `(class_id, status)` index is listed; a signed-in `task_files` write, read-URL and delete all succeed. **The seed's three demo tasks are not on the live project** — `seed_demo.py` was committed, not run; whoever reseeds gets them. |
| 2 Shared logic + rules test | Data/logic | done — `c364352` `ded328a` `72982f0` `0063710`; `npm run test:rules` 56/56. |
| 3 Teacher Modules tab | Class detail | done — `74ce9e0` `58d3b64` `662c115` (Keel's work; committed from the Modules pane after that session closed). `modules.test.jsx` (11); **browser walk owed** to Step 6. |
| 4 Student Modules chips + Up next | Student | done — `70de02c` `393cfac` `5061576`; verified headless as Carlo; live task rows blocked on the Step 1 deploy. |
| 5 Quiz card chip + `?topic=` | Quizzes | done — `describeWindow` on every card, `?topic=` preselect, landed with the Generate-dialog work (`9c800db` and before). |
| 6 Verify + ROADMAP entry | Verify | **done 2026-09-13** — `beaf157`: teacher, student and rules halves driven headless on the live project, every convoy lock broken and seen red, two new guards in `lib/classTasksGuards.test.js`, the Phase 7 entry in `docs/ROADMAP.md`. `npm run test` 1035/1035. |

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
| D7 | Do students submit work through the app? | **Not in this plan** as first written. **Reversed by the owner on 2026-09-13** — a task can open a submission bin; the design is section 9 and it is its own convoy, after this one lands. | The first six steps are unchanged; section 9 adds to them, it does not reopen them. |
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

- Grading of tasks and late penalties (D8). Student file submissions moved **in** on 2026-09-13 — section 9.
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

---

## 9. Follow-on convoy — the submission bin (owner decision 2026-09-13; reverses D7)

**Status: proposal. Nothing below is built.** Written by the quizzes pane at the owner's
direction after the first six steps landed (`58d3b64`, `eacbc98`). Same rules as the rest of
this file: paste-ready prompts, one pane per step, no two steps share a file, rules before UI.

### 9.1 What the owner asked for

"There should be an option to add a submission bin through the app." A task a teacher
publishes under a sub-module can, if the teacher switches it on, take the student's work
back through the app — a file or a link — so the teacher sees who handed in, when, and
whether it was late, and the student sees "Submitted" where they used to see "Due".

### 9.2 Decisions (recommended; the owner confirms or overrides)

| # | Question | Answer | Why |
|---|---|---|---|
| S1 | Where does a submission live? | **New top-level collection `task_submissions/{id}`**, one document per student per task, id built by `submissionId(taskId, studentId)` in `lib/taskSubmissions.js` — never hand-assembled (DATA-MODEL.md, composite-id rule). | Keyed by the pair so a re-submit is an update, not a second row; a separate collection so a teacher's task list does not carry every student's file. |
| S2 | What is a submission's shape? | `task_id, class_id, student_id, attachment ({ title, resource_type: 'file' \| 'link', url } — the material shape), note (string, ≤ 500), submitted_at (server timestamp), resubmitted_count (number)`. **One attachment.** | One file or one link covers the demo; a list is a later widening with the same shape. The material shape means the teacher's row renders it with code that exists. |
| S3 | Which tasks accept submissions? | A new boolean on `class_tasks`: **`accepts_submissions`** (default `false`). The task dialog gets an "Accept submissions through the app" checkbox. `kind: 'exam'` (paper) hides the checkbox — a paper exam is not handed in through an app. | Opt-in per task keeps every existing task exactly as it is; the field's absence reads as false. |
| S4 | Who may write one? | **The student, their own, on a published task that accepts submissions, in a class they are on.** The rule proves all of it from the submission's own fields plus one `get()` on the task. Teachers never write submissions. | A teacher "submitting for" a student is a grading act; that stays in the class record. |
| S5 | Who may read them? | The student reads their own (`student_id == uid`). The teacher reads through `teachesClass(class_id)` — so the teacher's list query **must carry `where('class_id','==',classId)`** beside `where('task_id','==',taskId)`; a `task_id`-only query is refused even for the owner (rule 4 in DATA-MODEL.md — the engine cannot prove `class_id` from a query it does not carry). | Same lesson as `quiz_attempts` and T-57. |
| S6 | Re-submitting? | **Allowed while the task still accepts submissions.** A re-submit overwrites the attachment, bumps `resubmitted_count`, stamps a new `submitted_at`. The teacher turns the checkbox off to close the bin. | No second flag to keep in step with the first; "closed" is the teacher's decision, not the clock's. |
| S7 | Late? | **Not stored.** `late` is derived at display: `submitted_at > due_at` — one function in `lib/taskSubmissions.js`, used by both the teacher's row and the student's chip. | A stored flag would go stale the moment the teacher moves the deadline. |
| S8 | Where do files go in Storage? | **`task_files/{classId}/{taskId}/submissions/{studentId}/{fileName}`** — write only when `request.auth.uid == studentId`, < 25 MB, any type; signed-in read; delete by the same student. **Cross-repo: `storage.rules`** — the existing `task_files/{classId}/{taskId}/{fileName}` match is single-segment and does not cover this path. | Under the task's own folder so a task's hand-outs and its hand-ins sit together; the student segment is what the rule pins the writer to. |
| S9 | Grading? | **Not in the bin.** Points stay in the class record. The teacher's submissions list links each row to the student and to the class record page; nothing is scored in place. | The plan's existing decision (D2, `points` informational), and the record is the one place a score lives — or `syncEntries` is skipped and the student reads a stale entry. |
| S10 | Does "Submitted" change the student's deliverables view? | **Yes: the `done` state.** `fromTask(task, { submission })` returns `state: 'done'` when a submission exists; the Up next list and the class page chip read "Submitted · Fri 3:12 PM" (with "late" appended when S7 says so). Quizzes are untouched. | `state: 'done'` is already in the normalised shape and already unused — this is what it was left there for. |
| S11 | Notifying the teacher? | **No.** The teacher opens the task and sees the list. | No scheduler, no teacher-side inbox; a notification per submission at class scale is noise. |

### 9.3 Data model additions

```
class_tasks/{taskId}
  accepts_submissions    boolean   NEW, default false; the dialog's checkbox

task_submissions/{taskId_studentId}      id from submissionId() — never hand-built
  task_id                string    the task
  class_id               string    copied from the task — the field the teacher's rule reads
  student_id             string    must equal request.auth.uid on create and update
  attachment             { title, resource_type: 'file' | 'link', url }
  note                   string    ≤ 500, may be ''
  submitted_at           server timestamp (re-stamped on every re-submit)
  resubmitted_count      number    0 on first submit
```

Rules (cross-repo, `../activklass-backend/firestore.rules`), beside the `class_tasks` block:

```
match /task_submissions/{submissionId} {
  function task() {
    return get(/databases/$(database)/documents/class_tasks/$(request.resource.data.task_id)).data;
  }
  function ownSubmission() {
    return isStudent() && request.resource.data.student_id == request.auth.uid;
  }
  function taskTakesIt() {
    return task().status == 'published'
      && task().accepts_submissions == true
      && task().class_id == request.resource.data.class_id
      && request.auth.uid in get(/databases/$(database)/documents/classes/$(request.resource.data.class_id)).data.student_ids;
  }

  allow read: if isAdmin()
    || teachesClass(resource.data.class_id)
    || (isStudent() && resource.data.student_id == request.auth.uid);

  allow create: if ownSubmission() && taskTakesIt();

  // A re-submit keeps the identity fields and only moves the work.
  allow update: if ownSubmission() && taskTakesIt()
    && request.resource.data.task_id == resource.data.task_id
    && request.resource.data.class_id == resource.data.class_id
    && request.resource.data.student_id == resource.data.student_id;

  allow delete: if isAdmin() || teachesClass(resource.data.class_id);
}
```

Query shapes the rules can prove:
- teacher, one task's bin: `where('class_id','==',classId)` **and** `where('task_id','==',taskId)`
  → composite index `(class_id, task_id)` in `firestore.indexes.json` (cross-repo).
- student, their own: `where('student_id','==',uid)` — one query for every class, chunk nothing.

Storage (cross-repo, `storage.rules`):

```
match /task_files/{classId}/{taskId}/submissions/{studentId}/{fileName} {
  allow read: if signedIn();
  allow write: if signedIn() && request.auth.uid == studentId
    && request.resource.size < 25 * 1024 * 1024;
  allow delete: if signedIn() && request.auth.uid == studentId;
}
```

### 9.4 Build order — one convoy, five steps

Same shape as section 5. Rules first; the two page steps run in parallel once the emulator
test passes; verify last.

| Step | Pane | Files | Depends on |
|---|---|---|---|
| S-1 | Backend | `firestore.rules`, `firestore.indexes.json`, `storage.rules`, `docs/02-database-schema.md`, `seed_demo.py` | — |
| S-2 | Data/logic (web) | `lib/taskSubmissions.js` + test, `lib/deliverables.js` (+ `submission` option on `fromTask`) + test, `hooks/useTaskSubmissions.js`, `hooks/useStudentDeliverables.js` (joins the student's own submissions), `lib/firestoreRules.test.js`, `docs/DATA-MODEL.md` | S-1 rule block on disk |
| S-3 | Class detail | `teacher/classes/$classId/modules.jsx` (+ its test) | S-2 on main |
| S-4 | Student | `student/classes/$classId/index.jsx`, `student/deliverables/**` | S-2 on main |
| S-5 | Verify | — | S-3 and S-4 on main, rules deployed |

### 9.5 Paste-ready prompts

**Where each one goes.** S-1 is pasted into a Claude Code pane opened in
`C:\CAPSTONE\activklass-backend`. S-2, S-3, S-4 and S-5 are pasted into panes opened in
`C:\CAPSTONE\activklass-web` — one pane per step, each on the lane named in its heading
(`OWNERSHIP.md`). Run S-1 first; paste S-2 when S-1 reports the rule block is on disk;
paste S-3 and S-4 together when S-2 is on `main`; paste S-5 last, after the owner has run
the deploy.

#### S-1 — Backend pane (`C:\CAPSTONE\activklass-backend`)

```
You are the backend pane. Read CLAUDE.md, docs/02-database-schema.md, firestore.rules and
storage.rules. Then read ../activklass-web/docs/plans/modules-content-and-deliverables.md
section 9 — the decisions in 9.2 are confirmed by the owner.

Build the server side of the submission bin: a student hands a file or a link back through
the app on a class task whose teacher switched submissions on. The web client writes
Firestore and Storage directly; your job is the rules, the index, the storage path, the
schema doc and seed data. No Flask route.

1. firestore.rules — add `match /task_submissions/{submissionId}` exactly as section 9.3
   writes it, beside the class_tasks block. The student creates and updates only their own
   (student_id == uid), only on a task that is published, has accepts_submissions == true,
   and whose class_id matches and lists them in student_ids; an update may not change
   task_id, class_id or student_id. The teacher reads through teachesClass(class_id) — never
   a bare isTeacher(). Teachers never write. The class_tasks rule itself does not change:
   accepts_submissions is a plain field the owning teacher already may write.
2. firestore.indexes.json — composite (class_id ASC, task_id ASC) on task_submissions.
3. storage.rules — `match /task_files/{classId}/{taskId}/submissions/{studentId}/{fileName}`
   as in 9.3: write and delete only when request.auth.uid == studentId, < 25 MB; signed-in
   read. Note in a comment that the existing single-segment task_files match does not cover
   this path, which is why it is its own block.
4. docs/02-database-schema.md — a `task_submissions` section with every field in 9.3, the
   composite id rule (built by the web client's submissionId(), never hand-assembled), and
   `accepts_submissions` added to the class_tasks section with its default.
5. seed_demo.py — set accepts_submissions: true on the seeded Newton activity, and seed one
   submission on it from Hana Lorenzo (srnhs-200016): a link attachment, submitted_at two
   hours before its due_at, resubmitted_count 0. Idempotent like the rest.
6. Tell the web Data/logic pane the rule block is on disk so it can write the emulator test
   (npm run test:rules is in the web repo and reads ../activklass-backend/firestore.rules).

Deploy nothing — the owner runs `firebase deploy --only firestore:rules,firestore:indexes,storage`
after the web rules test passes. Focused commits, explicit paths, commit bodies with the
reasoning. Report which files changed and the exact query shapes the rule accepts.
```

#### S-2 — Data/logic lane (`C:\CAPSTONE\activklass-web`)

```
You are the Data/logic lane. Read CLAUDE.md, OWNERSHIP.md, docs/DATA-MODEL.md (rule 4 and
the class_tasks paragraph), lib/classTasks.js, lib/deliverables.js and
hooks/useStudentDeliverables.js. Then read docs/plans/modules-content-and-deliverables.md
section 9; the backend pane has put the task_submissions rule block on disk in
../activklass-backend/firestore.rules.

Build the shared pieces of the submission bin. No screens.

1. lib/taskSubmissions.js — submissionId(taskId, studentId) (the one place the composite id
   is built); isLate(submission, task) per S7 (submitted_at after due_at, using
   parseWindowDate from lib/deliverables.js for due_at; false when either is missing);
   describeSubmission(submission, task) → "Submitted · Fri 3:12 PM" / "… · late"; and
   submitWork({ taskId, classId, studentId, attachment, note, existing }) that creates or
   updates the document at that id with a server submitted_at and resubmitted_count. Files
   are uploaded by the caller through lib/attachments.js uploadAttachment() to
   task_files/{classId}/{taskId}/submissions/{studentId}/{fileName} before submitWork is
   called; this module never touches Storage. Tests beside it.
2. lib/deliverables.js — fromTask(task, { classId, now, submission }) returns state 'done'
   when a submission is given, keeping dueAt so the chip can still say when it was due;
   describeWindow says "Submitted …" for state 'done' through describeSubmission. Existing
   tests must not change; add the done cases.
3. hooks/useTaskSubmissions.js — useTaskSubmissions(classId, taskId): the teacher's list,
   query where('class_id','==',classId) AND where('task_id','==',taskId) — both, or the rule
   refuses the owner. Key ['fs-task-submissions', classId, taskId]. Export the key builder.
4. hooks/useStudentDeliverables.js — also read the student's own submissions
   (where('student_id','==',uid), one query) and pass each task's one into fromTask so the
   Up next panel and the class page get state 'done' for free. Same query key.
5. lib/firestoreRules.test.js — under npm run test:rules: a student creates their own
   submission on a published task with accepts_submissions true; is refused on a draft task,
   on a task with accepts_submissions false, on a class they are not on, and with another
   student's id; may update their own but not change task_id/class_id/student_id; the
   teacher reads the (class_id, task_id) query and is refused a task_id-only query; a foreign
   teacher is refused every read; a student cannot read another student's submission.
6. docs/DATA-MODEL.md — a task_submissions row in the collections table, the query shapes
   in rule 4, the new key in the conventions list, and accepts_submissions on the
   class_tasks row.

npm run test and npm run build must pass; npm run test:rules needs Java. Commit with
git commit --only -- <your paths> after reading git status. Report the exported names so
the Class detail and Student panes can import them.
```

#### S-3 — Class detail pane (`teacher/classes/$classId/**`)

```
You are the Class detail pane. Read CLAUDE.md, OWNERSHIP.md, then
teacher/classes/$classId/modules.jsx and its test, lib/taskSubmissions.js,
hooks/useTaskSubmissions.js, and docs/plans/modules-content-and-deliverables.md section 9.
The Data/logic lane's step is on main.

Give the teacher the bin on the Modules tab.

1. TaskDialog — an "Accept submissions through the app" checkbox, written as
   accepts_submissions (default false). Hidden for kind 'exam' (paper) — write false. One
   line of help under it: "Students hand in a file or a link on their class page. You see
   who submitted and when; grading stays in the class record." Turning it off later is how
   the bin closes (S6) — say so in the same line when the box is already ticked.
2. TaskRow — for a published task with accepts_submissions, a count chip "3 of 24 submitted"
   (roster size from the class document) that expands a submissions list under the row:
   one line per student on the roster — name, Submitted · <time> or "—", "late" per isLate,
   the attachment as a link (a file opens; a link opens in a new tab), the note if any, and
   a link to the student's row on the class record. Students who have not submitted are
   listed too, greyed, so the teacher sees who is missing without counting.
3. Nothing is graded here. No score field, no "mark" button.
4. Test beside the page (static markup, the house pattern): the checkbox present and
   unticked for a new activity, absent for a paper exam; the count chip and the greyed
   missing-student rows against a mocked useTaskSubmissions.

Verify in the browser as the seeded teacher on Newton's seeded activity, which the seed now
sets accepts_submissions on with one submission from Hana Lorenzo. npm run test and
npm run build must pass. Commit with git commit --only -- <your paths>.
```

#### S-4 — Student pane (`student/classes/**`, `student/deliverables/**`)

```
You are the Student pane. Read CLAUDE.md, OWNERSHIP.md, then
student/classes/$classId/index.jsx (TaskRow), student/deliverables/**,
lib/taskSubmissions.js, lib/attachments.js (uploadAttachment, isSafeLink) and
docs/plans/modules-content-and-deliverables.md section 9. The Data/logic lane's step is on
main; useStudentDeliverables already returns state 'done' for a task the student submitted.

Give the student the bin.

1. On the class page's TaskRow, for a published task with accepts_submissions: a Submit
   box — one file (uploadAttachment to task_files/{classId}/{taskId}/submissions/{uid}/
   {fileName}, < 25 MB, the same cap and error wording materials use) OR one link (isSafeLink
   pasted), plus an optional note ≤ 500 characters, then a Submit button that calls
   submitWork. After it lands the box reads "Submitted · <time>" (late per isLate) with the
   attachment shown and a "Replace" that re-submits while the task still accepts
   submissions. When accepts_submissions is false and the student has a submission, show it
   read-only with "Submissions are closed"; when false and none, no box at all.
2. Nothing in the Up next panel changes except that it already shows Submitted through the
   shared shape — confirm the chip reads "Submitted · …" and that a done task sorts after
   the open ones, not vanishes.
3. Messages a student reads never name our vendors or exceptions: an upload that fails says
   the file could not be uploaded and to try again or paste a link instead.
4. Tests beside the page: the Submit box present on an accepting task and absent otherwise;
   the closed state; static markup against a mocked hook.

Verify headless through C:/CAPSTONE/_tools/verify/drive.mjs with page.login('Hana') on
Newton's seeded activity: her seeded submission shows, Replace with a link re-submits and
the time moves. npm run test and npm run build must pass. Commit with
git commit --only -- <your paths>.
```

#### S-5 — Verify pane

```
Run /verify on the submission bin convoy (docs/plans/modules-content-and-deliverables.md
section 9) now that S-1 to S-4 are on main and the owner has deployed the rules. Prove, not
read: (1) npm run test:rules passes and would fail with the task_submissions block removed;
(2) through the Firestore REST API as Hana on Newton's activity, a create with her own
student_id lands and one with another student's id, one on a draft task, and one on BSIT-C
(she is on it, but its seeded assignment does not accept submissions) are all refused;
(3) as the seeded teacher the (class_id, task_id) query returns her row and a task_id-only
query is refused; (4) as the second seeded teacher every read is refused; (5) in the browser
as the teacher the count chip and her row show, and headless as Hana the Replace path
re-submits. Lock each with a regression test where one does not exist. Report what passed,
what did not, and fix nothing you fail.
```

### 9.6 Risks specific to this convoy

- **The rule does two `get()`s per write** (the task, then the class). Fine per document; it
  is why the teacher's read is a two-field query, not a collection scan.
- **`accepts_submissions` is a field on a document the modules pane's dialog already
  writes.** S-3 adds it to that dialog; S-1 adds nothing to the class_tasks rule. If the
  dialog ships before the checkbox, the field is simply absent and reads as false.
- **Storage rules are per path segment.** The new match is a separate block on purpose; a
  pane "tidying" it into the existing `task_files` match would either open the hand-outs
  path to students' writes or close the submissions path. Leave it as two blocks.
- **This is a defense-demo stretch.** The demo slice is: teacher ticks the box, Hana submits
  a link, the teacher sees "1 of N submitted" with her row. Everything past that in S-3 and
  S-4 (the missing-student rows, Replace) is what makes it real, not what makes it demo.

---

## 9. Left open after Step 6 (2026-09-13)

Recorded here because the convoy is closed and these have no other home yet. None blocks
the demo cut.

- **Deleting a task orphans its file.** `deleteTask` removes the `class_tasks` document
  and nothing else; the object under `task_files/{classId}/{taskId}/` stays in the bucket.
  Fix belongs to `lib/classTasks.js` (Data/logic lane): list the task's attachments of
  `resource_type: 'file'` and `deleteObject` each before the document delete, best-effort,
  the way `publishTask` treats notifications. Storage is on Blaze's free allowance, so this
  is tidiness for now, not cost.
- **The seeded demo tasks are not on the live project.** `seed_demo.py` (backend `b75736f`)
  carries three, but the seed was committed and never run, and a reseed resets every demo
  password. Either the owner runs the seed before the defense, or the teacher creates the
  task live in the demo — which is what the demo cut in section 5 shows anyway.
- **Not driven by Step 6**, per its ROADMAP entry: editing a task after publishing (the
  save-without-re-notifying path is unit-tested only); a non-PDF attachment; BSIT-C itself
  (no student quick-login card — Newton and Carlo stood in for Hana); clicking a bell entry
  rather than its URL.

