# LLM 작업 컨텍스트

마지막 업데이트: 2026-05-21

## 목적

이 문서는 새 대화, 새 메모리, 새 작업 환경에서 Pineflow를 이어받는 LLM 에이전트가 기존 설계 사상을 잃지 않고 코드 수정을 하기 위한 출발점이다.

## 제품 정체성

Pineflow는 회사에 속해 있지 않은 개인도 자신의 출근, 퇴근, 집중 시간, 하루 리듬을 기록할 수 있게 하는 모바일 우선 서비스다. 이름은 사용자의 `pineful` 아이디 발음감과 하루 흐름이라는 의미를 결합해 정했다.

이 제품은 많은 사용자를 받는 공개 SaaS가 아니라, 우선 1인 개인 사용을 전제로 한다. 따라서 기능 확장보다 비용 방어, 비공개 접근, 데이터 지속성이 더 중요하다.

## 현재 아키텍처 판단

기존 EC2 Docker/PostgreSQL 구성은 PoC다. 본선 운영 목표는 AWS Serverless다.

본선 구성:

- Frontend: React/Vite, S3, CloudFront
- Auth: Cognito User Pool, 관리자 생성 사용자만 허용
- API: API Gateway HTTP API, JWT authorizer 필수
- Compute: Lambda Node.js
- Database: DynamoDB single-table
- IaC: AWS CDK TypeScript
- CI/CD: GitHub Actions + GitHub OIDC + AWS IAM Role

## 왜 Serverless인가

서버를 항상 켜두는 EC2 방식은 개인 사용 서비스에 비해 관리 비용과 노출면이 크다. Serverless는 사용량이 없을 때 비용을 낮게 유지하기 쉽고, API Gateway/Lambda/DynamoDB/Cognito/S3/CloudFront 조합으로 개인 규모 서비스를 운영하기에 충분하다.

다만 AWS Free Tier는 절대 0원 보장이 아니다. 모든 변경은 “비용이 예상보다 커질 수 있는가”를 먼저 검토해야 한다.

## 보안 불변 조건

- Cognito self sign-up 비활성화.
- 사용자는 관리자만 생성.
- 모든 API route는 JWT authorizer 적용.
- Lambda는 JWT claim의 `sub`만 신뢰하고, 클라이언트가 보낸 사용자 ID를 신뢰하지 않는다.
- 브라우저에는 API access token만 `sessionStorage`에 저장한다.
- GitHub에 장기 AWS Access Key, SSH private key, DB secret을 저장하지 않는다.
- CI/CD의 AWS 접근은 OIDC 기반 IAM Role assume만 허용한다.
- CloudFront는 CSP와 보안 응답 헤더를 유지한다.

## 비용 불변 조건

- API Gateway throttling: `1 req/sec`, burst `5`.
- Lambda reserved concurrency: `1`.
- Lambda memory: `128 MB`.
- DynamoDB provisioned capacity: `1 RCU / 1 WCU`.
- CloudWatch log retention: 7일.
- AWS Budgets: `$1`, `$3`, `$5`.
- S3 public access block.
- CloudFront OAC 유지.

비용을 증가시킬 수 있는 WAF, Route 53, NAT Gateway, RDS, VPC Lambda, provisioned concurrency, DynamoDB on-demand, GSI 추가는 기본적으로 금지한다. 필요하면 ADR이 먼저다.

## 데이터 모델

DynamoDB single-table:

- `pk = USER#<cognito-sub>`
- `sk = SETTINGS`
- `sk = ACTIVE_SESSION`
- `sk = SESSION#<ISO 시간>#<session-id>`

핵심 접근 패턴:

- 사용자 설정 조회: `pk`, `sk=SETTINGS`
- 활성 세션 조회: `pk`, `sk=ACTIVE_SESSION`
- 최근 기록 조회: `pk`, `begins_with(sk, SESSION#)`, 역순

GSI는 아직 만들지 않는다. 검색/통계 기능이 필요해지면 먼저 access pattern과 비용 영향을 문서화한다.

## API 요약

정확한 계약은 `docs/api-contract.md`를 따른다.

- `GET /api/health`
- `GET /api/state`
- `POST /api/check-in`
- `POST /api/check-out`
- `PATCH /api/settings`

현재 모든 route는 JWT가 필요하다.

## 변경 작업 절차

1. `AGENTS.md`와 이 문서를 먼저 읽는다.
2. 변경 영역의 모듈 문서를 읽는다.
3. 코드 변경 전에 기존 guardrail을 깨는지 확인한다.
4. 코드 변경 후 관련 문서를 갱신한다.
5. `npm run build`와 `infra`의 `npm run verify`를 실행한다.
6. API, 인증, 비용, 저장소, CI/CD 결정이 바뀌면 ADR을 남긴다.

## 문서 갱신 매핑

- API 변경: `docs/api-contract.md`
- 인증 변경: `docs/modules/serverless-auth.md`, `docs/adr/`
- DynamoDB 변경: `docs/modules/serverless-storage.md`, `docs/data-management.md`, `docs/adr/`
- AWS 리소스 변경: `docs/serverless-implementation.md`, `docs/aws-serverless-deployment-checklist.md`, `infra/scripts/verify-template.mjs`
- 비용 정책 변경: `docs/cost-guardrails.md`, `docs/adr/`
- CI/CD 변경: `docs/cicd.md`, `.github/workflows/serverless.yml`
- GitHub OIDC/IAM 변경: `docs/aws-iam-oidc.md`, `infra/bootstrap/github-oidc-deploy-role.template.yaml`, `docs/adr/`
- 제품/브랜드 변경: `docs/product-plan.md`, `docs/brand.md`, `docs/modules/branding.md`
- 날씨 정보 변경: `docs/modules/weather.md`, `src/App.tsx`, `infra/lib/pineflow-serverless-stack.ts`

## 현재 주의사항

- `infra` npm audit에는 CDK 도구 체인의 moderate `brace-expansion` transitive issue가 남아 있다. Lambda asset에는 포함되지 않는다.
- 실제 AWS 배포 전 Budget 알림 이메일 구독을 승인해야 한다.
- 배포 후 첫 사용자는 Cognito에서 관리자가 생성해야 한다.
- 날씨 카드는 Open-Meteo와 BigDataCloud 공개 API를 브라우저에서 직접 호출한다. 위치 좌표는 Pineflow 서버에 저장하지 않는다. BigDataCloud reverse geocoding은 브라우저 위치 권한으로 얻은 현재 좌표에만 사용하고, fallback 좌표에는 사용하지 않는다.
- 로그인 후 로그아웃, 계정 표시, 향후 계정 기능은 상단 계정 메뉴를 확장하는 방향을 유지한다.
