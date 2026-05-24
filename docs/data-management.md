# 데이터 백업과 마이그레이션 계획

## 목표

애플리케이션 코드와 DB 스키마가 발전해도 기존 출퇴근 기록은 계속 이어져야 합니다. 이를 위해 백업, 복구, 스키마 변경, 마이그레이션 검증 절차를 분리합니다.

## 현재 데이터 저장소

- PostgreSQL 컨테이너가 데이터를 저장합니다.
- 데이터 위치는 Docker named volume `pineflow_postgres`입니다.
- 백업 파일은 repository 루트의 `backups/` 디렉터리에 bind mount됩니다.
- 운영 본선은 DynamoDB single-table입니다. EC2/PostgreSQL 내용은 PoC 복구 계획으로만 유지합니다.

Docker volume은 장애 복구 수단이 아닙니다. 인스턴스나 EBS 볼륨이 삭제되면 volume도 사라질 수 있습니다.

## 백업 정책

최소 백업 시점:

- 배포 전.
- 스키마 변경 전.
- EC2 인스턴스 중단 전.
- EC2 인스턴스 종료 전.
- 주기적으로 수동 백업.

백업 명령:

```bash
scripts/backup-db.sh
```

직접 실행할 때:

```bash
docker compose -p pineflow -f compose.deploy.yml exec postgres \
  sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -F c -f "/backups/pineflow-$(date +%Y%m%d-%H%M%S).dump"'
```

백업 파일은 인스턴스 밖으로 복사합니다.

```bash
scp ec2-user@<instance-public-ip>:~/pineflow/backups/*.dump ./backups/
```

## 복구 정책

복구 전에는 현재 DB 상태를 다시 백업합니다. 그 뒤 dump 파일을 `backups/`에 둔 후 복구합니다.

```bash
scripts/restore-db.sh backups/<backup-file>.dump
```

복구 후 확인:

```bash
curl http://127.0.0.1/api/health
docker compose -p pineflow -f compose.deploy.yml logs --tail=100 app
```

## 스키마 변경 원칙

현재 `server/schema.sql`은 idempotent schema 적용 방식입니다. 초기 단계에서는 충분하지만, 데이터가 누적되면 정식 migration 관리가 필요합니다.

스키마 변경 시 원칙:

- 기존 컬럼을 바로 삭제하지 않습니다.
- 새 컬럼은 nullable 또는 default 포함으로 먼저 추가합니다.
- 데이터 backfill이 필요한 변경은 별도 migration으로 나눕니다.
- 코드가 새 컬럼과 기존 컬럼을 함께 읽을 수 있는 과도기를 둡니다.
- 배포 전 `pg_dump` 백업을 남깁니다.
- 복구 절차를 먼저 확인한 뒤 migration을 적용합니다.

## 권장 migration 단계

1. `server/migrations/` 디렉터리를 도입합니다.
2. `schema_migrations` 테이블을 만듭니다.
3. 실행된 migration 파일명을 기록합니다.
4. app 시작 시 아직 적용되지 않은 migration만 순서대로 실행합니다.
5. destructive migration은 자동 실행하지 않고 수동 승인 절차를 둡니다.

## 환경 이전 절차

새 EC2 또는 새 PostgreSQL 환경으로 옮길 때:

1. 기존 환경에서 백업을 생성합니다.
2. 백업 파일을 로컬 또는 안전한 저장소로 복사합니다.
3. 새 환경에서 Pineflow repository를 clone합니다.
4. `.env.production`을 새 환경에 맞게 작성합니다.
5. PostgreSQL 컨테이너를 먼저 시작합니다.
6. dump 파일을 `backups/`에 넣습니다.
7. `scripts/restore-db.sh backups/<backup-file>.dump`를 실행합니다.
8. app 컨테이너를 시작합니다.
9. UI에서 최근 기록과 오늘 요약을 확인합니다.

## 장기 개선

- S3 또는 다른 외부 저장소로 백업 자동 업로드.
- 백업 암호화.
- 복구 리허설 주기화.
- migration 도구 도입.
- RDS 이전 시 automated backup과 point-in-time recovery 사용.

## Serverless 운영 메모

- DynamoDB 기록 보정은 schema migration이 아니라 item 갱신입니다.
- 출근 시각 보정은 `SESSION#<ISO 시간>#<session-id>` sort key를 이동하므로, 대량 import/export 도구를 만들 때 동일한 규칙을 따라야 합니다.
- DynamoDB export/import 절차를 구현할 때는 `SETTINGS`, `ACTIVE_SESSION`, `SESSION#...` item의 관계와 `ACTIVE_SESSION.sessionSk` 참조를 검증 항목에 포함합니다.
