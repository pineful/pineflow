import type { ActiveSession } from "./types";

const clientActivityStorageKey = "pineflow.client-activity.v1";
const clientActivityCommandExclusionMs = 90 * 1000;

export type ClientActivitySnapshot = {
  lastAt?: string;
  previousAt?: string;
  recentAt?: string[];
  updatedAt?: string;
};

function normalizeClientActivityTime(value?: string) {
  if (!value) return undefined;

  const timestamp = new Date(value);
  if (Number.isNaN(timestamp.getTime())) return undefined;

  return timestamp.toISOString();
}

export function getStoredClientActivitySnapshot(): ClientActivitySnapshot {
  if (typeof window === "undefined") return {};

  try {
    const parsed = JSON.parse(window.localStorage.getItem(clientActivityStorageKey) ?? "{}") as ClientActivitySnapshot;
    const recentAt = Array.isArray(parsed.recentAt)
      ? parsed.recentAt.map(normalizeClientActivityTime).filter((value): value is string => Boolean(value))
      : [];
    return {
      lastAt: normalizeClientActivityTime(parsed.lastAt),
      previousAt: normalizeClientActivityTime(parsed.previousAt),
      recentAt,
      updatedAt: normalizeClientActivityTime(parsed.updatedAt)
    };
  } catch {
    return {};
  }
}

export function createClientActivitySnapshot(previous: ClientActivitySnapshot, date = new Date()) {
  const lastAt = date.toISOString();
  const recentAt = [lastAt, previous.lastAt, previous.previousAt, ...(previous.recentAt ?? [])]
    .map(normalizeClientActivityTime)
    .filter((value, index, values): value is string => Boolean(value) && values.indexOf(value) === index)
    .slice(0, 8);

  return {
    lastAt,
    previousAt: previous.lastAt && previous.lastAt !== lastAt ? previous.lastAt : previous.previousAt,
    recentAt,
    updatedAt: lastAt
  };
}

export function saveClientActivitySnapshot(snapshot: ClientActivitySnapshot) {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(clientActivityStorageKey, JSON.stringify(snapshot));
  } catch {
    // 활동 보정은 편의 기능이므로 저장소 접근 실패가 앱 사용을 막으면 안 됩니다.
  }
}

export function inferPreviousSessionCheckOutAt(
  activeSession: ActiveSession | null,
  snapshot: ClientActivitySnapshot,
  now: Date
) {
  if (!activeSession) return undefined;

  const activeStart = new Date(activeSession.checkInAt).getTime();
  const nextStart = now.getTime();
  if (Number.isNaN(activeStart) || Number.isNaN(nextStart) || nextStart <= activeStart) return undefined;

  const commandCutoff = nextStart - clientActivityCommandExclusionMs;
  const candidates = [...(snapshot.recentAt ?? []), snapshot.previousAt, snapshot.lastAt]
    .filter((value, index, values): value is string => Boolean(value) && values.indexOf(value) === index)
    .map((value) => (value ? new Date(value).getTime() : Number.NaN))
    .filter((value) => !Number.isNaN(value) && value > activeStart && value < nextStart && value <= commandCutoff);

  if (!candidates.length) return undefined;
  return new Date(Math.max(...candidates)).toISOString();
}
