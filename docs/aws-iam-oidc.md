# GitHub OIDC IAM Role

마지막 업데이트: 2026-05-20

## 목적

Pineflow CI/CD는 GitHub에 장기 AWS Access Key를 저장하지 않는다. GitHub Actions는 OIDC 토큰으로 AWS IAM Role을 임시 assume하고, 그 세션으로 CDK 배포와 프론트엔드 S3/CloudFront 반영을 수행한다.

## 제공 파일

템플릿:

```text
infra/bootstrap/github-oidc-deploy-role.template.yaml
```

이 템플릿은 IAM OIDC Provider와 GitHub Actions용 IAM Role을 만든다. IAM 리소스 자체는 월 비용을 만들지 않는다.

## 생성 전제

- GitHub repository: `pineful/pineflow`
- 배포 branch: `main`
- GitHub Actions workflow: `.github/workflows/serverless.yml`
- CDK stack name: `PineflowServerlessStack`

## 생성 명령 예시

AWS CLI가 준비된 로컬 터미널에서 실행한다.

```powershell
aws cloudformation deploy `
  --stack-name pineflow-github-oidc `
  --template-file infra/bootstrap/github-oidc-deploy-role.template.yaml `
  --capabilities CAPABILITY_NAMED_IAM `
  --parameter-overrides GitHubOrg=pineful GitHubRepo=pineflow GitHubBranch=main
```

생성 후 Role ARN을 확인한다.

```powershell
aws cloudformation describe-stacks `
  --stack-name pineflow-github-oidc `
  --query "Stacks[0].Outputs[?OutputKey=='RoleArn'].OutputValue" `
  --output text
```

이 값을 GitHub repository variable `AWS_ROLE_ARN`에 등록한다.

## GitHub variables

GitHub repository settings에서 다음 variables를 등록한다.

- `AWS_ROLE_ARN`: CloudFormation output `RoleArn`
- `AWS_REGION`: 예: `ap-northeast-2`
- `BUDGET_ALERT_EMAIL`: Budget 알림을 받을 이메일

Secrets가 아니라 Variables를 사용한다. 이 값들은 secret 자체가 아니다.

## 권한 설계

Role trust policy는 다음 조건을 강제한다.

- audience: `sts.amazonaws.com`
- subject: `repo:pineful/pineflow:ref:refs/heads/main`

즉 다른 repository, fork, pull request, 다른 branch에서는 assume할 수 없다.

권한 policy는 두 부분으로 나눈다.

- GitHub Actions가 직접 수행하는 작업:
  - CDK asset bucket 접근
  - frontend S3 sync
  - CloudFront invalidation
  - CDK/CloudFormation 조회
- CloudFormation을 통해서만 수행되어야 하는 작업:
  - IAM role 생성/수정
  - Lambda/API Gateway/Cognito/DynamoDB/S3/CloudFront/Budgets 리소스 생성/수정

CloudFormation-managed resource change statement에는 `aws:CalledVia = cloudformation.amazonaws.com` 조건을 둔다.

## 비용 검증

이 템플릿이 직접 만드는 리소스:

- IAM OIDC Provider
- IAM Role
- IAM inline policy

위 리소스는 월 비용을 만들지 않는다.

주의할 점:

- 이 Role을 사용해 `PineflowServerlessStack`을 배포하면 실제 AWS 리소스가 생성된다.
- 배포 전 `infra`에서 `npm run verify`를 실행한다.
- 배포 후 Budget 알림 이메일 구독을 승인하기 전에는 실제 사용을 시작하지 않는다.

## 공식 기준

이 문서는 다음 공식 문서의 보안 기준을 Pineflow에 맞게 고정한 것이다.

- GitHub Docs: `https://docs.github.com/en/actions/how-tos/secure-your-work/security-harden-deployments/oidc-in-aws`
- AWS IAM Docs: `https://docs.aws.amazon.com/IAM/latest/UserGuide/id_roles_create_for-idp_oidc.html`

핵심 기준은 `aud = sts.amazonaws.com`을 확인하고, `token.actions.githubusercontent.com:sub`를 `repo:pineful/pineflow:ref:refs/heads/main`으로 좁히는 것이다.

## 변경 금지

LLM 에이전트는 아래 변경을 임의로 하지 않는다.

- trust subject를 `repo:pineful/pineflow:*`처럼 넓히기
- pull request나 모든 branch에서 deploy 가능하게 만들기
- GitHub Secrets에 AWS Access Key를 등록하는 방식으로 회귀하기
- Role에 `AdministratorAccess`를 붙이기

권한 추가가 필요하면 먼저 `docs/adr/`에 이유와 범위를 기록한다.
