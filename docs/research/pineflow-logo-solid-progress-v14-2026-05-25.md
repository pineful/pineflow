# Pineflow 굵은 단일 진행 아크 로고 시안 v14

마지막 업데이트: 2026-05-25

## 목적

이 문서는 v12 이후 사용자가 제기한 두 가지 문제를 해결한 결과를 기록한다.

- 곡선이 파인애플 로고에 비해 빈약하다.
- 다이아몬드 몸통이 간격 대비 성겨 보이고 단단함이 부족하다.

## 참고 기준

- [Material Design Icons](https://m1.material.io/style/icons.html)는 product icon이 단순하고 굵고 친근해야 하며, 제품 아이콘의 색과 핵심 요소가 브랜드 정체성을 반영해야 한다고 설명한다. 또한 product icon grid와 keyline이 요소 배치의 일관성을 만든다고 설명한다.
- [Material Design Icons](https://m1.material.io/style/icons.html)의 geometry 기준은 단순한 기본 도형의 작은 팔레트가 아이콘 시스템의 일관성을 만든다고 본다.
- [Carbon Design System Icons](https://carbondesignsystem.com/elements/icons/usage/)는 아이콘이 한눈에 메시지를 전달해야 하며, 텍스트와 함께 쓸 때 크기 비율과 색 정렬이 중요하다고 설명한다.
- [NN/g Icon Usability](https://www.nngroup.com/articles/icon-usability/)는 아이콘 의미가 즉시 명확하지 않으면 사용자가 해석 부담을 갖게 된다는 점을 기준으로 참고했다.

## 판단

패턴은 사용하지 않는다. 작은 헤더 로고와 앱 아이콘 크기에서 패턴은 질감이 아니라 잡음으로 보일 가능성이 크다.

눈에 띄는 그라데이션도 사용하지 않는다. 이전 v13 미리보기에서 절제된 그라데이션조차 줄무늬처럼 보이며 곡선을 다시 해석해야 하는 요소로 만들었다.

따라서 v14는 단색의 굵은 단일 아크를 사용한다. 힘은 색 효과가 아니라 선의 두께와 곡률에서 만든다.

## 변경 내용

- 곡선 stroke를 더 굵게 조정했다.
- 곡선 색은 단색 Pineflow green으로 정리했다.
- 점, 다이아몬드 마커, 보조선, 패턴, 눈에 띄는 그라데이션을 모두 제거했다.
- 다이아몬드 몸통은 더 큰 다이아몬드와 좁은 간격으로 재배치했다.
- 몸통은 `1-2-3-2-1` 격자를 유지하되 더 촘촘하게 만들어 안정감을 높였다.

## 현재 판단

`v14`는 지금까지의 시안 중 가장 단단하고 직관적이다. 곡선의 의미를 별도로 설명해야 하는 요소가 없고, 파인애플 몸통도 이전보다 덜 흩어져 보인다.

다음 단계에서 서비스에 반영한다면 `docs/assets/pineflow-logo-solid-progress-v14.svg`를 기준으로 앱 헤더 로고와 favicon/app icon을 제작한다.

## 산출물

- `docs/assets/pineflow-logo-solid-progress-v14.svg`
- `docs/assets/pineflow-logo-solid-progress-v14.png`
