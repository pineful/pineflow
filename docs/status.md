# 진행 상황

마지막 업데이트: 2026-06-06

## 현재 상태 요약

Pineflow는 기존 EC2 Docker/PostgreSQL PoC를 보존하되, 실제 운영 기준은 AWS Serverless 구조로 전환했습니다. 현재 본선은 Cognito 기반 로그인, API Gateway/Lambda/DynamoDB API, S3/CloudFront 프론트엔드, GitHub OIDC 기반 CI/CD로 배포됩니다.

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
- 분야별 병렬 작업과 후속 LLM 인계를 위한 `docs/workstreams.md` 작업 지도 추가.
- GitHub OIDC 배포 Role 템플릿과 설정 문서 추가.
- GitHub OIDC trust policy 범위와 `AdministratorAccess` 금지를 자동 검증에 포함.
- GitHub Actions 공식 action 버전을 Node 24 대응 버전으로 갱신.
- CDK bootstrap CloudFormation execution role에 대한 제한된 PassRole 권한을 GitHub OIDC 배포 Role에 추가.
- CDK 배포 모니터링을 위한 CloudFormation stack event 조회 권한을 GitHub OIDC 배포 Role에 추가.
- 사용자 화면에서 내부 시스템명을 제거하고 오늘 날씨 카드를 추가.
- 날씨 카드에 세밀한 위치 표시와 시간대별 예보 흐름을 추가.
- 날씨 영역을 `Forecast Ribbon` 철학으로 정리하고, 5일 예보 그래프와 시간대별 카드를 같은 가로 스크롤 시간축에서 함께 움직이도록 개선.
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
- 날씨 위치명이 영문 동명이나 불명확한 행정구역으로 섞여 보이지 않도록 현재 위치 fallback 표시를 보강.
- 최근 기록 목록에서 업무 메모가 업무 유형 아이콘과 함께 바로 보이도록 개선.
- 작은 헤더 로고가 사람 얼굴처럼 보이지 않도록 골드 파인애플 몸통 실루엣과 초록/골드 잎 중심으로 보강.
- 헤더 로고와 favicon의 잎 부분을 곡선형 leafy crown으로 맞춰 머리카락처럼 보이는 문제를 줄임.
- 헤더 로고와 favicon의 흐름선을 파인애플 몸통과 분리된 토성 고리형 타원 화살표로 바꿔 의미를 명확히 함.
- 작은 아이콘에서도 흐름선이 보이도록 로고 고리를 뒤/앞 레이어와 민트 하이라이트가 있는 `Saturn Flow Ring`으로 보강.
- 읽기 전용 UI 영역에서 텍스트 입력 caret이 보이지 않도록 커서/선택 스타일 기준을 정리.
- AWS Lambda Node.js 20.x EOL 알림에 대응해 API Lambda runtime을 `nodejs24.x`로 업그레이드하고 guardrail 검증에 런타임 확인을 추가.
- 최근 기록 순서가 대시보드 계산 중 뒤섞일 수 있던 클라이언트 원본 배열 정렬 문제를 수정.
- 오늘 누적 계산이 서로 다른 세션의 출근/퇴근을 단순 시간순으로 잘못 짝짓지 않도록 세션 id 기준 계산으로 수정.
- Serverless API의 최근 기록 응답을 세션 시작일이 아니라 실제 출근/퇴근 이벤트 timestamp 기준 최신순으로 정렬하도록 수정.
- 기록 수정 저장 시 변경된 필드만 PATCH하도록 바꿔, 메모/업무 유형 수정 중 오래된 timestamp가 다시 저장되는 위험을 줄임.
- 기록 수정 패널에서 오늘이 아닌 날짜를 선택 중이면 경고와 `오늘 현재로` 빠른 보정 버튼을 표시.
- 잘못 생성된 기록을 정리할 수 있도록 `DELETE /api/records/{recordId}`와 최근 기록 카드의 세션 전체 삭제 확인 UI를 추가.
- 그룹웨어 UI 리서치 기준으로 컨트롤 외곽을 `Structured Soft Rectangle` 체계로 정리하고, 입력/선택/보조 실행/주요 실행/위험 실행의 shape, border, focus 위계를 분리.
- 앱 하단에 CloudWatch 기반 AWS 운영 사용량 패널을 추가하고, API Gateway/Lambda/DynamoDB/CloudFront/S3의 이번 달 기초 지표를 표시.
- 운영 사용량 패널에 Cost Explorer 없이 CloudWatch 지표와 Pineflow 설정을 Free Tier 기준선에 대입한 예상 비용 상태를 표시.
- 운영 사용량 패널을 결론/추이 우선 구조로 단순화하고, 서비스별 상세 기준은 펼쳐서 보도록 변경.
- 같은 날짜의 운영 사용량 스냅샷을 프론트엔드와 DynamoDB에 캐시해 CloudWatch 반복 호출을 줄임.
- S3 frontend bucket의 `assets/` 객체를 30일 뒤 Intelligent-Tiering으로 전환하고, 미완료 multipart upload를 1일 뒤 정리하는 lifecycle rule을 추가.
- `Request failed.` 같은 일반 오류 문구를 상태 코드별 사용자 문구로 바꾸고, 초기 상태 조회 직후 기록 버튼이 API Gateway throttling에 걸릴 가능성을 줄이도록 짧은 쿨다운과 지연 사용량 조회를 적용.
- 로그인 후 첫 화면에 Free Tier 기준 비용 신호등을 추가해 하단 운영 사용량 패널까지 내려가지 않아도 안정/주의/확인 필요 상태를 볼 수 있게 함.
- 보안 리뷰 후 레거시 PoC compose의 DB 포트/비밀번호 기본값을 정리하고, Serverless API의 wildcard CORS 응답과 malformed record id 500 응답 가능성을 제거.
- `docs/security.md`를 Cognito/JWT/GitHub OIDC 기반 Serverless 본선 보안 모델로 갱신하고, PoC access key 모델을 레거시 주의사항으로 분리.
- Dribbble `futuristic-ui` 리서치와 세 팀 분석 결과를 반영해 초기에는 전체 UI 표면을 `Quiet Telemetry Glass` 방향으로 업그레이드했으나, 이 방향은 이후 `Obsidian Command Glass`로 대체됨.
- 상단 히어로, Calm Live Board, 기록 입력, 최근 기록, 날씨, 운영 사용량 패널의 border, shadow, grid, chart line, CTA 표면을 같은 미래형 계기판 언어로 정리.
- `docs/research/futuristic-ui-selection-2026-06-05.md`를 추가하고 관련 UI/요약/날씨 문서에 채택/금지 기준을 반영.
- 사용자가 UI 변화 체감이 약하다고 지적한 뒤, 버튼/입력창/선택 토글/날짜 레일/시간 보정/저장/취소/삭제까지 I/O 컨트롤 전체를 더 강하게 재정리했으나, 녹색 계열 유지가 과하다는 결론에 도달함.
- 후속 지적을 반영해 상단 `Calm Live Board`, 최근 기록, 날씨, 운영 사용량의 큰 표면도 한때 딥 그린 telemetry shell로 보강했지만, 현재 기준에서는 이 방향을 완료 상태로 보지 않음.
- 녹색 계열 보존이 과도해 전면적인 새 UI 스타일로 보이지 않는다는 지적을 반영해 `Obsidian Command Glass`로 재선택하고, carbon/graphite 표면, cyan 데이터 선, amber command action 중심으로 전체 UI 스타일을 다시 교체.
- 버튼 모양과 IA가 여전히 예전 폼 구조에 머물러 있다는 후속 지적을 반영해 상단 기록 조작을 `Command Deck` IA로 재설계. 모드 선택, 빠른 메모, 직접 입력, 출근/퇴근 실행이 한 조작 도크로 읽히도록 notched command tile/control 문법을 적용.
- `Command Deck` 추가 검토로 data slot 입력, 삭제 confirmation deck, 초소형 모바일 1열 fallback을 보강. 단순 색상 변경이 아니라 조작 구조와 affordance를 바꾸는 방향으로 유지.
- 최근 기록이 공간을 과하게 차지하고 출근/퇴근 세트가 잘 보이지 않는 문제를 반영해 세션 단위 `Session Strip`으로 재설계. 같은 session id의 출근/퇴근을 한 카드 안의 `IN -> OUT` rail로 묶고 총 시간, 상태, 업무 유형, 메모를 요약.
- 최근 기록 `Session Strip`을 요약 우선 구조로 보강. 기본 목록에서는 날짜, 시간 범위, 총 시간, 업무 유형, 메모 미리보기만 보이고, `IN/OUT` 수정과 세션 삭제는 사용자가 세션을 펼쳤을 때만 노출.
- 상단 대시보드 오른쪽의 현재 시각, 세션 커맨드, 출근/퇴근 CTA를 하나의 `dashboardCommandStack`으로 묶어 desktop/tablet에서 불필요한 빈 공간이 생기지 않도록 수정.
- 최근 기록 위에 `Workday Lens`를 추가해 월요일 시작 7일 기준의 working day 흐름, 진행 중인 날, 공휴일/명절, 주말, 빈 날을 작은 tile로 요약.
- 최근 기록 요약을 `IN -> OUT` endpoint data pill과 작은 진행 레일 중심으로 압축해 출근/퇴근 세트와 누적 시간을 더 직관적으로 표시.
- 날씨 영역의 밝은 하위 카드를 graphite `Forecast Ribbon` data tile로 정리하고 현재 날씨 glyph, 기초 지표, 예보 그래프/슬롯이 같은 시간축 안에서 읽히도록 보강.
- Google Calendar 일정 연동은 OAuth와 개인 일정 데이터 취급이 필요하므로 구현하지 않고, 향후 ADR 대상과 UI 기반만 문서화.
- 최근 기록 요약/상세 위계를 다시 정리. 기본 행은 날짜/상태/업무 유형/총 시간/진행 레일/메모 미리보기만 보이고, 펼친 영역에서 정확한 `IN/OUT` 시각, 전체 메모, 시간 보정, 삭제 확인을 제공.
- 최근 기록 펼침 방식을 추가 보정. 펼친 상태에서는 요약 카드와 같은 그래프를 아래에 반복하지 않고, 요약 카드가 자체 헤더/접기 버튼/정확한 endpoint 그래프를 가진 상세 패널로 전환.
- 날씨 영역의 Forecast Ribbon이 sidebar 폭에서도 1열로 읽히도록 보정. 이전 2열 grid 잔여 규칙 때문에 오른쪽에 빈 공간이 생기던 레이아웃을 제거.

## 검증됨

- `infra` TypeScript build 성공.
- `infra` CDK synth 성공.
- CDK synth 결과에서 주요 보안/비용 가드레일 확인.
- `infra` CDK 템플릿 guardrail 자동 검증 성공.
- 루트 애플리케이션 `npm audit --audit-level=high` 취약점 없음.
- `infra` `npm audit --audit-level=high` 기준 high 이상 취약점 없음. 단, `aws-cdk-lib` 하위 개발/인프라 도구 체인에 moderate `brace-expansion` 이슈가 남아 있으며 Lambda 런타임 asset에는 포함되지 않는다.

## 아직 남은 일

- DynamoDB export/import 백업 절차 구현.
- 실제 사용 후 CloudWatch 지표 기반 throttling/capacity 조정.
- Budget 알림 이메일 구독과 비용 알림 수신 상태를 주기적으로 확인.
- 필요 시 기존 PoC 문서를 Serverless 본선과 명확히 구분되도록 더 정리.

## 현재 CI/CD 방향

Serverless workflow는 장기 AWS Access Key를 GitHub에 저장하지 않습니다. GitHub OIDC로 AWS IAM Role을 assume하고, CDK 배포 후 stack output을 사용해 프론트엔드를 빌드한 뒤 S3와 CloudFront에 반영합니다.
## 2026-06-07 진행 상황

- Pineflow의 제품 범위를 `하루 리듬 + 지식 인텔리전스`로 확장하는 Trend Lens v1을 추가했다.
- `GET /api/trend-lens`와 `POST /api/trend-lens/refresh`를 추가했다. 두 route 모두 API Gateway JWT authorizer를 통과해야 한다.
- EventBridge daily rule을 추가해 매일 07:00 KST에 전체 Trend Lens 브리프를 자동 수집한다.
- EventBridge security rule을 추가해 30분마다 KISA/CISA 기반 공식 보안 위험 신호를 갱신한다.
- KISA 보안공지 RSS, KISA 취약점 정보 RSS, CISA KEV JSON, Wikimedia Pageviews API를 v1 allowlist source로 사용한다.
- Google Trends는 공식 API alpha와 비용/키 관리 검토가 필요하므로 v1에서는 `준비` 상태로 문서화했다.
- DynamoDB TTL `expiresAt`을 활성화해 Trend Lens snapshot과 manual cooldown guard item을 정리한다.
- 첫 화면 최근 기록 아래에 `Trend Lens` / `오늘 브리프` 영역을 추가했다. 상세 분야는 탭으로 제공하고, source 상태는 접힘 영역으로 제공한다.
- 전체 새로고침은 source 병렬 수집으로 보완했고, 강제 refresh는 짧은 연타 방지 cooldown만 적용한다.
- Trend Lens 설계 문서, 리서치 문서, ADR 0008, API 계약, 보안/비용/저장소/배포 체크리스트를 갱신했다.
