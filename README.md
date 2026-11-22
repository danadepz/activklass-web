# ActivKlass Web

The React single page application for ActivKlass teachers, students, school administrators, and super administrators. The mobile application serves students and guardians. This repository contains the web client; the Flask API and Firebase rules are maintained in [activklass-backend](https://github.com/danadepz/activklass-backend), and the companion app is [activklass-mobile](https://github.com/danadepz/activklass-mobile).

## Stack and data

- React 19, Vite 8, React Router 7, and Tailwind CSS 4.
- Firebase Authentication, Cloud Firestore, and Cloud Storage through the Firebase Web SDK.
- Firestore is the application system of record. The client accesses it directly under the rules in the backend repository.
- Authenticated Flask API calls use Firebase ID tokens. The API URL is configured by `VITE_API_URL`; development uses Vite's `/api` proxy.
- See [ARCHITECTURE.md](ARCHITECTURE.md), [INTEGRATION.md](INTEGRATION.md), and [the shared API guide](https://github.com/danadepz/activklass-backend/blob/main/docs/ai-endpoints-guide.md).

## Local setup

Requirements: Node.js (current LTS), npm, and Java only when running Firebase emulator rule tests. Clone this repository and its sibling repositories under one directory if you need cross-repository tests.

```sh
git clone https://github.com/danadepz/activklass-web.git
cd activklass-web
npm ci
cp .env.example .env.local
npm run dev
```

On Windows PowerShell, replace `cp` with `Copy-Item .env.example .env.local`. Fill the Firebase values from the Firebase Console. Leave `VITE_API_URL` unset for local use with the Vite proxy. Start the backend separately for features that call Flask; see [backend setup](https://github.com/danadepz/activklass-backend/blob/main/README.md#local-setup). Vite serves the app at `http://localhost:5173` by default.

Never commit `.env.local` or credentials. Browser Firebase configuration is public configuration; Firebase Security Rules and provider restrictions must enforce access.

## Commands

```sh
npm run dev
npm run test
npm run test:rules
npm run test:rules:storage
npm run lint
npm run build
npm run preview
```

See [TESTING.md](TESTING.md) for emulator prerequisites and scope. Do not interpret test specification counts or file counts as executed passing tests.

## Deployment

`vercel.json` defines `/api/*` forwarding to the configured Cloud Run URL and SPA fallback rewrites. This is configuration evidence, not a live-deployment status report. Verify the active Vercel project, domain, API target, Firebase project, and release state with the owner before announcing a deployment. See [DEPLOYMENT.md](DEPLOYMENT.md).

## Collaboration

Use short feature branches from current `main`, make focused pull requests to `main`, and include verification evidence. Never force-push or stage unrelated work. Stage explicit paths, inspect the full index and working tree before committing, and do not commit secrets, generated credentials, local data, or APKs. Review [CONTRIBUTING.md](CONTRIBUTING.md) and [AGENTS.md](AGENTS.md) before work.
