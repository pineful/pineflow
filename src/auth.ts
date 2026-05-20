const region = import.meta.env.VITE_COGNITO_REGION ?? "";
const userPoolClientId = import.meta.env.VITE_COGNITO_USER_POOL_CLIENT_ID ?? "";
const tokenStorageKey = "pineflow.id-token";
const emailStorageKey = "pineflow.email";

type CognitoAuthResult = {
  IdToken?: string;
};

type CognitoResponse = {
  AuthenticationResult?: CognitoAuthResult;
  ChallengeName?: "NEW_PASSWORD_REQUIRED";
  Session?: string;
  ChallengeParameters?: {
    USER_ID_FOR_SRP?: string;
  };
  message?: string;
  __type?: string;
};

export type LoginResult =
  | { type: "signed-in"; idToken: string }
  | { type: "new-password-required"; session: string; username: string };

function endpoint() {
  return `https://cognito-idp.${region}.amazonaws.com/`;
}

function ensureConfigured() {
  if (!region || !userPoolClientId) {
    throw new Error("Cognito 설정이 아직 준비되지 않았습니다.");
  }
}

async function cognitoRequest(target: string, payload: Record<string, unknown>) {
  ensureConfigured();

  const response = await fetch(endpoint(), {
    method: "POST",
    headers: {
      "Content-Type": "application/x-amz-json-1.1",
      "X-Amz-Target": `AWSCognitoIdentityProviderService.${target}`
    },
    body: JSON.stringify(payload)
  });

  const body = (await response.json().catch(() => ({}))) as CognitoResponse;
  if (!response.ok) {
    throw new Error(body.message ?? "로그인 요청에 실패했습니다.");
  }

  return body;
}

export function getStoredIdToken() {
  return window.localStorage.getItem(tokenStorageKey) ?? "";
}

export function getStoredEmail() {
  return window.localStorage.getItem(emailStorageKey) ?? "";
}

export function saveSession(idToken: string, email: string) {
  window.localStorage.setItem(tokenStorageKey, idToken);
  window.localStorage.setItem(emailStorageKey, email);
}

export function clearSession() {
  window.localStorage.removeItem(tokenStorageKey);
  window.localStorage.removeItem(emailStorageKey);
}

export async function signIn(email: string, password: string): Promise<LoginResult> {
  const body = await cognitoRequest("InitiateAuth", {
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

  const idToken = body.AuthenticationResult?.IdToken;
  if (!idToken) {
    throw new Error("로그인 토큰을 받지 못했습니다.");
  }

  saveSession(idToken, email);
  return { type: "signed-in", idToken };
}

export async function completeNewPassword(
  email: string,
  username: string,
  session: string,
  newPassword: string
) {
  const body = await cognitoRequest("RespondToAuthChallenge", {
    ChallengeName: "NEW_PASSWORD_REQUIRED",
    ClientId: userPoolClientId,
    Session: session,
    ChallengeResponses: {
      USERNAME: username,
      NEW_PASSWORD: newPassword
    }
  });

  const idToken = body.AuthenticationResult?.IdToken;
  if (!idToken) {
    throw new Error("새 비밀번호 설정 후 로그인 토큰을 받지 못했습니다.");
  }

  saveSession(idToken, email);
  return idToken;
}
