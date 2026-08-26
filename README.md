# ActivKlass — Web

React teacher portal for [ActivKlass](https://github.com/rdgdepaz13-afk/activklass-backend), an AI-powered class record system for Philippine K-12 and college teachers.

Built with React 19, Vite, Tailwind CSS v4, TanStack Query and React Router. Talks to the Flask API and to Firebase (Auth, Firestore, Storage) directly.

## Related repositories

| Repo | Contains |
|---|---|
| [activklass-backend](https://github.com/rdgdepaz13-afk/activklass-backend) | Flask API, AI services, Firebase rules/indexes, shared docs |
| [activklass-web](https://github.com/rdgdepaz13-afk/activklass-web) | **this repo** — React teacher portal |
| [activklass-mobile](https://github.com/rdgdepaz13-afk/activklass-mobile) | Expo student & parent app |

## Getting started

```bash
npm install
cp .env.example .env.local   # then fill in the values below
npm run dev
```

Runs at **http://localhost:5173**. The backend must be running separately — see the
[backend README](https://github.com/rdgdepaz13-afk/activklass-backend#-getting-started).

## Environment variables

Copy `.env.example` to `.env.local`:

| Variable | Description |
|---|---|
| `VITE_API_URL` | Flask API base URL (defaults to `http://localhost:5000`) |
| `VITE_FIREBASE_API_KEY` | Firebase Web app config — Firebase Console → Project settings → General → Your apps |
| `VITE_FIREBASE_AUTH_DOMAIN` | " |
| `VITE_FIREBASE_PROJECT_ID` | " |
| `VITE_FIREBASE_STORAGE_BUCKET` | " |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | " |
| `VITE_FIREBASE_APP_ID` | " |

`.env.local` is gitignored — never commit real config.

## Scripts

| Command | Does |
|---|---|
| `npm run dev` | Vite dev server with HMR |
| `npm run build` | Production build to `dist/` |
| `npm run preview` | Serve the production build locally |
| `npm run lint` | ESLint — 41 pre-existing errors, mostly `no-unused-vars` |
| `npm run test` | Vitest — 446 tests over the pure modules |
| `npm run test:rules` | Runs the real `firestore.rules` against the emulator (needs Java) |

## Layout

```
src/
├── routes/         # Route components (teacher portal pages)
├── features/       # Feature modules
├── components/     # Shared UI components & icons; ui/ is toasts + dialogs
├── context/        # Auth context (useAuth)
├── hooks/          # Shared Firestore reads (TanStack Query)
├── theme.js        # Every colour + typography token
└── lib/            # firebase.js (client init), api.js (fetch wrapper),
                    # domain logic, and 18 *.test.js files
```

## Docs

`CLAUDE.md` is the working brief for this repo. `OWNERSHIP.md` is required reading
before editing anything, because several people work this checkout at once.

| Doc | Answers |
|---|---|
| [docs/VISION.md](docs/VISION.md) | Why this exists and who it is for |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | The layers, and the two data paths |
| [docs/TECH-STACK.md](docs/TECH-STACK.md) | Every tool, why, and what was rejected |
| [docs/DATA-MODEL.md](docs/DATA-MODEL.md) | Every Firestore path this client touches |
| [docs/ROADMAP.md](docs/ROADMAP.md) | What phase we are in |
| [docs/OPEN-QUESTIONS.md](docs/OPEN-QUESTIONS.md) | What has not been decided |

The schema and API docs shared by all three repos live in
[activklass-backend/docs](https://github.com/rdgdepaz13-afk/activklass-backend/tree/main/docs).
