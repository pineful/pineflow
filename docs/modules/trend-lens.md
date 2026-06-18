# Trend Lens 모듈

마지막 업데이트: 2026-06-15

## 목적

Trend Lens는 Pineflow를 단순 출퇴근 기록 앱에서 `하루 리듬 + 지식 인텔리전스` 앱으로 확장하는 첫 모듈이다. 첫 화면의 핵심 출퇴근 흐름을 밀어내지 않되, 최근 기록 긴 목록이 대시보드 보관함으로 이동한 뒤에는 하단 지식 영역의 가로 폭을 충분히 사용해 분야별 신호를 더 잘 스캔하게 한다.

## v1 범위

- 하루 1회 자동 수집: EventBridge Rule이 07:00 KST에 Lambda를 호출한다.
- 보안 위험 신호 빠른 확인: EventBridge Rule이 30분마다 보안 섹션만 갱신한다. KISA/CISA는 확인된 공식 신호로, 전문 보안 매체 RSS는 더 빠른 현장 신호로 구분한다.
- 수동 갱신: 로그인 사용자가 `POST /api/trend-lens/refresh`로 전체 또는 보안 신호를 다시 갱신할 수 있다. `reset=true`이면 Trend Lens 전용 캐시를 삭제하고 이전 snapshot 없이 다시 수집한다.
- 첫 화면 표시: 최대 5개 `오늘 브리프`, 긴급 보안 신호 1개, 겸임교수 공고 확인 보드, 분야별 상세는 탭 영역.
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
- The Hacker News, BleepingComputer, SecurityWeek, Help Net Security RSS: 공식 advisory보다 빠르게 움직이는 글로벌 전문 보안 뉴스. `전문 매체`, `빠른 보안 뉴스` 태그로 표시해 공식 공지와 구분한다.
- Google News RSS: 만돌린, IT 콘텐츠, 교육 분야의 최신 소식. 한국 소스를 우선하고, 한국에 영향을 줄 수 있는 영어권 글로벌 소스를 보조로 본다.
- 한국외국어대학교 공식 채용 게시판: 외대 글로벌캠퍼스 겸임교수 모집 공고 확인의 1순위 source다. 서버 렌더링 HTML에서 제목, 작성일, 원문 링크만 추출한다.
- Google News RSS 겸임교수 고정 query: 서울·경기·충북 대학 겸임교수 모집 공고 후보를 보조로 찾는다. `겸임`과 `모집/초빙/채용/공고/임용/위촉`이 제목/요약에 같이 있는 항목만 남기고, 합격자 발표/조교/직원 공고는 제외한다.

Wikipedia, Wikimedia Pageviews, 백과사전, wiki mirror는 매일 볼 뉴스가 아니므로 Trend Lens 일일 브리프 source로 쓰지 않는다. Google News RSS 결과에서도 위키/백과 계열 문서는 필터링한다.

Google News RSS가 제공하는 `news.google.com/rss/articles/...` 중간 URL은 사용자 클릭 링크로 저장하지 않는다. Lambda는 Google News article page와 `DotsSplashUi` decode endpoint만 allowlist로 제한 조회해 publisher 원문 URL을 우선 추출한다. 이 publisher URL은 사용자가 클릭할 표시 URL로만 저장하며, Lambda가 publisher URL을 추가 fetch하지 않는다. decode가 실패한 항목에만 기사 제목과 출처명으로 만든 Google News 검색 URL을 fallback으로 사용한다.

Google Trends는 장기적으로 중요하지만, 공식 API가 alpha 성격이고 인증/사용 조건 검토가 필요하므로 v1에서는 소스 상태에 `후보`로 기록한다.

API key가 필요해지는 소스는 기본 비활성화로 시작한다. 필요 시 GitHub Secrets, Lambda 평문 환경 변수, DynamoDB에는 저장하지 않고 SSM Parameter Store Standard `SecureString`을 우선한다. Secrets Manager는 secret당 월 비용이 생길 수 있으므로 기본 후보가 아니다.

## 저장 구조

DynamoDB single-table 원칙을 유지한다.

- `pk = SYSTEM#TREND_LENS`
- `sk = TREND_LENS#LATEST`
- `sk = TREND_LENS#SNAPSHOT#YYYY-MM-DD`
- `sk = TREND_LENS#MANUAL#all`
- `sk = TREND_LENS#MANUAL#security`
- `sk = TREND_LENS#RESET#all`

Trend Lens는 개인별 설정이 생기기 전까지 global cache를 사용한다. 사용자별 주제 설정이 생기면 `USER#<sub>` 아래 별도 item으로 분리하되 GSI와 Scan은 추가하지 않는다.

`완전 새로 받기`는 위 `SYSTEM#TREND_LENS` partition 안의 `LATEST`와 날짜 snapshot만 삭제한다. 출퇴근 기록, 사용자 설정, 운영 사용량 cache는 대상이 아니다. 실수 연타를 막기 위해 reset guard는 삭제하지 않고 1분 cooldown을 적용한다.

## 비용/보안 가드레일

- API route는 모두 JWT authorizer를 요구한다.
- EventBridge가 호출하는 내부 이벤트는 public endpoint가 아니며 Lambda direct event에서만 처리한다.
- Lambda reserved concurrency는 계속 `1`이다.
- Lambda timeout은 외부 fetch를 고려해 8초로 제한한다.
- source별 fetch timeout은 2.2초, 응답 크기는 512KB 이하로 제한한다.
- 예외적으로 CISA KEV 공식 JSON은 현재 1.5MB 안팎이므로 `cisa-kev` 소스에만 2MB 응답 한도와 4.5초 timeout을 둔다. 다른 source의 기본 한도는 계속 512KB/2.2초다.
- Google News 원문 링크 decode는 feed당 상위 3개 후보에만 적용하고, article page는 1.5MB/1.8초, decode 응답은 64KB/1.8초로 제한한다. 실패하면 해당 항목만 검색 fallback으로 내려가며 전체 브리프 수집은 실패하지 않는다.
- 한국외대 공식 채용 게시판은 512KB/2.2초 기본 source 한도 안에서만 읽는다. 원문 상세 페이지를 추가 fetch하지 않고 목록의 작성일과 링크만 저장한다.
- 저장 전에는 제목, 요약, source 상태 메시지, reason tag를 짧게 압축한다. DynamoDB item size를 넘기지 않기 위해 원문 전문이나 긴 설명을 snapshot payload에 넣지 않는다.
- 보안 source와 분야별 뉴스 source는 병렬로 수집해 전체 refresh가 Lambda timeout에 쉽게 걸리지 않게 한다. 보안 전문 매체 RSS는 모두 512KB/2.2초 기본 한도를 적용하며, 응답이 느리거나 실패하면 해당 source status만 `unavailable`로 낮춘다.
- 보안 신호와 뉴스 item은 `publishedAt`을 가능한 한 보존한다. 보안 위험 신호의 판단에는 게재일/등록일이 중요하므로 UI에서도 반드시 표시한다.
- CVE 번호가 제목의 핵심으로 노출되는 보안 항목은 저장 전에 `짧은 취약점 설명 · CVE-...` 형태로 보강한다. CISA KEV의 vendor/product/취약점 설명과 같은 refresh 안의 CVE 교차 참조를 우선 사용하고, 없으면 KISA RSS 요약의 첫 유효 문장을 짧게 사용한다. NVD 같은 CVE별 외부 조회를 항목마다 추가하려면 비용, timeout, source allowlist, 저장 payload 정책을 ADR로 먼저 검토한다.
- 수동 refresh는 기본 cooldown을 두되, 사용자가 강제 refresh를 요청하면 짧은 연타 방지 cooldown만 적용한다.
- redirect는 최대 1회만 허용하고 redirect 후에도 allowlist를 다시 검증한다.
- DynamoDB TTL `expiresAt`을 켜서 캐시/가드 item이 자연스럽게 정리되게 한다.

## UI 원칙

- Pineflow 첫 화면은 계속 `오늘의 리듬`이 중심이다.
- Trend Lens는 첫 화면의 보조 지식 공간이며, 데스크톱에서는 최근 기록 목록이 사라진 하단 폭을 활용해 분야별 브리프를 동시에 훑을 수 있는 넓은 보드로 둔다.
- 날씨는 현재 시각 대시보드의 기본 요약과 펼침 상세로 이동한다. Trend Lens 아래에 별도 날씨 카드를 중복 배치하지 않는다.
- `오늘 브리프`는 최대 5개만 보여준다.
- 첫 브리프는 lead card로 강조하고, 나머지는 짧은 queue로 압축한다.
- 분야별 정보는 넓은 화면에서는 `보안`, `만돌린`, `IT 콘텐츠`, `교육`, `겸임교수 공고` 카테고리 카드를 동시에 보여주고, 좁은 화면에서는 기존 탭으로 한 분야씩 전환한다.
- 겸임교수 공고 보드는 외대 글로벌캠퍼스 확인 결과를 먼저 보여주고, 아래에는 `외국어대학교 공고`와 `서울·경기·충북 공고`를 나누어 보여준다. 공식 게시판 확인 실패와 공식 확인 후 공고 없음은 같은 메시지로 처리하지 않는다.
- 소스 상태와 저장 정책은 별도 접힘 영역에 둔다.
- 소스 상태 영역은 기사 목록이 아니라 수집 출처 점검표다. 실제 반영된 소스를 먼저 보여주고, Google Trends처럼 아직 자동 수집하지 않는 `planned` 소스는 `후보`로 표시해 아래쪽에 둔다.
- `loading`, `refreshing`, `수집 전`, `캐시 조회 실패`, `이전 캐시`는 서로 다른 문구와 tone으로 구분한다. `캐시 대기`처럼 사용자가 기다려야 하는지 끝난 상태인지 알기 어려운 표현은 쓰지 않는다.
- `캐시 다시 조회`는 `GET /api/trend-lens`로 저장된 snapshot만 다시 읽는다. 브라우저 리로드보다 먼저 시도할 수 있는 가벼운 확인 동작이다.
- `전체 새로고침`은 `POST /api/trend-lens/refresh`로 외부 allowlist source를 다시 수집한다. 저장된 캐시가 없거나 오래됐을 때 사용하는 동작이며 단순 리로드와 혼동되지 않아야 한다.
- `완전 새로 받기`는 기존 Trend Lens snapshot을 삭제한 뒤 `scope=all`로 다시 수집한다. 링크 해독 정책이 바뀌었거나 잘못된 cache가 남아 있을 때 쓰는 정리 동작이다.
- source 상태가 아직 없거나 캐시 조회가 실패해도 `수집 상태와 저장 정책 보기`는 비어 있으면 안 된다. 최소한 `저장된 브리프 조회`, `전체 새로고침`, `저장 정책` fallback row를 보여준다.
- 보안 섹션은 공식 확인 신호와 빠른 전문 매체 신호를 함께 보여준다. 전문 매체 기사는 속도가 빠른 대신 공식 확인이 아닐 수 있으므로 reason tag에 `전문 매체`를 표시한다.
- `CVE-...`만 보이는 제목은 사용자가 바로 판단하기 어렵다. 보안 카드의 제목에는 CVE 앞에 제품/취약점 유형/영향을 짧게 붙이고, CVE 번호는 추적용 식별자로 뒤에 둔다.
- 기사를 클릭해 읽으면 브라우저 `localStorage`에 읽음 상태를 저장한다. 오늘 읽은 항목은 그날 목록 위치를 유지하고 `오늘 읽음`으로 표시한다. 다음날 이후 같은 URL이 다시 나타나면 목록 아래로 보내고 흐리게 표시한다.
- 읽음 상태 key, 저장/복원, 오늘/이전 읽음 판정, Google News 중간 URL fallback은 `src/trendReadState.ts`에 둔다. `App.tsx`에는 localStorage parsing이나 link fallback 계산을 다시 늘리지 않는다.
- 읽음 상태는 메타 텍스트만으로 표시하지 않는다. 오늘 읽은 항목도 카드/리스트 본문을 살짝 흐리게 하고 체크 아이콘을 붙여, 다시 열었을 때 이미 본 글인지 즉시 구분되어야 한다. 다음날 이후의 읽은 항목은 더 흐리게 유지한다.
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

## 향후 확장: CVE 외부 조회와 keyed source (ADR 0010)

CVE 심각도(CVSS) 외부 보강(NVD)과 API key가 필요한 source(SSM SecureString,
기본 비활성화) 확장 방침은 `docs/adr/0010-trend-lens-cve-enrichment-and-keyed-sources.md`에서
결정했다. 핵심 제약:

- 외부 CVE 조회는 `services.nvd.nist.gov` 하나만 allowlist에 고정하고, 조회 대상
  CVE는 수집한 CISA KEV item에서 추출한 것만 쓴다. 사용자 입력 CVE/URL은 금지.
- `all` scope 전체 수집에서만 회당 최대 5개 CVE를 보강하고, 실패는 비치명적으로
  `nvd-cve` source status에만 기록한다.
- API key는 SSM SecureString에서만 읽고 평문 env/Secrets/DynamoDB에 두지 않는다.
- 구현은 ADR 게이트(승인 + 배포 후 e2e)를 따르며, 구현 시 API 계약/보안/비용/
  배포 체크리스트와 `verify-template.mjs` 가드레일을 함께 갱신한다.
