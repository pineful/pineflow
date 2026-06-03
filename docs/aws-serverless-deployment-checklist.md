# AWS Serverless 배포 전 점검표

마지막 업데이트: 2026-06-03

## 생성 순서

1. AWS 계정의 Free Tier/크레딧 상태와 기본 Region을 확인한다.
2. 배포 Region은 우선 `ap-northeast-2`를 사용한다. 다른 Region을 쓰려면 GitHub `AWS_REGION` variable만 바꾼다.
3. AWS CLI로 CDK bootstrap을 1회 수행한다.
4. `docs/aws-iam-oidc.md` 절차에 따라 GitHub OIDC provider와 Pineflow 배포용 IAM Role을 만든다.
5. GitHub repository variables를 등록한다.
   - `AWS_ROLE_ARN`
   - `AWS_REGION`
   - `BUDGET_ALERT_EMAIL`
6. `infra`에서 `npm run verify`를 실행해 CDK 템플릿의 비용/보안 가드레일을 확인한다.
7. GitHub Actions `Pineflow Serverless` workflow를 수동 실행하거나 `main` push로 실행한다.
8. 배포 후 Budget 알림 이메일 구독을 승인한다.
9. Cognito User Pool에서 관리자 방식으로 사용자 1명을 생성한다.
10. CloudFront URL로 접속해 첫 로그인, 새 비밀번호 설정, 출근/퇴근 기록을 검증한다.

## 비용 관련 확인

이 프로젝트는 비용을 0원에 가깝게 유지하도록 설계했지만, AWS는 사용량/계정 상태/Region/정책 변경에 따라 과금될 수 있다. 따라서 배포 전에 아래 항목을 확인한다.

- AWS Budgets `$1`, `$3`, `$5` 알림이 생성된다.
- DynamoDB는 provisioned `1 RCU / 1 WCU`로 생성된다.
- Lambda reserved concurrency는 `1`이다.
- API Gateway throttling은 `1 req/sec`, burst `5`이다.
- CloudWatch log retention은 7일이다.
- S3 bucket은 public access가 차단된다.
- CloudFront만 S3에 접근할 수 있다.
- WAF, Route 53, custom domain, NAT Gateway, VPC Lambda, provisioned concurrency는 사용하지 않는다.
- GitHub OIDC Role 템플릿 자체는 IAM 리소스만 만들며 월 비용을 만들지 않는다.

## 배포가 만드는 리소스

- Cognito User Pool과 App Client
- DynamoDB table
- Lambda function
- API Gateway HTTP API
- S3 bucket
- CloudFront distribution과 OAC
- CloudWatch log group과 Lambda error alarm
- AWS Budgets 3개

## 문제 발생 시 중단 기준

- `npm run verify` 실패.
- Lambda runtime이 `nodejs24.x`가 아닌 값으로 합성됨.
- `npm audit --audit-level=high`에서 high 이상 취약점 발견.
- GitHub Actions가 AWS OIDC Role을 assume하지 못함.
- CDK diff에서 WAF, NAT Gateway, RDS, EC2, provisioned concurrency 같은 의도하지 않은 유료 리소스가 보임.
- Budget 알림 이메일 승인 전 실제 사용 시작.
- Cognito self sign-up이 켜져 있음.
- API route 중 JWT authorizer가 없는 route가 있음.
- `DELETE /api/records/{recordId}` route가 JWT authorizer 없이 생성됨.

## 현재 검증 결과

로컬에서 다음 검증을 통과했다.

- 루트 앱 `npm run build`
- `infra` TypeScript build
- `infra` CDK synth
- `infra` CDK 템플릿 guardrail 자동 검증
