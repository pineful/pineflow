# 비용 가드레일

마지막 업데이트: 2026-06-04

## 목표

Pineflow는 개인 사용을 전제로 AWS Free Tier 안에서 가능한 한 비용을 발생시키지 않는 방향으로 운영한다. 단, AWS Free Tier는 계정 생성 시점, Region, 사용량, 정책 변경에 따라 달라질 수 있으므로 0원을 보장하지 않는다.

## 현재 고정값

- API Gateway: `1 req/sec`, burst `5`.
- Lambda: reserved concurrency `1`, memory `128 MB`, timeout 8초.
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
- 앱 Lambda에서 Cost Explorer API 직접 호출

필요하면 ADR에 비용 근거, 대체안, 중단 기준을 먼저 적는다.

## 비용 변경 시 질문

LLM 에이전트는 AWS 리소스를 추가하거나 설정을 바꿀 때 아래 질문에 답해야 한다.

- 이 변경이 월 고정비를 만드는가?
- Free Tier가 12개월 한정인지 Always Free인지 확인했는가?
- 요청이 악의적으로 증가할 때 비용 상한이 있는가?
- Budget 알림이 비용 증가 전에 도착하는가?
- `infra/scripts/verify-template.mjs`에 자동 검증을 추가했는가?

## 앱 내 운영 사용량 패널

Pineflow 앱 하단에는 AWS 사용량의 기초 지표와 Free Tier 기준 예상 상태를 표시할 수 있다. 이 패널의 목적은 실제 청구액 산정이 아니라 비용을 유발하는 활동량과 무료 범위 접근 여부를 빠르게 보는 것이다.

현재 허용된 데이터 소스:

- CloudWatch `GetMetricData`
- API Gateway 요청 수
- Lambda 호출/오류 수
- Lambda 실행시간 합계
- DynamoDB consumed read/write capacity units
- CloudFront 요청/전송량
- S3 저장량/객체 수
- Pineflow IaC에 고정된 비용 가드레일 값
- 같은 날짜에 캐시된 운영 사용량 스냅샷

금지:

- 앱 Lambda에 Cost Explorer 권한을 주지 않는다.
- 앱 화면에서 실제 청구액을 계산한다고 표현하지 않는다. `Free Tier 기준 예상`, `$0 예상` 같은 문구는 추정임을 함께 표시한다.
- 운영 지표를 자동 polling하지 않는다. 화면 진입 후 1회 조회를 기본으로 한다.
- 같은 날짜에 이미 조회한 값이 있으면 프론트엔드와 Lambda 모두 캐시를 우선 사용한다.
- 로그인 후 첫 화면의 비용 신호등은 같은 스냅샷의 요약 표시다. 신호등 표시를 위해 CloudWatch나 Cost Explorer를 별도로 호출하지 않는다.
- S3 프론트엔드 버킷은 `assets/` 객체만 30일 뒤 Intelligent-Tiering으로 전환한다. `index.html`은 첫 화면 안정성을 위해 Standard에 둔다.

## 현재 공식 문서 기준 확인

- Lambda: 월 1M requests와 400,000 GB-seconds free tier가 있다.
- API Gateway: HTTP API free tier는 신규 계정 기간/조건의 영향을 받는다.
- DynamoDB: 25GB storage와 25 RCU/WCU always free tier가 있다.
- S3: 신규 고객 free tier는 5GB storage, GET/PUT 요청 수 제한이 있다.
- AWS Budgets: budget monitoring notification은 무료다.
- Cost Explorer API는 호출당 비용이 있으므로 앱 화면에서는 사용하지 않는다.
- S3 Intelligent-Tiering은 객체 수와 크기에 따라 모니터링 비용이 생길 수 있다. 프론트엔드 assets 객체 수가 많아지면 실제 비용 대비 효과를 다시 확인한다.

정책은 변할 수 있으므로 배포 직전에는 공식 pricing 문서를 다시 확인한다.
## Trend Lens 비용 기준

추가일: 2026-06-07

Trend Lens는 하루 1회 전체 브리프와 30분 간격 보안 신호 확인을 수행한다. 개인 사용 기준으로 Lambda/EventBridge/DynamoDB Free Tier 안쪽으로 예상되지만 무료 보장은 아니다. 따라서 기존 Budgets `$1`, `$3`, `$5`와 운영 사용량 패널을 계속 최종 방어선으로 둔다.

비용을 키우지 않기 위한 기준:

- 전체 수집은 하루 1회.
- 보안 공식 신호 확인은 30분보다 자주 하지 않는다.
- 수동 전체 refresh는 기본 30분 cooldown. 사용자가 강제 refresh를 누르면 5분 연타 방지 cooldown만 적용한다.
- 수동 security refresh는 기본 5분 cooldown. 사용자가 강제 refresh를 누르면 1분 연타 방지 cooldown만 적용한다.
- 전체 refresh는 source들을 병렬로 수집해 Lambda 실행시간과 실패 가능성을 줄인다.
- API key가 필요한 source는 기본 비활성화.
- SSM Parameter Store는 Standard `SecureString`만 우선 후보로 둔다.
- Secrets Manager, Bedrock/LLM 자동 요약, 외부 paid news API, OpenSearch, SQS, Step Functions는 v1에서 사용하지 않는다.
- DynamoDB는 single-table, 1 RCU / 1 WCU, GSI 없음.
- Trend Lens snapshot은 원문 전문이 아니라 짧은 metadata만 저장한다. 저장 전 제목, 요약, source 상태 메시지, reason tag를 압축한다.
- source 응답 한도는 기본 512KB/2.2초다. CISA KEV 공식 JSON만 실제 응답 크기를 반영해 2MB/4.5초 예외를 둔다.
