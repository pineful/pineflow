# CI/CD 설계

## 목표

`main` 브랜치에 변경 사항이 push되면 GitHub Actions가 자동으로 빌드, 이미지 발행, EC2 배포를 수행합니다. 운영자는 AWS 인스턴스 생성/중단/종료를 직접 관리하고, CI/CD는 실행 중인 인스턴스 안의 Pineflow 서비스만 갱신합니다.

## 전체 흐름

1. 개발자가 `main` 브랜치에 push합니다.
2. GitHub Actions가 코드를 checkout합니다.
3. `npm ci`와 `npm run build`로 프론트엔드/타입 빌드를 검증합니다.
4. Docker 이미지를 빌드합니다.
5. 이미지를 GitHub Container Registry, 즉 GHCR에 push합니다.
6. GitHub Actions가 EC2에 SSH로 접속합니다.
7. EC2에서 `scripts/deploy-ec2.sh`를 실행합니다.
8. EC2는 최신 git 상태로 맞춘 뒤 `compose.deploy.yml`로 app 이미지를 pull합니다.
9. PostgreSQL은 유지하고 app 컨테이너만 새 이미지로 교체합니다.
10. `/api/health`로 배포 성공 여부를 확인합니다.

## 선택한 방식

EC2 `t3.micro`에서 직접 Docker build를 하지 않습니다. 작은 인스턴스에서 빌드를 수행하면 메모리, CPU credit, 디스크 사용량에 부담이 커질 수 있기 때문입니다.

대신 GitHub Actions가 빌드를 맡고, EC2는 완성된 이미지를 pull해서 실행만 합니다.

## 관련 파일

- `.github/workflows/deploy.yml`: GitHub Actions workflow.
- `Dockerfile`: app 이미지 빌드 정의.
- `compose.deploy.yml`: GHCR 이미지를 사용하는 운영용 Compose 구성.
- `scripts/deploy-ec2.sh`: EC2 안에서 실행되는 배포 스크립트.
- `.env.production.example`: 운영 환경 변수 템플릿.

## GitHub Secrets

repository settings에서 다음 Secrets를 등록합니다.

- `EC2_HOST`: EC2 public IP 또는 DNS.
- `EC2_USER`: SSH 사용자. 예: `ec2-user`, `ubuntu`.
- `EC2_SSH_KEY`: EC2에 접속할 private key 전체 내용.
- `EC2_APP_DIR`: EC2 안의 Pineflow 경로. 예: `/home/ec2-user/pineflow`.

GHCR package를 public으로 둘 경우 아래 값은 없어도 됩니다. GHCR package를 private으로 유지하려면 EC2가 이미지를 pull할 수 있도록 추가합니다.

- GHCR package를 public으로 전환하거나,
- EC2에서 한 번 `docker login ghcr.io`를 실행해 pull 권한을 저장합니다.

private package로 유지할 때 EC2에서 한 번 실행하는 예시는 다음과 같습니다.

```bash
echo "<read-packages-token>" | docker login ghcr.io -u pineful --password-stdin
```

## EC2 최초 준비

CI/CD가 동작하려면 EC2에 최초 1회 준비가 필요합니다.

```bash
git clone https://github.com/pineful/pineflow.git
cd pineflow
cp .env.production.example .env.production
nano .env.production
mkdir -p backups
```

`.env.production`에는 실제 비밀번호와 owner key를 넣습니다.

```bash
POSTGRES_DB=pineflow
POSTGRES_USER=pineflow
POSTGRES_PASSWORD=<긴-랜덤-비밀번호>
DATABASE_URL=postgres://pineflow:<긴-랜덤-비밀번호>@postgres:5432/pineflow
PINEFLOW_OWNER_KEY=<긴-랜덤-owner-secret>
```

처음 한 번은 다음 명령으로 DB와 app을 띄울 수 있습니다.

```bash
docker compose -p pineflow -f compose.deploy.yml up -d
```

그 뒤부터는 GitHub Actions가 app 컨테이너를 갱신합니다.

## 배포 스크립트 동작

`scripts/deploy-ec2.sh`는 다음 순서로 동작합니다.

1. `APP_DIR`로 이동합니다.
2. `.env.production`이 있는지 확인합니다.
3. `GHCR_USERNAME`, `GHCR_TOKEN`이 있으면 GHCR에 로그인합니다.
4. `git fetch origin main`과 `git reset --hard origin/main`으로 서버 코드를 최신 main에 맞춥니다.
5. PostgreSQL 컨테이너를 실행 상태로 보장합니다.
6. app 이미지를 pull합니다.
7. app 컨테이너만 새 이미지로 재시작합니다.
8. 사용하지 않는 Docker 이미지를 정리합니다.
9. `curl http://127.0.0.1/api/health`로 정상 응답을 확인합니다.

## 장애 대응

배포가 실패하면 GitHub Actions job이 실패합니다. 이 경우 EC2에서 직접 확인합니다.

```bash
cd pineflow
docker compose -p pineflow -f compose.deploy.yml ps
docker compose -p pineflow -f compose.deploy.yml logs --tail=200 app
```

직전 이미지로 즉시 되돌리는 기능은 아직 자동화하지 않았습니다. 필요하면 GHCR의 이전 SHA 태그를 지정해 `APP_IMAGE_TAG=<sha>`로 app 컨테이너를 다시 올리는 rollback 스크립트를 추가합니다.

## 보안 메모

- `EC2_SSH_KEY`는 GitHub Secrets에만 저장합니다.
- `.env.production`은 EC2 안에만 둡니다.
- `.env.production`은 Git에 커밋하지 않습니다.
- PostgreSQL 포트 `5432`는 외부로 열지 않습니다.
- 가능하면 GitHub Environment `production`에 승인 규칙을 걸어 수동 승인 후 배포되게 할 수 있습니다.
