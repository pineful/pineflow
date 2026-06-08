# 변경 기록

## 2026-06-08

- 최근 기록 기본 표시 범위를 진행 중 세션 날짜 또는 가장 최근 세션 날짜 하나로 줄이고, 숨겨진 과거 기록은 `지난 1주 더 보기`로 1주 단위씩 펼치도록 변경했습니다.
- `Workday Lens`를 최근 기록 목록 위에서 `오늘의 흐름` 영역 안으로 옮겨, 최근 기록은 세션 이력만 보여주고 주간 흐름은 별도 1단 보조 요약으로 읽히게 했습니다.
- `AWS 운영 사용량` 패널을 최근 기록 이후의 1단 보조 section으로 유지해야 한다는 배치 원칙을 비용 문서에 추가했습니다.
- Trend Lens의 만돌린, IT 콘텐츠, 교육 분야 source를 Wikimedia Pageviews에서 Google News RSS allowlist로 전환했다.
- Wikipedia, Wikimedia, 백과사전, wiki mirror 계열 문서는 매일 볼 뉴스가 아니므로 Trend Lens 일일 브리프에서 제외하도록 정책과 필터를 추가했다.
- 긴급 보안 신호와 Trend Lens 항목에 source의 게재일/등록일을 표시하도록 UI 메타 정보를 보강했다.
- 외부 source 수동 검증 스크립트가 KISA/CISA와 Google News RSS 응답을 확인하도록 갱신했다.

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
- `Request failed.` 같은 일반 오류 문구를 사용자가 이해할 수 있는 상태별 문구로 바꿨습니다.
- 앱 하단에 CloudWatch 기반 AWS 운영 사용량 패널을 추가했습니다. 실제 청구액 계산은 하지 않고 API Gateway, Lambda, DynamoDB, CloudFront, S3의 이번 달 기초 사용량만 표시합니다.
- 운영 사용량 조회가 `/api/state`와 동시에 호출되어 throttling을 유발하지 않도록 짧은 지연 조회로 분리했습니다.

## 2026-06-05

- Dribbble `futuristic-ui` 레퍼런스와 세 팀 분석 결과를 바탕으로 처음에는 Pineflow에 맞는 `Quiet Telemetry Glass` 스타일을 정의했지만, 이 방향은 후속 검토에서 너무 녹색 계열을 보존한 중간안으로 판정했습니다.
- 상단 히어로를 처음에는 딥 파인 그린 계기판, 미세 grid, 얇은 luminous border, 낮은 shadow 중심으로 업그레이드했지만, 현재 기준에서는 이 색상 방향을 최종 스타일로 보지 않습니다.
- `Calm Live Board`, 기록 입력, 최근 기록, 날씨 리본, 운영 사용량 패널의 표면과 chart treatment를 같은 미래형 데이터 카드 문법으로 정리했습니다.
- 버튼, 입력창, 선택 토글, 날짜 레일, 시간 보정, 저장/취소/삭제 버튼까지 I/O 컨트롤 전체가 새 스타일을 체감할 수 있도록 border, fill, accent, shadow를 재정리했습니다.
- 초기 적용이 너무 미묘해 변경 체감이 부족했던 문제를 보완하려고 한때 `Calm Live Board`, 최근 기록, 날씨, 운영 사용량의 큰 표면을 딥 그린 telemetry shell로 다시 정리했지만, 이 역시 전면 스타일 교체로는 부족하다고 기록했습니다.
- 녹색 계열을 계속 보존해 전면적인 새 스타일로 보이지 않던 문제를 인정하고, 전체 UI 표면을 carbon/graphite, cyan 데이터 선, amber command action 중심의 `Obsidian Command Glass`로 재선택했습니다. focus, hover, empty/error/toast, 날짜/시간 수정 컨트롤까지 같은 체계로 보강했습니다.
- 후속 피드백을 반영해 버튼과 입력 UI가 여전히 낡은 폼 구조처럼 보이던 문제를 수정했습니다. 상단 기록 조작 영역을 `Command Deck` IA로 재정의하고, 모드 선택을 세로 command tile, 빠른 메모를 compact command chip, 직접 입력을 data slot, 출근/퇴근을 docked command button으로 보이게 했습니다.
- `Command Deck` 검토 과정에서 작은 모바일 폭의 2열 강제, 일반 input처럼 보이는 메모/시간 입력, 밀집된 삭제 확인 버튼을 추가로 보완했습니다. 입력은 data slot rail을 갖고, 삭제 확인은 별도 confirmation deck으로 분리됩니다.
- 최근 기록을 개별 이벤트 feed에서 세션 단위 `Session Strip`으로 바꿨습니다. 출근과 퇴근을 한 카드의 `IN -> OUT` rail로 묶고, 총 시간/상태/업무 유형/메모를 한 번만 보여줘 목록 밀도를 높였습니다.
- 기록 수정 화면의 날짜 레일, 오전/오후, 시/분 입력, 빠른 보정, 저장/취소도 같은 notched command control 문법으로 정리했습니다.
- cyberpunk/Web3식 네온, 항공 HUD 조준선, 자동 scanline/shimmer/pulse/line draw를 쓰지 않는 금지 기준을 문서화했습니다.
- `docs/research/futuristic-ui-selection-2026-06-05.md`를 추가하고 `docs/modules/ui-controls.md`, `docs/modules/summary.md`, `docs/modules/weather.md`, `docs/llm-context.md`, `docs/workstreams.md`, `docs/status.md`를 갱신했습니다.

## 2026-06-06

- 최근 기록 `Session Strip`을 요약 우선형으로 바꿨습니다. 기본 상태에서는 날짜, `출근 -> 퇴근` 시간 범위, 총 시간, 업무 유형, 메모 미리보기만 보여주고, `IN/OUT` 시간 수정과 `세션 삭제`는 사용자가 세션을 펼친 뒤에만 보이도록 했습니다.
- 모바일 최근 기록에서 항상 보이던 큰 삭제 버튼을 제거하고, 삭제는 펼친 세션 내부의 확인 단계에서만 실행되도록 정리했습니다.
- `docs/research/recent-session-history-ux-2026-06-05.md`, `docs/modules/recording.md`, `docs/llm-context.md`, `docs/status.md`에 최근 기록의 요약/접힘 원칙을 반영했습니다.
- 상단 대시보드의 오른쪽 시계, 세션 커맨드, 출근/퇴근 CTA를 `dashboardCommandStack`으로 묶어 왼쪽 그래프 높이 때문에 오른쪽 영역에 큰 빈 공간이 생기던 desktop/tablet 배치 문제를 수정했습니다.
- 최근 기록 위에 `Workday Lens`를 추가해 월요일 시작 7일 기준으로 기록 있음, 진행 중, 주말, 공휴일/명절, 빈 날을 한눈에 볼 수 있게 했습니다.
- 최근 기록 요약 행을 `IN -> OUT` 미니 레일과 endpoint data pill 중심으로 다시 압축해 출근/퇴근 세트와 총 시간을 데이터 표처럼 나열하지 않도록 정리했습니다.
- 날씨 영역을 graphite `Forecast Ribbon` 표면으로 다시 맞추고, 현재 날씨 glyph, 체감/습도/강수/바람 data tile, 시간대별 그래프/슬롯이 같은 계기판 안에서 읽히도록 정리했습니다.
- Google Calendar 연동은 OAuth/개인 일정 데이터 취급이 필요한 변경으로 분리하고, 이번에는 UI 기반과 연구 문서만 추가했습니다.
- 최근 기록 펼침 영역이 기본 행의 `IN/OUT` 정보를 반복하던 문제를 수정했습니다. 기본 행에서는 정확한 시각을 숨기고 진행 레일만 보여주며, 펼친 뒤에만 정확한 시각, 전체 메모, endpoint별 시간 보정, 세션 삭제를 제공합니다.
- 최근 기록을 펼칠 때 기존 요약 카드와 요약 그래프가 그대로 남지 않고, 자체 헤더와 접기 버튼을 가진 상세 패널로 전환되도록 수정했습니다.
- 날씨 영역이 sidebar 폭에서 2열 grid 흔적 때문에 오른쪽 빈 공간을 만들던 문제를 수정했습니다. 현재 날씨, 세부 지표, 예보 리본이 모두 1열 Forecast Ribbon 안에서 폭을 채우도록 정리했습니다.
## 2026-06-07

- Pineflow를 출퇴근 기록 중심에서 `하루 리듬 + 지식 인텔리전스` 방향으로 확장하는 Trend Lens v1을 추가했다.
- `GET /api/trend-lens` 캐시 조회 API와 `POST /api/trend-lens/refresh` 수동 갱신 API를 추가했다.
- EventBridge daily refresh와 security refresh rule을 추가해 하루 1회 전체 브리프와 30분 간격 공식 보안 신호 확인을 자동화했다.
- KISA 보안공지 RSS, KISA 취약점 정보 RSS, CISA KEV JSON, Wikimedia Pageviews API를 allowlist source로 연결했다.
- DynamoDB TTL `expiresAt`을 활성화하고 Trend Lens snapshot/cooldown item 저장 구조를 문서화했다.
- 첫 화면 최근 기록 아래에 `Trend Lens` 섹션을 추가하고, 오늘 브리프와 분야별 상세/소스 상태를 분리해 표시했다.
- `docs/modules/trend-lens.md`, `docs/research/daily-intelligence-dashboard-2026-06-07.md`, `docs/adr/0008-trend-lens-scheduled-intelligence-cache.md`를 추가했다.
- API, Serverless 구현, 비용, 보안, 저장소, 배포 체크리스트, LLM 컨텍스트 문서를 Trend Lens 기준으로 갱신했다.
- Trend Lens 전체 새로고침이 source를 순차 호출하다가 실패하기 쉬운 흐름을 병렬 수집으로 바꾸고, 강제 refresh 요청의 짧은 연타 방지 cooldown을 적용했다.
- Trend Lens UI를 전체 폭 `오늘 브리프`와 분야별 탭 구조로 바꿔 오른쪽 좁은 칼럼에서 공간이 깨지지 않도록 정리했다.
- Trend Lens 상태 문구를 `캐시 확인 중`, `수집 중`, `수집 전` 등으로 구분해 로딩 중인지 완료된 빈 상태인지 알 수 있게 했다.
- 하단 배치를 `최근 기록` 왼쪽, `Trend Lens + 날씨` 오른쪽 보조 레일로 묶어 날씨 카드가 오른쪽 아래에 떠 있고 왼쪽이 비는 문제를 수정했다.
- CISA KEV 공식 JSON이 현재 약 1.5MB라 기존 512KB source 한도에서 항상 실패하던 문제를 수정했다. `cisa-kev`에만 2MB/4.5초 예외를 두고, 다른 source는 기본 512KB/2.2초 한도를 유지한다.
- Trend Lens snapshot을 DynamoDB에 저장하기 전에 제목, 요약, source 상태 메시지, reason tag를 압축하도록 보강했다.
- Trend Lens 외부 source를 수동으로 검증하는 `infra/scripts/check-trend-lens-sources.mjs`를 추가했다.
- 수동 새로고침 cooldown은 서버 실패처럼 보이지 않도록 429 메시지와 프론트 처리를 개선했다.
- 하단 `dailyReviewGrid`에서 최근 기록과 오른쪽 보조 레일의 grid column을 명시하고, 760~979px 폭에서는 한 줄 흐름으로 내려가게 보정했다.
- Trend Lens에 `캐시 다시 조회` 버튼을 추가해 저장된 캐시 조회와 외부 source 전체 새로고침을 분리했다.
- Trend Lens 조회 실패 문구를 `캐시 조회 실패` 중심으로 바꾸고, 브라우저 리로드보다 캐시 다시 조회를 먼저 시도하도록 안내했다.
- `수집 상태와 저장 정책 보기`는 snapshot이 없어도 캐시 조회 상태, 전체 새로고침 역할, 저장 정책 fallback row를 보여주도록 수정했다.

## 2026-06-08

- Trend Lens 기사 클릭 시 브라우저 `localStorage`에 읽음 상태를 저장하도록 했다.
- 오늘 읽은 기사는 같은 날 목록 위치를 유지하고 `오늘 읽음`으로 표시하며, 다음날 이후 같은 URL이 다시 나타나면 아래로 내려 흐리게 표시되도록 정리했다.
- 읽음 상태는 비용과 사용자별 스키마 증가를 피하기 위해 v1에서는 DynamoDB에 저장하지 않고, 여러 기기 동기화가 필요할 때 별도 설계/비용/마이그레이션 문서를 추가하기로 했다.
- Trend Lens `수집 상태와 저장 정책`에서 `준비`처럼 모호한 표현을 없애고, 아직 자동 수집하지 않는 Google Trends는 `후보` 소스로 설명하며 실제 반영된 KISA/CISA 소스 뒤에 배치했다.
- 기록 데이터 조회 실패와 실제 빈 기록을 분리했다. `/api/state`가 실패하면 워크데이 `빈 날`과 최근 기록 empty state를 보여주지 않고, 기록 다시 조회 안내와 잠긴 출근/퇴근 CTA를 보여준다.
- 상단 시간 그래프도 `/api/state` 성공 전에는 `0분`, `대기 중`, `--:--`를 실제 데이터처럼 보여주지 않고 `확인 중` 또는 `확인 필요` 상태 패널로 표시한다.
- 로그인 직후 Trend Lens 초기 조회를 기록 상태 조회 이후로 늦춰, 낮은 API Gateway throttling 설정에서 주요 기록 조회가 보조 정보 호출과 충돌할 가능성을 줄였다.
- `/api/state`의 DynamoDB 읽기를 병렬에서 순차로 바꿔 `1 RCU` 환경에서 settings, active session, recent sessions 조회가 동시에 몰리지 않게 했다.
- 기록 수정의 시/분 입력을 브라우저 기본 number input에서 두 자리 numeric text input으로 바꿔, 사용자가 기존 값을 지우고 직접 새 시간을 입력할 수 있게 했다.
