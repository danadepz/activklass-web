# Roadmap — ActivKlass web

Phase-level status for **this repo**. `[x]` done · `[~]` partial or deferred ·
`[ ]` not started. Each `[x]` carries the date and **how it was verified**.

This is the altitude view: what phase we are in and what the next milestone needs.
It deliberately does not track individual defects — those are logged elsewhere by the
panes, in their own words, and are not restated here.

**Current phase: Phase 7 — defense-demo readiness.**
**Definition of done for v1: the capstone defense demo runs end to end without a
recovery, on one machine, with Flask and Vite both up.** Not production hardening —
this app is not deployed and is not meant to be, yet.

---

## Phase 0 — Foundations `[x]` 2026-06
React 19 + Vite SPA, Tailwind v4, Firebase Auth, role-gated routing.
*Verified:* every route in `src/App.jsx` resolves behind `ProtectedRoute`; the four
roles land on their own home via `RoleHomeRedirect`.

## Phase 1 — Teacher core records `[x]` 2026-06 → 07
Classes, roster, gradebook, assessments, attendance, and DepEd/CHED grade computation.
*Verified:* `grading.test.js` covers `computeFinalGrade` and `finalAcrossPeriods`;
the class screens under `routes/teacher/classes/$classId/**` are driven in walkthroughs.

## Phase 2 — AI layer `[x]` 2026-07 → 08
Quiz generation, syllabus generation, module generation, and Random-Forest risk
prediction — all through Flask, all with a manual path beside them.
*Verified:* `aiDrafts.test.js` and `ai.risk.test.js` cover the draft validator, the MELC
code checker and the risk shaping; `lib/ai.js` is the only file that calls those endpoints.

## Phase 3 — Student portal `[x]` 2026-08
Student dashboard, class detail, quiz player, quiz feedback, remediation.
*Verified:* `quizGrading.test.js`, `quizPool.test.js`, `quizFeedback.test.js` and
`quizAttempts.test.js`; the attempt lifecycle is covered end to end in `quizToRecord.test.js`.

## Phase 4 — Firestore becomes the system of record `[x]` 2026-08
The quiz domain, syllabi and announcements moved off SQL; the client reads Firestore
directly and `firestore.rules` became the authorization layer.
*Verified:* no SQL path remains in `src/`; `npm run test:rules` exercises the deployed
rules file against the emulator, including a deliberately weakened copy that proves the
suite would fail if the rules stopped enforcing.

## Phase 5 — Institutional layer `[x]` 2026-08
Admin console, superadmin console, subscriptions, teacher groups, institution invites.
*Verified:* `superadminAnalytics.test.js` and `AnalyticsBand.test.jsx`; the superadmin
gate is a Firebase custom claim, not a role string, and is re-checked server-side.

## Phase 6 — Automated checks `[x]` 2026-08
A real test suite where there was none, plus cross-repo parity with the mobile ports.
*Verified 2026-08-25:* `npm run test` → **446 tests in 18 files, all passing, 1.15s**.
`npm run build` → clean, 645ms. `portParity.test.js` holds the three shared modules in
step with `activklass-mobile`.

## Phase 7 — Defense-demo readiness `[~]` **← current**
Driving the whole product in a browser as a tester would, and fixing what that surfaces.
The 2026-08-24 pilot walkthrough was the first full pass and its feedback was addressed
on 2026-08-25 — validation now has one home in `lib/validation.js`, and the irreversible
deletes ask you to type `DELETE`.

Also closed 2026-08-25: **an account can no longer be worked on the password staff issued.**
`components/ProtectedRoute` sends anyone whose profile still carries `is_temp_password` to
`/change-password` ahead of every other route — not from the login redirect, which a
bookmark, a refresh or a deep link all skip. The superadmin onboarding endpoint, the one
account-creation path of six that never set the flag, now sets it **(cross-repo)**.
*Verified:* driven in a browser on a provisioned account — login, deep-link bypass attempt,
change, release, revisit — with the cleared flag and `password_changed_at` confirmed in
Firestore; `smoke_superadmin.py` asserts the flag on both branches of `POST /subscribers`
and fails without the fix.

Still open at this altitude:
- `[~]` **Client and server disagree on validation.** The client now rejects what the
  Flask provision endpoint and the rules still accept **(cross-repo)**.
- `[~]` **The CSV bulk-upload path was not re-audited** against the new password and name
  rules.
- `[ ]` **Student-facing forms** (contest evidence, profile) have not had a validation pass.
- `[~]` **Self-service registration and subscriptions** (2026-08-29): the six-step
  `/register` walk, seat sizing with a mock-up estimate, and the developer-reviewed ID
  check are built and pass build + tests. Open: the backend rules deploy **(cross-repo)**,
  trial expiry is recorded but not enforced, the payment gateway is undecided, and the
  browser walkthrough is owed. Details in `BACKLOG.md` (registration pane, 2026-08-29).
- `[~]` **Solo subscriber dashboard** (2026-08-30): a teacher on their own plan sees a
  Subscribed / Free trial chip beside their name and a status box on the dashboard
  (`describeSubscription` in `lib/subscription.js`, `useMySubscription`), the Students page
  gains a **Student accounts** tab — add one student, download the template, create
  accounts from a file, reset, deactivate — and a trial greys out the quiz bank and teacher
  groups with an "Available on a paid plan" hint. *Verified:* `subscription.test.js` (9),
  `npm run test` 498 passing, `npm run build` clean. **Browser walkthrough owed**; trial
  expiry still unenforced; the provision endpoint's prefix issue is **(cross-repo)**.
  Later the same day the **code-based teacher group was replaced by the school itself**:
  the Account page's **Your school** card lists every verified teacher who registered with
  the same `teaching_school_id` (`hooks/useSchoolColleagues`, `teacher/SchoolColleagues.jsx`)
  — nothing to create, share, request or approve; `lib/teacherGroups.js` is gone and the
  Flask group endpoints are unused **(cross-repo, left in place)**. *Verified:*
  `SchoolColleagues.test.jsx` (5), `npm run test` 528/528, `npm run build` clean; the
  browser walk is owed with the rest of the solo screens.
- `[~]` **Schools join by request** (2026-08-30, "Tier 2"): the superadmin console gets a
  **School requests** queue over `subscription_requests`; **Approve** creates the school
  and its trial subscription on the seats the school chose and promotes the requester to
  its admin in one Flask batch (`POST /api/superadmin/requests/{id}/approve`,
  **cross-repo**); the approval notice was a copy-ready message, sent by hand until
  2026-09-18 (below) — the queue's copy dialog is now the fallback, not the only path; a
  **suspended or cancelled school is suspended for everyone in it** (status mirrored onto
  `schools/{id}`, gated in `ProtectedRoute`, `/suspended` screen); the welcome page links a
  school to `/register?type=institution`. *Verified:* `npm run test` 523/523,
  `npm run build` clean, `tests/smoke_superadmin.py` covers the endpoint and the mirror.
  **Open:** the browser walk of the five-step demo (request → approve → notice → admin
  signs in → suspend/reactivate); seat prices still unconfirmed; trial expiry and seat
  limits still unenforced. Plan: the "Tier 2 Build Plan" artifact; decisions in
  `OPEN-QUESTIONS.md`.
- `[x]` **A college teacher sets the pass mark and which way the point scale runs, and
  can try a setup before saving it** (2026-09-11, T-45 Tiers 1 + 2 of maykel's CIT-U CMRS
  write-up; Tiers 3 and 4 are `OPEN-QUESTIONS.md` §9). Grade Config takes a passing score
  (1–99, default 75) and, on the point scale, 1.0-is-highest or 5.0-is-highest, with the
  generated ranges table; the record, performance, reports, students pages and the
  student's own screens all read the same `gradePolicy`; a Preview card simulates sample
  scores through the record's own function. `POST /api/grading-setup` forwards the two
  fields **(cross-repo, backend `76b5c69`)**. *Verified:* `grading.test.js` proves a
  gradebook without the fields computes exactly as before (five score sets × three modes);
  `gradeDisplay.test.js`, `validation.test.js`, `PreviewPanel.test.jsx`; `npm run test`
  800/800, build clean; `smoke_grading.py` asserts the fields land on the preset and the
  gradebook. Browser, as the seeded teacher on BSIT-C: both directions saved and read
  back, scores 90/55/62 read 4.50/1/3.25 inverted and 1.50/5/2.75 standard with the pass
  count flipping between "≥ 3.00" and "≤ 3.00"; the preview recomputed live. **Owed:** the
  click-through as one of BSIT-C's students (needs a student sign-in).
- `[x]` **Recovering a mark now recovers it to the class's own pass mark** (2026-09-12).
  Recover Marks on the Scaffold Topics page lifted a failing score to a hard-coded 75 in
  every class, so a college class with a different pass mark either recovered students to a
  mark that still failed, or past the mark that passes. `recoveryCap()` in
  `lib/remediationRecovery.js` reads the gradebook's `passing_percent` through the same
  `gradePolicy()` the record uses (DepEd K-12 stays at 75, as the record does), the
  Firestore half fills it in when no ceiling is given, and the dialog's Ceiling field
  starts at the class's pass mark and says so; a typed ceiling still overrides it.
  *Verified:* `remediationRecovery.test.js` (+4: CHED 80 and 60, DepEd pinned at 75,
  pre-T-45 gradebook falls back to 75), `npm run test` 886/886, `npm run build` clean.
  Browser, as the seeded teacher on BSIT-C (pass mark 60, point scale) against a
  temporary published plan and practice quiz that were deleted after: the dialog opened at
  60 with "60% is this class's pass mark from Grade Config", the preview read
  55/100 → 60/100 at practice 100% (it would have read 75 before), typing 80 moved the
  preview to 80 and the hint to "This class's pass mark is 60%". Apply was not pressed,
  so the T-45 walkthrough record is unchanged. **Owed:** the same dialog opened on a
  DepEd class in the browser (SCI9 Newton's plan was being reseeded by another pane at
  the time).
- `[x]` **A generated quiz stays inside what the module taught** (2026-09-12). The owner's
  concern: the AI could test something the syllabus never covered, and a student who studied
  the module would be right to be frustrated. Before this, neither the Quizzes page nor the
  remediation practice quiz sent the topic's learning objectives at all — the model had a
  title to go on and nothing else, and nothing told it to stop there. Now: both call sites
  send the objectives; the backend prompt fences generation to them, read narrowly, and asks
  each question to name the objective it assesses, word for word (`SCOPE_WITH_OBJECTIVES`
  in `services/ai/quiz_gen.py`, `objective` required on every drafted question,
  **cross-repo**); `tagObjectives()` in `lib/ai.js` flags a question whose objective is not
  one the model was given and `draftToQuestions` carries `objective` / `off_objective` onto
  the saved question; the quiz editor shows **Not tied to a listed objective — check this
  was taught** on a flagged AI question, with an **It was taught** button that clears it (a
  saveable change), and "Assesses: …" under every other; and the Generate dialog warns
  before generating when the picked topic has no objectives written, since that is the case
  with nothing to fence against. Nothing is dropped — the teacher decides, as before.
  *Verified:* `ai.objectives.test.js` (9), `npm run test` 899/899, `npm run build` clean;
  backend `tests/test_quiz_prompt.py` (10 checks). Browser, as the seeded teacher: a live
  10-question generation on BSIT-C's Sub-module 1.1 (four objectives) came back with every
  question naming one of the four, shown as "Assesses: …" in the editor and stored on the
  quiz document; a flag forced onto Q1 through the Admin SDK rendered the amber notice and
  **It was taught** cleared it and marked the draft unsaved; with the topic's objectives
  temporarily blanked, the dialog showed the no-objectives warning the moment the topic was
  picked. The walkthrough quiz, its banked questions and the blanked objectives were all
  restored or deleted afterwards. **Not covered:** a question the model genuinely drifted on
  — the fence held on the one live run, so the flag path was proven with a forced value.
- `[x]` **A teacher sees only the students they handle** (2026-08-31). The rules used to
  let *any* teacher read *any* student's profile, attempts, risk, remediations, grades,
  guardian links and consent — the screens were scoped, the database was not. Now
  `users.teacher_ids` (server-written from the rosters, `services/roster_sync.py`) and
  `classes.teacher_id` gate every one of those; a client can no longer write a roster,
  change an owner, delete a class, or touch `teacher_ids` — those five paths go through
  `POST`/`DELETE /api/classes/{id}/roster`, `DELETE /api/classes/{id}` and the provision
  endpoint **(cross-repo)**. *Verified:* `npm run test:rules` 46/46 against the real rules
  engine, including a foreign teacher denied on every collection and every forgery
  refused; `tests/test_roster_sync.py` (5) and `smoke_classes.py` assert `teacher_ids`
  lands on provision; the live project was backfilled (17 students), then the rules and
  indexes were **deployed 2026-08-31** (the owner ran it; the predeploy gate re-ran the
  46 rules tests first) and proven live through the Firestore REST API as Maria and as a
  second seeded teacher: 16/16 — own students readable, the other teacher's refused in
  both directions, every forgery (teacher_ids, student_ids, class delete, editing a
  foreign student) 403, an ordinary own-class edit still 200.
- `[x]` **Syllabus file upload, for real** (decided 2026-09-04, done 2026-09-12). The
  Firebase project is on Blaze, the default bucket `activklass1.firebasestorage.app`
  exists, and `firebase deploy --only storage` from the backend repo released
  `storage.rules` **(cross-repo)**. *Verified 2026-09-12:* in the browser as the seeded
  teacher, Upload File on the BSIT-C syllabus's sub-module took a test PDF with no error
  and Save Syllabus kept it; the Admin SDK then listed the object under
  `learning_materials/{syllabusId}/` (402 bytes, `application/pdf`) and the saved
  `syllabi/{id}` document carries its `firebasestorage.googleapis.com` download URL.
  The Blaze upgrade wizard's budget step showed an error but saved anyway: `activklass1`
  carries a $10/month Firebase budget (owner confirmed in the Cloud console,
  2026-09-12). The upload runs on the Firebase project,
  which is billed to the AI Gmail's billing account (the Firebase Gmail's own payment
  profile was closed by Google five times).
- `[~]` **A scaffold points back to the module it came from** (2026-09-12). Each review
  guide on the student's Scaffolded Learning page now carries a **Where this fits in your
  modules** card — Module *n* · title › Sub-module *n* · title, in the numbering the class
  page's Modules tab uses — and a **Read more in Modules** link that opens that tab with the
  sub-module scrolled into view and highlighted (`?tab=topics&topic=`); the Modules tab in
  turn marks a scaffolded sub-module with a **Review guide →** chip back to the guide. (A
  syllabus has modules and sub-modules; there is no separate lecture level — the sub-module
  is the unit a scaffold and its materials hang off.) Two things had to be true first, and
  were not: the teacher's Scaffold Topics page read only the seed's
  `classes/{id}/syllabus/current` and the student's pages only `syllabi/{syllabus_id}`, so on
  any class whose syllabus came from the syllabus page (BSIT-C) the teacher was told to
  "build a syllabus first", and on any seeded class (SCI9 Newton) the student's card could
  never find its module. Both readers now resolve `syllabus_id` first and fall back to the
  per-class document. A `file` material also opens now that Storage is live, instead of
  saying downloads are off. *Verified:* `scaffolding.test.js` (8) and `remediation.test.jsx`
  (4, the card and the class page rendered against a mocked read), `npm run test` 890/890,
  `npm run build` clean; browser, as the seeded teacher: BSIT-C's Scaffold Topics moved from
  "build a syllabus first" to "generate quizzes from syllabus topics", and SCI9 Newton's
  still lists its two tracked topics and published plan. **Owed:** the student click-through
  (open a review guide → Read more in Modules → the highlighted sub-module → Review guide
  chip) as Hana Lorenzo, who holds the seeded Atomic Structure guide — needs a student
  sign-in in the browser.
- `[x]` **Generating a syllabus asks for what the model actually needs** (2026-09-12).
  The curriculum was decided by a regex on the subject code's shape and never shown:
  `MATH10` aligned to DepEd, `Math 10` with a space fell to "general" and lost every MELC
  code, and the dialog said "aligns to DepEd MELCs" either way. Nothing asked which quarter
  a K-12 syllabus was for, so a 10-week request compressed Quarters 1–3 into it; nothing
  carried an SHS strand or a college program. Now the Generate dialog has a **Curriculum**
  select (DepEd K-12 / CHED GE / CHED Professional / No official standard, each with a
  one-line hint — the last one amber, "codes are left blank"), defaulted from a **For
  class** picker that also fills code, name and level, or from a typed "Grade N" / "Nth
  Year"; a **Coverage** quarter for K-12 (college is already a semester, so none there);
  **Strand** on Grades 11–12; **Program** on college. All four go to
  `POST /api/syllabus/generate` as real fields **(cross-repo, backend `cb75168`)**, where an
  explicit curriculum wins and an absent one still falls back to the guess. *Verified:*
  backend `tests/test_syllabus_prompt.py` (18), `npm run test` 899/899, `npm run build`
  clean; browser, as the seeded teacher: picking Newton filled SCI9 / Science 9 / Grade 9 /
  DepEd with Coverage shown, picking BSIT-C filled CHED Professional with Program shown and
  Coverage hidden; then `Math 10` (with the space), Grade 10, Quarter 2 returned 11 topics
  with every code in Quarter II (`M10AL-IIa-1` … `M10GE-IIi-j-1`) and the model titled
  the draft "Quarter 2: Polynomial Functions, Circles, and Coordinate Geometry". The draft
  was not saved. **Not covered:** a live SHS or college generation with strand/program set
  — the prompt lines are proven by the test, not by a model run.
- `[x]` **A quiz stays connected to its syllabus topic, and losing that link is a choice**
  (2026-09-12). Two gaps in the topic link that Scaffold Topics and the student's review
  guide run on. (1) The Generate Quiz dialog read only `syllabi/{syllabus_id}`, so on a
  seeded class (SCI9 Newton) the topic dropdown was empty and every quiz made there carried
  no `topic_id` — Scaffold Topics showed the topic with no quizzes and no mastery. It now
  reads the per-class document as a fallback, the same order Scaffold Topics reads
  (`7a05df1`, Quizzes pane's file at the owner's direction). (2) Removing a sub-module from
  the syllabus left its quizzes pointing at a topic that no longer existed — they vanished
  from Scaffold Topics with no warning while the page's linked-quiz count still included
  them. Now × on a sub-module (or a module) that has quizzes linked asks first — "N quizzes
  are linked to it. They keep every question and every score already in the class record —
  they just won't show under a topic on Scaffold Topics any more" — and Save sets those
  quizzes' `topic_id` to `null`, the state the quiz bank already shows as Uncategorized.
  **Grades are never touched**; the record is by assessment, not by topic. Decided against
  showing a removed topic as zero mastery: the quiz has real scores, so zero would be a
  false number. *Verified:* `npm run test` 899/899, `npm run build` clean; browser, as the
  seeded teacher: Newton's dropdown lists its five seeded topics, BSIT-C's still lists its
  sub-module; on a throwaway syllabus with a throwaway quiz linked to its one sub-module, ×
  raised the dialog with the exact wording, the quiz's `topic_id` was unchanged until Save
  and `null` after it with the quiz still present; the module-level dialog counted the same
  quiz re-pointed at BSIT-C's sub-module and was cancelled, leaving BSIT-C untouched; both
  throwaway documents were deleted after. **Not built:** a draft-level summary of
  `melcWarnings` (a code claimed by two topics) — still console-only.
- `[x]` **A teacher publishes activities, assignments and paper exams under a sub-module,
  with a file and a window, and the student sees what is due** (2026-09-13, the class-tasks
  convoy in `docs/plans/modules-content-and-deliverables.md`, Steps 1–5; verified by the
  Verify pane as Step 6). `class_tasks/{id}` is keyed by class (a syllabus is shared across
  sections, so a date cannot live on it); the teacher's new **Modules** tab on a class adds
  one under any sub-module with instructions, PDF/link attachments under
  `task_files/{classId}/{taskId}/`, `opens_at` / `due_at`, points, draft → publish; the
  student's dashboard gets **Up next** (Overdue · Due today · This week · Later · Finished,
  list or month calendar) over quizzes and tasks together, the class Modules tab shows each
  task under its sub-module with the same window chip, and publishing notifies the roster
  with a deep link that scrolls to and highlights the sub-module. *Verified 2026-09-13,
  all headless through `_tools/verify/drive.mjs` on the live project after the owner's
  deploy:* **teacher**, as Marites on SCI9 Newton — an assignment with a PDF saved as a
  draft (Firestore document `status: 'draft'`, attachment URL on `firebasestorage`, the
  303-byte `application/pdf` object listed under the task's path), edited, published
  (`status: 'published'`; 8 `task_published` notifications, one per student, each linking
  `?tab=topics&topic=t1`), two more published to land overdue and due-today, one left as a
  draft; a draft's delete is one click, a published task's asks for DELETE typed; **student**,
  as Carlo — Up next read *Overdue · 3 / Due today · 1 / This week · 1* with the right items
  and the draft nowhere; the calendar put a dot on each due day in five states; every row
  deep-linked to its sub-module; the Modules tab showed the three chips and the 📄 button
  opened the Storage URL in a new tab (`noopener`; the URL serves the PDF); the deep link
  highlighted `topic-t1` in gold for the 3.5 s the code promises; the bell listed the three;
  **rules**, `npm run test:rules` 56/56 including the `class_tasks` block, and with the
  draft condition removed from the rule two of its tests go red. Locks: the convoy's own
  (`classTasks.test.js`, `deliverables.test.js`, `UpNextPanel.test.jsx`,
  `deliverables.test.jsx`, `modules.test.jsx`, `useStudentDeliverables.test.js`), each
  broken and seen red; plus `lib/classTasksGuards.test.js` for the two things none of them
  read — the student query carrying `status == 'published'` in the suite that runs on
  every change, and DELETE-to-confirm only on a published task. `npm run test` 1035/1035,
  build clean. Everything created for the pass was deleted afterwards (the four tasks
  through the app's own Delete, the 24 notifications and the Storage object through the
  Admin SDK). **Not covered:** editing a task *after* publishing (the save-without-
  re-notifying path — unit-tested, not driven); a non-PDF attachment; BSIT-C (the plan's
  class — it has no student quick-login, so Newton was used and Carlo stood in for Hana);
  clicking the bell entry itself rather than its URL. **Noted, not fixed:** deleting a task
  leaves its file in Storage; `seed_demo.py`'s three demo tasks are committed but were never
  run, so the live project has no seeded tasks.
- `[x]` **Quiz scores reach the class record on their own** (2026-09-13, owner decision).
  Publishing already created the record column; the marks only landed when the teacher
  pressed **Post scores to class record**, so a student who finished a quiz stayed out of
  the grades, the Performance tab and their own `entries` until then. A student's device
  cannot write the gradebook (the rules let it read only its own entry), so "automatic"
  is *the next time the teacher looks*: the class record page and a quiz's results view
  both run the same sync on open (`useAutoPostScores` in `hooks/useQuizRecordSync.js`,
  over `quizzesToAutoPost` — published, assigned, mapped) and say what they posted or why
  a class was skipped (a locked period, no mapping); the button stays as **Post scores
  now** for the moment after an essay is marked. Same scoring policy, same locked-period
  refusal, same `syncEntries`. *Verified:* `quizToRecord.test.js` (+2), `npm run test`
  1037/1037, build clean; live, as the seeded teacher: Curie's Respiratory quiz had one
  graded attempt (Aquino, 11/29) and an empty record column from the day before — opening
  the class record posted it ("1 posted just now"), the column read 11 and the Prelim
  grade 69, and the Admin SDK showed the assessment's `scores` filled, `synced_at`
  re-stamped, and Aquino's `entries` document carrying Prelim 69 one second later; the
  quiz's results view showed the same line. **Not built:** posting at the moment of
  submit, which needs a Flask route (the student cannot write the record).
- `[x]` **A task counts toward a grade component, and the component is guessed from the
  kind** (2026-09-13, owner decision). A published activity, assignment or exam with points
  used to be typed a second time under **+ Add assessment** on the record; now the task
  dialog has **Counts toward** (grade component · grading period, or **Not graded**) and
  publishing creates the record column itself — `task-{id}`, title, points, component,
  period, the deadline's date, `source_task_id`, shown with a ◇ on the record — and later
  saves keep it in step. The pick is pre-filled by name from the kind (`lib/recordMapping.js`:
  a quiz → Quizzes / Written Works, an activity or assignment → Performance Tasks, an exam
  → Quarterly Assessment / Major Exam; the first unlocked period) and the quiz publish
  modal now opens on the same guess instead of whichever component is listed first. A
  stored per-kind default was deliberately not added — it would be a new gradebook field
  through `POST /api/grading-setup` (cross-repo, the T-45 trap) for a pre-fill a name
  match already gets. Scores are still typed on the record; deleting a task leaves its
  column and the confirm says so. *Verified:* `recordMapping.test.js` (11),
  `classTasks.test.js` (+3), `npm run test` 1051/1051, build clean; browser, as the seeded
  teacher on Newton (Quarter 1 locked): + Add → Assignment opened on Performance Tasks
  (50%) · Quarter 2, switching the kind to Exam moved it to Quarterly Assessments (20%)
  and back; a throwaway activity out of 20 due 20 Sep published, and the Admin SDK showed
  `task-{id}` under `pt` / `q2`, `total_points` 20, `date_given` 2026-09-20, no `scores`;
  the record's Quarter 2 tab showed the ◇ column under Performance Tasks with typeable
  cells. The task, its column and its 8 notifications were deleted after, and one
  record save re-synced the students' `entries`. **Not driven:** the quiz publish modal's
  pre-fill (the same tested function; the modal opens only on Publish).
- `[x]` **A task can open a submission bin, and the student hands work in through the app**
  (2026-09-13, the convoy in `docs/plans/modules-content-and-deliverables.md` §9 — the owner
  reversed D7 the same day the first convoy closed; S-1 to S-4 built here, S-5 is the Verify
  pane's). Per task, opt-in: the teacher ticks **Accept submissions through the app** (never
  offered on a paper exam) and the row gains a **"N of M submitted"** chip that unfolds every
  student on the roster — who handed in and when, late in red, their file or link and note,
  the rest greyed as *not yet* — with a link to the class record, where the mark is still
  typed; nothing is graded in the bin. The student's class page gets a **Hand in your work**
  box on such a task (one file to `task_files/{classId}/{taskId}/submissions/{uid}/` or one
  link, an optional note), then *Submitted · when* with **Replace** until the teacher unticks
  the box, after which it reads *Submissions are closed*; the deliverable turns `done`, so
  **Up next** files it under Finished with the same Submitted line. One row per student per
  task (`task_submissions/{taskId}_{studentId}`, the id built only by `submissionId()`),
  written only by that student, only onto a published task that accepts and lists them; the
  teacher reads through the class, so the list query carries `class_id` beside `task_id`;
  *late* is derived, never stored. Cross-repo: the rule block, the `(class_id, task_id)`
  index and the storage path (backend `6c67c45` … `44ce1d3`), **deployed by the owner
  2026-09-13**. *Verified:* `npm run test:rules` 64/64 (+8) — and with the
  `accepts_submissions` condition removed from the rule one goes red; `taskSubmissions.test.js`
  (13), `deliverables.test.js` (+2), `useStudentDeliverables.test.js` (+2),
  `classTasks.test.js` (+4), `modules.test.jsx` (+7), the student `deliverables.test.jsx` (+6);
  `npm run test` 1081/1081, build clean. Live, after the deploy: as the seeded teacher on
  Newton a throwaway activity published with the box ticked read **1 of 8 submitted** and
  unfolded Hana's row (time, link, note) over seven *not yet*; headless as Hana
  (`drive.mjs`, `page.login('Hana')`) the class page showed her submission with Replace,
  Replace with a new link and note re-submitted through the live rule (the Admin SDK showed
  the new url, a fresh `submitted_at` and the counter climbing), and the dashboard's
  Finished section listed the task as *Submitted · Sun 13 Sep, 10:34 PM*. The task, its
  submissions and its 8 notifications were deleted after. **Not driven:** a file upload
  through the box (the link path was; the file path is the same `AttachmentField` the
  syllabus and contest forms already prove, on a Storage path only that student may write);
  the seed's Hana submission (`seed_demo.py` has never been run on the live project).
  **S-5, same day, by the pane that built S-2 to S-4 (said so in `8354160`):** 20/20 through
  the live Firestore REST API as Hana, Marites, a second teacher and Carlo; the file path
  driven headless (a PDF landed under Hana's uid); the everyday-suite guard
  `taskSubmissionsGuards.test.js` proven to bite. Its two findings were fixed the same
  evening: a first submit no longer flashes the empty form (`5f339f9`, re-driven headless —
  Submitting… → Submitted with no frame between), and a task's **hand-out** folder now
  takes writes only from the class owner through a cross-service `firestore.get()`
  (backend `6364679`; the first `firebase deploy --only storage` did not take the IAM grant
  the lookup needs and refused the owner too — the second did, 7/7 live: student and
  foreign teacher refused, owner writes and deletes, the submissions path unchanged).
- `[x]` **The two approval notices go out on their own, not just as a copy-ready dialog**
  (2026-09-18). Both the school-request approval and the teacher ID-check approval used to
  end at a "copy this into an email" dialog — the queue's own docs called that the whole
  notification path, since no mail provider was wired in. T-69 wired one in for payment
  receipts (Gmail SMTP with an app password, `app/services/mail.py`, no new dependency), so
  both approvals now reuse it: `POST /api/superadmin/requests/{id}/approve` emails the
  school's welcome notice itself, in the same batch response, and stamps `notice_sent_at` /
  `notice_to` or `notice_error` on the request; `verifications.jsx` still approves
  Firestore-direct (unchanged — no plan or seat decision belongs in Flask for that path) and
  now calls the new `POST /api/superadmin/teachers/{uid}/notify-approval` right after,
  stamping the same three fields onto `verification_notice_*` on the teacher's profile. Both
  are best-effort: a mail outage never undoes an approval that already landed, it just means
  the copy dialog — still there, wording changed to say whether the email went out — is the
  way to send it by hand instead. *Verified:* `tests/smoke_superadmin.py` (+21: the
  requester's own inbox gets the letter with the right seat figures, the teacher's welcome
  email carries the trial end read off their own profile, and a forced mail failure on each
  path still returns 200/201 with the school or account already written and the failure
  recorded server-side, never in the client response); `npm run test` 1182/1182,
  `npm run build` clean. **Both sides confirmed live** (2026-09-18, via the Resend button
  below, not the original approval): a real teacher recipient (Maykel) reported receiving
  "Your ActivKlass account is verified", and a real recipient on one of the three Tabor
  Hill College test accounts reported receiving the school's "Your ActivKlass school
  account is ready" email — the server log (`notice_sent_at`, no `notice_error` on all
  three) was correct, delivery just took a look in the actual inbox to confirm rather than
  being assumed from a clean send.
- `[x]` **A superadmin can resend either welcome email on demand** (2026-09-18, same day,
  owner's request — needed to actually check a real inbox without re-running the approval
  each time). Approve refuses to run twice on the same request, on purpose: that guard is
  what stops a second school from being minted on a retry. So there was no way to confirm
  delivery after the fact, or retry a failed send, without the destructive dance of undoing
  the approval first. New `POST /api/superadmin/requests/{id}/resend-notice` reads the
  school, subscription and admin the approval itself wrote (never the stale request) and
  calls the same sender again; the teacher side needed nothing new; `POST
  /api/superadmin/teachers/{uid}/notify-approval` already had no re-approval guard to run
  into, so calling it again already was a resend. Both queues' **Recently approved** lists
  get a **Resend welcome email** button beside the existing copy-dialog one. Also added:
  `scripts/reset_for_retest.py` (backend, not wired into the app) — for the harder case of
  wanting to re-run Approve itself, not just resend, it rewinds a test teacher or request
  back to pending and deletes the school/subscription the approval created, dry-run by
  default. *Verified:* `tests/smoke_superadmin.py` (+10: resend is refused on an unapproved
  request and on a still-pending teacher, a school admin can't call it, a second call sends
  a second email without touching approval state); `npm run test` 1182/1182, `npm run build`
  clean. **Live 2026-09-18:** Resend was clicked in the browser against six real test
  accounts (three Tabor Hill College institution requests, three self-registered teachers);
  both sides have a confirmed real-world delivery now — a teacher (Maykel) and one of the
  three Tabor Hill College accounts — closing the browser gap the entry above used to leave
  open.
- `[x]` **Payment happens inside the website, on play money (T-68, dawny808-87)**
  (built 2026-09-17 → 09-19, this entry written 2026-09-26). Registration promised "We'll
  ask for payment details before it ends" and nothing ever did — there was no money path
  in either repo, and `trial_ends_at` was stamped and enforced nowhere. Owner decision:
  Option A, PayMongo test mode, hosted checkout. The Account page's Subscription card
  gets a **Pay for this school year** button whenever the account's own plan (never a
  school's — the admin pays for those) is on trial or expired; it calls
  `POST /api/subscription/{owner}/checkout`, which recomputes the amount server-side from
  the stored seats and sends the browser to PayMongo's hosted page **(cross-repo,
  `70846d6` web / backend)**. The register.jsx sentence now says what actually happens:
  "No card needed for the trial. Pay for the school year any time from your Account page."
  A first pass (`/verify` 2026-09-19) found the flow sound but not actually fixed: the
  return page was the *only* thing that ever flipped a payment, so a payer who closed the
  tab — maykel's real ₱3,600 test run among them — stayed on a trial forever even though
  PayMongo had taken the payment; T-80 (separately) fixed the return URL following the
  tester's own host instead of `localhost`. `reconcile_pending_payments()` closed the
  other half **(backend `0de59f2`)**: `GET /subscription/{owner}` now re-checks that
  owner's still-`pending` payments against PayMongo before answering, so a payer catches
  up the moment they open any screen reading their own subscription — no `checkout_ref`,
  no return trip required — and a new superadmin-only sweep
  (`POST /api/superadmin/payments/reconcile`) catches a payer who never reopens the app at
  all. Nothing here trusts the client: `_mark_paid` still re-reads the payment's own status
  from PayMongo before writing anything; this only decides *when* to ask.
  *Verified:* `tests/smoke_payments.py` (backend) — the exact shape `/verify` asked for: a
  paid session nobody returns from still ends active the next time its owner's
  subscription is read, a session PayMongo still calls unpaid never produces one, one
  owner's read never touches another's pending payment, and the superadmin sweep flips
  only what PayMongo actually confirms. `accountPayButton.test.jsx` locks when the button
  appears (trial, expired, the self-registered no-document path; never active or a
  school's plan). Read live against the real project (2026-09-26, read-only Admin SDK):
  maykel's own `subscriptions/{uid}` document is `status: 'active'`,
  `last_payment.reference` matches his real PayMongo payment id, and his `payments` doc
  carries `receipt_sent_at` with no `receipt_error` — the reconciliation genuinely
  recovered his write-off run, not just in the commit that claims it. **Browser, this
  session:** a fresh trial teacher, provisioned directly (the shared dev browser was mid
  in-flight test elsewhere), signed in, opened the Account page, saw "INDIVIDUAL TEACHER
  · Free trial — 20 days left" with the Pay button, clicked it, and landed on a real
  `checkout.paymongo.com` hosted page reading "ActivKlass — individual plan, one school
  year," Total Due ₱1,200.00 — the correct `estimateSolo` amount for that account's actual
  (zero) student count, proving the server priced it from real data rather than trusting
  the client. Stopped there on purpose — completing a PayMongo test payment through
  browser automation has been unreliable in past sessions and adds nothing the smoke
  suite and the live Firestore read above do not already prove. **Also fixed this
  session:** the "payment not yet confirmed" banner on the Account page named PayMongo by
  name ("If you completed it on PayMongo, refresh in a moment…"), breaking the
  never-name-a-vendor rule; reworded, and `accountPayButton.test.jsx` gained a check that
  none of the four checkout banners mention the gateway, watched red before the fix.
  `npm run test` 1296/1296, `npm run build` clean. **Not built:** enforcing
  `trial_ends_at` itself — recorded but nothing locks a lapsed trial out yet, a separate
  owner call.
- `[x]` **The registration phone check no longer refuses a returning person their own
  number, and now catches every format of the same number** (2026-09-26, T-94 then T-93,
  both `/verify`'s own findings while checking T-88, `andecobs-117`). T-94 first: the
  duplicate-phone check (T-88) ran before `createUserWithEmailAndPassword`, and therefore
  before the `getDoc(users/uid) → navigate('/portal')` branch that recognises a finished
  account resubmitting its own details — someone re-registering with their own email and
  phone was told their own number was already on another account instead of being sent to
  their portal. Fixed by reordering, not loosening: the existing-account branch (a
  different session already signed in, or this person's own half-made/finished
  registration) is settled first, and only a genuinely new registration reaches the phone
  check; a stranger's number is still refused with the same wording, and the endpoint
  still answers yes/no only, never whose account. T-93 next, now that the call site was
  settled: the check compared exact bytes, so `09434969549` (6 accounts, Derick's own
  screenshot) was refused, but `0943 496 9549`, `0943-496-9549` and `+639434969549` all
  sailed through — and the field's own placeholder is the spaced form, so the un-checked
  path was the default one. Owner's decision on 2026-09-21: a phone number belongs to one
  person only. `normalizePhone` in `lib/validation.js` strips spacing/punctuation and
  folds a leading `+63`/`63` to `0`; the backend's `_normalize_phone`
  (`app/api/auth.py`, **cross-repo**) mirrors it in Python and now reads every stored
  `users.phone` and normalises it there rather than an indexed exact-match query — chosen
  over a stored `phone_canonical` field specifically because a canonical field only helps
  rows written after it exists, and a backfill over the live accounts that already
  collide was ruled out under this card and flagged to the owner instead (`09154686377`
  on 3 accounts, `+639154686377` on a 4th, left untouched). *Verified:* a test beside
  `register.jsx` locking the new call order (red against the old order, confirmed by
  reverting the reorder and re-running); `normalizePhone` tests in
  `validation.test.js`; the backend's `smoke_phone_in_use.py` extended with four in-use
  format variants and three free-number variants, confirmed red first by reverting only
  `app/api/auth.py` and re-running (the four variant checks failed, everything else
  passed). `npm run test` 1301/1301, `npm run build` clean. Live against the real
  `activklass1` project: three full registrations driven in the browser (a new
  registration on a free number reached pending-verification as before; resubmitting the
  same email and phone as a pending account was recognised and sent back to that
  account's own status page instead of refused; a second account trying a number already
  on the first was refused with the unchanged wording) plus a direct check that
  `09434969549` now reads in-use in all three of the ticket's confirmed formats and that
  `0943 496 9549` — the placeholder's own format — is refused end to end through the form;
  every test account created for the passes was deleted afterward through the Admin SDK.

## Phase 8 — After the defense `[ ]` not started
Deliberately not built now. Recorded so it does not get started early:
~~deployment and a real host~~ (**pulled forward 2026-09-14 — the defense requires a
deployed system; the audit and the decisions it waits on are
`../activklass-backend/docs/09-deployment-readiness.md`**); server-side validation parity; splitting the 654 kB main
chunk; retiring the placeholder training data behind the risk model; the lint backlog;
a real account-deletion path (see `OPEN-QUESTIONS.md` §8 — deactivate is the answer for
now, and RA 10173 erasure is the reason it will not stay the answer).

---

## What "done" is not
- **Not deployed.** There is no host, and standing one up is out of scope for the
  defense. See `docs/OPEN-QUESTIONS.md`.
- **Not production-hardened.** Blaze only for Storage's free allowance, one dev machine,
  seeded pilot data.
- **Not feature-complete.** A capstone demo shows the system working, not every feature
  a school would eventually want.
