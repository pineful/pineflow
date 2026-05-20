import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  clearSession,
  completeNewPassword,
  getStoredEmail,
  getStoredIdToken,
  signIn
} from "./auth";
import { createCheckIn, createCheckOut, fetchState, saveDailyGoal } from "./api";
import { modeLabels, namingIdeas, productName, tagline } from "./brand";
import { formatDate, formatDuration, formatTime, summarizeToday } from "./date";
import type { CommuteState, WorkMode } from "./types";

const workModes = Object.keys(modeLabels) as WorkMode[];

const initialState: CommuteState = {
  records: [],
  activeSession: null,
  dailyGoalMinutes: 8 * 60
};

function Logo() {
  return (
    <div className="logoMark" aria-label="Pineflow logo">
      <svg viewBox="0 0 64 64" role="img" aria-hidden="true">
        <path className="logoLeaf" d="M32 5c4 8 3 13 0 17-3-4-4-9 0-17Z" />
        <path className="logoLeaf logoLeafLeft" d="M19 13c8 1 12 4 13 9-6-1-10-4-13-9Z" />
        <path className="logoLeaf logoLeafRight" d="M45 13c-8 1-12 4-13 9 6-1 10-4 13-9Z" />
        <path className="logoBody" d="M18 28c0-6 5-11 14-11s14 5 14 11v13c0 10-6 18-14 18s-14-8-14-18V28Z" />
        <path className="logoCircuit" d="M24 31h16M27 39h10M31 25v28M24 47h16" />
        <circle className="logoNode" cx="24" cy="31" r="2" />
        <circle className="logoNode" cx="40" cy="47" r="2" />
        <circle className="logoNode" cx="31" cy="25" r="2" />
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
  const [email, setEmail] = useState(() => (typeof window === "undefined" ? "" : getStoredEmail()));
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newPasswordSession, setNewPasswordSession] = useState("");
  const [newPasswordUsername, setNewPasswordUsername] = useState("");
  const [isAuthenticated, setIsAuthenticated] = useState(() =>
    typeof window === "undefined" ? false : Boolean(getStoredIdToken())
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

  const today = useMemo(
    () => summarizeToday(state.records, now, state.activeSession?.checkInAt),
    [now, state.activeSession?.checkInAt, state.records]
  );

  const progress = Math.min(100, Math.round((today.totalMinutes / state.dailyGoalMinutes) * 100));
  const isActive = Boolean(state.activeSession);

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
                <span>관리자가 만든 임시 비밀번호를 나만의 비밀번호로 바꿉니다.</span>
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
                <strong>Cognito 로그인</strong>
                <span>관리자가 생성한 계정으로만 Pineflow를 사용할 수 있습니다.</span>
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
                <small>JWT로 안전하게 API를 호출합니다</small>
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
          <span className={isActive ? "statusPill active" : "statusPill"}>
            {isActive ? "기록 중" : "대기"}
          </span>
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
                ? "서버에서 기록을 불러오는 중입니다"
                : isActive
                  ? "오늘의 세션을 마칩니다"
                  : "DynamoDB에 현재 시간을 저장합니다"}
            </small>
          </button>
        </div>
      </section>

      {errorMessage && <p className="errorBanner">{errorMessage}</p>}

      <button className="textAction" type="button" onClick={signOut}>
        로그아웃
      </button>

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

      <section className="brandBand">
        <div className="sectionTitle">
          <h2>네이밍 메모</h2>
        </div>
        {namingIdeas.map((idea) => (
          <article key={idea.name}>
            <strong>{idea.name}</strong>
            <p>{idea.reason}</p>
          </article>
        ))}
      </section>
    </main>
  );
}

export { App };
