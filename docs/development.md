# 개발 메모

## 실행 환경별 명령 (Windows / Linux)

이 문서의 명령은 Codex가 쓰던 **Windows PowerShell** 기준이다. Claude Code
on the web 등 **Linux** 환경에서는 경로/PowerShell 구문 대신 아래 bash 명령을
쓴다. 검증 **항목과 의미는 동일**하고 쉘만 다르다. OS 무관 공통 검증 루프는
`docs/agent-collaboration.md`를 단일 출처로 본다.

| 작업 | Windows (PowerShell) | Linux (bash) |
| --- | --- | --- |
| 의존성 설치 | `& "C:\Program Files\nodejs\npm.cmd" install` | `npm install` |
| 루트 빌드+검증 | `& "...\npm.cmd" run build` | `npm run build` |
| 개발 서버 | `& "...\npm.cmd" run dev` | `npm run dev` |
| infra 검증 | `cd infra; & "...\npm.cmd" run verify` | `cd infra && npm run verify` |
| 보안 audit | `& "...\npm.cmd" audit --audit-level=high` | `npm audit --audit-level=high` |

- Linux에서는 `NODE_OPTIONS=--use-system-ca`(Windows 인증서 회피용)가 필요 없다.
- Claude Code on the web 세션은 `.claude/hooks/session-start.sh`가 루트와
  `infra` 의존성을 자동 설치하므로 수동 설치가 보통 필요 없다.

## Node와 npm (Windows)

이 작업공간은 Windows의 Node.js와 npm을 사용합니다. 현재 환경에서는 npm이 레지스트리에 접근할 때 Node가 Windows 시스템 인증서 저장소를 사용하도록 설정해야 합니다.

의존성 설치나 네트워크가 필요한 npm 명령을 실행하기 전에 다음 값을 설정합니다.

```powershell
$env:NODE_OPTIONS='--use-system-ca'
```

이 설정은 `UNABLE_TO_VERIFY_LEAF_SIGNATURE` 문제를 SSL 검증 비활성화 없이 해결합니다.

## 로컬 실행 명령

```powershell
& "C:\Program Files\nodejs\npm.cmd" install
$env:POSTGRES_PASSWORD='replace-with-local-random-password'
docker compose up -d postgres
& "C:\Program Files\nodejs\npm.cmd" run api
& "C:\Program Files\nodejs\npm.cmd" run build
& "C:\Program Files\nodejs\npm.cmd" run dev
```

API 설정을 바꾸려면 `.env.example`을 `.env`로 복사한 뒤 값을 수정합니다.

`npm run build`는 TypeScript/Vite 빌드 전에 `npm run verify:css`를 실행합니다. 이 검증은 `src/styles.css`에 날짜별 override block을 계속 쌓거나 `!important`, CSS `@import`, TODO/FIXME/HACK 주석을 추가하는 것을 막기 위한 CSS 구조 가드레일입니다.

## 단위 테스트

순수 로직 모듈(`src/date.ts`, `src/weather.ts`, `src/recordSessions.ts` 등)은
Node 내장 test runner로 회귀 검증합니다. 별도 테스트 프레임워크 없이 `tsx`
loader만 devDependency로 사용합니다.

```bash
npm test   # node --import tsx --test "src/**/*.test.ts"
```

- 테스트 파일은 모듈 옆에 `*.test.ts`로 둡니다. (예: `src/date.test.ts`)
- 테스트 파일은 브라우저 앱 빌드 대상이 아니므로 `tsconfig.json`의 `exclude`로
  `tsc`/`vite` 빌드에서 제외합니다. Node `node:test`/`node:assert`를 직접 씁니다.
- 화면 동작, 인증 플로우, AWS 연동은 단위 테스트 범위가 아니다. 빌드/로컬
  스모크 + 배포 후 실계정 e2e로 본다.
- CI(`Pineflow Serverless`)의 validate job이 빌드 전에 `npm test`를 실행한다.

## 배포 후 실계정 검증 (E1, Playwright)

배포된 앱을 관리자 테스트 계정으로 점검하는 end-to-end 하니스는 루트와 분리된
`e2e/` 디렉터리에 있다(자체 `package.json`이라 본선 빌드/CI에 영향 없음).
로그인~출퇴근~기록 수정·삭제~Trend Lens~로그아웃을 데스크탑/모바일 viewport에서
돈다. 배포 URL과 테스트 계정을 env로 받으며, env가 없으면 skip 한다. 실행
방법은 `e2e/README.md`를 본다.

## Serverless DynamoDB 백업/복구

운영 본선 DynamoDB table의 논리 백업/복구는 `infra/scripts/dynamodb-backup.mjs`를
사용합니다. 이 명령은 AWS CLI v2 credential이 필요하고, 새 AWS 리소스를 만들지
않습니다. 백업 파일은 개인 기록을 포함하므로 `backups/`에 두더라도 커밋하지
않습니다(`.gitignore` 적용).

```powershell
cd infra
& "C:\Program Files\nodejs\npm.cmd" run dynamodb:backup -- --out ../backups/pineflow-dynamodb-20260629-000000.json --profile <aws-profile> --region ap-northeast-2
& "C:\Program Files\nodejs\npm.cmd" run dynamodb:backup:validate -- --file ../backups/pineflow-dynamodb-20260629-000000.json
& "C:\Program Files\nodejs\npm.cmd" run dynamodb:restore -- --file ../backups/pineflow-dynamodb-20260629-000000.json --dry-run --profile <aws-profile> --region ap-northeast-2
```

절차와 복구 옵션(`--skip-existing`, `--skip-derived`, `--overwrite`)은
`docs/data-management.md`를 본다.

Vite 개발 서버를 API와 별도로 띄울 때는 `.env`에 `VITE_API_BASE_URL=http://127.0.0.1:3001`를 둡니다. 그러면 브라우저 요청이 API 서버로 전달됩니다.

`docker compose up -d postgres`를 실행하기 전에는 Docker Desktop이 켜져 있어야 합니다. Docker가 설치되어 있어도 엔진이 꺼져 있으면 PostgreSQL 이미지를 내려받거나 컨테이너를 시작할 수 없습니다.

로컬 PostgreSQL compose는 레거시 Docker/PostgreSQL PoC 개발용입니다. 운영 본선은 AWS Serverless이며, 이 compose 파일은 `POSTGRES_PASSWORD`가 명시되지 않으면 시작하지 않고 DB 포트도 `127.0.0.1`에만 바인딩합니다.

## 문서 갱신 규칙

기능 변경은 가장 가까운 설계 문서와 함께 반영합니다.

- 기록 동작: `docs/modules/recording.md`
- 요약 계산: `docs/modules/summary.md`
- 저장소 계약: `docs/modules/storage.md`
- 이름, 문구, 로고: `docs/modules/branding.md`
- 제품 범위: `docs/product-plan.md`
- 코드 구조: `docs/architecture.md`
- CSS 구조와 누적 방지: `docs/modules/css-architecture.md`, `src/styles/README.md`
- AWS 운영 구조: `docs/deployment-aws.md`
