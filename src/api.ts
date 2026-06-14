import type { CommuteState, OperationalUsageSnapshot, TrendLensSnapshot, WorkMode } from "./types";
import { getValidAccessToken, refreshSession } from "./auth";

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? "";

export class SessionExpiredError extends Error {
  constructor(message = "로그인 시간이 만료되었습니다. 다시 로그인해주세요.") {
    super(message);
    this.name = "SessionExpiredError";
  }
}

export class ApiRequestError extends Error {
  statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.name = "ApiRequestError";
    this.statusCode = statusCode;
  }
}

export function isSessionExpiredError(error: unknown) {
  return error instanceof SessionExpiredError;
}

export function isApiRequestError(error: unknown): error is ApiRequestError {
  return error instanceof ApiRequestError;
}

function messageForStatus(statusCode: number, serverMessage?: string) {
  const message = serverMessage?.trim();

  if (statusCode === 429) {
    if (message && message !== "Request failed.") return message;
    return "요청이 너무 빠르게 이어졌습니다. 잠시 후 다시 시도해주세요.";
  }

  if (statusCode >= 500) {
    return "서버가 요청을 처리하지 못했습니다. 잠시 후 다시 시도해주세요.";
  }

  if (!message || message === "Request failed." || message === "Unexpected server error.") {
    return "요청을 처리하지 못했습니다. 잠시 후 다시 시도해주세요.";
  }

  return message;
}

async function requestJson<T>(path: string, init?: RequestInit, didRetry = false): Promise<T> {
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
      return requestJson<T>(path, init, true);
    }
  }

  if (response.status === 401 || response.status === 403) {
    throw new SessionExpiredError();
  }

  if (!response.ok) {
    const body = await response.json().catch(() => ({ error: "" }));
    throw new ApiRequestError(response.status, messageForStatus(response.status, body.error));
  }

  return response.json();
}

async function requestState(path: string, init?: RequestInit, didRetry = false) {
  return requestJson<CommuteState>(path, init, didRetry);
}

export function fetchState() {
  return requestState("/api/state");
}

export function fetchUsage() {
  return requestJson<OperationalUsageSnapshot>("/api/usage");
}

export function fetchTrendLens() {
  return requestJson<TrendLensSnapshot>("/api/trend-lens");
}

export function refreshTrendLens(scope: "all" | "security" = "all") {
  return requestJson<TrendLensSnapshot>("/api/trend-lens/refresh", {
    method: "POST",
    body: JSON.stringify({ scope, force: true }),
  });
}

export function resetTrendLens(scope: "all" | "security" = "all") {
  return requestJson<TrendLensSnapshot>("/api/trend-lens/refresh", {
    method: "POST",
    body: JSON.stringify({ scope, force: true, reset: true }),
  });
}

export function createCheckIn(
  mode: WorkMode,
  note: string,
  options?: { resolveActiveSession?: "mark-missing-check-out"; inferredCheckOutAt?: string }
) {
  return requestState("/api/check-in", {
    method: "POST",
    body: JSON.stringify({ mode, note, ...options }),
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

export function deleteRecord(recordId: string) {
  return requestState(`/api/records/${encodeURIComponent(recordId)}`, {
    method: "DELETE",
  });
}
