# Architecture

## System context

ActivKlass has three clients/services and a shared Firebase project. Firebase Cloud Firestore is the primary application database; Firebase Authentication handles identity. Clients use Firebase directly for records, while backend trusted operations use Firebase Admin SDK.

```text
Web (React/Vite) ───── Firebase Auth / Firestore / Storage
       │                         ▲
       └── authenticated /api ───┤
                                 │
Mobile (Expo) ─── Firebase ── Flask API (Cloud Run configuration)
```

The relationship diagram describes code/configuration contracts. It does not assert that a particular project or service is currently deployed. Some existing Flask routes use auxiliary SQLAlchemy/SQLite persistence; this does not change Firestore primary status, and PostgreSQL/Neon are not used.

## Web layers

- `src/App.jsx`, `src/routes/`: route composition and role-specific screens.
- `src/components/`, `src/features/`: shared presentation and domain-focused UI.
- `src/context/`: Firebase session and user profile state.
- `src/hooks/`: shared Firestore queries and caching.
- `src/lib/`: Firebase access, API transport, and domain logic. Keep calculations and validation in reusable modules where practical.
- `firestore.rules` is in the backend repository. It is the authorization boundary for direct client Firestore access; UI route guards are not a security boundary.

## Data flow and identity

The client signs users in with Firebase Authentication. Calls to Flask use a Firebase ID token as a bearer token. Firestore reads and writes go directly through the Firebase SDK and are constrained by Firestore rules. Cloud Storage access is constrained by Storage rules. Privileged identity operations, server-side integrations, and model-backed endpoints belong in Flask.

Super administrator access uses a Firebase custom claim verified by trusted server code. Do not use a client-editable profile field as the sole authorization signal. Guardians use the mobile app; the web `/parent` route is guidance to the mobile experience.

## Cross-repository invariants

- Firestore schema and rules: `activklass-backend/firestore.rules`, `firestore.indexes.json`, and the shared database schema guide.
- Web/mobile parity modules are checked by `src/lib/portParity.test.js`; update the matching mobile TypeScript port when changing a shared algorithm.
- API endpoint behavior is implemented by backend blueprints under `activklass-backend/app/api/`; see [INTEGRATION.md](INTEGRATION.md) and the [backend API guide](https://github.com/danadepz/activklass-backend/blob/main/docs/ai-endpoints-guide.md).
- A score mutation that changes a student-visible derived grade must follow the gradebook synchronization path in `src/lib/gradebook.js`.

## References

- [Data model](https://github.com/danadepz/activklass-web/blob/main/docs/DATA-MODEL.md)
- [Backend architecture](https://github.com/danadepz/activklass-backend/blob/main/docs/01-architecture.md)
- [Mobile architecture](https://github.com/danadepz/activklass-mobile/blob/main/ARCHITECTURE.md)
