import {
  api,
  clearToken,
  getToken,
  setToken
} from "./client";

import type { AuthUser } from "../core/types";


interface AuthResponse {

  token: string;

  user: AuthUser;

}


const GOOGLE_CLIENT_ID =
  import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;


export const googleEnabled =
  Boolean(GOOGLE_CLIENT_ID);


async function finishSignIn(
  response: AuthResponse
): Promise<AuthUser> {

  await setToken(
    response.token
  );

  return response.user;

}


export async function signup(
  name: string,
  email: string,
  password: string
): Promise<AuthUser> {

  return finishSignIn(
    await api<AuthResponse>(
      "POST",
      "/auth/signup",
      { name: name || undefined, email, password },
      { auth: false }
    )
  );

}


export async function login(
  email: string,
  password: string
): Promise<AuthUser> {

  return finishSignIn(
    await api<AuthResponse>(
      "POST",
      "/auth/login",
      { email, password },
      { auth: false }
    )
  );

}


function randomNonce(): string {

  const bytes =
    crypto.getRandomValues(
      new Uint8Array(16)
    );

  return Array.from(bytes)
    .map(byte =>
      byte.toString(16).padStart(2, "0")
    )
    .join("");

}


// Opens Google's account chooser in a browser popup, gets an ID token
// back through the extension's redirect URL, and exchanges it with the
// backend, which verifies it before issuing our own token.
export async function loginWithGoogle():
  Promise<AuthUser> {

  if (!GOOGLE_CLIENT_ID) {

    throw new Error(
      "Google sign-in is not configured (missing VITE_GOOGLE_CLIENT_ID)."
    );

  }


  const nonce =
    randomNonce();


  const authUrl =
    new URL(
      "https://accounts.google.com/o/oauth2/v2/auth"
    );

  authUrl.search =
    new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      response_type: "id_token",
      redirect_uri: chrome.identity.getRedirectURL(),
      scope: "openid email profile",
      nonce,
      prompt: "select_account"
    }).toString();


  const redirected =
    await chrome.identity.launchWebAuthFlow({
      url: authUrl.toString(),
      interactive: true
    });


  const idToken =
    new URLSearchParams(
      new URL(redirected ?? "").hash.slice(1)
    ).get("id_token");


  if (!idToken) {

    throw new Error(
      "Google sign-in did not return a token."
    );

  }


  return finishSignIn(
    await api<AuthResponse>(
      "POST",
      "/auth/google",
      { idToken, nonce },
      { auth: false }
    )
  );

}


export async function logout():
  Promise<void> {

  try {

    await api(
      "POST",
      "/auth/logout"
    );

  } catch {

    // Already signed out or the server is unreachable: sign out locally.

  }

  await clearToken();

}


// Returns the signed-in user, or null.
export async function getAuthState():
  Promise<AuthUser | null> {

  if (!await getToken()) {

    return null;

  }

  try {

    const { user } =
      await api<{ user: AuthUser }>(
        "GET",
        "/auth/me"
      );

    return user;

  } catch {

    return null;

  }

}
