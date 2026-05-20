# Architecture

## Application Shape

Pineflow is implemented as a Vite React single-page app backed by an Express API and PostgreSQL database. Records are now server-owned so the service can run beyond one browser and eventually support account sync.

## Boundaries

- `src/App.tsx`: Screen composition and user interactions.
- `src/api.ts`: Browser-side API client.
- `src/date.ts`: Date, time, duration, and daily summary rules.
- `src/brand.ts`: Product name, tagline, work mode labels, naming candidates.
- `src/types.ts`: Shared domain types.
- `src/styles.css`: Visual system and responsive layout.
- `server/index.mjs`: Express API, request validation, and production static file serving.
- `server/db.mjs`: PostgreSQL pool and migration bootstrap.
- `server/schema.sql`: Database tables and indexes.
- `docker-compose.yml`: Local PostgreSQL development database.
- `docs/development.md`: Local environment and command notes.
- `docs/deployment-aws.md`: AWS Free Tier deployment guidance.

## Change Policy

When behavior changes, update the module document in `docs/modules/`. When product scope changes, update `docs/product-plan.md`. When visual identity or naming changes, update `docs/brand.md`.

Environment-level changes should be recorded in `docs/development.md`.

## Future Extension Points

- Add real authentication and replace `PINEFLOW_OWNER_KEY` with user-owned records.
- Add export modules without changing the recording UI.
- Add account sync only after the personal, non-company positioning is stable.
