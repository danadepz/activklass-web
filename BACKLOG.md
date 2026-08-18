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

## 3. Three different meanings of "at risk"

Three definitions will be on screen at once, disagreeing, all labelled the same:

| Source | Rule |
|---|---|
| `teacher/classes/$classId/performance.jsx:182` | grade < 85 |
| `teacher/reports.jsx:147` | assessed but not passing |
| `lib/ai.js` `predictRisk` | Random Forest via `/api/predict` |

The forecast half has since shipped (`7c8fee6`) as `PredictedRisk.jsx` and
`ClassStandingForecast.jsx` -- named as forecasts, and both gate on
`coverage < 0.7`, so the "render the flag only when coverage is meaningful"
part is handled.

What is still open is the *other two*: `performance.jsx` and `reports.jsx` keep
their own unlabelled definitions. Three rules can now be on screen at once, and
only one of them says what it is. Label the past-tense ones too -- "Below 85"
is a fact about the past, "Predicted at risk" is a forecast, and a teacher
reading both as the same claim will trust the wrong number.

## 4. `PUT` silently unassigns classes **(cross-repo)**

`activklass-backend/app/api/quizzes.py:282-283` replaces `quiz.classes` from
`data.get('class_ids', [])`, so omitting the field wipes every assignment.
`save_syllabus` does the same. A teacher editing only a title loses the
class links unless the client resends them.

Make omission mean "leave unchanged"; treat an explicit `[]` as "clear".

## 5. No test suite on the web

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

## 6. Mobile and web write different attempt shapes **(cross-repo)**

Mobile's quiz player omits `per_question` and `attempt_number`, which the web
player writes. Web's quiz-feedback page reads `per_question`, so a student who
takes a quiz on mobile and opens feedback on the web sees an incomplete
breakdown. Same family as the `total_score` bug -- two writers drifting.

## 7. The risk model is trained on synthetic data **(cross-repo)**

`/api/predict` fits a Random Forest on data generated at startup; no labelled
ActivKlass history exists yet. Fine as triage, not evidence about a student.
Anything user-facing should say so. Revisit once real attempt history exists.

## 8. Lint: 35 pre-existing errors

**None are in the UI/UX lane** — `theme.js`, `index.css` and `components/**`
lint clean. Every error sits in a page-lane file, so each pane clears its own;
a single pane doing the lot means editing four files it does not own.

Snapshot below taken 2026-08-19. Treat the counts as indicative, not exact —
the total moved 34 → 36 → 35 over one working session as panes landed new code,
so re-run `npx eslint .` before starting rather than trusting these lines.

| Owner | File | Errors |
|---|---|---|
| **Classes** | `teacher/classes/$classId/index.jsx` | 27 |
| **Classes** | `teacher/classes/$classId/_layout.jsx` | 1 |
| **Quizzes** | `teacher/quizzes.jsx` | 3 |
| **Quizzes** | `teacher/quizzes.$quizId.jsx` | 3 |
| **Syllabus** | `teacher/syllabus.jsx` | 1 |

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

Note the database is still empty -- migrations have never run -- so these three
are broken right now, not merely legacy. That is also why moving them off is
cheaper than it looks: **there is no data to migrate.**

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

## 14. The docs contradict each other on the database **(cross-repo)**

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

## 16. A 429 does not trigger the model fallback **(cross-repo)**

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
