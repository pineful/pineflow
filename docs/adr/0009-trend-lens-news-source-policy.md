# ADR 0009: Trend Lens news source policy

상태: 승인

날짜: 2026-06-08

## 배경

Trend Lens는 사용자가 매일 확인할 만한 보안 신호, 만돌린 소식, IT 콘텐츠 흐름, 교육 트렌드를 짧게 모아 보여주기 위해 추가되었다.

초기 구현은 만돌린, IT 콘텐츠, 교육 분야에 Wikimedia Pageviews를 사용했다. 그러나 Pageviews와 Wikipedia 문서는 관심도 보조 지표 또는 정적 지식 문서일 뿐, 매일 새로 확인할 뉴스가 아니다. 사용자는 “매일 볼 이유가 있는 의미 있는 소식과 정보”를 원한다.

## 결정

- 보안 분야는 KISA 보안공지 RSS, KISA 취약점 정보 RSS, CISA KEV JSON을 유지한다.
- 만돌린, IT 콘텐츠, 교육 분야는 코드에 고정된 Google News RSS allowlist query를 사용한다.
- 한국 소식을 1순위로 보고, 한국에 영향을 줄 수 있는 영어권 글로벌 소식을 보조로 본다.
- Wikipedia, Wikimedia Pageviews, 백과사전, wiki mirror 계열 문서는 일일 브리프 source로 사용하지 않는다.
- Google News RSS 결과에서도 Wikipedia, Wikimedia, Wikiwand, Britannica, Encyclopedia, Fandom, DBpedia 계열 항목은 제외한다.
- 보안 신호와 뉴스 item의 `publishedAt`은 가능한 한 보존하고 UI에 표시한다.
- Google Trends는 여전히 중요하지만 공식 API alpha, 인증, 비용, 이용 조건 검토가 필요하므로 자동 수집 source가 아니라 후보 source로 둔다.

## 보안 및 비용 영향

- 사용자 입력 URL, host, keyword를 Lambda fetch에 사용하지 않는다.
- Google News RSS query는 코드에 고정된 allowlist만 사용한다.
- 브라우저는 외부 source를 직접 호출하지 않으므로 CloudFront CSP를 넓히지 않는다.
- source별 응답 한도와 timeout은 기존 기본값인 512KB/2.2초를 유지한다.
- API key가 필요한 source는 추가하지 않는다.
- 원문 전문은 저장하지 않고 제목, 링크, 짧은 요약, 출처, 게재일, 우선순위 근거 tag만 저장한다.

## 결과

Trend Lens의 비보안 분야는 더 이상 위키/백과 기반 정적 문서를 오늘의 뉴스처럼 보여주지 않는다. 대신 최근성 있는 뉴스 항목을 표시하며, source가 일시적으로 비어 있거나 실패하면 해당 source status에만 반영하고 출퇴근 기록 기능에는 영향을 주지 않는다.
