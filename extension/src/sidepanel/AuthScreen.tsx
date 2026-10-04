import { useState } from "react";

import type { AuthUser } from "../core/types";


interface AuthResponse {

  success: boolean;

  user?: AuthUser | null;

  error?: string;

}


interface Props {

  googleEnabled: boolean;

  onSignedIn: (user: AuthUser) => void;

}


function AuthScreen({
  googleEnabled,
  onSignedIn
}: Props) {

  const [mode, setMode] =
    useState<"login" | "signup">("login");

  const [name, setName] =
    useState("");

  const [email, setEmail] =
    useState("");

  const [password, setPassword] =
    useState("");

  const [error, setError] =
    useState<string | null>(null);

  const [busy, setBusy] =
    useState(false);


  function send(
    message: Record<string, string>
  ): void {

    setBusy(true);
    setError(null);

    chrome.runtime.sendMessage(
      message,
      (response: AuthResponse | undefined) => {

        setBusy(false);

        if (
          chrome.runtime.lastError ||
          !response
        ) {

          setError("Could not reach the extension. Reload it and try again.");
          return;

        }

        if (!response.success || !response.user) {

          setError(response.error ?? "Sign-in failed.");
          return;

        }

        setPassword("");
        onSignedIn(response.user);

      }
    );

  }


  function handleSubmit(
    event: React.FormEvent
  ): void {

    event.preventDefault();

    send(
      mode === "signup"
        ? { type: "AUTH_SIGNUP", name, email, password }
        : { type: "AUTH_LOGIN", email, password }
    );

  }


  return (

    <div className="app">

      <header className="header">

        <h1>
          🧠 Study Mentor
        </h1>

        <p>
          Sign in to track your study sessions and get mentoring.
        </p>

      </header>


      <section className="card auth-card">

        <h2>
          {mode === "login" ? "Sign in" : "Create account"}
        </h2>


        <form
          className="auth-form"
          onSubmit={handleSubmit}
        >

          {mode === "signup" && (

            <>
              <label htmlFor="auth-name">
                Name (optional)
              </label>

              <input
                id="auth-name"
                type="text"
                value={name}
                onChange={event => setName(event.target.value)}
                autoComplete="name"
                maxLength={100}
              />
            </>

          )}


          <label htmlFor="auth-email">
            Email
          </label>

          <input
            id="auth-email"
            type="email"
            value={email}
            onChange={event => setEmail(event.target.value)}
            autoComplete="email"
            required
          />


          <label htmlFor="auth-password">
            Password
          </label>

          <input
            id="auth-password"
            type="password"
            value={password}
            onChange={event => setPassword(event.target.value)}
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            minLength={mode === "signup" ? 8 : undefined}
            required
          />

          {mode === "signup" && (
            <small className="muted">
              At least 8 characters.
            </small>
          )}


          <button
            type="submit"
            disabled={busy}
          >
            {busy
              ? "Please wait..."
              : mode === "login"
                ? "Sign in"
                : "Create account"}
          </button>

        </form>


        {googleEnabled && (

          <>
            <div className="auth-divider">
              <span>or</span>
            </div>

            <button
              className="google-button"
              disabled={busy}
              onClick={() => send({ type: "AUTH_GOOGLE" })}
            >
              Continue with Google
            </button>
          </>

        )}


        {error && (
          <p className="auth-error" role="alert">
            {error}
          </p>
        )}


        <p className="muted auth-switch">

          {mode === "login"
            ? "New here? "
            : "Already have an account? "}

          <a
            href="#"
            onClick={event => {

              event.preventDefault();
              setError(null);
              setMode(mode === "login" ? "signup" : "login");

            }}
          >
            {mode === "login" ? "Create an account" : "Sign in"}
          </a>

        </p>

      </section>

    </div>

  );

}


export default AuthScreen;
