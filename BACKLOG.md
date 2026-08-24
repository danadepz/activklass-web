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

This is precisely the failure docs/05 warns about under "Ollama availability
during defense: the procedural fallback is mandatory". The overload path is
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
