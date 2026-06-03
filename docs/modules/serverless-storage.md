# 모듈 설계: Serverless 저장소

## 설계 의도

개인 출퇴근 기록은 사용자별 시간순 기록이 핵심이다. 복잡한 join보다 사용자 partition 안에서 최근 기록과 활성 세션을 빠르게 읽는 것이 중요하므로 DynamoDB single-table 구조를 사용한다.

## 키 구조

- `pk = USER#<cognito-sub>`
- `sk = SETTINGS`
- `sk = ACTIVE_SESSION`
- `sk = SESSION#<ISO 시간>#<session-id>`

## 비용 정책

- 초기 capacity는 `1 RCU / 1 WCU`.
- GSI는 만들지 않는다.
- DynamoDB table은 deletion protection과 retain policy를 적용한다.

## 백업과 이관 방향

- 운영 전환 전 PostgreSQL PoC 데이터가 있다면 JSON 또는 CSV로 export한다.
- Cognito 사용자 `sub`와 기존 owner key를 매핑한 뒤 DynamoDB item 형식으로 변환한다.
- import 후 record count와 표본 기록을 검증한다.

## 기록 시간 보정

- 최근 기록의 출근/퇴근 시각 보정은 세션 item을 직접 갱신한다.
- 기록 종류 `mode`와 메모 `note` 보정도 같은 세션 item에 저장한다. 이 값은 세션 단위 속성이므로 출근/퇴근 record 중 어느 쪽에서 수정해도 같은 세션의 양쪽 record에 함께 반영된다.
- `GET /api/state`의 최근 기록 응답은 DynamoDB query의 `SESSION#<checkInAt>` 정렬 결과를 그대로 노출하지 않고, 세션을 출근/퇴근 이벤트로 펼친 뒤 각 record의 실제 `timestamp` 기준 최신순으로 정렬한다. 퇴근 시각만 나중으로 보정된 기록이나 자정을 넘긴 세션이 세션 시작일 위치에 묶여 보이지 않게 하기 위한 규칙이다.
- 퇴근 시각 보정은 기존 `SESSION#...` item의 `checkOutAt`만 갱신한다.
- 출근 시각 보정은 최근 기록 정렬이 틀어지지 않도록 `SESSION#<ISO 시간>#<session-id>` 정렬 키를 새 시간으로 이동한다. 구현은 기존 item 삭제와 새 item 생성을 하나의 DynamoDB transaction으로 묶는다.
- 활성 세션의 출근 시각, `mode`, `note`를 보정하는 경우 `ACTIVE_SESSION.sessionSk`, `ACTIVE_SESSION.checkInAt`, `ACTIVE_SESSION.mode`, `ACTIVE_SESSION.note`도 같은 transaction에서 맞춘다.
- 이 기능은 GSI 없이 최근 세션 query 결과에서 `sessionId`를 찾는다. 개인 사용과 낮은 기록량을 전제로 한 선택이며, 검색/통계 패턴이 명확해지기 전에는 인덱스를 추가하지 않는다.

## 변경 시 주의점

- 조회 패턴이 늘어나기 전에는 GSI를 추가하지 않는다.
- 기록 item의 `sk` 형식은 시간순 정렬을 전제로 하므로 임의 변경하면 migration 계획이 필요하다.
- table 삭제나 교체가 필요한 변경은 반드시 export 백업을 먼저 만든다.
