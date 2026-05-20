# 진행 상황

마지막 업데이트: 2026-05-20

## 현재 상태 요약

Pineflow는 모바일 우선 출퇴근 기록 앱의 초기 구현, PostgreSQL 기반 저장 구조, EC2 Docker 운영 설계, pull-based CI/CD 설계, 기본 보안 장치, 백업/복구 계획까지 완료된 상태입니다.

아직 실제 AWS EC2 인스턴스에서 운영 검증은 진행하지 않았습니다. 인스턴스 생성, 시작, 중단, 서비스 실행은 운영자가 직접 수행하는 전제입니다.

## 완료됨

- 제품명 `Pineflow` 확정.
- 파인애플 테크 콘셉트의 로고와 모바일 UI 구현.
- 출근/퇴근 기록, 오늘 요약, 목표 시간, 최근 기록 UI 구현.
- Express API 서버 추가.
- PostgreSQL 스키마 추가.
- 브라우저 로컬 저장 방식에서 PostgreSQL 저장 방식으로 전환.
- 로컬 개발용 `docker-compose.yml` 추가.
- 운영용 `Dockerfile`, `compose.prod.yml`, `compose.deploy.yml` 추가.
- AWS EC2 `t3.micro` 단일 인스턴스 운영 흐름 문서화.
- GitHub 저장소 `pineful/pineflow` 연결 및 main push.
- 문서 전체 한국어화.
- GitHub Actions에서 Docker image를 GHCR에 발행하는 workflow 추가.
- GitHub에 EC2 SSH private key를 저장하지 않는 pull-based 배포 구조로 전환.
- API access token 필수화.
- 보안 헤더, CSP, rate limit, JSON body limit 추가.
- `.env`, `.env.production` Git 제외.
- secret 관리 문서 추가.
- DB 백업/복구 스크립트 추가.
- 데이터 백업/복구/마이그레이션 계획 문서화.

## 검증됨

- `npm run build` 성공.
- `server/index.mjs` 문법 검사 성공.
- `compose.deploy.yml` Docker Compose config 검증 성공.
- GitHub push 완료.
- 실제 secret 패턴 간단 검색에서 노출 없음.

## 아직 남은 일

- EC2 인스턴스에서 Docker와 Docker Compose 설치 확인.
- EC2에 repository clone.
- EC2에 `.env.production` 작성.
- GHCR package 공개 여부 결정.
- GHCR을 private으로 유지한다면 EC2에서 `docker login ghcr.io` 1회 수행.
- `compose.deploy.yml`로 최초 컨테이너 실행.
- `ops/systemd` timer 설치 여부 결정.
- 도메인과 HTTPS 적용.
- 실제 운영 환경에서 `/api/health`와 UI 접근 검증.
- DB 백업 파일을 인스턴스 밖으로 복사하는 운영 루틴 확정.
- 정식 migration 도구 도입.
- rollback 스크립트 추가.

## 현재 CI/CD 방향

현재 CI/CD는 push-based SSH 배포가 아닙니다.

- GitHub Actions는 image build와 GHCR push까지만 수행합니다.
- EC2 접속 정보와 SSH private key는 GitHub에 저장하지 않습니다.
- EC2가 systemd timer 또는 운영자 수동 명령으로 GitHub/GHCR을 pull합니다.

## 주요 문서

- 제품 계획: `docs/product-plan.md`
- 아키텍처: `docs/architecture.md`
- AWS 배포: `docs/deployment-aws.md`
- CI/CD: `docs/cicd.md`
- 보안: `docs/security.md`
- 데이터 관리: `docs/data-management.md`
- 변경 기록: `docs/change-log.md`
