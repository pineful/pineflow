# Serverless 전환 계획

## 결정

Pineflow의 다음 본선은 AWS Free Tier를 최대한 벗어나지 않는 Serverless 구조로 전환합니다. 기존 EC2 Docker/PostgreSQL 구성은 PoC로 보존하고, 새 운영 기준은 Serverless로 둡니다.

## 목표

- 서버 상시 실행 비용을 없앱니다.
- 사용량이 없을 때 비용이 거의 발생하지 않게 합니다.
- 다른 사람이 무단으로 사용해 비용을 소진하지 못하게 합니다.
- 로그인 또는 초대 기반 접근 제어를 둡니다.
- 데이터는 앱 구조가 바뀌어도 이어질 수 있게 export/import와 migration 계획을 둡니다.

## 권장 아키텍처

1. Frontend
   - S3에 정적 파일 배포.
   - CloudFront로 HTTPS 제공.
2. Auth
   - Amazon Cognito User Pool.
   - 가입은 기본적으로 닫고, 운영자가 초대한 사용자만 계정을 만들 수 있게 설계.
3. API
   - API Gateway HTTP API.
   - Cognito JWT authorizer로 인증된 사용자만 Lambda 호출.
   - throttling으로 과도한 요청을 제한.
4. Compute
   - AWS Lambda Node.js.
   - reserved concurrency로 최대 동시 실행 수 제한.
5. Database
   - DynamoDB.
   - 사용자별 partition key로 데이터 분리.
6. Cost Guard
   - AWS Budgets.
   - CloudWatch alarm.
   - API Gateway throttling.
   - Lambda reserved concurrency.
   - DynamoDB usage monitoring.

## Free Tier 판단

2026-05-20 기준 공식 AWS pricing 문서 확인 결과:

- Lambda Free Tier는 월 100만 requests와 400,000 GB-seconds를 제공합니다.
- API Gateway Free Tier는 신규 고객 기준 HTTP API/REST API 각각 월 100만 calls를 제공합니다. 기간 제한과 계정 조건이 있으므로 AWS Free Tier 상태를 확인해야 합니다.
- DynamoDB는 Standard table 기준 25GB storage Free Tier가 제공됩니다.
- Cognito User Pool은 Lite 또는 Essentials tier에서 직접 로그인 사용자 기준 월 10,000 MAU Free Tier가 제공됩니다.

Free Tier는 계정 생성 시점, region, credit plan, data transfer, 로그 저장량에 따라 비용이 발생할 수 있습니다. 따라서 Free Tier만 믿지 않고 Budget과 사용량 제한을 먼저 둡니다.

## 왜 DynamoDB인가

Pineflow의 핵심 데이터는 사용자별 시간 기록입니다. 복잡한 join이 없고, 대부분 접근 패턴은 “내 최근 기록”, “오늘 기록”, “내 설정”입니다. DynamoDB는 이런 access pattern에 적합하고, Serverless Free Tier 운영에 PostgreSQL 계열보다 단순합니다.

Aurora PostgreSQL Serverless도 선택지는 될 수 있지만, 개인/소규모 서비스의 Free Tier 방어 관점에서는 DynamoDB가 더 단순합니다.

## 데이터 모델 초안

Table: `pineflow`

Primary key:

- `pk`: 사용자 단위 partition key.
- `sk`: item 종류와 정렬 기준.

Item 예시:

```text
pk = USER#<cognito-sub>
sk = SETTINGS
dailyGoalMinutes = 480
createdAt = ...
updatedAt = ...
```

```text
pk = USER#<cognito-sub>
sk = SESSION#2026-05-20T09:00:00.000Z
sessionId = ...
mode = focus
note = ...
checkInAt = ...
checkOutAt = ...
createdAt = ...
updatedAt = ...
```

조회 패턴:

- 사용자 설정: `pk = USER#id`, `sk = SETTINGS`.
- 최근 기록: `pk = USER#id`, `begins_with(sk, SESSION#)`, descending.
- 오늘 기록: `pk = USER#id`, `sk between SESSION#YYYY-MM-DDT00:00... and SESSION#YYYY-MM-DDT23:59...`.
- 활성 세션: `activeSessionId`를 SETTINGS에 저장하거나, 별도 `sk = ACTIVE_SESSION` item을 둡니다.

초기 구현에서는 `ACTIVE_SESSION` item을 두는 방식이 단순합니다.

## 인증 정책

초기 Serverless 버전은 public signup을 열지 않습니다.

- Cognito User Pool 생성.
- self sign-up 비활성화.
- 운영자가 사용자 생성 또는 초대.
- API Gateway는 Cognito JWT authorizer를 사용.
- Lambda는 JWT의 `sub`를 사용자 key로 사용.
- 사용자별 데이터는 `USER#<sub>` partition 아래에만 저장.

이렇게 하면 다른 사람이 임의로 API를 호출해도 인증 없이는 Lambda와 DynamoDB 사용량을 발생시키지 못합니다.

## 비용 방어 정책

필수:

- AWS Budget 1차 알림.
- AWS Budget 2차 알림.
- API Gateway route throttling.
- Lambda reserved concurrency 낮게 설정.
- CloudWatch log retention 짧게 설정.
- Cognito self sign-up 비활성화.

권장:

- WAF rate-based rule은 CloudFront/API 공개 범위가 커질 때 검토.
- 무료 범위만 절대 조건이면 CloudFront, WAF, Route 53 등 부가 서비스 비용도 개별 확인.

## 전환 단계

### 1단계: 문서와 IaC 기준 수립

- `docs/serverless-plan.md` 확정.
- Serverless IaC 도구 선택: AWS SAM 또는 CDK.
- DynamoDB 테이블, Cognito User Pool, Lambda, API Gateway, S3/CloudFront 리소스 정의.

### 2단계: Lambda API 구현

- Express 서버를 Lambda handler 중심으로 대체.
- `/state`, `/check-in`, `/check-out`, `/settings` API 구현.
- Cognito JWT의 `sub` 기반 사용자 분리.

### 3단계: 프론트 인증 연동

- 기존 access key 입력 화면 제거.
- Cognito 로그인 화면 또는 Hosted UI 연동.
- 로그인된 사용자의 JWT로 API 호출.

### 4단계: 데이터 이전

- PostgreSQL PoC 데이터가 있다면 export.
- export 결과를 DynamoDB import 형식으로 변환.
- 사용자 mapping 규칙 확정.
- import 후 record count와 샘플 기록 검증.

### 5단계: 비용 가드레일 적용

- Budget 생성.
- API throttling 적용.
- Lambda reserved concurrency 적용.
- CloudWatch log retention 적용.
- self sign-up 비활성화 확인.

### 6단계: 운영 전환

- EC2 PoC는 중단하거나 archive.
- Serverless endpoint로 프론트 배포.
- 실제 로그인/기록/조회/백업/export 검증.

## 기존 PoC의 위치

현재 EC2 Docker/PostgreSQL 구성은 “PoC 구현”으로 유지합니다. 즉시 삭제하지 않습니다. Serverless 구현이 안정화되기 전까지 다음 역할을 합니다.

- UI와 도메인 흐름 참고.
- PostgreSQL export source.
- 기능 비교 기준.

Serverless 구현이 완료되면 EC2 관련 문서는 `docs/archive/`로 이동할 수 있습니다.

## 공식 참고

- AWS Lambda pricing: https://aws.amazon.com/lambda/pricing/
- Amazon API Gateway pricing: https://aws.amazon.com/api-gateway/pricing/
- Amazon DynamoDB pricing: https://aws.amazon.com/dynamodb/pricing/
- Amazon Cognito pricing: https://aws.amazon.com/cognito/pricing/
- API Gateway throttling: https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-throttling.html
- Lambda concurrency: https://docs.aws.amazon.com/lambda/latest/dg/lambda-concurrency.html
- AWS Budgets: https://aws.amazon.com/documentation-overview/budgets/
