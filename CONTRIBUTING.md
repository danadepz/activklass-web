# Contributing

## Branches and pull requests

- Branch from the latest `main` using a descriptive name such as `feat/...`, `fix/...`, or `docs/...`.
- Keep each pull request focused and open it against `main`. Describe user impact, affected repositories, risks, and verification evidence.
- Do not force-push, rewrite shared history, or merge/deploy without the repository owner's approval.
- Preserve all pre-existing work. Never use broad staging (`git add -A`, `git add .`, or `git commit -a`); stage explicit paths and inspect both the index and full diff before committing.
- Never commit `.env*` files, service-account JSON, private keys, local databases, logs, APKs, or user data.

## Implementation standards

- Read `AGENTS.md`, `CLAUDE.md`, and relevant architecture/data/API docs before changing a subsystem.
- Treat current source, configuration, and tests as authoritative. Update docs when verified behavior changes; distinguish configured intent from deployed state and implementation from research objectives.
- Maintain tenant boundaries, least privilege, and Firebase rule coverage. Do not claim privacy-law compliance from the presence of a UI or consent field alone.
- Coordinate schema/API/shared-logic changes with the other repositories. Follow [INTEGRATION.md](INTEGRATION.md).
- Avoid adding a service, dependency, paid tool, or production operation without explicit owner approval.

## Before requesting review

Run the relevant checks in [TESTING.md](TESTING.md), inspect `git diff --check`, and list commands that were not run. For user-visible behavior, provide browser/device verification when practical. Include screenshots only when they contain no personal or production data.\n