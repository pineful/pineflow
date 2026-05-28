import type { CommuteRecord } from "./types";

const dateFormatter = new Intl.DateTimeFormat("ko-KR", {
  month: "long",
  day: "numeric",
  weekday: "long"
});

const timeFormatter = new Intl.DateTimeFormat("ko-KR", {
  hour: "2-digit",
  minute: "2-digit"
});

export function formatDate(value: Date | string) {
  return dateFormatter.format(new Date(value));
}

export function formatTime(value: Date | string) {
  return timeFormatter.format(new Date(value));
}

export function minutesBetween(start: string, end: string) {
  return Math.max(0, Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60000));
}

export function isSameDay(left: Date | string, right: Date | string) {
  const a = new Date(left);
  const b = new Date(right);
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function startOfLocalDay(value: Date) {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
}

function minDate(left: Date, right: Date) {
  return left.getTime() <= right.getTime() ? left : right;
}

function maxDate(left: Date, right: Date) {
  return left.getTime() >= right.getTime() ? left : right;
}

export function summarizeToday(records: CommuteRecord[], now: Date, activeCheckIn?: string) {
  const sorted = records
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  const dayStart = startOfLocalDay(now);
  const dayEnd = new Date(dayStart);
  dayEnd.setDate(dayStart.getDate() + 1);
  const chartRecords: CommuteRecord[] = [];

  let totalMinutes = 0;
  let openCheckIn: CommuteRecord | null = null;
  let firstCheckIn: string | undefined;
  let lastCheckOut: string | undefined;
  let carriedOver = false;

  function addSession(checkIn: CommuteRecord, checkOutAt: string | undefined, isActive = false) {
    const sessionStart = new Date(checkIn.timestamp);
    const rawSessionEnd = checkOutAt ? new Date(checkOutAt) : now;
    const sessionEnd = minDate(rawSessionEnd, now);

    if (Number.isNaN(sessionStart.getTime()) || Number.isNaN(sessionEnd.getTime())) return;
    if (sessionEnd <= dayStart || sessionStart >= dayEnd || sessionEnd <= sessionStart) return;

    const visibleStart = maxDate(sessionStart, dayStart);
    const visibleEnd = minDate(sessionEnd, dayEnd);
    if (visibleEnd <= visibleStart) return;

    totalMinutes += minutesBetween(visibleStart.toISOString(), visibleEnd.toISOString());
    if (!firstCheckIn || sessionStart < new Date(firstCheckIn)) {
      firstCheckIn = checkIn.timestamp;
    }
    if (checkOutAt && (!lastCheckOut || new Date(checkOutAt) > new Date(lastCheckOut))) {
      lastCheckOut = checkOutAt;
    }
    if (sessionStart < dayStart) {
      carriedOver = true;
    }

    chartRecords.push({
      ...checkIn,
      id: `${checkIn.id}:visible-in`,
      timestamp: visibleStart.toISOString()
    });

    if (!isActive) {
      chartRecords.push({
        ...checkIn,
        id: `${checkIn.id}:visible-out`,
        type: "check-out",
        timestamp: visibleEnd.toISOString()
      });
    }
  }

  sorted.forEach((record) => {
    if (record.type === "check-in") {
      openCheckIn = record;
      return;
    }

    if (openCheckIn) {
      addSession(openCheckIn, record.timestamp);
      openCheckIn = null;
    }
  });

  if (activeCheckIn) {
    addSession(
      {
        id: "active-session",
        type: "check-in",
        timestamp: activeCheckIn,
        mode: "focus",
        note: ""
      },
      undefined,
      true
    );
  }

  const activeVisibleCheckIn =
    activeCheckIn && new Date(activeCheckIn) < dayStart ? dayStart.toISOString() : activeCheckIn;

  return {
    records: chartRecords.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()),
    totalMinutes,
    firstCheckIn,
    lastCheckOut,
    carriedOver,
    activeVisibleCheckIn
  };
}

export function formatDuration(totalMinutes: number) {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes}분`;
  if (minutes === 0) return `${hours}시간`;
  return `${hours}시간 ${minutes}분`;
}
