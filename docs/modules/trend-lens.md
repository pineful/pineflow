# Trend Lens 모듈

마지막 업데이트: 2026-06-08

## 목적

Trend Lens는 Pineflow를 단순 출퇴근 기록 앱에서 `하루 리듬 + 지식 인텔리전스` 앱으로 확장하는 첫 모듈이다. 첫 화면의 핵심 출퇴근 흐름을 밀어내지 않고, 최근 기록 아래에 `오늘 브리프`를 작게 제공하며, 사용자가 원할 때 분야별 렌즈와 소스 상태를 펼쳐 본다.

## v1 범위

- 하루 1회 자동 수집: EventBridge Rule이 07:00 KST에 Lambda를 호출한다.
- 공식 보안 위험 신호 빠른 확인: EventBridge Rule이 30분마다 보안 섹션만 갱신한다.
- 수동 갱신: 로그인 사용자가 `POST /api/trend-lens/refresh`로 전체 또는 보안 신호를 다시 갱신할 수 있다.
- 첫 화면 표시: 최대 5개 `오늘 브리프`, 긴급 보안 신호 1개, 분야별 상세는 탭 영역.
- 저장 데이터: 제목, 링크, 출처, 발행 시각, 짧은 요약, 우선순위 근거 태그만 저장한다.

## v1에서 일부러 하지 않는 것

- 기사 전문, 유료 기사, 이미지, 영상, transcript 저장.
- 사용자가 임의 URL이나 검색어를 입력해 Lambda가 외부 fetch를 수행하는 기능.
- Google Calendar, 푸시 알림, 이메일 알림.
- LLM 긴 리포트 자동 생성.
- Google Trends API alpha 또는 API key가 필요한 소스 기본 활성화.

## 소스 정책

허용 소스는 코드에 고정된 allowlist만 사용한다. 외부 URL은 사용자가 전달할 수 없다.

- KISA 보안공지 RSS: 한국 우선 보안 신호.
- KISA 취약점 정보 RSS: 한국 우선 취약점 신호.
- CISA KEV JSON: 글로벌 보조, 실제 악용 신호.
- Wikimedia Pageviews API: 만돌린, IT 콘텐츠, 교육 분야의 공개 관심도 보조 지표.

Google Trends는 장기적으로 중요하지만, 공식 API가 alpha 성격이고 인증/사용 조건 검토가 필요하므로 v1에서는 소스 상태에 `준비`로 기록한다.

API key가 필요해지는 소스는 기본 비활성화로 시작한다. 필요 시 GitHub Secrets, Lambda 평문 환경 변수, DynamoDB에는 저장하지 않고 SSM Parameter Store Standard `SecureString`을 우선한다. Secrets Manager는 secret당 월 비용이 생길 수 있으므로 기본 후보가 아니다.

## 저장 구조

DynamoDB single-table 원칙을 유지한다.

- `pk = SYSTEM#TREND_LENS`
- `sk = TREND_LENS#LATEST`
- `sk = TREND_LENS#SNAPSHOT#YYYY-MM-DD`
- `sk = TREND_LENS#MANUAL#all`
- `sk = TREND_LENS#MANUAL#security`

Trend Lens는 개인별 설정이 생기기 전까지 global cache를 사용한다. 사용자별 주제 설정이 생기면 `USER#<sub>` 아래 별도 item으로 분리하되 GSI와 Scan은 추가하지 않는다.

## 비용/보안 가드레일

- API route는 모두 JWT authorizer를 요구한다.
- EventBridge가 호출하는 내부 이벤트는 public endpoint가 아니며 Lambda direct event에서만 처리한다.
- Lambda reserved concurrency는 계속 `1`이다.
- Lambda timeout은 외부 fetch를 고려해 8초로 제한한다.
- source별 fetch timeout은 2.2초, 응답 크기는 512KB 이하로 제한한다.
- 예외적으로 CISA KEV 공식 JSON은 현재 1.5MB 안팎이므로 `cisa-kev` 소스에만 2MB 응답 한도와 4.5초 timeout을 둔다. 다른 source의 기본 한도는 계속 512KB/2.2초다.
- 저장 전에는 제목, 요약, source 상태 메시지, reason tag를 짧게 압축한다. DynamoDB item size를 넘기지 않기 위해 원문 전문이나 긴 설명을 snapshot payload에 넣지 않는다.
- 보안 source와 분야별 관심도 source는 병렬로 수집해 전체 refresh가 Lambda timeout에 쉽게 걸리지 않게 한다.
- 수동 refresh는 기본 cooldown을 두되, 사용자가 강제 refresh를 요청하면 짧은 연타 방지 cooldown만 적용한다.
- redirect는 최대 1회만 허용하고 redirect 후에도 allowlist를 다시 검증한다.
- DynamoDB TTL `expiresAt`을 켜서 캐시/가드 item이 자연스럽게 정리되게 한다.

## UI 원칙

- Pineflow 첫 화면은 계속 `오늘의 리듬`이 중심이다.
- Trend Lens는 첫 화면의 보조 지식 공간이며, 데스크톱에서는 최근 기록 오른쪽 보조 레일의 첫 카드로 둔다.
- 날씨는 같은 보조 레일에서 Trend Lens 아래에 둔다. `최근 기록`, `Trend Lens`, `날씨`를 app shell grid에 각각 흩뿌려 배치하지 않는다.
- `오늘 브리프`는 최대 5개만 보여준다.
- 첫 브리프는 lead card로 강조하고, 나머지는 짧은 queue로 압축한다.
- 분야별 정보는 `보안`, `만돌린`, `IT 콘텐츠`, `교육` 탭으로 나누고 한 번에 한 분야만 보여준다.
- 소스 상태와 저장 정책은 별도 접힘 영역에 둔다.
- 소스 상태 영역은 기사 목록이 아니라 수집 출처 점검표다. 실제 반영된 소스를 먼저 보여주고, Google Trends처럼 아직 자동 수집하지 않는 `planned` 소스는 `후보`로 표시해 아래쪽에 둔다.
- `loading`, `refreshing`, `수집 전`, `캐시 조회 실패`, `이전 캐시`는 서로 다른 문구와 tone으로 구분한다. `캐시 대기`처럼 사용자가 기다려야 하는지 끝난 상태인지 알기 어려운 표현은 쓰지 않는다.
- `캐시 다시 조회`는 `GET /api/trend-lens`로 저장된 snapshot만 다시 읽는다. 브라우저 리로드보다 먼저 시도할 수 있는 가벼운 확인 동작이다.
- `전체 새로고침`은 `POST /api/trend-lens/refresh`로 외부 allowlist source를 다시 수집한다. 저장된 캐시가 없거나 오래됐을 때 사용하는 동작이며 단순 리로드와 혼동되지 않아야 한다.
- source 상태가 아직 없거나 캐시 조회가 실패해도 `수집 상태와 저장 정책 보기`는 비어 있으면 안 된다. 최소한 `저장된 브리프 조회`, `전체 새로고침`, `저장 정책` fallback row를 보여준다.
- 기사를 클릭해 읽으면 브라우저 `localStorage`에 읽음 상태를 저장한다. 오늘 읽은 항목은 그날 목록 위치를 유지하고 `오늘 읽음`으로 표시한다. 다음날 이후 같은 URL이 다시 나타나면 목록 아래로 보내고 흐리게 표시한다.
- 읽음 상태는 개인별 UI 보조 정보이므로 v1에서는 서버/DynamoDB에 저장하지 않는다. 여러 기기 간 읽음 동기화가 필요해지면 사용자별 item 설계와 비용/마이그레이션 문서를 먼저 추가한다.
- 비용 신호등과 보안 신호는 혼동하지 않는다. 비용은 운영 상태, 보안은 외부 인텔리전스다.

## 수동 검증

외부 allowlist source의 실제 응답 크기와 파싱 가능 여부는 필요할 때 다음 명령으로 확인한다.

```powershell
cd infra
$env:NODE_OPTIONS='--use-system-ca'
npm run check:trend-lens-sources
```

이 검증은 공개 source를 직접 조회하므로 기본 `npm run verify`에는 넣지 않는다. 배포 전 원인 불명의 Trend Lens 조회 오류가 생기면 먼저 이 스크립트로 source 응답 크기와 파싱 가능 여부를 확인한다.
