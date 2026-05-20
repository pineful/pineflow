# 아키텍처

## 애플리케이션 형태

Pineflow는 Vite React 프론트엔드, Express API 서버, PostgreSQL 데이터베이스로 구성됩니다. 프론트엔드는 `/api` 요청으로 서버 상태를 읽고 쓰며, 서버는 PostgreSQL을 기록의 원천으로 사용합니다.

운영 환경에서는 Express 서버가 API와 빌드된 프론트엔드 정적 파일을 함께 제공합니다. AWS EC2에서는 `app` 컨테이너와 `postgres` 컨테이너를 Docker Compose로 분리해 실행합니다.

## 경계

- `src/App.tsx`: 화면 구성과 사용자 상호작용.
- `src/api.ts`: 브라우저에서 API를 호출하는 클라이언트.
- `src/date.ts`: 날짜, 시간, 기간, 오늘 요약 계산 규칙.
- `src/brand.ts`: 제품명, 태그라인, 업무 유형 라벨, 네이밍 후보.
- `src/types.ts`: 프론트엔드에서 공유하는 도메인 타입.
- `src/styles.css`: 시각 디자인과 반응형 레이아웃.
- `server/index.mjs`: Express API, 요청 검증, 운영 정적 파일 서빙.
- `server/db.mjs`: PostgreSQL 연결 풀과 스키마 적용.
- `server/schema.sql`: 데이터베이스 테이블과 인덱스.
- `docker-compose.yml`: 로컬 개발용 PostgreSQL.
- `compose.prod.yml`: EC2 운영용 app/postgres 컨테이너 구성.
- `compose.deploy.yml`: CI/CD에서 GHCR 이미지를 pull해 실행하는 운영 구성.
- `Dockerfile`: 운영용 app 이미지 빌드.
- `.github/workflows/deploy.yml`: main push 시 이미지 빌드와 EC2 배포를 수행하는 GitHub Actions workflow.
- `scripts/deploy-ec2.sh`: EC2에서 app 컨테이너를 갱신하는 배포 스크립트.
- `docs/development.md`: 로컬 개발 환경과 명령.
- `docs/deployment-aws.md`: AWS EC2 Docker 운영 흐름.
- `docs/cicd.md`: CI/CD 설계와 운영 절차.

## 변경 정책

동작이 바뀌면 `docs/modules/` 아래의 해당 모듈 문서를 함께 수정합니다. 제품 범위가 바뀌면 `docs/product-plan.md`, 브랜드나 문구가 바뀌면 `docs/brand.md`, 개발 환경이 바뀌면 `docs/development.md`, 운영 구조가 바뀌면 `docs/deployment-aws.md`를 함께 갱신합니다.

## 향후 확장 지점

- `PINEFLOW_OWNER_KEY` 기반 단일 사용자 모델을 실제 인증 기반 사용자 모델로 교체.
- 기록 내보내기 기능 추가.
- 계정 동기화와 다중 기기 사용 지원.
- PostgreSQL 마이그레이션 도구 도입.
- EC2 단일 인스턴스 구조에서 RDS 또는 관리형 배포 구조로 이전.
- GitHub Actions rollback 자동화.
