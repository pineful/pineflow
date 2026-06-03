import type { CommuteState, WorkMode } from "./types";
import { getValidAccessToken, refreshSession } from "./auth";

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? "";

export class SessionExpiredError extends Error {
  constructor(message = "로그인 시간이 만료되었습니다. 다시 로그인해주세요.") {
    super(message);
    this.name = "SessionExpiredError";
  }
}

export function isSessionExpiredError(error: unknown) {
  return error instanceof SessionExpiredError;
}

async function requestState(path: string, init?: RequestInit, didRetry = false): Promise<CommuteState> {
  const token = await getValidAccessToken();
  if (!token) {
    throw new SessionExpiredError();
  }

  const response = await fetch(`${apiBaseUrl}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers ?? {}),
    },
    ...init,
  });

  if ((response.status === 401 || response.status === 403) && !didRetry) {
    const refreshedToken = await refreshSession(true);
    if (refreshedToken) {
      return requestState(path, init, true);
    }
  }

  if (response.status === 401 || response.status === 403) {
    throw new SessionExpiredError();
  }

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

export function updateRecord(recordId: string, patch: { timestamp?: string; mode?: WorkMode; note?: string }) {
  return requestState(`/api/records/${encodeURIComponent(recordId)}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}
