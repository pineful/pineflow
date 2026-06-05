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
