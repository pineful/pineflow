# 큰 범위 리팩토링 실행 계획

일시: 2026-06-14
기준선: `docs/test-baseline-2026-06-14.md`

## 목표

Pineflow를 기능 추가가 계속 가능한 구조로 정리하되, 기존 서비스 동작과 DynamoDB 데이터 형태를 유지한다. 리팩토링은 UI/UX 재설계가 아니라 책임 분리와 유지보수성 개선이 목적이다.

## 원칙

- 한 커밋에서 UI, API, 저장소, 인프라를 동시에 크게 바꾸지 않는다.
- DynamoDB key 구조, Cognito 설정, API route 계약은 리팩토링 대상이 아니다.
- 각 단계는 `npm run build`를 통과해야 한다.
- Serverless API나 infra를 건드리는 단계는 `infra`의 `npm run verify`를 통과해야 한다.
- 데이터 보존 영향이 있는 변경은 먼저 `docs/modules/serverless-storage.md`와 `docs/api-contract.md`를 확인한다.
- 화면 구조가 바뀌면 최소 로컬 스모크 테스트를 반복한다.
- CSS 변경은 `docs/modules/css-architecture.md`의 guardrail을 따른다.

## 단계

### 0. 기준선 고정

완료됨. `docs/test-baseline-2026-06-14.md`에 빌드, audit, secret 스캔, infra guardrail, 로컬 로그인 화면 스모크 테스트 결과를 기록했다.

### 1. 프론트엔드 순수 로직/보조 상태 분리

목표:

- `App.tsx`에서 localStorage, 읽음 상태, 캐시, 표시 helper처럼 도메인 저장소를 바꾸지 않는 보조 로직을 분리한다.
- 화면 구조와 API 요청 payload는 바꾸지 않는다.

후보:

- Trend Lens 읽음 상태와 link helper.
- 운영 사용량 local cache helper.
- 날씨 변환 helper.
- 날짜/기록 표시 helper 중 `date.ts`로 옮길 수 있는 순수 함수.

검증:

- `npm run build`
- root/infra `npm audit --audit-level=high`
- secret 패턴 스캔
- 로컬 로그인 화면 스모크 테스트

### 2. 프론트엔드 feature 컴포넌트 분리

목표:

- `App.tsx`에서 `TrendLensPanel`, `WeatherDashboardDeck`, `TimeFlowGraph`, `RecordTimeEditor`, `WorkdayLens`를 feature component로 분리한다.
- props 계약을 명시해 화면 단위 책임을 분명히 한다.

검증:

- `npm run build`
- 데스크톱/모바일 로그인 화면 스모크 테스트
- 테스트 계정이 준비되면 인증 후 대시보드 visual smoke

### 3. CSS selector ownership 정리

목표:

- `src/styles.css` 끝에 추가된 override pass를 새로 늘리지 않는다.
- 한 feature를 건드릴 때 해당 selector 묶음을 통합하고, 필요한 경우 `src/styles/` module로 옮긴다.

검증:

- `npm run verify:css`
- `npm run build`
- 모바일 horizontal overflow 확인

### 4. Lambda 내부 책임 분리

목표:

- `infra/lambda/pineflow-api/index.mjs`에서 route dispatch, DynamoDB repository, usage collector, Trend Lens source collector를 분리한다.
- API route path, request/response contract, DynamoDB item shape는 유지한다.

검증:

- `infra npm run verify`
- `npm run build`
- secret 패턴 스캔
- 가능하면 fixture 기반 handler smoke test 추가

### 5. 리팩토링 후 완전 테스트

목표:

- 기준선 테스트를 다시 실행한다.
- 테스트 계정 또는 staging 데이터가 준비되면 Cognito 로그인 후 출근, 퇴근, 기록 수정, 기록 삭제, Trend Lens refresh, 기록 보관함 조회를 E2E로 확인한다.

완료 조건:

- GitHub Actions `Pineflow Serverless` 성공.
- 기준선 문서에 리팩토링 후 결과를 추가하거나 새 기준선 문서를 만든다.
- 데이터 마이그레이션이 필요하지 않았음을 문서에 명시한다.

## 진행 기록

### 2026-06-14 / 1차 저위험 분리

적용:

- Trend Lens 기사 읽음 상태, 읽음 순서 보정, Google News 중간 URL fallback을 `src/trendReadState.ts`로 분리했다.
- 기존 localStorage key `pineflow.trend-lens-read.v1`과 저장 entry shape `{ readAt, readDate }`를 유지했다.
- API route, DynamoDB item shape, Cognito/Auth 흐름, CDK/인프라 코드는 변경하지 않았다.

검증:

- `npm run build` 통과.
- root `npm audit --audit-level=high` 통과.
- `infra` `npm audit --audit-level=high` 통과.
- `infra` `npm run verify` 통과.
- 실제 credential 형태인 AWS access key, GitHub token, private key 패턴 매치 없음.
- 로컬 브라우저 스모크: `http://127.0.0.1:5173/` 로그인 화면에서 `작업사령탑 · Pineflow` title, 브랜드/로그인 표시, desktop overflow `0`, console error `0` 확인.

데이터 보존 판단:

- 서버 저장소와 API payload가 바뀌지 않았으므로 DynamoDB 마이그레이션은 필요하지 않다.
- Trend Lens 읽음 상태는 기존 브라우저 localStorage key를 그대로 읽고 쓰므로 기존 읽음 표시가 유지된다.

다음 단위:

- 2차는 `App.tsx`의 날짜/시간 표시, duration formatting, record grouping처럼 서버 저장소와 무관한 순수 helper를 `src/dateTime.ts` 또는 `src/recordsViewModel.ts` 경계로 옮긴다.
- UI component 분리는 props 계약이 커질 수 있으므로, 순수 helper 분리 후 build와 smoke test가 안정적으로 반복되는 것을 먼저 확인한다.
- Lambda 분리는 API 계약 영향이 더 크므로 프론트엔드 helper 분리와 CSS ownership 정리가 끝난 뒤 별도 커밋에서 진행한다.

### 2026-06-14 / 2차 기록 view model 분리

적용:

- `RecentSession`, `WorkdayLensDay`, 세션 묶기, 기록 보관함 검색, 주간 Workday Lens 계산을 `src/recordSessions.ts`로 분리했다.
- `App.tsx`는 `state.records`를 직접 세션으로 묶지 않고, 새 view model 함수 결과를 렌더링한다.
- 공휴일/주말/주간 진행률 계산도 같은 파일로 옮겨 기록 도메인 표시 규칙을 한 경계에 모았다.

검증:

- `npm run build` 통과.
- root `npm audit --audit-level=high` 통과.
- 실제 credential 형태인 AWS access key, GitHub token, private key 패턴 매치 없음.
- `git diff --check` 통과.
- 로컬 브라우저 스모크: 로그인 화면 title/브랜드/로그인 표시, desktop overflow `0`, console error `0` 확인.

데이터 보존 판단:

- API route, request/response payload, DynamoDB item shape, 저장 로직을 바꾸지 않았다.
- 기존 record 배열을 화면용 view model로 변환하는 위치만 옮겼으므로 데이터 마이그레이션은 필요하지 않다.

다음 단위:

- 3차는 `App.tsx`의 날씨 helper와 weather deck component 경계를 검토한다.
- 날씨는 외부 API와 CSP/도메인 정책이 걸려 있으므로, 순수 표시 helper와 fetch 흐름을 분리하되 URL/권한/인프라 변경은 별도 ADR 없이 진행하지 않는다.
