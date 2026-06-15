# Pineflow CSS 구조

`src/styles.css`는 현재 레거시 진입 스타일시트다. 위험한 전면 재작성 없이 화면 안정성을 유지하기 위해 당장은 남겨두지만, 새 CSS를 이 파일 맨 아래에 날짜별 override block으로 계속 추가해서는 안 된다.

## 권장 구조

한 기능에 의미 있는 양의 스타일이 필요하면, 먼저 관련 selector를 정리한 뒤 이 디렉터리 아래에 feature 단위 파일을 만든다. 새 파일을 만들 때도 단순히 분산 저장하지 말고 “어떤 화면/컨트롤의 소유 스타일인가”가 분명해야 한다.

권장 slice:

- `tokens.css`: 색상 역할, radius, motion, focus ring 같은 design token.
- `base.css`: reset, body, typography, accessibility 기본값.
- `layout-dashboard.css`: hero, dashboard command stack, responsive page grid.
- `controls.css`: button, input, command tile, danger action.
- `recording.css`: TimeFlow graph, Session Strip, record editor.
- `trend-lens.css`: knowledge brief board와 source status.
- `weather.css`: weather deck, forecast ribbon, hourly graph.
- `operations.css`: AWS 사용량과 비용 신호 패널.

현재 분리된 feature style:

- `trend-lens-academic-jobs.css`: Trend Lens 안의 겸임교수 공고 확인 보드. 기존 `styles.css`의 읽음 상태 공통 selector를 재사용하되, 공고 보드 layout과 link 표면만 소유한다.

## 가드레일

- `src/styles.css`에 새 `YYYY-MM-DD ... pass` block을 추가하지 않는다.
- `!important`를 사용하지 않는다. selector ownership과 cascade를 고쳐 해결한다.
- CSS `@import`를 사용하지 않는다. 스타일 진입 파일은 TypeScript/Vite에서 import한다.
- CSS 주석에 후속 작업을 숨기지 않는다. `docs/status.md`나 가장 가까운 모듈 문서에 남긴다.
- UI 컨트롤 의미는 `docs/modules/ui-controls.md`와 맞춘다. data slot, selection, command action, danger action은 시각적으로 구분되어야 한다.
