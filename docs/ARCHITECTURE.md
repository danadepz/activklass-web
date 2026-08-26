# Architecture — ActivKlass web

How this client is layered and where data comes from. For the system across all three
repos, see `../activklass-backend/docs/01-architecture.md`.

## The shape in one picture

```
                        ┌─────────────────────────────┐
   browser              │  routes/**  (screens)       │  markup + page logic
                        │  features/** components/**  │
                        └──────────┬──────────────────┘
                                   │
                   ┌───────────────┴───────────────┐
                   │                               │
        ┌──────────▼──────────┐        ┌───────────▼───────────┐
        │  hooks/**           │        │  lib/*.js             │
        │  TanStack Query     │        │  pure domain logic    │
        │  cache over reads   │        │  grading, quiz, risk  │
        └──────────┬──────────┘        └───────────┬───────────┘
                   │                               │
        ┌──────────▼──────────┐        ┌───────────▼───────────┐
        │  lib/firebase.js    │        │  lib/api.js           │
        └──────────┬──────────┘        └───────────┬───────────┘
                   │ direct                        │ Bearer <Firebase ID token>
        ┌──────────▼──────────┐        ┌───────────▼───────────┐
        │  Cloud Firestore    │        │  Flask API :5000      │
        │  + firestore.rules  │        │  Gemini · scikit-learn│
        │  (the only authz)   │        │  Firebase Admin SDK   │
        └─────────────────────┘        └───────────────────────┘
```

## The two data paths, and why there are two

**Firestore-direct is the default.** Classes, rosters, gradebooks, attendance, quizzes,
attempts, remediations, announcements, notifications — the client reads and writes these
itself, and `firestore.rules` is what stops it doing something it shouldn't. There is no
API layer in between and there should not be one.

**Flask handles only what the client structurally cannot.** Three reasons a call goes to
`lib/api.js` and no others:

| Reason | Endpoints |
|---|---|
| Needs a model | `/api/quizzes/generate`, `/api/syllabus/generate`, `/api/syllabus/generate-module`, `/api/predict` |
| Needs the Admin SDK (creating auth accounts, setting claims) | `/api/classes/{id}/students/provision`, `/api/admin/users*` |
| Needs authority the client must not have | `/api/subscription/*`, `/api/superadmin/*`, `/api/teacher-groups/*`, `/api/institution/*`, `/api/grading-setup` |

Adding a route to Flask for anything else is a step backwards — it was a Postgres-backed
API once, and moving off it is what Phase 4 was.

**In development `/api` is same-origin.** `vite.config.js` proxies it to `localhost:5000`,
so `VITE_API_URL` stays unset and a forwarded VS Code port works for remote viewers whose
browsers cannot reach our localhost. That proxy is also why a stopped Flask returns an
empty `502` rather than a connection error — `lib/api.js` translates both into one
sentence a teacher can act on.

## Layers

**`routes/**` — screens.** One file per screen, markup and page logic together. Every
screen is lazily imported in `src/App.jsx` through `lazyRoute()`, which wraps each in its
own Suspense boundary rather than one boundary around `<Routes>` — so a slow chunk blanks
one page, not the shell.

**`features/**` — multi-component units** that belong to one domain but not one screen
(currently class creation, grade recovery, remediation).

**`components/**` — shared presentation.** `components/ui/**` is the interaction layer:
`toast.js`, `dialogs.js` (including `confirmDialog({ typeToConfirm: 'DELETE' })` for
irreversible actions), `Modal`, `Button`, `Skeleton`, `useAsyncAction`. Native `alert`
and `confirm` were removed from the product; do not reintroduce them.

**`hooks/**` — shared reads.** TanStack Query wrappers over Firestore. A query used by
more than one screen belongs here, keyed so that existing prefix invalidations still work.

**`lib/*.js` — domain logic, mostly pure.** This is where the test suite lives, and the
reason it can exist: `grading`, `quizGrading`, `quizPool`, `quizFeedback`, `quizAttempts`,
`riskSignals`, `aiDrafts`, `questionBank`, `validation`, `schedule`. Firestore access is
confined to a handful of named modules (`gradebook`, `roster`, `studentData`, `classes`).

**`theme.js` — every colour and type token.** One file, because 30 route files used to
declare their own `const navy = '#0E2A5C'` and it had already drifted.

## Auth and roles

`context/AuthContext.jsx` holds the Firebase session and the `users/{uid}` profile.
`ProtectedRoute` gates by `role`, read from that profile.

**The superadmin console is gated on a Firebase custom claim, not a role string** — an
admin can write any `users/{uid}` document including its `role` field, so a `'superadmin'`
role would be self-grantable. The claim is settable only through the Admin SDK, and every
`/api/superadmin/*` route verifies it again server-side.

Guardians are **mobile-only by design**. `/parent` renders a pointer to the app rather
than pretending a web portal is coming.

## Cross-repo coupling

- `lib/quizPool.js`, `lib/quizFeedback.js`, `lib/quizAttempts.js` have TypeScript ports in
  `activklass-mobile`. `lib/portParity.test.js` imports both copies **across the repo
  boundary** and fails if they drift.
- `lib/firestoreRules.test.js` runs `../activklass-backend/firestore.rules` — the deployed
  file — against the emulator. Its last block loads a deliberately *weakened* copy and
  proves the forbidden write then succeeds, so the suite cannot quietly pass while
  enforcing nothing.
- Backend routes are flat and teacher-owned (`/api/quizzes`, `/api/syllabus`). A `PUT`
  **replaces** `class_ids` — always resend them.
