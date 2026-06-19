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

// Lambda는 reserved concurrency 1로 동작하므로 동시에 두 개 이상의 요청이 도달하면
// 두 번째 요청이 throttle되어 5xx로 떨어진다(예: 로그인 직후 백그라운드 usage/trend
// 조회와 출퇴근 기록 요청이 겹치는 경우). 모든 API 호출을 FIFO로 직렬화해 단일 클라이언트가
// 스스로 동시 요청을 만들지 않도록 막는다. 자동 재시도는 출퇴근 같은 비멱등 요청을 중복
// 생성할 수 있어 두지 않는다.
let requestQueue: Promise<unknown> = Promise.resolve();

function enqueueRequest<T>(task: () => Promise<T>): Promise<T> {
  const result = requestQueue.then(task, task);
  requestQueue = result.then(
    () => undefined,
    () => undefined
  );
  return result;
}

function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  return enqueueRequest(() => performRequest<T>(path, init, false));
}

async function performRequest<T>(path: string, init: RequestInit | undefined, didRetry: boolean): Promise<T> {
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
      return performRequest<T>(path, init, true);
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

function requestState(path: string, init?: RequestInit) {
  return requestJson<CommuteState>(path, init);
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
