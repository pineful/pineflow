# Pineflow

Pineflow는 회사 출퇴근 시스템에 속해 있지 않아도 개인의 업무 시작과 종료를 기록할 수 있는 모바일 우선 출퇴근 기록 서비스입니다.

출근/퇴근 기록과 개인 업무 리듬은 PostgreSQL에 저장하며, 현재 운영 구조는 AWS EC2 `t3.micro` 한 대에서 `app` 컨테이너와 `postgres` 컨테이너를 분리해 실행하는 방식을 기준으로 합니다.

## 로컬 실행

이 Windows 환경에서는 npm이 레지스트리에 접속할 때 Node가 Windows 시스템 인증서 저장소를 사용하도록 설정해야 합니다.

```powershell
$env:NODE_OPTIONS='--use-system-ca'
& "C:\Program Files\nodejs\npm.cmd" install
docker compose up -d postgres
& "C:\Program Files\nodejs\npm.cmd" run api
& "C:\Program Files\nodejs\npm.cmd" run dev
```

Vite 개발 서버와 API 서버를 따로 실행할 때는 `.env`에 `VITE_API_BASE_URL=http://127.0.0.1:3001`를 둡니다. 운영에서는 `npm start`가 API와 빌드된 프론트엔드를 같은 Express 프로세스에서 제공합니다.

## 빌드

```powershell
$env:NODE_OPTIONS='--use-system-ca'
& "C:\Program Files\nodejs\npm.cmd" run build
```

## 운영용 Docker 구조

운영은 EC2 인스턴스 한 대에서 `app`, `postgres` 컨테이너를 분리해 실행하도록 설계되어 있습니다.

```bash
cp .env.production.example .env.production
docker compose -p pineflow -f compose.prod.yml up -d --build
```

전체 운영 흐름은 `docs/deployment-aws.md`에 정리되어 있습니다.

## CI/CD

`main` 브랜치에 push되면 GitHub Actions가 Docker 이미지를 빌드해 GHCR에 올리고, EC2에 SSH로 접속해 `app` 컨테이너만 새 이미지로 교체합니다.

필요한 GitHub Secrets와 서버 준비 절차는 `docs/cicd.md`에 정리되어 있습니다.

## 문서

- 제품 계획: `docs/product-plan.md`
- 아키텍처: `docs/architecture.md`
- 브랜드 시스템: `docs/brand.md`
- 모듈 설계: `docs/modules/`
- 변경 기록: `docs/change-log.md`
- AWS 배포/운영 흐름: `docs/deployment-aws.md`
- CI/CD 흐름: `docs/cicd.md`
- 보안 설계: `docs/security.md`
- 데이터 백업/마이그레이션: `docs/data-management.md`

기능이나 구조를 수정할 때는 관련 모듈 문서를 같은 변경 안에서 함께 갱신합니다.
