import type { CommuteState, WorkMode } from "./types";
import { getStoredIdToken } from "./auth";

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? "";

async function requestState(path: string, init?: RequestInit): Promise<CommuteState> {
  const token = getStoredIdToken();
  const response = await fetch(`${apiBaseUrl}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers ?? {}),
    },
    ...init,
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({ error: "Request failed." }));
    throw new Error(body.error ?? "Request failed.");
  }

  return response.json();
}

export function fetchState() {
  return requestState("/api/state");
}

export function createCheckIn(mode: WorkMode, note: string) {
  return requestState("/api/check-in", {
    method: "POST",
    body: JSON.stringify({ mode, note }),
  });
}

export function createCheckOut() {
  return requestState("/api/check-out", {
    method: "POST",
  });
}

export function saveDailyGoal(dailyGoalMinutes: number) {
  return requestState("/api/settings", {
    method: "PATCH",
    body: JSON.stringify({ dailyGoalMinutes }),
  });
}
