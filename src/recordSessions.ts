import { modeLabels } from "./brand";
import { formatDate, formatDuration, formatTime, isSameDay, minutesBetween } from "./date";
import type { CommuteRecord, WorkMode } from "./types";

export type RecentSession = {
  id: string;
  checkIn?: CommuteRecord;
  checkOut?: CommuteRecord;
  primaryRecord: CommuteRecord;
  mode: WorkMode;
  note: string;
  anchorAt: string;
  latestAt: string;
  durationMinutes?: number;
  isOpen: boolean;
  isMissingCheckOut: boolean;
  spansDays: boolean;
};

export type WorkdayLensDay = {
  key: string;
  date: Date;
  weekday: string;
  dayNumber: string;
  isToday: boolean;
  isWeekend: boolean;
  holidayLabel?: string;
  totalMinutes: number;
  sessionCount: number;
  isOpen: boolean;
  topMode?: WorkMode;
  progress: number;
};

const shortWeekdayFormatter = new Intl.DateTimeFormat("ko-KR", { weekday: "short" });
const dayNumberFormatter = new Intl.DateTimeFormat("ko-KR", { day: "numeric" });

const koreanHolidayLabels: Record<string, string> = {
  "2026-01-01": "신정",
  "2026-02-16": "설 연휴",
  "2026-02-17": "설날",
  "2026-02-18": "설 연휴",
  "2026-03-01": "삼일절",
  "2026-03-02": "대체휴일",
  "2026-05-01": "근로자의 날",
  "2026-05-05": "어린이날",
  "2026-05-24": "부처님오신날",
  "2026-05-25": "대체휴일",
  "2026-06-03": "지방선거",
  "2026-06-06": "현충일",
  "2026-08-15": "광복절",
  "2026-08-17": "대체휴일",
  "2026-09-24": "추석 연휴",
  "2026-09-25": "추석",
  "2026-09-26": "추석 연휴",
  "2026-10-03": "개천절",
  "2026-10-05": "대체휴일",
  "2026-10-09": "한글날",
  "2026-12-25": "성탄절"
};

function padNumber(value: number) {
  return String(value).padStart(2, "0");
}

function localDateKey(value: Date | string) {
  const date = new Date(value);
  return `${date.getFullYear()}-${padNumber(date.getMonth() + 1)}-${padNumber(date.getDate())}`;
}

export function sessionIdForRecord(record: CommuteRecord) {
  const separatorIndex = record.id.lastIndexOf(":");
  return separatorIndex === -1 ? record.id : record.id.slice(0, separatorIndex);
}

function startOfMondayWeek(value: Date) {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  const mondayOffset = (date.getDay() + 6) % 7;
  date.setDate(date.getDate() - mondayOffset);
  return date;
}

export function buildWorkdayLens(records: CommuteRecord[], now: Date, goalMinutes: number): WorkdayLensDay[] {
  const weekStart = startOfMondayWeek(now);
  const days: WorkdayLensDay[] = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(weekStart);
    date.setDate(weekStart.getDate() + index);
    const key = localDateKey(date);
    return {
      key,
      date,
      weekday: shortWeekdayFormatter.format(date),
      dayNumber: dayNumberFormatter.format(date),
      isToday: isSameDay(date, now),
      isWeekend: date.getDay() === 0 || date.getDay() === 6,
      holidayLabel: koreanHolidayLabels[key],
      totalMinutes: 0,
      sessionCount: 0,
      isOpen: false,
      progress: 0
    };
  });

  const byKey = new Map(days.map((day) => [day.key, day]));
  const modeTotals = new Map<string, Map<WorkMode, number>>();

  buildRecentSessions(records, now).forEach((session) => {
    const key = localDateKey(session.anchorAt);
    const day = byKey.get(key);
    if (!day) return;

    const duration = session.durationMinutes ?? 0;
    day.totalMinutes += duration;
    day.sessionCount += 1;
    day.isOpen = day.isOpen || session.isOpen;

    const totals = modeTotals.get(key) ?? new Map<WorkMode, number>();
    totals.set(session.mode, (totals.get(session.mode) ?? 0) + Math.max(duration, 1));
    modeTotals.set(key, totals);
  });

  return days.map((day) => {
    const totals = modeTotals.get(day.key);
    const topMode = totals
      ? Array.from(totals.entries()).sort((left, right) => right[1] - left[1])[0]?.[0]
      : undefined;

    return {
      ...day,
      topMode,
      progress: goalMinutes > 0 ? Math.min(100, Math.round((day.totalMinutes / goalMinutes) * 100)) : 0
    };
  });
}

export function buildRecentSessions(records: CommuteRecord[], now: Date): RecentSession[] {
  const sessions = new Map<string, { checkIn?: CommuteRecord; checkOut?: CommuteRecord }>();

  records.forEach((record) => {
    const sessionId = sessionIdForRecord(record);
    const session = sessions.get(sessionId) ?? {};
    if (record.type === "check-in") {
      session.checkIn = record;
    } else {
      session.checkOut = record;
    }
    sessions.set(sessionId, session);
  });

  const recentSessions: RecentSession[] = [];

  sessions.forEach((session, id) => {
    const primaryRecord = session.checkIn ?? session.checkOut;
    if (!primaryRecord) return;

    const anchorAt = session.checkIn?.timestamp ?? primaryRecord.timestamp;
    const latestAt = session.checkOut?.timestamp ?? session.checkIn?.timestamp ?? primaryRecord.timestamp;
    const mode = session.checkIn?.mode ?? session.checkOut?.mode ?? primaryRecord.mode;
    const note = session.checkIn?.note ?? session.checkOut?.note ?? "";
    const isOpen = session.checkIn?.sessionStatus === "active";
    const isMissingCheckOut = Boolean(session.checkIn && !session.checkOut && !isOpen);
    const durationMinutes =
      session.checkIn && session.checkOut
        ? minutesBetween(session.checkIn.timestamp, session.checkOut.timestamp)
        : session.checkIn && isOpen
          ? minutesBetween(session.checkIn.timestamp, now.toISOString())
          : undefined;

    recentSessions.push({
      id,
      checkIn: session.checkIn,
      checkOut: session.checkOut,
      primaryRecord,
      mode,
      note,
      anchorAt,
      latestAt,
      durationMinutes,
      isOpen,
      isMissingCheckOut,
      spansDays: Boolean(
        session.checkIn &&
          ((session.checkOut && !isSameDay(session.checkIn.timestamp, session.checkOut.timestamp)) ||
            (isOpen && !isSameDay(session.checkIn.timestamp, now)))
      )
    });
  });

  return recentSessions.sort((left, right) => new Date(right.latestAt).getTime() - new Date(left.latestAt).getTime());
}

export function sessionDurationLabel(session: RecentSession) {
  if (session.isMissingCheckOut) return "퇴근 미기록";
  if (session.durationMinutes === undefined) return "시간 확인 필요";
  return session.isOpen ? `진행 ${formatDuration(session.durationMinutes)}` : formatDuration(session.durationMinutes);
}

export function sessionStatusLabel(session: RecentSession) {
  if (session.isOpen) return "진행 중";
  if (session.isMissingCheckOut) return "퇴근 미기록";
  return "완료";
}

export function sessionProgressPercent(session: RecentSession, goalMinutes: number) {
  if (session.durationMinutes === undefined || goalMinutes <= 0) return 0;
  return Math.min(100, Math.round((session.durationMinutes / goalMinutes) * 100));
}

function sessionDateMatches(session: RecentSession, dateKeyFilter: string) {
  if (!dateKeyFilter) return true;
  return [session.anchorAt, session.checkIn?.timestamp, session.checkOut?.timestamp]
    .filter(Boolean)
    .some((value) => localDateKey(value as string) === dateKeyFilter);
}

function sessionSearchText(session: RecentSession) {
  return [
    formatDate(session.anchorAt),
    session.checkIn ? formatDate(session.checkIn.timestamp) : "",
    session.checkIn ? formatTime(session.checkIn.timestamp) : "",
    session.checkOut ? formatDate(session.checkOut.timestamp) : "",
    session.checkOut ? formatTime(session.checkOut.timestamp) : "",
    sessionStatusLabel(session),
    session.spansDays ? "날짜를 넘어 이어진 세션" : "",
    modeLabels[session.mode],
    session.note
  ]
    .join(" ")
    .toLocaleLowerCase("ko-KR");
}

export function filterHistorySessions(sessions: RecentSession[], dateKeyFilter: string, query: string) {
  const normalizedQuery = query.trim().toLocaleLowerCase("ko-KR");
  return sessions.filter((session) => {
    if (!sessionDateMatches(session, dateKeyFilter)) return false;
    if (!normalizedQuery) return true;
    return sessionSearchText(session).includes(normalizedQuery);
  });
}

export function addLocalDays(date: Date, days: number) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  next.setDate(next.getDate() + days);
  return next;
}

export function localDayTime(value: Date | string) {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}
