# ADR 0008: Trend Lens scheduled intelligence cache

상태: Accepted

날짜: 2026-06-07

## 맥락

Pineflow의 제품 성격이 개인 출퇴근 기록에서 `하루 리듬 + 지식 인텔리전스`로 확장되었다. 사용자는 매일 세계 뉴스/분석과 트렌드를 검토하고, 필요하면 콘텐츠 제작이나 공유로 이어가길 원한다. 동시에 Pineflow의 기존 원칙인 개인 사용, 낮은 비용, 관리자 생성 사용자, 보안 가드레일은 계속 유지되어야 한다.

## 결정

Trend Lens는 다음 구조로 구현한다.

- 모든 사용자 API는 JWT authorizer 뒤에 둔다.
- `GET /api/trend-lens`는 DynamoDB 캐시만 읽고 외부 fetch를 하지 않는다.
- `POST /api/trend-lens/refresh`는 로그인 사용자만 호출할 수 있고, scope는 `all` 또는 `security` enum만 허용한다.
- 하루 1회 전체 수집은 EventBridge Rule이 Lambda를 직접 호출한다.
- 공식 보안 위험 신호 확인은 EventBridge Rule이 30분마다 Lambda를 직접 호출한다.
- 외부 소스는 코드 allowlist에 고정한다. 사용자 입력 URL과 임의 검색어를 Lambda fetch에 사용하지 않는다.
- 원문 전문, 이미지, transcript, paywall content는 저장하지 않는다.
- DynamoDB는 기존 single-table을 유지하고, Trend Lens cache는 `SYSTEM#TREND_LENS` partition에 둔다.
- 캐시 정리를 위해 DynamoDB TTL `expiresAt`을 활성화한다.

## 비용 판단

EventBridge scheduled invocation, 짧은 Lambda 실행, DynamoDB 소량 item write/read는 개인 사용 기준 Free Tier 안쪽으로 예상된다. 그러나 무료 보장은 아니므로 Budgets `$1`, `$3`, `$5`, 운영 사용량 패널, Lambda concurrency 1, API Gateway throttling 1 req/sec, DynamoDB 1 RCU/1 WCU를 유지한다.

API key가 필요한 소스는 기본 비활성화한다. 꼭 필요할 경우 SSM Parameter Store Standard `SecureString`을 우선하고, Secrets Manager는 월 비용 가능성 때문에 기본 후보로 쓰지 않는다.

## 보안 판단

- SSRF 방어: URL은 allowlist source definition에서만 생성된다.
- redirect는 1회 이하, redirect 후에도 allowlist 재검증.
- RSS는 DTD/entity 선언을 거부하고 필요한 item field만 제한적으로 읽는다.
- 응답 크기 512KB, source timeout 2.2초.
- CloudFront CSP는 새 외부 소스를 추가하지 않는다. 브라우저는 Pineflow API만 호출한다.
- Lambda 로그는 source body나 article content를 기록하지 않는다.

## 대안

### 브라우저 직접 호출

외부 API 비용은 줄어들 수 있지만 CSP가 넓어지고 API key를 숨길 수 없다. 사용자 위치/관심사가 외부 서비스에 직접 노출될 수 있어 기각한다.

### 외부 뉴스 API 또는 LLM 자동 요약

품질은 좋아질 수 있지만 API key, quota, 비용, 저작권 리스크가 커진다. v1에서는 기각하고 향후 별도 ADR로 다룬다.

### DynamoDB GSI 추가

조회 패턴이 아직 global latest snapshot 중심이므로 필요하지 않다. 비용/운영 복잡도를 이유로 기각한다.

## 결과

Pineflow는 첫 화면에 compact `오늘 브리프`를 제공하고, 상세 Trend Lens는 캐시 기반으로 읽는다. 이 구조는 제품 확장을 시작하면서도 기존 Serverless 비용/보안 가드레일을 유지한다.
