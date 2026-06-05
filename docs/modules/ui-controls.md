# UI 컨트롤 외곽 모듈

## 책임

UI 컨트롤 외곽 모듈은 Pineflow 화면에서 버튼, 입력 필드, 선택지, 읽기 카드, 위험 동작이 어떤 모양과 테두리, focus/hover 위계를 가져야 하는지 정의합니다.

## 설계 사상

Pineflow는 개인 출퇴근 기록 서비스지만 실제 사용 장면은 그룹웨어형 업무 도구에 가깝습니다. 사용자는 하루 동안 화면을 켜 두고, 출근/퇴근, 메모, 시간 보정, 기록 삭제처럼 상태가 바뀌는 작업을 반복합니다.

따라서 외곽 디자인은 귀엽거나 둥글게 보이는 것보다 조작 의미를 빨리 구분하게 하는 쪽이 우선입니다. 모든 것을 pill로 만들거나 모든 카드와 버튼을 같은 둥근 사각형으로 맞추면, 읽기 정보와 실행 버튼, 선택지와 입력 필드, 위험 동작이 서로 비슷해져 조작 실수가 늘어납니다.

현재 기준은 `Structured Soft Rectangle`입니다. 사각형을 기본으로 하되 모서리는 딱딱하지 않게 낮은 반경을 주고, 상태 배지처럼 작은 보조 정보만 pill로 둡니다.

2026-06-05 기준으로 Dribbble `futuristic-ui` 리서치를 반영한 표면 스타일은 `Quiet Telemetry Glass`입니다. 이는 기존 `Structured Soft Rectangle`의 shape 기준을 유지하면서, 상단 계기판과 반복 카드에 얇은 발광 경계선, 낮은 그림자, 미세한 grid, 정돈된 숫자 표면을 더하는 방식입니다.

이 스타일은 배경이나 카드 표면만의 장식이 아니라 I/O 컨트롤 문법까지 포함합니다. 버튼, 입력창, 선택 토글, 날짜 레일, 시간 보정 버튼, 저장/취소/삭제 버튼은 각각 “누르는 것”, “입력하는 것”, “선택하는 것”, “위험한 것”이 시각적으로 구분되어야 합니다. 미래형 느낌은 단순 배경선이 아니라 조작 가능한 요소의 border, fill, left accent, inset shadow, active glow에서 체감되어야 합니다.

초기 적용처럼 배경 grid나 미세한 테두리만 바꾸고 핵심 카드가 기존 흰 카드로 남으면 사용자는 스타일 변경을 체감하지 못합니다. `Quiet Telemetry Glass`를 적용한다고 기록할 때는 상단 `Calm Live Board`, 최근 기록, 날씨, 운영 사용량처럼 첫 화면에서 큰 면적을 차지하는 표면도 같은 계열의 딥 그린 telemetry shell과 밝은 데이터 슬롯 대비를 가져야 합니다.

## 현재 규칙

- 읽기 카드와 주요 패널은 `8px` 반경을 넘기지 않습니다.
- 입력 필드, 선택 버튼, 보조 버튼은 `5-6px` 반경을 기본으로 합니다.
- 상태 배지, 계정 아바타, 작은 칩, toast처럼 좁고 보조적인 요소만 pill을 사용합니다.
- 텍스트 입력은 밝은 데이터 슬롯처럼 보여야 합니다. 흰 표면, 명확한 border, 왼쪽 mint accent, inset shadow, focus ring을 가져야 합니다.
- 선택 컨트롤은 입력 필드처럼 보이면 안 됩니다. 선택 상태는 딥 그린 fill, mint border, gold side/accent, 체크 표시 등으로 구분합니다.
- 빠른 보정, 취소, 목표 수정 같은 보조 실행은 낮은 배경, 얇은 border, 작은 inset highlight를 사용합니다.
- 출근/퇴근, 저장처럼 상태를 바꾸는 실행 버튼은 하나의 강한 CTA로 읽혀야 합니다. 골드/파인 그린 gradient, 선명한 border, shadow로 다른 버튼보다 즉시 눈에 들어와야 합니다.
- 삭제, 로그아웃처럼 되돌리기 어렵거나 세션을 끝내는 동작은 일반 보조 버튼과 같은 외곽을 쓰지 않습니다. danger 색, border, focus ring으로 분리합니다.
- elevation은 팝오버, toast, 임시 편집 패널처럼 화면 위에 뜨는 레이어에 우선 사용합니다. 반복되는 기록 카드와 날씨 카드에 강한 shadow를 남발하지 않습니다.
- disabled 상태는 저장/삭제 중 같은 진행 상태와 아직 사용할 수 없는 기능을 구분해야 합니다. 진행 상태는 wait cursor를 쓸 수 있지만, 미구현/비활성 기능은 default cursor와 낮은 대비를 씁니다.
- futuristic 스타일을 적용하더라도 자동 scanline, shimmer, pulse, line draw는 쓰지 않습니다. hover/focus와 사용자 조작 피드백에만 짧은 반응을 둡니다.
- 딥 그린 계기판, 민트/골드 accent, 하늘빛 정보색은 역할이 분명해야 합니다. 장식 목적으로 보라/파랑 네온이나 과한 dark SaaS 팔레트를 새로 만들지 않습니다.
- grid, luminous border, glass surface는 상단 히어로와 데이터 카드의 정밀감을 높이는 보조 장치입니다. 읽기 정보와 버튼/입력의 역할 구분을 흐리면 제거합니다.
- 첫 화면에서 “변경됨”이 느껴지려면 가장 큰 면적의 카드부터 바뀌어야 합니다. 작은 버튼만 바꾸거나 배경선만 추가한 변경은 이 스타일 적용으로 보지 않습니다.

## 구현 기준

주요 shape token은 `src/styles.css`의 `:root`에서 관리합니다.

- `--radius-card`: 읽기 카드와 큰 패널
- `--radius-control`: 일반 버튼과 선택 컨트롤
- `--radius-field`: 텍스트/숫자 입력 필드
- `--radius-compact`: 빠른 보정 같은 작은 보조 버튼
- `--radius-pill`: 상태 배지와 작은 칩

컨트롤 외곽을 바꿀 때는 단일 selector만 고치지 말고, 같은 의미를 가진 컨트롤군 전체가 같은 문법을 쓰는지 확인합니다. 예를 들어 기록 수정 화면의 `기록 종류`, `날짜`, `오전/오후`, `시/분 입력`, `빠른 보정`, `저장/취소`는 서로 다른 역할이므로 같은 모양으로 통일하면 안 됩니다.

## 참고 문서

- `docs/research/groupware-control-shape-2026-06-04.md`
- `docs/research/futuristic-ui-selection-2026-06-05.md`
- `docs/modules/recording.md`
- `docs/modules/microinteractions.md`
- `docs/modules/branding.md`

## 향후 문서화할 변경

- 계정 설정 화면이 추가될 때 메뉴/폼/저장 버튼 shape 기준.
- 주간 통계나 필터가 추가될 때 segmented control과 table/list control 기준.
- 위험 동작이 늘어날 때 confirmation pattern과 danger button 기준.
