# ActivKlass Web — agent instructions

Read `CLAUDE.md` and `OWNERSHIP.md` before editing application files. `OWNERSHIP.md` defines file lanes and shared-file coordination requirements. These instructions supplement those project rules.

## Shared project rules

- Keep documentation factual and source-backed. Source/configuration/tests define implemented behavior; deployment configuration does not prove live deployment, and research objectives are not implementation claims.
- Firebase Cloud Firestore is the primary application database. Firebase Authentication provides identity; Firebase Admin SDK handles trusted backend operations. Direct client access is protected by backend Firestore rules. Flask endpoints also enforce token authentication and route-specific authorization; UI route checks are not authorization.
- Coordinate API, Firestore schema/rules, and mirrored web/mobile logic changes across all three repositories.
- Preserve existing and uncommitted work. Do not stage broadly, rewrite history, or commit secrets, generated data, logs, or APKs.
- Follow ticket-desk instructions when handling a ticket. For ordinary contribution work, use `CONTRIBUTING.md` and report verification in the pull request.

## Documentation map

- `README.md`: setup and repository entry point.
- `ARCHITECTURE.md`: web/system architecture.
- `INTEGRATION.md`: cross-repository contracts.
- `TESTING.md`: executable checks and prerequisites.
- `DEPLOYMENT.md`: configured topology and release guidance.
- `CONTRIBUTING.md`: branch, review, and contribution process.
