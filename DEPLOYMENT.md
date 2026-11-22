# Deployment

## Configured topology

- `vercel.json` contains a rewrite for `/api/*` to `https://activklass-backend-59267706068.asia-southeast1.run.app/api/*` and an SPA fallback.
- `vite.config.js` contains the local `/api` proxy to Flask on port 5000.
- Firebase configuration in this repository is for local emulator support and a placeholder Storage rules path; production Firestore and Storage rules live in the backend repository.

These files document intended/configured targets only. They do not establish current service health, ownership, deployed revision, domain, or Firebase project. Confirm those with the owner and provider console before making a release claim.

## Release procedure

1. Start from a reviewed commit on the intended release branch; confirm the exact commit and clean release inputs.
2. Set the public `VITE_FIREBASE_*` build configuration and `VITE_API_URL` only as required by the target. Do not put private keys in frontend variables.
3. Run `npm ci`, `npm run test`, `npm run lint`, and `npm run build`.
4. Confirm the Vercel project is linked to the correct repository/branch and inspect the effective rewrite target.
5. Publish through the approved Vercel workflow; verify SPA deep links, Firebase sign-in, Firestore access, Storage workflows, and API health from the deployed origin.
6. Coordinate backend and Firebase rules releases separately. See [backend deployment](https://github.com/danadepz/activklass-backend/blob/main/DEPLOYMENT.md).

Do not deploy or alter production configuration as part of a documentation change. Never commit Firebase service account files, private API keys, or production exports.\n