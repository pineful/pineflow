# 리팩토링 전 테스트 기준선

일시: 2026-06-14
기준 커밋: `5dfe46d Add CSS guardrails and extract activity state`

## 목적

큰 범위의 리팩토링에 들어가기 전에 현재 서비스가 최소 운영 기준을 만족하는지 확인하기 위한 기준선이다. 이후 리팩토링 작업은 이 문서의 항목을 깨지 않는 범위에서 작은 단위로 진행한다.

## 통과한 항목

- `npm run build`
  - `npm run verify:css` 통과.
  - TypeScript 컴파일 통과.
  - Vite production build 통과.
- 루트 `npm audit --audit-level=high`
  - high 이상 취약점 0건.
- `infra` `npm audit --audit-level=high`
  - high 이상 취약점 0건.
- secret 패턴 스캔
  - AWS access key, AWS secret key, private key, GitHub token, Slack token 형태의 문자열 매치 없음.
- `infra` `npm run verify`
  - CDK synth 통과.
  - Serverless guardrail 검증 통과.
  - Cognito admin-only, JWT authorizer, DynamoDB 1 RCU/1 WCU, Lambda reserved concurrency 1, CloudWatch log retention 7일, S3 public block/OAC, Budgets `$1/$3/$5`, Lambda `nodejs24.x` 기준 유지.
- 로컬 앱 스모크 테스트
  - `http://127.0.0.1:5173/` 응답 200.
  - 데스크톱 폭에서 문서 제목 `작업사령탑 · Pineflow`, 로그인 화면, Pineflow 브랜딩 렌더링 확인.
  - 데스크톱 콘솔 error 없음.
  - 모바일 폭 `390x844`에서 로그인 화면 렌더링 확인.
  - 모바일 body horizontal overflow 없음.
  - 모바일 콘솔 error 없음.
- GitHub Actions
  - `Pineflow Serverless` workflow 성공.

## 아직 자동 검증하지 못한 항목

- Cognito 실제 로그인 후 대시보드, 출근, 퇴근, 기록 수정, 기록 삭제, Trend Lens 수동 갱신의 end-to-end 조작.
- 실제 운영 데이터가 들어 있는 상태에서의 대시보드/기록 보관함 visual regression.

위 항목은 현재 세션에서 테스트 계정 비밀번호와 실서비스 조작 권한을 사용하지 않았기 때문에 실행하지 않았다. 큰 리팩토링 전에 별도 테스트 계정 또는 staging 데이터를 준비하면 우선 실행해야 한다.

## 리팩토링 진입 기준

- 위 통과 항목을 모두 통과한 상태에서만 큰 파일 분리에 들어간다.
- 인증 후 E2E를 실행하지 못한 상태에서 대규모 UI/데이터 흐름을 동시에 바꾸지 않는다.
- `src/App.tsx`, `src/styles.css`, `infra/lambda/pineflow-api/index.mjs`는 한 번에 전면 분리하지 않고, 기능별로 작은 단위로 이동한다.
- 각 분리 커밋마다 `npm run build`, 관련 문서 갱신, 필요한 경우 `infra npm run verify`를 반복한다.
