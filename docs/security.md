# 보안 설계

## 현재 원칙

Pineflow는 개인용 서비스지만 인터넷에 노출될 수 있으므로 기본적으로 private application처럼 다룹니다. 소스코드에는 실제 access token, DB 비밀번호, SSH key, AWS credential을 절대 저장하지 않습니다.

## 코드 보안

- SQL은 `pg`의 parameterized query를 사용합니다.
- `/api/health`를 제외한 API는 Bearer access token을 요구합니다.
- 운영 서버는 `PINEFLOW_ACCESS_TOKEN`과 `PINEFLOW_OWNER_KEY`가 약하거나 비어 있으면 시작하지 않습니다.
- Express의 `x-powered-by` 헤더를 끕니다.
- `helmet`으로 기본 보안 헤더와 CSP를 설정합니다.
- API 요청 body는 `16kb`로 제한합니다.
- `/api`에는 기본 rate limit을 둡니다.
- 업무 모드는 allowlist로 검증합니다.
- 메모는 300자로 잘라 저장합니다.

## Access key 모델

현재는 단일 사용자 개인 서비스이므로 `PINEFLOW_ACCESS_TOKEN`을 서버 환경 변수로 두고, 사용자가 브라우저에서 access key를 입력합니다. 브라우저는 이 값을 `localStorage`에 저장하고 API 요청에 `Authorization: Bearer <token>`을 붙입니다.

이 방식은 소스코드에 secret을 넣지 않는 장점이 있지만, 완전한 인증 시스템은 아닙니다. 나중에 여러 사용자나 장기 운영으로 확장하면 다음 단계가 필요합니다.

- HTTPS 필수화.
- 로그인 세션과 httpOnly cookie.
- 비밀번호 해시 저장.
- CSRF 방어.
- 사용자별 owner key.

## Secret 관리

커밋하면 안 되는 값:

- `.env`
- `.env.local`
- `.env.production`
- AWS access key와 secret access key.
- EC2 SSH private key.
- GitHub token.
- PostgreSQL 실제 비밀번호.
- `PINEFLOW_ACCESS_TOKEN`.
- `PINEFLOW_OWNER_KEY`.

현재 `.gitignore`는 운영 환경 파일을 제외합니다. 예시는 `.env.example`, `.env.production.example`만 커밋합니다.

## GitHub와 AWS credential

현재 CI/CD는 AWS API를 호출하지 않습니다. 따라서 GitHub에 AWS access key를 저장할 필요가 없습니다.

배포는 GitHub Actions가 EC2에 SSH로 접속해 Docker image를 pull하고 app 컨테이너만 교체하는 방식입니다. GitHub Secrets에 들어가는 값은 `EC2_HOST`, `EC2_USER`, `EC2_SSH_KEY`, `EC2_APP_DIR`입니다.

나중에 GitHub Actions가 AWS API를 직접 호출해야 한다면 장기 AWS access key를 GitHub Secrets에 저장하지 않고, GitHub OIDC와 AWS IAM role을 사용합니다. GitHub 공식 문서는 OIDC가 cloud provider에서 short-lived token을 교환하게 해 장기 credential 저장을 피할 수 있다고 설명합니다. AWS 연동 시에는 trust policy에 `token.actions.githubusercontent.com:sub` 조건을 걸어 특정 repository와 branch만 role을 받을 수 있게 해야 합니다.

참고:

- GitHub OIDC: https://docs.github.com/en/actions/concepts/security/openid-connect
- GitHub Actions AWS OIDC 설정: https://docs.github.com/en/actions/deployment/security-hardening-your-deployments/configuring-openid-connect-in-amazon-web-services

## GitHub secret scanning

GitHub public repository는 secret scanning과 push protection의 도움을 받을 수 있습니다. GitHub 문서에 따르면 push protection은 hardcoded credential이 repository history에 들어가기 전에 push를 차단하는 기능입니다.

repository 설정에서 확인할 항목:

- Secret scanning 활성화.
- Push protection 활성화.
- GitHub Advanced Security가 필요한 기능과 public repository 기본 제공 기능 구분.

참고:

- Push protection: https://docs.github.com/en/code-security/secret-scanning/introduction/about-push-protection
- Secret scanning 활성화: https://docs.github.com/en/code-security/secret-scanning/enabling-secret-scanning-features

## 운영 보안 체크리스트

- EC2 security group은 `22`, `80`, `443`만 필요한 범위로 엽니다.
- `5432`는 외부에 열지 않습니다.
- SSH는 운영자 IP에서만 허용합니다.
- `.env.production` 권한은 운영 사용자만 읽게 둡니다.
- EC2에 저장한 SSH key나 GitHub token이 있으면 최소 권한으로 둡니다.
- 가능한 빨리 HTTPS를 적용합니다.
- 배포 전후로 `docker compose logs app`에서 secret이 출력되지 않는지 확인합니다.
