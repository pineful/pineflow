# CSS 아키텍처 모듈

## 책임

이 문서는 Pineflow의 CSS가 기능 수정 때마다 계속 누적되는 것을 막기 위한 구조와 검증 기준을 정의한다. 시각 디자인 원칙은 `docs/modules/ui-controls.md`가 맡고, 이 문서는 CSS 파일을 어디에 두고 어떤 방식으로 확장할지 다룬다.

## 현재 상태

현재 앱은 `src/styles.css` 단일 파일에 대부분의 UI 스타일이 모여 있다. 이 파일에는 2026년 6월 여러 UI 개편 과정에서 날짜별 override pass가 누적되어 있으며, 단기적으로는 안정성을 위해 유지하지만 장기적으로 계속 덧붙이면 유지보수성이 급격히 나빠진다.

따라서 `src/styles.css`는 legacy entry stylesheet로 본다. 새 기능을 추가할 때 파일 끝에 또 다른 override block을 붙이는 방식은 금지한다.

## 확장 규칙

- 작은 버그 수정은 기존 selector가 정의된 위치를 찾아 수정한다.
- 같은 feature surface를 여러 곳에서 override하고 있다면 새 rule을 추가하기 전에 기존 rule을 통합한다.
- 80줄을 넘는 신규 스타일이 필요하면 `src/styles/` 아래에 feature 단위 파일을 만드는 것을 우선 검토한다.
- CSS module을 추가할 때는 `src/styles/README.md`의 권장 slice 이름을 따른다.
- CSS 파일 분리는 시각 변경이 아니라 구조 변경이므로, 실제 selector ownership을 함께 정리하고 `docs/architecture.md`, `docs/workstreams.md`를 갱신한다.
- `!important`, CSS `@import`, 날짜별 override pass, TODO/FIXME/HACK 주석은 금지한다.

## 자동 검증

루트 `npm run build`는 먼저 `npm run verify:css`를 실행한다. 이 검증은 다음을 막는다.

- `src/styles.css`의 `CSS ARCHITECTURE GUARDRAIL` 헤더 제거
- 현재 기준선을 넘는 무분별한 파일 증가
- 날짜별 override block 추가
- `!important` 사용
- CSS `@import` 사용
- TODO/FIXME/HACK 주석 누적

기준선을 올려야 할 정도로 CSS가 늘어난다면 먼저 기존 rule을 통합하거나 `src/styles/` module로 분리해야 한다. 기준선 증가는 단순 수치 변경이 아니라 리팩토링 계획과 함께 문서화한다.

## 목표 구조

장기 목표는 다음처럼 역할별로 분리된 CSS 트리다.

```text
src/styles/
  tokens.css
  base.css
  layout-dashboard.css
  controls.css
  recording.css
  trend-lens.css
  weather.css
  operations.css
```

이 구조로 이동할 때도 한 번에 모든 파일을 쪼개지 않는다. 화면 단위 변경이 있을 때 해당 surface의 selector ownership을 정리하면서 작은 커밋으로 이동한다.
