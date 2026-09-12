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
  **cross-repo**); the approval notice is a copy-ready message, sent by hand; a
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
- `[ ]` **A second full browser walkthrough** after the above, which is what actually
  closes this phase.

## Phase 8 — After the defense `[ ]` not started
Deliberately not built now. Recorded so it does not get started early:
deployment and a real host; server-side validation parity; splitting the 654 kB main
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
