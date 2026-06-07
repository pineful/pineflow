# Trend Lens 모듈

마지막 업데이트: 2026-06-07

## 목적

Trend Lens는 Pineflow를 단순 출퇴근 기록 앱에서 `하루 리듬 + 지식 인텔리전스` 앱으로 확장하는 첫 모듈이다. 첫 화면의 핵심 출퇴근 흐름을 밀어내지 않고, 최근 기록 아래에 `오늘 브리프`를 작게 제공하며, 사용자가 원할 때 분야별 렌즈와 소스 상태를 펼쳐 본다.

## v1 범위

- 하루 1회 자동 수집: EventBridge Rule이 07:00 KST에 Lambda를 호출한다.
- 공식 보안 위험 신호 빠른 확인: EventBridge Rule이 30분마다 보안 섹션만 갱신한다.
- 수동 갱신: 로그인 사용자가 `POST /api/trend-lens/refresh`로 전체 또는 보안 신호를 다시 갱신할 수 있다.
- 첫 화면 표시: 최대 5개 `오늘 브리프`, 긴급 보안 신호 1개, 분야별 상세는 접힘 영역.
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
- redirect는 최대 1회만 허용하고 redirect 후에도 allowlist를 다시 검증한다.
- DynamoDB TTL `expiresAt`을 켜서 캐시/가드 item이 자연스럽게 정리되게 한다.

## UI 원칙

- Pineflow 첫 화면은 계속 `오늘의 리듬`이 중심이다.
- Trend Lens는 첫 화면의 보조 지식 공간이다.
- `오늘 브리프`는 최대 5개만 보여준다.
- 세부 정보는 `분야별 렌즈와 소스 상태 보기` 안에 둔다.
- 비용 신호등과 보안 신호는 혼동하지 않는다. 비용은 운영 상태, 보안은 외부 인텔리전스다.
