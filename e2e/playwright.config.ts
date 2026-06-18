import { defineConfig, devices } from "@playwright/test";

// E1 검증은 "배포된" Pineflow를 실계정으로 점검한다. 로컬 dev가 아니라
// CloudFront URL과 관리자 테스트 계정을 env로 받는다.
//   E1_BASE_URL   배포된 앱 URL (예: https://dxxxx.cloudfront.net)
//   E1_USERNAME   테스트 Cognito 계정 이메일
//   E1_PASSWORD   테스트 계정 비밀번호
//   E1_NEW_PASSWORD  (선택) 첫 로그인 NEW_PASSWORD_REQUIRED 챌린지 시 설정할 새 비밀번호
//   E1_RUN_MUTATIONS  (선택, 기본 "1") 출퇴근 기록/수정/삭제까지 수행할지. "0"이면 읽기 위주.
const baseURL = process.env.E1_BASE_URL;

export default defineConfig({
  testDir: "./tests",
  // 배포 환경을 건드리므로 병렬을 끄고 순차로 돌려 데이터 경합을 막는다.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: [["list"], ["html", { open: "never" }]],
  timeout: 60_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure"
  },
  projects: [
    {
      name: "desktop-chromium",
      use: { ...devices["Desktop Chrome"] }
    },
    {
      name: "mobile-pixel",
      use: { ...devices["Pixel 5"] }
    }
  ]
});
