# ADR 0006: GitHub OIDC 배포 Role 템플릿 제공

상태: 채택

날짜: 2026-05-20

## 맥락

Serverless CI/CD는 AWS에 배포 권한이 필요하다. 하지만 장기 AWS Access Key를 GitHub에 저장하면 노출 위험이 생긴다. 기존 문서에는 OIDC 원칙은 있었지만, 실제로 어떤 Role을 만들어야 하는지 저장소에 고정되어 있지 않았다.

## 결정

`infra/bootstrap/github-oidc-deploy-role.template.yaml`을 제공한다. 이 템플릿은 GitHub OIDC Provider와 `main` branch 전용 배포 Role을 만든다.

Role trust policy는 `pineful/pineflow`의 `main` branch만 허용한다.

## 결과

배포 준비 과정에서 AWS Access Key를 만들 필요가 없다. 새로운 LLM 에이전트도 GitHub OIDC 원칙을 유지하면서 IAM 설정을 이어갈 수 있다.

## 주의

이 템플릿 자체는 비용을 만들지 않지만, 이 Role로 CDK 배포를 수행하면 Pineflow AWS 리소스가 생성된다. 실제 배포 전에는 `npm run verify`와 비용 가드레일 점검을 완료해야 한다.
