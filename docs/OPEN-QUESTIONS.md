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

---

## DECIDED ✅

- **Firestore is the system of record.** Re-litigated twice, settled. Clients read it
  directly and `firestore.rules` is the authorization layer. SQL is legacy and no new work
  goes there.
- **Guardians are mobile-only.** `/parent` points at the app rather than implying a web
  portal is coming. Decided rather than deferred.
- **Firebase stays on Spark.** No Blaze, so no Cloud Functions and no file uploads —
  syllabus attachments are links. This is a budget decision, not a technical one, and it
  is the reason for several limitations that otherwise read as bugs.
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
