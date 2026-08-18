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
```

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
| **Classes** | `teacher/classes/**`, `teacher/grading.jsx`, `teacher/record.jsx`, `teacher/reports.jsx`, `teacher/attendance.jsx`, `features/classes/**` |
| **Syllabus** | `teacher/syllabus.jsx`, `teacher/announcements.jsx`, `teacher/index.jsx` |
| **Student** | `student/index.jsx`, `student/classes/**`, `student/profile.jsx`, `student/remediation.jsx` |

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

## If two panes collide anyway

Claude Code tracks file state — if a file changed since a pane read it, the
edit **fails** rather than silently overwriting. The normal failure is an error
message, not lost work. Re-read, re-apply on top, check whether the other pane
already did it. `git diff` before committing, always.

## Known state

- `npm run lint` reports **39 pre-existing errors**, nearly all
  `no-unused-vars`. Not caused by lane work — a non-zero lint exit is not
  necessarily your bug.
- **No test suite.** `npm run build` compiling is the only automated check;
  click through the page you changed before committing.
- `/api` is proxied to Flask on port 5000 by `vite.config.js`, so a forwarded
  VS Code port works for remote viewers. Both servers must be running.
- Backend API is flat and teacher-owned: `/api/quizzes`, `/api/syllabus`. The
  class-nested routes are gone. `PUT` on a quiz or syllabus **replaces** its
  `class_ids` — always resend them, or the assignment is wiped.
