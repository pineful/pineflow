# 아키텍처

마지막 업데이트: 2026-06-14

## 애플리케이션 형태

Pineflow의 운영 본선은 AWS Serverless입니다. 프론트엔드는 Vite React 앱을 S3에 올리고 CloudFront로 제공합니다. 인증은 Cognito User Pool을 사용하며, API는 API Gateway HTTP API와 Lambda가 담당합니다. 기록 데이터의 원천 저장소는 DynamoDB single-table입니다.

기존 Express/PostgreSQL/Docker Compose 구성은 PoC입니다. PoC 문서와 파일은 과거 설계 참고와 데이터 이관 검토를 위해 보존하지만, 새 기능의 본선 구현 대상은 아닙니다.

전체 아키텍처와 데이터 플로우는 `docs/diagrams/pineflow-architecture-infographic.svg`에 인포그래픽으로 정리합니다. 이 그림은 브라우저 저장소, Cognito 인증 경계, API Gateway/Lambda/DynamoDB 흐름, Trend Lens 외부 소스, GitHub OIDC 배포, 비용/보안 가드레일을 한 화면에서 확인하기 위한 기준 자료입니다.

## 본선 Serverless 경계

- `src/App.tsx`: 화면 구성, 대시보드, 기록 UX, 날씨 카드, 계정 메뉴.
- `src/api.ts`: Cognito access token을 붙여 Serverless API를 호출하는 클라이언트.
- `src/auth.ts`: Cognito 로그인, 첫 비밀번호 변경, token refresh.
- `src/date.ts`: 날짜, 시간, 기간, 오늘 요약 계산 규칙.
- `src/clientActivity.ts`: Pineflow 탭 안의 최근 브라우저 활동 시각을 로컬에 보관하고, 다음 출근 시 이전 세션의 자동 퇴근 보정 후보를 계산하는 클라이언트 경계.
- `src/recordSessions.ts`: 출근/퇴근 record 배열을 화면용 세션, 보관함 검색, Workday Lens 주간 요약으로 변환하는 view model 경계. API payload와 DynamoDB item shape를 바꾸지 않는다.
- `src/trendReadState.ts`: Trend Lens 기사 읽음 상태와 Google News fallback link를 관리하는 브라우저 보조 상태 경계. 서버/DynamoDB 데이터 구조를 바꾸지 않는다.
- `src/weather.ts`: Open-Meteo code 변환, 시간대별 예보 슬롯 생성, 한국어 위치 표시 fallback 같은 날씨 표시 helper 경계. 외부 API 호출 정책과 CSP는 이 파일만 바꿔 확장하지 않는다.
- `src/brand.ts`: 제품명, 태그라인, 업무 유형 라벨.
- `src/types.ts`: 프론트엔드에서 공유하는 도메인 타입.
- `src/styles.css`: 현재 레거시 진입 스타일시트. 새 override pass를 누적하지 않고 기존 selector를 통합한다.
- `src/styles/`: 장기적으로 feature 단위 CSS module을 둘 위치. 구조 기준은 `src/styles/README.md`와 `docs/modules/css-architecture.md`를 따른다.
- `public/pineflow-icon.svg`: 앱 아이콘과 favicon 기준 로고.
- `infra/lib/pineflow-serverless-stack.ts`: Cognito, API Gateway, Lambda, DynamoDB, S3, CloudFront, Budgets 정의.
- `infra/lambda/pineflow-api/index.mjs`: Serverless API handler. Trend Lens의 KISA/CISA/보안 매체/Google News RSS/한국외대 채용 게시판 수집 allowlist도 이 경계 안에서만 관리한다.
- `infra/scripts/verify-template.mjs`: CDK 템플릿의 비용/보안 guardrail 검증.
- `scripts/check-css-guardrails.mjs`: CSS 누적, 금지 문법, override block 증가를 막는 프론트엔드 guardrail 검증.
- `.github/workflows/serverless.yml`: Serverless 본선 검증과 배포 workflow.

## PoC 경계

- `server/index.mjs`: Express API, 요청 검증, 운영 정적 파일 서빙.
- `server/db.mjs`: PostgreSQL 연결 풀과 스키마 적용.
- `server/schema.sql`: PostgreSQL 테이블과 인덱스.
- `docker-compose.yml`: 로컬 개발용 PostgreSQL.
- `compose.prod.yml`: EC2 운영용 app/postgres 컨테이너 구성.
- `compose.deploy.yml`: CI/CD에서 GHCR 이미지를 pull해 실행하는 PoC 운영 구성.
- `Dockerfile`: PoC app 이미지 빌드.
- `.github/workflows/deploy.yml`: 수동 PoC 이미지 빌드 workflow.
- `scripts/deploy-ec2.sh`: EC2 안에서 실행되는 pull-based 배포 스크립트.
- `ops/systemd/`: EC2에서 pull-based 업데이트를 주기적으로 실행하는 systemd 예시.
- `scripts/backup-db.sh`: PostgreSQL dump 백업 스크립트.
- `scripts/restore-db.sh`: dump 파일 복구 스크립트.

PoC 경계의 파일은 운영 본선 요구사항을 만족시키기 위해 확장하지 않습니다. PoC 기능을 되살려야 한다면 먼저 ADR을 작성해 Serverless 본선과의 관계를 정리합니다.

## 문서 경계

- `docs/workstreams.md`: 분야별 작업 지도와 책임 파일.
- `docs/llm-context.md`: LLM 에이전트가 반드시 보존해야 하는 설계 사상.
- `docs/status.md`: 현재까지 완료된 일과 남은 일.
- `docs/api-contract.md`: Serverless API 요청/응답 계약.
- `docs/modules/*.md`: 기능/운영 모듈별 설계 사상.
- `docs/adr/`: 바꾸면 되돌리기 어려운 설계 결정 기록.
- `docs/serverless-implementation.md`: 현재 Serverless 구현 현황.
- `docs/aws-serverless-deployment-checklist.md`: 실제 AWS 배포 전후 확인 목록.

## 변경 정책

동작이 바뀌면 `docs/modules/` 아래의 해당 모듈 문서를 함께 수정합니다. 제품 범위가 바뀌면 `docs/product-plan.md`, 브랜드나 문구가 바뀌면 `docs/brand.md`, Serverless 운영 구조가 바뀌면 `docs/serverless-implementation.md`와 `docs/aws-serverless-deployment-checklist.md`를 함께 갱신합니다.

CSS 변경은 `docs/modules/css-architecture.md`의 누적 방지 기준을 따른다. `src/styles.css` 끝에 날짜별 override pass를 붙이는 방식은 금지하고, 큰 변경은 selector ownership을 정리한 뒤 `src/styles/` feature module로 이동한다.

## 향후 확장 지점

- 기록 내보내기 기능 추가.
- 계정 동기화와 다중 기기 사용 지원.
- GitHub Actions rollback 자동화.
- DynamoDB export/import 백업 절차 구현.
