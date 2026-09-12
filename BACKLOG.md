# Backlog

Known work, roughly in the order worth doing. Items marked **(cross-repo)**
touch `activklass-backend` or `activklass-mobile` as well.

Two are already done and kept here for context on what the rest assume:

- ~~**quiz_attempts didn't reach teachers.**~~ Mobile wrote `score` while every
  teacher view reads `total_score`, so mobile attempts were dropped from the
  scaffold mastery calculation outright. Fixed; Firestore indexes also
  repointed from `completed_at` (a field no writer produced) to `submitted_at`.
- ~~**Dual-write to SQLite and Firestore.**~~ Firestore is now the system of
  record for quizzes, syllabi and announcements.
- ~~**The quiz bank was the last of the quiz domain on Flask.**~~ Moved to the
  Firestore `banked_questions` collection (`hooks/useBankedQuestions.js`); the
  five `/api/quizzes/bank` routes are deleted. Folder filtering is client-side
  -- the Flask version refetched per folder, which in Firestore would mean a
  composite index per filter shape for a few hundred documents. Neither quiz
  page calls Flask any more except for AI generation.
- ~~**AI generation needed Postgres.**~~ Quiz and syllabus generation sat
  behind a Postgres user lookup and an `ai_jobs` table write, so both 500'd
  against the unmigrated database. `services/ai/gate.py` replaces both with
  Firebase-token auth, a Firestore role read, and a Firestore ledger.
  `app/services/ai/` now contains no SQLAlchemy.

---

## 3. ~~Three different meanings of "at risk"~~ — mostly done

Three rules could be on screen at once, all labelled the same, and only one of
them said what it was:

| Source | Rule | Now labelled |
|---|---|---|
| `teacher/classes/$classId/performance.jsx` | grade < 85 | **Below VS** — "grade below 85 this period" |
| `teacher/reports.jsx` | assessed but not passing | **Not yet passing** — "of the students already assessed" |
| `lib/ai.js` `predictRisk` | Random Forest via `/api/predict` | **Predicted at risk** (unchanged) |

The forecast half shipped earlier (`7c8fee6`) as `PredictedRisk.jsx` and
`ClassStandingForecast.jsx`, both gating on `coverage < 0.7`. The two
past-tense counters are now named for what they measure, in the KPI label and
in the variable behind it (`atRiskCount` -> `belowVsCount`, `atRisk` ->
`notPassing`), so "risk" appears only on the thing that is actually a forecast.

What is left: item 7 below. The model's synthetic training basis is disclosed
by `shapeRiskResult` but not next to the number a teacher reads.
## 4. ~~`PUT` silently unassigns classes~~ — done

`update_quiz` and `save_syllabus` read `data.get('class_ids', [])` and assigned
unconditionally, so a request that never mentioned `class_ids` wiped the
assignment: renaming a quiz detached it from its class and it vanished for
students, and saving an edited syllabus title unlinked every class using it.

Absent now means "leave as it is"; an explicit `[]` still clears, and a non-list
is a 400. Both paths have regression tests -- the syllabus one asserts through
`classes.syllabus_id`, which is the field students actually resolve a syllabus
through.

## 5. ~~No test suite on the web~~ — done

Done. `npm run test` runs 415 tests across 15 files, and all three targets
named below are covered: `grading.test.js`, `quizGrading.test.js`,
`aiDrafts.test.js` and `ai.risk.test.js`. `portParity.test.js` additionally
holds the mobile TypeScript ports to the web originals across the repo
boundary, and `firestoreRules.test.js` runs the real rules engine behind
`npm run test:rules` (27 cases, needs the emulator + Java).

Original note kept for what it aimed at:

~16k lines, and `npm run build` compiling is the only automated check. Start
where the cost of being wrong is highest and the code is easiest to test --
both are pure functions:

- `lib/grading.js` -- `computeFinalGrade`, `finalAcrossPeriods`
- `lib/quizGrading.js` -- `gradeQuiz`, partial credit on matching
- `lib/ai.js` -- the MELC code checker and the quiz draft validator. Both were
  developed against ~30 hand-run cases (real codes, fabrications, whitespace,
  grade ranges, duplicates) that live nowhere in the repo. They are pure and
  need no Firestore or Gemini, so they are the cheapest tests here to write and
  the easiest to lose. A regression in either is silent by construction.

## 6. ~~Mobile and web write different attempt shapes~~ — done **(cross-repo)**

Mobile now writes both: `attempt_number` in `attemptSession.ts` when the
sitting opens, `per_question` when it is submitted. The shapes are held in
step by `portParity.test.js`, which imports the mobile ports directly and
fails if they drift -- so this cannot silently come back.

Mobile's quiz player omits `per_question` and `attempt_number`, which the web
player writes. Web's quiz-feedback page reads `per_question`, so a student who
takes a quiz on mobile and opens feedback on the web sees an incomplete
breakdown. Same family as the `total_score` bug -- two writers drifting.

## 7. The risk model is trained on synthetic data **(cross-repo)**

Still open, but both halves have moved.

The disclosure shipped (`6c9eae1`): `predict_risk` returns a `training`
block -- `real_data: false`, the source, the sample count and one sentence of
plain English -- so the caveat reaches the teacher reading the number rather
than living in a module docstring. `real_data` is the field to branch on when
real exports arrive.

The model was also rebuilt: `age`, `study_hours_per_week`,
`has_internet_access` and `household_income_bracket` are GONE -- a risk flag
raised partly on a household's income bracket is not measuring the learner --
and half the features are now rates of change, so it fires before the
gradebook does instead of alongside it.

What remains: it is still synthetic. `_synthetic_dataset` is the single seam
to replace once a pilot term produces labelled history.

## 8. Lint: 41 errors on web, 13 on mobile

Snapshot re-taken 2026-08-21. Treat the counts as indicative, not exact — the
total has moved 34 → 36 → 35 → 41 as panes landed new code, so re-run
`npx eslint .` before starting rather than trusting these lines.

### Web — 41 errors, all `no-unused-vars`

| File (under `src/`) | Errors |
|---|---|
| `routes/teacher/classes/$classId/index.jsx` | 22 |
| `lib/attachments.js` | 5 |
| `routes/teacher/quizzes.$quizId.jsx` | 3 |
| `routes/teacher/quizzes.jsx` | 3 |
| `routes/student/profile.jsx` | 2 |
| `components/SignOutButton.jsx` | 1 |
| `lib/guardianCodes.js` | 1 |
| `routes/index.jsx` | 1 |
| `routes/teacher/classes/$classId/_layout.jsx` | 1 |
| `routes/teacher/classes/$classId/attendance.jsx` | 1 |
| `routes/teacher/syllabus.jsx` | 1 |

### Mobile — 13 errors, 11 warnings **(cross-repo)**

New: the mobile app had NO eslint config at all until `04e35d0`, leaving
`tsc --noEmit` as its only automated check over ~2,800 lines. It now runs
`eslint-config-expo` (`npx eslint .`).

Ten of the thirteen errors are react-hooks findings, and **five sit in
`app/student/quiz-player.tsx`** — the exam timer:

| Rule | Count |
|---|---|
| `react-hooks/immutability` (all in quiz-player) | 5 |
| `react-hooks/set-state-in-effect` | 5 |
| `react/no-unescaped-entities` (Expo boilerplate) | 3 |

These are questions about render behaviour, not formatting, and the screen
they cluster in governs how long a student gets in an exam. Read before
rewriting. This is the highest-value unreviewed code in the project.

**Classes** — `$classId/index.jsx` is the bulk of the backlog item and is
mostly one thing: a dead inline style block at lines 768–800 (`overlayStyle`,
`cardStyle`, `modalHeaderStyle`, `iconSquare`, `modalTitle`, `closeBtn`,
`modalBodyStyle`, `modalFooterStyle`, `alertStyle`, `codeStyle`,
`btnModalPrimary`, `btnModalGhost`, `th`, `td`, `btnGhost`, `btnPrimary`,
`btnDanger`, `pillStyle`, `statusTone`) left behind when that modal moved to
Tailwind classes. Plus four unused Firestore imports (`arrayUnion`,
`collection`, `setDoc`, `writeBatch`) and three unused icons (`X`, `Users`,
`FileText`). `_layout.jsx` has one, `tabStyle` at 22:10.

Worth a look before deleting: those style objects are the pre-Tailwind version
of a modal that still renders. If it drifted visually during the port, they are
the record of what it used to look like.

**Quizzes** — `quizzes.jsx`: `totalPoints` (61:10), `queryClient` (949:9),
`profile` (950:11). `quizzes.$quizId.jsx`: `navigate` (871:9), **plus the two
that are not `no-unused-vars`** — `react-hooks/set-state-in-effect` at 296 and
905, both `setState` called synchronously in an effect body. Line 905 is the
"default the class filter to the first assigned class" effect, which is the
derive-during-render case, not a real effect. These two need actual
refactoring, so **clearing every unused variable still leaves lint exiting
non-zero.** Item 8 is not done until they are addressed.

**Syllabus** — `isNewDraft` at 414:59, one error.

## 9. One 1.1 MB JS chunk — split, with a caveat

**Done for app source.** `App.jsx` now builds every screen through
`lazyRoute()` (`components/lazyRoute.jsx`), which pairs `lazy()` with a
per-route `Suspense` boundary. Measured:

| | raw | gzip |
|---|---|---|
| before | 1,198.82 kB | 324.00 kB |
| after | 639.54 kB | 197.88 kB |

56 chunks; largest route chunk is 49.8 kB (`teacher/classes/$classId`).

**The remaining 640 kB is almost entirely vendor, and route splitting cannot
touch it:**

| | raw | gzip |
|---|---|---|
| `firebase/firestore` | 265.6 kB | 82.0 kB |
| `react` + `react-dom` | 189.6 kB | 59.7 kB |
| `firebase/auth` | 87.0 kB | 25.5 kB |
| `react-router` | 41.3 kB | 14.7 kB |
| `@tanstack/react-query` | 35.4 kB | 10.4 kB |
| `firebase/storage` | 21.8 kB | 7.9 kB |

`lib/firebase.js` calls `getFirestore()` and `getStorage()` at module scope, and
`main.jsx` imports it eagerly, so **287 kB of Firestore + Storage downloads
before the login form paints** — on a route that only needs `firebase/auth`.
That is the next-largest win available and it is a `lib/firebase.js` change
(Shared), not a routing one: make `db` and `storage` lazy accessors behind
`await import('firebase/firestore')`, or split the module so the auth path does
not pull the other two. Worth ~82 kB gzip off first paint for every visitor.

Note the Vite >500 kB warning stays on until that happens — the entry is still
639 kB. The warning is now about vendor, not about missing code splitting.

## 10. 189 hand-written `<button>` elements

No shared component, so "change how this button works" and "change its colour"
are the same file -- which is why the UI/UX lane can only own theme tokens
today, not components. Extract `components/ui/Button.jsx` opportunistically as
lanes touch pages, rather than in one sweep.

## 11. Three Postgres endpoints left in the web app **(cross-repo)**

The web app now calls 19 Flask paths, in three groups. Only the first touches
Postgres:

| Group | Count | Backing store |
|---|---|---|
| **Postgres** — see table below | 3 | SQLAlchemy |
| Flask-over-Firestore — `admin` (5), `subscriptions` (4), `superadmin` (3) | 12 | Firestore only, 0 SQLAlchemy calls |
| AI — `predict`, `quizzes/generate`, `syllabus/generate`, `syllabus/generate-module` | 4 | no database |

The three on Postgres:

| Endpoint | Blueprint |
|---|---|
| `GET /api/classes` | `classes.py` (48 SQLAlchemy calls) |
| `POST /api/classes/{id}/students/provision` | `classes.py` |
| `/api/grading-setup` | `grading.py` |

The middle group is new and matters: `admin.py`, `subscriptions.py` and
`superadmin.py` import `firebase_admin.firestore` and nothing from
`app.models`. So "Flask endpoint" no longer implies "Postgres" — the count of
Flask paths growing is not the same as the Postgres surface growing, and it did
not grow.

`/api/classes` is the `ClassPicker` on record/attendance -- docs/05 step 7
noted those pages stay on Flask class ids until steps 8-9. Steps 8 and 9 are
now done, so the picker is the remaining reason the blueprint exists.

**Correction (2026-08-19):** the earlier note here claimed migrations had never
run and these endpoints were broken. They are not. The dev database is SQLite at
`activklass-backend/activklass_dev.db`, migrated, with 28 tables and an
`alembic_version` row -- the endpoints work when Flask is running.

So the accurate framing is *uncalled*, not *broken*, and that raises the cost of
item 13: deleting them also deletes the smoke tests that cover them, which are
currently the best coverage the grading engine has. Neon/Supabase was never set
up, so there is still no production data to migrate.

## 12. The parent portal cannot be Firestore-only **(cross-repo)**

`activklass-mobile/src/lib/api.ts` explains why, and it is a real constraint
rather than a preference: attendance documents hold a records map for the
whole class, and a Firestore rule can only allow or deny an entire document,
so nothing but a server can narrow it to one child.

The distinction that matters: that needs a **server**, not **Postgres**. Flask
can read Firestore and filter, exactly as `app/api/ai.py` does. Guardian links,
scopes and consent state map cleanly onto documents. So one data store is still
reachable -- it just does not mean "no backend".

**This is no longer a proposal.** `admin.py`, `subscriptions.py` and
`superadmin.py` were all written this way -- Flask blueprints holding zero
SQLAlchemy calls, reading and writing Firestore through the Admin SDK. The
pattern is now the house style for new backend work, which removes the main
argument against porting guardians: there is nothing left to invent, only an
existing shape to follow.

Until that is decided, `guardians.py` (21 SQLAlchemy calls), `parent.py` (5)
and migration `b1c4e7d92f08` are net-new Postgres surface added *after* the
decision to retire it, which is worth resolving deliberately rather than by
drift.

## 13. Dead Flask routes now that the web app has moved

`app/api/quizzes.py` still serves 11 routes. The web app calls exactly one of
them -- `/api/quizzes/generate` -- and mobile calls Flask only for the parent
portal (`/api/guardian-links/*`, `/api/parent/*`), so the other ten have no
known consumer:

```
/api/classes/<class_id>/quizzes      /api/quizzes/<id>/attempts
/api/quizzes            (GET, POST)  /api/quizzes/<id>/close
/api/quizzes/<id>       (3 methods)  /api/quizzes/<id>/publish
                                     /api/quizzes/<id>/results
```

Confirm nothing else consumes them before deleting -- the same check would have
caught that the quiz editor, not just the bank page, used `/api/quizzes/bank`.
Note `/api/quizzes/<id>` PUT is the one carrying the item 4 bug, so deleting it
closes that too.

Same question for `announcements.py`, `records.py` and `attendance.py`.

## 14. ~~The docs contradict each other on the database~~ — done **(cross-repo)**

Fixed in backend `991d8d2`. `04-setup.md` no longer claims Postgres is the
target, `01-architecture.md` opens with a superseded banner naming Firestore
as the system of record, and `02-database-schema.md` states that its
collections are the record while the SQLAlchemy schema is not authoritative.
The SQL side is uncalled, not gone: four endpoint groups still read it, and
04-setup.md now lists which.

Original note:

`docs/04-setup.md:96` says "Postgres is the real target (see
docs/02-database-schema.md)" and points at a document that now opens with
"the system utilizes Google Cloud Firestore as its primary database".
`01-architecture.md` is superseded by `05-prepare-gap-analysis.md` but says so
nowhere in itself. Anyone onboarding reads whichever they open first.

## 15. MELC codes are generated, never verified **(cross-repo)** — partly handled

Syllabus and module generation emit official-looking DepEd competency codes.
Spot checks are correct -- `M10AL-Ia-1` really is Grade 10 arithmetic
sequences -- but nothing confirms it, and the model will produce an equally
confident wrong code for a less common subject. A teacher publishing a syllabus
with fabricated DepEd codes is worse than a bad quiz question.

`lib/ai.js` now tags every generated topic with a `melc_status` and returns
`melcWarnings` on the draft. What that does and does not establish:

- **`malformed` codes are cleared.** A string that cannot be a MELC code is a
  fabrication, and leaving it beside real ones lends it their credibility.
- **`grade_mismatch` codes are kept and flagged.** Grade 10 requests come back
  with `M9AL-*` on quadratics and variation, and those genuinely *are* Grade 9
  competencies -- a Grade 10 class reviewing them is normal, so the code may be
  right and only the grade tag surprising. Deleting a real code to tidy the
  output would be the worse error.
- **`unverified` means exactly that.** No MELC dataset exists in any of the
  three repos, so nothing confirms a code is real -- only that it is shaped
  like one and does not contradict the requested grade.

**Still open, and it is the half that matters:** the syllabus page renders
`melc_code` as a bare string, so a fabricated-looking code and a plausible one
are still visually identical. `MELC_STATUS_LABEL` is exported ready to render.
Until the page uses it, codes are still presented as authoritative.

**Unverified today:** the checker was exercised against real generated codes
captured earlier in the session, but the final end-to-end run -- generate fresh,
pipe straight through `generateSyllabus` -- never happened, because the Gemini
free-tier daily quota ran out first (see 16). Worth doing once on a fresh day's
quota before trusting it blind.

The real fix remains a MELC list to check against. DepEd publishes the 2020
MELCs per learning area; even one subject loaded as a JSON lookup would turn
`unverified` into a real answer for that subject.

**2026-08-31 (Syllabus pane): the page half is done** — the status now renders beside
every generated code, and the end-to-end run this item was waiting on happened. What
that run actually showed, and what is still not covered, is in the Syllabus pane
section at the end of this file.

## 16. ~~A 429 does not trigger the model fallback~~ — done **(cross-repo)**

Fixed in `7834aa0`. `client.py` now catches `errors.ClientError`, checks for
code 429 and steps to the next model, because each carries its own daily
quota. Anything that is not a 429 still propagates rather than burning the
fallbacks on an error they cannot fix.

`client.py:122` retries and steps through `FALLBACK_MODELS` only on
`errors.ServerError` (5xx). Quota exhaustion is a 429 `ClientError`, so it
propagates immediately and `gemini-3.6-flash` / `gemini-3.7-flash` are never
tried -- even though each carries its own separate per-model daily quota.

The free tier is **20 requests per day per model**, which is also the default
`AI_DAILY_LIMIT`, so one teacher can drain the whole project's quota in an
afternoon. Reached during testing on 2026-08-19.

This is precisely the failure the docs/05 risk register warned about for
defense-day LLM availability (its "fallback is mandatory" line). The overload path is
covered; the far likelier one is not. Catching 429 and stepping to the next
model is a small change, but it should not ship untested, and testing it
requires quota that is currently spent.

## 17. Syllabus and module drafts get no structural validation

`generateQuiz` drops questions that cannot be answered -- no correct option,
duplicate options, blank text. `generateSyllabus` and `generateModule` check
only MELC codes, so the structure around them passes through untouched:

- a topic with an empty `title`
- a topic with an empty `objectives` array, or objectives that are blank strings
- a module with zero topics
- duplicate topic titles inside one module

None of these are hypothetical in the way a malformed MELC code is -- they are
just unobserved, because nothing looks. A blank topic title becomes a blank row
in the syllabus tree, and quizzes generated against that topic inherit it.

**Not blocked by anything.** Pure logic in `lib/ai.js`, no Gemini quota and no
Firestore needed -- roughly the same shape as `validateQuizDraft`. Left undone
today only because item 15 was the ask.


---

## 18. UI: 36 native browser dialogs, no toasts — done

The app used the operating system's own chrome for 36 interactions: 23
`window.confirm`, 13 `alert()` and 3 `window.prompt`. They print the origin
above the message, block the JS thread, cannot be styled, and `window.prompt`
was being used to collect a new account password.

Replaced by three files in the UI/UX lane:

- `components/ui/Modal.jsx` — the dialog shell. `role="dialog"` + `aria-modal`,
  Escape to close, a real focus trap, focus restored to the trigger on close,
  and ref-counted body-scroll lock. Ten route files still render their own
  `position: fixed` overlay; those are the migration that is left.
- `components/ui/dialogs.js` + `DialogHost.jsx` — `confirmDialog()`,
  `promptDialog()`, `alertDialog()`. Promise-based and imperative on purpose:
  it made each call site a one-line change (`if (!(await confirmDialog(...)))`)
  in files owned by other panes, where a hook would have meant restructuring
  every handler.
- `components/ui/toast.js` + `Toaster.jsx` — `toast.success/error/info`, in an
  `aria-live="polite"` region. Errors persist until dismissed; successes fade.
  `action: { label: 'Undo', onClick }` is there for the undo work in the
  smaller notes below, unused so far.

Two behaviour changes fell out of it, both fixes:

- **Rejecting a contest could not be cancelled.** `attendance.jsx` `reject()`
  and `record.jsx` `resolve()` both read `window.prompt(...) ?? ''`, so
  cancelling the reason box was coerced into "no reason given" and the
  rejection went through anyway. Cancel now aborts.
- **Quiz-bank validation no longer alerts.** The five `alert()`s in
  `quizzes.jsx` `handleSubmit` are an inline `role="alert"` message in the
  modal footer, beside the Save button that was just pressed.

Also in this pass: `admin/UsersTab.jsx`'s password prompt validates the length
inside the dialog instead of throwing the typed password away and reporting the
error back on the row.

## 19. UI: the quiz player could lose a student's attempt — done

`student/quiz-player.jsx` held answers in component state only. A refresh, a
back swipe or a crash lost the whole attempt, and on a timed quiz the clock
kept running. Answers now mirror into `sessionStorage` under
`activklass:quiz-draft:{quizId}:{studentId}:{attemptNumber}` on every change,
restore in the lazy state initialiser, and are cleared on a successful submit.
A `beforeunload` guard warns before a reload while an attempt is unsubmitted.

Keyed by student and attempt so a second attempt never inherits the first
one's answers, and by question id so the shuffled order does not matter.
`sessionStorage`, not `localStorage`: the draft should not outlive the tab.

## 20. ~~UI: the rest of the pass~~ — done

Everything listed here as open on 2026-08-19 has since landed. What each one
turned out to be, because in three cases the diagnosis was wrong:

**Keyboard focus was the real accessibility hole, not hover.** The claim was
"232 buttons have no hover state". Measured: 236 raw `<button>` elements, of
which 165 already carry a Tailwind `hover:` variant. Only **71** were inert.
But *four* of the 236 showed a focus ring — Button/IconButton and the auth key
— so a keyboard user could tab through an entire gradebook with no idea where
they were. `index.css` now has a zero-specificity `:focus-visible` outline on
every interactive element, and a `filter: brightness()` hover/active floor for
the 71. `filter` is the lever because every one of them sets `background`
inline, and an inline style beats a stylesheet — but none set `filter`, so it
composes instead of fighting. Written with `:where()` so any Tailwind
`hover:brightness-*` overrides it, and `.ak-btn`/`.ak-primary`/`.ak-nav`/
`.ak-action`/`.ak-card-hov`/`.ak-ann-del` opt out entirely. No pixels moved.

**The modals kept their markup.** There were 22 hand-rolled overlays, not ten —
seven more render `fixed inset-0` in Tailwind. Moving them onto `Modal.jsx`
meant rewriting each one's header/body/footer in five panes' files, so the
behaviour was extracted instead: `components/ui/useDialogBehavior.js` returns
`overlayProps`/`panelProps` that spread onto whatever markup is already there.
Every dialog now has `role="dialog"` + `aria-modal` + a name, Escape, a focus
trap, focus restored to the trigger, and a ref-counted body-scroll lock.
`Modal.jsx` uses the same hook, so there is one focus trap rather than two that
drift. Backdrop-click closing was left **off** where it never existed — several
are forms with unsaved input, and quietly adding "click outside to discard" is
not a fix.

**Skeletons.** `components/ui/Skeleton.jsx` — `SkeletonTable`, `SkeletonCards`,
`SkeletonList`, `SkeletonStats`, matched per screen to the shape that actually
arrives, across 15 routes. Row widths are ragged rather than uniform, because
real names are. The shimmer is a CSS animation, so the existing reduced-motion
block flattens it. `SkeletonTable` takes `tone="dark"` for the superadmin
console, which is the one dark surface in the app.

**Double submits.** `components/ui/useAsyncAction.js` — a ref guard that stops
the second call synchronously, plus a `pending` flag so the button can go
disabled and say what it is doing. A ref alone leaves the button looking inert;
state alone leaves a gap between the click and the re-render. Applied to the
eight controls that actually write.

**Icon-only buttons.** 14 had no accessible name — the earlier "75 aria
attributes across 236 buttons" count was noise, since most buttons have visible
text. Each got `aria-label` *and* `title`; the title is a hover tooltip, so it
helps sighted readers too. The syllabus-tree chevrons also got `aria-expanded`.

**Responsive grids.** Only five inline `gridTemplateColumns` were actually
broken — the announcements form (three) and the scaffold rows (two, carrying
480px of fixed columns). The landing page's are all fractional and shrink
correctly; `performance.jsx`'s `repeat(5, 1fr)` histogram likewise. Fixed, not
swept.

**Undo, where undo is honest.** Class archive and quiz close are single-field
flips, so Undo restores them exactly; both now offer it in the toast. Real
deletes do not, and should not until there is somewhere to restore from —
an Undo that silently recreates a *different* document is worse than none.

**The two-display-faces problem was a missing font.** `theme.js` has declared
`serifFamily = "'DM Serif Display', Georgia, serif"` all along and 88 headings
spread it — but the face was never in `index.html`, so all 88 rendered as
**Georgia**. Meanwhile `--font-display` was Lexend, which the other 28 headings
inherited. Same split on body copy: `--font-sans` was Inter while `sansFamily`
(imported by 26 files) asked for Plus Jakarta Sans. DM Serif Display is now
loaded, and both CSS tokens point at what `theme.js` declares. The landing page
is untouched — all ten of its headings spread `serifAlt` explicitly, which
`theme.js` documents as deliberate.

To reverse the typography call, change `serifFamily`/`sansFamily` in `theme.js`
and the two `@theme` lines in `index.css` **together**. Changing one without the
other is what produced the split.

---

## 21. UI: what is genuinely still open

- **The 71 inert buttons have a floor, not a design.** They get a cursor and a
  brightness shift now; they still do not share `Button.jsx`'s slab, padding or
  type scale. Migrating them is worth doing per page, not in a sweep.
- **Two colour systems.** `index.css` documents `indigo` as the primary action
  colour; `theme.js` says `navy`. `syllabus.jsx` and `quizzes.jsx` are full of
  `bg-indigo-600` buttons sitting next to navy ones. Same class of drift as the
  fonts, and it needs the same kind of decision.
- **Empty states are inconsistent.** Some have an illustration and a next step
  ("Use the form above to post your first announcement"), some are one grey
  line. Worth one pass to give each a verb.

---

## 22. Quiz bank and class record: what shipped, and what is left — mostly done

Three gaps that all had the same shape: a feature existed, and the thing that
would have made it useful was never wired to it.

- ~~**The bank never filled.**~~ Generation wrote questions straight onto the
  quiz doc, so the bank only grew when a teacher clicked the per-question 💾 --
  which nobody does twenty times. The generate dialog now has *Also save these
  to my Quiz Bank* (on by default) and writes the whole set in one `writeBatch`
  (`hooks/useBankedQuestions.js` → `bankQuestions`).
- ~~**Auto-banking would have poisoned the bank.**~~ Generating twice on one
  topic returns near-identical stems, so banking everything makes the bank
  worse the more it is used. `lib/questionBank.js` fingerprints an item as
  `qtype + normalised stem` -- punctuation, case and spacing collapsed, digits
  kept, options ignored -- and skips anything already there, including
  duplicates *within* one draft. Fingerprints are computed from the stored
  `text`/`qtype`, so pre-existing rows de-duplicate with no backfill. The
  per-question 💾 goes through the same path and now files under `syllabus_id`
  too; it used to leave everything in **Uncategorized**.
- ~~**Publishing a quiz did not reach the gradebook.**~~ On Flask,
  `POST /quizzes/<id>/publish` created an `Assessment` row. After the move to
  Firestore the publish modal kept collecting the component/period mapping --
  and kept telling the teacher it would "create score records in their
  gradebooks" -- but wrote it to `quizzes/{id}.class_mappings`, which nothing
  read. Publishing now creates the row (derived id `quiz-{quizId}`, so
  re-publishing cannot duplicate it), and *Post scores to class record* on the
  results tab fills it from each student's **best graded** attempt.
  `lib/quizToRecord.js` refuses three cases rather than writing a wrong number:
  no attempt (blank, not zero), essays still unmarked, and an attempt sat
  against a different version of the quiz. Each refusal is counted and named in
  the toast.
- ~~**Remediation demonstrated competency the record never recognised.**~~ A
  low score raised a topic, the teacher published a plan with an AI practice
  quiz, the student passed it -- and the failing mark stood. *Recover marks* on
  a published plan (`features/classes/gradeRecovery.js`) repairs the original
  score under one of three policies from `lib/remediationRecovery.js`, default
  **replace capped at 75**: passing the re-teach earns the passing mark, not an
  A. A recovery can only raise a mark. Nothing is written until the teacher has
  seen the per-student preview.
- ~~**`syncEntries` was trapped in `record.jsx`.**~~ `entries` is the only
  grade document a student may read and it is derived, so anything that changes
  a score has to re-derive it. The record page used to be the only writer; it
  is not any more. Moved verbatim to `lib/gradebook.js` with `loadBundle` and
  the period/summary builders, and both new write paths call it.

Still open:

- **The audit trail is write-and-revert, not a log.** `recovery.{studentId}`
  holds one entry per student per assessment; applying a second recovery over
  the first overwrites it. `revertRecovery` exists and restores the original,
  but nothing in the UI calls it yet -- a teacher undoes a recovery by typing
  over the cell, which clears the entry. A real log would be a subcollection.
- **Bank-first generation is not built.** The obvious next step: pull banked
  questions for the topic first and ask the AI only for the shortfall
  (*"6 from your bank, 4 newly generated"*). Cheaper, faster, and it reuses
  items the teacher already vetted. Its prerequisite -- a bank with anything in
  it -- now exists.
- **No item analytics.** `quiz_attempts` already store `per_question`, so
  per-item difficulty could roll back onto the banked question: flag items
  everyone gets right (too easy) and everyone gets wrong (probably badly
  worded), and let a remediation quiz pull the items *those* students missed.
  This is the piece that turns the bank from a CRUD list into an assessment
  instrument.
- **Nothing posts scores automatically.** Both new write paths are buttons.
  That is deliberate -- attempts arrive over days and a record that rewrites
  itself under the teacher is worse than one they press -- but it does mean a
  quiz whose scores are never posted stays out of the grade.

---

## 23. Quiz settings: the teacher's controls, and the two clients — mostly done

The settings existed; the phone ignored them. `activklass-mobile`'s player read
exactly one of the six (`time_limit_minutes`) and got that one backwards.

- ~~**An untimed quiz was a 15-minute quiz on mobile.**~~
  `setTimeLeft((quizData.time_limit_minutes || quizData.time_limit || 15) * 60)`
  — an `||` chain ending in a hardcoded fallback, so a quiz the teacher
  deliberately left untimed got a 15:00 countdown that auto-submitted. The class
  list on the same app said "No time limit" beside it. Now `??` to null, no
  countdown, no chip, no auto-submit.
- ~~**`prevent_backtracking`, `opens_at`, `closes_at` and `attempts_allowed`
  were unenforced on mobile.**~~ A student with a link could sit a closed quiz
  an unlimited number of times from their phone and skip back and forth while
  the web refused all four. `gateFor()` mirrors the web player's `windowState`
  and attempts check.
- ~~**The feedback screens were the answer key.**~~ Both clients showed the
  correct answer for every item the student got wrong, immediately, on every
  attempt, with no setting — while `attempts_allowed` goes to 10. Attempt 1 was
  the key, attempt 2 was transcription. Now `feedback_release` (immediate /
  when it closes / after their last attempt / never) × `feedback_detail`
  (score → wrong items → answers → AI rationale), in `lib/quizFeedback.js`.
  Defaults are the old behaviour, so no published quiz changed.
- ~~**Shuffling reshuffled on refresh.**~~ `Math.random()` in a lazy state
  initialiser. Harmless while everyone answered every question — answers are
  keyed by question id — and fatal with a pool draw. Replaced by a seeded
  draw on (quiz, student, attempt) in `lib/quizPool.js`: stable across
  refreshes and across devices, different per student and per retake.
- ~~**Question pools.**~~ `pool_enabled` + `pool_draw_count` turn the question
  list into a pool and hand each student a different subset. `question_ids` on
  the attempt records which paper they sat, so feedback shows their ten rather
  than the pool's thirty. Pool items must be worth equal points — enforced at
  publish — so every paper is out of the same total and the class record has
  one column to put them in.
- ~~**Shuffle options.**~~ Separate from `shuffle_questions`; MCQ choices were
  never reordered before.
- ~~**Which attempt counts.**~~ `scoring_attempt` (best / last / first /
  average), read by the record sync and by the remediation recovery. It was
  hardcoded to best, which quietly made every retake score-farming. `average`
  averages *ratios*, not raw marks, so a quiz edited between sittings does not
  produce a meaningless number.

Still open:

- **None of it is enforced server-side.** `firestore.rules:331` allows any
  student to create an attempt under their own uid: no attempt cap, no window
  check, no time check. Every setting above is advisory — it shapes what an
  honest student sees and stops nobody else. Fine for the pilot, but say it
  before a panelist finds it.
- **The timer still resets on refresh.** `remaining` is client state seeded
  from `time_limit_minutes`; nothing writes a `started_at`. Answers survive in
  `sessionStorage`, the clock does not, so a refresh returns the full time with
  the answers intact. Fixing it needs an `in_progress` attempt document with a
  server timestamp — which is also the prerequisite for a resume policy and for
  counting attempts honestly.
- **Mobile keeps one legacy feedback rule.** That app used to hide the
  breakdown whenever `prevent_backtracking` was on — a rule the web never had.
  Quizzes carrying no `feedback_release` keep it, so nothing a teacher relied
  on suddenly opened up; anything saved since obeys the real setting on both
  clients. Worth removing once the old quizzes have aged out.
- **Answer keys are still readable by clients.** Pooling means a student can
  now read the *whole* pool from the quiz document, not just their own paper.
  That was already true and is not made worse in kind, but it is made worse in
  degree. The fix is the same known follow-up: split answer keys out of the
  client-readable quiz document.

---

## 24. The attempt became a real object — mostly done

Everything here follows from one change: a `quiz_attempts` document is now
created when the student presses **Start**, not when they submit.

- ~~**The timer reset on refresh.**~~ The countdown was device state seeded at
  mount, and nothing recorded when the student began — so reloading returned
  the full clock with the answers still in `sessionStorage`. A timed quiz was
  untimed for anyone who pressed reload, on both clients. The attempt is now
  stamped with a server `started_at`, `expires_at_ms` is derived from it, and
  every tick re-derives the remainder. Closing the tab, locking the phone or
  killing the app no longer buys a second.
- ~~**There was no moment of consent.**~~ A green **Start** now sits behind a
  briefing screen listing every rule that will govern the sitting: the limit,
  whether backtracking is allowed, how many questions are drawn, which attempt
  this is, and that leaving is recorded. `startBriefing()` returns it as data,
  so both clients show the same sentences. Nothing is written until Start.
- ~~**Reopening was invisible.**~~ Coming back to an open attempt increments
  `reopen_count` and appends to `reopens[]` with the question and the time
  left. Recorded, never blocked — a dropped connection and a deliberate
  walk-away are indistinguishable from the client, and which one it was is the
  teacher's call.
- ~~**Leaving the page was invisible.**~~ `visibilitychange` on web and
  `AppState` on mobile record an away-event per switch: when, which question,
  and how long. Capped at 100 stored events with the tail counted in
  `focus_events_dropped`.
- ~~**Attempts could not be changed once published.**~~ `editable` is
  `status === 'draft'`, so the whole builder vanished on publish and the
  allowance was frozen with it. A **Change while it is live** panel now edits
  `attempts_allowed` and `closes_at` on a published quiz, and **+1 attempt** on
  a student's row writes `extra_attempts.{studentId}` — additive, so raising
  the class-wide allowance later cannot revoke an individual grant.
- ~~**The quiz list sorted by status, not by life.**~~ A quiz opening next
  Monday and one open right now were both "published". Tabs are now
  **Ongoing / Scheduled / Drafts / Past**, derived by `lifecycleOf()` from
  `opens_at` / `closes_at` / `status`, with counts.
- ~~**The student class page counted open attempts as used.**~~ Pressing Start
  and coming back showed the quiz greyed out with the attempt still running.
- ~~**Abandoned attempts blocked the student forever.**~~ Start an *untimed*
  quiz and never submit, and that `in_progress` document stayed open — and
  because Start resumes an open attempt rather than beginning a new one, the
  student could never sit that quiz again. A timed quiz recovers by itself
  (reopening past the deadline submits it); the untimed case could not.
  **Discard** on the student's row in the results table ends it.

  Marked `discarded`, not deleted, for two reasons: the reopen history and the
  away-events on that document are the only explanation anyone will have for
  why the sitting was abandoned, and a teacher who discards the wrong row
  should be able to see that they did. A discarded attempt is inert in
  `lib/quizAttempts` — neither open nor used — so the slot comes back, while
  `nextAttemptNumber` still counts it so two sittings never share a label.

  The security rule needed no change: teachers may already update any attempt,
  and the student clause requires the stored status to still be `in_progress`,
  so a discarded attempt cannot be submitted over. Both players turn the
  resulting permissions error into *"Your teacher ended this attempt"* rather
  than showing a raw Firestore message mid-exam.

Deployed and tested:

- The rule change is **live** on `activklass1` (ruleset `752e1d75…`, released
  21 Aug), verified by re-reading the released ruleset back from the Rules API
  and diffing it against the file.
- `npm run test:rules` in `activklass-web` now exercises it against the real
  rules engine in the emulator: 21 cases covering what a student may and may
  not do to their own attempt, what a teacher may do, the billing-field guard
  on `users`, and the four closed collections. Its last case loads a weakened
  copy of the rules in memory and shows the forbidden write succeeding, which
  is the only way to know the suite is enforcing rather than decorating.

Still open:

- **Enforcement is still client-side.** The rule now lets a student finish
  their own `in_progress` attempt; it still does not check the deadline, the
  window, or the allowance, and the score is still client-written. A student
  who wants to defeat the timer can. What changed is that ordinary use —
  reloading, closing a tab, switching apps — no longer defeats it by accident,
  and every departure is on the record. Real enforcement means grading and
  expiry in a Cloud Function.
- **Away-events are best-effort by construction.** They are written by the
  client, so a client that does not send them produces a clean record. They are
  evidence of attention leaving the page, and blind to a second device, a phone
  on the desk, or notes on paper. Every string that renders them says so; keep
  it that way.
- **No teacher view of the away-event detail yet.** The results table shows the
  roll-up (`describeFocus`) — count, total time, worst question. The per-event
  list with timestamps is stored but nothing renders it.
- **`reopens[]` and `focus_events[]` grow unbounded per attempt document** —
  the second is capped, the first is not. A pathological reconnect loop would
  bloat the document.

---

## 25. Quiz builder: three items from the teacher walkthrough — done

Three pieces of tester feedback on `routes/teacher/quizzes.$quizId.jsx`.

**Read this before assuming the dead backend explains them.** That walkthrough
ran with Flask down (see `f8ed1fd`), which does account for most of the other
reported failures. It does not account for these. The quiz builder reaches
Firestore directly — `updateDoc(doc(db, 'quizzes', id))` — and calls Flask only
for AI generation. Publishing never touches `/api`, so a dead backend cannot
break it, and the diagnosis below was reproduced with the emulator rather than
inferred from the symptom.

- ~~**The time limit was a free-text box that accepted 0.**~~ It was
  `<input type="number" min="1">`, and `min` on a bare input is only enforced
  by form validation — this field is not inside a validated form, so `0` and
  `-30` were both accepted. `0` is the one that reached students: `persist()`
  reads the raw input string and `'0'` is truthy, so it stored
  `time_limit_minutes: 0`; the mobile player's `??` (item 23) passes that
  through to a 0-second countdown, and the quiz auto-submits the instant a
  student opens it. Now a `<select>`, 5–180 minutes. The bounds are the sitting
  a quiz has to fit inside — below 5 minutes a student cannot read and answer
  one question, and 180 is the longest block these schools timetable (PH K-12
  periods 40–60, college lectures 60–90, a final exam block 3 hours). A stored
  value that is not on the list is kept and offered back rather than snapped —
  a teacher who set 37 meant 37. Zero and negatives are the exception and fall
  through to "No time limit", which is what an unsittable quiz should have been.
- ~~**Nothing stood between twenty minutes of authored questions and a stray
  click.**~~ Questions live only in React state until *Save draft* is pressed.
  `builderSnapshot` compares the live form against what was last written, so
  the guard arms on real edits only — a boolean flipped by every `onChange`
  stays armed after typing a character and deleting it, and teachers learn to
  click through it, which is the same as not having a guard. Covers reload and
  tab close via `beforeunload`, and in-app navigation by intercepting link
  clicks in the capture phase. An "Unsaved changes" marker sits beside *Save
  draft* so the state is never invisible.
- ~~**A manually-created quiz could not be published.**~~ Reproduced against
  the Firestore emulator with the real `firestore.rules`, driving the write
  sequence for a manual and an AI quiz side by side: create, `persist()`, the
  publish `updateDoc` and the record sync all succeed **identically for both**.
  Nothing fails the write and nothing fails the rules. It failed *validation*,
  and the refusal was invisible: `publish()` set an inline banner that renders
  at the top of the form while the Publish button sits below the last question,
  so on any real quiz the two are a screenful apart and the teacher saw nothing
  happen. It is manual-specific because `GenerateQuizModal` preselects a class
  and `CreateQuizModal` does not — `class_ids: []` is a state only manual
  creation produces, and an unassigned quiz is exactly what publish refuses.
  Refusals now toast as well as set the banner, the `questions.length === 0`
  path no longer `return`s silently, and the create dialog says up front that a
  class is needed before publishing.

**Left open — the unsaved guard is not a router blocker.** React Router's
`useBlocker` needs a data router and `main.jsx` mounts `<BrowserRouter>`, so
the in-app half of the guard is a capture-phase `click` listener on `document`
matching `a[href]`. It covers every `<Link>`, which is every in-app navigation
this app actually has, but it is not the first-class version: a programmatic
`navigate()` from another component, or a browser Back press, goes through
unguarded. Converting the router is UI/UX-lane work (`main.jsx`); if that
happens, this listener should be replaced by `useBlocker` rather than kept
alongside it.

---

## 26. AI generation items from the teacher walkthrough — NOT reproducible; cause not yet established

Source: AI-services pane, measured first-hand against Flask on :5000 and live Firestore
on 2026-08-21. Numbers below are direct observations, not inferences.

### Status: both items OPEN as "cause unknown", not closed as "Flask was down"

Walkthrough feedback said "cannot generate a syllabus with AI" and "cannot generate a
quiz with AI". Neither reproduces with the backend running.

**What was ruled out:**

- *Not connection-refused at test time.* With Flask up, `/api/syllabus/generate` and
  `/api/quizzes/generate` are reachable through the Vite proxy and return correct JSON.
  (Note: there is no `/api/ai/*` generation route; `app/api/ai.py` holds only
  risk/struggle/essay/scaffold.)
- *Not a model failure.* Real calls through the real prompt builders succeed on the
  PRIMARY model, `gemini-3.5-flash`: syllabus at 12 weeks (980 output tokens) and at the
  40-week clamp (2022), quiz at the 30-question clamp with all four question types
  (3251) — all well inside the 16000 `max_output_tokens` budget.
- *Not a 429.* The Firestore `ai_usage` ledger holds two documents only, both for
  `teacher.maria`, at 2/20 on 2026-08-18 and 2/20 on 2026-08-19. Nothing for today.
- *Not the fallback path failing.* The 429 model-stepping added in 7834aa0 was verified
  firing, not assumed: with the SDK stubbed to 429, it steps
  `gemini-3.5-flash -> gemini-3.6-flash -> gemini-3.7-flash` and returns the fallback's
  result. `tests/test_ai_fallback.py` covers this and passes.

**The decisive evidence:** the newest document in the Firestore `ai_jobs` collection is
dated **2026-08-19**. The walkthrough left zero server-side records. Whatever happened,
no request reached the point where a job row is written.

### The open question — read this before closing either item

Absence of `ai_jobs` rows proves the request never got past the **auth gate**, which is
weaker than "Flask was down". `require_ai_teacher` (app/services/ai/gate.py) rejects
before any ledger write and requires `role == "teacher"` **exactly**. Firestore currently
holds 2 accounts with role `developer`, and the sign-in page offers preset accounts via
`DevQuickLogin`.

A tester who clicked a developer preset would get a silent 403 that leaves no `ai_jobs`
row — **indistinguishable from a dead backend on the evidence available**, and not
disambiguated by the improved "Cannot reach the ActivKlass server" message from f8ed1fd
either, since that only covers the unreachable case.

ACTION: ask the testers which account they signed in with before closing these items.

### Pattern worth naming: three independent causes, one reported symptom

This walkthrough produced three unrelated mechanisms that all reached the tester as
"nothing happened / no error shown":

1. A dead backend surfacing as the browser's raw "Failed to fetch" (fixed, f8ed1fd).
2. A real client-side publish refusal rendered a screenful from the control that
   triggered it (quiz-builder pane).
3. A silent 403 from a role mismatch, described above (open).

A fourth candidate of shape (2), unverified visually and worth a look:
`src/routes/teacher/syllabus.jsx` — the AI generate modal renders its error banner at the
top of a `max-h-[90vh] overflow-y-auto` panel, with 5 labelled fields and a notes
textarea between it and the "✨ Generate" button at the bottom. On a viewport where the
modal scrolls, a teacher who scrolls down to click Generate gets the button reset to
its idle label with the reason off-screen above. Same failure shape, and it sits on one
of the two flows this section is about.

The generalisation: any handler whose only failure path is `setError()` into a distant
banner is a candidate. That is the finding — not any individual fix.

**But distance finds the file, not the fix.** Refinement from the Class setup pane, who did
the work on the worst instance: what the failure should do depends on whether it belongs
to a field. Field-shaped ("title is required") belongs *on the input* — inline, with
submit scrolling to and focusing the first bad one, which beats a toast because the
message sits on the thing you have to change. Not field-shaped (a save that failed, a
file rejected for type or size, a partial sync) has no field to attach to and nowhere to
go but the far banner; that is what toasting is for.

The consequence for anyone using the audit list: **a file can score badly and already be
half-fixed.** `features/classes/ClassFormModal.jsx` scored worst in the codebase at 307
lines banner-to-submit, but its validation half had already been rebuilt into inline
per-field messages — while the Firestore save error and two file rejections, which are
not field-shaped, were still going to the distant banner. Both were true in one file at
once. Read the metric as "look here", never as "this is broken".

**Distance in the file is not distance on screen**, which is the same caveat
from the other side. `teacher/grading.jsx` scored 39 lines with the banner
*below* its action — but the Save button is in the page header and the banner
sits near the top too, so on screen they are adjacent and the gap is an
artifact of source order. A long gap can be harmless and a short one can bite;
what decides it is what the user can see at the moment they press the control,
and only opening the page answers that. The metric ranks where to look. It does
not rank severity, and nothing measurable from source order does.

One more control to check besides the submit button: the same file's **file picker** sits
at :694, 280 lines below the banner. A rejected upload ("must be a PDF", "under 10 MB")
is caused right where the teacher is looking and was reported 280 lines above it. Any
control that can fail counts, not just the one that submits.

### Related backend change (uncommitted at time of writing)

`app/services/ai/client.py` gained a truncation guard. `json.loads` on an empty or
truncated stream previously raised a bare `JSONDecodeError` that neither `except` arm
caught — no retry, no model fallback, and an opaque 502 reading "AI generation failed.
Please try again." It now raises `AITruncatedError`, handled like a 503 (retry, then step
models), with a message naming `finish_reason`, `reasoning_tokens` and the budget — and
advice that branches on the reason, since a safety refusal and an oversized request both
arrive with no usable JSON but need opposite fixes from the teacher.

How that branch was found is worth more than the branch. The reason name was already
correct while the sentence after it was not: a SAFETY refusal was being told "ask for
less, or raise max_tokens" — tune a number that was never the problem. It survived the
authoring pane's own review and was caught only because another pane proposed SAFETY as
a test case. Note what would NOT have caught it: a test asserting that "SAFETY appears in
the message" passes on the broken version. Assert on the advice, not the label.

The strongest evidence for that practice arrived afterwards: the same class of mistake
recurred **once while it was being fixed**, and was again caught by the other pane rather
than the author. A mistake that reappears during its own repair is not carelessness, it
is a blind spot — and a blind spot is by definition not visible to the person who has it.
That is the argument for review by a second pane rather than for more self-review, which
is what the author would otherwise reasonably conclude from having missed it twice.

Not the cause of the walkthrough failures — only reachable above the endpoints' own
input clamps. But `gemini-3.5-flash` is a thinking model and reasoning tokens are billed
against `max_output_tokens`, so the margin is invisible: a trivial prompt at a 100-token
budget spent 97 on reasoning and returned no answer text at all.

---

## 27. The second walkthrough list: one environment, two real defects

Source: seven items from the teachers, triaged 2026-08-22 against live Firestore,
live Firebase Auth, the SQLite mirror, and the listening ports. Everything below is
an observation unless it says otherwise.

### The list, and what each item turned out to be

| Reported | Verdict |
|---|---|
| Bulk upload roster: not functioning | Backend unreachable **and** the modal reported a failed import as success — fixed |
| Cannot add a student manually | Backend unreachable; the refusal was already toasted by 2790480 |
| Can find a registered student but cannot add them | Same. The find is Firestore, the add is Flask — which is the whole diagnosis in one line |
| Edit class: no validations | Already fixed in 775ccc5, per-field and inline |
| Cannot publish a quiz built manually | Working as designed: the four hand-built quizzes carry 0–1 questions and no class. 2550603 made the refusal say so |
| Teacher group: no confirmation | Already fixed in 0fdaf9c; `teacher_groups` is empty, consistent with the backend never having answered |
| Admin: cannot add a user | Backend unreachable. `smoke_admin` passes on every path |
| Cannot log in with the default password | A real defect, independent of the backend being down — see below |

### Every Flask feature failed and every Firestore feature worked

That split is the finding. Measured 2026-08-22:

- Nothing is listening on **:5000**. Vite is up on :5173.
- The SQLite mirror has had **no write since 2026-08-19 15:32** — no users, no
  invites, no enrollments. Three days of testing left nothing.
- `teacher_groups` is empty; the newest `ai_jobs` row is 2026-08-18.
- Meanwhile the same testers **did** register a student account (14:11) and build a
  quiz (14:17) **on 2026-08-22** — both pure Firestore paths, both fine.

So six of the seven reports are one environment fact: the API was not running.
`lib/api.js` already names that condition since f8ed1fd, and its own comment
predicted this exact list. The remaining question from §26 — "which account did they
sign in with" — is now moot for these items; a dead port explains them without a
role mismatch.

**This is the second walkthrough in a row where the backend was down.** Being able to
start the web app without the API is what makes it possible, and the failure only
appears when someone presses a button that needs it. Worth considering: a dev-mode
banner that pings `/api/health` on load, so the state is visible before the first
click rather than discovered through six bug reports.

### Defect 1: provisioning never created the account it promised

`POST /api/classes/{id}/students/provision` documented "each student's initial
password is their student_number" and **never called `create_user`**. The
no-account branch wrote a `ClassInvite` and a placeholder Firestore profile
instead. So a manually added student got a roster row with no login, which is
exactly the report — and it would have failed the same way with Flask running.

The evidence was in the data: two profiles (`tenzbatum@gmail.com`,
`davidtwo@gmail.com`) with roster fields, no `created_at`, and no Auth account,
both sitting in a class `student_ids` array.

Fixed: the endpoint creates the account with the student number as the initial
password (a shorter ID fails its own row, since Firebase's floor is 6 characters
and padding would mint something the teacher cannot predict), enrolls under the
uid the student signs in with, and returns `login_created` / `initial_password`
so the UI can show the teacher a credential that is emailed to nobody. The web
side announces it in a toast that stays until dismissed, and offers the list as a
CSV for a roster-sized import.

### Defect 2: the placeholder swap could never run

The placeholder was meant to be replaced by the real uid when the student first
authenticated — in `middleware/auth.py`, on a Flask request. The student app
moved to Firestore and stopped making Flask requests, so the swap never ran.

Live proof: `davidtwo@gmail.com` registered on 2026-08-22 and their class still
pointed at the placeholder, so the student was not in the class they had been
added to, and the teacher's roster row belonged to nobody.

Gone with defect 1 — there is no placeholder to swap. Both existing rows were
repaired against live Firestore and SQLite on 2026-08-22.

### Addendum, 2026-08-23: what driving it in a browser changed

Everything above was reached by reading code and querying live data. Then the
whole list was walked in Chrome with the backend up, and three of its
conclusions moved.

**"Cannot publish a manual quiz" was diagnosed wrongly here.** The section says
the tester's quizzes had no questions and no class. One of them -- Seatwork 2,
built the same afternoon -- had both. What actually blocked publish was the
CLASS having no Grade Config, so there was nowhere to record the scores. The
modal said so and then stranded the teacher: disabled button, no link, and the
fix a page away that they had to find and scope themselves. Now linked, opening
on that class with its presets one click away.

**`is_temp_password` had never once fired.** The mobile app has gated on it
since it was written -- login.tsx sends anyone carrying it to a
change-password screen -- and nothing anywhere set it. Only seed_demo.py wrote
it, as false. Provisioning, admin create, bulk upload and admin reset all set it
now; both change-password screens clear it and stamp `password_changed_at`.
Reading the flag's name was not enough to notice this; grepping for who WRITES
it was.

**Two bugs nobody had reported, found by clicking:**

- Adding an already-registered student wrote `enrollment_status: 'ENROLLED'`
  onto their profile. The select offers AC and IN, the seed writes 'enrolled',
  and an unmatched value leaves the select showing "Active (AC)" while state
  holds the old string -- which then saves. The roster renders it unstyled and
  the teacher's own AC filter does not match it.
- A class saved before the 1-to-300 capacity cap could not be edited AT ALL.
  Fixing a typo in the subject code was refused for a capacity the teacher had
  not touched. The cap now applies to a new value only.

**Making an account takes about ten seconds**, measured twice, and showed
nothing but a disabled button for the whole wait. I watched it for eight
seconds during this very session and wrote the flow off as hung; the row had
been written. That is the same shape as the reports this section is about, on
the inside of the investigation into them. The wait is now narrated, not fixed.

**The rules had to be deployed before a fix worked.** Clearing the flag is a
write to users/{uid}, and a student may write only photo_url to their own
document, so the write was denied, the password changed anyway, and the badge
stayed stale. Caught by changing a password in the browser and re-reading the
document -- not by any test, since the emulator ran the NEW rules while
production ran the old ones. Deployed 2026-08-23 after the predeploy gate
re-ran the suite.

### Worth keeping from this round

- **"Which half of the stack does this feature use" sorted seven reports in
  minutes.** Firestore-backed features worked; Flask-backed features did not.
  Ask that before reading any code.
- **A 200 is not a success.** `provision` answers 200 with `created`, `skipped`
  and `failed`, because a partial import is normal. The CSV modal read none of
  them and closed as if everything had landed — the report was "not functioning",
  and it was right.
- **A docstring is a claim, not a fact.** Two of these items trace to one
  sentence that had been wrong for weeks, in the file the endpoint is in.

---

## Smaller notes

- Top-level Firestore `syllabi` is empty; the seed writes
  `classes/{id}/syllabus/current` instead. Saving a syllabus from the page
  populates it. Worth aligning the seed.
- No Firestore query in either app uses `orderBy` -- all sorting is
  client-side. Fine at pilot scale; the composite indexes exist for when those
  reads move server-side.
- `quiz_attempts/pilot-attempt-1` is seeded test data. Delete when convenient.
- Orphan profile doc `users/DARa7DcdblbFLxLIxuZr78w1wxH3` in Firestore, left
  from a throwaway student account. The Auth login is deleted, so nothing can
  sign in as it, but the rules only let a student delete their *own* doc and
  that token is gone -- so it needs removing by hand from the Firebase
  Console. Harmless; it just makes the `users` collection lie about how many
  accounts exist.

---

## Pilot walkthrough feedback (2026-08-24) — addressed 2026-08-25

Tester-reported items and what was done. The recurring theme was missing
field validation; one definition per rule now lives in `src/lib/validation.js`
(names, passwords, year levels, emails) and every form imports from there.

- ~~**Change password accepted anything** (all roles).~~ The 8-char minimum
  existed but nothing else did. Now (owner's policy, 2026-08-25): 8+ with an
  uppercase letter, a lowercase letter, a number and a special character —
  in `ChangePassword.jsx`, the admin set-password dialog, register, and
  mobile `app/parent/change-pass.tsx` **(cross-repo)**.
- ~~**Names accepted digits** (teacher roster add/edit, admin create user,
  register).~~ Letters/spaces/hyphens/apostrophes/periods only, accents
  included.
- ~~**Grading accepted negative weights** (120 + −20 = 100).~~ `weightsValid`
  now requires every weight > 0 before checking the sum.
- ~~**"Classes cannot end after 9:00 PM."**~~ Cap removed per feedback; the
  7 AM open and one-hour minimum stay.
- ~~**Grade/year level accepted free text.**~~ "Grade 1–12" or "1st–5th
  [Year]", restricted by education level where the form knows it.
- ~~**Syllabus link accepted "1".**~~ `isSafeLink` (http/https only) now runs
  in the add-link form, same rule as `AttachmentField`.
- ~~**Dashboard said "1 review guide waiting", page showed none.**~~ The
  class-labels query in `student/remediation.jsx` threw when a remediation
  referenced an unreadable/deleted class, and the whole loader died into the
  "all caught up" empty state. Query is now tolerant like its siblings, and a
  load failure renders an error card with retry, never the empty state.
- ~~**"Forgot?" → standard flow.**~~ Now "Forgot your password?" linking to a
  dedicated `/forgot-password` page (`routes/forgot-password.jsx`).
- ~~**GitHub-style delete confirmation.**~~ `confirmDialog` accepts
  `typeToConfirm: 'DELETE'`; applied to the irreversible deletes (class
  section, published quiz, syllabus, assessment column, remediation plan).
  Reversible actions (archive, close quiz, draft delete) stay one click on
  purpose — see the note in `ui/dialogs.js`.

Not code: the admin "server did not answer" banner means Flask wasn't started
for the demo, and syllabus file upload is the known Spark-plan limitation
(links are the supported path; `lib/attachments.js`).

Still open from this round:
- The Flask provision endpoint and Firestore rules accept what the client now
  rejects — server-side validation is still the backend's job **(cross-repo)**.
- BulkUpload CSV path only checks password length, not the new letter+number
  rule or name characters.
- Student-facing forms (contest evidence, profile) not re-audited this round.

## Registration & subscriptions pane — 2026-08-29

What this pane built today, so the next session starts from the right place.
Decisions are the owner's; the numbers are proposals the owner may revise.

**`/register` is now a six-step walk, one page, both account types** (`routes/register.jsx`,
`AuthLayout` `variant="card"`: navy screen, one white container, left pitch / right form):
1. **Account type** — Individual (a teacher on their own) or Institution (a school).
2. **About you** — first/last name, gender (he/she/others), phone (`phoneError`, new).
3. **Your school** — directory pick or add, campus (optional), private/public,
   academic calendar (school year / semesters / trimesters — **recorded only, not
   billed by**; owner reverted a per-term split the same day), position.
4. **Sign-in details** — email, password, confirm (green "Passwords match").
5. Individual: **Verify identity** — ID type, number, and an https **share link** to a
   photo (no uploads on Spark; `linkError`, new). Institution: same step is Seats.
6. Individual: **Students** slider → "Start free trial". Institution: **Seats** — teachers
   (20–500) × **students per teacher** (30–300), total is the product → "Request access".

**Pricing (mock-up, `lib/pricing.js`, reasoning in its header):** ₱1,200 per teacher seat +
₱60 per student seat, **per school year**, same rate on both paths so they cannot be played
against each other (1 teacher + 120 students = ₱8,400; 20 × 120 = ₱168,000 = 20 × ₱8,400).
Teacher seats carry the AI cost (~₱26/month typical on gemini-3.6-flash, ~₱430 at the daily
cap); students are Firestore reads only (~₱2–3/month). Shown as an **Estimate**. 30-day
trial is a preview *before* the paid year, not a credit against it.

**ID verification for self-registered teachers (the devs check):** profile gets
`verification_status: 'pending'`; `ProtectedRoute` holds the account on
`/pending-verification` (same pattern as the temp-password gate) until a developer approves
it on the new **`/superadmin/verifications`** tab (Firestore-direct; Open ID / Approve /
Reject with a note the teacher sees; rejected teachers resubmit). Approval also stamps
`subscription_status: 'trial'` + `trial_ends_at` (30 days) so the wait does not eat the trial.
Admin-issued teachers never carry the field.

**Institution path today:** creates a normal teacher account (`school_request_pending`),
writes `subscription_requests/{id}` (details + seats, signed with own uid), signs out, shows
"Request sent". Owner has since said **both paths will go through a payment gateway** after
choosing seats — that supersedes the request-queue design once a gateway is approved.

**Still open / not built:**
- **Backend rules not deployed.** `../activklass-backend/firestore.rules` gained
  `subscription_requests` and the verification/trial key guards on `users` — run
  `firebase deploy --only firestore:rules` from the backend repo, or the Institution submit
  and the Approve button fail **(cross-repo)**.
- **Trial expiry is recorded, not enforced** — nothing locks anything at `trial_ends_at`.
- **Payment gateway** (PayMongo suggested — checkout for individuals, invoice + bank
  transfer for schools) needs explicit approval; it is a new paid service.
- No superadmin list of `subscription_requests` yet (read them in the Firebase console).
- **Browser walkthrough of the whole register flow still owed** (verified by build + tests).

## Solo subscriber pane — 2026-08-30

What a teacher on their own subscription sees, built against the account
`maria.santos@activklass.test` (plan `plus`, active, school `ucb`).

- **Indicator in two places:** `SubscriptionChip` under the login id in the sidebar card,
  `SubscriptionBox` in the dashboard header. Both read `useMySubscription()`, which resolves
  through `/api/subscription/mine` and falls back to the profile's `trial_ends_at` when
  Flask is down — the badge must never take a page down.
- **Students page has two tabs for solo teachers:** Directory (unchanged) and Student
  accounts (`routes/teacher/StudentAccounts.jsx`, Class setup lane). The form is always
  visible; the level, grade and section come from the chosen class (`education_level`), so
  a College class hides the LRN field. Three buttons: Add student · Download template ·
  Create accounts from a file. Both paths post to the same provision endpoint, which now
  issues `<prefix>-<last 6 digits>` logins from the teacher's school **(cross-repo,
  `app/api/classes.py`)**. The account list shows each student's classes.
- **Decided:** one step — account + enrolment together. A two-step "master list, then per-
  class roster" was rejected for a solo teacher (same person does both jobs; the endpoint
  already reuses an existing account on a second class).
- **Trial locks:** quiz bank and teacher groups are greyed with `PaidPlanHint` only for
  `kind` trial/expired; a legacy teacher with no record is never locked.
- **Open:** browser walkthrough of every screen above; trial expiry unenforced; the class
  detail lane's `announceLogins()` toast should prefer `login_id` over `email`.

- **Teacher groups → "Your school" (later on 2026-08-30).** Owner: colleagues at the same
  school are grouped by that fact, with no code, request or invite. `hooks/useSchoolColleagues`
  queries `users` where `role == teacher` and `teaching_school_id == mine` (rules already let
  a teacher read teacher profiles; two equality filters need no index) and keeps only
  verified, active accounts; `teacher/SchoolColleagues.jsx` renders it on the Account page,
  with a directory picker for an account that predates the school step. Removed:
  `lib/teacherGroups.js`, the group block in `account.jsx`, the "teacher groups" mention in
  `ServerStatus`. **Cross-repo, not done:** `api/teacher_groups.py` and its three collections
  are now dead — delete them (and the `teacher_group_id` reference in `institution.py`
  absorption) when the backend pane has a moment. `locks.teacherGroups` still greys the card
  on a trial.

## Roster-scope pane — 2026-08-31
- **Rules now scope every student read to the teacher who handles them.** Before: `isTeacher()`
  granted every teacher every student's `users`, `quiz_attempts`, `student_performance`,
  `attendance_summaries`, `remediations`, `gradebooks/*/entries`, `consent_records`,
  `guardian_links`/`guardian_codes` — the screens were scoped, the rules were not. After:
  `handlesStudent()` (reads `users.teacher_ids`) and `teachesClass()` (reads
  `classes.teacher_id`), with the four client roster writes, the two class deletes and the
  three student lookups moved to Flask (`lib/roster.js`, `lib/classes.js`). Per-class list
  queries carry `where('class_id', '==', …)`; two composite indexes added **(cross-repo)**.
- **Verified:** `npm run test:rules` 46/46 (10 new: foreign teacher denied everywhere, every
  forgery refused, student self-reads intact); `npm run test` 531; build clean; backend
  `test_roster_sync.py` 5/5 and `smoke_classes.py` asserts `teacher_ids` on provision; the
  emulator confirmed a `documentId() in` query is judged per document, so `fetchUsersByIds`'
  13 call sites needed no change. Live data backfilled (`scripts/backfill_teacher_ids.py`, 17
  students).
- **Deployed 2026-08-31** by the owner and proven live over the REST API (16/16, see ROADMAP). Was owed: `firebase deploy` from the backend (the
  deploy was not permitted from this pane); a browser pass as Maria after it — the two
  student-facing readers of `{path=**}/entries` (mobile) should be checked against the
  narrowed collection-group rule. The SQL-era `enroll_student`/`drop_student`/`search_students`
  endpoints in `classes.py` are now doubly dead.
- **Lanes touched** (no pane was open for them; every hunk is the mechanical swap above):
  Class detail (`$classId/index.jsx`, `history.jsx`, `scaffolds.jsx`), Class setup
  (`classes/index.jsx`), logic (`roster.js`, `classes.js`, `useTeacherStudents.js`,
  `useQuizRecordSync.js`, `remediation.js`, `gradeRecovery.js`), quiz (`quizzes.$quizId.jsx`).

## Tester tickets — 2026-08-31 (Discord, first `/tickets` run)

Three open tickets (`andecobs-12`, `triplecookiemonster-14`, `andecobs-17`),
grouped by cause, most important first. Ticket names are the Discord channels;
the dumps are in `C:\CAPSTONE\_tools\discord\tickets\`.

1. **Issued-login accounts are tried with the personal email** — blocks testing,
   web. `andecobs-12`: admin created `um-024019` for Derick, who then signed in
   with `dericklungcob@gmail.com` and got "Incorrect login or password". Not an
   auth defect: `lib/logins.js` `toAuthEmail` sends anything with `@` to Firebase
   as-is, and the personal email is never a credential (the bulk-upload card
   even says "Never the sign-in"). It is a UX defect, and the most likely one
   every issued account will hit. Cheapest fix: on `auth/invalid-credential`
   where the identifier contains `@`, add "Accounts issued by a school sign in
   with the login ID, e.g. `um-024019`, not an email." Larger fix: resolve a
   personal email to its login server-side.
2. **Solo teacher registered, then cannot sign in** — blocks testing, web,
   unconfirmed. `triplecookiemonster-14`: Kristine created an individual
   account; `register.jsx` navigates to `/portal` without signing out, so she
   left and came back. Login with `kristine@email.com` → "Incorrect login or
   password"; re-registering → "That email is already in use". So the Auth user
   exists and the password does not match what she typed. `kristine@email.com`
   is not a real inbox, so "Forgot your password?" cannot rescue it. Owner has
   asked for more info in the ticket. To check: Firebase Auth console for that
   user; tell testers to register with a real email.
3. **Export CSV "not functioning"** — wrong behaviour, web. `andecobs-12`.
   `lib/csv.js` `downloadCsv` clicks an anchor that is never appended to the
   document; Firefox (and some download blockers) ignore that. Append the
   anchor to `document.body` before `click()` and remove it after — same for
   `lib/xlsx.js`. Also the button is disabled when the filter matches nothing,
   which reads as broken.
4. **Download template "delayed or not able to download"** — cosmetic, web.
   `andecobs-12`. `downloadXlsx` lazy-loads ExcelJS on first click (`await
   excel()`), so the first download waits on a chunk with no feedback. Put the
   button in a "Preparing…" state while the promise is pending.
5. **School & login prefix accepts anything** — wrong data, web + backend
   **(cross-repo)**. `andecobs-12`: school name `asdfasdfsd`, abbreviation `um`
   saved. `LoginPrefixCard` has no client validation and `/api/admin/school`
   should be checked. Decide the rule (e.g. 2–6 letters/digits, lowercase,
   school name ≥ 3 words or ≥ 8 chars) and enforce it both sides.
6. **Users table has no view, no edit, no created date** — feature gap, web.
   `andecobs-12`. `routes/admin/UsersTab.jsx` rows carry name, login, role
   select, status, reset and deactivate only. Owner's note in the ticket: the
   admin pane is not done yet — this is the list for it. Add a details drawer
   (created_at, personal email, classes) with edit for name and personal email.
7. **Same-name users created without a warning** — suggestion, web + backend.
   `andecobs-12`: two "Does, John" (`um-123553`, `um-012355`). Not a duplicate
   by the system's key (employee number), so it is allowed; warn on an
   identical name or personal email before creating.
8. **Admin has no change-password entry** — feature gap, web. `andecobs-12`
   says it is listed in the module list. `routes/change-password.jsx` exists;
   verify the admin sidebar/account page links it.
9. **Publish blocked by missing Grade Config surprises testers** — not a bug,
   web. `andecobs-17`: the Publish modal's red notice ("has no Grade Config
   yet … Open Grade Config for Section C →") is correct and the draft also
   had 0 questions. Resolved in the ticket. Second tester tripped by a
   precondition, though: consider showing the same notice beside the class
   checkbox in "Assign to Classes" at edit time, not only at publish.

Closed since the last note (from `#ticket-logs` close reasons, 2026-08-25 →
08-30): first-login password change for students; ID choices for
registration; semester number for college; horizontal overflow bug.

## Tester tickets — 2026-08-31, dispatch cards (ticket pane)

The nine items above now each have a dispatch card in
`C:\CAPSTONE\_tools\discord\tickets\_dispatch\T-NN-*.md` (ids T-01 … T-09 in item
order) with the repro, the `file:line` cause, the owning pane per `OWNERSHIP.md`, and
a paste-ready block; `tickets\_ledger.md` tracks state. One correction to the list
above: **item 5 is not a defect** — `schoolNameError` / `schoolAbbrError`
(`lib/validation.js:171-193`, since `58dd263` 2026-08-26) and `admin.py:191-195`
already enforce the same rule on both sides; `asdfasdfsd` / `um` satisfy it, and a
format rule cannot tell gibberish from a name. Whether to require the school
directory instead is an owner decision (card T-05). Ticket `jay_mey-19` (Jami) is a
pipeline test, no issue.

**Correction to item 2, 2026-08-31 (owner re-triage, T-02).** Item 2 above reads as an
account/Firebase problem needing the Auth console. It is not — **it is a web defect in
`src/routes/login.jsx`**, and the card and ledger now say so. The sign-in page labels its
identifier field **"Enter username"** (placeholder "Enter your username", `login.jsx:169-181`),
but a self-registered solo teacher has no username: their credential is the email they
registered with. `toAuthEmail` (`lib/logins.js:34-37`) appends `@activklass.internal` to
anything without an `@`, so a teacher who obeys the label and types `kristine` is sent to
Firebase as `kristine@activklass.internal`, which does not exist → the flat "Incorrect login
or password." (`login.jsx:28,31`); re-registering with the real address then hits the real
account → "That email is already in use." **Both reported symptoms come from that one label,
with no Firebase defect.** This is item 1 (T-01) from the other side — issued account typed as
an email there, email account typed as a username here — one field and one error string, so
**T-02 is dispatched to the same pane as T-01** (Shared `login.jsx`; two panes must not open
it at once). Secondary, not the cause: `register.jsx:258` passes `form.email` untrimmed to
`createUserWithEmailAndPassword` while sign-in trims — `input type="email"` already strips
surrounding whitespace, but trim it in the same pass so both sides agree. Asking Kristine what
she typed still confirms it, but no longer blocks the fix.

### Landed since, from the ticket board (2026-08-31, ticket pane)

Recorded here because the board moved and `BACKLOG.md` had not. Each was committed by
its own debug pane with its own reasoning in the commit body; this is the index, not a
retelling.

- **T-04 — "Download template" stalls on the first click** — `f03aa5d`. The button now
  says it is preparing the file, so a slow first click cannot read as a dead one.
- **T-07 — same-name users created without a warning** — `0cbee11`. A repeated *name*
  now asks before creating; a repeated *address* is refused outright, since an address
  is the only route back into a lost account. Matching lives in
  `routes/admin/duplicates.js` so the Users tab and bulk upload share one definition.
  Server-side uniqueness of a personal email stays a backend follow-up **(cross-repo)**.
- **T-09 — publish blocked by a missing Grade Config** — `7d17985`, taken as a
  suggestion rather than a defect: the class list now says which class has no Grade
  Config, before you get stopped at Publish.
- **Found while building T-09, no ticket of its own:** `efe7972` — publish read each
  class gradebook by id rather than through a list query the rules refuse. Worth an
  issue id if it recurs.

`andecobs-12` was closed in Discord as housekeeping while three of its issues were
still open (T-03, T-06, T-08) and one deferred (T-05); the ledger records that
explicitly so the closure does not read as completion.

## Tester tickets — 2026-09-01, Kristine's second run (ticket pane)

Four tickets from Kristine on the evening of 08-31 (`triplecookiemonster-20/21/22/23`),
plus her original `-14`, which Ticket Bot closed at 16:04 with no reason given. Cards are
in `C:\CAPSTONE\_tools\discord\tickets\_dispatch\`; `_ledger.md` holds the state.

1. **A failed registration strands the email** — blocks testing, web. `T-10`, reported
   twice (`-14`, then `-20` with `abi@email.com`): the account reads as "already in use"
   yet will not sign in. This is the tail of the same wound as T-02 and the reason her
   first ticket never really closed. **Fixed, `d9bb830`** — awaiting her confirmation.
2. **A teacher's ID is found by Add Student and offered as a learner** — wrong data,
   web + backend. `T-11` (`-21`). **Fixed, `173bfca`.**
3. **Disabling a student warns about other classes only after the fact** — wrong
   behaviour, web. `T-12` (`-22`), Class detail lane. **In progress.**
4. **The account page never says which subscription you are on** — suggestion, web.
   `T-13` (`-23`). `teacher/account.jsx:150-161` falls back to "No individual
   subscription on this account. *If* your school subscribed…" on a 404, never consulting
   the profile — so it cannot tell an institution teacher from a teacher with no plan and
   hedges to cover both, while the **Your school** card directly beneath names her school.
   **Dispatched.**

`#20` and `#21` are held at `waiting on tester` rather than `ready to close`: their fixes
are committed but Kristine is the one who could not sign in, so she confirms. `#17`
(Derickk, T-09) is `ready to close` — that one was built and needs nobody's confirmation.

**Fixed 2026-08-31 — `3ea3253` closes both T-01 and T-02.** One commit, because both were
the same field: `src/routes/login.jsx` now labels the identifier **"Email or login ID"**
(placeholder "you@school.edu.ph or snhs-123456") and `signInError()` continues the message
into the half the typed identifier points at — an "@" suggests the school-issued login ID
(T-01), no "@" suggests the email they registered with (T-02); every other Firebase code
keeps its message. `register.jsx` also trims the email before
`createUserWithEmailAndPassword`, so both sides normalise alike. *Verified by the fixing
pane:* `npm run test` 531/531 in 28 files, `npm run build` clean in 795 ms, and four paths
driven in Chrome on :5173 (email account typed without the "@"; issued account typed as a
personal email; each still signing in the right way). Ticket `triplecookiemonster-14` is
**ready to close** — Kristine is owed the reply; `andecobs-12` stays open on T-03…T-08.

## Solo vs institutional pane — 2026-08-31
The owner's decision this session: a solo subscriber and a teacher issued by a school are
different accounts and should not get the same screens. Four commits, all pushed.

- **Only a solo teacher creates a student account** — `97babb9`. The class page told two
  stories: Bulk Upload correctly refuses to create accounts (it matches each CSV row against
  an existing one and names what it could not match), while Add Student sat beside it
  offering a "Create New Manually" tab to everyone. The same teacher who could not create
  fifty accounts from a file could create them one at a time. That tab and its switcher are
  no longer rendered for a teacher with a `school_id`; the failed-lookup copy split the same
  way. **Client-side shaping, not a gate** —
  `POST /api/classes/{id}/students/provision` is still guarded only by teacher role and
  class ownership, so it would accept a school teacher's request made directly. Worth
  closing server-side before anything but the demo leans on it **(cross-repo)**.
- **`accountKind(profile)` — one name for the distinction** — `8a18261`. Returns
  `'school' | 'solo' | 'none'` from `users/{uid}.school_id`, derived and never stored: an
  `account_type` field beside `school_id` would be a second source of truth that provision,
  request approval, promotion to admin and cancellation would each have to keep in step,
  and a drift would show as wrong screens rather than an error. Reads the profile alone, so
  it holds with Flask stopped — `useMySubscription().isSolo` does not, and a stopped Flask
  would have hidden the create tab from the only teacher entitled to it. **Three states, not
  two:** an approved teacher who never subscribed is `'none'`, so `!isSolo` does not mean
  "institutional". Purely additive to the subscription lane; `describeSubscription` and
  `isSolo` untouched, adopting it there is that pane's call.
- **The dashboard box stops offering a plan to a school teacher** — `ea6f7c7`. For
  `kind: 'school'` it no longer links to `/teacher/account` under "Manage your plan" — that
  teacher owns nothing there — and where `schools/{id}.contact_email` exists it carries an
  "Ask your admin" mailto. That address is what `97babb9` created the need for: it removed
  their ability to create an account and left the app telling them to ask an admin it never
  named. The class page now names it at both places it says so (lookup failure, CSV
  unmatched toast) through one `adminSuffix()`. Solo/active/trial/expired/lapsed untouched.
- **The colleagues card finds the school that issued the teacher** — `9ee8629`. "Your
  school" grouped by `teaching_school_id`, which only self-registration and the card's own
  picker ever write — no backend path sets it. So it ran backwards: empty for admin-issued
  teachers who genuinely are a school, populated for solo teachers who merely share a school
  name. Worse, the outer guard showed those teachers "Tell us where you teach" for a school
  they already belong to, and saving would have written an affiliation id that need not match
  the school paying for them. Now `school_id` first, `teaching_school_id` as fallback, picker
  only when neither exists, heading name following the same split. No rules or index change —
  the query keeps `role == 'teacher'`, which is what the rules prove the read from.

**Verified:** `npm run test` 551/551 (14 new across `subscription.test.js` and
`SchoolColleagues.test.jsx`), `npm run build` clean, eslint unchanged at baseline.

**Owed:** the browser walk — none of these four has been looked at by a human. One pass as
`srnhs-260101` (institutional: no create tab, non-clickable school box, populated colleagues)
against any solo teacher (both tabs, trial chip, directory-picked school) covers all of it.

**Lanes touched, each with a heads-up sent first:** Class detail (mine), Subscription/pricing
(`subscription.js`, `SubscriptionBadge.jsx` — Pricing pane), logic + solo
(`useSchoolColleagues.js`, `SchoolColleagues.jsx` — Solo Sub pane). `teacher/index.jsx` was
deliberately **not** touched: doing the split inside `SubscriptionBox` covered it and kept
the Syllabus lane closed.

**Test-case rewrites owed to the members' sheet** (from the audit artifact, Teacher —
Institutional): TC-006 and TC-007 were written as if a class is created with its roster —
it is created empty and populated after — and TC-006's institutional version must now drop
the create path entirely. TC-010 ("invalid file is rejected") would pass for the wrong reason
while uploads are off on Spark; point it at the CSV validator instead. TC-009/TC-020 are held
pending the owner's storage decision — links remain the supported attachment path, and the
syllabus page still renders an Upload File button that cannot succeed
(`teacher/syllabus.jsx:153`, `:179`) — worth a ticket for that pane.

## Syllabus pane — 2026-08-31 (MELC status on the page, item 15)

### The bug was not the one the item described
Item 15 said the syllabus page "renders `melc_code` as a bare string". It does not, and
did not: `toDraftState` never copied `melc_code` or `melc_status` out of the draft, and
`save()` never wrote them back. The generated competency codes were **dropped on the way
into the editor** and were **absent from the saved syllabus document** — a teacher never
saw a code at all, right or wrong, and nothing downstream could have read one.

That makes the fix larger than adding a label: the value had to be carried into editor
state and persisted before there was anything to label. Worth naming because the item was
written from reading `lib/ai.js`, where the codes plainly exist, and not from the page that
was supposed to show them — the same shape as the CLAUDE.md warning about trusting a
docstring over the file.

### What changed (`teacher/syllabus.jsx` only)
- `toDraftState` and `save()` carry and persist `melc_code` + `melc_status`.
- A `MelcCode` badge under each topic title, gated on `melc_status` — a topic a teacher
  typed has none and shows nothing. Wording is `MELC_STATUS_LABEL` verbatim; the AI lane
  owns what we may claim about a code, and restating it here is how the two drift.
- A status with no label renders **nothing at all**, code included. Showing a bare code is
  the bug, so an unknown status must not fall back to showing one.
- The AI-draft banner gained the what-to-do half: check each code against your own MELC
  copy before saving. No vendor and no exception text in either string.

### The end-to-end run that was owed (quota was available: 2 of 20 calls used)
Signed in as `srnhs-260102` (Grace Abad), Flask and Vite both up.

**Run 1 — straight through `generateSyllabus`** from the page context, MATH10 /
Mathematics / Grade 10 / 8 weeks. Returned in 33.6s: 2 modules, 8 topics, **all 8
`unverified`**, `melcWarnings` empty, `structureWarnings` empty. Codes were `M10AL-Ia-1`
through `M10AL-Ii-j-1`.

**Run 2 — the real modal**, same subject, 10 weeks, with a note deliberately asking it to
"open with a short review of the prerequisite Grade 9 competencies" — the case item 15
says produces Grade 9 codes on a Grade 10 request. 4 modules, 11 topics: **1 `absent`,
10 `unverified`**, no warnings. Saved, and the codes and statuses were confirmed in the
Firestore document afterwards — the persistence half, which previously wrote nothing.

**The grade-mismatch case did not reproduce.** Asked point-blank for Grade 9 prerequisite
material, the model wrote the review topic with an **empty** `melc_code` rather than a
Grade 9 one, so it came back `absent`. Two runs, twenty-one topics, zero `grade_mismatch`
and zero `malformed`. That is not evidence the checker is wrong — it is evidence the
example in item 15 is not reliably reproducible on today's model, and nobody should read
a clean run as the checker having proved anything.

### What is verified, and how honestly
- `absent` and `unverified` — **rendered from real model output**, on screen, in the editor.
- `grade_mismatch` and `malformed` — **rendered from a hand-patched fixture**, not from a
  generation. I wrote the two statuses onto the saved document, reloaded the editor, read
  the badges back (correct wording, distinct amber/red tones), then restored the document
  to exactly what the model produced. Recording this as synthetic on purpose: the render is
  proven, the model producing those two statuses is not.
- `npm run test` 551/551, `npm run build` clean, eslint on the file unchanged at its one
  pre-existing `no-unused-vars` (`isNewDraft`).

### Still open
- **`unverified` is the honest ceiling** until a MELC list exists to check against. Nothing
  here makes a code true; the page now says so instead of implying otherwise.
- **`melcWarnings` still only reach `console.warn`.** The per-topic badge cannot express
  the one warning that spans topics — the same competency claimed by two of them. A teacher
  sees neither. That needs a draft-level summary, which this change does not add.
- **The code is display-only.** There is no input for it, so a teacher who spots a wrong
  code can only delete the topic. Deliberate: an editable code makes the stored status
  stale the moment it is typed over, and a stale status is worse than none.
- **Left in Firestore:** syllabus `468901cb-53c6-4ce6-bfa4-8a36cf65f07c` ("Grade 10
  Mathematics Syllabus", `source: ai_generated`, assigned to no class) under Grace Abad,
  from run 2. Test data — delete when convenient.

### 2026-09-12 — the quota this section keeps mentioning is gone
Everything above about "a fresh day's quota" and "2 of 20 calls" describes the free tier
as it stood on 2026-08-31. Since 2026-09-12 the Gemini key runs on a **paid prepay
balance** ($10, non-refundable, spent per generation — `docs/OPEN-QUESTIONS.md`, commit
`a473217`) and the backend's `AI_DAILY_LIMIT` is **200** per teacher per day, up from 20.
So a syllabus-generation run is no longer something to ration or to schedule for a fresh
day; the constraint on repeating the runs above is the prepay balance, not a calendar.
Two things this does **not** change: `unverified` is still the honest ceiling (paying
for the model does not make its codes true), and the grade-mismatch case is still
unreproduced — more calls are now affordable if someone wants to hunt for it.

## Export downloads — T-03 (admin pane) — 2026-08-31

Tester ticket `andecobs-12` (Derickk): "Export CSV not functioning." Fixed; the cause was
one missing line, and it had been shipping for as long as the helper has existed.

- **A detached anchor is not a download.** `lib/csv.js` `downloadCsv` and `lib/xlsx.js`
  `downloadXlsx` each built an `<a>`, set `download`, called `click()` and revoked the
  object URL — without ever putting the anchor in the document. Chromium fires a download
  from a detached anchor; Gecko does not. Every export, template and logins button in the
  app goes through those two functions, so *all* of them were broken for anyone on Firefox
  and fine for everyone on Chrome. That asymmetry is why it read as intermittent and
  survived several walkthroughs: the people driving the demo were all on Chrome.
- **One implementation now, not two.** The two helpers carried the same eight lines and
  therefore the same defect twice — the ticket had to name both files. They now share
  `saveBlob(filename, blob)` in `csv.js`: append, click, remove, and revoke on a
  `setTimeout(…, 0)` because Gecko resolves the `blob:` URL after the click returns, so
  revoking inline can cancel the download it just started.
- **The disabled Export button was the other half the tester felt.** Both admin Export CSV
  buttons go `disabled` when the filter matches nothing, with no reason given — which
  reads as "the button is broken", not "there is nothing to export". They now carry a
  `title` either way (`Download these 12 users as a CSV file` / `Nothing to export — no
  users match this filter`), matching the idiom the Deactivate button in the same file
  already used. Chosen over exporting a headers-only file: a file that arrives empty is a
  second thing to explain, and the empty state beside the button already says the same
  sentence.
- **`csv.test.js` is new** and pins the mechanism rather than the symptom: a stub document
  records the order of events and asserts `click` happened while the anchor was *in* the
  document, plus that the URL is not revoked before the click is handled. The old code
  fails both. Without this the bug is invisible to CI forever, since the runner has no DOM
  and every human here is on Chrome.

**Verified:** `npm run test` 556/556 in 30 files; `npm run build` clean in 736 ms. Driven
in Chrome as Grace Abad — Students → Student accounts → Download template (.xlsx, 6.6 kB,
opens in Excel) and a class record → Export CSV (BOM present, `"Bagtas, Noel"` quoted
correctly). Driven in Brave as Derick Lungcob — both helpers produce correct files.

**Not verified, and it is the half the ticket actually turns on: Firefox.** It is not
installed on this machine, and the owner's call was to ship rather than install it. Brave
was tried as a stand-in and cannot answer the question — it is Chromium, and the
pre-fix detached-anchor shape *downloaded fine there*, exactly as in Chrome. So the
evidence is "the fix works and nothing regressed on Chromium", plus a unit test pinning
the Gecko-relevant mechanism. **Derick is owed the confirmation in Firefox**; until he
gives it, T-03 is fixed-on-reasoning, not fixed-on-observation.

One thing worth writing down for whoever tests downloads next: Chromium throttles repeated
programmatic downloads per tab, and once it trips, *everything* after it silently fails.
Two measurements were wasted reading that as the fix not working. Use a fresh tab per
download, or you will misread your own result.

**Housekeeping:** `lib/csv.js` and `lib/xlsx.js` were in **no lane** — and `csv.js`'s
header claimed the logic lane, which the table never backed up. Both are now in the Admin
lane in `OWNERSHIP.md`, with the boundary written down (Admin owns the files, not the
right to change what they return — three other panes call them).

---

## T-01 + T-02 re-fixed — 2026-09-01 (debug pane, after `/verify all`)

**The sign-in hint was pointing each tester at the credential they do not own.**
bug · blocks testing · web · `andecobs-12` (Derickk), `triplecookiemonster-14` and
`-20` (Kristine). Cards: `_dispatch/T-01-login-id-hint.md`,
`_dispatch/T-02-solo-teacher-cannot-sign-in.md`. Commit `9f15003`.

`3ea3253` fixed the label — the field reads **Email or login ID** and that half was
never in doubt — but its hint branched on whether the identifier contained an `@`. That
reads the identifier as evidence of *what kind of account you have*, and it is not:
`auth/invalid-credential` is also what a plain mistyped password returns on a perfectly
correct identifier, and that is the commoner case by far. So a solo teacher who fumbled
her password on her own email was told to use "a login ID rather than an email address"
— one she has never had. Kristine posted exactly that screenshot about nine hours after
the fix landed. The mirror case sent an issued account hunting for a self-registered
email. T-01's own acceptance line ("a solo-teacher wrong password still shows the plain
message") was not met, and the `/verify all` pass sent both issues back.

**What changed.** The client cannot tell a wrong password from a wrong identifier —
Firebase deliberately returns one code for both — so the message stops guessing and names
both kinds of account, letting the reader recognise their own half. The one thing that
*is* knowable is shape: text with no `@` that is not `prefix-######` was never a
credential (`toAuthEmail` sent it to an account that cannot exist), so that case opens
"That is not an email address or a login ID." rather than blaming the password. That is
Kristine's literal repro — typing a bare name into a field once labelled "Enter
username". `isIssuedLoginId()` was checked against `_issued_login` in the backend's
`app/api/admin.py`, not inferred from the client helper that only previews it.

**Why it shipped untested the first time, and why it cannot again.** `signInError` was
module-private in `login.jsx`, so nothing could reach it — the verification pass flagged
this before flagging the defect. Both the rule and the sentence explaining it now live in
`lib/logins.js` beside `toAuthEmail`. Five assertions in `logins.test.js`, **proved to
bite**: restoring the `3ea3253` body fails all five, restoring the fix passes.

**Verified:** `npm run test` 563/563 in 30 files; `npm run build` clean in 788 ms. Driven
in Chrome on :5173 — `abi@email.com` + wrong password (the verification pass's own repro)
now returns both halves and never names a login ID as the answer; `snhs-100012` + wrong
password returns both halves from the other side; a bare `kristine` returns the "not an
email address or a login ID" line; positive control `snhs-260001` with its real password
still signs in and lands on `/teacher`.

**Not verified, and worth one click after the next Chrome restart:** a *successful*
sign-in by **email**. Clearing the signed-in session by deleting the origin's IndexedDB
wedged Chrome's IDB for `localhost:5173` — `indexedDB.open` stops resolving, so every
later sign-in hangs on `setPersistence`. Self-inflicted by the check rather than a
product fault, and the success path is untouched by this commit (only the error branch
changed) with its issued-login half proved live. Recording it rather than implying the
click happened.

**Housekeeping:** `lib/logins.js` was in **no lane** — the third `lib/` module found that
way. It is now **Shared** in `OWNERSHIP.md`: both auth routes and the admin credential
screens read it and none of them owns it.

## T-14 confirmation coverage — 2026-09-02 (debug pane, ticket `andecobs-24`/`-25`)

Derickk asked for confirmation pop-ups on every destructive or consequential action and
listed about twenty of them, with the sentence that made this an audit rather than a
build: *"If any of the above have already been added to the system … kindly disregard
those items."* Most were already there. Four were not.

1. **Creating an account had no confirm-before** — `routes/admin/UsersTab.jsx`
   (`6437ac3`). Reported twice, `andecobs-26` (student) and `andecobs-27` (teacher). A
   `confirmDialog` already sat in that submit path, which is why the gap survived a
   reading of the file: it fires only when `accountsNamed` finds a same-name account
   (T-07). That is a question about a coincidence, not about the action, so the ordinary
   case — the first account of a given name — went from click to live sign-in with
   nothing in between. One question is now always asked and names the issued login,
   which is derived from the last six digits rather than typed.
2. **Creating a class had none** — `features/classes/ClassFormModal.jsx` (`ef76f73`),
   reported as `andecobs-31`. The same modal is used for edit, where the fields being
   changed are the academic year and semester every list and header reads from.
3. **Creating student accounts had none, on both paths** —
   `routes/teacher/StudentAccounts.jsx` (`ef76f73`). The single form and the file
   upload. The file path is the same one-shot POST the admin bulk upload confirms as of
   `09efd94`, and was the only other caller of that endpoint with no prompt in front of
   it.
4. **Posting an announcement had none** — `routes/teacher/announcements.jsx`
   (`dc96499`). **The dispatch card asserted this one was already covered and it was
   wrong**; that file's only confirm guards the delete. Posting writes a document per
   class and fires a bell to every student on every roster it touches. The confirm
   quotes both counts, computed from the same expression the mutation uses to pick its
   targets.

**Not added, deliberately, and this is the substance of the ticket.** Saving grades
(incremental and editable), marking attendance (checked in the code — it does not lock;
`setDoc` overwrites the day), reactivating an account, enrolling an existing student
onto a roster, removing a profile photo, and Sign Out, which the tester himself flagged
as not needing one. A dialog on a safe action is what teaches people to click through
the dangerous one.

**Already covered, for the record**, since the next pane should not re-audit it: reset
password (the prompt states the effect and names the login), deactivate, remove from
roster, delete class / quiz / syllabus / assessment / scaffold (five of those also
require typing `DELETE`), publishing a quiz (`PublishModal` is the review step), and the
student's quiz submit (a bespoke modal in `quiz-player.jsx:576`, deliberately left
alone rather than given a second dialog).

**Open, logged not built:** the record page has no "discard unsaved changes" guard when
you navigate away mid-edit. The quiz builder has one (`quizzes.$quizId.jsx:860`, which
needed a custom blocker because `main.jsx` does not mount a data router). That is a
build in the Class detail lane, not an audit fix.

**Verified:** `npm run test` 595/595 in 33 files, `npm run build` clean. The admin
dialog was driven in Chrome as an admin — Create teacher quoted the issued login
`sccu-998877`, Cancel left the user count at 162 with no account made. **The four
teacher-side call sites were not clicked through**: the only signed-in session available
was an admin one. Recorded rather than implied.

**Lane note.** Three commits, one per lane (Class setup, Syllabus, Admin). The Admin one
came last because another pane had uncommitted work in `CreateUserForm` when this pane
reached it; staging that file would have carried their in-flight edits into this commit,
so it waited for `75f80c3` / `32c8993` to land. Card: `_dispatch/T-14-confirmation-coverage-audit.md`.

## T-18 bulk-upload failure wall — 2026-09-02 (ticket pane, at the owner's direction, ticket `andecobs-30`)

**Suggestion · clarity. Web, Admin lane. `75f80c3`.** Derickk uploaded 100 teacher rows,
every one failed, and the result panel printed a hundred lines — almost all of them word
for word "the email already belongs to another account". His report was four words: too
long to read.

**The fix was already in the file, applied to the wrong list.** The preview table caps
itself at `rows.slice(0, 8)` and prints "…and 92 more"; the result panel mapped
`result.failed` straight through at whatever length it came back. So the panel now groups
by reason, commonest first, one line each with its count and the spreadsheet rows behind
it — `100 rows — missing name · rows 2–101`. One reason, the usual case, is one line. Row
numbers survive as ranges (that is how a tester finds the line in their file) and the
ranges cap at four runs so a scattered hundred is not a wall of its own.

**Not collapsed into a single generic error,** which is what the ticket literally asked
for. A file that does not follow the format — wrong headers, no data rows — fails earlier
and already says so once through `parseError`. These rows parsed; each failed for a reason
about its data.

The grouping lives in a new `routes/admin/bulkFailures.js` beside `duplicates.js` rather
than inside the component, so it is testable without rendering the page
(`bulkFailures.test.js`, 11 tests). `summarizeFailures` also drops the row number the
network-failure fallback used to invent — it was printing "row 2 —" for a request that
never reached a row.

**Verified:** `npm run test` 599 passing in 33 files, `npm run build` clean, eslint 38
against a 41 baseline. Driven in Chrome as admin on 2026-09-02: a 100-row file with every
`last_name` blank renders `0 created, 100 failed` above the single line above, and a
two-row file with two different faults still shows both (`1 row — missing name · row 2`,
`1 row — missing employee_number · row 3`). The user count stayed 162 through both runs —
those rows are refused in `_prepare_user` before any account is made, which is why that
file was chosen.

**Two notes for whoever is next in a browser.** The dev server full-reloaded twice from
other panes' saves and dropped the session mid-run; a reload on a protected route lands on
`/login` and does not come back, even though the session is intact (navigating to `/admin`
again shows you still signed in). In dev that is HMR noise, but a refresh mid-demo would
read as a logout — worth a look, not logged as an issue here. And synthetic clicks stopped
reaching the page once the Chrome window was in the background; the walk was completed by
driving the same handlers from the page's own context.

Card: `_dispatch/T-18-bulk-result-wall-of-errors.md`.

## T-22 Add Student's Program and Year pickers — 2026-09-07 (build pane, ticket `triplecookiemonster-37`)

**Suggestion · efficiency / data quality. Web, Class detail lane, plus two exports in
`lib/validation.js`. `0329b40` + `3b4afe1`.** Kristine, relaying a colleague: Program and
Year on Add Student → Create New Manually are typed by hand every time, while Remarks and
Enrollment status right under them are already dropdowns.

**Year was already a closed list.** `rosterFieldsError` sends it through `yearLevelError`,
which accepts seventeen values and nothing else, so a free-text box there was a dropdown
with extra typing and an error at the end. `GRADE_LEVELS` / `YEAR_LEVELS` now sit beside
the two regexes in `validation.js`, and the roster forms render a `<select>` of the class's
own half (`classEducationLevel`), pre-set to the class's level on create and to the
student's stored level on edit and found-student. A stored value spelled the loose way the
class form accepts ("3rd", "grade 7") is matched to its option; one that matches nothing
is kept as an extra option instead of being dropped on the next save. `yearLevelError`
itself is untouched — it still guards the CSV path — and `validation.test.js` passes every
list entry through it for its own level so the two cannot drift.

**Program stays typeable** — "BSIT / JHS / Grade School" is open-ended — with a native
`<datalist>`: this roster's own programs first, then a starter list of common Philippine
programs for the class's level (degree programs for College, SHS strands + JHS / Grade
School for basic ed; the owner asked for the starter list when dispatching). A value a
teacher types is on the roster from then on, so it is in the list from then on — the
"add once, keep it" the ticket asked for, with no new collection, write path or rules
change. The starter list is a constant in the route file, not persisted anywhere.

All three roster forms (Edit Student, the found-student panel, Create New Manually) now
render one `ProgramYearFields` component instead of two hand-copied pairs.

**Verified:** `npm run test` 614/614, `npm run build` clean; browser walk as a school-
issued teacher on a K-12 class and on a temporary College class (deleted after). The
Create tab is solo-only and was not driven — it renders the same component; `/verify`
should walk it as a solo teacher.

Card: `_dispatch/T-22-add-student-program-year-pickers.md`.

## T-23 The guardian screen wears the brand — 2026-09-07 (build pane, ticket `maykel_64440-38`)

**Suggestion · design · web.** maykel signed in as a guardian on the web and got the one
page that never had the ActivKlass look: a bare white card on grey, indigo heading, indigo
Sign out. The words were deliberate — guardians are the mobile app by design, and that
screen replaced a misleading "coming soon" — but the chrome was Tailwind's stock
`indigo` / `slate`, never the theme. `components/ParentOnMobile.jsx` now renders the same
message inside `AuthLayout variant="card"`, the shell `/register` uses: title "ActivKlass
for guardians is the mobile app", the "Hi <name> — sign in there with this same email and
password…" sentence as the subtitle, the existing `SignOutButton` dressed as the auth
screens' primary button. No new token or component, `App.jsx` and `theme.js` untouched,
docstring rationale kept.

**Verified:** `npm run test` 614/614, `npm run build` clean; browser as the pilot
guardian at 1920 and 390 wide (brand half hides, heading + button still read); Sign out
confirms and lands on `/login`. Commit `8ba92d2`. Card:
`_dispatch/T-23-guardian-web-screen-off-brand.md`.

## Tester tickets — 2026-09-08/09, Derick's second sweep (ticket pane)

Ten tickets (`andecobs-40` … `andecobs-49`) in one evening, all as Marites or as an
admin. Nine became issues T-24 … T-32; every one of those is now fixed **and** verified,
and the owner closed all nine tickets in Discord. Cards carry the detail; ids are the
join key.

1. **The 12-digit LRN rule is right, nothing says the College path exists** — suggestion ·
   clarity · web · `andecobs-40` · T-24. He typed an 8-digit number into **LRN** and was
   refused. The rule is correct (`lrnError`, `lib/validation.js`, is the DepEd LRN) and the
   form already handles a learner without one — Level → College hides LRN and derives the
   login from the student number (`routes/admin/UsersTab.jsx`) — but Level defaults to G12,
   so he hit the wall before seeing the select. The message now names the College path and a
   hint sits under the field. `ae9ff9a`. Card `_dispatch/T-24-admin-lrn-rule-and-college-path.md`.
2. **New Class marks required fields only after you submit** — suggestion · clarity · web ·
   `andecobs-41` · T-25. Every label in `features/classes/ClassFormModal.jsx` was bare, while
   the Add Student form already used a red asterisk. Asterisks now match the validator's
   required set, College-only fields included. `6d84022`. Card `_dispatch/T-25-new-class-required-markers.md`.
3. **Two classes at the same days and hours, no warning** — suggestion · data quality · web ·
   `andecobs-42` · T-26. Creating or editing a class now names the class it clashes with and
   the overlapping days and hours, and warns rather than refuses — co-teaching and placeholder
   schedules are real. `9374d73` with helper `e1c49e6` (`lib/schedule.js`). Card
   `_dispatch/T-26-class-schedule-overlap-warning.md`.
4. **Middle Name on the class's Bulk Upload Roster** — suggestion · not-a-bug as filed · web ·
   `andecobs-43` · T-27. Filed as deferred: that upload only enrols students who already have
   accounts, so a name column would have written nothing, and middle name is collected on every
   path that creates an account. The owner clicked Build anyway, and the upload now carries a
   middle name onto a matched student who has none. `f48a734`. Card `_dispatch/T-27-roster-upload-middle-name.md`.
5. **The login page's navy panel scrolls away** — bug · wrong behaviour · web · `andecobs-44` ·
   T-28. `html`/`body { overflow-x: hidden }` in `src/index.css` broke the `lg:sticky` aside in
   `AuthLayout`, so the brand half slid up and left cream behind it once the page scrolled.
   `1de070d`. Card `_dispatch/T-28-login-brand-panel-scrolls-away.md`.
6. **Two students, one login** — bug · wrong data · web · `andecobs-45` · T-29. The issued login
   is the school prefix plus the **last six digits** of the LRN, so two LRNs ending the same
   collide; the bulk preview checked email and name but never the derived login. The preview now
   flags a repeat in red with the name it clashes with, and a failed row names whose login it was.
   `d0f9b62`. Card `_dispatch/T-29-bulk-upload-login-collision.md`.
7. **Users list showed no ID number / LRN** — suggestion · feature gap · web · `andecobs-46` ·
   T-30, a narrow slice of T-06. The data was already on every row. There is now a column, and
   search and CSV export use it. `366cea4`. Card `_dispatch/T-30-users-list-id-column.md`.
8. **An institution sign-up lands on the Teacher dashboard silently** — suggestion ·
   not-a-bug as filed · web · `andecobs-47` · T-31. Working as designed — the requester is a
   teacher until the team approves the school — but nothing said so. The dashboard now shows the
   pending notice. `70f8178`. Card `_dispatch/T-31-institution-signup-lands-as-teacher.md`.
9. **"Institution — A school and its staff" reads as the faculty choice** — suggestion · clarity ·
   web · `andecobs-48` · T-32. Step 1 of `/register` invited any staff member to pick the path
   that makes you a school's admin. Both cards now say what they are for, and a faculty member who
   picks Institution is nudged back to Individual. `21efdf3`. Card `_dispatch/T-32-institution-card-invites-faculty.md`.

**Still owed after the closes** (kept in `_ledger.md` under "Follow-ups the owner kept when
closing"): Audrey's already-created colliding account needs a new student number or a manual
fix — T-29 warns, it does not repair; and Carlyn was made an admin from the Users tab, which
skips the school-request approval and leaves her with no school, so she needs setting back to
teacher.

## T-33 The syllabus module description will not grow — 2026-09-09 (ticket pane, `andecobs-49`)

**Suggestion · clarity/usability · web · dispatched.** As Marites on the Syllabus page,
Derick asked for a "resizable text box for module description". He is right and his own
screenshot shows why: the syllabus **Description** above it is a `<textarea rows={2}>`
(`routes/teacher/syllabus.jsx:636-642`) and the sub-module **Learning objectives** below it is
a textarea that auto-grows with its content (`:717-723`) — both carry the browser's resize
grip — while the module description between them is a single-line `<input>` (`:658-663`) that
scrolls sideways instead. Nothing blocks the change: the value is a plain string in, on save
and on load, with no length rule in the client or on the Flask route. One thing travels with
it — a student reads that text in a plain div at `student/classes/$classId/index.jsx:124`, so a
line break a teacher types would collapse there unless `whiteSpace: 'pre-wrap'` lands in the
same commit. Card: `_dispatch/T-33-syllabus-module-description-resizable.md` (Build brief;
Syllabus lane, also touches the Student lane).

## Tester tickets — 2026-09-09 evening, Derick on Quizzes (ticket pane)

Four tickets in ten minutes (`andecobs-50`, `-51`, `-53`, and `triplecookiemonster-52`
which is still empty), all from the quiz screens. Three suggestions and one defect nobody
reported.

1. **Unlimited attempts until the quiz closes** — suggestion · feature gap · web **+ mobile** ·
   `andecobs-50` · T-34. The date half already works: `lib/quizAttempts.js:173` refuses an
   attempt once `closes_at` has passed. What blocks the ask is `quizzes.$quizId.jsx:341-343`,
   which refuses any Attempts value below 1, and `attemptsAllowedFor` (`:77-78`) reading a
   missing value as **one**. Needs a sentinel meaning "no ceiling" plus a required closing
   date — and `quizAttempts` is one of the three modules with a mobile port held by
   `portParity.test.js`, so it is cross-repo. Card
   `_dispatch/T-34-quiz-unlimited-attempts-until-close.md`.
2. **The quiz editor leaves half the screen empty** — suggestion · design · web ·
   `andecobs-51` · T-35. Four `max-w-3xl` containers in `quizzes.$quizId.jsx` (`:1056`,
   `:1647`, `:1676`, `:1686`) with no `mx-auto`, so the form hugs the left edge of a
   full-width page; at 1920 that is about 900 px of nothing. Card
   `_dispatch/T-35-quiz-editor-negative-space.md`.
3. **Name the class, and show its subject** — suggestion · clarity · web · `andecobs-53` ·
   T-36. The quiz header prints `assigned to ${assignedClasses.length} class`
   (`quizzes.$quizId.jsx:1657-1664`) while holding the class objects, and the list card's
   chip shows `{c.section}` alone (`quizzes.jsx:512-518`) with `subject` unused beside it.
   Both formats already exist in those same files (`:676`, `:445`, `:270`). Card
   `_dispatch/T-36-quiz-name-the-class-and-subject.md`.
4. **Every quiz card reads Items 0 · Points 0** — **bug** · wrong data · web · surfaced by
   `andecobs-53` · T-37. Not reported: his screenshot of a published five-question quiz shows
   the card at zero, and his other screenshot shows the same quiz's page reading "5 Questions ·
   7 Pts". `quizzes.jsx:477` and `:529` read the stored `question_count` / `total_points`,
   which **only the Flask model writes** (`../activklass-backend/app/models/quizzes.py:110`)
   — and quizzes are Firestore-direct from this client, so neither field is ever set and the
   `?? 0` fallback is what every card shows. The helper that fixes it, `totalPoints`, is
   already defined at `quizzes.jsx:81` and never called (eslint flags it as unused). Card
   `_dispatch/T-37-quiz-card-items-points-always-zero.md`.

**Tooling, same day: a new ticket now opens its own pane.** `watch_tickets.py` queues each
new ticket and, once the burst has been quiet for two minutes, opens a Claude pane on
`/tickets` through the same launcher the page's Debug button uses. A fifteen-minute cooldown
stops a second pane; anything queued rides along with the next one. It is off for `--once`,
which is the sync a ticket pane runs on itself. See the README section "A new ticket opens
its own pane".

## T-38 First-login wording assumes a school issued the account — 2026-09-09 (ticket pane, `triplecookiemonster-52`)

**Suggestion · clarity · web · dispatched.** Signing in for the first time as the student
`slcsflu-231525`, Kristine got "Your account was set up by your school, so the password you
just used is not yours yet" (`routes/login.jsx:98-100`) and asked for wording that fits both
subscription types — a solo teacher's student was not set up by a school. The same assumption
fires again at `login.jsx:112`, "the password your school gave you", when a reused password is
refused, so fixing one alone walks her into the other. The neutral sentence is already shipped
on the sibling screen: `routes/change-password.jsx:49` says "Your account was set up for you…".
No test pins either string. Card:
`_dispatch/T-38-first-login-assumes-a-school-set-up-the-account.md` (Build brief; landing + auth
lane, with `change-password.jsx` read-only from another lane).

## T-39 Editing a syllabus unassigns it from every class — 2026-09-09 (ticket pane, `triplecookiemonster-54`)

**Bug · wrong data · web · dispatched.** Kristine reported having to re-assign a syllabus to
its classes every time she added a sub-module. It is not the sub-module: any save of an
existing syllabus drops the assignment. `toDraftState` (`routes/teacher/syllabus.jsx:25-56`)
rebuilds the editor's state without `class_ids`, and the restore at `:862-864` is wrapped in
`if (draft)` — so the AI-draft path keeps the assignment and the plain edit path, the one that
has an assignment to lose, does not. `useState(initial.class_ids ?? [])` (`:507`) therefore
opens empty with every box unticked, and save writes `class_ids: []` (`:564`) plus a batch that
clears each class's `syllabus_id` (`:579-581`). Since `classes.syllabus_id` is how a **student**
reaches a syllabus, every save quietly removed it from them too. Fix is to carry `class_ids`
on both paths. Card: `_dispatch/T-39-syllabus-edit-clears-class-assignment.md`.

## Class tasks, Step 2 — the shared logic every deliverables screen reads — 2026-09-13 (Data/logic lane)

**Built (`c364352`, `ded328a`, `72982f0`, `0063710`).** Step 2 of
`docs/plans/modules-content-and-deliverables.md`: `lib/deliverables.js` (pure — `parseWindowDate`,
`fromQuiz`, `fromTask`, `stateOf`, `bucket`, `describeWindow`, `KIND_LABEL`, `taskHref`),
`lib/classTasks.js` (`createTask`, `updateTask`, `publishTask`, `deleteTask`, `uploadTaskFile`,
`newTaskId`), `hooks/useClassTasks.js`, `hooks/useStudentDeliverables.js`, four task rules in
`lib/validation.js`, ten `class_tasks` cases in `lib/firestoreRules.test.js`, and the
`DATA-MODEL.md` row. *Verified:* `npm run test` 960/960, `npm run test:rules` 56/56 against the
emulator, `npm run build` clean, lint at the 51 baseline. **Not driven in a browser** — there is
no screen to drive until Steps 3–5 land; Step 6 (Verify pane) owns that walk. The MODULES and
QUIZZES sessions were sent the signatures directly; the Student pane was not identifiable among
the running sessions and gets them from the owner.

Decisions the page panes should know about, none of them in the plan's wording:

- **A closed quiz the student never took buckets under `overdue`**, with the chip still reading
  "Closed Fri 11 Sep", not "Overdue". The plan's six buckets have no closed section; hiding a
  missed quiz, or filing it under Finished, would both be worse than a section name that is
  slightly off. If the Student pane wants a separate "Missed" heading, that is one line in
  `bucket()` — say so rather than filtering client-side.
- **`useStudentDeliverables` returns `{ items, failed }`, not a bare array.** `items` is every
  deliverable in deadline order; `failed` names the classes whose reads were refused
  (`{ classId, label }`), so the dashboard can say some classes did not load instead of quietly
  showing less. The reason goes to the console, never the screen. `useClassTasks` returns the raw
  documents so a row can be handed straight to `updateTask` / `publishTask`.
- **"This week" is the next seven days** from local midnight, not the calendar week. A Sunday
  deadline seen on Saturday is this week; a school week boundary was not asked for.
- **`newTaskId()` exists because the dialog uploads before the first save.** `uploadTaskFile`
  needs a task id for the Storage path; allocating one client-side costs no write. For a brand-new
  task published straight from the dialog: `createTask` (draft) then `publishTask` — two writes,
  one notification.
- **`assignedToStudent` is restated in `lib/deliverables.js`.** The same three lines live in
  `routes/student/scaffolding.js`; a hook may not import a route, and the route is another lane's.
  Worth collapsing onto the lib copy when the Student pane next touches that file.
- **`taskAttachmentError` re-implements the http(s) test from `isSafeLink`** rather than importing
  `lib/attachments.js`, which pulls in `firebase/storage`. `validation.js` has no imports and every
  form relies on that. A file attachment must sit on a `firebasestorage.googleapis.com` or
  `*.firebasestorage.app` host; a Drive link stored as a "file" is refused with a message that says
  to add it as a link.
- **`describeWindow` formats dates by hand**, not through `Intl`, so the sentence is identical on
  every machine and in every test run — ICU has changed "Sep" to "Sept" between versions. The year
  is shown only when it is not the current one.

Open, and not this lane's to close:

- **The rules are written and tested, not deployed.** The owner runs
  `firebase deploy --only firestore:rules,firestore:indexes,storage` from the backend repo; the
  predeploy gate re-runs the 56 rules tests. Until then a live student query for `class_tasks` is
  refused, and the `(class_id, status)` composite index does not exist on the project.
- **A mobile port of `lib/deliverables.js`** is possible (it is pure) and is not in this plan.
- **Zone-less dates** (plan D3) — fine on one demo machine, recorded, not fixed.
