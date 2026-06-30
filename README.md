# Pineflow

Pineflow는 회사에 속해 있지 않아도 개인의 출근, 퇴근, 집중 시간을 기록할 수 있는 모바일 우선 출퇴근 기록 서비스입니다.

기존 EC2 Docker/PostgreSQL 구성은 PoC로 유지합니다. 실제 운영 기준은 AWS Free Tier를 최대한 벗어나지 않는 Serverless 구조이며, 관련 설계는 `docs/serverless-plan.md`와 `docs/serverless-implementation.md`에 정리합니다.

## 로컬 실행

> Linux(예: Claude Code on the web)에서는 아래 PowerShell 명령 대신 `npm install`,
> `npm run dev`, `npm run build`를 그대로 쓴다. `NODE_OPTIONS=--use-system-ca`는
> Windows 전용이라 불필요하다. OS별 명령 대조는 `docs/development.md`와
> `docs/agent-collaboration.md`를 본다.

Windows 환경에서는 npm registry 접근 시 Node가 Windows 시스템 인증서 저장소를 사용하도록 설정합니다.

```powershell
$env:NODE_OPTIONS='--use-system-ca'
& "C:\Program Files\nodejs\npm.cmd" install
& "C:\Program Files\nodejs\npm.cmd" run dev
```

PoC API를 로컬에서 쓰려면 별도 터미널에서 PostgreSQL과 API도 실행합니다.

```powershell
docker compose up -d postgres
& "C:\Program Files\nodejs\npm.cmd" run api
```

## 빌드

```powershell
$env:NODE_OPTIONS='--use-system-ca'
& "C:\Program Files\nodejs\npm.cmd" run build
```

## Serverless 인프라 검증

```powershell
cd infra
$env:NODE_OPTIONS='--use-system-ca'
& "C:\Program Files\nodejs\npm.cmd" install
& "C:\Program Files\nodejs\npm.cmd" run build
& "C:\Program Files\nodejs\npm.cmd" run synth
& "C:\Program Files\nodejs\npm.cmd" run verify
```

## CI/CD

Serverless 운영 배포는 GitHub OIDC와 AWS IAM Role을 사용합니다. 장기 AWS Access Key를 GitHub Secrets에 저장하지 않습니다.

배포 workflow는 CDK stack을 배포한 뒤 output을 사용해 프론트엔드를 빌드하고 S3/CloudFront에 반영합니다.

기존 Docker image workflow는 PoC 수동 실행용으로 남겨두었습니다.

## 문서

- LLM 작업 컨텍스트: `AGENTS.md`, `CLAUDE.md`, `docs/llm-context.md`
- 에이전트 협업/교차 검증 규칙: `docs/agent-collaboration.md`
- 진행 상황: `docs/status.md`
- 제품 계획: `docs/product-plan.md`
- 아키텍처: `docs/architecture.md`
- 브랜드: `docs/brand.md`
- API 계약: `docs/api-contract.md`
- 비용 가드레일: `docs/cost-guardrails.md`
- 설계 결정 기록: `docs/adr/`
- 모듈 설계: `docs/modules/`
- 변경 기록: `docs/change-log.md`
- AWS 배포/운영: `docs/deployment-aws.md`
- Serverless 배포 인계서: `docs/serverless-deployment-handoff.md`
- CI/CD: `docs/cicd.md`
- 보안: `docs/security.md`
- 데이터 백업/마이그레이션: `docs/data-management.md`
- Serverless 전환 계획: `docs/serverless-plan.md`
- Serverless 구현 현황: `docs/serverless-implementation.md`
- AWS Serverless 배포 전 점검표: `docs/aws-serverless-deployment-checklist.md`
- GitHub OIDC IAM Role: `docs/aws-iam-oidc.md`

기능이나 구조가 변경될 때는 관련 모듈 문서와 변경 기록을 함께 갱신합니다.
