# Serverless 구현 현황

마지막 업데이트: 2026-05-24

## 이번 단계의 목표

Pineflow의 운영 기준을 EC2 Docker PoC에서 AWS Serverless 구조로 옮기기 위한 실제 코드 기반을 만들었다. 이 단계의 핵심은 배포 전에 반드시 필요한 보안/비용 가드레일을 인프라 코드에 고정하고, 프론트엔드가 Cognito 로그인 기반으로 API를 호출할 수 있게 만드는 것이다.

## 추가된 구성

- `infra/`: AWS CDK TypeScript 프로젝트.
- `infra/lib/pineflow-serverless-stack.ts`: Cognito, API Gateway, Lambda, DynamoDB, S3, CloudFront, Budgets 정의.
- `infra/lambda/pineflow-api/index.mjs`: Serverless API 핸들러.
- `.github/workflows/serverless.yml`: GitHub OIDC 기반 Serverless 검증/배포 workflow.
- `src/auth.ts`: Cognito 로그인과 첫 로그인 비밀번호 변경 처리.
- `src/App.tsx`: access key 입력 화면을 Cognito 로그인 화면으로 전환.
- `infra/scripts/verify-template.mjs`: CDK 출력 템플릿의 비용/보안 가드레일 자동 검증.

Lambda 코드는 Node.js 20 Lambda 런타임에 포함된 AWS SDK for JavaScript v3를 사용한다. 따라서 Lambda asset에는 별도 `node_modules`를 포함하지 않는다.

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
- dependency audit 기준 애플리케이션에는 취약점이 없고, `infra`에는 high 이상 취약점이 없다. `infra`의 moderate `brace-expansion` 이슈는 CDK 도구 체인의 transitive dependency이며 Lambda 배포 asset에는 포함되지 않는다.

## 비용 가드레일

- API Gateway throttling: rate `1 req/sec`, burst `5`.
- Lambda reserved concurrency: `1`.
- DynamoDB provisioned capacity: `1 RCU / 1 WCU`.
- CloudWatch log retention: 7일.
- AWS Budgets: 월 $1, $3, $5 알림.
- S3 public access block 적용.
- CloudFront OAC로만 S3 object 접근 허용.

## 데이터 설계

DynamoDB single-table 구조를 사용한다.

- `pk`: `USER#<cognito-sub>`
- `sk`: `SETTINGS`, `ACTIVE_SESSION`, `SESSION#<iso-time>#<session-id>`

이 구조는 사용자별 최근 기록 조회, 현재 활성 세션 조회, 설정 조회를 단순한 key 기반 접근으로 처리하기 위해 선택했다. 초기 버전에서는 GSI를 만들지 않는다. 사용량이 적은 개인 서비스이므로 불필요한 capacity 축을 늘리지 않는 편이 비용 방어에 유리하다.

기록 시간 보정은 최근 세션 query 결과에서 `sessionId`를 찾아 처리한다. 퇴근 시각은 item update로 끝나지만, 출근 시각은 최근 기록 정렬 기준이므로 `SESSION#<iso-time>#<session-id>` 정렬 키를 새 시간으로 옮긴다. 이 이동은 delete/put transaction으로 처리하고, 활성 세션이면 `ACTIVE_SESSION.sessionSk`도 같이 갱신한다.

## 배포 흐름

1. GitHub Actions가 앱과 인프라를 검증한다.
2. `main` branch에서 AWS OIDC 설정이 준비되어 있으면 CDK stack을 배포한다.
3. CDK output에서 API endpoint, Cognito 정보, S3 bucket, CloudFront distribution id를 읽는다.
4. 그 값을 Vite 환경변수로 넣어 프론트엔드를 빌드한다.
5. `dist/`를 S3에 업로드한다.
6. CloudFront cache를 invalidation 한다.

## 아직 남은 작업

- AWS 계정에서 CDK bootstrap 수행.
- GitHub OIDC용 AWS IAM Role 생성.
- GitHub repository variables 등록.
- Cognito 관리자 생성 사용자로 실제 로그인 검증.
- DynamoDB export/import 운영 절차 구체화.
- 실제 AWS 배포 후 CloudWatch 지표와 Budget 알림 수신 검증.

## 관련 점검 문서

- AWS 배포 전 점검표: `docs/aws-serverless-deployment-checklist.md`
- LLM 작업 컨텍스트: `AGENTS.md`, `docs/llm-context.md`
- API 계약: `docs/api-contract.md`
- 비용 가드레일: `docs/cost-guardrails.md`
- 설계 결정 기록: `docs/adr/`
