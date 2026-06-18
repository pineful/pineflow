import assert from "node:assert/strict";
import { test } from "node:test";

import { formatDuration, minutesBetween } from "./date";

// 시간 길이 표기 불변 조건: 분 앞에 0을 붙이지 않는다 (`07분` 금지).
// docs/llm-context.md / docs/modules/summary.md 기준.
test("formatDuration omits leading zero on minutes", () => {
  assert.equal(formatDuration(7), "7분");
  assert.equal(formatDuration(67), "1시간 7분");
  assert.equal(formatDuration(60), "1시간");
  assert.equal(formatDuration(0), "0분");
  assert.equal(formatDuration(125), "2시간 5분");
});

test("minutesBetween rounds and never goes negative", () => {
  assert.equal(
    minutesBetween("2026-06-18T09:00:00.000Z", "2026-06-18T10:07:00.000Z"),
    67,
  );
  // 종료가 시작보다 빠르면 음수 대신 0.
  assert.equal(
    minutesBetween("2026-06-18T10:00:00.000Z", "2026-06-18T09:00:00.000Z"),
    0,
  );
});
