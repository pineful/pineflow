# 비용 가드레일

마지막 업데이트: 2026-05-20

## 목표

Pineflow는 개인 사용을 전제로 AWS Free Tier 안에서 가능한 한 비용을 발생시키지 않는 방향으로 운영한다. 단, AWS Free Tier는 계정 생성 시점, Region, 사용량, 정책 변경에 따라 달라질 수 있으므로 0원을 보장하지 않는다.

## 현재 고정값

- API Gateway: `1 req/sec`, burst `5`.
- Lambda: reserved concurrency `1`, memory `128 MB`, timeout 5초.
- DynamoDB: provisioned `1 RCU / 1 WCU`.
- CloudWatch Logs: retention 7일.
- Budgets: `$1`, `$3`, `$5`.
- S3: public access block.
- CloudFront: OAC only, S3 origin.

## 금지 또는 보류 항목

다음 항목은 비용 증가 위험이 있으므로 기본적으로 추가하지 않는다.

- WAF
- Route 53
- custom domain
- NAT Gateway
- VPC Lambda
- RDS/Aurora
- DynamoDB on-demand
- DynamoDB GSI
- Lambda provisioned concurrency
- CloudWatch dashboard 대량 생성
- 장기 로그 보관

필요하면 ADR에 비용 근거, 대체안, 중단 기준을 먼저 적는다.

## 비용 변경 시 질문

LLM 에이전트는 AWS 리소스를 추가하거나 설정을 바꿀 때 아래 질문에 답해야 한다.

- 이 변경이 월 고정비를 만드는가?
- Free Tier가 12개월 한정인지 Always Free인지 확인했는가?
- 요청이 악의적으로 증가할 때 비용 상한이 있는가?
- Budget 알림이 비용 증가 전에 도착하는가?
- `infra/scripts/verify-template.mjs`에 자동 검증을 추가했는가?

## 현재 공식 문서 기준 확인

- Lambda: 월 1M requests와 400,000 GB-seconds free tier가 있다.
- API Gateway: HTTP API free tier는 신규 계정 기간/조건의 영향을 받는다.
- DynamoDB: 25GB storage와 25 RCU/WCU always free tier가 있다.
- S3: 신규 고객 free tier는 5GB storage, GET/PUT 요청 수 제한이 있다.
- AWS Budgets: budget monitoring notification은 무료다.

정책은 변할 수 있으므로 배포 직전에는 공식 pricing 문서를 다시 확인한다.
