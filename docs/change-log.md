# 변경 기록

## 2026-05-20

- Pineflow 모바일 우선 출퇴근 기록 앱을 생성했습니다.
- 제품 계획, 아키텍처, 브랜드, 모듈 설계 문서를 추가했습니다.
- 제품명을 `Pineflow`로 확정했습니다.
- 브라우저 로컬 저장 방식에서 Express API와 PostgreSQL 저장 방식으로 전환했습니다.
- EC2 `t3.micro` 기반 Docker 배포 문서를 작성했습니다.
- GitHub Actions, GHCR, pull-based EC2 배포 구조를 설계했습니다.
- 보안 헤더, API access token, rate limit, secret 관리 문서, DB 백업/복구 계획을 추가했습니다.
- AWS Free Tier 기준 Serverless 전환 계획을 추가했습니다.
- 필수 비용/보안 가드레일 10개 항목을 acceptance criteria로 고정했습니다.
- AWS CDK 기반 `infra/` 프로젝트를 추가했습니다.
- Cognito, API Gateway, Lambda, DynamoDB, S3, CloudFront, Budgets 리소스를 코드로 정의했습니다.
- Lambda 출근/퇴근/상태/설정 API의 DynamoDB 기반 초기 구현을 추가했습니다.
- 프론트엔드 로그인 방식을 access key 입력에서 Cognito JWT 로그인으로 전환했습니다.
- Serverless GitHub Actions workflow를 추가하고, 기존 Docker image workflow는 PoC 수동 실행용으로 조정했습니다.
- Serverless 인증/저장소 모듈 설계 문서를 추가했습니다.
- Serverless endpoint 흐름과 secure coding 관점 점검 후 public health route를 제거하고 모든 API route에 JWT authorizer를 적용했습니다.
- Lambda IAM 권한을 최소 DynamoDB 작업으로 축소하고, 입력 크기/JSON 형식/조건부 충돌/예외 처리를 보완했습니다.
- CloudFront 보안 응답 헤더와 CSP를 추가했습니다.
- CDK 템플릿의 비용/보안 가드레일 자동 검증 스크립트를 추가했습니다.
- AWS Serverless 배포 전 점검표를 추가했습니다.
- 새 LLM 컨텍스트에서도 설계 사상을 계승할 수 있도록 `AGENTS.md`, `docs/llm-context.md`, `docs/api-contract.md`, `docs/cost-guardrails.md`, ADR 문서를 추가했습니다.
