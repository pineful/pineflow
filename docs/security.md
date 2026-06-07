# 보안 설계

마지막 업데이트: 2026-06-04

## 현재 원칙

Pineflow는 개인용 서비스지만 인터넷에 노출될 수 있으므로 private application처럼 다룬다. 운영 본선은 AWS Serverless이며, EC2 Docker/PostgreSQL 구성은 PoC로만 남긴다.

소스코드와 GitHub에는 실제 access token, DB 비밀번호, SSH key, AWS credential을 저장하지 않는다. 배포 자동화도 장기 AWS Access Key가 아니라 GitHub OIDC와 IAM Role AssumeRole만 사용한다.

## Serverless 본선 보안

- Cognito User Pool은 `selfSignUpEnabled: false`이고, 사용자는 관리자만 만든다.
- 모든 API route는 API Gateway JWT authorizer를 통과한다. `/api/health`도 public으로 열지 않는다.
- Lambda는 클라이언트가 보낸 사용자 ID를 믿지 않고 Cognito JWT claim의 `sub`만 사용해 `USER#<sub>` partition에 접근한다.
- Cognito access token과 refresh token은 브라우저 `sessionStorage`에만 저장한다. refresh token은 `localStorage`, DynamoDB, 로그, GitHub에 저장하지 않는다.
- Cognito refresh token validity는 1일이며, 열린 탭은 30분 주기와 포커스 복귀 시점에 token refresh를 시도한다.
- S3 frontend bucket은 public access block을 유지하고 CloudFront OAC로만 읽는다.
- CloudFront는 CSP, HSTS, frame deny, no-referrer 등 보안 응답 헤더를 적용한다.
- API Gateway throttling은 `1 req/sec`, burst `5`에서 시작한다.
- Lambda reserved concurrency는 `1`, memory는 `128 MB`, timeout은 8초로 유지한다.
- DynamoDB는 provisioned `1 RCU / 1 WCU`, deletion protection, `RETAIN` 정책을 유지한다.
- CloudWatch log retention은 7일이다.
- AWS Budgets `$1`, `$3`, `$5` 알림을 유지한다.

## Serverless API 보안

- Lambda 요청 body는 4KB로 제한한다.
- 요청 body는 JSON object만 허용한다.
- 업무 모드는 allowlist인 `focus`, `remote`, `study`, `project`만 허용한다.
- 메모는 서버에서 300자로 자른다.
- 목표 시간은 120분 이상 720분 이하 정수만 허용한다.
- 기록 시간 보정은 1년 전부터 현재 5분 뒤까지만 허용한다.
- record id가 잘못 인코딩되었거나 형식이 맞지 않으면 `400`으로 응답한다.
- 예상하지 못한 서버 오류는 내부 세부 정보를 노출하지 않고 `Unexpected server error.`로 응답한다.
- Lambda 응답은 자체 wildcard CORS를 쓰지 않는다. 브라우저 CORS는 API Gateway의 CloudFront origin 제한 설정에 맡긴다.

## GitHub와 AWS credential

현재 CI/CD는 GitHub Actions가 AWS API를 호출하지만, 장기 AWS Access Key를 GitHub Secrets에 저장하지 않는다.

배포 흐름:

- GitHub Actions가 `id-token: write` 권한으로 GitHub OIDC token을 받는다.
- AWS IAM Role trust policy는 `aud = sts.amazonaws.com`과 `sub = repo:pineful/pineflow:ref:refs/heads/main`을 요구한다.
- CloudFormation-managed resource 변경 권한은 `aws:CalledVia = cloudformation.amazonaws.com` 조건으로 제한한다.
- CDK bootstrap CloudFormation execution role에 대한 `iam:PassRole`은 해당 role ARN과 `iam:PassedToService = cloudformation.amazonaws.com` 조건으로 제한한다.
- GitHub OIDC Role에는 `AdministratorAccess`를 붙이지 않는다.

권한을 넓혀야 한다면 먼저 ADR에 이유, 범위, 비용/보안 영향을 기록한다.

## Secret 관리

커밋하면 안 되는 값:

- `.env`
- `.env.local`
- `.env.production`
- AWS access key와 secret access key
- EC2 SSH private key
- GitHub token
- PostgreSQL 실제 비밀번호
- Cognito 임시/영구 비밀번호
- PoC용 `PINEFLOW_ACCESS_TOKEN`
- PoC용 `PINEFLOW_OWNER_KEY`

현재 `.gitignore`는 운영 환경 파일을 제외한다. 예시는 `.env.example`, `.env.production.example`만 커밋하며, 예시 값은 실제 secret으로 쓰지 않는다.

## 레거시 PoC 주의사항

`server/`, `Dockerfile`, `docker-compose.yml`, `compose.prod.yml`, `compose.deploy.yml`은 EC2 Docker/PostgreSQL PoC를 위해 남아 있다. 새 기능은 이 경로로 확장하지 않는다.

PoC 서버는 `PINEFLOW_ACCESS_TOKEN`과 `PINEFLOW_OWNER_KEY`를 환경 변수로 요구하는 단일 사용자 access key 모델이다. 이 방식은 Serverless 본선의 Cognito 인증보다 약하므로 운영 본선으로 되돌리지 않는다.

로컬 PostgreSQL용 `docker-compose.yml`은 `127.0.0.1:5432:5432`에만 바인딩하고, `POSTGRES_PASSWORD`를 명시적으로 설정하지 않으면 시작하지 않게 둔다. 서버에서 PoC compose를 사용할 경우에도 `5432`는 외부에 열지 않는다.

## GitHub secret scanning

repository 설정에서 확인할 항목:

- Secret scanning 활성화
- Push protection 활성화
- Dependabot alert 확인

GitHub public repository는 secret scanning과 push protection의 도움을 받을 수 있다. 그래도 LLM 에이전트는 secret처럼 보이는 값을 발견하면 커밋하지 말고 즉시 작업을 멈춰야 한다.

## 운영 보안 체크리스트

- Cognito self sign-up이 꺼져 있는지 확인한다.
- Budget 알림 이메일 구독을 승인한다.
- GitHub repository variables에는 OIDC Role ARN, region, Budget email 같은 비밀이 아닌 설정만 둔다.
- GitHub Secrets에 AWS Access Key, SSH private key, DB password를 넣지 않는다.
- CloudFront distribution과 S3 OAC가 유지되는지 확인한다.
- S3 bucket public access block이 유지되는지 확인한다.
- CloudWatch log retention이 7일인지 확인한다.
- `/api/usage`가 Cost Explorer를 호출하지 않는지 확인한다.
- 배포 전후로 GitHub Actions log와 Lambda log에 secret이 출력되지 않는지 확인한다.
## Trend Lens 보안 기준

추가일: 2026-06-07

Trend Lens는 외부 정보를 수집하지만, 브라우저가 외부 source를 직접 호출하지 않는다. 모든 조회와 수동 갱신은 Cognito JWT가 필요한 Pineflow API 뒤에 둔다.

주요 기준:

- `GET /api/trend-lens`는 DynamoDB 캐시만 읽는다.
- `POST /api/trend-lens/refresh`는 `scope=all|security` enum만 받는다.
- 사용자가 입력한 URL, host, query, keyword로 Lambda가 fetch하지 않는다.
- Lambda source allowlist는 exact host와 path prefix로 제한한다.
- redirect는 최대 1회만 허용하며 redirect 후에도 allowlist를 다시 검증한다.
- RSS는 DTD/entity 선언을 거부하고 `item/title/link/pubDate/description`만 제한적으로 읽는다.
- source별 응답 크기는 기본 512KB 이하, timeout은 기본 2.2초 이하.
- CISA KEV 공식 JSON은 실제 응답이 1.5MB 안팎이므로 `cisa-kev` 소스에만 2MB 응답 한도와 4.5초 timeout 예외를 둔다.
- 전체 refresh는 allowlist source를 병렬로 호출하되, source별 실패는 전체 API 실패가 아니라 source status로 낮춰 처리한다.
- Trend Lens snapshot은 저장 전에 제목, 요약, source 상태 메시지, reason tag를 짧게 압축한다.
- 원문 전문, 이미지, transcript, paywall content는 저장하지 않는다.
- Lambda 로그에는 source body나 기사 내용을 기록하지 않는다.
- API key가 필요하면 SSM Parameter Store Standard `SecureString`을 우선하고, GitHub Secrets/Variables, Lambda 평문 env, DynamoDB에는 저장하지 않는다.
