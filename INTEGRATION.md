# Integration contracts

This file summarizes how the web client connects to shared services. The implementation and rules are authoritative; confirm exact fields and permissions in source before changing a contract.

## Identity and authorization

Firebase Cloud Firestore is the primary application database. Firebase Authentication handles identity, and the backend uses Firebase Admin SDK for trusted server-side Firebase operations. Some existing Flask routes still use auxiliary SQLAlchemy/SQLite persistence; PostgreSQL and Neon are not used by the project.

1. Firebase Authentication provides the user session.
2. Direct Firestore and Storage access is governed by `firestore.rules` and `storage.rules` in [activklass-backend](https://github.com/danadepz/activklass-backend).
3. Flask requests use `Authorization: Bearer <Firebase ID token>` and JSON when the endpoint accepts JSON. `src/lib/api.js` owns URL normalization, token attachment, and user-facing error translation.
4. A client role check only controls presentation. Backend authorization and Firebase rules must independently enforce access.

## Data ownership

| Data/work | Primary path | Contract owner |
|---|---|---|
| Firestore-owned client records | Firebase SDK direct to Firestore | Web/mobile data modules and backend Firestore rules |
| Uploaded learning materials and task files | Firebase Storage | Storage rules and client upload modules |
| AI generation, prediction, privileged provisioning/admin, subscriptions, and existing server-backed workflows | Flask `/api/*` | Backend `app/api/`; some legacy routes/models also use auxiliary SQLAlchemy/SQLite persistence |

Do not add an API proxy for ordinary Firestore CRUD without a concrete security or platform requirement. Never bypass the rules with a client-side claim.

## HTTP behavior

- Local web development: leave `VITE_API_URL` unset; Vite proxies `/api` to the local Flask server (see `vite.config.js`).
- Configured deployment: `vercel.json` forwards `/api/*` to the configured Cloud Run origin and routes SPA paths to `/`.
- `lib/api.js` normalizes endpoint paths under `/api`, attaches the Firebase token, and surfaces sanitized errors.
- Treat request/response schemas, status codes, and authorization decorators in backend source as canonical. The backend API guide is useful but may include explicitly marked historical/design sections.
- `PUT` operations may replace list-valued fields such as `class_ids`; inspect the route before assuming patch semantics.

## Contract change checklist

1. Inspect every caller in web and mobile source, not comments or backend route inventories alone.
2. Update the route, schema validation, authorization, and response handling together.
3. Update API documentation and any corresponding client types/tests.
4. For Firestore changes, update indexes/rules and emulator tests in the same coordinated change.
5. For mirrored web/mobile domain logic, run the parity test from a checkout containing both sibling repositories.

See [backend API guide](https://github.com/danadepz/activklass-backend/blob/main/docs/ai-endpoints-guide.md), [backend integration guide](https://github.com/danadepz/activklass-backend/blob/main/INTEGRATION.md), and [mobile integration guide](https://github.com/danadepz/activklass-mobile/blob/main/INTEGRATION.md).
