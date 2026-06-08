# Serverless 구현 현황

마지막 업데이트: 2026-06-04

## 이번 단계의 목표

Pineflow의 운영 기준은 EC2 Docker PoC에서 AWS Serverless 구조로 옮겨졌다. 이 단계의 핵심은 보안/비용 가드레일을 인프라 코드에 고정하고, 프론트엔드가 Cognito 로그인 기반으로 API를 호출하며, GitHub Actions가 OIDC로 AWS에 배포하는 본선 흐름을 유지하는 것이다.

## 추가된 구성

- `infra/`: AWS CDK TypeScript 프로젝트.
- `infra/lib/pineflow-serverless-stack.ts`: Cognito, API Gateway, Lambda, DynamoDB, S3, CloudFront, Budgets 정의.
- `infra/lambda/pineflow-api/index.mjs`: Serverless API 핸들러.
- `.github/workflows/serverless.yml`: GitHub OIDC 기반 Serverless 검증/배포 workflow.
- `src/auth.ts`: Cognito 로그인과 첫 로그인 비밀번호 변경 처리.
- `src/App.tsx`: access key 입력 화면을 Cognito 로그인 화면으로 전환.
- `infra/scripts/verify-template.mjs`: CDK 출력 템플릿의 비용/보안 가드레일 자동 검증.

Lambda 코드는 Node.js 24 Lambda 런타임에 포함된 AWS SDK for JavaScript v3를 사용한다. 따라서 Lambda asset에는 별도 `node_modules`를 포함하지 않는다. AWS Health에서 Node.js 20.x EOL 알림이 발생했으므로 Pineflow의 CDK 정의와 guardrail 검증은 `nodejs24.x`를 기준으로 고정한다.

## 보안 설계

- Cognito User Pool은 `selfSignUpEnabled: false`로 생성한다.
- Cognito App Client는 secret 없는 웹 클라이언트로 두되, OAuth 기본 예시 callback이 생기지 않도록 `disableOAuth: true`를 명시했다.
- 실제 데이터 API는 API Gateway JWT authorizer를 통과해야 한다.
- Lambda는 JWT claim의 `sub`를 기준으로 `USER#<sub>` partition에만 접근한다.
- GitHub Actions는 장기 AWS Access Key를 저장하지 않고 OIDC로 AWS IAM Role을 assume하는 구조를 사용한다.
- CloudFront는 CSP, HSTS, frame deny, no-referrer 등 기본 보안 응답 헤더를 적용한다.
- 브라우저에는 API용 access token과 refresh token을 `sessionStorage`에만 저장한다. 브라우저 종료 후 장기 토큰은 유지하지 않는다.
- Cognito refresh token validity는 1일로 제한한다. 열린 탭에서는 30분 주기로 access token을 refresh하고, refresh 실패 시 프론트엔드가 세션을 정리하고 로그인 화면으로 복귀한다.
- 모든 API route는 `/api/health`까지 JWT authorizer를 요구한다.
- Lambda IAM 권한은 필요한 DynamoDB item 작업으로 제한하고 `Scan`, `BatchWriteItem`은 허용하지 않는다.
- 운영 사용량 패널은 CloudWatch `GetMetricData`만 읽고, 앱 Lambda에는 Cost Explorer 권한을 주지 않는다. 화면의 비용 정보는 실제 청구액이 아니라 Free Tier 기준선과 현재 사용량을 비교한 추정이다.
- `/api/usage`는 같은 날짜의 스냅샷을 DynamoDB `USAGE#YYYY-MM-DD` item으로 캐시한다. 프론트엔드도 같은 날짜의 응답을 `localStorage`에 저장해 CloudWatch 반복 호출을 줄인다.
- 로그인 후 첫 화면의 비용 신호등은 `/api/usage` 결과나 당일 캐시를 요약해 보여준다. 이 신호등은 별도 AWS 조회를 만들지 않고, 사용량 조회 실패도 기록 기능 오류와 분리해 `확인 불가`로만 표시한다.
- dependency audit 기준 애플리케이션에는 취약점이 없고, `infra`에는 high 이상 취약점이 없다. `infra`의 moderate `brace-expansion` 이슈는 CDK 도구 체인의 transitive dependency이며 Lambda 배포 asset에는 포함되지 않는다.

## 비용 가드레일

- API Gateway throttling: rate `1 req/sec`, burst `5`.
- Lambda reserved concurrency: `1`.
- DynamoDB provisioned capacity: `1 RCU / 1 WCU`.
- CloudWatch log retention: 7일.
- AWS Budgets: 월 $1, $3, $5 알림.
- S3 public access block 적용.
- CloudFront OAC로만 S3 object 접근 허용.
- 프론트엔드 S3 bucket은 미완료 multipart upload를 1일 뒤 정리하고, `assets/` 객체를 30일 뒤 Intelligent-Tiering으로 전환한다.
- 앱 첫 화면은 비용 신호등으로 Free Tier 기준 예상 상태를 짧게 표시하고, 앱 하단 운영 사용량은 CloudWatch 지표 기반의 기초 사용량, 시간 순 추이, 서비스별 상세 기준을 표시한다. 실제 청구액은 Budgets와 Billing 콘솔에서 확인한다.

## 데이터 설계

DynamoDB single-table 구조를 사용한다.

- `pk`: `USER#<cognito-sub>`
- `sk`: `SETTINGS`, `ACTIVE_SESSION`, `SESSION#<iso-time>#<session-id>`

이 구조는 사용자별 최근 기록 조회, 현재 활성 세션 조회, 설정 조회를 단순한 key 기반 접근으로 처리하기 위해 선택했다. 초기 버전에서는 GSI를 만들지 않는다. 사용량이 적은 개인 서비스이므로 불필요한 capacity 축을 늘리지 않는 편이 비용 방어에 유리하다.

기록 시간 보정은 최근 세션 query 결과에서 `sessionId`를 찾아 처리한다. 퇴근 시각은 item update로 끝나지만, 출근 시각은 최근 기록 정렬 기준이므로 `SESSION#<iso-time>#<session-id>` 정렬 키를 새 시간으로 옮긴다. 이 이동은 delete/put transaction으로 처리하고, 활성 세션이면 `ACTIVE_SESSION.sessionSk`도 같이 갱신한다.

기록 삭제는 `DELETE /api/records/{recordId}`로 처리한다. `recordId`에서 `sessionId`를 추출해 해당 `SESSION#...` item 전체를 삭제하고, 삭제 대상이 활성 세션이면 `ACTIVE_SESSION` item도 같은 transaction에서 삭제한다. 개별 출근/퇴근 이벤트만 삭제하는 기능은 세션 모델을 깨뜨릴 수 있으므로 제공하지 않는다.

## 배포 흐름

1. GitHub Actions가 앱과 인프라를 검증한다.
2. `main` branch에서 AWS OIDC 설정이 준비되어 있으면 CDK stack을 배포한다.
3. CDK output에서 API endpoint, Cognito 정보, S3 bucket, CloudFront distribution id를 읽는다.
4. 그 값을 Vite 환경변수로 넣어 프론트엔드를 빌드한다.
5. `dist/`를 S3에 업로드한다.
6. CloudFront cache를 invalidation 한다.

## 아직 남은 작업

- DynamoDB export/import 운영 절차 구체화.
- 실제 사용 후 CloudWatch 지표를 보며 throttling/capacity 조정 필요 여부 확인.
- Budget 알림 이메일 구독과 비용 알림 수신 상태를 주기적으로 확인.

## 관련 점검 문서

- AWS 배포 전 점검표: `docs/aws-serverless-deployment-checklist.md`
- LLM 작업 컨텍스트: `AGENTS.md`, `docs/llm-context.md`
- API 계약: `docs/api-contract.md`
- 비용 가드레일: `docs/cost-guardrails.md`
- 설계 결정 기록: `docs/adr/`
## 2026-06-07 Trend Lens 서버리스 확장

Trend Lens는 기존 Serverless 본선 안에서 구현한다. EC2/PostgreSQL PoC로 확장하지 않는다.

추가 리소스:

- EventBridge Rule `pineflow-trend-lens-daily-refresh`: 매일 22:00 UTC, 즉 07:00 KST에 전체 브리프 갱신.
- EventBridge Rule `pineflow-trend-lens-security-refresh`: 30분마다 공식 보안 위험 신호 갱신.
- DynamoDB TTL `expiresAt`: Trend Lens snapshot과 manual cooldown guard item 정리.

추가 API:

- `GET /api/trend-lens`: 최신 Trend Lens 캐시 조회. 외부 호출 없음.
- `POST /api/trend-lens/refresh`: 로그인 사용자의 수동 갱신. `scope`는 `all` 또는 `security`만 허용.

추가 저장 item:

- `pk=SYSTEM#TREND_LENS`, `sk=TREND_LENS#LATEST`
- `pk=SYSTEM#TREND_LENS`, `sk=TREND_LENS#SNAPSHOT#YYYY-MM-DD`
- `pk=SYSTEM#TREND_LENS`, `sk=TREND_LENS#MANUAL#all`
- `pk=SYSTEM#TREND_LENS`, `sk=TREND_LENS#MANUAL#security`

Trend Lens 수집은 Lambda 내부 이벤트와 인증된 refresh route에서만 수행한다. 브라우저는 KISA, CISA, Google News RSS, Google Trends 후보 같은 외부 source를 직접 호출하지 않으므로 CloudFront CSP를 넓히지 않는다.
외부 source 호출은 병렬로 수행하고 source별 실패는 전체 API 실패가 아니라 `sourceStatuses`의 `unavailable` 상태로 낮춰 처리한다.

비용 가드레일:

- Lambda reserved concurrency `1` 유지.
- Lambda memory `128 MB` 유지.
- Lambda timeout은 외부 source timeout을 감안해 8초로 제한.
- source별 timeout은 2.2초이며, 전체 refresh는 병렬 수집으로 8초 안에 끝나는 것을 목표로 한다.
- DynamoDB capacity `1 RCU / 1 WCU` 유지.
- API Gateway throttling `1 req/sec`, burst `5` 유지.
- `infra/scripts/verify-template.mjs`가 Trend Lens route, EventBridge Rule, TTL, timeout을 검증한다.
