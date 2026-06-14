# UI 컨트롤 외곽 모듈

## 책임

UI 컨트롤 외곽 모듈은 Pineflow 화면에서 버튼, 입력 필드, 선택지, 읽기 카드, 위험 동작이 어떤 모양과 테두리, focus/hover 위계를 가져야 하는지 정의합니다.

## 설계 사상

Pineflow의 현재 화면은 `작업사령탑` 성격의 개인 작업 대시보드이며, 실제 사용 장면은 그룹웨어형 업무 도구에 가깝습니다. 사용자는 하루 동안 화면을 켜 두고, 출근/퇴근, 메모, 시간 보정, 기록 삭제, 지식 브리프 확인처럼 상태가 바뀌는 작업을 반복합니다.

2026-06-09 이후 화면의 서비스 제목은 `작업사령탑`이며, 첫 화면의 버튼/입력 주변 문구는 짧은 command label을 우선합니다. 긴 설명으로 빈 공간을 채우지 말고, 상태와 다음 행동을 `커맨드`, `선택 후 실행`, `최근 세션`, `보관함`처럼 바로 읽히는 단어로 제한합니다.

따라서 외곽 디자인은 귀엽거나 둥글게 보이는 것보다 조작 의미를 빨리 구분하게 하는 쪽이 우선입니다. 모든 것을 pill로 만들거나 모든 카드와 버튼을 같은 둥근 사각형으로 맞추면, 읽기 정보와 실행 버튼, 선택지와 입력 필드, 위험 동작이 서로 비슷해져 조작 실수가 늘어납니다.

기본 기준은 `Structured Soft Rectangle`였지만, `Obsidian Command Glass` 이후 상단 기록 조작과 수정 화면의 핵심 입력 컨트롤은 `Command Deck Control`로 격상합니다. 이는 일반 사각 폼이 아니라 잘린 모서리, 얇은 cyan edge, 작은 command rail, data slot 입력을 통해 “선택/입력/실행”을 즉시 구분하게 하는 문법입니다.

2026-06-05 기준으로 Dribbble `futuristic-ui` 리서치를 반영한 표면 스타일은 `Obsidian Command Glass`입니다. 이는 carbon/graphite 표면, cyan 데이터 선, amber command action, blue-gray border, 미세한 grid를 기본으로 하되, 실제 조작 영역은 `Command Deck Control` 형태로 한 단계 더 분리합니다.

이 스타일은 배경이나 카드 표면만의 장식이 아니라 I/O 컨트롤 문법까지 포함합니다. 버튼, 입력창, 선택 토글, 날짜 레일, 시간 보정 버튼, 저장/취소/삭제 버튼은 각각 “누르는 것”, “입력하는 것”, “선택하는 것”, “위험한 것”이 시각적으로 구분되어야 합니다. 미래형 느낌은 단순 배경선이 아니라 조작 가능한 요소의 border, fill, left accent, inset shadow, active glow에서 체감되어야 합니다.

초기 적용처럼 배경 grid나 미세한 테두리만 바꾸고 핵심 카드가 기존 흰 카드나 녹색 shell로 남으면 사용자는 스타일 변경을 체감하지 못합니다. `Obsidian Command Glass`를 적용한다고 기록할 때는 상단 `Calm Live Board`, 최근 기록, 날씨, 운영 사용량처럼 첫 화면에서 큰 면적을 차지하는 표면도 같은 계열의 graphite shell과 cyan/amber 데이터 슬롯 대비를 가져야 합니다.

## 현재 규칙

- 읽기 카드와 주요 패널은 `8px` 반경을 넘기지 않습니다.
- 상단 기록 조작, 기록 수정, 저장/취소처럼 직접 상태를 바꾸는 핵심 컨트롤은 notched command tile을 사용할 수 있습니다. 이때 모서리 잘림은 과한 SF 장식이 아니라 조작 가능 영역을 분리하는 affordance입니다.
- 일반 입력 필드, 선택 버튼, 보조 버튼은 `5-6px` 반경 또는 compact notched edge를 사용합니다.
- 상태 배지, 계정 아바타, 작은 칩, toast처럼 좁고 보조적인 요소만 pill을 사용합니다.
- 텍스트 입력은 어두운 데이터 슬롯처럼 보여야 합니다. carbon 표면, 명확한 blue-gray border, 왼쪽 cyan accent, inset shadow, focus ring을 가져야 합니다.
- 선택 컨트롤은 입력 필드처럼 보이면 안 됩니다. 선택 상태는 cyan fill, 밝은 border, amber secondary accent, 체크 표시 등으로 구분합니다.
- 빠른 보정, 취소, 목표 수정 같은 보조 실행은 낮은 배경, 얇은 border, 작은 inset highlight를 사용합니다.
- 출근/퇴근, 저장처럼 상태를 바꾸는 실행 버튼은 하나의 강한 CTA로 읽혀야 합니다. amber/orange command gradient, 선명한 border, shadow로 다른 버튼보다 즉시 눈에 들어와야 합니다.
- 밝은 amber/orange command CTA 위의 텍스트는 반드시 어두운 전경색을 사용합니다. graphite 표면용 밝은 텍스트를 CTA 내부 제목이나 설명에 재사용하면 대비가 무너져 로그인/저장 같은 핵심 명령을 읽을 수 없습니다.
- 삭제, 로그아웃처럼 되돌리기 어렵거나 세션을 끝내는 동작은 일반 보조 버튼과 같은 외곽을 쓰지 않습니다. danger 색, border, focus ring으로 분리합니다.
- elevation은 팝오버, toast, 임시 편집 패널처럼 화면 위에 뜨는 레이어에 우선 사용합니다. 반복되는 기록 카드와 날씨 카드에 강한 shadow를 남발하지 않습니다.
- disabled 상태는 저장/삭제 중 같은 진행 상태와 아직 사용할 수 없는 기능을 구분해야 합니다. 진행 상태는 wait cursor를 쓸 수 있지만, 미구현/비활성 기능은 default cursor와 낮은 대비를 씁니다.
- futuristic 스타일을 적용하더라도 자동 scanline, shimmer, pulse, line draw는 쓰지 않습니다. hover/focus와 사용자 조작 피드백에만 짧은 반응을 둡니다.
- graphite 계기판, cyan 데이터 accent, amber command accent, coral danger는 역할이 분명해야 합니다. Pineflow green은 브랜드 생명감으로만 제한하고 화면 전체를 녹색 계열로 맞추지 않습니다.
- grid, luminous border, glass surface는 상단 히어로와 데이터 카드의 정밀감을 높이는 보조 장치입니다. 읽기 정보와 버튼/입력의 역할 구분을 흐리면 제거합니다.
- 첫 화면에서 “변경됨”이 느껴지려면 가장 큰 면적의 카드뿐 아니라 사용자가 실제로 누르고 입력하는 control deck까지 바뀌어야 합니다. 작은 버튼 색만 바꾸거나 배경선만 추가한 변경은 이 스타일 적용으로 보지 않습니다.
- 직접 입력 필드는 흰색 일반 form field로 되돌리지 않습니다. 메모와 시간 숫자 입력은 어두운 data slot, 왼쪽 cyan rail, focus 시 amber rail로 구분되어야 합니다.
- 삭제 확인처럼 위험한 조작은 일반 버튼 두 개를 한 줄에 붙이지 않습니다. 별도 confirmation deck으로 묶고 안내 문구와 실행 버튼을 분리합니다.
- 380px 수준의 작은 모바일 폭에서는 command chip과 수정 모드 선택을 1열로 접습니다. 글자 줄임표로 기능명을 숨기거나 가로 스크롤을 만들지 않습니다.
- 기록 수정 editor는 넓은 폼이 아니라 compact command deck이어야 합니다. 업무 유형, 날짜, 시간, 메모는 각각 editor block으로 묶고, 실행 버튼은 하단 footer에 모아 입력/선택 영역과 섞이지 않게 합니다.
- 기록 수정 editor의 desktop 기본 밀도는 3열입니다. 업무 유형, 날짜, 시간을 한 행에 놓고 메모만 전체 폭을 쓰며, 중간 폭에서는 2열, 모바일에서는 1열로 접어 같은 정보가 과도한 세로 공간을 차지하지 않게 합니다.

## 구현 기준

주요 shape token은 `src/styles.css`의 `:root`에서 관리합니다.

- `--radius-card`: 읽기 카드와 큰 패널
- `--radius-control`: 일반 버튼과 선택 컨트롤
- `--radius-field`: 텍스트/숫자 입력 필드
- `--radius-compact`: 빠른 보정 같은 작은 보조 버튼
- `--radius-pill`: 상태 배지와 작은 칩

컨트롤 외곽을 바꿀 때는 단일 selector만 고치지 말고, 같은 의미를 가진 컨트롤군 전체가 같은 문법을 쓰는지 확인합니다. 예를 들어 기록 수정 화면의 `기록 종류`, `날짜`, `오전/오후`, `시/분 입력`, `빠른 보정`, `저장/취소`는 서로 다른 역할이므로 같은 모양으로 통일하면 안 됩니다.

2026-06-06 이후 최근 기록과 날씨 보조 영역도 같은 기준을 따릅니다.

- `Workday Lens` 날짜 tile은 입력 필드가 아니라 읽기/탐색용 요약 tile입니다. 짧은 휴일 라벨, 진행률 bar, mode glyph만 허용하고 큰 버튼처럼 보이면 안 됩니다.
- 최근 기록의 기본 행에 있는 `IN`/`OUT` 표시는 정확한 시각이 아니라 흐름 요약 marker입니다. 정확한 시간 data slot과 클릭 가능한 endpoint는 펼친 세부 영역에서만 보입니다.
- 최근 기록은 펼칠 때 summary button을 유지한 채 detail graph를 아래에 반복하지 않습니다. 펼친 상태는 별도 detail panel이며, 닫기/접기 명령은 그 detail panel 안에 있어야 합니다.
- 세션 목록의 기본 행에 삭제 버튼을 노출하지 않습니다. 위험 동작은 사용자가 세션을 펼친 뒤 confirmation deck에서만 나타납니다.
- 날씨 지표 tile은 클릭 가능한 버튼이 아니므로 hover 시 CTA처럼 강하게 반응하지 않습니다.
- graphite 표면 위의 cyan은 데이터 흐름, amber는 완료/목표/명령, coral은 위험 동작에만 사용합니다.

## 참고 문서

- `docs/research/groupware-control-shape-2026-06-04.md`
- `docs/research/futuristic-ui-selection-2026-06-05.md`
- `docs/research/workday-calendar-weather-ux-2026-06-06.md`
- `docs/modules/recording.md`
- `docs/modules/microinteractions.md`
- `docs/modules/branding.md`

## 향후 문서화할 변경

- 계정 설정 화면이 추가될 때 메뉴/폼/저장 버튼 shape 기준.
- 주간 통계나 필터가 추가될 때 segmented control과 table/list control 기준.
- 위험 동작이 늘어날 때 confirmation pattern과 danger button 기준.
