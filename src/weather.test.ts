import assert from "node:assert/strict";
import { test } from "node:test";

import { weatherCondition } from "./weather";

// Open-Meteo weather code → 한국어 상태 매핑. docs/modules/weather.md 기준.
test("weatherCondition maps Open-Meteo codes", () => {
  assert.equal(weatherCondition(0), "맑음");
  assert.equal(weatherCondition(2), "구름 조금");
  assert.equal(weatherCondition(45), "안개");
  assert.equal(weatherCondition(61), "비");
  assert.equal(weatherCondition(75), "눈");
  assert.equal(weatherCondition(95), "뇌우");
  // allowlist 밖의 코드는 안전한 기본값.
  assert.equal(weatherCondition(1234), "변화 있음");
});
