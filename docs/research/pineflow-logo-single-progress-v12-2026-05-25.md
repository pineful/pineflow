# Pineflow 단일 진행 아크 로고 시안 v12

마지막 업데이트: 2026-05-25

## 목적

이 문서는 곡선 의미가 직관적으로 읽히지 않는 문제를 해결하기 위해, Pineflow 로고의 외곽 곡선을 `단일 열린 진행 아크`로 재정의한 결과를 기록한다.

## 문제 재정의

이전 시안의 문제는 곡선이 부족했던 것이 아니라 의미가 과하게 분산된 것이었다.

- 메인 곡선과 보조 곡선이 겹쳐 두 선의 이유가 불분명했다.
- 점, 다이아몬드, 캡슐형 끝점이 왜 있는지 바로 알기 어려웠다.
- 색 변화, 마커, 보조선이 동시에 들어가면서 출퇴근/진행률/경로 중 무엇을 뜻하는지 흐려졌다.

## 조사 기준

- [NN/g Icon Usability](https://www.nngroup.com/articles/icon-usability/)는 사용자가 이미 학습한 표준이 없는 아이콘은 모호해지기 쉽고, 의미가 바로 명확하지 않으면 시각적 잡음이 된다고 설명한다.
- [Material Design Icons](https://m1.material.io/style/icons.html)는 제품 아이콘이 핵심 아이디어를 단순하고 일관된 기하 구조로 표현해야 한다고 설명한다.
- [Apple Progress Indicators](https://developer.apple.com/design/human-interface-guidelines/progress-indicators)와 [Material Progress Indicators](https://m2.material.io/components/progress-indicators)는 진행 상태를 표현할 때 사용자가 작업 흐름을 즉시 이해할 수 있어야 한다는 기준으로 참고했다.

## 통과 기준

- 곡선은 하나만 사용한다.
- 보조선, 하이라이트 분리선, 점, 다이아몬드 마커, 캡슐 마커를 제거한다.
- 시작과 끝은 별도 도형이 아니라 열린 곡선 자체로만 읽히게 한다.
- 곡선은 닫힌 원형 테두리가 아니라 비대칭 열린 progress arc여야 한다.
- 몸통은 `1-2-3-2-1` 다이아몬드 격자를 유지한다.
- 워드마크는 소문자 `pineflow` 스타일을 유지한다.

## v12 결과

`v12`는 하나의 열린 곡선만 남긴다. 이 곡선은 지도 경로가 아니라 하루의 근무 진행률을 암시한다.

별도의 점이나 도착 마커를 쓰지 않기 때문에 사용자가 “이 점은 무슨 뜻이지?”라고 해석할 요소를 줄였다. 곡선은 파인애플 몸체와 겹치지 않고 외곽에서 흐르며, 몸체는 여전히 채우지 않은 다이아몬드 격자로 유지한다.

## 현재 판단

현재까지의 로고 실험 중 가장 기준에 맞는 후보는 `docs/assets/pineflow-logo-single-progress-v12.svg`다.

다음 단계에서 서비스에 실제 반영하려면 이 SVG를 기반으로 다음 파일을 갱신한다.

- 앱 헤더 로고 컴포넌트
- favicon/app icon
- `docs/brand.md`
- `docs/modules/branding.md`

## 산출물

- `docs/assets/pineflow-logo-single-progress-v12.svg`
- `docs/assets/pineflow-logo-single-progress-v12.png`
