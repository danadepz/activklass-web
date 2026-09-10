# Open questions — ActivKlass web

Decisions that have not been made. **Check here before assuming one.** When a question is
answered, move it to DECIDED with the reasoning — the reasoning is the part that stops it
being re-argued.

There is a second, backend-hosted list at `../activklass-backend/docs/OPEN-QUESTIONS.md`
for cross-repo questions. This file is for the ones that are the web client's to answer.

---

## Open

### 1. Where does this get deployed, if it ever does?
Confirmed 2026-08-25: **not deployed, and not part of the defense.** It runs on the Vite
dev server with a forwarded VS Code port for remote viewers. Unanswered is what happens
after the defense — Firebase Hosting is the obvious fit (same project, free tier, static
build), but nothing has been decided and the Flask half would still need a host of its own.
**Do not stand anything up without asking.**

### 2. Does the client-side validation ever get a server-side twin?
`lib/validation.js` is now the single home for name, password, year-level and email rules,
and every form imports it. The Flask provision endpoint and `firestore.rules` still accept
what the client rejects, so the rules are only enforced by the UI. **(cross-repo)** For a
demo this is survivable; it should not be described as validation.

### 3. Is the bulk CSV path in scope?
`admin/BulkUpload.jsx` checks password length only — not the letter/number/special rule,
not the name-character rule. Either it gets brought up to the shared validators or it is
declared out of scope for the demo. It has not been decided which.

### 4. TypeScript, or permanently not?
There is no typechecker on this repo. Mobile is TypeScript, and the three shared modules
are ported by hand and held in step by `portParity.test.js`. A migration mid-capstone is
not sensible; whether it happens after is open. Until then, the test suite and the build
are the only automated checks, and that is a known gap, not an oversight.

### 5. The 654 kB main chunk
Routes are already lazy and split. What remains in the entry chunk is largely the Firebase
SDK. Splitting it further is real work for a benefit no demo viewer on localhost will
perceive. Open only in the sense that nobody has decided it is closed.

### 6. Two duplicate theme tokens
`goldAmber` and `inkMuted` were preserved during the token extraction so that the change
moved no pixels. `inkMuted` has since been shown to be load-bearing — 22 raw `#3A4A6B`
literals across 14 files that never import it — so collapsing it would lighten text
everywhere. `goldAmber` has not been checked the same way. The UI/UX lane's call.

### 7. What "done" means for the risk model in the demo
The model's training basis is disclosed by `shapeRiskResult` but not next to the number a
teacher reads on screen. Whether that disclosure needs to be on-screen for the defense is
a judgement call nobody has made. **(cross-repo)**

### 8. Is there ever a real account deletion?
Nothing in the product deletes an account. `api/admin.py` exposes create, bulk create,
password reset and disable — no delete route — and the client never calls `deleteDoc` on
`users`. The only deletion that exists is `allow delete: if isAdmin()` in
`firestore.rules`: a permission nothing uses, which reads like a feature until you try it.

Deactivate is the working answer and is built correctly — `UsersTab` writes
`users/{uid}.status` **and** disables the Auth account, because `status` alone leaves a
working login. For the defense that is enough, and Phase 8 is where the rest belongs.

Two things to know before anyone builds the rest, because half a deletion is worse than
none. Deleting **only the profile doc** leaves the Auth account signing in, which
`AuthContext` reports as `not_registered` and routes to `/register` — and that page
explicitly handles an existing session, so the person re-creates their own profile. The
create rule caps the role at `['teacher','student','parent']`, so this is not an admin
escalation, but a removed *student* can return as a *teacher*. Deleting **only the Auth
account** strands the profile in rosters and the console with no way to remove it from
the app. A real delete is therefore one server-side operation doing both, plus scrubbing
`classes.student_ids` — a stale id there drops a student from a roster silently rather
than erroring.

The forcing question is legal, not technical: we advertise RA 10173 compliance on the
landing page, and a data subject's right to erasure is not satisfied by deactivation.
Nobody has decided what erasure means for a student whose grades are an institutional
record. **(cross-repo)**

### 9. How much of CIT-U's CMRS does Grade Config become? (T-45, post-defense)
A tester (maykel, Discord ticket `maykel_64440-39`, 2026-09-07/10) described his school's
CMRS grading module screen by screen and asked whether Grade Config should follow it. The
dispatch card split it into four tiers; on 2026-09-11 the owner chose **Tiers 1 and 2**,
which are built: a teacher-set passing score and a point scale that runs either way
(`passing_percent`, `point_scale_direction` on the gradebook — `DATA-MODEL.md`), and a
Preview card that simulates a setup before it is saved. The rest is recorded here so it is
not started from a ticket:

- **Tier 3 — many named templates per teacher** (his item 1: a searchable list with a
  description, "last updated", "N classes using it", duplicate / delete). Today there is
  exactly one preset per teacher, `grading_presets/{uid}`, written whole by
  `POST /api/grading-setup`. Going to many means `grading_presets` keyed by a generated id
  carrying `teacher_id`, `name`, `description`; the rule for that collection and the
  endpoint change **(cross-repo)**; "N classes using it" is a count over `gradebooks`.
  Medium. Not needed for the demo — one saved setup applied to ticked classes shows the
  same idea.
- **Tier 4 — grading structures, the lab pair, a classification hierarchy and different
  weights per term** (his items 2–5). Items 2–4 are expressible today by flattening —
  "class standing 60 split 40/30/30" is Quiz 24 / Assignment 18 / Seatwork 18 as top-level
  components, same arithmetic — but the *hierarchy* and the fixed lab pair are not. Item 5,
  **different weights per term** (midterm: class standing 40 / prelim exam 30 / midterm
  exam 30; final: 30 / 30 / 40), is **not expressible at all**: a component has one weight
  used in every period. Building it changes the gradebook document, `computeFinalGrade`,
  `syncEntries`, and every screen that reads a component weight. Large, and a data-model
  design pass first — never from a ticket. The one thing to collect before that pass is a
  photo of a real record sheet with per-term weights and real numbers.

---

## DECIDED ✅

- **Firestore is the system of record.** Re-litigated twice, settled. Clients read it
  directly and `firestore.rules` is the authorization layer. SQL is legacy and no new work
  goes there.
- **Guardians are mobile-only.** `/parent` points at the app rather than implying a web
  portal is coming. Decided rather than deferred.
- **Firebase moves to Blaze** (owner, 2026-09-04 — reversing the earlier "stays on
  Spark"). The syllabus page's Upload File for learning materials writes to Cloud Storage,
  which is Blaze-only, and the demo needs a real PDF upload; the link paste stays as the
  fallback. What the upgrade needs after the plan change: the default bucket created in
  the console with the name `VITE_FIREBASE_STORAGE_BUCKET` already carries, then
  `firebase deploy --only storage` from the backend repo, then one upload proven in the
  browser — at which point the Spark comments in `lib/attachments.js`, `lib/avatar.js` and
  the syllabus page's hint text come out. Cloud Functions stay unused regardless.
- **Superadmin is a Firebase custom claim, not a role string.** An admin can write any
  `users/{uid}` document including `role`, so a role string would be self-grantable.
- **Native `alert`/`confirm` are gone,** replaced by `components/ui/`. Irreversible deletes
  use `confirmDialog({ typeToConfirm: 'DELETE' })`; reversible actions (archive, close
  quiz, draft delete) stay one click **on purpose**.
- **The 9:00 PM class-end cap was removed** on tester feedback, 2026-08-25. The 7 AM open
  and the one-hour minimum stay.
- **Password policy** (owner's, 2026-08-25): 8+ characters with an uppercase letter, a
  lowercase letter, a number and a special character. Applies to every set-password path
  across all three repos.
- **A provisioned account replaces its password before it can do anything else**
  (2026-08-25). Gated in `components/ProtectedRoute`, not in the login redirect — a
  redirect is only the first hop, and a bookmark, a refresh or a deep link all skip it.
  It is a workflow gate, not a security boundary: `firestore.rules` decides what an
  account may read and does not care what password is on it. Mobile still gates at login
  only, so a deep link there bypasses it the way the web used to **(cross-repo)**.
- **Quiz-bank folder filtering is client-side.** Server-side would need a composite index
  per filter shape for a few hundred documents.
- **Institutional teachers see the same Reports page as solo teachers** (owner's,
  2026-08-30, from the Institutional Teacher test audit, TC-TIN-036). The on-screen
  summary and Export CSV render for both; there is no `school_id` gate on
  `/teacher/reports` and none is wanted. The test sheet's "Generate Reports must be
  absent" check passes as written because no such control exists for anyone.
- **Accepting a grade contest records the decision only** (owner's, 2026-08-30,
  TC-TIN-015/030). It never changes the score: the teacher edits the cell in the record
  grid and saves, which is what runs `syncEntries`. That is the shipped behaviour and the
  panel says so — the test cases are to be rewritten to assert it, not the code changed.
- **A suspended school is suspended for everyone in it** (owner's, 2026-08-30). When the
  superadmin marks a school `suspended`, the admin console **and every teacher and student
  account under that `school_id`** are held on a "subscription suspended — ask your school
  office" screen until reactivation. It is a gate, not a deletion: nothing is removed and
  everything returns when the status flips back. Solo teachers (no `school_id`) are never
  touched by it. **Not built yet** — today the status is a label; the gate belongs in
  `components/ProtectedRoute` beside the temp-password check, reading the school's
  subscription. Seat prices in `lib/pricing.js` remain unconfirmed; the owner deferred them.
- **Solo teachers are billed per school year** (owner's, 2026-08-30). One payment per
  10-month school year — own seat plus the students they handle — the same period as an
  institution, whatever academic calendar their school runs on. Not monthly, not per
  semester. `lib/pricing.js` already prices this way (`estimateSolo`); this closes the
  billing-period question that the register and solo panes had left open. The gateway that
  collects it is still undecided and still needs approval as a new paid service.
- **School approval is announced by hand** (owner's, 2026-08-30). After the superadmin
  provisions a school from its request, the console shows a ready-to-copy message (admin
  login, temporary password, sign-in link) and a human sends it. No mail provider is added
  for this; automatic email stays off the table with the rest of the paid services.
- **A self-registered teacher verifies with a School / employee ID or a PRC license only**
  (owner's, 2026-08-30). Government ID was removed from the choices: it proves who a
  person is, not that they are a teacher, and the check exists to keep an unreviewed
  stranger out — the two remaining IDs are the ones a school or the PRC issued to a
  teacher. Records already carrying `government_id` still show their raw value in the
  superadmin review table; none exist outside test data.
- **Colleagues are grouped by school, automatically** (owner's, 2026-08-30). A solo
  teacher's "group" is every other verified teacher who registered with the same
  `teaching_school_id` — no group to create, no code to share, no request, no invite. The
  code-based teacher group on the Account page was replaced by a **Your school** card
  that simply lists them. What keeps a stranger who picks "UCB" at sign-up out of UCB's
  list is the identity review, which now accepts only a school/employee ID or a PRC
  license. The Flask group endpoints (`api/teacher_groups.py`) are unused and left in
  place; `teacher_group_id` on a profile means nothing to the web client now.
- **A teacher handles the students in their own classes, and nobody else's** (owner's,
  2026-08-31). Not a school-wide roster, not the colleagues' students: a teacher reads a
  student's profile, work and guardian records only while that student is on a class the
  teacher owns. Enforced in `firestore.rules`, not just on the screens, through the
  server-written `users.teacher_ids` and `classes.teacher_id`; every roster change now
  goes through Flask so that field can never be wrong or forged. The one deliberate
  exception is `GET /api/students/lookup`: an exact-key search (student number, LRN or
  email) that returns roster fields only, because to put an existing account on a class a
  teacher has to be able to find it.
