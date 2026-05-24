# 진행 상황

마지막 업데이트: 2026-05-24

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
- 모든 API route에 JWT authorizer 적용.
- Lambda IAM 권한을 DynamoDB 최소 작업으로 축소.
- CloudFront 보안 응답 헤더와 CSP 적용.
- CDK 템플릿 guardrail 자동 검증 스크립트 추가.
- LLM 기반 후속 작업을 위한 `AGENTS.md`, `docs/llm-context.md`, API 계약, 비용 가드레일, ADR 문서 추가.
- GitHub OIDC 배포 Role 템플릿과 설정 문서 추가.
- GitHub OIDC trust policy 범위와 `AdministratorAccess` 금지를 자동 검증에 포함.
- GitHub Actions 공식 action 버전을 Node 24 대응 버전으로 갱신.
- CDK bootstrap CloudFormation execution role에 대한 제한된 PassRole 권한을 GitHub OIDC 배포 Role에 추가.
- CDK 배포 모니터링을 위한 CloudFormation stack event 조회 권한을 GitHub OIDC 배포 Role에 추가.
- 사용자 화면에서 내부 시스템명을 제거하고 오늘 날씨 카드를 추가.
- 날씨 카드에 세밀한 위치 표시와 2일 시간대별 예보 흐름을 추가.
- Pineflow 앱 아이콘과 귀여운 동물형 파인애플 로고를 추가.
- 시간대별 날씨를 온도/강수 차트와 날씨 상태 아이콘으로 보강.
- 상단 계정 메뉴에 로그인 계정 표시, 로그아웃, 향후 계정 기능 확장 영역을 추가.
- 기록 설정을 이번 기록 내용으로 재구성하고, 모드별 메모 후보와 기록 요약을 추가.
- 기록 설정을 이번 기록 내용 중심으로 단순화하고, 기록 중 화면에서 빈 입력창을 제거.
- 만료된 Cognito access token을 프론트에서 감지해 로그인 화면으로 되돌리는 흐름 추가.
- 기록 입력 영역을 출근/퇴근 CTA와 같은 상단 패널로 이동하고, 최근 기록을 바로 아래에 배치.
- 출근/퇴근 버튼 연타 방지를 위해 요청 중 잠금과 성공 직후 짧은 쿨다운을 추가.
- 최근 기록에서 잘못 누른 출근/퇴근 시간을 보정하는 `PATCH /api/records/{recordId}` API와 UI를 추가.
- 오늘 누적 시간 그래프를 로그인 후 상단 우선 정보로 이동하고, 태블릿 가로형 대시보드 배치를 추가.
- 계정 메뉴에서 켤 수 있는 선택형 효과음과 터치/팝업 중심의 작은 모션 피드백을 추가.
- 열린 탭에서 Cognito access token을 30분 주기로 refresh하고, refresh token validity를 1일로 제한.
- Chrome 암호 관리자/Windows Hello 자동 입력이 늦게 반영되는 경우를 위해 로그인 form 값을 submit 시점에 다시 읽도록 개선.
- UX/디자인 리서치 결과를 반영해 상단 그래프를 `Calm Live Board` 성격의 조용한 시간 계기판으로 보강.
- 추상 곡선이던 상단 그래프를 실제 오늘 기록 기반의 누적 면적 그래프, 현재 시각선, 목표선, 출근/퇴근 기록점으로 교체.
- 출근/퇴근/저장 성공 toast와 조작 유형별 선택형 효과음을 보강.
- 분야별 UX 재검토 결과를 반영해 상단 그래프의 자동 sweep, line draw, pulse 애니메이션을 제거.
- 시간 길이 표기에서 `07분`처럼 분 앞에 0이 붙지 않도록 수정.
- 색상 토큰을 추가하고 상단 그래프를 뉴트럴 UI, 파인 그린 진행, 작은 골드 강조 중심으로 정리.
- 동물형 파인애플 로고를 `잎 + 둥근 파인 실루엣 + 흐름 리본`으로 구성한 Pineflow Mark로 교체.

## 검증됨

- `infra` TypeScript build 성공.
- `infra` CDK synth 성공.
- CDK synth 결과에서 주요 보안/비용 가드레일 확인.
- `infra` CDK 템플릿 guardrail 자동 검증 성공.
- 루트 애플리케이션 `npm audit --audit-level=high` 취약점 없음.
- `infra` `npm audit --audit-level=high` 기준 high 이상 취약점 없음. 단, `aws-cdk-lib` 하위 개발/인프라 도구 체인에 moderate `brace-expansion` 이슈가 남아 있으며 Lambda 런타임 asset에는 포함되지 않는다.

## 아직 남은 일

- AWS 계정에서 CDK bootstrap 수행.
- GitHub OIDC용 AWS IAM Role 생성.
- GitHub repository variables 등록.
- 실제 AWS 배포 후 Cognito 로그인, API 호출, S3/CloudFront 프론트 배포 검증.
- DynamoDB export/import 백업 절차 구현.
- 실제 사용 후 CloudWatch 지표 기반 throttling/capacity 조정.
- 필요 시 기존 깨져 보이는 일부 PoC 문서의 인코딩/본문을 Serverless 본선 기준으로 재정리.

## 현재 CI/CD 방향

Serverless workflow는 장기 AWS Access Key를 GitHub에 저장하지 않습니다. GitHub OIDC로 AWS IAM Role을 assume하고, CDK 배포 후 stack output을 사용해 프론트엔드를 빌드한 뒤 S3와 CloudFront에 반영합니다.
