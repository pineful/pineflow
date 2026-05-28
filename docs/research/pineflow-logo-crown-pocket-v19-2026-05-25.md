# Pineflow 파인애플 머리와 리본 레이어 연구 v19

마지막 업데이트: 2026-05-25

## 목적

v17의 A 방향을 유지하되, 파인애플 머리의 잎과 진행 리본이 겹치면서 레이어 관계가 불명확해지는 문제를 해결한다.

## 참고한 설계 기준

- IBM Design Language의 pictogram 기준은 작은 크기에서도 읽히는 단순한 형태, 일관된 비율, 불필요한 디테일 제거를 강조한다.
  - 참고: https://www.ibm.com/design/language/iconography/pictograms/design/
- IBM pictogram usage는 여백과 정렬, 컨테이너 안의 optical centering을 중요하게 본다.
  - 참고: https://www.ibm.com/design/language/iconography/pictograms/usage/
- Apple Human Interface Guidelines의 app icon 문서는 레이어, 안전 영역, 크롭 가능성을 고려하라고 안내한다.
  - 참고: https://developer.apple.com/design/human-interface-guidelines/app-icons
- Material icon guidance는 아이콘 내용이 지정된 live area 안에서 명확하게 유지되어야 한다는 관점을 제공한다.
  - 참고: https://m1.material.io/style/icons.html

## 검토한 해법

### 1. 잎 주변을 개별적으로 흰 외곽선 처리

장점:

- 작은 크기에서도 잎과 리본이 분리된다.

단점:

- 잎 하나하나를 따라 흰 선이 생기면 장식처럼 보이고, 로고가 복잡해진다.
- v18 검토에서 이 방식은 너무 설명적으로 보였다.

### 2. 리본을 단순히 끊기

장점:

- 리본이 뒤로 지나간다는 의미는 즉시 전달된다.

단점:

- 직선적인 단절이 생기면 의도된 레이어라기보다 잘라낸 조각처럼 보인다.
- v18 A에서 상단 리본 시작점이 딱딱하게 느껴졌다.

### 3. 잎 묶음 뒤에 하나의 부드러운 negative-space pocket 생성

장점:

- 잎을 개별 테두리로 감싸지 않아 복잡도가 낮다.
- 리본이 잎 뒤로 지나간다는 레이어 관계가 자연스럽다.
- 작은 헤더 크기와 앱 아이콘 크기에서도 잎과 리본이 분리된다.

단점:

- 포켓이 너무 크면 흰 덩어리처럼 보일 수 있어 크기를 조심해야 한다.

## v19 시안

산출물:

- `docs/assets/pineflow-logo-crown-pocket-v19.png`

### A. Crown Pocket

추천 방향이다.

- 잎 묶음 뒤에 하나의 부드러운 흰 포켓을 둔다.
- 리본은 계속 흐르지만 잎 영역에서는 뒤로 지나가는 것처럼 보인다.
- 잎은 v17보다 조금 더 compact하게 정리해 리본과 충돌하지 않게 했다.

### B. Compact Pocket

- A보다 여백과 잎 크기를 줄였다.
- 작은 앱 아이콘에는 유리하지만, 브랜드 시그널은 A보다 약하다.

### C. Open Crown

- 잎을 더 크게 열어 파인애플 인상은 강하다.
- 다만 전체 안정감이 A보다 떨어지고, 리본과의 긴장감이 커진다.

## 결론

현재 추천은 A. Crown Pocket이다. 잎을 개별적으로 흰색 외곽선 처리하지 않고, 하나의 negative-space pocket으로 묶어 처리하는 방식이 가장 상업적인 로고 품질에 가깝다. 이 방향은 리본의 흐름, 파인애플 머리의 명확성, 작은 크기에서의 판독성을 동시에 만족한다.
