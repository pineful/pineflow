# Pineflow Serverless 배포 인계서

마지막 업데이트: 2026-06-29

## 목적

이 문서는 Pineflow를 실제 AWS Serverless 본선에 배포하기 위해 사용자가 따라야 할
최소 절차를 한곳에 모은 인계서다. 상세 설계와 가드레일은 아래 문서를 정본으로
본다.

- `docs/aws-serverless-deployment-checklist.md`
- `docs/aws-iam-oidc.md`
- `docs/cicd.md`
- `docs/data-management.md`

배포 본선은 GitHub Actions `Pineflow Serverless` workflow다. GitHub에는 장기
AWS Access Key나 SSH private key를 저장하지 않는다.

## 배포 전 준비

준비물:

- AWS 계정과 CLI credential이 설정된 로컬 터미널.
- 배포 region: 기본 `ap-northeast-2`.
- Budget 알림을 받을 이메일 주소.
- GitHub repository admin 권한.

로컬에서 현재 AWS 계정을 확인한다.

```powershell
aws sts get-caller-identity
```

배포 전 검증을 실행한다.

```powershell
$env:PATH = "C:\Program Files\nodejs;$env:PATH"
$env:NODE_OPTIONS='--use-system-ca'
& "C:\Program Files\nodejs\npm.cmd" install
& "C:\Program Files\nodejs\npm.cmd" test
& "C:\Program Files\nodejs\npm.cmd" run build
& "C:\Program Files\nodejs\npm.cmd" audit --audit-level=high

cd infra
& "C:\Program Files\nodejs\npm.cmd" install
& "C:\Program Files\nodejs\npm.cmd" run verify
& "C:\Program Files\nodejs\npm.cmd" audit --audit-level=high
```

`infra npm run verify`가 실패하거나 CDK diff에서 WAF, NAT Gateway, RDS, EC2,
VPC Lambda, provisioned concurrency, DynamoDB on-demand/GSI 같은 의도하지 않은
리소스가 보이면 배포를 멈춘다.

## 최초 1회 AWS 준비

CDK bootstrap을 한 번 실행한다. `<account-id>`는 `aws sts get-caller-identity`
결과의 Account 값이다.

```powershell
cd infra
npx cdk bootstrap aws://<account-id>/ap-northeast-2
```

GitHub Actions가 OIDC로 assume할 IAM Role을 만든다.

```powershell
cd ..
aws cloudformation deploy `
  --stack-name pineflow-github-oidc `
  --template-file infra/bootstrap/github-oidc-deploy-role.template.yaml `
  --capabilities CAPABILITY_NAMED_IAM `
  --parameter-overrides GitHubOrg=pineful GitHubRepo=pineflow GitHubBranch=main `
  --region ap-northeast-2
```

Role ARN을 확인한다.

```powershell
aws cloudformation describe-stacks `
  --stack-name pineflow-github-oidc `
  --query "Stacks[0].Outputs[?OutputKey=='RoleArn'].OutputValue" `
  --output text `
  --region ap-northeast-2
```

GitHub repository Settings에서 다음 Repository Variables를 등록한다. Secrets가
아니라 Variables다.

- `AWS_ROLE_ARN`: 위 CloudFormation output의 Role ARN
- `AWS_REGION`: `ap-northeast-2`
- `BUDGET_ALERT_EMAIL`: Budget 알림을 받을 이메일

## 배포 실행

`main` branch에 push되면 `Pineflow Serverless` workflow가 자동 실행된다. 수동으로
실행하려면 GitHub Actions에서 `Pineflow Serverless`를 선택해
`workflow_dispatch`로 실행한다.

workflow 흐름:

1. 루트 `npm test`
2. 루트 `npm run build`
3. `infra npm run verify`
4. GitHub OIDC로 `AWS_ROLE_ARN` assume
5. `cdk deploy`
6. CDK output으로 Vite 환경 변수 구성
7. frontend 재빌드
8. S3 sync
9. CloudFront invalidation

필수 GitHub Variables가 비어 있으면 validate job만 돌고 deploy job은 skip된다.

## 배포 후 확인

CloudFormation output을 확인한다.

```powershell
aws cloudformation describe-stacks `
  --stack-name PineflowServerlessStack `
  --query "Stacks[0].Outputs" `
  --output table `
  --region ap-northeast-2
```

확인할 output:

- `FrontendDistributionDomainName`
- `ApiEndpoint`
- `UserPoolId`
- `UserPoolClientId`

Budget 알림 이메일 구독을 승인한다. AWS Budgets는 이메일 구독 확인이 끝나기 전까지
알림 수신이 보장되지 않으므로, 실제 사용 전 받은편지함에서 승인한다.

Cognito에서 관리자 생성 사용자를 만든다. 콘솔에서 생성해도 되고, CLI를 쓸 수 있다.
임시 비밀번호는 저장소나 채팅에 남기지 않는다.

```powershell
aws cognito-idp admin-create-user `
  --user-pool-id <UserPoolId> `
  --username <user-email> `
  --user-attributes Name=email,Value=<user-email> Name=email_verified,Value=true `
  --temporary-password "<temporary-password>" `
  --region ap-northeast-2
```

브라우저에서 접속한다.

```text
https://<FrontendDistributionDomainName>
```

첫 로그인에서 새 비밀번호를 설정한 뒤 다음을 확인한다.

- 로그인/로그아웃
- `/api/state` 기반 대시보드 로딩
- 출근 기록
- 퇴근 기록
- 기록 수정
- 기록 삭제
- Trend Lens 표시
- 운영 사용량 패널이 실패해도 기록 기능 오류로 보이지 않는지

## 실계정 E2E

배포 URL과 테스트 계정이 준비되면 Playwright 하니스를 실행한다. 운영 계정이 아니라
테스트 전용 Cognito 사용자를 쓴다.

```powershell
cd e2e
$env:E1_BASE_URL="https://<FrontendDistributionDomainName>"
$env:E1_USERNAME="<test-user-email>"
$env:E1_PASSWORD="<test-user-password>"
& "C:\Program Files\nodejs\npm.cmd" test
```

첫 로그인 챌린지가 필요하면 `E1_NEW_PASSWORD`도 설정한다. 기록을 실제로 만들고
지우지 않는 읽기 위주 점검은 `E1_RUN_MUTATIONS=0`을 사용한다.

## 백업

배포 전후 중요한 변경 전에는 DynamoDB 논리 백업을 남긴다.

```powershell
cd infra
& "C:\Program Files\nodejs\npm.cmd" run dynamodb:backup -- --out ../backups/pineflow-dynamodb-20260629-000000.json --profile <aws-profile> --region ap-northeast-2
& "C:\Program Files\nodejs\npm.cmd" run dynamodb:backup:validate -- --file ../backups/pineflow-dynamodb-20260629-000000.json
```

백업 파일에는 개인 기록이 들어간다. `backups/`는 `.gitignore`에 포함되어 있지만,
별도 안전한 위치로 옮기고 저장소나 PR에 첨부하지 않는다.

## 롤백

배포 후 문제가 생기면 GitHub Actions의 `Pineflow Serverless Rollback` workflow를
main 브랜치에서 실행한다. `target_ref`에는 되돌릴 정상 커밋 SHA나 태그를 넣는다.

주의:

- Actions UI의 "Use workflow from"은 main이어야 한다.
- GitHub OIDC trust policy가 main branch subject로 고정되어 있기 때문이다.
- 롤백은 코드와 인프라 템플릿을 target ref 기준으로 되돌리지만, DynamoDB 사용자
  데이터는 자동으로 과거 상태로 되돌리지 않는다.
- 데이터 구조 변경을 포함한 배포를 되돌릴 때는 `docs/data-management.md`의
  DynamoDB 백업/복구 절차를 먼저 확인한다.

## 배포 중단 기준

- `npm run build`, `npm test`, `infra npm run verify` 중 하나라도 실패.
- `npm audit --audit-level=high`에서 high 이상 취약점 발견.
- GitHub Actions가 OIDC Role assume에 실패.
- Budget 이메일 구독 승인 전 실제 사용을 시작해야 하는 상황.
- Cognito self sign-up이 켜져 있음.
- JWT authorizer 없는 API route가 생김.
- Lambda reserved concurrency `1`, memory `128MB`, timeout `8초 이하` 가드레일이 깨짐.
- DynamoDB `1 RCU / 1 WCU`, deletion protection, TTL 가드레일이 깨짐.
- S3 public access block 또는 CloudFront OAC가 제거됨.
- CloudFront CSP가 Trend Lens 외부 source를 브라우저 connect-src로 직접 허용함.
