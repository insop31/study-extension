import {
  useEffect,
  useState
} from "react";

import type {
  PageContext as StudyContext,
  Nudge,
  AuthUser
} from "../core/types";

import AuthScreen from "./AuthScreen";

import { googleEnabled } from "../api/auth";

import type {
  StudySession
} from "../storage/storage";


// --------------------------------------------------
// TYPES
// --------------------------------------------------

interface MentorResponse {

  success: boolean;

  guidance?: string;

  error?: string;

}


// --------------------------------------------------
// APP
// --------------------------------------------------

interface DashboardProps {

  user: AuthUser;

  onSignOut: () => void;

}


function Dashboard({
  user,
  onSignOut
}: DashboardProps) {

  const [
    context,
    setContext
  ] =
    useState<StudyContext | null>(
      null
    );


  const [
    session,
    setSession
  ] =
    useState<StudySession | null>(
      null
    );


  const [
    nudge,
    setNudge
  ] =
    useState<Nudge | null>(
      null
    );


  const [mentorQuestion, setMentorQuestion] =
    useState("");

  const [mentorGuidance, setMentorGuidance] =
    useState<string | null>(null);

  const [mentorError, setMentorError] =
    useState<string | null>(null);

  const [mentorLoading, setMentorLoading] =
    useState(false);


  // ------------------------------------------------
  // LOAD CONTEXT
  // ------------------------------------------------

  function loadContext(): void {

    chrome.runtime.sendMessage(

      {
        type:
          "GET_CURRENT_CONTEXT"
      },

      (
        response:
          StudyContext | null
      ) => {

        if (
          chrome.runtime.lastError
        ) {

          return;

        }


        setContext(
          response
        );

      }

    );

  }


  // ------------------------------------------------
  // LOAD SESSION
  // ------------------------------------------------

  function loadSession(): void {

    chrome.runtime.sendMessage(

      {
        type:
          "GET_CURRENT_SESSION"
      },

      (
        response:
          StudySession | null
      ) => {

        if (
          chrome.runtime.lastError
        ) {

          return;

        }


        setSession(
          response
        );

      }

    );

  }


  // ------------------------------------------------
  // LOAD NUDGE
  // ------------------------------------------------

  function loadNudge(): void {

    chrome.runtime.sendMessage(

      {
        type:
          "GET_CURRENT_NUDGE"
      },

      (
        response:
          Nudge | null
      ) => {

        if (
          chrome.runtime.lastError
        ) {

          return;

        }


        setNudge(
          response
        );

      }

    );

  }


  // ------------------------------------------------
  // LOAD EVERYTHING
  // ------------------------------------------------

  function loadData(): void {

    loadContext();

    loadSession();

    loadNudge();

  }


  // ------------------------------------------------
  // INITIAL LOAD
  // ------------------------------------------------

  useEffect(() => {

    loadData();

  }, []);


  // ------------------------------------------------
  // REFRESH
  // ------------------------------------------------

  useEffect(() => {

    const interval =
      setInterval(

        loadData,

        2000

      );


    return () => {

      clearInterval(
        interval
      );

    };

  }, []);


  // ------------------------------------------------
  // START SESSION
  // ------------------------------------------------

  function handleStartSession(): void {

    chrome.runtime.sendMessage(

      {
        type:
          "START_SESSION"
      },

      () => {

        loadData();

      }

    );

  }


  // ------------------------------------------------
  // END SESSION
  // ------------------------------------------------

  function handleEndSession(): void {

    chrome.runtime.sendMessage(

      {
        type:
          "END_SESSION"
      },

      () => {

        loadData();

      }

    );

  }


  function handleAskMentor(): void {

    setMentorLoading(true);
    setMentorError(null);

    chrome.runtime.sendMessage(
      {
        type: "ASK_AI_MENTOR",
        question: mentorQuestion
      },
      (response: MentorResponse | undefined) => {

        setMentorLoading(false);

        if (chrome.runtime.lastError || !response) {

          setMentorError("The mentor is unavailable. Please try again.");
          return;

        }

        if (!response.success) {

          setMentorError(response.error ?? "The mentor could not respond.");
          return;

        }

        setMentorGuidance(response.guidance ?? null);

      }
    );

  }


  // ------------------------------------------------
  // FORMAT TIME
  // ------------------------------------------------

function formatTime(
  milliseconds: number
): string {

  const totalMinutes =
    Math.floor(
      milliseconds / 60000
    );

  if (totalMinutes < 60) {

    return `${totalMinutes} min`;

  }


  const hours =
    Math.floor(
      totalMinutes / 60
    );

  const minutes =
    totalMinutes % 60;


  if (minutes === 0) {

    return `${hours} hr`;

  }


  return `${hours} hr ${minutes} min`;

}


  // ------------------------------------------------
  // STATE LABEL
  // ------------------------------------------------

  function getStateLabel(): string {

    if (!session) {

      return "No session";

    }


    if (
      !session.isActive
    ) {

      return "Session ended";

    }


    if (
      session.userState ===
      "idle"
    ) {

      return "Idle";

    }


    if (
      session.userState ===
      "paused"
    ) {

      return "Paused";

    }


    return "Actively studying";

  }


  // ------------------------------------------------
  // STATE DESCRIPTION
  // ------------------------------------------------

  function getStateDescription():
    string {

    if (!session) {

      return "Start a session when you're ready.";

    }


    if (
      !session.isActive
    ) {

      return "This study session has ended.";

    }


    if (
      session.userState ===
      "idle"
    ) {

      return "No recent computer activity detected.";

    }


    if (
      session.userState ===
      "paused"
    ) {

      return "The study page is currently paused.";

    }


    return "Activity detected. Keep going!";

  }


  // ------------------------------------------------
  // STATE CLASS
  // ------------------------------------------------

  function getStateClass():
    string {

    if (!session) {

      return "neutral";

    }


    if (
      !session.isActive
    ) {

      return "ended";

    }


    return session.userState;

  }


  // ------------------------------------------------
  // RENDER
  // ------------------------------------------------

  return (

    <div className="app">

      {/* ------------------------------------------ */}
      {/* HEADER */}
      {/* ------------------------------------------ */}

      <header className="header">

        <h1>
          🧠 Study Mentor
        </h1>

        <p>
          Your personal AI learning companion
        </p>

        <div className="user-bar">

          <span title={user.email}>
            {user.name || user.email}
          </span>

          <button
            className="link-button"
            onClick={onSignOut}
          >
            Sign out
          </button>

        </div>

      </header>


      {/* ------------------------------------------ */}
      {/* CURRENT ACTIVITY */}
      {/* ------------------------------------------ */}

      <section className="card">

        <h2>
          Current Activity
        </h2>


        {context ? (

          <>

            <div className="activity">

              <span className="label">
                Website
              </span>

              <span>
                {context.website}
              </span>

            </div>


            {context.website === "leetcode" && (

              <>

                <div className="activity">

                  <span className="label">
                    Difficulty
                  </span>

                  <span>
                    {context.difficulty ?? "Detecting..."}
                  </span>

                </div>


                <div className="activity">

                  <span className="label">
                    Language
                  </span>

                  <span>
                    {context.programmingLanguage ?? "Detecting..."}
                  </span>

                </div>

              </>

            )}


            <div className="activity">

              <span className="label">
                Page
              </span>

              <span>
                {context.title}
              </span>

            </div>

          </>

        ) : (

          <p className="muted">
            Open LeetCode or YouTube to begin studying.
          </p>

        )}

      </section>


      {/* ------------------------------------------ */}
      {/* SESSION */}
      {/* ------------------------------------------ */}

      <section className="card">

        <h2>
          ⏱ Study Session
        </h2>


        <div className="timer">

          {formatTime(
            session?.totalActiveTime ??
            0
          )}

        </div>


        <div
          className={
            `session-state ${getStateClass()}`
          }
        >

          <span className="state-dot" />


          <div>

            <strong>
              {getStateLabel()}
            </strong>


            <small>
              {getStateDescription()}
            </small>

          </div>

        </div>


        {session?.isActive ? (

          <button
            className="end-button"
            onClick={
              handleEndSession
            }
          >

            End Session

          </button>

        ) : (

          <button
            onClick={
              handleStartSession
            }
          >

            Start New Session

          </button>

        )}

      </section>


      {/* ------------------------------------------ */}
      {/* MENTOR */}
      {/* ------------------------------------------ */}

      <section className="card mentor-card">

        <div className="mentor-title">

          <span>
            💡
          </span>

          <h2>
            Mentor
          </h2>

        </div>


        {nudge ? (

          <div className="nudge">

            <div className="nudge-label">

              Mentor suggestion

            </div>


            <p>
              {nudge.message}
            </p>


            <button
              className="dismiss-button"
              onClick={() => {

                setNudge(
                  null
                );

                chrome.runtime.sendMessage({
                  type: "DISMISS_NUDGE",
                  nudgeId: nudge.id
                });

              }}
            >

              Got it

            </button>

          </div>

        ) : (

          <p>

            I'm observing your study session.
            I'll step in when I detect a useful
            opportunity to help.

          </p>

        )}


        <div className="mentor-input">

          <label htmlFor="mentor-question">
            Ask about your next step
          </label>


          <textarea
            id="mentor-question"
            value={mentorQuestion}
            onChange={event => {

              setMentorQuestion(
                event.target.value
              );

            }}
            placeholder="I'm stuck—what should I check next?"
            maxLength={1000}
          />


          <button
            onClick={handleAskMentor}
            disabled={mentorLoading}
          >

            {mentorLoading
              ? "Thinking..."
              : "Ask mentor"}

          </button>

        </div>


        {mentorGuidance && (

          <div className="nudge mentor-response">

            <div className="nudge-label">
              AI mentor
            </div>

            <p>
              {mentorGuidance}
            </p>

          </div>

        )}


        {mentorError && (

          <p className="muted">
            {mentorError}
          </p>

        )}

      </section>

    </div>

  );

}


function App() {

  const [user, setUser] =
    useState<AuthUser | null>(null);

  const [checking, setChecking] =
    useState(true);


  useEffect(() => {

    chrome.runtime.sendMessage(
      { type: "GET_AUTH_STATE" },
      (response: { user?: AuthUser | null } | undefined) => {

        setUser(
          chrome.runtime.lastError
            ? null
            : response?.user ?? null
        );

        setChecking(false);

      }
    );

  }, []);


  function handleSignOut(): void {

    chrome.runtime.sendMessage(
      { type: "AUTH_LOGOUT" },
      () => {

        setUser(null);

      }
    );

  }


  if (checking) {

    return (
      <div className="app">
        <p className="muted">Loading...</p>
      </div>
    );

  }


  if (!user) {

    return (
      <AuthScreen
        googleEnabled={googleEnabled}
        onSignedIn={setUser}
      />
    );

  }


  return (
    <Dashboard
      user={user}
      onSignOut={handleSignOut}
    />
  );

}


export default App;
