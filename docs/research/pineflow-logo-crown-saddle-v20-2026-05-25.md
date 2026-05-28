# Pineflow 파인애플 머리 리본 saddle cut 연구 v20

마지막 업데이트: 2026-05-25

## 목적

v19의 A. Crown Pocket 방향은 유지하되, 사용자가 지적한 것처럼 리본과 파인애플 머리 사이의 흰 여백이 왜 그렇게 생겼는지 직관적으로 납득하기 어려운 문제를 해결한다.

## 참고한 설계 기준

- IBM Design Language의 아이콘 원칙은 작은 크기에서 명확하고, 정교하며, 불필요한 디테일을 줄인 형태를 강조한다.
  - 참고: https://www.ibm.com/design/language/iconography/overview/
- IBM UI icon 가이드는 그리드, 일관된 시각 무게, 주변 여백을 통해 작은 크기에서도 아이콘이 유지되도록 설계하라고 설명한다.
  - 참고: https://www.ibm.com/design/language/iconography/ui-icons/design/
- 브랜드 clear space 가이드들은 로고 주변이나 내부에서 다른 요소가 가독성을 침범하지 않도록 보호 여백을 둔다.
  - 참고: https://brand.micron.com/brand-guidelines/logo/logo-placement.html
- Material Android icon guidance는 keyline과 비율을 통해 앱 아이콘의 시각적 일관성을 유지하는 방향을 제시한다.
  - 참고: https://m2.material.io/design/platform-guidance/android-icons.html

## v19에서 버린 점

- 큰 흰 포켓을 잎 뒤에 두는 방식은 레이어 관계를 설명하긴 했지만, 흰 덩어리가 별도 장식처럼 보였다.
- 잎을 개별적으로 흰 테두리로 감싸는 방식은 작은 크기에서는 안전하지만, 전체 로고가 복잡해졌다.
- 리본을 단순히 잘라 끊는 방식은 그래픽적으로 거칠고 임시 조치처럼 보였다.

## v20 설계 방향

v20은 `saddle cut`을 사용한다. 이는 리본과 잎이 실제로 충돌하는 부분에만 작은 렌즈형 여백을 둬서, 잎 묶음이 리본 위에 올라오고 리본은 뒤로 지나가는 것처럼 보이게 하는 방식이다.

핵심 규칙:

- 여백은 잎 전체 실루엣을 따라가지 않는다.
- 여백은 큰 흰 덩어리가 아니라 작은 렌즈형 clear space로 제한한다.
- 여백 각도는 리본의 곡률과 방향에 맞춘다.
- 잎은 v19보다 짧고 compact하게 정리해 리본과의 충돌을 줄인다.

## 시안

산출물:

- `docs/assets/pineflow-logo-crown-saddle-v20.png`

### A. Saddle Cut

현재 추천 방향이다.

- v19 A의 생동감을 유지한다.
- 리본과 잎 사이의 흰 영역을 작은 saddle 형태로 줄였다.
- 브랜드 심볼로 쓸 때 가장 균형이 좋다.

### B. Compact Saddle

- 가장 통제감이 좋다.
- 작은 앱 아이콘에서는 A보다 안정적일 수 있다.
- 다만 파인애플 머리의 생동감은 A보다 조금 줄어든다.

### C. Split Underpass

- 리본이 잎 뒤로 지나간다는 구조가 가장 명시적이다.
- 그러나 분리 지점이 보여서 로고보다는 다이어그램처럼 느껴질 위험이 있다.

## 결론

현재 선택지는 A와 B를 남긴다. 기본 브랜드 로고는 A. Saddle Cut이 더 적합하고, 앱 아이콘처럼 아주 작은 크기에서는 B. Compact Saddle의 비율을 참고할 수 있다. C는 설명성은 좋지만 상업용 로고 품질 기준에서는 제외하는 것이 낫다.
