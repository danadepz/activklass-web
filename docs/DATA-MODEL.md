# Data model — what the web client touches

**Scope: this document lists the Firestore paths `activklass-web` reads and writes, and
the rules the client must not break.** It is not the canonical field-by-field schema —
that is `../activklass-backend/docs/02-database-schema.md`, shared by all three repos, and
the authorization rules are `../activklass-backend/firestore.rules`. When the two disagree,
the rules file wins, because it is the only thing actually enforced.

Read this before writing any Firestore query. Every path below was derived from the call
sites in `src/`, not from memory.

---

## Top-level collections

| Collection | Written by the web client? | Notes |
|---|---|---|
| `users/{uid}` | yes (teacher edits roster, admin edits profiles) | Holds `role` — the string the rules read for every authorization decision. `first_name`, `last_name`, `email`, `is_temp_password`. |
| `classes/{classId}` | yes | `teacher_id`, `student_ids[]`, `subject`, `subject_code`, `section`, `grade_level`, `syllabus_id`. The roster is the array — there is no join collection. |
| `gradebooks/{classId}` | yes | Doc id **is** the class id. `configured`, `periods[]`, `components[]`, `grading_mode` (default `deped_k12`), `overrides{}`. |
| `quizzes/{quizId}` | yes | `class_ids[]` is the assignment. |
| `quiz_attempts/{attemptId}` | yes (student) | See the lifecycle rule below. |
| `banked_questions/{id}` | yes | The question bank. Folder filtering is **client-side** on purpose — server-side would need a composite index per filter shape for a few hundred documents. |
| `remediations/{id}` | yes | AI-drafted recovery plans, teacher-approved. |
| `syllabi/{syllabusId}` | yes | Top-level. See the split below — this is not the only place a syllabus lives. |
| `announcements/{id}` | yes | |
| `notifications/{id}` | yes | |
| `guardian_links/{linkId}`, `guardian_codes/{code}` | yes | Parent pairing. Codes are single-use and rotated. |
| `consent_records/{uid}` | yes | RA 10173 parental consent. |
| `grade_contests/{id}`, `attendance_contests/{id}` | yes | Student disputes. |
| `grading_presets/{uid}` | yes | A teacher's saved grading setup. |
| `student_performance/{classId_studentId}`, `attendance_summaries/{classId_studentId}` | yes | Composite ids built by helper functions — never hand-assemble them. |

## Subcollections

```
classes/{classId}/attendance/{YYYY-MM-DD}   one document per day
classes/{classId}/syllabus/current          the per-class syllabus
gradebooks/{classId}/assessments/{id}       the columns a teacher grades
gradebooks/{classId}/entries/{studentId}    DERIVED — see below
```

---

## The three rules that break things silently

### 1. `entries` is derived, and it is the only grade a student may read
`gradebooks/{classId}/entries/{studentId}` is computed from `assessments`, not authored.
The rules let a student read their own entry and nothing else in the gradebook. So
**anything that changes a score must call `syncEntries` afterwards** (`lib/gradebook.js`)
— posting a quiz's scores, applying a remediation recovery, editing the record page. Skip
it and the teacher sees the new grade while the student keeps reading the old one, with no
error anywhere.

### 2. An attempt is created at Start, not at submit
`quiz_attempts` documents begin life as `status: 'in_progress'` with a server
`started_at`, and are updated on submit with `submitted_at`, `total_score`,
`per_question[]` and `attempt_number`. **Anything that counts attempts must count
*finished* ones** — use `finishedAttempts()` — or a student mid-sitting is locked out of
the attempt they are currently taking. The rules were widened to match, narrowly: a
student may update their own attempt only while it is still `in_progress`.

Score field: **`total_score`**, not `score`. Mobile once wrote `score`, and every teacher
view silently dropped those attempts from mastery calculations.

### 3. Syllabi live in two places
Saving from the syllabus page writes `syllabi/{id}` **and** the class resolves through
`classes/{classId}.syllabus_id`; the seed script instead writes
`classes/{classId}/syllabus/current`. Both paths exist in the client. When you change how
a syllabus is resolved, check both, and check `classes.syllabus_id` — that is the field a
student actually reads a syllabus through.

---

## Query conventions

- **Shared reads live in `src/hooks/`, never inline in a route.** `useTeacherClasses()`
  replaced the same query written by hand in eight pages.
- **TanStack Query keys are prefix-invalidated.** Class data is under `['fs-classes']`;
  existing `invalidateQueries` calls depend on that prefix. `['class-risk', classId, ids]`
  and `['fs-student-directory', teacherId]` (the cross-class Students page,
  `useTeacherStudents`) are the other shared keys — the latter is deliberately its own
  prefix, not `['fs-classes']`, since it reads far more per class (roster, gradebook,
  assessments, the `student_performance` risk snapshot) than the class list does.
- **No query uses `orderBy`.** All sorting is client-side. Fine at pilot scale; the
  composite indexes exist in the backend repo for when reads move server-side.
- **`in` queries cap at 30 ids.** `fetchUsersByIds` chunks and also strips blank entries —
  one bad id in `student_ids` makes a `documentId()` query throw and takes the whole page
  down, and most callers do not catch.

## What is *not* in Firestore
These go through Flask (`lib/api.js`) because they need the Admin SDK or a model:
account provisioning, admin user management, AI generation, risk prediction,
subscriptions, teacher groups, institution invites. The Flask AI service uses the Admin
SDK and **bypasses the security rules entirely** — a rule is not a check on that path.
