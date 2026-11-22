# Testing

Commands below come from `package.json`. Run from the repository root.

| Command | Scope / requirements |
|---|---|
| `npm run test` | Vitest unit/component suite; excludes the Firebase rules suites. |
| `npm run test:watch` | Interactive Vitest. |
| `npm run test:rules` | Firestore rules tests via Firebase Emulator; requires Firebase CLI and Java. |
| `npm run test:rules:storage` | Firestore and Storage rules tests via emulators; requires Firebase CLI and Java. |
| `npm run lint` | ESLint. |
| `npm run build` | Production Vite build. |
| `npm run preview` | Serve the generated build locally. |

Install dependencies with `npm ci`. Rules tests need the backend sibling repository because the test loads its rules file. Keep emulator data isolated from production; these commands use the test project id configured in the npm scripts.

## Pull request evidence

Run the checks affected by the change and report the exact command and result. For broad web changes, run `npm run test`, `npm run lint`, and `npm run build`; run both rule suites for rule or data-access changes. Browser-check flows that affect teacher/student behavior. A count in a document is not proof that a suite ran or passed.

## Cross-repository tests

`src/lib/portParity.test.js` requires the sibling `activklass-mobile` checkout at the path expected by the test. Coordinate shared logic changes with that repository and include the parity result where available.\n