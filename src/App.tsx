import { useEffect, useMemo, useState, type CSSProperties, type FormEvent } from "react";
import {
  clearSession,
  completeNewPassword,
  getStoredAccessToken,
  getStoredEmail,
  signIn
} from "./auth";
import { createCheckIn, createCheckOut, fetchState, saveDailyGoal } from "./api";
import { modeLabels, productName, tagline } from "./brand";
import { formatDate, formatDuration, formatTime, summarizeToday } from "./date";
import type { CommuteState, WorkMode } from "./types";

const workModes = Object.keys(modeLabels) as WorkMode[];

const initialState: CommuteState = {
  records: [],
  activeSession: null,
  dailyGoalMinutes: 8 * 60
};

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

function Logo() {
  return (
    <div className="logoMark" aria-label="Pineflow logo">
      <svg viewBox="0 0 64 64" role="img" aria-hidden="true">
        <path className="logoLeaf logoLeafBack" d="M31 5c4 6 4 12 1 17-4-5-4-11-1-17Z" />
        <path className="logoLeaf logoLeafLeft" d="M20 11c7 1 11 4 13 10-6 0-10-4-13-10Z" />
        <path className="logoLeaf logoLeafRight" d="M44 11c-7 1-11 4-13 10 6 0 10-4 13-10Z" />
        <path className="logoEar" d="M16 28c-5 2-7 7-5 11 5 0 8-3 9-8Z" />
        <path className="logoEar logoEarRight" d="M48 28c5 2 7 7 5 11-5 0-8-3-9-8Z" />
        <path className="logoBody" d="M17 30c0-8 6-14 15-14s15 6 15 14v10c0 11-6 19-15 19s-15-8-15-19V30Z" />
        <path className="logoPattern" d="M22 32l20 14M42 32 22 46M25 25l16 11M39 25 23 36" />
        <circle className="logoEye" cx="26" cy="37" r="2.2" />
        <circle className="logoEye" cx="38" cy="37" r="2.2" />
        <path className="logoMouth" d="M29 43c2 2 4 2 6 0" />
        <circle className="logoCheek" cx="23" cy="42" r="2.4" />
        <circle className="logoCheek" cx="41" cy="42" r="2.4" />
        <path className="logoPaw" d="M15 43c-3 2-4 5-2 7 4 0 6-2 7-5M49 43c3 2 4 5 2 7-4 0-6-2-7-5" />
      </svg>
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
  const [errorMessage, setErrorMessage] = useState("");
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
    typeof window === "undefined" ? false : Boolean(getStoredAccessToken())
  );

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
      .catch((error: Error) => setErrorMessage(error.message))
      .finally(() => setIsLoading(false));
  }, [isAuthenticated]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30000);
    return () => window.clearInterval(timer);
  }, []);

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

  async function submitLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    setErrorMessage("");

    try {
      const result = await signIn(email.trim(), password);
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
    setIsSaving(true);
    setErrorMessage("");

    try {
      await completeNewPassword(email.trim(), newPasswordUsername, newPasswordSession, newPassword);
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
    setIsSaving(true);
    setErrorMessage("");

    try {
      const serverState = await createCheckIn(mode, note);
      setState(serverState);
      setMode(serverState.activeSession?.mode ?? mode);
      setNote(serverState.activeSession?.note ?? note);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "출근 기록에 실패했습니다.");
    } finally {
      setIsSaving(false);
    }
  }

  async function checkOut() {
    if (!state.activeSession) return;

    setIsSaving(true);
    setErrorMessage("");

    try {
      const serverState = await createCheckOut();
      setState(serverState);
      setNote("");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "퇴근 기록에 실패했습니다.");
    } finally {
      setIsSaving(false);
    }
  }

  async function updateGoal(value: number) {
    setState((previous) => ({ ...previous, dailyGoalMinutes: value }));
    setErrorMessage("");

    try {
      setState(await saveDailyGoal(value));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "목표 시간 저장에 실패했습니다.");
    }
  }

  function signOut() {
    clearSession();
    setPassword("");
    setNewPassword("");
    setNewPasswordSession("");
    setNewPasswordUsername("");
    setIsAuthenticated(false);
    setState(initialState);
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
              <h1>{productName}</h1>
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
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="이메일"
                autoComplete="username"
              />
              <input
                type="password"
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
            <h1>{productName}</h1>
          </div>
          <details className="accountMenu">
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
              <button type="button" onClick={signOut}>
                로그아웃
              </button>
            </div>
          </details>
        </header>

        <div className="clockBlock">
          <p>{formatDate(now)}</p>
          <strong>{formatTime(now)}</strong>
          <span>{tagline}</span>
        </div>

        <div className="actionPanel">
          <button
            className="primaryAction"
            type="button"
            disabled={isLoading || isSaving}
            onClick={isActive ? checkOut : checkIn}
          >
            <span>{isActive ? "퇴근 기록" : "출근 기록"}</span>
            <small>
              {isLoading
                ? "내 기록을 불러오는 중입니다"
                : isActive
                  ? "오늘의 세션을 마칩니다"
                  : "현재 시간을 내 기록에 남깁니다"}
            </small>
          </button>
        </div>
      </section>

      {errorMessage && <p className="errorBanner">{errorMessage}</p>}

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

      <section className="sectionBand">
        <div className="sectionTitle">
          <h2>오늘의 흐름</h2>
          <span>{formatDuration(today.totalMinutes)}</span>
        </div>
        <div className="summaryGrid">
          <div className="metricCard">
            <span>첫 출근</span>
            <strong>{today.firstCheckIn ? formatTime(today.firstCheckIn) : "--:--"}</strong>
          </div>
          <div className="metricCard">
            <span>마지막 퇴근</span>
            <strong>{today.lastCheckOut ? formatTime(today.lastCheckOut) : "--:--"}</strong>
          </div>
        </div>
        <div className="progressTrack" aria-label={`목표 대비 ${progress}%`}>
          <div style={{ width: `${progress}%` }} />
        </div>
        <div className="goalRow">
          <span>목표 {formatDuration(state.dailyGoalMinutes)}</span>
          <input
            aria-label="하루 목표 시간"
            type="range"
            min={120}
            max={720}
            step={30}
            value={state.dailyGoalMinutes}
            onChange={(event) => updateGoal(Number(event.target.value))}
          />
        </div>
      </section>

      <section className="sectionBand controlsBand">
        <div className="sectionTitle">
          <h2>기록 설정</h2>
        </div>
        <div className="modeControl" role="tablist" aria-label="기록 유형">
          {workModes.map((workMode) => (
            <button
              key={workMode}
              className={mode === workMode ? "selected" : ""}
              type="button"
              disabled={isActive}
              onClick={() => setMode(workMode)}
            >
              {modeLabels[workMode]}
            </button>
          ))}
        </div>
        <label className="noteField">
          <span>오늘의 의도</span>
          <input
            value={note}
            disabled={isActive}
            onChange={(event) => setNote(event.target.value)}
            placeholder="예: 오전에는 글쓰기, 오후에는 이동"
          />
        </label>
      </section>

      <section className="sectionBand">
        <div className="sectionTitle">
          <h2>최근 기록</h2>
        </div>
        <div className="timeline">
          {state.records.slice(0, 8).map((record) => (
            <article className="timelineItem" key={record.id}>
              <span className={record.type === "check-in" ? "dot in" : "dot out"} />
              <div>
                <strong>{record.type === "check-in" ? "출근" : "퇴근"}</strong>
                <p>
                  {formatDate(record.timestamp)} · {formatTime(record.timestamp)}
                </p>
              </div>
              <small>{modeLabels[record.mode]}</small>
            </article>
          ))}
          {state.records.length === 0 && (
            <p className="emptyState">아직 기록이 없습니다. 첫 출근을 남겨보세요.</p>
          )}
        </div>
      </section>
    </main>
  );
}

export { App };
