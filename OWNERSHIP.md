# Pane Ownership

Working rules for running several Claude Code panes against this repo at the
same time. **If you are a pane: read this before your first edit.**

## The one rule

> A pane may edit only the files listed under its lane.
> Everything under **Shared** needs a heads-up in the other panes first.

Two panes editing the same file is the only thing that reliably breaks
parallel work. Everything below exists to make that impossible.

## How the lanes work

There are **concern lanes** for cross-cutting work and **page lanes** for work
inside a single screen. Most tasks are one or the other, and which one decides
who does it.

A task is **concern-lane** work if it changes something everywhere at once — a
brand colour, a font, what we ask the AI for, how class data is loaded. Those
now live in dedicated modules, so one pane owns them and no one else opens
them.

A task is **page-lane** work if it changes one screen — this table's columns,
that form's validation, this page's layout. Route files still hold markup and
logic together, so a page belongs to exactly one pane at a time.

---

# Concern lanes

## UI/UX lane

```
src/theme.js          ← all colour + typography tokens
src/index.css         ← global styles
src/components/**     ← shared presentational components
```

`theme.js` is the whole palette and type system. Changing `navy` there
restyles all 31 files that use it. Before this existed every page redeclared
`const navy = '#0E2A5C'` — 30 copies of that one token — which is why colour
changes used to mean editing 25 files.

Two tokens are deliberate duplicates, preserved so the extraction changed no
pixels: `goldAmber` (routes/index.jsx used it as `goldDeep`) and `inkMuted`
(Markdown.jsx used it as `muted`). Deciding whether those were mistakes and
collapsing them into `goldDeep` / `muted` is this lane's call.

## AI lane

```
src/lib/ai.js
```

Every call to the Gemini-backed endpoints, plus the prompt shaping around
them. `generateQuiz` assembles the Bloom's-level / subject / target-level
hints into the notes string the backend appends verbatim, so tuning what the
model is asked happens here — not in the pages that render the result.

The backend also exposes `/api/predict`, `/api/map_struggle`, `/api/remediate`,
`/api/grade_essay` and `/api/generate_scaffold`. Wrappers for those belong in
this file as the UI grows into them.

## Data/logic lane

```
src/hooks/**
src/lib/roster.js        src/lib/grading.js       src/lib/studentData.js
src/lib/quizGrading.js   src/lib/classForm.js     src/lib/notifications.js
src/lib/gradebook.js     src/lib/quizToRecord.js  src/lib/questionBank.js
src/lib/remediationRecovery.js
src/lib/quizPool.js      src/lib/quizFeedback.js
src/lib/quizAttempts.js
```

**`quizPool.js`, `quizFeedback.js` and `quizAttempts.js` exist twice.** Each has a TypeScript port
in `activklass-mobile/src/lib/`, because the two apps have separate builds and
no shared package. Edit one, edit the other — `src/lib/portParity.test.js`
imports both copies across the repo boundary and fails if they diverge. Do not
"fix" a parity failure by editing the test.

**An attempt is created at Start, not at submit.** `quiz_attempts` documents
now begin life as `in_progress`, stamped with a server `started_at`, and are
updated on submit. Anything that counts attempts must count *finished* ones —
`finishedAttempts()` — or a student mid-sitting is locked out of the attempt
they are in. `firestore.rules` was widened to match, narrowly: a student may
update their own attempt only while it is still `in_progress`.

`gradebook.js` holds `loadBundle` and `syncEntries`, lifted out of the record
page once it stopped being the only writer of scores. `entries` is the only
grade document a student may read and it is derived — anything that changes a
score must call `syncEntries` after, or the student keeps reading the old
grade.

Fetching and domain rules. `useTeacherClasses()` replaced the same Firestore
query written inline in 8 pages; invalidation still works through the
`['fs-classes']` prefix that existing `invalidateQueries` calls use.

New shared queries go in `src/hooks/`, not into a route file.

---

# Page lanes

For work inside one screen. Each page belongs to one pane at a time.

| Pane | Pages |
|---|---|
| **Quizzes** | `teacher/quizzes.jsx`, `teacher/quizzes.$quizId.jsx`, `student/quiz-player.jsx`, `student/quiz-feedback.jsx` |
| **Class detail** | `teacher/classes/$classId/**` |
| **Class setup** | `teacher/classes/index.jsx`, `features/classes/**`, `teacher/grading.jsx`, `teacher/record.jsx`, `teacher/reports.jsx`, `teacher/attendance.jsx`, `teacher/students.jsx` |
| **Syllabus** | `teacher/syllabus.jsx`, `teacher/announcements.jsx`, `teacher/index.jsx`, `teacher/GenerateModuleModal.jsx` |
| **Student** | `student/index.jsx`, `student/classes/**`, `student/profile.jsx`, `student/remediation.jsx` |
| **Admin** | `routes/admin/**`, `routes/superadmin/**`, `teacher/account.jsx` |

**Why Classes is now two lanes.** It was one — `teacher/classes/**` plus the
four teacher-level pages plus `features/classes/**` — and in practice two panes
worked it at once for a whole session: one on the per-class screens, one on
class creation, grading config and validation. That is the single thing the
rule above exists to prevent, and it did not break, because the two panes
announced to each other. Do not read that as the rule being unnecessary. Read
it as the lane having been drawn too wide for the work: the per-class screens
and the setup screens are edited on different tasks and barely import each
other, so they split cleanly and should have been two lanes from the start.
The document was wrong and the panes were right; this records what they were
already doing.

**The `$classId` split is the boundary.** `teacher/classes/$classId/**` is one
class's screens — roster, record, performance, attendance, scaffolds, history.
Everything else is creating and configuring classes. `teacher/record.jsx` and
`teacher/classes/$classId/record.jsx` are different files and sit in different
lanes; check which one you have open.

**Admin was missing entirely.** `routes/admin/**` and `routes/superadmin/**` —
ten files — were in no lane and not Shared, so nothing said who owned them or
whether to announce. `teacher/account.jsx` had the same gap and is
settings-shaped, so it lands here. A file in no lane is worse than a file in
the wrong lane: the wrong lane gets argued about, the missing one gets edited
by two panes in silence.

The gap was found because `admin/BulkUpload.jsx` sat on a pane's task list with
nothing in this document covering it. To be accurate about what did *not*
happen: that pane read the file and committed nothing to it. The hole was real
and unguarded, and it was not a near miss — worth recording as both, because
"we got away with it" and "it could not have bitten" are different claims and
only the first one is true here.

**If a file is not in this table or under Shared, it has no owner.** Say so in
the other panes before you touch it, and add it here in the same commit. The
table is only useful while it is complete.

## Shared

Announce before editing. Keep the change small.

| Path | Why |
|---|---|
| `src/App.jsx` | every route is registered here — navigation lands here |
| `src/main.jsx` | app bootstrap |
| `src/lib/api.js` | every request goes through it |
| `src/lib/firebase.js` | auth + Firestore client |
| `src/context/**` | auth state for the whole app |
| `src/routes/teacher/_layout.jsx`, `src/routes/student/_layout.jsx` | nav shells |
| `src/routes/index.jsx`, `login.jsx`, `register.jsx` | landing + auth |
| `src/components/ProtectedRoute.jsx`, `src/routes/change-password.jsx` | the temp-password gate and the one screen it lets through — auth routing, not presentation, so `src/components/**` in the UI/UX lane does not cover it |
| `BACKLOG.md`, `OWNERSHIP.md` | every pane writes findings here |

**Shared is not a lane, and nobody owns one of these.** A pane that does most
of the work in a shared file still does not own it. This has already been
misread once: `lib/api.js` was announced correctly and then described as that
pane's file afterwards. Note which half went wrong, because the fix is not
"announce more" — the announcement happened. Shared has no unowned state to
claim, so there was nothing to take; announcing buys you one edit, not the
lane, and the next edit needs announcing again.

**Repo docs, because four panes append to them.** Add your own section, do not
restructure anyone else's, and re-read before you write — `BACKLOG.md` moved
six times in one session. If you are recording another pane's finding, name
them as the source and leave their numbers as measurements: a claim in the
backlog is only worth what the person who can defend it says, and absorbing it
into your own voice quietly strips that.

**Navigation is the usual trap.** "Make this page go to that page" is normally
a `<Route>` in `App.jsx` or a link in a `_layout.jsx` — both shared. Only a
`navigate()` call inside a page you own is lane-local.

## How to work

**One dev server, not four.** Run `npm run dev` in a single pane; every pane's
edits hot-reload into the same browser tab, so you watch the combined app.

**Name the target.** "The Generate button on the teacher quizzes page" — not
"the Generate button". Say the page for page work, or the token for theme work.

**Commit per lane, often.** Small commits make a bad interleaving recoverable
with `git revert` rather than by hand.

**One tree, one `main` — `git pull` between panes is always a no-op.** All
panes work the same checkout and the same `.git`. Another pane's commit is in
your working copy the moment they make it, without you fetching. If you find
yourself telling another pane to pull before their next test run, you have the
model wrong; they already have it.

**Stage explicit paths. Never `git add -A`, `git add .`, or `git commit -a`.**
They sweep every other pane's in-flight edits into your commit. This is the
usual advice and it is not sufficient on its own.

**`git push` publishes every pane's local commits, not yours.** You push a
*branch*. Any commit another pane made and has not pushed goes out under your
push, whether or not they were finished deciding to publish it. This has
happened: a push intended to carry one docs commit carried two commits from
another pane with it. Nothing was lost — they were complete and the suite
stayed green — but the choice of when to publish was taken out of their hands.

Before pushing, list what you are about to send and read it:

```
git log --oneline origin/main..main
```

Not `git rev-list --left-right --count`, which answers with two numbers that
are easy to read as your own work. The list names the author and the subject of
every commit; the count does not, and that is precisely the difference between
noticing and not.

## If two panes collide anyway

Claude Code tracks file state — if a file changed since a pane read it, the
edit **fails** rather than silently overwriting. The normal failure is an error
message, not lost work. Re-read, re-apply on top, check whether the other pane
already did it. `git diff` before committing, always.

## Known state

- `npm run lint` reports **39 pre-existing errors**, nearly all
  `no-unused-vars`. Not caused by lane work — a non-zero lint exit is not
  necessarily your bug.
- **Tests exist now** — `npm run test` (vitest) covers the pure modules:
  grading, quiz grading, risk signals, AI draft validation, the bank
  fingerprint, the quiz→record rules, the recovery policies, the per-student
  quiz draw and the feedback-release rules, plus cross-repo parity with the
  mobile ports. Everything with Firestore or React in it is still only checked
  by `npm run build` and by clicking through the page you changed.
- **`npm run test:rules` tests firestore.rules for real.** It starts the
  Firestore emulator (needs Java) and runs `src/lib/firestoreRules.test.js`
  against `../activklass-backend/firestore.rules` — the deployed file, read
  across the repo boundary. Excluded from `npm run test` because it needs the
  emulator. The last block in that file deliberately loads a *weakened* copy of
  the rules in memory and proves the forbidden write then succeeds; that is
  what stops the suite quietly passing while enforcing nothing.
- **Mobile has no test runner.** `npx tsc --noEmit` in `activklass-mobile` is
  its only automated check. Logic that has to match the web belongs in a ported
  module covered by `portParity.test.js`, not inline in a screen.
- `/api` is proxied to Flask on port 5000 by `vite.config.js`, so a forwarded
  VS Code port works for remote viewers. Both servers must be running.
- Backend API is flat and teacher-owned: `/api/quizzes`, `/api/syllabus`. The
  class-nested routes are gone. `PUT` on a quiz or syllabus **replaces** its
  `class_ids` — always resend them, or the assignment is wiped.
