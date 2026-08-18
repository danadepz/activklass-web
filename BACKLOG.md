# Backlog

Known work, roughly in the order worth doing. Items marked **(cross-repo)**
touch `activklass-backend` or `activklass-mobile` as well.

Two are already done and kept here for context on what the rest assume:

- ~~**quiz_attempts didn't reach teachers.**~~ Mobile wrote `score` while every
  teacher view reads `total_score`, so mobile attempts were dropped from the
  scaffold mastery calculation outright. Fixed; Firestore indexes also
  repointed from `completed_at` (a field no writer produced) to `submitted_at`.
- ~~**Dual-write to SQLite and Firestore.**~~ Firestore is now the system of
  record for quizzes, syllabi and announcements. The quiz bank
  (`/api/quizzes/bank`) stays on Flask -- it has no Firestore counterpart.

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

---

## Smaller notes

- Top-level Firestore `syllabi` is empty; the seed writes
  `classes/{id}/syllabus/current` instead. Saving a syllabus from the page
  populates it. Worth aligning the seed.
- No Firestore query in either app uses `orderBy` -- all sorting is
  client-side. Fine at pilot scale; the composite indexes exist for when those
  reads move server-side.
- `quiz_attempts/pilot-attempt-1` is seeded test data. Delete when convenient.
