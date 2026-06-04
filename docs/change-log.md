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
- 기록 설정을 모드 선택 중심에서 이번 기록에 남길 내용 중심으로 재구성하고, 모드별 빠른 메모 후보를 추가했습니다.
- 기록 설정의 의미를 `이번 기록 내용`으로 단순화하고, 활성 세션 중에는 종류/메모/시작 시간 요약만 보여주도록 정리했습니다.

## 2026-05-24

- 로그인된 탭을 오래 두어 access token이 만료된 경우 세션을 정리하고 로그인 화면으로 되돌리는 처리를 추가했습니다.
- 출근/퇴근 전 기록 종류, 빠른 메모, 직접 메모 입력을 상단 CTA 근처로 이동했습니다.
- 최근 기록을 상단 패널 바로 아래에 배치해 기록 직후 확인과 수정 접근성을 높였습니다.
- 출근/퇴근 버튼 연타로 인한 중복 요청을 막기 위해 프론트 요청 잠금과 성공 직후 쿨다운을 추가했습니다.
- 잘못 누른 기록의 출근/퇴근 시각을 보정하는 API와 최근 기록 인라인 수정 UI를 추가했습니다.
- 오늘 요약의 목표 시간 슬라이더를 기본 화면에서 숨기고, `목표 수정`을 눌렀을 때만 열리도록 정리했습니다.
- 오늘 누적 시간을 목표 대비 흐름 그래프 카드로 표현하고, 진행 영역과 곡선에 은은한 움직임을 추가했습니다.

## 2026-05-29

- 날씨 영역에 `Forecast Ribbon` 디자인 철학을 추가하고, 5일 예보 그래프와 시간대별 카드를 하나의 가로 스크롤 시간축으로 통합했습니다.
- 분야별 병렬 작업을 위해 `docs/workstreams.md` 작업 지도를 추가하고, AGENTS/아키텍처/CI 문서를 Serverless 본선 기준으로 정리했습니다.
- AWS Lambda Node.js 20.x EOL 알림에 대응해 CDK Lambda runtime을 `nodejs24.x`로 업그레이드하고, guardrail 검증에 런타임 확인을 추가했습니다.
- 날씨 위치명이 영문 동명이나 불명확한 행정구역으로 섞여 보이지 않도록 현재 위치 표시 기준을 보강했습니다.
- 최근 기록 목록에서 업무 메모가 업무 유형 아이콘과 함께 바로 보이도록 개선했습니다.
- 작은 헤더 로고와 favicon에서 파인애플 몸통에 골드 실루엣을 추가하고, 상단 잎을 곡선형 leafy crown으로 다듬어 머리카락처럼 보이는 문제를 줄였습니다.
- 로고의 흐름선을 파인애플 몸통과 분리된 토성 고리형 타원 화살표로 바꿔 하루 흐름과 루틴의 방향성을 더 명확하게 했습니다.
- 작은 아이콘에서도 흐름선이 보이도록 로고 고리를 뒤/앞 레이어와 하이라이트로 나눈 `Saturn Flow Ring` 형태로 보강했습니다.
- 읽기 전용 UI에서 마우스를 올리거나 클릭했을 때 텍스트 입력 caret이 나타나지 않도록 커서 스타일을 정리했습니다.

## 2026-06-03

- 오늘 요약 계산이 `state.records` 원본 배열을 직접 정렬해 최근 기록 순서를 뒤흔들 수 있던 문제를 수정했습니다.
- 오늘 누적 계산이 서로 다른 세션의 출근/퇴근을 단순 시간순으로 잘못 짝짓지 않도록 세션 id 기준으로 계산하게 했습니다.
- Serverless API가 최근 기록을 세션 시작일 기준이 아니라 각 출근/퇴근 이벤트 timestamp 기준 최신순으로 반환하도록 수정했습니다.
- 기록 수정 저장 시 변경된 필드만 PATCH하도록 바꿔, 업무 유형이나 메모만 수정할 때 오래된 timestamp가 다시 저장되지 않게 했습니다.
- 기록 수정 패널에서 선택 날짜가 오늘이 아닐 때 경고와 `오늘 현재로` 빠른 보정 버튼을 보여주도록 했습니다.
- 잘못 생성된 기록을 정리할 수 있도록 세션 전체 삭제 API와 최근 기록 카드의 삭제 확인 UI를 추가했습니다.

## 2026-06-04

- 그룹웨어 UI 리서치와 세 팀 분석 결과를 바탕으로 컨트롤 외곽 기준을 `Structured Soft Rectangle`으로 정리했습니다.
- 버튼, 입력 필드, 선택 컨트롤, 보조 실행, 주요 실행, 위험 실행의 radius, border, focus ring 위계를 분리했습니다.
- 계정 메뉴의 로그아웃과 최근 기록 삭제 버튼을 일반 보조 버튼과 다른 danger 문법으로 정리했습니다.
- `docs/modules/ui-controls.md`와 `docs/research/groupware-control-shape-2026-06-04.md`를 추가해 이후 LLM 작업자가 같은 설계 기준을 이어갈 수 있게 했습니다.
