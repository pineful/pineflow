# 에이전트 협업 / 교차 검증 규칙

마지막 업데이트: 2026-06-18

## 목적

Pineflow는 한동안 Codex로 개발했고, 이제 Claude Code로 주 개발을 이어가되
Codex로 교차 검증도 병행한다. 이 문서는 두 에이전트(또는 여러 작업 흐름)가
같은 저장소를 건드릴 때 **설계 사상이 갈라지거나 서로의 작업을 덮어쓰지
않도록** 하는 공통 규칙이다.

`AGENTS.md`가 "무엇을 지킬 것인가"라면, 이 문서는 "여럿이 동시에 작업할 때
어떻게 부딪히지 않을 것인가"다.

## 1. 단일 출처 원칙 (Single source of truth)

- 제품/설계/보안/비용 사상의 **정본은 `AGENTS.md` + `docs/`** 다.
- `CLAUDE.md`는 Claude Code 자동 로드용 **진입점**일 뿐, 설계 원칙을 복제하지
  않는다. 안내/포인터만 둔다.
- 에이전트별 진입 파일과 정본의 관계:
  - Codex: `AGENTS.md`를 직접 정본으로 읽는다.
  - Claude Code: `CLAUDE.md` → `AGENTS.md`(정본) 순으로 읽는다.
- 공통 규칙(보안/비용 불변 조건, 검증 절차, 분야 매핑 등)이 바뀌면 **정본
  문서(`AGENTS.md`, `docs/llm-context.md`, `docs/workstreams.md`)를
  갱신**한다. `CLAUDE.md`에만 새 규칙을 적어 두 파일이 어긋나게 만들지 않는다.
- 규칙이 충돌하면 우선순위: `docs/adr/` > `AGENTS.md` / `docs/llm-context.md`
  > `CLAUDE.md` > 개별 모듈 문서. 충돌을 발견하면 덮어쓰지 말고 정본을
  바로잡는 커밋을 따로 남긴다.

## 2. 브랜치 규칙 (충돌 회피의 핵심)

- 에이전트는 **각자의 작업 브랜치**에서만 작업한다. 같은 브랜치에 두
  에이전트가 동시에 push하지 않는다.
  - Claude Code: `claude/<주제>` 형태의 지정 브랜치.
  - Codex: `codex/<주제>` 등 별도 브랜치.
- 작업 시작 전 항상 최신을 받는다: `git fetch origin && git pull origin <branch>`.
- `main` 이력은 rewrite하지 않는다(`docs/workstreams.md` 규칙과 동일). 이미
  올라간 설명이 부족하면 새 문서/change-log 커밋으로 보강한다.
- 다른 에이전트의 브랜치를 직접 force-push하거나 squash해서 덮지 않는다.
  교차 검증 결과는 리뷰/코멘트 또는 별도 수정 커밋으로 전달한다.
- 한 에이전트가 연 PR을 다른 에이전트가 검증할 수 있다. 검증 중에는 원
  작성자의 의도를 추정해 큰 구조를 바꾸지 말고, 문제를 먼저 보고한다.

## 3. 진행 상태 인계

- 공유 작업 로그는 `docs/status.md`와 `docs/change-log.md`다. 한 작업 흐름을
  끝내면 여기에 **무엇을, 왜** 했는지 맥락을 남겨 다른 에이전트가 이어받을 수
  있게 한다.
- 커밋에는 관련 코드와 문서가 함께 들어가야 한다(`docs/workstreams.md`의
  분야별 매핑 참고).
- 커밋 제목은 변경 의도를 드러내는 한 문장으로 쓴다. 특정 모델/도구 이름을
  커밋 본문에 식별자로 박지 않는다. 누가 했는지는 브랜치명과 change-log로
  충분히 추적된다.

## 4. 교차 검증 프로토콜

한 에이전트의 작업을 다른 에이전트가 검증할 때 동일한 기준을 쓴다.

1. 대상 브랜치/PR diff를 읽는다.
2. **가드레일 점검**: `AGENTS.md`의 "변경하면 위험한 것"과
   `docs/llm-context.md`의 보안/비용 불변 조건을 위반했는지 본다.
3. **문서 동반 갱신 점검**: 코드만 바뀌고 관련 `docs/`·ADR이 빠지지 않았는지
   `docs/workstreams.md` 매핑으로 확인한다.
4. **검증 루프 재실행** (§5).
5. 발견한 문제는 덮어쓰지 말고 리뷰 코멘트나 보고로 먼저 전달한다. 명백한
   소규모 수정만 같은 분야 안에서 직접 고치고 change-log에 남긴다.
6. 설계 판단이 갈리는 사안은 임의로 결정하지 말고 ADR 또는 사용자 확인으로
   넘긴다.

## 5. 공통 검증 루프 (OS 무관, 쉘만 다름)

검증 **항목**은 두 에이전트가 동일하다. 명령 표기만 환경에 맞춘다.

| 검증 | Linux / Claude Code (bash) | Windows / Codex (PowerShell) |
| --- | --- | --- |
| 루트 빌드+린트 | `npm run build` | `& "C:\Program Files\nodejs\npm.cmd" run build` |
| 루트 audit | `npm audit --audit-level=high` | 동일(npm.cmd) |
| infra 검증 | `cd infra && npm run verify` | `cd infra; & "...\npm.cmd" run verify` |
| infra audit | `cd infra && npm audit --audit-level=high` | 동일(npm.cmd) |

- `npm run build`는 `verify:css`(CSS 가드레일) + `tsc` + `vite build`를 포함한다.
- `infra npm run verify`는 `tsc --noEmit` + `cdk synth` + `verify-template.mjs`.
- 루트/`infra` 단위 테스트는 Node 내장 test runner(`npm test`)로 순수 모듈을
  검증한다. 화면 동작은 빌드/로컬 스모크 + 배포 후 실계정 e2e로 본다.
- 과거 `infra` audit의 moderate `brace-expansion` 잔여 이슈는 현재 lockfile
  기준 해소되어 audit이 0건이다. 새로 high/critical이 생기면 막는다.
- 검증을 통과하지 못한 변경은 인계하지 않는다.

## 6. Claude Code 환경 셋업

- web 세션 의존성 자동 설치는 `.claude/hooks/session-start.sh`(SessionStart
  훅)가 담당한다. 루트와 `infra`의 `npm install`을 멱등적으로 실행한다.
- 이 훅은 `CLAUDE_CODE_REMOTE=true`(web)에서만 동작하고 로컬 세션은 건드리지
  않는다. 등록은 `.claude/settings.json`.
- 설치 방식이나 검증 명령이 바뀌면 훅, `CLAUDE.md`, 이 문서를 함께 갱신한다.
