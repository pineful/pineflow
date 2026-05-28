# Pineflow 작은 로고 잎 crown 보강 v22

마지막 업데이트: 2026-05-29

## 문제

헤더와 favicon처럼 작은 크기로 보는 Pineflow Mark에서 파인애플 잎이 머리카락처럼 읽힐 수 있었다. 몸통에 골드 실루엣을 추가한 것은 파인애플 판독성에 도움이 되었지만, 상단 잎이 뾰족한 조각으로 분리되어 보이면 얼굴/머리 인상이 다시 생긴다.

## 참고한 설계 기준

- Microsoft Windows app icon guidance는 앱 아이콘이 단순한 형태의 단일 메타포로 읽혀야 하고, 작은 크기에서도 선명한 실루엣을 유지해야 한다고 설명한다.
  - 참고: https://learn.microsoft.com/ka-ge/windows/apps/design/iconography/app-icon-design
- Apple Human Interface Guidelines는 앱 아이콘에서 복잡한 디테일보다 단순한 배경과 주 디자인 요소의 가독성을 우선하라고 안내한다.
  - 참고: https://developer.apple.com/design/human-interface-guidelines/app-icons
- MobileAction app icon guide는 작은 크기에서 얇은 선, 과한 디테일, 복잡한 질감을 줄이고 강한 전경/배경 대비와 안전 영역 안의 중심 형태를 유지하라고 정리한다.
  - 참고: https://www.mobileaction.co/guide/app-icon-guide/

## 결정

- 잎을 날카로운 삼각형 묶음으로 두지 않고, 곡선형 잎이 몸통 상단에 붙어 있는 `leafy crown`으로 바꾼다.
- 검은 잎은 쓰지 않는다. 작은 크기에서 머리카락처럼 보이므로 초록/민트/골드 계열로만 처리한다.
- 잎 아래에는 작은 green collar를 두어 잎이 몸통에서 자라난다는 구조를 만든다.
- 리본은 잎 위를 지나가지 않고 좌우 보조 곡선으로 유지한다. 잎과 리본이 같은 영역에서 경쟁하지 않게 한다.

## 결과

서비스 헤더 로고와 `public/pineflow-icon.svg`는 같은 v22 leafy crown 구조를 사용한다. 이 구조는 몸통의 골드 실루엣과 다이아몬드 질감은 유지하면서, 상단이 얼굴의 머리가 아니라 파인애플 crown으로 먼저 읽히게 한다.
