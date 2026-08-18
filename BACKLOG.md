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

Decide before the `classes` lane renders the model's output. Recommended:
keep them separate and label them for what they are -- "Below 85" is a fact
about the past, "Predicted at risk" is a forecast. Collapsing them loses that
distinction and invites a teacher to trust the wrong number.

Also note `predictRisk` returns `coverage`: the model fills missing indicators
with healthy cohort defaults, so a student with only a failing grade still
scores `on_track`. Render the flag only when coverage is meaningful.

## 4. `PUT` silently unassigns classes **(cross-repo)**

`activklass-backend/app/api/quizzes.py:284` replaces `quiz.classes` from
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

## 6. Mobile and web write different attempt shapes **(cross-repo)**

Mobile's quiz player omits `per_question` and `attempt_number`, which the web
player writes. Web's quiz-feedback page reads `per_question`, so a student who
takes a quiz on mobile and opens feedback on the web sees an incomplete
breakdown. Same family as the `total_score` bug -- two writers drifting.

## 7. The risk model is trained on synthetic data **(cross-repo)**

`/api/predict` fits a Random Forest on data generated at startup; no labelled
ActivKlass history exists yet. Fine as triage, not evidence about a student.
Anything user-facing should say so. Revisit once real attempt history exists.

## 8. Lint: 34 pre-existing errors

Mostly `no-unused-vars`, down from 43. Worth clearing so a non-zero lint exit
means something. Low risk, mechanical.

## 9. One 1.1 MB JS chunk

No code splitting; Vite warns every build. Route-level `lazy()` would cut
first load noticeably, which matters on school wifi.

## 10. 189 hand-written `<button>` elements

No shared component, so "change how this button works" and "change its colour"
are the same file -- which is why the UI/UX lane can only own theme tokens
today, not components. Extract `components/ui/Button.jsx` opportunistically as
lanes touch pages, rather than in one sweep.

## 11. Three Postgres endpoints left in the web app **(cross-repo)**

Everything else the web app calls is either Firestore-direct or AI (which no
longer touches a database):

| Endpoint | Blueprint |
|---|---|
| `GET /api/classes` | `classes.py` (48 SQLAlchemy calls) |
| `POST /api/classes/{id}/students/provision` | `classes.py` |
| `/api/grading-setup` | `grading.py` |

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

Until that is decided, `guardians.py` (21 SQLAlchemy calls), `parent.py` (5)
and migration `b1c4e7d92f08` are net-new Postgres surface added *after* the
decision to retire it, which is worth resolving deliberately rather than by
drift.

## 13. Dead Flask routes now that the web app has moved

`app/api/quizzes.py` still serves 11 routes; the web app calls none of them,
and mobile calls Flask only for guardians. Confirm nothing else consumes them
before deleting -- the same check would have caught that the quiz editor, not
just the bank page, used `/api/quizzes/bank`.

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
