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
- GitHub OIDC 배포 Role CloudFormation 템플릿과 IAM 설정 문서를 추가했습니다.
- `infra` 검증 스크립트가 GitHub OIDC trust policy 범위와 `AdministratorAccess` 금지를 함께 확인하도록 보강했습니다.
- GitHub Actions의 Node.js 20 deprecation warning을 제거하기 위해 공식 actions를 Node 24 대응 major 버전으로 갱신했습니다.
- CDK 배포 중 CloudFormation execution role을 전달할 수 있도록 GitHub OIDC Role에 제한된 `iam:PassRole` 권한을 추가했습니다.
- CDK가 배포 진행 상황을 읽을 수 있도록 GitHub OIDC Role에 `cloudformation:DescribeStackEvents` 조회 권한을 추가했습니다.
- 사용자 화면에서 네이밍 메모와 내부 시스템명을 제거하고, 오늘 날씨 카드를 추가했습니다.
- 날씨 정보 모듈 문서를 추가하고 CloudFront CSP에 Open-Meteo 연결 허용을 반영했습니다.

## 2026-05-21

- 날씨 위치 표시를 도시 단위보다 세밀한 행정/생활권 표시로 보강했습니다.
- 오늘 날씨 카드에 앞으로 2일의 3시간 간격 시간대별 날씨 흐름을 추가했습니다.
- 브라우저 favicon용 Pineflow 아이콘을 추가했습니다.
- 파인애플 로고를 더 귀여운 동물형 캐릭터 방향으로 수정했습니다.
- CloudFront CSP와 guardrail 검증에 reverse geocoding API 도메인을 반영했습니다.
- 시간대별 날씨에 온도 선 그래프, 강수 막대, 상태 아이콘을 추가했습니다.
- 독립 로그아웃 링크를 상단 계정 메뉴로 이동하고, 로그인한 계정 표시와 향후 계정 기능 확장 자리를 추가했습니다.
