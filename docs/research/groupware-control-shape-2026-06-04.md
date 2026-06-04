# 그룹웨어 UI 컨트롤 외곽 리서치

## 목적

Pineflow의 전체 UI 컨트롤 외곽을 그룹웨어형 업무 도구에 맞게 정리하기 위해, 역할이 다른 분석팀 관점으로 현재 화면과 주요 디자인 시스템을 검토했습니다.

이번 리서치는 레이아웃 전체 개편이 아니라 버튼, 입력, 선택지, 카드, 위험 동작의 shape/elevation/focus 규칙을 정하는 데 초점을 둡니다.

## 분석팀별 결론

### 업무 IA 팀

- 그룹웨어형 도구에서는 반복 조작의 예측 가능성이 가장 중요합니다.
- 출근/퇴근 CTA는 한 화면 안에서 가장 강한 실행 버튼으로 유지해야 합니다.
- 최근 기록과 수정 패널은 사용자가 실수 직후 바로 고칠 수 있어야 하므로 compact form을 유지합니다.
- pill은 상태 배지처럼 작은 보조 정보에만 적합합니다. 주요 버튼을 pill로 만들면 조작 표면의 기준이 흐려집니다.

### 디자인 시스템 팀

- 기존 UI는 `8px radius + 옅은 녹색 border + 반투명 흰 표면`이 너무 많은 요소에 반복되어, 입력/선택/읽기/실행의 형태 차이가 약했습니다.
- 카드, 입력, 선택, 보조 버튼, danger 버튼에 각각 다른 외곽 문법이 필요합니다.
- shadow는 모든 카드에 쓰기보다 팝오버와 toast 같은 레이어에 제한하는 편이 조용한 업무 화면에 맞습니다.

### 보안/운영 UX 팀

- 저장/삭제/로그아웃처럼 상태를 바꾸는 버튼은 선택지만 바꾸는 버튼과 외곽이 달라야 합니다.
- 삭제 1단계와 로그아웃은 일반 보조 버튼처럼 보이면 실수 가능성이 있습니다.
- danger 동작은 hover/focus에서도 위험 의미가 유지되어야 합니다.
- disabled 상태는 저장 중, 쿨다운, 미구현 기능을 같은 시각 문법으로 처리하지 않는 것이 좋습니다.

## 외부 디자인 시스템 확인

- Microsoft Fluent 2는 rectangle, circle, pill, beak 같은 단순 shape를 구분하고, 일반 컴포넌트와 컨테이너에는 rectangle을 기본으로 둡니다.
- Atlassian Design System은 radius token과 focus radius를 함께 다루며, interactive component의 focus ring을 일관되게 관리합니다.
- Atlassian elevation 기준은 flat card에는 border를 쓰고, 강한 elevation은 modal, dropdown, floating toolbar처럼 화면 위에 뜨는 UI에 예약합니다.

## 채택 방향

Pineflow에는 `Structured Soft Rectangle` 방향을 채택합니다.

- 기본은 사각형입니다.
- 업무 화면답게 모서리 반경을 낮춰 조작 표면을 단정하게 만듭니다.
- 카드와 패널은 `8px`, 입력/선택/보조 버튼은 `5-6px`, 상태 배지와 작은 칩은 pill을 사용합니다.
- 실행 버튼, 선택 컨트롤, 입력 필드, 위험 버튼은 border/fill/focus ring으로 서로 다른 역할이 바로 읽혀야 합니다.
- visual novelty보다 기록 실수 방지와 반복 조작 효율을 우선합니다.

## 탈락한 방향

- 모든 버튼을 pill로 만드는 방향: 개인 앱처럼 부드럽게 보일 수 있지만 그룹웨어형 기록 도구에서는 실행/선택/상태가 섞입니다.
- 모든 카드를 같은 8px 박스로 두는 방향: 기존 문제를 반복합니다.
- 강한 shadow를 카드마다 넣는 방향: 대시보드가 떠 있는 박스들의 모음처럼 보여 상단 시간 정보의 우선순위가 흐려집니다.
- 과감한 shape 변주를 쓰는 방향: Pineflow의 저비용 개인 업무 도구 맥락에는 과합니다.

## 적용 결과

- `src/styles.css`에 radius/focus/elevation token을 추가했습니다.
- 계정 메뉴의 로그아웃은 일반 메뉴 항목과 분리된 danger 계열 외곽을 씁니다.
- 기록 설정, 기록 수정, 날짜 레일, 오전/오후, 시/분 입력, 빠른 보정, 저장/취소가 각 역할에 맞는 반경과 border를 갖도록 정리했습니다.
- 반복 카드 shadow는 낮추고, 팝오버/toast 같은 레이어 중심으로 elevation을 남겼습니다.

## 참고한 공식 문서

- Microsoft Fluent 2 Shapes: https://fluent2.microsoft.design/shapes
- Atlassian Radius: https://atlassian.design/foundations/radius/
- Atlassian Elevation: https://design-system-docs-proxy.services.atlassian.com/foundations/elevation/
