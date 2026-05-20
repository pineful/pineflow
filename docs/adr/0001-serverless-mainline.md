# ADR 0001: Serverless를 운영 본선으로 선택

상태: 채택

날짜: 2026-05-20

## 맥락

초기 PoC는 EC2 Docker/PostgreSQL로 구성했다. 하지만 Pineflow는 당분간 개인 사용 서비스이며, 서버를 계속 켜두는 구조는 비용과 운영 부담이 크다.

## 결정

운영 본선은 AWS Serverless로 전환한다.

구성:

- S3 + CloudFront
- Cognito User Pool
- API Gateway HTTP API
- Lambda
- DynamoDB
- AWS CDK
- GitHub OIDC 기반 CI/CD

## 결과

EC2 Docker/PostgreSQL 구성은 PoC와 데이터 이관 원천으로만 유지한다. 새 기능은 Serverless 본선에 우선 구현한다.

## LLM 작업 지침

LLM은 EC2 PoC를 운영 본선처럼 확장하지 않는다. EC2 관련 변경은 보존, 문서 archive, 데이터 export 목적일 때만 수행한다.
