# Tech stack — and why

One entry per tool, with the constraint that forced it. Rejected options are recorded
because the reasoning is what stops a decision being re-litigated.

**The constraint behind most of this: a student budget.** Everything fits a free tier,
with one decided exception: Firebase moves to **Blaze** (owner decision 2026-09-04) because
the syllabus page's Upload File writes learning materials to Cloud Storage, and Storage is
Blaze-only on every project. Demo-scale PDFs stay inside Storage's free allowance; a small
budget alert is the safeguard. Until the upgrade, the bucket and the `storage.rules` deploy
have all happened, `uploadBytes` still 404s and `lib/attachments.js` turns that into a
"paste a link instead" message — a link remains a first-class attachment either way.
Blaze is not being used for Cloud Functions; see below.

| Layer | Choice | Why |
|---|---|---|
| Framework | **React 19** | The team knows it, and the mobile app is Expo/React — one mental model across both clients. |
| Build | **Vite 8** | Instant HMR matters when four panes edit one running app. Its dev proxy is also what makes a forwarded port work for remote demo viewers. |
| Routing | **React Router 7** | Plain `<Routes>` in `src/App.jsx`, not a file-system router. Every route is registered in one visible file, which is what makes the ownership lanes checkable. |
| Styling | **Tailwind CSS v4** (`@tailwindcss/vite`) | v4 needs no config file. Brand tokens live in `src/theme.js` rather than a Tailwind theme, so a colour change is one file for both Tailwind classes and inline styles. |
| Server cache | **TanStack Query v5** | Firestore reads are shared across screens; the query cache and prefix invalidation removed eight hand-written copies of the same class query. |
| Backend-as-a-service | **Firebase** (Auth, Firestore, Storage) | Free tier, real security rules, and a client SDK the mobile app can share. Firestore being directly readable is what let mobile drop its API layer entirely. |
| Tests | **Vitest 4** | Same transform pipeline as Vite, so the pure modules test with no extra config. 446 tests in ~1.2s. |
| Rules tests | **`@firebase/rules-unit-testing` + emulator** | The rules are the only server-side authorization; testing them against a real engine is the only way to know they hold. Needs Java, so it is a separate script. |
| Lint | **ESLint 10** flat config | Present, with a **41-error pre-existing baseline** (nearly all `no-unused-vars`). It is not a gate — compare the count. |

## What the client does *not* own
The Flask API, the Gemini integration, the scikit-learn risk model and `firestore.rules`
all live in `activklass-backend`. This repo calls them; it does not configure them.
Model and vendor choices are documented there.

## Rejected and abandoned

- **TypeScript on the web** — not adopted. The mobile app is TypeScript and the three
  shared modules are ported by hand and held in step by `portParity.test.js`. Revisiting
  this means a migration mid-capstone, which is why it has not happened. The cost is real:
  there is **no typechecker on this repo**, so the test suite and the build are the only
  automated checks.
- **Postgres / Neon** — abandoned 2026-06-12, never actually set up. The AI endpoints had
  been written against a Postgres user table and an `ai_jobs` table, so they returned 500
  against an unmigrated database until that dependency was replaced with Firebase-token
  auth and a Firestore ledger.
- **SQLite/SQLAlchemy as a second store** — dual-writing to SQL and Firestore ended when
  Firestore became the system of record. The SQL layer survives in the backend for a few
  legacy endpoints; **new work does not go there**, and nothing in `src/` touches it.
- **A REST layer in front of Firestore** — deliberately not built. The client reads
  Firestore directly and the rules enforce access. Adding an API hop would move
  authorization into a place that is easier to forget to check.
- **Server-side quiz-bank filtering** — reverted to client-side. Firestore would need a
  composite index per filter shape, for a few hundred documents.
- **Cloud Functions** — not used, even once Blaze makes them available. Anything that
  would have been a function is either a Flask route or client-side, and a second
  server-side layer next to Flask is not worth having for the demo.
- **A web portal for guardians** — deliberately not built. Parents are mobile-only;
  `/parent` says so instead of implying one is coming.
- **Native `alert` / `confirm`** — removed. 36 of them were replaced by the toast and
  dialog layer in `components/ui/`.

## Version notes
React 19, Vite 8, Tailwind 4, React Router 7, Firebase 12, ESLint 10 and Vitest 4 are all
recent majors. If an API here does not match what you remember, check `package.json` and
the installed package before assuming the code is wrong.
