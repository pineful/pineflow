# Development Notes

## Node And npm

This workspace uses Node.js and npm on Windows. The local environment requires Node to use the Windows system certificate store for npm registry access.

Before installing dependencies or running npm scripts that may access the network, set:

```powershell
$env:NODE_OPTIONS='--use-system-ca'
```

This fixes `UNABLE_TO_VERIFY_LEAF_SIGNATURE` without disabling SSL verification.

## Commands

```powershell
& "C:\Program Files\nodejs\npm.cmd" install
docker compose up -d postgres
& "C:\Program Files\nodejs\npm.cmd" run api
& "C:\Program Files\nodejs\npm.cmd" run build
& "C:\Program Files\nodejs\npm.cmd" run dev
```

Copy `.env.example` to `.env` before running the API if you want to customize the database URL or owner key.

When running Vite separately from the API, keep `VITE_API_BASE_URL=http://127.0.0.1:3001` in `.env` so browser requests go to the API server.

Docker Desktop must be running before `docker compose up -d postgres`. If Docker is installed but the engine is stopped, Compose will fail before it can pull or start the PostgreSQL image.

## Design Discipline

Every behavior change should include the closest matching documentation update:

- Recording behavior: `docs/modules/recording.md`
- Summary calculations: `docs/modules/summary.md`
- Persistence contract: `docs/modules/storage.md`
- Naming, copy, and logo logic: `docs/modules/branding.md`
- Larger product scope: `docs/product-plan.md`
- Structural code changes: `docs/architecture.md`
