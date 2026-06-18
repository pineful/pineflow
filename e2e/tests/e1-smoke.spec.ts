import { expect, test, type Page } from "@playwright/test";

// Pineflow 배포 후 실계정 end-to-end(E1) 스모크.
// 로그인 → 출근/퇴근 기록 → 보관함에서 기록 수정·삭제 → Trend Lens → 로그아웃을
// 데스크탑/모바일 viewport에서 점검한다. (viewport는 playwright.config.ts의 project)
//
// 실행: e2e/README.md 참고. env(URL/계정)가 없으면 자동 skip 한다.

const baseURL = process.env.E1_BASE_URL;
const username = process.env.E1_USERNAME;
const password = process.env.E1_PASSWORD;
const newPassword = process.env.E1_NEW_PASSWORD;
// 기록을 실제로 생성/수정/삭제할지. "0"이면 로그인~조회~로그아웃까지만 본다.
const runMutations = process.env.E1_RUN_MUTATIONS !== "0";

const hasConfig = Boolean(baseURL && username && password);

test.describe("Pineflow E1 실계정 스모크", () => {
  test.skip(
    !hasConfig,
    "E1_BASE_URL / E1_USERNAME / E1_PASSWORD 가 설정되지 않아 건너뜁니다. e2e/README.md 참고.",
  );

  test("로그인부터 로그아웃까지 핵심 흐름", async ({ page }) => {
    await test.step("로그인", () => signIn(page));

    await test.step("로그인 성공 — 출퇴근 액션 노출 확인", async () => {
      await expect(mainActionButton(page)).toBeVisible();
    });

    if (runMutations) {
      await test.step("출근 기록", async () => {
        const action = mainActionButton(page);
        const label = (await action.innerText()).replace(/\s+/g, " ");
        // 이미 진행 중(퇴근 기록 상태)이면 먼저 퇴근으로 세션을 닫고 새로 출근한다.
        if (/퇴근 기록/.test(label)) {
          await action.click();
          await expect(mainActionButton(page)).toContainText("출근 기록");
        }
        await mainActionButton(page).click();
        await expect(mainActionButton(page)).toContainText("퇴근 기록");
      });

      await test.step("퇴근 기록", async () => {
        await mainActionButton(page).click();
        await expect(mainActionButton(page)).toContainText("출근 기록");
      });
    }

    await test.step("보관함 열기", async () => {
      await page.getByRole("button", { name: "보관함" }).click();
      await expect(page.getByRole("heading", { name: "기록 보관함" })).toBeVisible();
    });

    if (runMutations) {
      await test.step("기록 수정", async () => {
        await expandFirstSession(page);
        const editEndpoint = page
          .getByRole("button", { name: /(출근|퇴근) 시간 수정/ })
          .first();
        await editEndpoint.click();
        // 편집기를 연 뒤 저장 경로를 실행한다. (세부 필드 변경은 첫 실행 후 보강)
        await page.getByRole("button", { name: "저장" }).click();
        await expect(page.getByRole("button", { name: "저장" })).toHaveCount(0);
      });

      await test.step("기록 삭제", async () => {
        await expandFirstSession(page);
        await page.getByRole("button", { name: "세션 삭제" }).first().click();
        await expect(page.getByText("이 세션 전체를 삭제할까요?")).toBeVisible();
        await page.getByRole("button", { name: "삭제", exact: true }).click();
        await expect(page.getByText("이 세션 전체를 삭제할까요?")).toHaveCount(0);
      });
    }

    await test.step("Trend Lens 노출 확인", async () => {
      const trendHeading = page.getByRole("heading", { name: "Trend Lens" });
      await trendHeading.scrollIntoViewIfNeeded();
      await expect(trendHeading).toBeVisible();
    });

    await test.step("로그아웃", async () => {
      await page.getByRole("button", { name: "로그아웃" }).click();
      await expect(page.getByRole("button", { name: /로그인/ })).toBeVisible();
    });
  });
});

// --- helpers ---

function mainActionButton(page: Page) {
  // .actionPanel의 출근/퇴근 기본 버튼. 접근성 이름에 small 설명이 붙으므로 정규식으로 본다.
  return page.getByRole("button", { name: /(출근|퇴근) 기록/ }).first();
}

async function signIn(page: Page) {
  await page.goto("/");
  await page.getByPlaceholder("이메일").fill(username!);
  // "비밀번호"는 정확히 일치시켜 "새 비밀번호"와 구분한다.
  await page.getByPlaceholder("비밀번호", { exact: true }).fill(password!);
  await page.getByRole("button", { name: /로그인/ }).click();

  // 첫 로그인 시 NEW_PASSWORD_REQUIRED 챌린지 처리.
  const newPasswordField = page.getByPlaceholder("새 비밀번호");
  if (await newPasswordField.isVisible({ timeout: 4000 }).catch(() => false)) {
    if (!newPassword) {
      throw new Error(
        "NEW_PASSWORD_REQUIRED 챌린지가 떴지만 E1_NEW_PASSWORD가 없습니다. 새 비밀번호를 설정해 다시 실행하세요.",
      );
    }
    await newPasswordField.fill(newPassword);
    await page.getByRole("button", { name: /비밀번호 설정/ }).click();
  }
}

async function expandFirstSession(page: Page) {
  // 접힌 세션 카드가 있으면 펼쳐 수정/삭제 컨트롤을 드러낸다.
  const collapsed = page.getByRole("button", { name: /세션 자세히 보기/ }).first();
  if (await collapsed.isVisible().catch(() => false)) {
    await collapsed.click();
  }
}
