# Futuristic UI 적용 리서치

날짜: 2026-06-05

## 목적

Dribbble의 `futuristic-ui` 태그에서 보이는 시각 문법 중 Pineflow에 맞는 요소만 선별해 전체 UI 스타일에 반영한다. 목표는 SF 장식이 아니라, 개인 출퇴근 기록 서비스가 더 정밀하고 세련된 시간 계기판처럼 보이게 하는 것이다.

## 참고 자료

- Dribbble `futuristic-ui` 태그: https://dribbble.com/tags/futuristic-ui
- 페이지에서 확인한 주요 계열: AI 챗 인터페이스, 다크 태스크 위젯, 크리에이터 분석 앱, 협업 앱, 항공 대시보드, 사이버보안 대시보드, bento card 자동화 UI.

## 팀별 판단

### 레퍼런스 분석

Dribbble의 미래형 UI는 어두운 패널, 얇은 발광 라인, 카드 기반 정보 위계, 작은 데이터 시각화, 부드러운 gradient/glow를 공통적으로 사용한다. Pineflow에는 Web3/사이버보안식 과장보다 task widget, bento dashboard, aviation dashboard의 읽기 좋은 계기판 문법이 더 적합하다.

### UX 적합성

Pineflow의 첫 화면 우선순위는 여전히 `Calm Live Board -> 기록 조작 -> 최근 기록 -> 날씨/요약/운영 사용량`이다. 미래형 스타일이 IA를 바꾸면 안 된다. 그래프와 CTA가 같은 시야 안에 있어야 하며, 비용 신호등은 작고 안심 가능한 상태 요약으로 남아야 한다.

### 구현 리스크

기존 문서가 `Structured Soft Rectangle`, 자동 반복 모션 금지, 모바일 우선 기록 흐름을 강하게 요구한다. 따라서 새 JSX를 늘리기보다 `src/styles.css`의 surface, border, shadow, focus, chart treatment를 통일하는 방식이 안전하다.

## 채택한 방향

이 변경의 스타일 이름은 `Quiet Telemetry Glass`로 둔다.

- 상단 히어로는 딥 파인 그린 기반의 조용한 instrument panel로 만든다.
- 배경은 큰 장식 오브젝트 대신 아주 약한 grid를 사용한다.
- 카드와 패널은 밝은 뉴트럴 surface에 얇은 luminous border와 낮은 shadow를 적용한다.
- 시간 그래프는 실제 기록 기반 데이터 시각화로 유지하되, grid, line weight, marker의 정밀감을 높인다.
- 날씨는 `Forecast Ribbon` 안에서만 하늘빛과 햇빛 골드를 보조 색으로 쓴다.
- 비용/운영 사용량은 CloudWatch/Free Tier 요약을 읽는 하단 telemetry card로 보이게 한다.
- I/O 컨트롤은 새 스타일의 핵심이다. 버튼은 낮은 패널 버튼, 강한 CTA, selected toggle, danger action으로 분리하고, 입력창은 왼쪽 mint accent와 inset shadow가 있는 데이터 슬롯처럼 보이게 한다.

## 2026-06-05 I/O 스타일 보강

초기 적용은 카드와 배경 표면에 치우쳐 사용자가 전체 UI 변화를 체감하기 어려웠다. 후속 보강에서는 다음 요소를 더 분명히 바꿨다.

- 출근/퇴근 CTA: 골드에서 파인 그린으로 이어지는 강한 command button.
- 기록 종류와 업무 메모 후보: selected 상태가 딥 그린/mint/gold accent로 확실히 보이는 toggle.
- 텍스트 입력: 일반 흰 박스가 아니라 mint side rail과 inset shadow가 있는 data input slot.
- 기록 수정 화면: 날짜 rail, 오전/오후 segmented control, 시/분 입력, 빠른 보정, 저장/취소 버튼을 서로 다른 역할로 분리.
- 계정 메뉴, 상세 펼침, 목표 수정: 낮은 보조 패널 버튼으로 통일.
- 삭제/로그아웃: coral danger surface로 일반 보조 실행과 분리.

## 2026-06-05 시각 체감 보강

I/O 보강 이후에도 상단 `Calm Live Board`와 아래 반복 카드가 기존의 밝은 흰 카드로 남아 있으면 전체 화면은 거의 바뀌지 않은 것처럼 보인다. 따라서 스타일 적용의 기준을 “작은 컨트롤 변경”에서 “첫 화면 핵심 면적 변경”으로 높였다.

- `Calm Live Board`: 흰 카드가 아니라 딥 그린 telemetry board로 전환하고, 그래프 canvas, 축, marker, 상태 배지를 모두 같은 어두운 계기판 안에서 읽히게 한다.
- 최근 기록: 흰 리스트 카드 대신 어두운 glass record card와 왼쪽 mint/gold rail을 사용해 기록 데이터도 새 스타일 일부로 보이게 한다.
- 날씨: `Forecast Ribbon`은 어두운 shell 안에 밝은 현재 날씨/예보 슬롯을 얹는 구조로 바꿔, 대시보드와 분리되면서도 같은 제품 언어를 유지한다.
- 운영 사용량: 하단 비용/운영 지표는 딥 그린 shell과 밝은 상세 데이터 슬롯을 함께 쓰는 telemetry panel로 둔다.
- CTA: 출근/퇴근 버튼은 기존 노란 버튼처럼 보이더라도 내부 frame, 강한 border, command-button shadow를 가져야 한다.

배경에 선 몇 개를 추가하거나 hover만 바꾸는 변경은 Pineflow의 미래형 UI 적용으로 인정하지 않는다. 사용자가 첫 화면을 1초만 봐도 상단 보드, 기록, 날씨, 비용 패널의 표면 언어가 바뀐 것을 알 수 있어야 한다.

## 버린 요소

- 전체 화면을 검정, 보라, 전기 파랑 네온으로 덮는 cyberpunk/Web3 스타일.
- 항공 HUD의 조준선, 레이더, 전투기 관제처럼 긴장감을 만드는 표현.
- 자동 scanline, shimmer, pulse, line draw 애니메이션.
- 큰 3D 오브젝트, 장식용 floating panel, 과한 blur/glassmorphism.
- 모든 버튼을 pill로 만들거나 모든 카드를 같은 시각 강도로 만드는 패턴.

## 구현 메모

- 핵심 변경 파일은 `src/styles.css`다.
- UI 원칙은 `docs/modules/ui-controls.md`, 대시보드 원칙은 `docs/modules/summary.md`, 날씨 원칙은 `docs/modules/weather.md`에 반영한다.
- 이번 변경은 AWS 리소스, API, 인증, 저장소, 비용 정책을 바꾸지 않는다. ADR은 필요하지 않다.
