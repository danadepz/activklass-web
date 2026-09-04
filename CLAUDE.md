# CLAUDE.md — ActivKlass (web)

## Project Overview
React portal for **ActivKlass**, an AI-assisted class record system for Philippine schools
(DepEd K-12 and CHED tertiary). This repo is the **teacher, student, admin and superadmin
web client**. The Flask API, Firebase rules and the `docs/` shared by all three repos live
in `activklass-backend`. Capstone project — **the next milestone is the defense demo**, so
prefer what the demo shows over what a backlog lists. **Not deployed:** it runs on the Vite
dev server, with a forwarded VS Code port for remote viewers.

## Lanes — the one rule that actually breaks things
Several Claude Code panes work this same checkout at once. **Read `OWNERSHIP.md` before
your first edit.** It lists which files each lane owns and which are Shared; a pane edits
only its own lane, and Shared needs a heads-up in the other panes first. Do not restate or
restructure that table here — it is maintained there.

**Never `git add -A`, `git add .`, or `git commit -a`.** They sweep every other pane's
in-flight edits into your commit. Stage explicit paths. Before pushing, read
`git log --oneline origin/main..main` — a push publishes *other panes'* commits too.

## Core Principles (Always Follow)
- **Firestore is the system of record.** Clients read and write it directly;
  `../activklass-backend/firestore.rules` is the only server-side authorization layer.
- **Two data paths, not interchangeable.** Firestore-direct for all records (classes,
  grades, attendance, quizzes, attempts). Flask (`lib/api.js`) only for what needs the
  Admin SDK or a model: AI generation, risk prediction, account provisioning, admin user
  management, subscriptions, teacher groups, institution invites.
- **`entries` is derived, and it is the only grade document a student may read.** Anything
  that changes a score must call `syncEntries` after, or the student keeps reading the old
  one (`lib/gradebook.js`).
- **AI drafts, the teacher decides.** Every AI feature keeps a manual path and a review
  step. Nothing generated lands in a gradebook, syllabus or quiz without teacher approval.
- **Messages a teacher reads never name our vendors or our exceptions.** No "Firebase …",
  no "Failed to fetch", no raw error text in a UI string. Say what happened and what to
  try — `lib/api.js` is the worked example of why.
- **Simplicity first.** Lowest-effort thing that solves the request. No speculative
  abstraction.
  - *Decision ladder (run before writing code):* Does this need to exist at all? → Is it
    already in this codebase? → Does the runtime do it? → A native Firebase feature? → An
    already-installed dependency? → Can it be one line? → Only then: the minimum that works.
- **Keep docs honest.** This file and `docs/` must match reality. If it isn't built, say
  so — never document a route, collection or command as if it exists.
- **IMPORTANT:** Never add a new service, paid tool, or dependency without explicit
  approval. The one approved spend is Firebase **Blaze** (owner decision 2026-09-04): the
  syllabus page's **Upload File** for learning materials writes to Cloud Storage, and
  Storage needs Blaze on every project — the demo needs a real PDF upload, and the link
  paste is the fallback, not the plan. **Until the upgrade lands** (plus the default bucket
  in the console and `firebase deploy --only storage` from the backend repo) uploads still
  fail with the "paste a link instead" message, so do not describe them as working yet.
  Blaze still does not mean Cloud Functions — anything server-side stays a Flask route.

## Tech Stack
- **React 19 + Vite 8** — SPA, no SSR. `@` aliases `src/`.
- **React Router 7** (`src/App.jsx`) — every screen is lazy (`lazyRoute`), each with its
  own Suspense boundary. Role gating is `<ProtectedRoute roles={[…]}>`.
- **Tailwind CSS v4** via `@tailwindcss/vite` — no config file; tokens live in
  `src/theme.js`, which is the single source of colour and type.
- **TanStack Query v5** — server cache for the shared Firestore reads in `src/hooks/`.
  Invalidation works off the `['fs-classes']` key prefix.
- **Firebase Web SDK 12** — Auth, Firestore, Storage, initialized in `lib/firebase.js`.
  Init is guarded: missing env keys render setup instructions instead of a white screen.
- **Vitest 4** — 446 tests over the pure modules. **The only automated check** besides the
  build; there is no typechecker (plain JSX, not TypeScript).
- Rejected and abandoned choices, with reasons: `docs/TECH-STACK.md`.

## Project Structure
```
src/
├── App.jsx            ✅ every route registered here — SHARED, announce first
├── theme.js           ✅ all colour + typography tokens (UI/UX lane)
├── routes/            ✅ teacher/ · student/ · admin/ · superadmin/ · landing + auth
│   └── teacher/classes/$classId/**   one class's screens — a different lane from
│                                     teacher/classes/index.jsx. Check which you have open.
├── features/classes/  ✅ class creation modal, grade recovery + remediation helpers
├── components/        ✅ shared UI; components/ui/** is the toast/dialog/button layer
├── context/           ✅ AuthContext + useAuth — SHARED
├── hooks/             ✅ shared Firestore queries (new ones go here, not into a route)
└── lib/               ✅ api.js · firebase.js · ai.js · grading · gradebook · roster ·
                          quiz* · validation · 18 *.test.js files
```
`lib/quizPool.js`, `lib/quizFeedback.js` and `lib/quizAttempts.js` **exist twice** — each
has a TypeScript port in `activklass-mobile/src/lib/`. Edit one, edit the other;
`lib/portParity.test.js` imports both across the repo boundary and fails if they drift.
Never "fix" a parity failure by editing the test.

## Development Commands
```bash
npm run dev          # Vite on :5173 — ONE dev server for all panes, not four
npm run build        # production build to dist/  (645ms, main chunk 654 kB)
npm run test         # vitest, 446 tests in 18 files — must pass before you finish
npm run test:rules   # real firestore.rules against the emulator (needs Java)
npm run lint         # 41 PRE-EXISTING errors, nearly all no-unused-vars — not your bug
```
Config lives in `.env.local` (gitignored): the seven `VITE_FIREBASE_*` keys, and
`VITE_API_URL` left **unset** so `/api` goes through the Vite proxy to Flask on :5000.
**After code changes: `npm run test` and `npm run build` must both pass.** Lint's non-zero
exit is baseline noise — compare the count, don't treat it as a gate.

**The backend must be running separately** for anything on the Flask path. A stopped Flask
looks like six unrelated broken features; that has already happened in a walkthrough.

## Do Not
- Build ahead of the defense demo, or over-engineer for imagined future needs.
- Add paid services or dependencies without approval. Blaze is the approved exception;
  anything past it (a second Firebase project, a paid API tier not already decided) asks.
- Talk the owner out of Blaze, or call it optional. This file said "Spark, uploads
  unavailable", so a pane re-derived "you don't need Blaze" from it twice and the owner
  had to correct it both times. When a decision changes, the docs change in the same
  session.
- Commit `.env`, `.env.local`, or any Firebase key.
- Edit outside your lane, or `git add -A` / `git add .` / `git commit -a`.
- Restructure `BACKLOG.md` or `OWNERSHIP.md` — append your own section, leave others' alone.
- Assume a feature is broken because it errored. Check that Flask is up first.
- Trust a docstring or a comment as a fact — two walkthrough defects traced to one sentence
  that had been wrong for weeks, in the very file the endpoint was in.
- Write `isTeacher()` on a rule that guards a student's data. That means *any* teacher, at
  any school — the screens were scoped for months while the database was open to every
  teacher on the platform. Guard by the class owner or by `users.teacher_ids`, and remember a
  list query must carry the filter the rule reads (`class_id`), or the owner is refused too.
- Ship a gate without auditing **every** path that writes the flag it reads. The forced
  password change shipped covering five of six account-creation paths; the missed one was
  `superadmin.py`, the account that matters most. A gate is only as good as its flag.
- Document commands, routes or collections that don't exist yet as if they do.

## Owner Preferences & Key Decisions
- **Stay on Opus for build work.** Don't downgrade to Sonnet/Haiku to save cost and don't
  propose model-downgrade / cost-triage schemes. Output quality > marginal savings.
- **Commit style:** several focused commits, not one bundle. The commit *body* carries the
  reasoning — what was wrong, what changed, how it was verified. Match that depth.
- **Verify in a browser, not just in tests,** for anything a teacher touches. Several
  recent fixes were found only by clicking through the flow.
- **Validation rules have one home:** `src/lib/validation.js`. Every form imports from it.

## Key References
Always loaded (the guardrails only):
- @docs/ROADMAP.md — what phase we're in, and what the defense demo needs
- @docs/DATA-MODEL.md — every collection this client touches; read before Firestore work

Read on demand (not auto-loaded, to save tokens):
- `OWNERSHIP.md` (lanes — before your first edit) · `docs/ARCHITECTURE.md` ·
  `docs/TECH-STACK.md` · `docs/VISION.md` · `docs/OPEN-QUESTIONS.md` ·
  `../activklass-backend/docs/` (shared across the three repos: schema, API, roadmap)

## Workflow Reminders
- Plan first for anything non-trivial; confirm before standing up new services.
- When a decision gets made, record it (`docs/OPEN-QUESTIONS.md` or the relevant doc).
- Update `docs/ROADMAP.md` `[x]` with the **date and how it was verified**, same commit.
- After a mistake or new lesson, add a line here so it isn't repeated.
