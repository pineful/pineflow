# ADR 0012: 겸임교수 공고 전용 수집 scope와 스케줄 분리

상태: Accepted

날짜: 2026-06-18

## 맥락

ADR 0011로 Trend Lens `겸임교수 공고`(academic-jobs) 보드에 하이브레인넷
신규 공고 source를 추가하고 운영에 배포한 뒤, 실제 동작을 검증하면서 두 가지를
확인했다.

- 서울 리전 Lambda는 hibrain CloudFront geo차단을 통과한다(`hibrain-recruitment`
  source가 `ready`로 관측됨). 핵심 가정은 검증됐다.
- 그러나 `scope=all` 전체 수집은 보안 RSS·전문 매체 RSS·4개 분야 Google News
  (원문 link decode 포함)·채용 게시판까지 한 번의 8초/128MB Lambda 호출에서
  외부 fetch를 수십 개 수행한다. 이 때문에 호출마다 다수 source가 2.2초 source
  timeout으로 `unavailable`로 떨어지고, 전체 실행도 8초 경계에 걸려 manual
  refresh가 간헐적으로 500을 반환한다. hibrain도 이 과부하의 영향을 받아 어떤
  run에서는 정상(`ready`), 어떤 run에서는 `unavailable`로 들쭉날쭉했다.

겸임교수 공고는 사용자가 "빠르게 확인"하려는 우선 정보인데, 무거운 전체 수집에
묶여 있으면 안정적으로 갱신되지 않는다. 이는 hibrain 추가 이전부터 있던 `scope=all`
과부하의 구조적 한계이며, source를 더 늘릴수록 악화된다.

## 결정

`security`(30분 갱신)와 동일한 패턴으로, 겸임교수 공고만 가볍게 갱신하는 전용
scope와 스케줄을 추가한다.

- `POST /api/trend-lens/refresh`의 `scope` enum에 `academic`을 추가한다.
  `academic`은 외대 채용 게시판 + 하이브레인넷 신규 공고 보드와 겸임 Google News
  (`academic-jobs` 카테고리)만 수집하고, 다른 분야 섹션은 이전 snapshot 값을
  유지한다(부분 갱신).
- EventBridge `pineflow-trend-lens-academic-refresh` 규칙을 추가해 2시간마다
  Lambda를 직접 호출(`pineflowTask: trend-lens-academic-refresh`)한다.
- `academic` 수동 갱신 cooldown은 기본 10분, `force=true` 시 1분으로 둔다.
- 기존 `scope=all` 일일 07:00 수집과 `scope=security` 30분 수집은 그대로 둔다.
  `all`은 여전히 모든 섹션을 한 번에 재구성한다.
- source allowlist, 응답 한도(512KB/2.2초), redirect 정책, 저장 payload 정책,
  공고 상세/첨부파일 미수집 원칙은 ADR 0008/0011 그대로 유지한다.

## 비용 판단

- `academic` 호출은 외부 fetch가 보드 2개 + 겸임 Google News 3개 수준으로,
  `scope=all`(수십 개)보다 훨씬 가볍다. 2시간 간격(하루 12회) 추가 호출과 소량
  DynamoDB write는 개인 사용 Free Tier 안쪽으로 예상된다.
- 새 AWS 리소스는 EventBridge 규칙 1개뿐이다. Lambda reserved concurrency 1,
  memory 128MB, **timeout 8초**, DynamoDB 1RCU/1WCU, API Gateway 1rps,
  Budgets `$1/$3/$5`는 모두 유지한다. Lambda timeout은 늘리지 않는다(가드레일
  유지). 대신 호출당 작업량을 줄여 8초 안에 안정적으로 끝나게 한다.

## 보안 판단

- `academic`도 JWT authorizer 뒤의 기존 refresh route를 그대로 쓴다. scope는
  코드에서 enum으로 제한하며 사용자 입력 URL/keyword는 사용하지 않는다.
- EventBridge 내부 이벤트는 public endpoint가 아니다.
- 부분 갱신은 sections만 병합하고, source allowlist·SSRF 방어·저장 payload 제한은
  기존과 동일하다.

## 대안

### Lambda timeout 증가

8초 → 더 길게 늘리면 전체 수집이 한 번에 끝날 수 있으나, timeout은 비용·동시성
(reserved concurrency 1) 가드레일이다. 긴 timeout은 느린 수집 호출이 단일 동시
실행 슬롯을 오래 점유해 사용자의 출퇴근 요청까지 막을 수 있다. `verify-template`이
`Timeout <= 8`을 강제하는 의도된 제약이라, 수집 작업량을 줄이는 쪽을 택했다.

### hibrain만 별도 작은 Lambda/서비스로 분리

단일 Serverless 본선·비용 가드레일과 어긋난다. 기존 Trend Lens 수집 경로에 가벼운
scope를 더하는 것으로 충분하므로 기각한다.

### academic scope를 보드(외대+hibrain)만으로 최소화

가장 가볍지만, 부분 갱신이 academic-jobs 섹션을 보드 항목만으로 덮어써 직전
`all` 수집의 지역 Google News 겸임 공고를 잃는다. academic-jobs 섹션을 매번
완전히 재구성하도록 겸임 Google News까지 포함했다(여전히 `all`의 1/4 수준 부하).

## 결과

겸임교수 공고는 무거운 전체 수집과 분리되어 2시간마다 안정적으로 갱신되고,
hibrain source도 과부하 collateral 없이 일관되게 수집된다. 기존 보안/비용/저장소
가드레일과 source 정책은 그대로 유지한다.
