# ADR 0003: DynamoDB single-table 저장소

상태: 채택

날짜: 2026-05-20

## 맥락

Pineflow의 핵심 데이터는 사용자별 시간 기록, 활성 세션, 설정이다. 복잡한 join보다 사용자 partition 안에서 빠르게 읽고 쓰는 것이 중요하다.

## 결정

DynamoDB single-table 구조를 사용한다.

- `pk = USER#<cognito-sub>`
- `sk = SETTINGS`
- `sk = ACTIVE_SESSION`
- `sk = SESSION#<ISO 시간>#<session-id>`

초기에는 GSI를 만들지 않는다.

## 결과

사용자별 최근 기록과 활성 세션 접근이 단순해진다. 반면 전체 사용자 통계나 복합 검색은 바로 지원하지 않는다.

## LLM 작업 지침

새 조회 기능을 만들 때 GSI부터 추가하지 않는다. 먼저 access pattern, 예상 요청량, 비용 영향, migration 필요 여부를 문서화한다.
