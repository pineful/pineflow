# 진행 상황

마지막 업데이트: 2026-05-20

## 현재 상태 요약

Pineflow는 기존 EC2 Docker/PostgreSQL PoC를 유지하면서, 실제 운영 기준을 AWS Serverless 구조로 전환하는 중입니다. 이번 단계에서는 CDK 인프라 코드, Cognito 기반 로그인, DynamoDB 기반 Lambda API, S3/CloudFront 배포 흐름, GitHub OIDC 기반 CI/CD 초안을 추가했습니다.

## 완료됨

- 제품명 `Pineflow` 확정.
- 모바일 우선 출퇴근 기록 UI 구현.
- EC2 Docker/PostgreSQL PoC 구현.
- PoC용 보안 헤더, access token, DB 백업/복구 문서화.
- AWS Serverless Free Tier 전환 계획 작성.
- CDK 기반 Serverless 인프라 프로젝트 추가.
- Cognito self sign-up 비활성화와 관리자 생성 사용자 정책 반영.
- API Gateway JWT authorizer 적용.
- Lambda reserved concurrency `1` 적용.
- DynamoDB provisioned `1 RCU / 1 WCU` 적용.
- CloudWatch log retention 7일 적용.
- AWS Budgets `$1`, `$3`, `$5` 알림 리소스 추가.
- S3 public access block과 CloudFront OAC 적용.
- 프론트엔드 access key 화면을 Cognito 로그인 화면으로 전환.
- GitHub Actions Serverless workflow 추가.

## 검증됨

- `infra` TypeScript build 성공.
- `infra` CDK synth 성공.
- CDK synth 결과에서 주요 보안/비용 가드레일 확인.

## 아직 남은 일

- 루트 앱 빌드 재검증.
- AWS 계정에서 CDK bootstrap 수행.
- GitHub OIDC용 AWS IAM Role 생성.
- GitHub repository variables 등록.
- 실제 AWS 배포 후 Cognito 로그인, API 호출, S3/CloudFront 프론트 배포 검증.
- DynamoDB export/import 백업 절차 구현.
- 실제 사용 후 CloudWatch 지표 기반 throttling/capacity 조정.

## 현재 CI/CD 방향

Serverless workflow는 장기 AWS Access Key를 GitHub에 저장하지 않습니다. GitHub OIDC로 AWS IAM Role을 assume하고, CDK 배포 후 stack output을 사용해 프론트엔드를 빌드한 뒤 S3와 CloudFront에 반영합니다.
