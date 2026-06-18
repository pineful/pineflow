# CLAUDE.md

이 파일은 Claude Code가 세션 시작 시 자동으로 읽는 진입점이다. Pineflow의
설계 사상과 작업 규칙은 이 파일에 **복제하지 않는다.** 단일 출처는
`AGENTS.md`와 `docs/`이며, 이 파일은 Claude Code 환경에서 그 문서들을 어떤
순서로 읽고 어떻게 검증하는지만 안내한다.

## 1. 먼저 읽을 문서 (순서 고정)

1. `AGENTS.md` — 핵심 설계 원칙, "바꾸면 위험한 것", 검증 명령
2. `docs/agent-collaboration.md` — Codex ↔ Claude Code 공존/교차 검증 규칙
3. `docs/llm-context.md` — 제품 정체성, 아키텍처 판단, 보안/비용 불변 조건, 데이터 모델
4. `docs/workstreams.md` — 분야별 파일·문서 매핑 (작업 지도)
5. `docs/status.md` — 현재 진행 상황
6. 변경하려는 영역의 `docs/modules/*.md`, 관련 `docs/adr/`

`AGENTS.md`는 Codex와 Claude Code가 공유하는 **정본(canonical) 에이전트
지침**이다. CLAUDE.md와 AGENTS.md의 설계 원칙이 어긋나면 AGENTS.md가
우선이며, 그 경우 AGENTS.md를 갱신한다.

## 2. 실행 환경 (중요: 문서의 Windows 명령과 다름)

`README.md`, `docs/development.md`의 명령은 Codex가 쓰던 **Windows
PowerShell + `C:\Program Files\nodejs\npm.cmd`** 기준이다. Claude Code on the
web은 **Linux 컨테이너**에서 동작하므로 그 경로/PowerShell 구문을 쓰지 않고
아래 bash 명령을 쓴다. 명령의 의미와 검증 항목은 동일하고 쉘만 다르다.

- Node: 컨테이너 기본 Node(현재 v22대). Lambda runtime 고정값 `nodejs24.x`는
  배포 대상 설정이며 로컬 빌드 toolchain 버전과 무관하다. 빌드는 `tsc`/`vite`,
  infra는 `tsc`/`cdk synth`라 컨테이너 Node로 통과한다.
- 의존성: web 세션에서는 `.claude/hooks/session-start.sh`가 루트와 `infra`
  의존성을 자동 설치한다. 수동으로 필요하면 `npm install`, `cd infra && npm install`.
- `NODE_OPTIONS=--use-system-ca`(Windows 인증서 회피용)는 Linux에서 불필요하다.

## 3. 검증 루프 (커밋 전 반드시)

루트 앱을 바꿨으면:

```bash
npm run build          # verify:css(CSS 가드레일) + tsc + vite build
npm audit --audit-level=high
```

`infra`를 바꿨으면:

```bash
cd infra
npm run verify         # tsc --noEmit + cdk synth + verify-template.mjs 가드레일
npm audit --audit-level=high   # moderate brace-expansion은 알려진 잔여 이슈(Lambda asset 제외)
```

별도 단위 테스트 프레임워크는 없다. `npm run build`와 infra `npm run verify`가
린트/검증 역할을 한다. 사용자 화면이 바뀌면 가능하면 로컬 `npm run dev`나
스크린샷으로 확인한다.

## 4. 절대 깨지 말 것 (요약 — 정본은 AGENTS.md / docs/llm-context.md)

- Cognito self sign-up 비활성화, 관리자 생성 사용자만 허용
- 모든 API route에 API Gateway JWT authorizer (`/api/health` 포함)
- GitHub에 장기 AWS Access Key / SSH private key / DB secret 저장 금지, 배포는
  GitHub OIDC + IAM Role AssumeRole만
- DynamoDB single-table, GSI 미추가, capacity `1 RCU / 1 WCU`
- Lambda reserved concurrency `1`, memory `128MB`, API Gateway throttle `1 rps` burst `5`
- S3 public access block + CloudFront OAC, CloudWatch log retention 7일
- AWS Budgets `$1/$3/$5`

이 항목을 바꿔야 하면 코드보다 `docs/adr/`가 먼저다.

## 5. 작업/커밋 규칙

- 코드와 문서를 같은 커밋에서 함께 갱신한다(`docs/workstreams.md`의 분야별 매핑 참고).
- 설계 판단이 바뀌면 `docs/adr/`에 ADR을 추가하거나 상태를 갱신한다.
- 브랜치·교차 검증·충돌 회피 규칙은 `docs/agent-collaboration.md`를 따른다.
- PR은 사용자가 명시적으로 요청할 때만 만든다.
