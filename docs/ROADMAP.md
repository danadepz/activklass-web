# Roadmap — ActivKlass web

Phase-level status for **this repo**. `[x]` done · `[~]` partial or deferred ·
`[ ]` not started. Each `[x]` carries the date and **how it was verified**.

This is the altitude view: what phase we are in and what the next milestone needs.
It deliberately does not track individual defects — those are logged elsewhere by the
panes, in their own words, and are not restated here.

**Current phase: Phase 7 — defense-demo readiness.**
**Definition of done for v1: the capstone defense demo runs end to end without a
recovery, on one machine, with Flask and Vite both up.** Not production hardening —
this app is not deployed and is not meant to be, yet.

---

## Phase 0 — Foundations `[x]` 2026-06
React 19 + Vite SPA, Tailwind v4, Firebase Auth, role-gated routing.
*Verified:* every route in `src/App.jsx` resolves behind `ProtectedRoute`; the four
roles land on their own home via `RoleHomeRedirect`.

## Phase 1 — Teacher core records `[x]` 2026-06 → 07
Classes, roster, gradebook, assessments, attendance, and DepEd/CHED grade computation.
*Verified:* `grading.test.js` covers `computeFinalGrade` and `finalAcrossPeriods`;
the class screens under `routes/teacher/classes/$classId/**` are driven in walkthroughs.

## Phase 2 — AI layer `[x]` 2026-07 → 08
Quiz generation, syllabus generation, module generation, and Random-Forest risk
prediction — all through Flask, all with a manual path beside them.
*Verified:* `aiDrafts.test.js` and `ai.risk.test.js` cover the draft validator, the MELC
code checker and the risk shaping; `lib/ai.js` is the only file that calls those endpoints.

## Phase 3 — Student portal `[x]` 2026-08
Student dashboard, class detail, quiz player, quiz feedback, remediation.
*Verified:* `quizGrading.test.js`, `quizPool.test.js`, `quizFeedback.test.js` and
`quizAttempts.test.js`; the attempt lifecycle is covered end to end in `quizToRecord.test.js`.

## Phase 4 — Firestore becomes the system of record `[x]` 2026-08
The quiz domain, syllabi and announcements moved off SQL; the client reads Firestore
directly and `firestore.rules` became the authorization layer.
*Verified:* no SQL path remains in `src/`; `npm run test:rules` exercises the deployed
rules file against the emulator, including a deliberately weakened copy that proves the
suite would fail if the rules stopped enforcing.

## Phase 5 — Institutional layer `[x]` 2026-08
Admin console, superadmin console, subscriptions, teacher groups, institution invites.
*Verified:* `superadminAnalytics.test.js` and `AnalyticsBand.test.jsx`; the superadmin
gate is a Firebase custom claim, not a role string, and is re-checked server-side.

## Phase 6 — Automated checks `[x]` 2026-08
A real test suite where there was none, plus cross-repo parity with the mobile ports.
*Verified 2026-08-25:* `npm run test` → **446 tests in 18 files, all passing, 1.15s**.
`npm run build` → clean, 645ms. `portParity.test.js` holds the three shared modules in
step with `activklass-mobile`.

## Phase 7 — Defense-demo readiness `[~]` **← current**
Driving the whole product in a browser as a tester would, and fixing what that surfaces.
The 2026-08-24 pilot walkthrough was the first full pass and its feedback was addressed
on 2026-08-25 — validation now has one home in `lib/validation.js`, and the irreversible
deletes ask you to type `DELETE`.

Also closed 2026-08-25: **an account can no longer be worked on the password staff issued.**
`components/ProtectedRoute` sends anyone whose profile still carries `is_temp_password` to
`/change-password` ahead of every other route — not from the login redirect, which a
bookmark, a refresh or a deep link all skip. The superadmin onboarding endpoint, the one
account-creation path of six that never set the flag, now sets it **(cross-repo)**.
*Verified:* driven in a browser on a provisioned account — login, deep-link bypass attempt,
change, release, revisit — with the cleared flag and `password_changed_at` confirmed in
Firestore; `smoke_superadmin.py` asserts the flag on both branches of `POST /subscribers`
and fails without the fix.

Still open at this altitude:
- `[~]` **Client and server disagree on validation.** The client now rejects what the
  Flask provision endpoint and the rules still accept **(cross-repo)**.
- `[~]` **The CSV bulk-upload path was not re-audited** against the new password and name
  rules.
- `[ ]` **Student-facing forms** (contest evidence, profile) have not had a validation pass.
- `[~]` **Self-service registration and subscriptions** (2026-08-29): the six-step
  `/register` walk, seat sizing with a mock-up estimate, and the developer-reviewed ID
  check are built and pass build + tests. Open: the backend rules deploy **(cross-repo)**,
  trial expiry is recorded but not enforced, the payment gateway is undecided, and the
  browser walkthrough is owed. Details in `BACKLOG.md` (registration pane, 2026-08-29).
- `[ ]` **A second full browser walkthrough** after the above, which is what actually
  closes this phase.

## Phase 8 — After the defense `[ ]` not started
Deliberately not built now. Recorded so it does not get started early:
deployment and a real host; server-side validation parity; splitting the 654 kB main
chunk; retiring the placeholder training data behind the risk model; the lint backlog;
a real account-deletion path (see `OPEN-QUESTIONS.md` §8 — deactivate is the answer for
now, and RA 10173 erasure is the reason it will not stay the answer).

---

## What "done" is not
- **Not deployed.** There is no host, and standing one up is out of scope for the
  defense. See `docs/OPEN-QUESTIONS.md`.
- **Not production-hardened.** Free Spark plan, one dev machine, seeded pilot data.
- **Not feature-complete.** A capstone demo shows the system working, not every feature
  a school would eventually want.
