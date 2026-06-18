# CI/CD 설계

마지막 업데이트: 2026-05-29

## 목표

Pineflow의 본선 CI/CD는 AWS Serverless 배포입니다. `main` 브랜치에 변경 사항이 push되면 GitHub Actions가 앱과 인프라를 검증하고, GitHub OIDC로 AWS IAM Role을 assume해 CDK stack과 S3/CloudFront 프론트엔드를 갱신합니다.

EC2 Docker/PostgreSQL workflow는 PoC 보존용 수동 workflow입니다. 새 기능 배포의 기준으로 삼지 않습니다.

## Serverless 본선 흐름

1. 개발자가 `main` 브랜치에 push하거나 수동으로 `Pineflow Serverless` workflow를 실행합니다.
2. GitHub Actions가 코드를 checkout합니다.
3. Node.js 24로 루트 앱 dependency를 설치하고 `npm run build`를 실행합니다.
4. `infra` dependency를 설치하고 `npm run verify`로 CDK synth와 guardrail 검증을 실행합니다.
5. `main` push이고 필수 GitHub Repository Variables가 있으면 deploy job이 실행됩니다.
6. GitHub Actions는 장기 AWS key가 아니라 OIDC로 `AWS_ROLE_ARN`을 assume합니다.
7. `npx cdk deploy --require-approval never`로 Serverless stack을 배포합니다.
8. CDK output에서 API endpoint, Cognito, S3 bucket, CloudFront distribution 값을 읽습니다.
9. 해당 값을 Vite 환경 변수로 주입해 프론트엔드를 다시 빌드합니다.
10. `dist/`를 S3에 sync하고 CloudFront cache를 invalidate합니다.

## Serverless 롤백 (이전 정상 커밋으로 되돌리기)

배포 후 문제가 생기면 `Pineflow Serverless Rollback` workflow
(`.github/workflows/serverless-rollback.yml`)로 이전의 알려진 정상 커밋으로
되돌립니다.

1. GitHub Actions에서 `Pineflow Serverless Rollback`을 `workflow_dispatch`로 실행합니다.
2. **반드시 main 브랜치에서 실행**합니다(Actions UI의 "Use workflow from"을 main으로).
   GitHub OIDC trust subject가 `refs/heads/main`으로 고정돼 있어, 다른 브랜치에서
   실행하면 AssumeRole이 실패합니다. `target_ref` 입력에는 되돌릴 커밋 SHA나 태그만 넣습니다.
3. workflow는 그 ref를 checkout해 `npm run build`와 infra `npm run verify`로 먼저
   검증한 뒤, OIDC로 IAM Role을 assume해 `cdk deploy`로 인프라를 그 시점 템플릿으로
   되돌리고, 같은 ref의 프론트엔드를 다시 빌드해 S3/CloudFront에 반영합니다.
4. `cdk deploy`가 인프라까지 그 ref 기준으로 정렬하므로 백엔드와 프론트엔드가
   같은 시점 상태로 맞춰집니다.

롤백과 일반 배포는 같은 `pineflow-serverless-deploy` concurrency group을 공유해
한 시점에 한 배포만 stack을 만지도록 합니다. DynamoDB에 저장된 사용자 데이터는
코드 롤백으로 되돌아가지 않으므로, 데이터 구조를 바꾼 배포를 되돌릴 때는
`docs/data-management.md` 기준으로 데이터 영향을 먼저 검토합니다.

## 본선 관련 파일

- `.github/workflows/serverless.yml`: Serverless 검증과 배포 workflow.
- `.github/workflows/serverless-rollback.yml`: 이전 정상 커밋으로 되돌리는 수동 롤백 workflow.
- `infra/lib/pineflow-serverless-stack.ts`: CDK stack 정의.
- `infra/scripts/verify-template.mjs`: 비용/보안 guardrail 검증.
- `infra/bootstrap/github-oidc-deploy-role.template.yaml`: GitHub OIDC 배포 Role 템플릿.
- `docs/aws-iam-oidc.md`: OIDC Role 생성 절차.
- `docs/aws-serverless-deployment-checklist.md`: 배포 전후 점검표.

## GitHub Repository Variables

본선 workflow에는 Repository Variables를 사용합니다.

- `AWS_ROLE_ARN`
- `AWS_REGION`
- `BUDGET_ALERT_EMAIL`

장기 AWS access key, AWS secret access key, SSH private key는 GitHub Secrets나 Variables에 저장하지 않습니다.

## PoC Docker workflow

`.github/workflows/deploy.yml`의 `Build Pineflow PoC Image` workflow는 `workflow_dispatch`로만 실행되는 PoC 이미지 빌드용입니다. EC2 실험 환경에서 GHCR 이미지를 쓰기 위한 흔적이며, 본선 운영 배포가 아닙니다.

PoC 흐름은 GitHub에 EC2 SSH private key를 저장하지 않기 위해 pull-based 구조를 사용했습니다. EC2의 `systemd timer` 또는 운영자의 수동 명령이 `scripts/deploy-ec2.sh`를 실행하고, EC2가 직접 GitHub/GHCR에서 pull합니다.

## PoC 관련 파일

- `.github/workflows/deploy.yml`: 수동 PoC 이미지 빌드 workflow.
- `Dockerfile`: app 이미지 빌드 정의.
- `compose.deploy.yml`: GHCR 이미지를 사용하는 PoC 운영용 Compose 구성.
- `scripts/deploy-ec2.sh`: EC2 안에서 실행되는 pull-based 배포 스크립트.
- `ops/systemd/pineflow-update.service`: EC2에서 update script를 실행하는 systemd service 예시.
- `ops/systemd/pineflow-update.timer`: 주기적으로 update service를 실행하는 systemd timer 예시.
- `.env.production.example`: PoC 운영 환경 변수 템플릿.

## 금지하는 GitHub Secrets

등록하지 말아야 할 값은 다음과 같습니다.

- `EC2_HOST`
- `EC2_USER`
- `EC2_SSH_KEY`
- `EC2_APP_DIR`
- AWS access key
- AWS secret access key

PoC Docker workflow는 기본 `GITHUB_TOKEN`으로 GHCR에 이미지를 push합니다. Serverless workflow는 GitHub OIDC와 IAM Role만 사용합니다.

## EC2 최초 준비

이 절은 PoC 참고용입니다. 본선 Serverless 배포에는 필요하지 않습니다.

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
PINEFLOW_ACCESS_TOKEN=<긴-랜덤-access-token>
```

GHCR package를 public으로 두면 별도 로그인 없이 이미지를 pull할 수 있습니다. private으로 유지하려면 EC2에서 한 번 로그인합니다.

```bash
echo "<read-packages-token>" | docker login ghcr.io -u pineful --password-stdin
```

처음 한 번은 다음 명령으로 DB와 app을 띄울 수 있습니다.

```bash
docker compose -p pineflow -f compose.deploy.yml up -d
```

## 자동 업데이트 방식

EC2에서 systemd timer를 사용할 수 있습니다.

```bash
mkdir -p ~/.config/systemd/user
cp ops/systemd/pineflow-update.service ~/.config/systemd/user/
cp ops/systemd/pineflow-update.timer ~/.config/systemd/user/
systemctl --user daemon-reload
systemctl --user enable --now pineflow-update.timer
```

사용자 세션이 종료되어도 user timer가 돌게 하려면 운영자가 한 번 설정합니다.

```bash
loginctl enable-linger "$USER"
```

timer 주기는 `ops/systemd/pineflow-update.timer`의 `OnUnitActiveSec`에서 조정합니다. 현재 예시는 2분마다 확인합니다.

## 수동 업데이트 방식

자동 timer 없이 직접 갱신하려면 EC2에서 다음 명령을 실행합니다.

```bash
cd pineflow
APP_IMAGE_TAG=latest scripts/deploy-ec2.sh
```

## 배포 스크립트 동작

`scripts/deploy-ec2.sh`는 다음 순서로 동작합니다.

1. `APP_DIR`로 이동합니다.
2. `.env.production`이 있는지 확인합니다.
3. `git pull --ff-only origin main`으로 서버 코드를 최신 main에 맞춥니다.
4. PostgreSQL 컨테이너를 실행 상태로 보장합니다.
5. app 이미지를 pull합니다.
6. app 컨테이너만 새 이미지로 재시작합니다.
7. 사용하지 않는 Docker 이미지를 정리합니다.
8. `curl http://127.0.0.1/api/health`로 정상 응답을 확인합니다.

## 장애 대응

PoC 배포가 실패하면 EC2의 systemd service 또는 timer 로그를 확인합니다.

```bash
systemctl --user status pineflow-update.service
journalctl --user -u pineflow-update.service -n 100
```

컨테이너 상태와 app 로그도 확인합니다.

```bash
cd pineflow
docker compose -p pineflow -f compose.deploy.yml ps
docker compose -p pineflow -f compose.deploy.yml logs --tail=200 app
```

직전 이미지로 즉시 되돌리는 기능은 아직 자동화하지 않았습니다. 필요하면 GHCR의 이전 SHA 태그를 지정해 `APP_IMAGE_TAG=<sha>`로 app 컨테이너를 다시 올리는 rollback 스크립트를 추가합니다.

## 보안 메모

- GitHub에 EC2 SSH private key를 저장하지 않습니다.
- GitHub에 AWS access key를 저장하지 않습니다.
- `.env.production`은 EC2 안에만 둡니다.
- `.env.production`은 Git에 커밋하지 않습니다.
- PostgreSQL 포트 `5432`는 외부로 열지 않습니다.
- GHCR package를 private으로 유지한다면 EC2의 Docker credential 저장 위치를 보호합니다.
- AWS API 호출 자동화는 이미 Serverless workflow에서 GitHub OIDC와 AWS IAM Role을 사용합니다. 장기 access key 방식으로 되돌리지 않습니다.
