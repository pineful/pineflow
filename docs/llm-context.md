# LLM 작업 컨텍스트

마지막 업데이트: 2026-06-05

## 목적

이 문서는 새 대화, 새 메모리, 새 작업 환경에서 Pineflow를 이어받는 LLM 에이전트가 기존 설계 사상을 잃지 않고 코드 수정을 하기 위한 출발점이다.

## 제품 정체성

Pineflow는 회사에 속해 있지 않은 개인도 자신의 출근, 퇴근, 집중 시간, 하루 리듬을 기록할 수 있게 하는 모바일 우선 서비스다. 이름은 사용자의 `pineful` 아이디 발음감과 하루 흐름이라는 의미를 결합해 정했다.

이 제품은 많은 사용자를 받는 공개 SaaS가 아니라, 우선 1인 개인 사용을 전제로 한다. 따라서 기능 확장보다 비용 방어, 비공개 접근, 데이터 지속성이 더 중요하다.

## 현재 아키텍처 판단

기존 EC2 Docker/PostgreSQL 구성은 PoC다. 본선 운영 목표는 AWS Serverless다.

본선 구성:

- Frontend: React/Vite, S3, CloudFront
- Auth: Cognito User Pool, 관리자 생성 사용자만 허용
- API: API Gateway HTTP API, JWT authorizer 필수
- Compute: Lambda Node.js 24.x (`nodejs24.x`)
- Database: DynamoDB single-table
- IaC: AWS CDK TypeScript
- CI/CD: GitHub Actions + GitHub OIDC + AWS IAM Role

## 왜 Serverless인가

서버를 항상 켜두는 EC2 방식은 개인 사용 서비스에 비해 관리 비용과 노출면이 크다. Serverless는 사용량이 없을 때 비용을 낮게 유지하기 쉽고, API Gateway/Lambda/DynamoDB/Cognito/S3/CloudFront 조합으로 개인 규모 서비스를 운영하기에 충분하다.

다만 AWS Free Tier는 절대 0원 보장이 아니다. 모든 변경은 “비용이 예상보다 커질 수 있는가”를 먼저 검토해야 한다.

## 보안 불변 조건

- Cognito self sign-up 비활성화.
- 사용자는 관리자만 생성.
- 모든 API route는 JWT authorizer 적용.
- Lambda는 JWT claim의 `sub`만 신뢰하고, 클라이언트가 보낸 사용자 ID를 신뢰하지 않는다.
- 브라우저에는 API access token과 refresh token을 `sessionStorage`에만 저장한다.
- GitHub에 장기 AWS Access Key, SSH private key, DB secret을 저장하지 않는다.
- CI/CD의 AWS 접근은 OIDC 기반 IAM Role assume만 허용한다.
- CloudFront는 CSP와 보안 응답 헤더를 유지한다.

## 비용 불변 조건

- API Gateway throttling: `1 req/sec`, burst `5`.
- Lambda reserved concurrency: `1`.
- Lambda memory: `128 MB`.
- DynamoDB provisioned capacity: `1 RCU / 1 WCU`.
- CloudWatch log retention: 7일.
- AWS Budgets: `$1`, `$3`, `$5`.
- S3 public access block.
- CloudFront OAC 유지.

비용을 증가시킬 수 있는 WAF, Route 53, NAT Gateway, RDS, VPC Lambda, provisioned concurrency, DynamoDB on-demand, GSI 추가는 기본적으로 금지한다. 필요하면 ADR이 먼저다.

## 데이터 모델

DynamoDB single-table:

- `pk = USER#<cognito-sub>`
- `sk = SETTINGS`
- `sk = ACTIVE_SESSION`
- `sk = SESSION#<ISO 시간>#<session-id>`

핵심 접근 패턴:

- 사용자 설정 조회: `pk`, `sk=SETTINGS`
- 활성 세션 조회: `pk`, `sk=ACTIVE_SESSION`
- 최근 기록 조회: `pk`, `begins_with(sk, SESSION#)`, 역순

GSI는 아직 만들지 않는다. 검색/통계 기능이 필요해지면 먼저 access pattern과 비용 영향을 문서화한다.

## API 요약

정확한 계약은 `docs/api-contract.md`를 따른다.

- `GET /api/health`
- `GET /api/state`
- `GET /api/usage`
- `POST /api/check-in`
- `POST /api/check-out`
- `PATCH /api/records/{recordId}`
- `PATCH /api/settings`

현재 모든 route는 JWT가 필요하다.

## 변경 작업 절차

1. `AGENTS.md`와 이 문서를 먼저 읽는다.
2. `docs/workstreams.md`에서 변경 분야와 연결 문서를 확인한다.
3. 변경 영역의 모듈 문서를 읽는다.
4. 코드 변경 전에 기존 guardrail을 깨는지 확인한다.
5. 코드 변경 후 관련 문서를 갱신한다.
6. `npm run build`와 `infra`의 `npm run verify`를 실행한다.
7. API, 인증, 비용, 저장소, CI/CD 결정이 바뀌면 ADR을 남긴다.

## 문서 갱신 매핑

- API 변경: `docs/api-contract.md`
- 인증 변경: `docs/modules/serverless-auth.md`, `docs/adr/`
- DynamoDB 변경: `docs/modules/serverless-storage.md`, `docs/data-management.md`, `docs/adr/`
- AWS 리소스 변경: `docs/serverless-implementation.md`, `docs/aws-serverless-deployment-checklist.md`, `infra/scripts/verify-template.mjs`
- 비용 정책 변경: `docs/cost-guardrails.md`, `docs/adr/`
- 운영 사용량 표시 변경: `docs/api-contract.md`, `docs/cost-guardrails.md`, `docs/serverless-implementation.md`
- CI/CD 변경: `docs/cicd.md`, `.github/workflows/serverless.yml`
- GitHub OIDC/IAM 변경: `docs/aws-iam-oidc.md`, `infra/bootstrap/github-oidc-deploy-role.template.yaml`, `docs/adr/`
- 제품/브랜드 변경: `docs/product-plan.md`, `docs/brand.md`, `docs/modules/branding.md`
- 날씨 정보 변경: `docs/modules/weather.md`, `src/App.tsx`, `infra/lib/pineflow-serverless-stack.ts`
- 모션/효과음/터치 피드백 변경: `docs/modules/microinteractions.md`, `src/App.tsx`, `src/styles.css`
- 대시보드 리서치/재설계 근거 변경: `docs/research/dashboard-ux-redesign-2026-05-24.md`, `docs/modules/summary.md`
- UI 컨트롤 외곽/shape/elevation 변경: `docs/modules/ui-controls.md`, `docs/research/groupware-control-shape-2026-06-04.md`, `src/styles.css`

## 현재 주의사항

- `infra` npm audit에는 CDK 도구 체인의 moderate `brace-expansion` transitive issue가 남아 있다. Lambda asset에는 포함되지 않는다.
- Lambda runtime은 AWS Health Node.js 20.x EOL 알림 대응 이후 `nodejs24.x`로 고정한다. `nodejs20.x`나 지원 종료가 가까운 런타임으로 되돌리면 `infra/scripts/verify-template.mjs` guardrail이 실패해야 한다.
- 실제 AWS 배포 전 Budget 알림 이메일 구독을 승인해야 한다.
- 배포 후 첫 사용자는 Cognito에서 관리자가 생성해야 한다.
- 날씨 카드는 Open-Meteo와 BigDataCloud 공개 API를 브라우저에서 직접 호출한다. 위치 좌표는 Pineflow 서버에 저장하지 않는다. BigDataCloud reverse geocoding은 브라우저 위치 권한으로 얻은 현재 좌표에만 사용하고, fallback 좌표에는 사용하지 않는다. reverse geocoding 결과가 영문 동명이나 불명확한 행정구역을 섞어 반환하면 화면에는 `현재 위치 기준`으로 표시한다. 날씨 영역은 `Forecast Ribbon` 철학을 따른다. 5일 예보의 그래프와 시간대별 카드는 같은 가로 스크롤 시간축 안에서 함께 움직여야 한다.
- 로그인 후 로그아웃, 계정 표시, 향후 계정 기능은 상단 계정 메뉴를 확장하는 방향을 유지한다.
- 기록 설정은 이번 세션이 최근 기록에 어떻게 남을지 정하는 영역이다. 모드 수는 적게 유지하고, 구체 작업명은 자주 쓰는 메모 후보나 직접 입력 메모로 남긴다. 활성 세션 중에는 종류/메모/시작 시간 요약만 보여주고 비어 있는 입력창을 노출하지 않는다.
- 기록 입력은 출근/퇴근 CTA와 같은 상단 패널 안에 둔다. 메모 작성 후 버튼을 찾아 다시 이동하는 구조로 되돌리지 않는다.
- 최근 기록은 상단 패널 바로 아래에 두고, 각 기록에서 시간, 기록 종류, 메모 수정이 가능해야 한다. 기록 수정 API를 바꾸면 `docs/api-contract.md`, `docs/modules/recording.md`, `docs/modules/serverless-storage.md`를 함께 갱신한다.
- 기록 삭제는 `DELETE /api/records/{recordId}`로 세션 전체를 삭제한다. Pineflow 저장소는 출근/퇴근을 하나의 `SESSION#...` item에 저장하므로, 출근 또는 퇴근 이벤트 하나만 삭제하는 partial delete를 만들면 깨진 세션이 생긴다. 활성 세션 삭제 시 `ACTIVE_SESSION`도 같은 transaction에서 삭제해야 한다.
- 최근 기록 정렬은 실제 출근/퇴근 record의 `timestamp` 최신순이다. DynamoDB session query 결과나 세션 시작일 정렬을 그대로 UI에 노출하면, 자정을 넘긴 세션과 퇴근 시각 보정 기록이 엉뚱한 위치에 묶인다.
- 대시보드 요약처럼 시간순 계산이 필요한 함수는 `state.records`를 직접 `sort()`하지 말고 복사본을 정렬한다. React state 배열을 직접 mutate하면 최근 기록 순서가 화면에서 뒤섞인다. 누적 시간 계산은 flat record를 단순 순서로 짝짓지 말고 record id의 세션 id 기준으로 출근/퇴근을 묶어야 한다.
- 최근 기록 목록은 사용자가 남긴 메모를 업무 유형 아이콘과 함께 바로 보여줘야 한다. 메모를 수정 화면 안에만 숨기면 개인 기록 서비스의 핵심 가치가 사라진다.
- 최근 기록 편집 중에는 OS/browser 기본 `datetime-local` 피커를 쓰지 않는다. 요일은 직접 정의한 `월/화/수` 라벨로 표시하고, `()` 같은 빈 요일 표기가 생기지 않게 한다. 7일 날짜 레일, `오전/오후 -> 시 -> 분` 순서의 시간 입력, 기록 종류 선택, 메모 입력을 같은 카드 안에 둔다. 편집 중인 기록의 우측 버튼 영역은 `수정` 대신 `저장`과 `취소`로 전환한다.
- 기록 수정 UI는 과거 기록의 메모/업무 유형만 수정하는 정상 흐름도 지원해야 하므로 패널을 열 때 timestamp를 자동으로 현재 시각으로 바꾸지 않는다. 대신 오늘이 아닌 날짜 경고와 `오늘 현재로` 버튼을 제공하고, 저장 요청은 실제 변경된 필드만 PATCH한다.
- 열린 탭의 Cognito access token은 API 요청 전과 30분 주기, 창 포커스/복귀 시점에 refresh token으로 갱신한다. refresh token은 `sessionStorage`에만 저장하고 Cognito refresh token validity는 1일로 제한한다. 탭을 닫으면 장기 세션이 남지 않아야 한다.
- 오늘 요약은 읽기 중심이다. 목표 시간 슬라이더를 상시 노출하지 말고, `목표 수정` 같은 명시적 보조 동작 뒤에만 표시한다.
- 오늘 누적 시간은 `Calm Live Board` 성격의 흐름 그래프 카드로 표현하고, 로그인 후 첫 화면의 최상단 우선 정보로 둔다. 사용자가 Pineflow를 켜 둔 채 일한다고 가정하면 볼 때마다 가장 궁금한 정보는 현재 상태, 현재 누적 시간, 목표 대비 진행률, 남은 시간, 이번 세션 경과다. 그래프는 실제 오늘 기록을 기반으로 한 누적 면적 그래프여야 하며 현재 시각선, 목표선, 출근/퇴근 기록점, 활성 세션 현재점을 포함한다. 숫자만 나열하거나 단순 막대, 추상 장식 곡선으로 되돌리지 않는다.
- 상단 그래프는 기본적으로 정지 화면이어야 한다. sweep, shimmer, line draw, 활성점 pulse 같은 자동 반복/등장 모션은 넣지 않는다. 움직임은 사용자 조작 피드백에만 짧게 두고 `prefers-reduced-motion`을 존중한다.
- 시간 길이 표기는 `1시간 7분`처럼 자연어 중심으로 둔다. 분 앞에 `07분`처럼 0을 붙이지 않는다.
- 태블릿 이상 화면에서는 상단 패널을 가로형 대시보드로 구성한다. 왼쪽에는 큰 흐름 그래프, 오른쪽에는 현재 시각, 기록 메모/모드, 출근/퇴근 CTA를 둬서 그래프 확인과 기록 조작이 같은 시야 안에 들어와야 한다.
- 첫 화면에는 좌측 사이드바, 큰 배경 패턴, 과한 마스코트 장식을 넣지 않는다. Pineflow의 세련됨은 장식량보다 시간 정보의 위계에서 나와야 한다.
- UI 컨트롤 외곽은 그룹웨어형 `Structured Soft Rectangle` 기준을 따른다. 읽기 카드와 주요 패널은 최대 8px, 입력 필드와 선택/보조 버튼은 5-6px, 상태 배지와 작은 칩만 pill을 쓴다. 저장/출근/퇴근 같은 상태 변경 버튼, 선택지만 바꾸는 버튼, 텍스트 입력, 삭제/로그아웃 같은 위험 동작은 border, fill, focus ring으로 서로 구분되어야 한다. elevation은 팝오버/toast 같은 레이어에 우선 사용하고 반복 카드에는 과한 그림자를 넣지 않는다.
- Dribbble `futuristic-ui` 리서치 이후 전체 UI 표면은 `Obsidian Command Glass` 방향을 따른다. carbon/graphite 상단 계기판, cyan 데이터 선, amber command action, blue-gray border, 낮은 shadow, 미세한 grid는 허용하지만, cyberpunk/Web3식 네온, 항공 HUD 조준선, 자동 scanline/shimmer/pulse/line draw, 과한 blur나 3D 장식은 Pineflow와 맞지 않는다. 이 기준은 배경선만이 아니라 버튼, 입력창, 선택 토글, 날짜 레일, 시간 보정, 저장/삭제 같은 모든 I/O 컨트롤의 border/fill/focus/accent 언어까지 포함한다.
- `Obsidian Command Glass`는 작은 컨트롤이나 배경 장식만 바꾸는 의미가 아니다. 상단 `Calm Live Board`, 최근 기록, 날씨, 운영 사용량처럼 첫 화면에서 큰 면적을 차지하는 표면도 graphite shell과 cyan/amber 데이터 대비를 가져야 한다. 핵심 카드가 기존 흰 카드나 녹색 계열 shell로 남아 있으면 사용자는 변경을 체감하지 못하므로 해당 상태를 완료로 보지 않는다.
- 기록 조작 IA는 `Command Deck`으로 본다. 상단 오른쪽 영역은 일반 설정 폼이 아니라 세션을 시작/종료하기 전 마지막 조작 도크다. 모드 선택은 command tile, 빠른 메모는 command chip, 직접 메모는 data slot, 출근/퇴근은 docked command button으로 보이게 한다. 색만 바꾸고 2x2 카드 버튼이나 낡은 rectangle form으로 남아 있으면 완료로 보지 않는다.
- `Command Deck`의 입력 필드는 흰색 일반 폼으로 되돌리지 않는다. 메모, 시간 숫자, 수정 입력은 data slot rail을 가져야 하며, 삭제 확인은 별도 confirmation deck으로 분리한다. 380px 안팎의 작은 모바일 폭에서는 컨트롤을 1열로 접어 텍스트를 숨기지 않는다.
- 효과음은 외부 음원 파일을 쓰지 않고 Web Audio API로 짧고 조용하게 생성한다. 기본값은 꺼짐이며, 계정 메뉴에서 사용자가 켠 뒤 사용자 조작에 대해서만 재생한다. 자동 재생, 백그라운드 업데이트, 날씨 갱신에는 소리를 내지 않는다.
- 로고는 얼굴이 있는 캐릭터가 아니라 `잎 + 둥근 파인 실루엣 + 바깥 타원 궤도 화살표`로 구성한 Pineflow Mark를 사용한다. 브랜드의 귀여움은 표정이 아니라 둥근 비율과 부드러운 곡선에서 나온다. 작은 헤더 마크에서는 검은 잎처럼 머리카락으로 읽히는 요소를 피하고, 골드 몸통 실루엣과 초록 잎으로 파인애플 판독성을 우선한다. 상단 잎은 분리된 뾰족한 삼각형이 아니라 몸통에 붙은 곡선형 `leafy crown`으로 유지한다. 흐름선은 잎 주변의 작은 곡선 장식이나 몸통에 붙은 선으로 되돌리지 말고, 토성 고리처럼 몸통과 분리된 바깥 타원 궤도 화살표로 유지한다. 작은 아이콘에서도 흐름이 보여야 하므로 고리는 뒤/앞 레이어와 민트 하이라이트를 가진 굵은 `Saturn Flow Ring` 구조로 둔다.
- 헤더 브랜드는 밝은 뉴트럴 타일 위의 compact mark와 `pineflow` 소문자 워드마크를 함께 사용한다. 어두운 히어로 배경에 마크를 직접 올리거나 일반 `h1` 글꼴로 `Pineflow`를 표시하면 최종 시안의 색감과 타이포 의도가 깨진다.
- 색상은 obsidian/graphite UI를 기본으로 하고, 파인 그린은 로고와 작은 생명감 accent에만 제한한다. 핵심 데이터와 선택/focus는 cyan, 출근/퇴근/저장 같은 command action은 amber/orange, 위험 동작은 coral red로 분리한다.
- 앱 첫 화면의 비용 신호등은 하단 운영 사용량 패널의 당일 스냅샷을 요약해 Free Tier 기준 안정/주의/위험/확인 불가 상태를 보여준다. 신호등은 별도 AWS 조회를 만들지 않아야 하며, 하단 운영 사용량 패널은 CloudWatch 기초 지표, 시간 순 추이, Free Tier 기준 예상 상태를 표시한다. 앱 Lambda에 Cost Explorer 권한을 추가하지 않고, 실제 청구액은 AWS Budgets와 Billing 콘솔에서 확인하는 구조를 유지한다. 같은 날짜의 사용량 스냅샷은 프론트엔드와 DynamoDB에 캐시해 비용 확인을 위한 반복 CloudWatch 호출을 피한다. 운영 지표 조회 실패는 기록 기능 오류처럼 상단 error banner로 띄우지 않는다.
- 프론트엔드 S3 bucket은 `assets/` 객체만 30일 뒤 Intelligent-Tiering으로 전환한다. `index.html`은 CloudFront 첫 화면 안정성을 위해 Standard에 둔다. archive/deep archive 계열 전환은 현재 프론트엔드 객체에는 적용하지 않는다.
