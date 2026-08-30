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
| `users/{uid}` | yes (teacher edits roster, admin edits profiles, superadmin reviews verifications) | Holds `role` — the string the rules read for every authorization decision. `first_name`, `last_name`, `email`, `is_temp_password`. A self-registered teacher also carries `verification_status` (`pending` → `approved`/`rejected`, set only by the superadmin claim), `verification_id_type`/`_number`/`_link` (a share link — no uploads on Spark) and, on rejection, `verification_note`. `ProtectedRoute` holds anyone not `approved` on `/pending-verification`; admin-issued teachers never have the field. Self-subscribed accounts also carry `subscription_status: 'trial'` and `trial_ends_at` (30 days — stamped at approval for individuals, at registration for institution requesters). **Nothing enforces the expiry yet**; it is recorded so the gate can be built server-side. A student a teacher provisions (`POST /api/classes/{id}/students/provision`, from the class page or the solo teacher's Students → Student accounts tab) also carries `login_id` and, when one was given, `personal_email`; the login prefix is the school's `login_prefix` for an institution teacher and `teaching_school_id` (the `school_directory` id, e.g. `ucb`) for a solo teacher. `teaching_school_id` / `teaching_school_name` are affiliation only (never billing) and are what groups colleagues: the Account page's **Your school** card (`useSchoolColleagues`) lists every verified, active teacher with the same `teaching_school_id` — no group document, code, request or invite exists any more; a teacher without the field picks their school from the directory there and writes it onto their own profile. A **student** also carries `teacher_ids[]` — the `teacher_id` of every class they are on, **written only by Flask** (`services/roster_sync.py`, on every roster change) and the field the rules read to decide whether a teacher may see the student at all; no client may write it. |
| `schools/{schoolId}` | no (read only) | `name`, `login_prefix`, `contact_email`, `school_year_current`, and `subscription_status` — a **mirror of `subscriptions/{schoolId}.status`** written by the superadmin API on provision, approval and every status change. Any member of the school may read their own school document; none may read the subscription. `AuthContext` loads it with the profile as `school`, and `ProtectedRoute` sends everyone in a `suspended`/`cancelled` school to `/suspended` (`lib/schoolStatus.js`). Superadmins are never gated; a school doc without the field never gates. |
| `classes/{classId}` | yes | `teacher_id`, `student_ids[]`, `subject`, `subject_code`, `section`, `grade_level`, `academic_year`, `syllabus_id`. A College class also carries `semester` (`1st` / `2nd` / `summer`, required by the form — `SEMESTERS` in `lib/validation.js`); K-12 classes store `null`, and `academicTerm()` in `lib/classForm.js` is the one label ("2026-2027 · 1st Sem") every list and header shows. The roster is the array — there is no join collection. **A client may no longer write `student_ids`, `teacher_id`, or delete a class**: roster changes go through `addToRoster` / `removeFromRoster` (`lib/roster.js` → `POST`/`DELETE /api/classes/{id}/roster`) and `deleteClassSection` (`lib/classes.js` → `DELETE /api/classes/{id}`), which rewrite each student's `teacher_ids` in the same request. A teacher creates a class empty. |
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
| `subscription_requests/{id}` | yes (create only, signed with own `uid`) | The "Institution" path on `/register`. The person creates a normal teacher account (`school_request_pending: true`) and leaves a request for the ActivKlass team — their details plus the seats they chose (`teacher_seats` 20–500, `students_per_teacher` 30–300, `student_seats` = the product, `academic_calendar` school_year/semestral/trimestral; the page shows a per-school-year estimate from `lib/pricing.js`; the calendar is recorded, not billed by); the rules pin the shape and only the superadmin tier can read it. The superadmin console's **School requests** tab lists pending ones; Decline is a client update (`status: 'declined'`, `decision_note`), Approve goes through Flask (`POST /api/superadmin/requests/{id}/approve`), which creates the school and subscription and promotes the requester to admin in one batch. |
| `student_performance/{classId_studentId}`, `attendance_summaries/{classId_studentId}` | yes | Composite ids built by helper functions — never hand-assemble them. |

## Subcollections

```
classes/{classId}/attendance/{YYYY-MM-DD}   one document per day
classes/{classId}/syllabus/current          the per-class syllabus
gradebooks/{classId}/assessments/{id}       the columns a teacher grades
gradebooks/{classId}/entries/{studentId}    DERIVED — see below
```

---

## The four rules that break things silently

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

### 4. A teacher reads only the students they handle — and the rules prove it from the query
Since 2026-08-31 `isTeacher()` no longer opens student data. A teacher may read a
student's profile, attempts, risk snapshot, remediations, grade entries, guardian
links and consent only for a student on a class they own, and the rules decide that
in two ways: `users.teacher_ids` (server-written, see the `users` row) for anything
keyed by the student, and `classes/{class_id}.teacher_id` for anything keyed by the
class. **A list query must carry the fact the rule needs**: every teacher-side read of
`quiz_attempts`, `student_performance` and `remediations` now includes
`where('class_id', '==', classId)` (a `quiz_id`-only query is refused even for the
owner — the engine cannot prove it), and the `(quiz_id, class_id)` /
`(plan_id, class_id)` composite indexes live in the backend's
`firestore.indexes.json`. `fetchUsersByIds` needs nothing extra: a `documentId() in`
query is judged per document. Looking up a student to enrol — someone the teacher
does not yet handle — goes through `GET /api/students/lookup` (exact number, LRN or
email; roster fields only). Verified in `lib/firestoreRules.test.js` under
`npm run test:rules`.

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
