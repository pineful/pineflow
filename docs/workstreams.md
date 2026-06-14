# 분야별 작업 지도

마지막 업데이트: 2026-06-09

## 목적

이 문서는 Pineflow를 여러 LLM 에이전트나 여러 작업 흐름으로 나누어 수정할 때, 각 분야가 어떤 파일과 문서를 책임지는지 빠르게 확인하기 위한 작업 지도다.

`docs/llm-context.md`가 전체 설계 사상의 출발점이라면, 이 문서는 실제 작업을 맡은 사람이 “내가 건드리는 영역에서 어디까지 같이 봐야 하는가”를 판단하는 기준이다.

## 공통 작업 규칙

- 코드만 바꾸고 끝내지 않는다. 사용자 경험, API, 보안, 저장소, 배포, 브랜드 중 하나라도 의미가 바뀌면 해당 문서도 같은 커밋에서 갱신한다.
- 커밋 제목은 변경 의도를 짧게 드러내는 문장으로 쓴다. 예: `Upgrade Lambda runtime and strengthen logo ring`.
- 여러 분야를 함께 바꾼 커밋은 `docs/change-log.md`와 관련 모듈 문서에 남겨, 나중에 commit 제목만 봐서는 부족한 맥락을 복구할 수 있게 한다.
- 기존 `main` 이력은 되도록 rewrite하지 않는다. 이미 올라간 커밋 설명이 부족하면 새 문서/변경 기록 커밋으로 보강한다.
- AWS 리소스, 인증, 저장소, 비용 가드레일이 바뀌면 ADR 필요 여부를 먼저 판단한다.

## 분야별 경계

| 분야 | 주 책임 | 주요 코드 | 반드시 같이 볼 문서 |
| --- | --- | --- | --- |
| 제품 방향 | `작업사령탑` 서비스 범위, 오늘 리듬, Trend Lens, 비용/보안 우선순위 | `src/brand.ts`, `src/App.tsx` | `docs/product-plan.md`, `docs/llm-context.md`, `docs/status.md` |
| 브랜딩/로고 | Pineflow 이름, 워드마크, 앱 아이콘, 로고 판독성 | `src/brand.ts`, `src/App.tsx`, `src/styles.css`, `public/pineflow-icon.svg` | `docs/brand.md`, `docs/modules/branding.md`, `docs/research/pineflow-logo-*.md` |
| 대시보드/오늘 요약 | 오늘 누적 시간, 목표 대비 진행, 그래프, 태블릿 배치 | `src/App.tsx`, `src/date.ts`, `src/styles.css` | `docs/modules/summary.md`, `docs/research/dashboard-ux-redesign-2026-05-24.md` |
| 기록 UX | 출근/퇴근 CTA, 메모, 업무 유형, 최근 기록, 시간 수정, 브라우저 활동 기반 퇴근 보정 | `src/App.tsx`, `src/clientActivity.ts`, `src/api.ts`, `src/types.ts`, `src/date.ts`, `src/styles.css` | `docs/modules/recording.md`, `docs/api-contract.md`, `docs/research/record-time-editor-ux-2026-05-26.md` |
| UI 컨트롤 외곽 | 버튼, 입력, 선택지, 카드, 위험 동작의 shape/elevation/focus 위계 | `src/styles.css`, `src/App.tsx` | `docs/modules/ui-controls.md`, `docs/research/groupware-control-shape-2026-06-04.md`, `docs/research/futuristic-ui-selection-2026-06-05.md`, `docs/modules/recording.md`, `docs/modules/microinteractions.md` |
| CSS 아키텍처 | CSS 누적 방지, selector ownership, 스타일 파일 분리 기준, 자동 검증 | `src/styles.css`, `src/styles/`, `scripts/check-css-guardrails.mjs`, `package.json` | `docs/modules/css-architecture.md`, `src/styles/README.md`, `docs/modules/ui-controls.md` |
| 인증/세션 | Cognito 로그인, 1일 refresh token, 열린 탭 refresh, 계정 메뉴 | `src/auth.ts`, `src/api.ts`, `src/App.tsx`, `infra/lib/pineflow-serverless-stack.ts` | `docs/modules/serverless-auth.md`, `docs/api-contract.md`, `docs/adr/0002-cognito-admin-only-auth.md`, `docs/adr/0007-open-tab-session-refresh.md` |
| Serverless API | Lambda handler, API Gateway route, JWT authorizer, 오류 응답 | `infra/lambda/pineflow-api/index.mjs`, `infra/lib/pineflow-serverless-stack.ts` | `docs/api-contract.md`, `docs/serverless-implementation.md`, `docs/modules/serverless-auth.md` |
| 저장소/데이터 | DynamoDB single-table, 활성 세션, 기록 보정, 백업/이관 | `infra/lambda/pineflow-api/index.mjs`, `infra/lib/pineflow-serverless-stack.ts` | `docs/modules/serverless-storage.md`, `docs/data-management.md`, `docs/adr/0003-dynamodb-single-table.md` |
| 비용/보안 가드레일 | Free Tier 지향 설정, throttling, concurrency, CSP, IAM 최소화 | `infra/lib/pineflow-serverless-stack.ts`, `infra/scripts/verify-template.mjs`, `infra/bootstrap/*.yaml` | `docs/cost-guardrails.md`, `docs/security.md`, `docs/aws-serverless-deployment-checklist.md`, `docs/adr/0004-cost-first-guardrails.md` |
| 운영 사용량 표시 | CloudWatch 기반 API/Lambda/DynamoDB/S3/CloudFront 기초 사용량 표시 | `src/App.tsx`, `src/api.ts`, `src/types.ts`, `infra/lambda/pineflow-api/index.mjs`, `infra/lib/pineflow-serverless-stack.ts` | `docs/api-contract.md`, `docs/cost-guardrails.md`, `docs/serverless-implementation.md` |
| CI/CD와 배포 | GitHub Actions, OIDC, CDK deploy, S3/CloudFront 반영 | `.github/workflows/serverless.yml`, `.github/workflows/deploy.yml`, `infra/` | `docs/cicd.md`, `docs/aws-iam-oidc.md`, `docs/aws-serverless-deployment-checklist.md`, `docs/adr/0005-github-oidc-no-long-term-keys.md` |
| 날씨 | 현재 위치 기반 날씨, 위치명 fallback, 외부 공개 API | `src/App.tsx`, `src/styles.css`, `infra/lib/pineflow-serverless-stack.ts` | `docs/modules/weather.md` |
| 마이크로인터랙션 | 효과음, 버튼 피드백, toast, 모션 제한 | `src/App.tsx`, `src/styles.css` | `docs/modules/microinteractions.md` |
| EC2/PostgreSQL PoC | 과거 PoC 보존과 수동 참고 | `server/`, `Dockerfile`, `compose*.yml`, `scripts/*ec2*` | `docs/architecture.md`, `docs/deployment-aws.md`, `docs/cicd.md` |

## 작업 전 체크리스트

1. `AGENTS.md`, `docs/llm-context.md`, 이 문서를 읽는다.
2. 위 표에서 자신의 분야를 찾고, 연결된 모듈 문서를 읽는다.
3. 바꾸려는 코드가 보안/비용/데이터 지속성 불변 조건을 건드리는지 확인한다.
4. 변경 전후로 업데이트해야 하는 문서를 먼저 표시해 둔다.
5. 구현 후 `docs/status.md` 또는 `docs/change-log.md`에 완료 맥락을 남긴다.

## 작업 후 체크리스트

1. 루트 앱 변경이 있으면 `npm run build`를 실행한다.
   - `npm run build`는 CSS 누적 방지용 `npm run verify:css`를 먼저 실행한다. 실패하면 기준선을 올리기 전에 selector 통합이나 `src/styles/` 분리를 검토한다.
2. `infra` 변경이 있으면 `infra`에서 `npm run verify`를 실행한다.
3. 보안이나 의존성 변경이 있으면 루트와 `infra`에서 `npm audit --audit-level=high`를 실행한다.
4. 사용자 화면이 바뀌면 가능한 범위에서 로컬 브라우저나 screenshot으로 확인한다.
5. 커밋에는 관련 코드와 문서가 함께 들어가야 한다.
6. push 후 GitHub Actions `Pineflow Serverless` workflow 결과를 확인한다.

## 현재 기준으로 특히 헷갈리면 안 되는 점

- 운영 본선은 AWS Serverless다. EC2 Docker/PostgreSQL은 PoC이며 새 기능을 확장하지 않는다.
- `docs/cicd.md`에서 Serverless 배포가 본선이고, `Build Pineflow PoC Image` workflow는 수동 PoC 이미지 빌드용이다.
- Lambda runtime은 `nodejs24.x`다.
- DynamoDB는 single-table이고 GSI는 아직 없다.
- 기록 수정은 시간뿐 아니라 `mode`와 `note`도 바꿀 수 있어야 한다.
- 최근 기록 목록은 사용자가 남긴 메모를 바로 보여줘야 한다.
- 로고는 `v23 Leafy Crown + Saturn Flow Ring` 기준을 따른다.
- UI 컨트롤 외곽은 `Structured Soft Rectangle` 기준을 따른다. 모든 버튼을 pill로 만들거나 모든 카드를 같은 8px 박스로만 처리하지 말고, 입력/선택/보조 실행/주요 실행/위험 실행을 형태로 구분한다.
- Dribbble 기반 미래형 스타일은 `docs/research/futuristic-ui-selection-2026-06-05.md`와 `Obsidian Command Glass` 기준을 따른다. 배경선만 추가하거나 녹색 shell을 유지한 변경은 완료로 보지 않으며, 전체 IA나 보안/비용 구조를 바꾸는 근거로 쓰지 않는다.
- `src/styles.css`는 레거시 진입 스타일시트다. 새 날짜별 override pass를 추가하지 말고 `docs/modules/css-architecture.md`와 `src/styles/README.md` 기준을 따른다.
## 2026-06-07 추가 작업 분야: Trend Lens

| 분야 | 주 책임 | 주요 코드 | 반드시 같이 볼 문서 |
| --- | --- | --- | --- |
| Trend Lens 제품/IA | 출퇴근 중심 `오늘` 화면을 유지하면서 지식 인텔리전스 영역을 확장 | `src/App.tsx`, `src/styles.css` | `docs/modules/trend-lens.md`, `docs/research/daily-intelligence-dashboard-2026-06-07.md`, `docs/product-plan.md`, `docs/llm-context.md` |
| Trend Lens API/cache | 일일 브리프 캐시, 수동 갱신, source status 응답 | `src/api.ts`, `src/types.ts`, `infra/lambda/pineflow-api/index.mjs` | `docs/api-contract.md`, `docs/modules/trend-lens.md`, `docs/modules/serverless-storage.md` |
| Trend Lens schedule/cost | EventBridge 일일/보안 갱신, DynamoDB TTL, Lambda timeout | `infra/lib/pineflow-serverless-stack.ts`, `infra/scripts/verify-template.mjs` | `docs/adr/0008-trend-lens-scheduled-intelligence-cache.md`, `docs/aws-serverless-deployment-checklist.md`, `docs/cost-guardrails.md` |
| Trend Lens source policy | KISA/CISA/Google News RSS allowlist, API key/SSM 정책, 저작권/SSRF 방어, 위키/백과 source 제외 | `infra/lambda/pineflow-api/index.mjs` | `docs/security.md`, `docs/modules/trend-lens.md`, `docs/adr/0008-trend-lens-scheduled-intelligence-cache.md` |
