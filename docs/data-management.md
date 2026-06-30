# 데이터 백업과 마이그레이션 계획

## 목표

애플리케이션 코드와 DB 스키마가 발전해도 기존 출퇴근 기록은 계속 이어져야 합니다. 이를 위해 백업, 복구, 스키마 변경, 마이그레이션 검증 절차를 분리합니다.

## 현재 데이터 저장소

운영 본선은 DynamoDB single-table입니다. EC2 Docker/PostgreSQL 구성은 PoC와
레거시 복구 절차로만 유지하고, 새 운영 기능이나 배포 절차는 DynamoDB 기준으로
작성합니다.

Serverless 본선:

- DynamoDB table `pineflow`이 사용자 기록, 설정, 운영 사용량 cache, Trend Lens cache를 저장합니다.
- CDK에서 deletion protection과 retain policy를 적용하지만, 작업 실수나 마이그레이션 실패에 대비해 별도 논리 백업을 남깁니다.
- 백업 파일 기본 위치는 repository 루트의 `backups/` 디렉터리이며, `.gitignore`에 포함됩니다.

레거시 PoC:

- PostgreSQL 컨테이너가 데이터를 저장합니다.
- 데이터 위치는 Docker named volume `pineflow_postgres`입니다.
- 백업 파일은 repository 루트의 `backups/` 디렉터리에 bind mount됩니다.

Docker volume은 장애 복구 수단이 아닙니다. 인스턴스나 EBS 볼륨이 삭제되면 volume도 사라질 수 있습니다.

## 레거시 PoC PostgreSQL 백업 정책

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

## Serverless DynamoDB 백업 정책

운영 본선의 원천 데이터는 DynamoDB table `pineflow`입니다. 이 저장소는 CDK에서
deletion protection과 retain policy를 적용하지만, 삭제 방지만으로는 작업 실수나
마이그레이션 실패에 대비할 수 없습니다. DynamoDB 백업은 새 AWS 리소스를 만들지
않는 논리 백업 스크립트로 시작합니다.

백업 스크립트:

```powershell
cd infra
& "C:\Program Files\nodejs\npm.cmd" run dynamodb:backup -- --out ../backups/pineflow-dynamodb-20260629-000000.json --profile <aws-profile> --region ap-northeast-2
& "C:\Program Files\nodejs\npm.cmd" run dynamodb:backup:validate -- --file ../backups/pineflow-dynamodb-20260629-000000.json
```

Linux/macOS에서는 같은 의미로 실행합니다.

```bash
cd infra
npm run dynamodb:backup -- --out ../backups/pineflow-dynamodb-$(date +%Y%m%d-%H%M%S).json --profile <aws-profile> --region ap-northeast-2
npm run dynamodb:backup:validate -- --file ../backups/<backup-file>.json
```

이 스크립트는 AWS CLI v2 credential을 사용해 `scan`을 작은 page로 나누어 실행하고,
각 page 사이에 기본 1.2초 지연을 둡니다. DynamoDB `1 RCU / 1 WCU` 가드레일을
존중하기 위한 선택이며, 대량 데이터가 생기면 더 작은 `--page-size`나 더 긴
`--delay-ms`를 사용합니다. 백업 파일은 DynamoDB AttributeValue JSON 원형을 담고
있어 `SETTINGS`, `ACTIVE_SESSION`, `SESSION#...`, `USAGE#...`,
`SYSTEM#TREND_LENS` item을 모두 보존할 수 있습니다.

검증은 다음을 확인합니다.

- 모든 item에 문자열 `pk`, `sk`가 있다.
- 같은 `pk/sk` item이 중복되지 않는다.
- `SESSION#<checkInAt>#<sessionId>` sort key와 item의 `checkInAt`, `sessionId`가 맞는다.
- `ACTIVE_SESSION.sessionSk`가 같은 사용자 partition의 실제 `SESSION#...` item을 가리킨다.
- `ACTIVE_SESSION.sessionId`가 참조 session item과 일치한다.

`backups/`는 `.gitignore`에 포함됩니다. 백업 파일에는 개인 출퇴근 기록과 설정이
들어가므로 저장소나 이슈/PR에 첨부하지 말고, 필요하면 로컬 암호화 저장소나 개인
보안 저장 위치로 옮깁니다.

## Serverless DynamoDB 복구 정책

복구는 먼저 dry-run으로 검증합니다.

```powershell
cd infra
& "C:\Program Files\nodejs\npm.cmd" run dynamodb:restore -- --file ../backups/<backup-file>.json --dry-run --profile <aws-profile> --region ap-northeast-2
```

실제 복구 기본값은 기존 item을 덮어쓰지 않습니다. 빈 table 또는 새 table로 복구할
때는 기본 옵션을 사용합니다.

```powershell
& "C:\Program Files\nodejs\npm.cmd" run dynamodb:restore -- --file ../backups/<backup-file>.json --profile <aws-profile> --region ap-northeast-2
```

이미 일부 item이 있는 table에 안전하게 보강할 때는 기존 item을 건너뜁니다.

```powershell
& "C:\Program Files\nodejs\npm.cmd" run dynamodb:restore -- --file ../backups/<backup-file>.json --skip-existing --profile <aws-profile> --region ap-northeast-2
```

Trend Lens와 운영 사용량 snapshot은 다시 만들 수 있는 파생 cache입니다. 복구
목표가 사용자 기록/설정 보존이면 `--skip-derived`로 `SYSTEM#TREND_LENS`와
`USAGE#...` item을 제외할 수 있습니다.

```powershell
& "C:\Program Files\nodejs\npm.cmd" run dynamodb:restore -- --file ../backups/<backup-file>.json --skip-derived --profile <aws-profile> --region ap-northeast-2
```

`--overwrite`는 기존 item을 덮어쓸 수 있으므로, 복구 대상 table과 백업 파일을
검증하고 현재 table을 별도 백업한 뒤에만 사용합니다.

복구 후 확인:

- `npm run dynamodb:backup:validate -- --file <backup-file>` 재확인.
- Cognito 테스트 계정으로 로그인 후 `/api/state` 기반 대시보드가 열린다.
- 활성 세션이 있었다면 `ACTIVE_SESSION`과 실제 `SESSION#...` item이 함께 복구되어 진행 중 세션으로 보인다.
- 최근 기록, 기록 보관함 검색, 오늘 누적 시간이 기대한 기록과 맞다.
- Trend Lens/운영 사용량 cache를 `--skip-derived`로 제외했다면 첫 조회나 다음 scheduled refresh에서 다시 채워지는지 확인한다.

## 레거시 PoC PostgreSQL 복구 정책

복구 전에는 현재 DB 상태를 다시 백업합니다. 그 뒤 dump 파일을 `backups/`에 둔 후 복구합니다.

```bash
scripts/restore-db.sh backups/<backup-file>.dump
```

복구 후 확인:

```bash
curl http://127.0.0.1/api/health
docker compose -p pineflow -f compose.deploy.yml logs --tail=100 app
```

## 레거시 PoC PostgreSQL 스키마 변경 원칙

현재 `server/schema.sql`은 idempotent schema 적용 방식입니다. 초기 단계에서는 충분하지만, 데이터가 누적되면 정식 migration 관리가 필요합니다.

스키마 변경 시 원칙:

- 기존 컬럼을 바로 삭제하지 않습니다.
- 새 컬럼은 nullable 또는 default 포함으로 먼저 추가합니다.
- 데이터 backfill이 필요한 변경은 별도 migration으로 나눕니다.
- 코드가 새 컬럼과 기존 컬럼을 함께 읽을 수 있는 과도기를 둡니다.
- 배포 전 `pg_dump` 백업을 남깁니다.
- 복구 절차를 먼저 확인한 뒤 migration을 적용합니다.

## 레거시 PoC PostgreSQL migration 단계

1. `server/migrations/` 디렉터리를 도입합니다.
2. `schema_migrations` 테이블을 만듭니다.
3. 실행된 migration 파일명을 기록합니다.
4. app 시작 시 아직 적용되지 않은 migration만 순서대로 실행합니다.
5. destructive migration은 자동 실행하지 않고 수동 승인 절차를 둡니다.

## 레거시 PoC PostgreSQL 환경 이전 절차

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

## 장기 개선 후보

- S3 또는 다른 외부 저장소로 백업 자동 업로드.
- 백업 암호화.
- 복구 리허설 주기화.
- migration 도구 도입.
- RDS 이전 시 automated backup과 point-in-time recovery 사용.

## Serverless 운영 메모

- DynamoDB 기록 보정은 schema migration이 아니라 item 갱신입니다.
- 출근 시각 보정은 `SESSION#<ISO 시간>#<session-id>` sort key를 이동하므로, 대량 import/export 도구를 만들 때 동일한 규칙을 따라야 합니다.
- DynamoDB export/import 절차는 `infra/scripts/dynamodb-backup.mjs`를 기준으로 합니다.
- `SETTINGS`, `ACTIVE_SESSION`, `SESSION#...` item의 관계와 `ACTIVE_SESSION.sessionSk` 참조 검증은 복구 전 필수 단계입니다.
