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

## 변경 시 주의점

- 조회 패턴이 늘어나기 전에는 GSI를 추가하지 않는다.
- 기록 item의 `sk` 형식은 시간순 정렬을 전제로 하므로 임의 변경하면 migration 계획이 필요하다.
- table 삭제나 교체가 필요한 변경은 반드시 export 백업을 먼저 만든다.
