# Pineflow Agent Guide

이 문서는 Codex 같은 LLM 기반 코드 수정 에이전트가 Pineflow를 이어서 작업할 때 반드시 먼저 읽어야 하는 작업 지침이다. 이 저장소에서 코드를 변경할 때는 기능 구현보다 아래 설계 원칙 보존을 우선한다.

## 먼저 읽을 문서

1. `docs/llm-context.md`
2. `docs/status.md`
3. `docs/serverless-implementation.md`
4. `docs/architecture.md`
5. `docs/adr/`
6. 변경하려는 영역의 `docs/modules/*.md`

## 핵심 설계 원칙

- Pineflow의 운영 본선은 AWS Serverless다. EC2 Docker/PostgreSQL 구성은 PoC이며 본선 기능을 그쪽으로 확장하지 않는다.
- 개인 사용, 관리자 생성 사용자, 낮은 비용, 보안 가드레일이 제품 기능보다 우선한다.
- Cognito self sign-up은 켜지 않는다.
- 모든 비공개 API route는 API Gateway JWT authorizer를 통과해야 한다. 현재는 `/api/health`도 JWT를 요구한다.
- GitHub에는 장기 AWS Access Key, SSH private key, DB password 같은 secret을 저장하지 않는다.
- GitHub Actions의 AWS 접근은 OIDC + IAM Role AssumeRole 방식만 사용한다.
- DynamoDB는 single-table 구조를 유지하고, 사용 패턴이 검증되기 전에는 GSI를 추가하지 않는다.
- DynamoDB capacity는 `1 RCU / 1 WCU`, Lambda concurrency는 `1`, API Gateway throttling은 `1 req/sec` burst `5`에서 시작한다.
- S3는 public access를 차단하고 CloudFront OAC로만 접근한다.
- CloudWatch log retention은 7일을 기본값으로 유지한다.
- AWS Budgets `$1`, `$3`, `$5` 알림은 배포 acceptance criteria다.

## 변경 시 필수 규칙

- 구조나 정책을 바꾸면 코드와 문서를 같은 커밋에서 함께 갱신한다.
- 설계 판단이 바뀌면 `docs/adr/`에 ADR을 추가하거나 기존 ADR의 상태를 명확히 갱신한다.
- API contract가 바뀌면 `docs/api-contract.md`를 갱신한다.
- 인증, 저장소, 비용, CI/CD, 배포 흐름이 바뀌면 관련 `docs/modules/` 문서와 `docs/llm-context.md`를 갱신한다.
- AWS 리소스가 추가되면 `docs/aws-serverless-deployment-checklist.md`와 `infra/scripts/verify-template.mjs`를 같이 갱신한다.
- GitHub OIDC/IAM 권한이 바뀌면 `docs/aws-iam-oidc.md`, `infra/bootstrap/github-oidc-deploy-role.template.yaml`, ADR을 같이 갱신한다.

## 검증 명령

```powershell
$env:PATH = "C:\Program Files\nodejs;$env:PATH"
& "C:\Program Files\nodejs\npm.cmd" run build

cd infra
& "C:\Program Files\nodejs\npm.cmd" run verify
```

보안 의존성 점검:

```powershell
& "C:\Program Files\nodejs\npm.cmd" audit --audit-level=high
cd infra
& "C:\Program Files\nodejs\npm.cmd" audit --audit-level=high
```

## 변경하면 위험한 것

- `selfSignUpEnabled: true`
- JWT authorizer 없는 API route
- Lambda reserved concurrency 제거 또는 큰 값 증가
- DynamoDB on-demand 전환 또는 capacity 자동 확장 도입
- S3 static website hosting 공개
- CloudFront OAC 제거
- GitHub Secrets에 AWS Access Key 저장
- GitHub OIDC trust policy를 `main` branch 밖으로 넓힘
- WAF, Route 53, NAT Gateway, RDS, VPC Lambda, provisioned concurrency 추가
- DynamoDB table replacement가 발생하는 키 구조 변경

이 항목이 정말 필요하면 먼저 ADR을 작성하고 비용/보안/마이그레이션 계획을 문서화한 뒤 진행한다.
