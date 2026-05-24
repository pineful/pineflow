const region = import.meta.env.VITE_COGNITO_REGION ?? "";
const userPoolClientId = import.meta.env.VITE_COGNITO_USER_POOL_CLIENT_ID ?? "";
const tokenStorageKey = "pineflow.access-token";
const refreshTokenStorageKey = "pineflow.refresh-token";
const emailStorageKey = "pineflow.email";

type AuthResult = {
  AccessToken?: string;
  IdToken?: string;
  RefreshToken?: string;
};

type AuthResponse = {
  AuthenticationResult?: AuthResult;
  ChallengeName?: "NEW_PASSWORD_REQUIRED";
  Session?: string;
  ChallengeParameters?: {
    USER_ID_FOR_SRP?: string;
  };
  message?: string;
  __type?: string;
};

export type LoginResult =
  | { type: "signed-in"; accessToken: string }
  | { type: "new-password-required"; session: string; username: string };

function endpoint() {
  return `https://cognito-idp.${region}.amazonaws.com/`;
}

function ensureConfigured() {
  if (!region || !userPoolClientId) {
    throw new Error("로그인 설정이 아직 준비되지 않았습니다.");
  }
}

async function authRequest(target: string, payload: Record<string, unknown>) {
  ensureConfigured();

  const response = await fetch(endpoint(), {
    method: "POST",
    headers: {
      "Content-Type": "application/x-amz-json-1.1",
      "X-Amz-Target": `AWSCognitoIdentityProviderService.${target}`
    },
    body: JSON.stringify(payload)
  });

  const body = (await response.json().catch(() => ({}))) as AuthResponse;
  if (!response.ok) {
    throw new Error(body.message ?? "로그인 요청에 실패했습니다.");
  }

  return body;
}

export function getStoredIdToken() {
  return getStoredAccessToken();
}

export function getStoredAccessToken() {
  const token = window.sessionStorage.getItem(tokenStorageKey) ?? "";
  if (!token || isJwtExpired(token)) {
    window.sessionStorage.removeItem(tokenStorageKey);
    return "";
  }

  return token;
}

export function getStoredRefreshToken() {
  return window.sessionStorage.getItem(refreshTokenStorageKey) ?? "";
}

export function getStoredEmail() {
  return window.localStorage.getItem(emailStorageKey) ?? "";
}

export function saveSession(accessToken: string, email: string, refreshToken?: string) {
  window.sessionStorage.setItem(tokenStorageKey, accessToken);
  if (refreshToken) {
    window.sessionStorage.setItem(refreshTokenStorageKey, refreshToken);
  }
  window.localStorage.setItem(emailStorageKey, email);
}

export function clearSession() {
  window.sessionStorage.removeItem(tokenStorageKey);
  window.sessionStorage.removeItem(refreshTokenStorageKey);
  window.localStorage.removeItem(emailStorageKey);
}

function jwtExpiration(token: string) {
  try {
    const payload = JSON.parse(window.atob(token.split(".")[1] ?? "")) as { exp?: number };
    return payload.exp ? payload.exp * 1000 : 0;
  } catch {
    return 0;
  }
}

function isJwtExpired(token: string) {
  return jwtExpiration(token) <= Date.now();
}

function shouldRefreshToken(token: string, refreshWindowMs = 5 * 60 * 1000) {
  const expiresAt = jwtExpiration(token);
  return !expiresAt || expiresAt <= Date.now() + refreshWindowMs;
}

export async function refreshSession(force = false) {
  const refreshToken = getStoredRefreshToken();
  if (!refreshToken) return "";

  const currentAccessToken = window.sessionStorage.getItem(tokenStorageKey) ?? "";
  if (!force && currentAccessToken && !shouldRefreshToken(currentAccessToken)) {
    return currentAccessToken;
  }

  const body = await authRequest("InitiateAuth", {
    AuthFlow: "REFRESH_TOKEN_AUTH",
    ClientId: userPoolClientId,
    AuthParameters: {
      REFRESH_TOKEN: refreshToken
    }
  });

  const accessToken = body.AuthenticationResult?.AccessToken;
  if (!accessToken) {
    clearSession();
    return "";
  }

  saveSession(accessToken, getStoredEmail(), body.AuthenticationResult?.RefreshToken);
  return accessToken;
}

export async function getValidAccessToken() {
  const token = getStoredAccessToken();
  if (token && !shouldRefreshToken(token)) {
    return token;
  }

  return refreshSession(Boolean(token));
}

export async function signIn(email: string, password: string): Promise<LoginResult> {
  const body = await authRequest("InitiateAuth", {
    AuthFlow: "USER_PASSWORD_AUTH",
    ClientId: userPoolClientId,
    AuthParameters: {
      USERNAME: email,
      PASSWORD: password
    }
  });

  if (body.ChallengeName === "NEW_PASSWORD_REQUIRED" && body.Session) {
    return {
      type: "new-password-required",
      session: body.Session,
      username: body.ChallengeParameters?.USER_ID_FOR_SRP ?? email
    };
  }

  const accessToken = body.AuthenticationResult?.AccessToken;
  if (!accessToken) {
    throw new Error("로그인 응답을 확인하지 못했습니다.");
  }

  saveSession(accessToken, email, body.AuthenticationResult?.RefreshToken);
  return { type: "signed-in", accessToken };
}

export async function completeNewPassword(
  email: string,
  username: string,
  session: string,
  newPassword: string
) {
  const body = await authRequest("RespondToAuthChallenge", {
    ChallengeName: "NEW_PASSWORD_REQUIRED",
    ClientId: userPoolClientId,
    Session: session,
    ChallengeResponses: {
      USERNAME: username,
      NEW_PASSWORD: newPassword
    }
  });

  const accessToken = body.AuthenticationResult?.AccessToken;
  if (!accessToken) {
    throw new Error("새 비밀번호 설정 후 로그인 응답을 확인하지 못했습니다.");
  }

  saveSession(accessToken, email, body.AuthenticationResult?.RefreshToken);
  return accessToken;
}
