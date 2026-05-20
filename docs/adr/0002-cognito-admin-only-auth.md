# ADR 0002: Cognito 관리자 생성 사용자만 허용

상태: 채택

날짜: 2026-05-20

## 맥락

Serverless 서비스는 공개 URL을 갖기 쉽다. self sign-up을 열면 의도하지 않은 사용자가 가입하고 API/DynamoDB/Lambda 사용량을 만들 수 있다.

## 결정

Cognito self sign-up을 비활성화하고, 관리자가 생성한 사용자만 로그인할 수 있게 한다.

모든 API route는 API Gateway JWT authorizer를 통과해야 한다.

## 결과

사용자 경험은 공개 SaaS보다 폐쇄적이지만, 개인 사용 서비스의 비용과 보안을 더 잘 지킨다.

## LLM 작업 지침

`selfSignUpEnabled: true`로 바꾸지 않는다. public signup, anonymous usage, shared token 방식은 도입하지 않는다. 변경이 필요하면 abuse 방어와 비용 상한을 먼저 ADR로 작성한다.
