# Pane Ownership

Working rules for running several Claude Code panes against this repo at the
same time. **If you are a pane: read this before your first edit.**

## The one rule

> A pane may edit only the files listed under its lane.
> Everything under **Locked** needs a heads-up first.

Two panes editing the same file is the only thing that reliably breaks
parallel work. Everything below exists to make that impossible.

## Why lanes are pages, not concerns

The obvious split — one pane for UI/UX, one for AI, one for functionality —
does not work in this codebase, and it is worth knowing why before someone
tries it again.

Every route here is a single 800–1200 line `.jsx` holding markup, colors, data
fetching, AI calls and navigation together. So "change how this button works"
and "change that button's color" are the *same file*. Concern-based lanes
would collide on their first task.

Splitting by page instead means each pane does **all** concerns — styling, AI,
logic, navigation — for the pages it owns. You still get four things happening
at once; the boundary is just *where* you work rather than *what kind* of work
it is.

(The alternative is extracting `components/ui/`, `hooks/` and `lib/ai.js` so
concerns live in separate files. That is a real refactor across ~90 data-fetch
call sites in 26 files, and it only pays back over months of maintenance.
Deliberately not done — this is a one-semester project.)

## Lanes

### Pane A — Quizzes, end to end

Teacher authoring and student taking, because a quiz change usually needs both.

```
src/routes/teacher/quizzes.jsx
src/routes/teacher/quizzes.$quizId.jsx
src/routes/student/quiz-player.jsx
src/routes/student/quiz-feedback.jsx
src/lib/quizGrading.js
```

### Pane B — Classes, records, grading, attendance

```
src/routes/teacher/classes/**          (index + all $classId pages)
src/routes/teacher/grading.jsx
src/routes/teacher/record.jsx
src/routes/teacher/reports.jsx
src/routes/teacher/attendance.jsx
src/features/classes/ClassFormModal.jsx
src/lib/grading.js
src/lib/classForm.js
src/lib/notifications.js
```

### Pane C — Syllabus, announcements, teacher home

```
src/routes/teacher/syllabus.jsx
src/routes/teacher/announcements.jsx
src/routes/teacher/index.jsx
```

### Pane D — Student experience

```
src/routes/student/index.jsx
src/routes/student/classes/**
src/routes/student/profile.jsx
src/routes/student/remediation.jsx
src/lib/studentData.js
```

## Locked

Shared by every lane. **Say so in the other panes before editing**, and keep
the change small and self-contained.

| Path | Why it is locked |
|---|---|
| `src/App.jsx` | every route is registered here — navigation changes land here |
| `src/main.jsx` | app bootstrap |
| `src/index.css` | global styles; a change here affects all four lanes |
| `src/lib/api.js` | every request goes through it |
| `src/lib/firebase.js` | auth + Firestore client |
| `src/lib/roster.js` | imported by 10 files across all four lanes |
| `src/context/**` | auth state for the whole app |
| `src/components/**` | shared components |
| `src/routes/teacher/_layout.jsx` | teacher nav shell |
| `src/routes/student/_layout.jsx` | student nav shell |
| `src/routes/index.jsx`, `login.jsx`, `register.jsx` | landing + auth |

**Navigation is the common trap.** "Make this page go to that page" usually
means a `<Route>` in `App.jsx` or a link in a `_layout.jsx` — both locked. Only
the `navigate()` call inside an owned page is lane-local.

## How to work

**One dev server, not four.** Run `npm run dev` in any single pane. Every
pane's edits hot-reload into the same browser tab, so you see the combined
result live.

**Name the page in your request.** Say "the Generate button on the teacher
quizzes page", not "the Generate button". Without the page, a pane goes
hunting and may wander into another lane.

**Commit per lane, often.** Small commits make a bad interleaving recoverable
with `git revert` instead of by hand.

**Check before a locked edit:**

```
git status --short          # is another pane mid-change?
```

## If two panes collide anyway

Claude Code tracks file state — if a file changed since a pane read it, the
edit **fails** rather than silently overwriting. So the normal failure is an
error message, not lost work. When it happens: re-read the file, re-apply on
top of the newer content, and check whether the other pane already did it.

Git is the real safety net. `git diff` before committing, always.

## Known state

- `npm run lint` reports **43 pre-existing errors** (mostly `no-unused-vars`).
  Not caused by lane work — do not treat a non-zero lint exit as your bug.
- There is **no web test suite** (`dev`, `build`, `lint`, `preview` only).
  `npm run build` compiling is the only automated check; click through the
  page you changed before committing.
- Backend API is the flat, teacher-owned shape: `/api/quizzes`,
  `/api/syllabus`. The class-nested routes are gone. `PUT` on a quiz or
  syllabus **replaces** its `class_ids` — always resend them on update or the
  assignment is wiped.
