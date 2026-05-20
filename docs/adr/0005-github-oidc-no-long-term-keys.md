# ADR 0005: GitHub OIDC와 장기 키 금지

상태: 채택

날짜: 2026-05-20

## 맥락

GitHub Secrets에 AWS Access Key나 SSH private key를 저장하면 노출 위험이 생긴다. CI/CD는 배포 권한이 필요하지만 장기 credential을 보관하면 안 된다.

## 결정

GitHub Actions는 OIDC로 AWS IAM Role을 assume한다. 장기 AWS Access Key는 GitHub에 저장하지 않는다.

## 결과

AWS 쪽 IAM Role과 trust policy 준비가 필요하지만, secret 노출 위험을 줄인다.

## LLM 작업 지침

`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, SSH private key를 GitHub Secrets에 넣는 배포 방식으로 바꾸지 않는다.
