# ADR 0004: 비용 우선 가드레일

상태: 채택

날짜: 2026-05-20

## 맥락

사용자는 Free Tier 범위에서 개인적으로 운영하길 원한다. 외부 사용자가 비용을 소진하는 상황을 막아야 한다.

## 결정

다음 값을 초기 운영 기준으로 고정한다.

- API Gateway throttling: `1 req/sec`, burst `5`
- Lambda reserved concurrency: `1`
- DynamoDB provisioned capacity: `1 RCU / 1 WCU`
- CloudWatch log retention: 7일
- Budgets: `$1`, `$3`, `$5`
- S3 public access block
- CloudFront OAC only

## 결과

성능보다 비용 상한과 abuse 방어를 우선한다. 개인 사용에 불편이 생기면 지표를 본 뒤 작은 폭으로 조정한다.

## LLM 작업 지침

비용 제한을 완화하는 변경은 자동으로 하지 않는다. 반드시 `docs/cost-guardrails.md`와 `infra/scripts/verify-template.mjs`를 함께 갱신한다.
