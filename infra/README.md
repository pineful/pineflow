# Pineflow Serverless 인프라

이 디렉터리는 Pineflow의 새 운영 기준인 AWS Serverless 구성을 CDK로 정의합니다. 기존 EC2 Docker/PostgreSQL 구성은 PoC로 유지하고, 실제 운영 전환은 이 인프라를 기준으로 진행합니다.

## 설계 원칙

- AWS Access Key를 GitHub에 저장하지 않습니다. CI/CD는 GitHub OIDC와 AWS IAM Role AssumeRole 방식으로 연결합니다.
- Cognito self sign-up은 비활성화하고, 사용자는 관리자만 생성합니다.
- 비공개 API route는 API Gateway JWT authorizer를 반드시 통과해야 합니다.
- API Gateway throttling은 `1 req/sec`, burst `5`로 낮게 시작합니다.
- Lambda reserved concurrency는 `1`로 시작합니다.
- DynamoDB는 provisioned capacity `1 RCU / 1 WCU`로 시작합니다.
- CloudWatch log retention은 7일로 제한합니다.
- AWS Budgets 알림은 `$1`, `$3`, `$5` 월간 비용 기준으로 생성합니다.
- S3 bucket public access는 차단하고, CloudFront OAC로만 접근합니다.

## 리소스 구성

- Cognito User Pool: 관리자 생성 사용자만 로그인
- API Gateway HTTP API: Cognito JWT authorizer 적용
- Lambda: Pineflow API 핸들러
- DynamoDB: 사용자별 single-table 저장소
- S3: 정적 프론트엔드 배포 bucket
- CloudFront: S3 OAC 기반 HTTPS 배포
- AWS Budgets: 낮은 비용 임계값 알림

## 로컬 검증

```powershell
cd infra
$env:NODE_OPTIONS='--use-system-ca'
& "C:\Program Files\nodejs\npm.cmd" install
& "C:\Program Files\nodejs\npm.cmd" run build
& "C:\Program Files\nodejs\npm.cmd" run synth
```

## 배포 전 준비

1. AWS 계정에서 CDK bootstrap을 1회 수행합니다.
2. GitHub OIDC를 신뢰하는 AWS IAM Role을 생성합니다.
3. GitHub repository variables에 `AWS_ROLE_ARN`, `AWS_REGION`, `BUDGET_ALERT_EMAIL`을 등록합니다.
4. `main` branch push 또는 workflow 수동 실행으로 CDK 배포를 수행합니다.

배포 이후 첫 사용자는 AWS Console 또는 AWS CLI로 Cognito User Pool에 관리자 생성 방식으로 추가합니다.
