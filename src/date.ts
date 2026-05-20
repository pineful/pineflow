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

export function summarizeToday(records: CommuteRecord[], now: Date, activeCheckIn?: string) {
  const todays = records
    .filter((record) => isSameDay(record.timestamp, now))
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

  let totalMinutes = 0;
  let openCheckIn: string | null = null;

  todays.forEach((record) => {
    if (record.type === "check-in") {
      openCheckIn = record.timestamp;
      return;
    }

    if (openCheckIn) {
      totalMinutes += minutesBetween(openCheckIn, record.timestamp);
      openCheckIn = null;
    }
  });

  if (activeCheckIn && isSameDay(activeCheckIn, now)) {
    totalMinutes += minutesBetween(activeCheckIn, now.toISOString());
  }

  return {
    records: todays,
    totalMinutes,
    firstCheckIn: todays.find((record) => record.type === "check-in")?.timestamp ?? activeCheckIn,
    lastCheckOut: [...todays].reverse().find((record) => record.type === "check-out")?.timestamp
  };
}

export function formatDuration(totalMinutes: number) {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes}분`;
  return `${hours}시간 ${minutes.toString().padStart(2, "0")}분`;
}
