# Daily Intelligence 대시보드 리서치

작성일: 2026-06-07

## 사용자 요구 요약

Pineflow는 더 이상 출퇴근만 관리하는 서비스가 아니다. 사용자는 매일 리뷰해야 하는 세상 뉴스와 분석, 특히 최신 IT/사이버보안 뉴스, 만돌린 음악 트렌드, IT 콘텐츠, 교육 트렌드를 한눈에 보고 필요할 때 심층 분석으로 들어가길 원한다.

응답된 선호:

- 한국 상황 1순위, 한국에 영향을 주는 영어권 글로벌 2순위.
- 일반 정보 조사는 하루 1회면 충분하다.
- 공식 보안 위험 신호는 빠르게 확인해야 한다.
- 만돌린은 클래식, 유명 아티스트, 레슨에 도움이 되는 역사/기술 내용 선호.
- API key가 필요하면 비용이 나지 않는 쪽을 최우선으로 검토하고 SSM Parameter Store Standard를 우선한다.
- 기본은 bullet 계층 요약, 원할 때 긴 리포트로 확장한다.

## 팀 판단

### Product/IA

첫 화면을 뉴스 포털로 바꾸면 Pineflow의 가장 자주 쓰는 출퇴근 CTA와 현재 누적 시간이 밀린다. 따라서 첫 화면은 `오늘` 중심을 유지하고, 최근 기록 아래에 compact `오늘 브리프`만 둔다. 긴 분석은 `Trend Lens`라는 별도 정보 영역으로 확장한다.

### Data/Security

브라우저가 외부 뉴스/트렌드 소스를 직접 호출하면 CSP가 넓어지고 API key를 숨길 수 없다. 서버 Lambda가 allowlist 소스만 호출하고 DynamoDB에 daily snapshot을 캐시하는 구조가 가장 안전하다. 단, 원문 전문은 저장하지 않고 링크/제목/짧은 요약/근거 태그만 저장한다.

### Cost

하루 1회 전체 수집과 30분 간격 보안 확인은 개인 사용 기준 Lambda/API/DynamoDB Free Tier 안쪽으로 보인다. 그러나 무료 보장을 뜻하지 않으므로 AWS Budgets와 운영 사용량 패널은 계속 유지한다. DynamoDB는 1 RCU/1 WCU, Lambda concurrency 1을 유지한다.

## 채택한 v1 구조

- `GET /api/trend-lens`: 캐시만 읽는다. 외부 호출 없음.
- `POST /api/trend-lens/refresh`: 로그인 사용자가 수동 갱신한다.
- EventBridge daily rule: 매일 07:00 KST 전체 브리프 갱신.
- EventBridge security rule: 30분마다 보안 섹션 갱신.
- DynamoDB global cache: `SYSTEM#TREND_LENS`.
- UI: 최근 기록 아래 `Trend Lens` 섹션, brief item 5개 이하, 상세는 접힘 영역.

## v1 소스

- KISA 보안공지 RSS: 한국 우선 보안 신호.
- KISA 취약점 정보 RSS: 한국 우선 취약점 신호.
- CISA KEV JSON: 실제 악용 글로벌 보조 신호.
- Google News RSS: 만돌린/IT/교육 최신 소식. 한국 소식을 우선하고 한국에 영향을 주는 영어권 글로벌 소식을 보조로 본다.

Wikipedia, Wikimedia Pageviews, 백과사전류 문서는 매일 새로 볼 뉴스가 아니므로 일일 브리프 후보에서 제외한다. Google News RSS 결과에서도 위키/백과 계열 문서는 필터링한다.

Google Trends는 중요하지만 v1에서는 바로 붙이지 않는다. 공식 API alpha, 인증, 비용, 이용 조건을 ADR로 따로 검토한 뒤 붙인다.

## 후속 질문/작업

- 한국 IT 콘텐츠/교육 트렌드의 공식/공개 소스를 더 보강할지 결정.
- Google Trends 공식 API alpha 접근을 신청할지 결정.
- 만돌린 아티스트/레슨 소스 목록을 사용자가 직접 고정할지 결정.
- 긴 리포트 생성에 LLM을 사용할 경우 비용 상한과 API key 저장 방식을 ADR로 결정.
