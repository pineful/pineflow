import { useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent, type SyntheticEvent } from "react";
import {
  clearSession,
  completeNewPassword,
  getStoredAccessToken,
  getStoredEmail,
  getStoredRefreshToken,
  refreshSession,
  signIn
} from "./auth";
import {
  createCheckIn,
  createCheckOut,
  fetchState,
  isSessionExpiredError,
  saveDailyGoal,
  updateRecord
} from "./api";
import { modeDescriptions, modeLabels, modePlans, productName, tagline } from "./brand";
import { formatDate, formatDuration, formatTime, isSameDay, minutesBetween, summarizeToday } from "./date";
import type { CommuteRecord, CommuteState, WorkMode } from "./types";

const workModes = Object.keys(modeLabels) as WorkMode[];

const initialState: CommuteState = {
  records: [],
  activeSession: null,
  dailyGoalMinutes: 8 * 60
};

const soundStorageKey = "pineflow.sound-enabled";
const sessionRefreshIntervalMs = 30 * 60 * 1000;

type WeatherState = {
  status: "loading" | "ready" | "unavailable";
  locationLabel: string;
  temperature?: number;
  apparentTemperature?: number;
  humidity?: number;
  windSpeed?: number;
  precipitationProbability?: number;
  condition?: string;
  hourly?: HourlyWeather[];
  message?: string;
};

type HourlyWeather = {
  time: string;
  label: string;
  temperature: number;
  precipitationProbability: number;
  condition: string;
};

type FeedbackSound = "tap" | "open" | "start" | "finish" | "success";

type FlowChartPoint = {
  x: number;
  y: number;
};

type FlowChartRecordPoint = FlowChartPoint & {
  id: string;
  type: "check-in" | "check-out" | "now";
};

type ReverseGeocodeResult = {
  localityName?: string;
  locality?: string;
  city?: string;
  principalSubdivision?: string;
  localityInfo?: {
    administrative?: Array<{
      name?: string;
      description?: string;
      order?: number;
    }>;
  };
};

const seoulCoordinates = {
  latitude: 37.5665,
  longitude: 126.978,
  label: "서울 중구 기준"
};

function weatherCondition(code: number) {
  if (code === 0) return "맑음";
  if ([1, 2, 3].includes(code)) return "구름 조금";
  if ([45, 48].includes(code)) return "안개";
  if ([51, 53, 55, 56, 57].includes(code)) return "이슬비";
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return "비";
  if ([71, 73, 75, 77, 85, 86].includes(code)) return "눈";
  if ([95, 96, 99].includes(code)) return "뇌우";
  return "변화 있음";
}

function weatherTone(condition: string) {
  if (condition.includes("비") || condition.includes("이슬비") || condition.includes("뇌우")) return "rain";
  if (condition.includes("눈")) return "snow";
  if (condition.includes("구름") || condition.includes("안개")) return "cloud";
  return "sun";
}

function weatherHourLabel(value: string) {
  const date = new Date(value);
  const today = new Date();
  const tomorrow = new Date();
  tomorrow.setDate(today.getDate() + 1);

  const isSameDate = (left: Date, right: Date) =>
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate();

  const hour = `${date.getHours()}`.padStart(2, "0");
  if (isSameDate(date, today)) return `오늘 ${hour}시`;
  if (isSameDate(date, tomorrow)) return `내일 ${hour}시`;
  return `${date.getMonth() + 1}/${date.getDate()} ${hour}시`;
}

function buildHourlyWeather(hourly: {
  time?: string[];
  temperature_2m?: number[];
  precipitation_probability?: number[];
  weather_code?: number[];
}) {
  const times = hourly.time ?? [];
  const startIndex = Math.max(
    times.findIndex((time) => new Date(time).getTime() >= Date.now() - 60 * 60 * 1000),
    0
  );

  return times
    .slice(startIndex)
    .filter((_, index) => index % 3 === 0)
    .slice(0, 16)
    .map((time) => {
      const index = times.indexOf(time);
      return {
        time,
        label: weatherHourLabel(time),
        temperature: Math.round(hourly.temperature_2m?.[index] ?? 0),
        precipitationProbability: hourly.precipitation_probability?.[index] ?? 0,
        condition: weatherCondition(hourly.weather_code?.[index] ?? -1)
      };
    });
}

function uniqueFilled(values: Array<string | undefined>) {
  return [...new Set(values.map((value) => value?.trim()).filter(Boolean))] as string[];
}

function locationLabelFromGeocode(data: ReverseGeocodeResult, fallback: string) {
  const finerAdministrativeNames = data.localityInfo?.administrative
    ?.filter((item) => item.name && item.order && item.order >= 6)
    .sort((left, right) => (right.order ?? 0) - (left.order ?? 0))
    .map((item) => item.name);

  const parts = uniqueFilled([
    data.localityName,
    data.locality,
    ...(finerAdministrativeNames ?? []),
    data.city,
    data.principalSubdivision
  ]).slice(0, 3);

  return parts.length > 0 ? `${parts.join(" · ")} 기준` : fallback;
}

async function resolveLocationLabel(latitude: number, longitude: number, fallback: string) {
  try {
    const params = new URLSearchParams({
      latitude: String(latitude),
      longitude: String(longitude),
      localityLanguage: "ko"
    });
    const response = await fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?${params.toString()}`);
    if (!response.ok) return fallback;

    const data = (await response.json()) as ReverseGeocodeResult;
    return locationLabelFromGeocode(data, fallback);
  } catch {
    return fallback;
  }
}

function accountInitial(value: string) {
  const visibleName = value.split("@")[0]?.trim() || "P";
  return visibleName.slice(0, 1).toUpperCase();
}

function toDateTimeLocalValue(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

function fromDateTimeLocalValue(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  return date.toISOString();
}

function dashboardGreeting(now: Date) {
  const hour = now.getHours();
  if (hour < 11) return "오전 흐름";
  if (hour < 17) return "오후 흐름";
  return "저녁 정리";
}

function formatFlowBoundary(value: string | undefined, now: Date) {
  if (!value) return "--:--";
  return isSameDay(value, now) ? formatTime(value) : `${formatDate(value)} ${formatTime(value)}`;
}

const editorMonthFormatter = new Intl.DateTimeFormat("ko-KR", {
  year: "numeric",
  month: "long"
});

const weekdayShortLabels = ["일", "월", "화", "수", "목", "금", "토"];
const weekdayLongLabels = ["일요일", "월요일", "화요일", "수요일", "목요일", "금요일", "토요일"];

function weekdayLabel(date: Date, format: "short" | "long" = "short") {
  return format === "long" ? weekdayLongLabels[date.getDay()] : weekdayShortLabels[date.getDay()];
}

function padNumber(value: number) {
  return String(value).padStart(2, "0");
}

function formatLocalDateTimeValue(date: Date) {
  return `${date.getFullYear()}-${padNumber(date.getMonth() + 1)}-${padNumber(date.getDate())}T${padNumber(
    date.getHours()
  )}:${padNumber(date.getMinutes())}`;
}

function localDateKey(date: Date) {
  return `${date.getFullYear()}-${padNumber(date.getMonth() + 1)}-${padNumber(date.getDate())}`;
}

function dateFromKey(key: string) {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, (month ?? 1) - 1, day ?? 1);
}

function parseEditorValue(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

function dayRailOptions(center: Date) {
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(center);
    date.setDate(center.getDate() + index - 3);
    return date;
  });
}

function clampNumber(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function setEditorDatePart(value: string, dateKeyValue: string) {
  const current = parseEditorValue(value);
  const nextDate = dateFromKey(dateKeyValue);
  current.setFullYear(nextDate.getFullYear(), nextDate.getMonth(), nextDate.getDate());
  return formatLocalDateTimeValue(current);
}

function setEditorPeriod(value: string, period: "am" | "pm") {
  const current = parseEditorValue(value);
  const currentHour = current.getHours();
  if (period === "am" && currentHour >= 12) current.setHours(currentHour - 12);
  if (period === "pm" && currentHour < 12) current.setHours(currentHour + 12);
  return formatLocalDateTimeValue(current);
}

function setEditorHour(value: string, hourValue: number) {
  const current = parseEditorValue(value);
  const hour12 = clampNumber(hourValue || 12, 1, 12);
  const isPm = current.getHours() >= 12;
  current.setHours(isPm ? (hour12 === 12 ? 12 : hour12 + 12) : hour12 === 12 ? 0 : hour12);
  return formatLocalDateTimeValue(current);
}

function setEditorMinute(value: string, minuteValue: number) {
  const current = parseEditorValue(value);
  current.setMinutes(clampNumber(minuteValue || 0, 0, 59));
  return formatLocalDateTimeValue(current);
}

function shiftEditorMinutes(value: string, minutes: number) {
  const current = parseEditorValue(value);
  current.setMinutes(current.getMinutes() + minutes);
  return formatLocalDateTimeValue(current);
}

function readLoginForm(form: HTMLFormElement, fallbackEmail: string, fallbackPassword: string) {
  const formData = new FormData(form);
  return {
    email: String(formData.get("email") ?? fallbackEmail).trim(),
    password: String(formData.get("password") ?? fallbackPassword)
  };
}

function buildFlowChart(records: CommuteRecord[], now: Date, activeCheckInAt: string | undefined, goalMinutes: number) {
  const chart = {
    left: 22,
    right: 298,
    top: 18,
    bottom: 94
  };
  const width = chart.right - chart.left;
  const height = chart.bottom - chart.top;
  const dayStart = new Date(now);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(dayStart);
  dayEnd.setDate(dayStart.getDate() + 1);
  const maxMinutes = Math.max(goalMinutes, 60);

  const xFor = (value: string | Date) => {
    const date = new Date(value);
    const ratio = Math.max(0, Math.min((date.getTime() - dayStart.getTime()) / (dayEnd.getTime() - dayStart.getTime()), 1));
    return chart.left + ratio * width;
  };
  const yFor = (minutes: number) => {
    const ratio = Math.max(0, Math.min(minutes / maxMinutes, 1.12));
    return chart.bottom - ratio * height;
  };

  const sorted = records
    .filter((record) => record.type === "check-in" || record.type === "check-out")
    .sort((left, right) => new Date(left.timestamp).getTime() - new Date(right.timestamp).getTime());

  const points: FlowChartPoint[] = [
    { x: chart.left, y: yFor(0) }
  ];
  const recordPoints: FlowChartRecordPoint[] = [];
  let totalMinutes = 0;
  let openCheckIn = "";

  for (const record of sorted) {
    if (record.type === "check-in") {
      openCheckIn = record.timestamp;
      const point = { x: xFor(record.timestamp), y: yFor(totalMinutes) };
      points.push(point);
      recordPoints.push({ ...point, id: record.id, type: "check-in" });
      continue;
    }

    if (openCheckIn) {
      totalMinutes += minutesBetween(openCheckIn, record.timestamp);
      const point = { x: xFor(record.timestamp), y: yFor(totalMinutes) };
      points.push(point);
      recordPoints.push({ ...point, id: record.id, type: "check-out" });
      openCheckIn = "";
    }
  }

  if (activeCheckInAt) {
    const activeStart = { x: xFor(activeCheckInAt), y: yFor(totalMinutes) };
    const activeNow = {
      x: xFor(now),
      y: yFor(totalMinutes + minutesBetween(activeCheckInAt, now.toISOString()))
    };
    points.push(activeStart, activeNow);
    recordPoints.push({ ...activeNow, id: "now", type: "now" });
  }

  const lastPoint = points[points.length - 1];
  if (lastPoint.x < xFor(now)) {
    points.push({ x: xFor(now), y: lastPoint.y });
  }

  const line = points.map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(" ");
  const area = `${chart.left},${chart.bottom} ${line} ${points[points.length - 1].x.toFixed(1)},${chart.bottom}`;

  return {
    line,
    area,
    recordPoints,
    nowX: xFor(now),
    goalY: yFor(goalMinutes)
  };
}

function getStoredSoundEnabled() {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(soundStorageKey) === "on";
}

let pineAudioContext: AudioContext | undefined;

function playPineSound(kind: FeedbackSound) {
  if (typeof window === "undefined") return;

  const AudioContextConstructor =
    window.AudioContext ??
    (window as Window & typeof globalThis & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextConstructor) return;

  pineAudioContext ??= new AudioContextConstructor();
  const context = pineAudioContext;
  const now = context.currentTime;
  if (context.state === "suspended") {
    void context.resume();
  }

  const master = context.createGain();
  master.gain.setValueAtTime(0.0001, now);
  master.gain.exponentialRampToValueAtTime(kind === "success" ? 0.085 : 0.055, now + 0.012);
  master.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);
  master.connect(context.destination);

  const notes =
    kind === "start"
      ? [
          { frequency: 540, offset: 0 },
          { frequency: 720, offset: 0.055 }
        ]
      : kind === "finish"
        ? [
            { frequency: 760, offset: 0 },
            { frequency: 620, offset: 0.06 }
          ]
        : kind === "success"
      ? [
          { frequency: 660, offset: 0 },
          { frequency: 880, offset: 0.045 },
          { frequency: 1175, offset: 0.09 }
        ]
      : kind === "open"
        ? [
            { frequency: 520, offset: 0 },
            { frequency: 760, offset: 0.055 }
          ]
        : [
            { frequency: 720, offset: 0 },
            { frequency: 940, offset: 0.04 }
          ];

  for (const note of notes) {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const start = now + note.offset;
    oscillator.type = kind === "success" || kind === "start" ? "triangle" : "sine";
    oscillator.frequency.setValueAtTime(note.frequency, start);
    oscillator.frequency.exponentialRampToValueAtTime(note.frequency * 1.035, start + 0.08);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.45, start + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.11);
    oscillator.connect(gain);
    gain.connect(master);
    oscillator.start(start);
    oscillator.stop(start + 0.13);
  }
}

function WeatherChart({ hourly }: { hourly: HourlyWeather[] }) {
  if (hourly.length < 2) return null;

  const width = 320;
  const height = 138;
  const paddingX = 14;
  const top = 18;
  const chartHeight = 64;
  const precipitationBase = 122;
  const temperatures = hourly.map((slot) => slot.temperature);
  const minTemperature = Math.min(...temperatures);
  const maxTemperature = Math.max(...temperatures);
  const spread = Math.max(maxTemperature - minTemperature, 1);

  const points = hourly.map((slot, index) => {
    const x = paddingX + (index / (hourly.length - 1)) * (width - paddingX * 2);
    const y = top + ((maxTemperature - slot.temperature) / spread) * chartHeight;
    return { x, y, slot };
  });
  const line = points.map((point) => `${point.x},${point.y}`).join(" ");
  const first = points[0];
  const middle = points[Math.floor(points.length / 2)];
  const last = points[points.length - 1];
  const labelPoints = [first, middle, last];
  const barWidth = Math.max(4, (width - paddingX * 2) / hourly.length - 5);

  return (
    <div className="weatherChart" aria-label="2일 온도와 강수 흐름 차트">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-hidden="true">
        <defs>
          <linearGradient id="temperatureLine" x1="0" x2="1" y1="0" y2="0">
            <stop offset="0%" stopColor="#44b883" />
            <stop offset="100%" stopColor="#f6c247" />
          </linearGradient>
        </defs>
        <path className="chartGrid" d="M14 18H306M14 50H306M14 82H306" />
        {points.map(({ x, slot }) => {
          const barHeight = Math.max(3, (slot.precipitationProbability / 100) * 28);
          return (
            <rect
              className="rainBar"
              key={slot.time}
              x={x - barWidth / 2}
              y={precipitationBase - barHeight}
              width={barWidth}
              height={barHeight}
              rx="2"
            />
          );
        })}
        <polyline className="temperatureLine" points={line} />
        {points.map(({ x, y, slot }) => (
          <circle className={`chartPoint ${weatherTone(slot.condition)}`} key={slot.time} cx={x} cy={y} r="4.2" />
        ))}
        {labelPoints.map(({ x, slot }) => (
          <text className="chartLabel" key={slot.time} x={x} y="136" textAnchor="middle">
            {slot.label.startsWith("오늘 ") ? slot.label.replace("오늘 ", "") : slot.label}
          </text>
        ))}
      </svg>
      <div className="chartLegend">
        <span>온도</span>
        <span>강수 가능성</span>
        <strong>
          {minTemperature}° - {maxTemperature}°
        </strong>
      </div>
    </div>
  );
}

function TimeFlowGraph({
  minutes,
  goalMinutes,
  progress,
  isActive,
  currentSessionMinutes,
  records,
  now,
  activeCheckInAt,
  firstCheckIn,
  lastCheckOut,
  carriedOver,
  modeLabel,
  greeting,
  className = ""
}: {
  minutes: number;
  goalMinutes: number;
  progress: number;
  isActive: boolean;
  currentSessionMinutes: number;
  records: CommuteRecord[];
  now: Date;
  activeCheckInAt?: string;
  firstCheckIn?: string;
  lastCheckOut?: string;
  carriedOver: boolean;
  modeLabel: string;
  greeting: string;
  className?: string;
}) {
  const safeProgress = Math.max(0, Math.min(progress, 100));
  const remainingMinutes = Math.max(goalMinutes - minutes, 0);
  const overtimeMinutes = Math.max(minutes - goalMinutes, 0);
  const chart = buildFlowChart(records, now, isActive ? activeCheckInAt : undefined, goalMinutes);
  const displayLastMarker = isActive ? "진행 중" : formatFlowBoundary(lastCheckOut, now);
  const statusLabel = carriedOver ? (isActive ? "전날부터 진행" : "이어진 기록 완료") : isActive ? `${modeLabel} 진행 중` : "기록 대기";
  const displayFlowMessage = carriedOver
    ? isActive
      ? `전날부터 이어진 ${modeLabel} 흐름이에요.`
      : "전날 시작한 흐름이 오늘 마무리됐어요."
    : isActive
      ? `${modeLabel} 흐름이 ${formatDuration(currentSessionMinutes)}째 이어지고 있어요.`
      : firstCheckIn
        ? "오늘 기록은 잠시 쉬는 중입니다."
        : "첫 기록을 시작하면 오늘의 흐름이 채워집니다.";
  const displayGoalMessage =
    remainingMinutes > 0
      ? `${formatDuration(remainingMinutes)}만 더 쌓으면 목표에 닿습니다.`
      : overtimeMinutes > 0
        ? `목표보다 ${formatDuration(overtimeMinutes)} 더 쌓았습니다.`
        : "오늘 목표에 닿았습니다.";

  return (
    <div
      className={`timeFlowGraph ${className} ${isActive ? "active" : ""} ${carriedOver ? "carriedOver" : ""}`}
      aria-label={`오늘 누적 ${formatDuration(minutes)}, 목표 대비 ${safeProgress}%`}
    >
      <div className="timeFlowKicker">
        <span className={isActive ? "live" : ""}>{isActive ? `${modeLabel} 진행 중` : "기록 대기"}</span>
        {carriedOver && <span className="flowCarryStatus">{statusLabel}</span>}
        <small>{carriedOver ? "자정 이후 구간만 오늘 누적" : greeting}</small>
      </div>
      <div className="timeFlowHeader">
        <div>
          <span>오늘 누적</span>
          <strong>{formatDuration(minutes)}</strong>
        </div>
        <div>
          <span>{remainingMinutes > 0 ? "목표까지" : "목표 달성"}</span>
          <strong>{remainingMinutes > 0 ? formatDuration(remainingMinutes) : "완료"}</strong>
        </div>
      </div>
      <p className="flowMessage">
        <span>{displayFlowMessage}</span>
        <strong>{displayGoalMessage}</strong>
      </p>
      <div className="timeFlowCanvas" aria-hidden="true">
        <svg viewBox="0 0 320 122" role="img">
          <path className="timeFlowGrid" d="M22 18V94M114 18V94M206 18V94M298 18V94M22 94H298M22 56H298" />
          <line className="timeGoalLine" x1="22" x2="298" y1={chart.goalY} y2={chart.goalY} />
          <line className="timeNowLine" x1={chart.nowX} x2={chart.nowX} y1="16" y2="98" />
          <polygon className="timeFlowArea" points={chart.area} />
          <polyline className="timeFlowLine" points={chart.line} />
          {chart.recordPoints.map((point) => (
            <circle
              className={`timeFlowMarker ${point.type}`}
              key={point.id}
              cx={point.x}
              cy={point.y}
              r={point.type === "now" ? 6.8 : 4.8}
            />
          ))}
          <text className="timeAxisLabel" x="22" y="116" textAnchor="middle">
            00
          </text>
          <text className="timeAxisLabel" x="114" y="116" textAnchor="middle">
            08
          </text>
          <text className="timeAxisLabel" x="206" y="116" textAnchor="middle">
            16
          </text>
          <text className="timeAxisLabel" x="298" y="116" textAnchor="middle">
            24
          </text>
        </svg>
      </div>
      <div className="timeFlowFooter">
        <span>0%</span>
        <strong>{safeProgress}%</strong>
        <span>목표</span>
      </div>
      <div className="flowInsights" aria-label="오늘 시간 요약">
        <div>
          <span>이번 흐름</span>
          <strong>{isActive ? formatDuration(currentSessionMinutes) : "대기 중"}</strong>
        </div>
        <div>
          <span>첫 출근</span>
          <strong>{formatFlowBoundary(firstCheckIn, now)}</strong>
        </div>
        <div>
          <span>마지막 퇴근</span>
          <strong>{displayLastMarker}</strong>
        </div>
      </div>
    </div>
  );
}

function Logo() {
  return (
    <div className="logoMark" aria-label="Pineflow logo">
      <svg viewBox="0 0 128 128" role="img" aria-hidden="true">
        <defs>
          <linearGradient id="pineflowLogoRibbon" x1="14" y1="96" x2="118" y2="14" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#36bb86" />
            <stop offset="0.52" stopColor="#1f7a5c" />
            <stop offset="1" stopColor="#14573e" />
          </linearGradient>
        </defs>
        <path className="logoRibbon" d="M22 88 C24 54 42 28 66 25 C88 22 104 37 104 58" stroke="url(#pineflowLogoRibbon)" />
        <path className="logoLeafInk" d="M46 36 L29 20 L49 26 Z" />
        <path className="logoLeafInk" d="M58 31 L50 8 L66 25 Z" />
        <path className="logoLeafInk" d="M70 30 L78 8 L82 29 Z" />
        <path className="logoLeafInk" d="M81 36 L101 20 L88 35 Z" />
        <path className="logoLeafMint" d="M60 31 L60 12 L69 28 Z" />
        <path className="logoLeafGold" d="M73 31 L91 17 L81 34 Z" />
        <path className="logoFacet" d="M64 39 L72 48 L64 57 L56 48 Z" />
        <path className="logoFacet" d="M51 54 L59 63 L51 72 L43 63 Z" />
        <path className="logoFacet" d="M77 54 L85 63 L77 72 L69 63 Z" />
        <path className="logoFacet" d="M39 70 L47 79 L39 88 L31 79 Z" />
        <path className="logoFacet" d="M64 70 L72 79 L64 88 L56 79 Z" />
        <path className="logoFacet logoFacetDeep" d="M89 70 L97 79 L89 88 L81 79 Z" />
        <path className="logoFacet" d="M51 86 L59 95 L51 104 L43 95 Z" />
        <path className="logoFacet logoFacetLive" d="M77 86 L85 95 L77 104 L69 95 Z" />
        <path className="logoFacet" d="M64 101 L72 110 L64 119 L56 110 Z" />
      </svg>
    </div>
  );
}

function BrandWordmark() {
  return (
    <h1 className="brandWordmark" aria-label={productName}>
      <span className="brandWordmarkPine">pine</span>
      <span className="brandWordmarkFlow">flow</span>
    </h1>
  );
}

type RecordTimeEditorProps = {
  value: string;
  recordType: CommuteRecord["type"];
  mode: WorkMode;
  note: string;
  disabled: boolean;
  onChange: (value: string) => void;
  onModeChange: (value: WorkMode) => void;
  onNoteChange: (value: string) => void;
};

function RecordTimeEditor({
  value,
  recordType,
  mode,
  note,
  disabled,
  onChange,
  onModeChange,
  onNoteChange
}: RecordTimeEditorProps) {
  const date = parseEditorValue(value);
  const selectedKey = localDateKey(date);
  const hour24 = date.getHours();
  const hour12 = hour24 % 12 || 12;
  const minute = date.getMinutes();
  const period = hour24 >= 12 ? "pm" : "am";
  const days = dayRailOptions(date);

  return (
    <div className="timeEditor" aria-label={`${recordType === "check-in" ? "출근" : "퇴근"} 시간 수정`}>
      <div className="timeEditorHeader">
        <span>기록 수정</span>
        <strong>
          {editorMonthFormatter.format(date)} · {weekdayLabel(date, "long")}
        </strong>
      </div>
      <span className="editorGroupLabel">시간의 성격</span>
      <div className="recordEditModes" aria-label="기록 종류 수정">
        {workModes.map((workMode) => (
          <button
            key={workMode}
            className={mode === workMode ? "selected" : ""}
            type="button"
            disabled={disabled}
            aria-pressed={mode === workMode}
            onClick={() => onModeChange(workMode)}
          >
            {modeLabels[workMode]}
          </button>
        ))}
      </div>
      <span className="editorGroupLabel">날짜</span>
      <div className="dateRail" role="listbox" aria-label="수정할 날짜">
        {days.map((day) => {
          const key = localDateKey(day);
          const isSelected = key === selectedKey;
          return (
            <button
              key={key}
              className={isSelected ? "selected" : ""}
              type="button"
              role="option"
              disabled={disabled}
              aria-selected={isSelected}
              onClick={() => onChange(setEditorDatePart(value, key))}
            >
              <span>{weekdayLabel(day)}</span>
              <strong>{day.getDate()}</strong>
              <small>{day.getMonth() + 1}월</small>
            </button>
          );
        })}
      </div>
      <span className="editorGroupLabel timeLabel">시간</span>
      <div className="timeEditorControls">
        <div className="periodControl" aria-label="오전 오후 선택">
          <button
            className={period === "am" ? "selected" : ""}
            type="button"
            disabled={disabled}
            onClick={() => onChange(setEditorPeriod(value, "am"))}
          >
            오전
          </button>
          <button
            className={period === "pm" ? "selected" : ""}
            type="button"
            disabled={disabled}
            onClick={() => onChange(setEditorPeriod(value, "pm"))}
          >
            오후
          </button>
        </div>
        <label className="timeNumberField">
          <span>시</span>
          <input
            type="number"
            min="1"
            max="12"
            inputMode="numeric"
            value={hour12}
            disabled={disabled}
            onChange={(event) => onChange(setEditorHour(value, Number(event.target.value)))}
          />
        </label>
        <label className="timeNumberField">
          <span>분</span>
          <input
            type="number"
            min="0"
            max="59"
            inputMode="numeric"
            value={padNumber(minute)}
            disabled={disabled}
            onChange={(event) => onChange(setEditorMinute(value, Number(event.target.value)))}
          />
        </label>
      </div>
      <div className="timeNudges" aria-label="시간 빠른 보정">
        {[-15, -5].map((minutes) => (
          <button
            key={minutes}
            type="button"
            disabled={disabled}
            onClick={() => onChange(shiftEditorMinutes(value, minutes))}
          >
            {minutes}분
          </button>
        ))}
        <button type="button" disabled={disabled} onClick={() => onChange(formatLocalDateTimeValue(new Date()))}>
          현재
        </button>
        {[5, 15].map((minutes) => (
          <button
            key={minutes}
            type="button"
            disabled={disabled}
            onClick={() => onChange(shiftEditorMinutes(value, minutes))}
          >
            +{minutes}분
          </button>
        ))}
      </div>
      <label className="recordEditNote">
        <span>메모</span>
        <input
          value={note}
          disabled={disabled}
          maxLength={300}
          onChange={(event) => onNoteChange(event.target.value)}
          placeholder="예: 강의 듣기, 화면 정리"
        />
      </label>
    </div>
  );
}

function App() {
  const [state, setState] = useState<CommuteState>(initialState);
  const [mode, setMode] = useState<WorkMode>("focus");
  const [note, setNote] = useState("");
  const [now, setNow] = useState(new Date());
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isActionCoolingDown, setIsActionCoolingDown] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [editingRecordId, setEditingRecordId] = useState("");
  const [editingTimestamp, setEditingTimestamp] = useState("");
  const [editingMode, setEditingMode] = useState<WorkMode>("focus");
  const [editingNote, setEditingNote] = useState("");
  const [isGoalEditing, setIsGoalEditing] = useState(false);
  const [draftGoalMinutes, setDraftGoalMinutes] = useState(initialState.dailyGoalMinutes);
  const [toastMessage, setToastMessage] = useState("");
  const [weather, setWeather] = useState<WeatherState>({
    status: "loading",
    locationLabel: seoulCoordinates.label
  });
  const [email, setEmail] = useState(() => (typeof window === "undefined" ? "" : getStoredEmail()));
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newPasswordSession, setNewPasswordSession] = useState("");
  const [newPasswordUsername, setNewPasswordUsername] = useState("");
  const [isAuthenticated, setIsAuthenticated] = useState(() =>
    typeof window === "undefined" ? false : Boolean(getStoredAccessToken() || getStoredRefreshToken())
  );
  const [soundEnabled, setSoundEnabled] = useState(getStoredSoundEnabled);
  const requestInFlightRef = useRef(false);
  const actionCooldownTimerRef = useRef<number | undefined>(undefined);
  const toastTimerRef = useRef<number | undefined>(undefined);

  function expireSession(message = "로그인 시간이 만료되었습니다. 다시 로그인해주세요.") {
    clearSession();
    requestInFlightRef.current = false;
    if (actionCooldownTimerRef.current) {
      window.clearTimeout(actionCooldownTimerRef.current);
    }
    setPassword("");
    setNewPassword("");
    setNewPasswordSession("");
    setNewPasswordUsername("");
    setIsSaving(false);
    setIsLoading(false);
    setIsActionCoolingDown(false);
    setIsAuthenticated(false);
    setState(initialState);
    setEditingRecordId("");
    setEditingTimestamp("");
    setEditingMode("focus");
    setEditingNote("");
    setToastMessage("");
    setErrorMessage(message);
  }

  function handleAppError(error: unknown, fallback: string) {
    if (isSessionExpiredError(error)) {
      expireSession();
      return;
    }

    setErrorMessage(error instanceof Error ? error.message : fallback);
  }

  function startActionCooldown() {
    setIsActionCoolingDown(true);
    if (actionCooldownTimerRef.current) {
      window.clearTimeout(actionCooldownTimerRef.current);
    }
    actionCooldownTimerRef.current = window.setTimeout(() => {
      setIsActionCoolingDown(false);
      actionCooldownTimerRef.current = undefined;
    }, 1300);
  }

  function playFeedback(kind: FeedbackSound) {
    if (soundEnabled) {
      playPineSound(kind);
    }
  }

  function handleAccountToggle(event: SyntheticEvent<HTMLDetailsElement>) {
    if (event.currentTarget.open) {
      playFeedback("open");
    }
  }

  function toggleSound() {
    const next = !soundEnabled;
    setSoundEnabled(next);
    window.localStorage.setItem(soundStorageKey, next ? "on" : "off");
    if (next) {
      playPineSound("success");
      flashToast("효과음이 켜졌어요");
    }
  }

  function flashToast(message: string) {
    setToastMessage(message);
    if (toastTimerRef.current) {
      window.clearTimeout(toastTimerRef.current);
    }
    toastTimerRef.current = window.setTimeout(() => {
      setToastMessage("");
      toastTimerRef.current = undefined;
    }, 1600);
  }

  useEffect(() => {
    if (!isAuthenticated) {
      setIsLoading(false);
      return;
    }

    fetchState()
      .then((serverState) => {
        setState(serverState);
        setMode(serverState.activeSession?.mode ?? "focus");
        setNote(serverState.activeSession?.note ?? "");
      })
      .catch((error: unknown) => handleAppError(error, "기록을 불러오지 못했습니다."))
      .finally(() => setIsLoading(false));
  }, [isAuthenticated]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    return () => {
      if (actionCooldownTimerRef.current) {
        window.clearTimeout(actionCooldownTimerRef.current);
      }
      if (toastTimerRef.current) {
        window.clearTimeout(toastTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!isAuthenticated) return;

    const refreshOpenSession = async () => {
      try {
        const token = await refreshSession();
        if (!token && !getStoredAccessToken()) {
          expireSession();
        }
      } catch {
        expireSession();
      }
    };

    const refreshOnFocus = () => {
      void refreshOpenSession();
    };
    const refreshOnVisible = () => {
      if (document.visibilityState === "visible") {
        void refreshOpenSession();
      }
    };

    void refreshOpenSession();
    const interval = window.setInterval(refreshOpenSession, sessionRefreshIntervalMs);
    window.addEventListener("focus", refreshOnFocus);
    document.addEventListener("visibilitychange", refreshOnVisible);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", refreshOnFocus);
      document.removeEventListener("visibilitychange", refreshOnVisible);
    };
  }, [isAuthenticated]);

  useEffect(() => {
    let isMounted = true;

    async function loadWeather(
      latitude: number,
      longitude: number,
      locationLabel: string,
      shouldResolveLocation = true
    ) {
      try {
        const params = new URLSearchParams({
          latitude: String(latitude),
          longitude: String(longitude),
          current: "temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m",
          daily: "precipitation_probability_max",
          hourly: "temperature_2m,apparent_temperature,precipitation_probability,weather_code",
          forecast_days: "2",
          timezone: "auto"
        });
        const [response, resolvedLocationLabel] = await Promise.all([
          fetch(`https://api.open-meteo.com/v1/forecast?${params.toString()}`),
          shouldResolveLocation ? resolveLocationLabel(latitude, longitude, locationLabel) : locationLabel
        ]);
        if (!response.ok) {
          throw new Error("날씨 정보를 불러오지 못했습니다.");
        }

        const data = await response.json();
        if (!isMounted) return;

        setWeather({
          status: "ready",
          locationLabel: resolvedLocationLabel,
          temperature: Math.round(data.current.temperature_2m),
          apparentTemperature: Math.round(data.current.apparent_temperature),
          humidity: data.current.relative_humidity_2m,
          windSpeed: Math.round(data.current.wind_speed_10m),
          precipitationProbability: data.daily.precipitation_probability_max?.[0],
          condition: weatherCondition(data.current.weather_code),
          hourly: buildHourlyWeather(data.hourly ?? {})
        });
      } catch {
        if (!isMounted) return;
        setWeather({
          status: "unavailable",
          locationLabel,
          message: "지금은 날씨를 불러올 수 없습니다."
        });
      }
    }

    function loadDefaultWeather() {
      void loadWeather(seoulCoordinates.latitude, seoulCoordinates.longitude, seoulCoordinates.label, false);
    }

    if (!("geolocation" in navigator)) {
      loadDefaultWeather();
      return () => {
        isMounted = false;
      };
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        void loadWeather(position.coords.latitude, position.coords.longitude, "현재 위치 기준");
      },
      loadDefaultWeather,
      { enableHighAccuracy: false, maximumAge: 0, timeout: 5000 }
    );

    return () => {
      isMounted = false;
    };
  }, []);

  const today = useMemo(
    () => summarizeToday(state.records, now, state.activeSession?.checkInAt),
    [now, state.activeSession?.checkInAt, state.records]
  );

  const progress = Math.min(100, Math.round((today.totalMinutes / state.dailyGoalMinutes) * 100));
  const isActive = Boolean(state.activeSession);
  const accountEmail = email || getStoredEmail() || "Pineflow 계정";
  const selectedModePlan = modePlans[mode];
  const activeIntent = state.activeSession?.note || note;
  const activeCheckInAt = state.activeSession ? new Date(state.activeSession.checkInAt) : null;
  const activeCheckInTime = activeCheckInAt?.getTime();
  const currentSessionMinutes =
    activeCheckInTime !== undefined && Number.isFinite(activeCheckInTime)
      ? Math.max(0, Math.round((now.getTime() - activeCheckInTime) / 60000))
    : 0;
  const isRecordActionDisabled = isLoading || isSaving || isActionCoolingDown;

  async function submitLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    let credentials = readLoginForm(form, email, password);

    if (!credentials.email || !credentials.password) {
      await new Promise((resolve) => window.setTimeout(resolve, 400));
      credentials = readLoginForm(form, email, password);
    }

    setEmail(credentials.email);
    setPassword(credentials.password);

    if (!credentials.email || !credentials.password) {
      setErrorMessage("이메일과 비밀번호가 아직 입력되지 않았습니다. 암호 관리자가 뜬 뒤 다시 시도해주세요.");
      return;
    }

    setIsSaving(true);
    setErrorMessage("");

    try {
      const result = await signIn(credentials.email, credentials.password);
      if (result.type === "new-password-required") {
        setNewPasswordSession(result.session);
        setNewPasswordUsername(result.username);
        return;
      }

      setPassword("");
      setIsLoading(true);
      setIsAuthenticated(true);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "로그인에 실패했습니다.");
    } finally {
      setIsSaving(false);
    }
  }

  async function submitNewPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const submittedNewPassword = String(formData.get("newPassword") ?? newPassword);
    setNewPassword(submittedNewPassword);

    if (!submittedNewPassword) {
      setErrorMessage("새 비밀번호를 입력해주세요.");
      return;
    }

    setIsSaving(true);
    setErrorMessage("");

    try {
      await completeNewPassword(email.trim(), newPasswordUsername, newPasswordSession, submittedNewPassword);
      setPassword("");
      setNewPassword("");
      setNewPasswordSession("");
      setNewPasswordUsername("");
      setIsLoading(true);
      setIsAuthenticated(true);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "새 비밀번호 설정에 실패했습니다.");
    } finally {
      setIsSaving(false);
    }
  }

  async function checkIn() {
    if (requestInFlightRef.current || isActionCoolingDown) return;

    requestInFlightRef.current = true;
    setIsSaving(true);
    setErrorMessage("");

    try {
      const serverState = await createCheckIn(mode, note);
      setState(serverState);
      setMode(serverState.activeSession?.mode ?? mode);
      setNote(serverState.activeSession?.note ?? note);
      playFeedback("start");
      flashToast("출근 기록이 저장됐어요");
      startActionCooldown();
    } catch (error) {
      handleAppError(error, "출근 기록에 실패했습니다.");
    } finally {
      requestInFlightRef.current = false;
      setIsSaving(false);
    }
  }

  async function checkOut() {
    if (!state.activeSession) return;
    if (requestInFlightRef.current || isActionCoolingDown) return;

    requestInFlightRef.current = true;
    setIsSaving(true);
    setErrorMessage("");

    try {
      const serverState = await createCheckOut();
      setState(serverState);
      setNote("");
      setEditingRecordId("");
      setEditingTimestamp("");
      setEditingMode("focus");
      setEditingNote("");
      playFeedback("finish");
      flashToast("퇴근 기록이 저장됐어요");
      startActionCooldown();
    } catch (error) {
      handleAppError(error, "퇴근 기록에 실패했습니다.");
    } finally {
      requestInFlightRef.current = false;
      setIsSaving(false);
    }
  }

  async function updateGoal(value: number) {
    setState((previous) => ({ ...previous, dailyGoalMinutes: value }));
    setErrorMessage("");

    try {
      setState(await saveDailyGoal(value));
      setIsGoalEditing(false);
      playFeedback("success");
      flashToast("목표 시간이 저장됐어요");
    } catch (error) {
      handleAppError(error, "목표 시간 저장에 실패했습니다.");
    }
  }

  function openGoalEditor() {
    playFeedback("open");
    setDraftGoalMinutes(state.dailyGoalMinutes);
    setIsGoalEditing(true);
  }

  function startEditRecord(record: CommuteRecord) {
    playFeedback("open");
    setEditingRecordId(record.id);
    setEditingTimestamp(toDateTimeLocalValue(record.timestamp));
    setEditingMode(record.mode);
    setEditingNote(record.note ?? "");
    setErrorMessage("");
  }

  async function saveRecordEdit(recordId: string) {
    if (requestInFlightRef.current) return;

    const timestamp = fromDateTimeLocalValue(editingTimestamp);
    if (!timestamp) {
      setErrorMessage("수정할 시간을 다시 확인해주세요.");
      return;
    }

    requestInFlightRef.current = true;
    setIsSaving(true);
    setErrorMessage("");

    try {
      setState(await updateRecord(recordId, { timestamp, mode: editingMode, note: editingNote }));
      setEditingRecordId("");
      setEditingTimestamp("");
      setEditingMode("focus");
      setEditingNote("");
      playFeedback("success");
      flashToast("기록이 수정됐어요");
      startActionCooldown();
    } catch (error) {
      handleAppError(error, "기록 수정에 실패했습니다.");
    } finally {
      requestInFlightRef.current = false;
      setIsSaving(false);
    }
  }

  function signOut() {
    clearSession();
    requestInFlightRef.current = false;
    if (actionCooldownTimerRef.current) {
      window.clearTimeout(actionCooldownTimerRef.current);
    }
    setPassword("");
    setNewPassword("");
    setNewPasswordSession("");
    setNewPasswordUsername("");
    setIsSaving(false);
    setIsLoading(false);
    setIsActionCoolingDown(false);
    setIsAuthenticated(false);
    setState(initialState);
    setEditingRecordId("");
    setEditingTimestamp("");
    setEditingMode("focus");
    setEditingNote("");
    setIsGoalEditing(false);
    setDraftGoalMinutes(initialState.dailyGoalMinutes);
    setToastMessage("");
    setErrorMessage("");
  }

  if (!isAuthenticated) {
    return (
      <main className="appShell">
        <section className="heroPanel accessPanel">
          <header className="topBar">
            <Logo />
            <div>
              <p className="eyebrow">개인 출퇴근 기록</p>
              <BrandWordmark />
            </div>
          </header>

          {newPasswordSession ? (
            <form className="accessForm" onSubmit={submitNewPassword}>
              <div>
                <p>첫 로그인</p>
                <strong>새 비밀번호 설정</strong>
                <span>처음 받은 임시 비밀번호를 나만의 비밀번호로 바꿉니다.</span>
              </div>
              <input
                type="password"
                name="newPassword"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                placeholder="새 비밀번호"
                autoComplete="new-password"
              />
              <button className="primaryAction" type="submit" disabled={isSaving}>
                <span>비밀번호 설정</span>
                <small>Pineflow 계정을 활성화합니다</small>
              </button>
            </form>
          ) : (
            <form className="accessForm" onSubmit={submitLogin}>
              <div>
                <p>Private sign in</p>
                <strong>로그인</strong>
                <span>관리자가 만든 계정으로만 Pineflow를 사용할 수 있습니다.</span>
              </div>
              <input
                type="email"
                name="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="이메일"
                autoComplete="username"
              />
              <input
                type="password"
                name="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="비밀번호"
                autoComplete="current-password"
              />
              <button className="primaryAction" type="submit" disabled={isSaving}>
                <span>로그인</span>
                <small>내 기록을 안전하게 불러옵니다</small>
              </button>
            </form>
          )}
        </section>

        {errorMessage && <p className="errorBanner">{errorMessage}</p>}
      </main>
    );
  }

  return (
    <main className="appShell">
      <section className="heroPanel">
        <header className="topBar">
          <Logo />
          <div>
            <p className="eyebrow">개인 출퇴근 기록</p>
            <BrandWordmark />
          </div>
          <details className="accountMenu" onToggle={handleAccountToggle}>
            <summary aria-label="계정 메뉴">
              <span className="accountAvatar">{accountInitial(accountEmail)}</span>
              <span className="accountChevron" aria-hidden="true">
                ▾
              </span>
            </summary>
            <div className="accountPopover">
              <div className="accountIdentity">
                <span className="accountAvatar large">{accountInitial(accountEmail)}</span>
                <div>
                  <strong>{accountEmail}</strong>
                  <span className={isActive ? "accountStatus active" : "accountStatus"}>
                    {isActive ? "기록 중" : "대기"}
                  </span>
                </div>
              </div>
              <button type="button" disabled>
                내 정보
              </button>
              <button type="button" disabled>
                암호 변경
              </button>
              <button type="button" aria-pressed={soundEnabled} onClick={toggleSound}>
                효과음 {soundEnabled ? "끄기" : "켜기"}
              </button>
              <button type="button" onClick={signOut}>
                로그아웃
              </button>
            </div>
          </details>
        </header>

        <TimeFlowGraph
          className="heroFlow"
          minutes={today.totalMinutes}
          goalMinutes={state.dailyGoalMinutes}
          progress={progress}
          isActive={isActive}
          currentSessionMinutes={currentSessionMinutes}
          records={today.records}
          now={now}
          activeCheckInAt={today.activeVisibleCheckIn}
          firstCheckIn={today.firstCheckIn}
          lastCheckOut={today.lastCheckOut}
          carriedOver={today.carriedOver}
          modeLabel={modeLabels[mode]}
          greeting={dashboardGreeting(now)}
        />

        <div className="clockBlock">
          <p>{formatDate(now)}</p>
          <strong>{formatTime(now)}</strong>
          <span>{tagline}</span>
        </div>

        <div className="recordSetup">
          <div className="recordSetupTitle">
            <strong>{isActive ? "진행 중인 기록" : "기록하고 바로 시작"}</strong>
            <span>{isActive ? "현재 세션 내용" : "버튼 누르기 전에 여기서 끝냅니다"}</span>
          </div>
          {isActive ? (
            <div className="activePlan compact">
              <div>
                <span>종류</span>
                <strong>{modeLabels[mode]}</strong>
              </div>
              <div>
                <span>메모</span>
                <strong>{activeIntent || "메모 없음"}</strong>
              </div>
              <div>
                <span>시작</span>
                <strong>{activeCheckInAt ? formatTime(activeCheckInAt) : "--:--"}</strong>
              </div>
            </div>
          ) : (
            <>
              <div className="modeControl compact" role="tablist" aria-label="기록 유형">
                {workModes.map((workMode) => (
                  <button
                    key={workMode}
                    className={mode === workMode ? "selected" : ""}
                    type="button"
                    onClick={() => {
                      playFeedback("tap");
                      setMode(workMode);
                      setNote("");
                    }}
                  >
                    <strong>{modeLabels[workMode]}</strong>
                    <span>{modeDescriptions[workMode]}</span>
                  </button>
                ))}
              </div>
              <div className="planChips compact" aria-label="자주 쓰는 메모">
                {selectedModePlan.map((plan) => (
                  <button
                    key={plan}
                    className={note === plan ? "selected" : ""}
                    type="button"
                    onClick={() => {
                      playFeedback("tap");
                      setNote(plan);
                    }}
                  >
                    {plan}
                  </button>
                ))}
              </div>
              <label className="noteField compact">
                <span>기록에 남길 메모</span>
                <input
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  placeholder="예: Pineflow 화면 정리"
                />
              </label>
            </>
          )}
        </div>

        <div className="actionPanel">
          <button
            className="primaryAction"
            type="button"
            disabled={isRecordActionDisabled}
            onClick={isActive ? checkOut : checkIn}
          >
            <span>{isActive ? "퇴근 기록" : "출근 기록"}</span>
            <small>
              {isLoading
                ? "내 기록을 불러오는 중입니다"
                : isActive
                  ? "오늘의 세션을 마칩니다"
                  : note
                    ? `${note} 기록으로 시작합니다`
                    : `${modeLabels[mode]} 기록으로 시작합니다`}
            </small>
          </button>
        </div>
      </section>

      {errorMessage && <p className="errorBanner">{errorMessage}</p>}
      {toastMessage && (
        <div className="toastMessage" role="status">
          {toastMessage}
        </div>
      )}

      <section className="sectionBand recentBand">
        <div className="sectionTitle">
          <h2>최근 기록</h2>
          <span>실수하면 시간 수정</span>
        </div>
        <div className="timeline">
          {state.records.slice(0, 8).map((record) => (
            <article className={editingRecordId === record.id ? "timelineItem editing" : "timelineItem"} key={record.id}>
              <span className={record.type === "check-in" ? "dot in" : "dot out"} />
              <div className="timelineBody">
                <div className="timelineRecordHeader">
                  <div>
                    <strong>{record.type === "check-in" ? "출근" : "퇴근"}</strong>
                    <p>
                      {formatDate(record.timestamp)} · {formatTime(record.timestamp)}
                    </p>
                  </div>
                  <div className={editingRecordId === record.id ? "timelineActions editActions" : "timelineActions"}>
                    {editingRecordId === record.id ? (
                      <>
                        <button className="save" type="button" disabled={isSaving} onClick={() => saveRecordEdit(record.id)}>
                          저장
                        </button>
                        <button
                          type="button"
                          disabled={isSaving}
                          onClick={() => {
                            setEditingRecordId("");
                            setEditingTimestamp("");
                            setEditingMode("focus");
                            setEditingNote("");
                          }}
                        >
                          취소
                        </button>
                      </>
                    ) : (
                      <>
                        <small>{modeLabels[record.mode]}</small>
                        <button type="button" disabled={isSaving} onClick={() => startEditRecord(record)}>
                          수정
                        </button>
                      </>
                    )}
                  </div>
                </div>
                {editingRecordId === record.id && (
                  <RecordTimeEditor
                    value={editingTimestamp}
                    recordType={record.type}
                    mode={editingMode}
                    note={editingNote}
                    disabled={isSaving}
                    onChange={setEditingTimestamp}
                    onModeChange={setEditingMode}
                    onNoteChange={setEditingNote}
                  />
                )}
              </div>
            </article>
          ))}
          {state.records.length === 0 && (
            <p className="emptyState">아직 기록이 없습니다. 오늘 첫 기록을 남겨보세요.</p>
          )}
        </div>
      </section>

      <section className="sectionBand weatherBand">
        <div className="sectionTitle">
          <h2>오늘 날씨</h2>
          <span>{weather.locationLabel}</span>
        </div>
        {weather.status === "ready" ? (
          <div className="weatherGrid">
            <div className="weatherMain">
              <strong>{weather.temperature}°</strong>
              <span>{weather.condition}</span>
            </div>
            <div className="weatherDetails">
              <span>체감 {weather.apparentTemperature}°</span>
              <span>습도 {weather.humidity}%</span>
              <span>최대 강수 {weather.precipitationProbability ?? 0}%</span>
              <span>바람 {weather.windSpeed}km/h</span>
            </div>
            {weather.hourly && weather.hourly.length > 0 && (
              <>
                <WeatherChart hourly={weather.hourly} />
                <div className="weatherTimeline" aria-label="2일 시간대별 날씨">
                  {weather.hourly.map((slot) => (
                    <article className="weatherSlot" key={slot.time}>
                      <span>{slot.label}</span>
                      <div className={`weatherGlyph ${weatherTone(slot.condition)}`} aria-hidden="true" />
                      <strong>{slot.temperature}°</strong>
                      <small>{slot.condition}</small>
                      <em style={{ "--rain": `${slot.precipitationProbability}%` } as CSSProperties}>
                        강수 {slot.precipitationProbability}%
                      </em>
                    </article>
                  ))}
                </div>
              </>
            )}
          </div>
        ) : (
          <p className="weatherFallback">
            {weather.status === "loading" ? "날씨를 불러오는 중입니다." : weather.message}
          </p>
        )}
      </section>

      <section className="sectionBand summaryBand">
        <div className="sectionTitle">
          <h2>오늘의 흐름</h2>
          <span>{formatDuration(today.totalMinutes)}</span>
        </div>
        <div className="summaryGrid">
          <div className="metricCard">
            <span>첫 출근</span>
            <strong>{formatFlowBoundary(today.firstCheckIn, now)}</strong>
          </div>
          <div className="metricCard">
            <span>마지막 퇴근</span>
            <strong>{formatFlowBoundary(today.lastCheckOut, now)}</strong>
          </div>
        </div>
        <div className="goalReadout">
          <div>
            <span>하루 목표</span>
            <strong>{formatDuration(state.dailyGoalMinutes)}</strong>
            <small>목표 대비 {progress}%</small>
          </div>
          <button type="button" disabled={isSaving} onClick={openGoalEditor}>
            목표 수정
          </button>
        </div>
        {isGoalEditing && (
          <div className="goalEditor">
            <div className="goalEditorHeader">
              <span>새 목표</span>
              <strong>{formatDuration(draftGoalMinutes)}</strong>
            </div>
            <input
              aria-label="하루 목표 시간"
              type="range"
              min={120}
              max={720}
              step={30}
              value={draftGoalMinutes}
              onChange={(event) => setDraftGoalMinutes(Number(event.target.value))}
            />
            <div className="goalEditorActions">
              <button type="button" disabled={isSaving} onClick={() => updateGoal(draftGoalMinutes)}>
                저장
              </button>
              <button
                type="button"
                disabled={isSaving}
                onClick={() => {
                  setIsGoalEditing(false);
                  setDraftGoalMinutes(state.dailyGoalMinutes);
                }}
              >
                취소
              </button>
            </div>
          </div>
        )}
      </section>

    </main>
  );
}

export { App };
