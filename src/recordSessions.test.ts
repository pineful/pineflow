import assert from "node:assert/strict";
import { test } from "node:test";

import type { CommuteRecord } from "./types";
import { buildRecentSessions, sessionIdForRecord } from "./recordSessions";

test("sessionIdForRecord strips the trailing event suffix", () => {
  assert.equal(
    sessionIdForRecord({ id: "session-1:check-in" } as CommuteRecord),
    "session-1",
  );
  // 구분자가 없으면 id 전체를 세션 id로 본다.
  assert.equal(sessionIdForRecord({ id: "session-2" } as CommuteRecord), "session-2");
});

test("buildRecentSessions groups check-in/out of the same session", () => {
  const records: CommuteRecord[] = [
    {
      id: "s1:check-in",
      type: "check-in",
      timestamp: "2026-06-18T09:00:00.000Z",
      mode: "focus",
      note: "morning",
    },
    {
      id: "s1:check-out",
      type: "check-out",
      timestamp: "2026-06-18T11:00:00.000Z",
      mode: "focus",
      note: "morning",
    },
  ];

  const sessions = buildRecentSessions(records, new Date("2026-06-18T12:00:00.000Z"));
  // 같은 session id의 출근/퇴근은 하나의 세션으로 묶인다.
  assert.equal(sessions.length, 1);
  assert.equal(sessions[0].id, "s1");
  assert.equal(sessions[0].checkIn?.timestamp, "2026-06-18T09:00:00.000Z");
  assert.equal(sessions[0].checkOut?.timestamp, "2026-06-18T11:00:00.000Z");
  assert.equal(sessions[0].durationMinutes, 120);
  assert.equal(sessions[0].isOpen, false);
});
