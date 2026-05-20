# 변경 기록

## 2026-05-20

- Pineflow 모바일 우선 출퇴근 기록 앱을 생성했습니다.
- 제품 계획, 아키텍처, 브랜드, 모듈 설계 문서를 추가했습니다.
- 출근/퇴근 기록, 오늘 요약, 하루 목표 시간, 최근 기록 타임라인, 파인애플 테크 로고를 구현했습니다.
- Windows npm 인증서 문제를 확인하고 `NODE_OPTIONS=--use-system-ca` 해결 방법을 문서화했습니다.
- 제품명을 `Pineflow`로 확정했습니다.
- 브라우저 로컬 저장소 대신 Express API와 PostgreSQL 스키마를 사용하도록 전환했습니다.
- 로컬 PostgreSQL Docker Compose 설정을 추가했습니다.
- AWS EC2 `t3.micro` 한 대에서 app/postgres 컨테이너를 분리해 운영하는 Docker 배포 구성을 추가했습니다.
- 문서 전체를 한국어 중심으로 정리했습니다.
- GitHub Actions, GHCR, EC2 SSH 배포 스크립트를 사용하는 CI/CD 구조를 추가했습니다.
- API access token, 보안 헤더, rate limit, secret 관리 문서, DB 백업/복구 계획을 추가했습니다.
- GitHub에 EC2 SSH private key를 저장하지 않도록 pull-based CI/CD 구조로 전환했습니다.
- 현재 구현/운영/보안/데이터 관리 진행 상황을 `docs/status.md`에 정리했습니다.
- AWS Free Tier 기준 Serverless 전환 계획을 `docs/serverless-plan.md`에 추가했습니다.
- Serverless 전환의 필수 비용/보안 가드레일 10개 항목을 acceptance criteria로 고정했습니다.
