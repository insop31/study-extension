// REST client for the mentor backend. The only thing kept in
// chrome.storage.local is the sign-in token for this browser.

const TOKEN_KEY =
  "authToken";

export const BACKEND_URL =
  (import.meta.env.VITE_BACKEND_URL as string | undefined) ||
  "http://localhost:8787";


export class ApiError extends Error {

  status: number;

  constructor(
    status: number,
    message: string
  ) {

    super(message);

    this.status =
      status;

  }

}


// Thrown (without any network call) when nobody is signed in.
export class NotSignedInError extends ApiError {

  constructor() {

    super(
      401,
      "Please sign in to use Study Mentor."
    );

  }

}


export async function getToken():
  Promise<string | null> {

  const stored =
    await chrome.storage.local.get(
      TOKEN_KEY
    );

  return (
    stored[TOKEN_KEY] as string | undefined
  ) ?? null;

}


export async function setToken(
  token: string
): Promise<void> {

  await chrome.storage.local.set({
    [TOKEN_KEY]: token
  });

}


export async function clearToken():
  Promise<void> {

  await chrome.storage.local.remove(
    TOKEN_KEY
  );

}


interface RequestOptions {

  // Public endpoints (sign in, sign up) don't need a token.
  auth?: boolean;

}


export async function api<T>(
  method: "GET" | "POST" | "PUT" | "PATCH",
  path: string,
  body?: unknown,
  { auth = true }: RequestOptions = {}
): Promise<T> {

  const token =
    auth
      ? await getToken()
      : null;


  if (auth && !token) {

    throw new NotSignedInError();

  }


  const response =
    await fetch(
      `${BACKEND_URL}/api${path}`,
      {
        method,
        headers: {
          "Content-Type":
            "application/json",
          ...(token
            ? { Authorization: `Bearer ${token}` }
            : {})
        },
        body:
          body === undefined
            ? undefined
            : JSON.stringify(body)
      }
    );


  const data =
    await response.json() as T & {
      error?: string;
      details?: string[];
    };


  // An expired or revoked token means the user must sign in again.
  if (
    response.status === 401 &&
    auth
  ) {

    await clearToken();

    throw new NotSignedInError();

  }


  if (!response.ok) {

    throw new ApiError(
      response.status,
      data.details?.[0] ??
        data.error ??
        `Request failed (${response.status})`
    );

  }


  return data;

}
