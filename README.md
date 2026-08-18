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
| `npm run lint` | ESLint |

## Layout

```
src/
├── routes/         # Route components (teacher portal pages)
├── features/       # Feature modules
├── components/     # Shared UI components & icons
├── context/        # Auth context (useAuth)
└── lib/            # firebase.js (client init), api.js (fetch wrapper)
```
