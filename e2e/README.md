# Pineflow E1 실계정 end-to-end 검증

배포된 Pineflow를 **관리자 테스트 계정**으로 점검하는 Playwright 하니스다. 루트
앱 빌드/CI와 분리돼 있어(`e2e/`의 독립 `package.json`) 본선 `npm run build`와
`npm test`에는 영향을 주지 않는다. 이 검증은 **배포 후** 실 URL과 계정이 있을 때만
의미가 있다.

## 점검 흐름

데스크탑(Chromium)과 모바일(Pixel 5) viewport에서 동일 시나리오를 돈다.

1. 로그인 (필요 시 첫 로그인 `NEW_PASSWORD_REQUIRED` 챌린지 처리)
2. 출근 기록 → 퇴근 기록
3. 보관함 열기 → 기록 수정 → 세션 삭제
4. Trend Lens 노출 확인
5. 로그아웃

## 사전 준비 (최초 1회)

```bash
cd e2e
npm install
npx playwright install chromium
```

> 주의: Cognito self sign-up은 비활성화돼 있으므로, 검증 계정은 **관리자가 미리
> 생성한 테스트 전용 계정**을 쓴다. 운영 데이터 계정을 쓰지 않는다.

## 실행

필요한 값은 환경 변수로 넘긴다.

| 변수 | 필수 | 설명 |
| --- | --- | --- |
| `E1_BASE_URL` | 예 | 배포된 앱 URL (예: `https://dxxxx.cloudfront.net`) |
| `E1_USERNAME` | 예 | 테스트 계정 이메일 |
| `E1_PASSWORD` | 예 | 테스트 계정 비밀번호 |
| `E1_NEW_PASSWORD` | 조건부 | 첫 로그인 챌린지가 뜰 때 설정할 새 비밀번호 |
| `E1_RUN_MUTATIONS` | 아니오 | `0`이면 기록 생성/수정/삭제를 건너뛰고 읽기 위주로만 본다(기본 `1`) |

```bash
cd e2e
E1_BASE_URL="https://<배포-URL>" \
E1_USERNAME="<테스트-이메일>" \
E1_PASSWORD="<비밀번호>" \
npm test
```

데스크탑/모바일만 따로 보려면:

```bash
npm run test:desktop
npm run test:mobile
```

리포트:

```bash
npm run report   # playwright-report/ HTML 리포트 열기
```

env가 비어 있으면 모든 테스트는 **skip** 된다(CI에서 안전).

## 비밀 관리

- `E1_PASSWORD` 등은 셸 환경 변수로만 넘기고 저장소에 커밋하지 않는다.
- 테스트 산출물(`test-results/`, `playwright-report/`)은 `.gitignore` 처리돼 있다.

## 첫 실행 후 보강

셀렉터는 현재 `src/App.tsx`의 한국어 라벨/`aria-label` 기준으로 잡았다. 첫 실제
실행에서 어긋나는 단계가 있으면 `tests/e1-smoke.spec.ts`의 해당 step 셀렉터를
조정한다. 특히 "기록 수정" step은 편집기를 열고 저장 경로만 실행하므로, 시간/메모
필드 수정까지 검증하려면 필드 셀렉터를 추가한다.
