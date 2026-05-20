# AWS EC2 Docker 배포

## 목표 구조

Pineflow는 AWS EC2 `t3.micro` 인스턴스 한 대에서 두 개의 Docker 컨테이너로 운영합니다.

- `app`: Node/Express 서버입니다. `/api`와 빌드된 Vite 프론트엔드를 함께 제공합니다.
- `postgres`: PostgreSQL 데이터베이스입니다. 데이터는 Docker named volume에 저장합니다.

AWS 인스턴스 생성, 시작, 중단, 종료는 운영자가 직접 수행합니다. 이 문서는 인스턴스 안에서 어떤 파일과 명령으로 서비스를 운영할지만 정의합니다.

## 이 구조를 선택한 이유

초기 운영에서는 단일 EC2 인스턴스와 Docker Compose가 가장 단순합니다. RDS 없이 앱과 DB를 한 인스턴스에서 분리해 실행하므로 비용과 구성 복잡도를 낮출 수 있습니다.

대신 데이터 내구성은 EC2의 EBS 볼륨과 백업 절차에 의존합니다. 인스턴스나 볼륨을 삭제하면 DB도 사라질 수 있으므로 백업이 필수입니다.

## 저장소 산출물

- `Dockerfile`: 운영용 app 이미지 빌드.
- `compose.prod.yml`: 운영용 Docker Compose 구성.
- `compose.deploy.yml`: GHCR 이미지를 pull해서 실행하는 CI/CD용 Compose 구성.
- `.env.production.example`: 운영 환경 변수 템플릿.
- `server/schema.sql`: app 시작 시 적용되는 DB 스키마.
- `docs/deployment-aws.md`: 운영 흐름 문서.
- `docs/cicd.md`: GitHub Actions 기반 자동 배포 문서.
- `docs/security.md`: 보안 운영 정책.
- `docs/data-management.md`: 백업, 복구, migration 정책.

## 인스턴스 전제

- EC2 인스턴스 타입: `t3.micro`.
- OS: Amazon Linux 또는 Ubuntu.
- Docker와 Docker Compose plugin 설치.
- Git 설치.
- 보안 그룹에서 외부에 여는 포트:
  - `22/tcp`: 운영자 IP에서만 허용.
  - `80/tcp`: HTTP 운영 중 공개.
  - `443/tcp`: TLS 적용 후 공개.
- PostgreSQL `5432` 포트는 호스트에 publish하지 않으며, 보안 그룹에서도 열지 않습니다.

## 최초 배포 흐름

1. 인스턴스에 SSH로 접속합니다.
2. 저장소를 clone합니다.

   ```bash
   git clone https://github.com/pineful/pineflow.git
   cd pineflow
   ```

3. 운영 환경 파일을 만듭니다.

   ```bash
   cp .env.production.example .env.production
   nano .env.production
   ```

4. 강한 비밀번호와 owner key를 설정합니다.

   ```bash
   POSTGRES_DB=pineflow
   POSTGRES_USER=pineflow
   POSTGRES_PASSWORD=<긴-랜덤-비밀번호>
   DATABASE_URL=postgres://pineflow:<긴-랜덤-비밀번호>@postgres:5432/pineflow
   PINEFLOW_OWNER_KEY=<긴-랜덤-owner-secret>
   PINEFLOW_ACCESS_TOKEN=<긴-랜덤-access-token>
   ```

5. 최초 실행 방식 중 하나를 선택합니다. EC2에서 직접 빌드하려면 `compose.prod.yml`을 사용합니다.

   ```bash
   docker compose -p pineflow -f compose.prod.yml up -d --build
   ```

   GitHub Actions가 만든 GHCR 이미지를 pull해서 실행하려면 `compose.deploy.yml`을 사용합니다.

   ```bash
   docker compose -p pineflow -f compose.deploy.yml up -d
   ```

6. 상태와 로그를 확인합니다.

   ```bash
   docker compose -p pineflow -f compose.prod.yml ps
   docker compose -p pineflow -f compose.prod.yml logs -f app
   ```

7. 인스턴스 내부에서 health check를 확인합니다.

   ```bash
   curl http://127.0.0.1/api/health
   ```

## 업데이트 흐름

1. 인스턴스에 SSH로 접속합니다.
2. 최신 코드를 가져옵니다.

   ```bash
   cd pineflow
   git pull --ff-only
   ```

3. 수동 업데이트라면 app 컨테이너만 다시 빌드하고 재시작합니다.

   ```bash
   docker compose -p pineflow -f compose.prod.yml up -d --build app
   ```

   CI/CD를 사용하는 경우에는 `main` 브랜치 push가 `.github/workflows/deploy.yml`을 실행하고, EC2에서 `scripts/deploy-ec2.sh`가 app 컨테이너만 새 이미지로 교체합니다.

4. 상태와 로그를 확인합니다.

   ```bash
   docker compose -p pineflow -f compose.prod.yml ps
   docker compose -p pineflow -f compose.prod.yml logs --tail=100 app
   ```

일반적인 앱 업데이트 중에는 PostgreSQL 컨테이너를 계속 실행해 둡니다.

## 중단과 재시작

데이터를 유지한 채 서비스를 중단합니다.

```bash
docker compose -p pineflow -f compose.prod.yml stop
```

다시 시작합니다.

```bash
docker compose -p pineflow -f compose.prod.yml start
```

운영 환경에서 `docker compose -p pineflow -f compose.prod.yml down -v`는 DB 볼륨 삭제가 의도된 경우에만 실행합니다.

## 백업 흐름

배포 전, 인스턴스 중단 전, 인스턴스 종료 전에는 백업을 만듭니다.

```bash
mkdir -p backups
docker compose -p pineflow -f compose.prod.yml exec postgres \
  sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -F c -f "/backups/pineflow-$(date +%Y%m%d-%H%M%S).dump"'
```

백업 파일은 정기적으로 인스턴스 밖으로 복사합니다.

```bash
scp ec2-user@<instance-public-ip>:~/pineflow/backups/*.dump ./backups/
```

Docker volume은 백업이 아닙니다. EC2 인스턴스나 연결된 EBS 볼륨이 삭제되면 데이터가 사라질 수 있습니다.

상세 정책은 `docs/data-management.md`를 따릅니다.

## 복구 흐름

1. dump 파일을 인스턴스의 `./backups` 아래에 둡니다.
2. PostgreSQL 컨테이너를 시작합니다.
3. 복구 명령을 실행합니다.

   ```bash
   docker compose -p pineflow -f compose.prod.yml exec postgres \
     sh -c 'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists "/backups/<backup-file>.dump"'
   ```

## t3.micro 운영 메모

- 인스턴스에는 Pineflow app과 PostgreSQL 컨테이너만 유지합니다.
- 트래픽이 있는 동안 무거운 빌드 작업을 반복하지 않습니다.
- `compose.prod.yml`은 PostgreSQL 메모리를 보수적으로 잡기 위해 `shared_buffers=128MB`, `max_connections=30`을 설정합니다.
- swap은 마지막 수단으로만 고려합니다. 메모리 압박을 숨기면서 인스턴스를 크게 느리게 만들 수 있습니다.
- Docker 이미지, 로그, DB 파일이 같은 디스크를 쓰므로 디스크 사용량을 주기적으로 확인합니다.

## 향후 강화 항목

- Nginx 또는 Caddy를 앞단에 두고 HTTPS를 적용합니다.
- 단일 인스턴스 DB 내구성이 부족해지면 PostgreSQL을 RDS로 옮깁니다.
- `PINEFLOW_OWNER_KEY` 단일 사용자 모델을 실제 인증 모델로 교체합니다.
- 이전 이미지 SHA로 되돌리는 rollback 스크립트를 추가합니다.

## AWS 비용 메모

AWS Free Tier와 크레딧 조건은 시점에 따라 바뀔 수 있습니다. 인스턴스를 계속 켜두기 전에 AWS Budget 알림을 설정하고, 선택한 EC2 타입, 스토리지, 데이터 전송량, 계정 플랜이 현재 무료 또는 저비용 조건에 맞는지 확인합니다.

공식 참고:

- AWS Free Tier terms: https://aws.amazon.com/free/terms/
- EC2 getting started: https://aws.amazon.com/ec2/getting-started/
