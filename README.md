# Pineflow

Pineflow is a mobile-first personal commute logger for people who want to record work boundaries without belonging to a company attendance system.

개인적으로 회사에 속해있지 않더라도 출퇴근을 기록하고, PostgreSQL에 개인 업무 리듬을 저장하는 모바일 서비스입니다.

## Run

In this Windows environment, npm needs Node to use the system certificate store:

```powershell
$env:NODE_OPTIONS='--use-system-ca'
& "C:\Program Files\nodejs\npm.cmd" install
docker compose up -d postgres
& "C:\Program Files\nodejs\npm.cmd" run api
& "C:\Program Files\nodejs\npm.cmd" run dev
```

Set `VITE_API_BASE_URL=http://127.0.0.1:3001` in `.env` when running the Vite app separately from the API server. In production, `npm start` serves both the API and the built frontend from the same Express process.

## Build

```powershell
$env:NODE_OPTIONS='--use-system-ca'
& "C:\Program Files\nodejs\npm.cmd" run build
```

## Documentation

- Product plan: `docs/product-plan.md`
- Architecture: `docs/architecture.md`
- Brand system: `docs/brand.md`
- Module notes: `docs/modules/`
- Change log: `docs/change-log.md`
- AWS deployment notes: `docs/deployment-aws.md`

When a module changes, update the matching document in `docs/modules/` during the same change.
