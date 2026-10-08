import {
  useEffect,
  useRef,
  useState
} from "react";

import type {
  PageContext as StudyContext,
  Nudge,
  AuthUser,
  VideoWatch
} from "../core/types";

import AuthScreen from "./AuthScreen";

import {
  BunnyAvatar,
  ForestScene,
  PineMark,
  Sprout
} from "../ui/illustrations";

import { greeting } from "../ui/greeting";

import * as Icons from "../ui/icons";

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

  const [watch, setWatch] =
    useState<VideoWatch | null>(null);

  const loadWatchRef =
    useRef<() => void>(() => {});


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

  function loadWatch(): void {

    const videoId =
      context?.video?.educational
        ? context.video.videoId
        : null;

    if (!videoId) {

      setWatch(null);

      return;

    }

    chrome.runtime.sendMessage(
      { type: "GET_VIDEO_STATS", videoId },
      (response: VideoWatch | null | undefined) => {

        if (chrome.runtime.lastError) {

          return;

        }

        setWatch(response ?? null);

      }
    );

  }


  useEffect(() => {

    loadWatchRef.current =
      loadWatch;

  });


  function reportPanelFocus(
    focused = document.hasFocus()
  ): void {

    chrome.runtime.sendMessage({
      type: "PANEL_FOCUS",
      focused
    }).catch(() => {

      // The extension is reloading.

    });

  }


  function loadData(): void {

    // Tells the background script that focus is in the side panel (so
    // clicking it is not mistaken for leaving Chrome).
    reportPanelFocus();

    loadContext();

    loadSession();

    loadNudge();

    loadWatchRef.current();

  }


  // ------------------------------------------------
  // INITIAL LOAD
  // ------------------------------------------------

  useEffect(() => {

    loadData();

  }, []);


  // ------------------------------------------------
  // PANEL FOCUS
  // ------------------------------------------------
  //
  // Clicking this panel takes focus from the study page. Saying so at
  // once keeps that from looking like leaving Chrome.

  useEffect(() => {

    const report =
      (focused: boolean) => {

        chrome.runtime.sendMessage({
          type: "PANEL_FOCUS",
          focused
        }).catch(() => {

          // The extension is reloading.

        });

      };

    const onFocus =
      () => report(true);

    const onBlur =
      () => report(false);

    window.addEventListener("focus", onFocus);

    window.addEventListener("blur", onBlur);

    return () => {

      window.removeEventListener("focus", onFocus);

      window.removeEventListener("blur", onBlur);

    };

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


  function formatSeconds(
    totalSeconds: number
  ): string {

    const seconds =
      Math.floor(totalSeconds);

    const minutes =
      Math.floor(seconds / 60);

    const rest =
      String(seconds % 60).padStart(2, "0");

    return `${minutes}:${rest}`;

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

      return "You've stepped away from the study page or from Chrome.";

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


  const firstName =
    user.name?.trim().split(/\s+/)[0] ||
    user.email.split("@")[0];


  // ------------------------------------------------
  // RENDER
  // ------------------------------------------------

  return (

    <div className="app">

      {/* ------------------------------------------ */}
      {/* HEADER */}
      {/* ------------------------------------------ */}

      <header className="topbar">

        <span className="brand">
          <PineMark />
          Study Mentor
        </span>

        <span className="user-bar">

          <span className="user-name" title={user.email}>
            {user.name || user.email}
          </span>

          <button
            className="icon-button"
            onClick={onSignOut}
            title="Sign out"
            aria-label="Sign out"
          >
            <Icons.Logout />
          </button>

        </span>

      </header>


      <section className="hero" aria-label="Welcome">

        <div className="hero-text">

          <h1>
            {greeting()}, {firstName}.
          </h1>

          <p>
            Small steps, steady growth.
          </p>

        </div>

        <div className="hero-art">
          <ForestScene />
        </div>

      </section>


      <button
        className="btn btn-sage dashboard-link"
        onClick={() => {

          void chrome.tabs.create({
            url: chrome.runtime.getURL("src/dashboard/index.html")
          });

        }}
      >
        <Icons.Chart />
        Open learning dashboard
      </button>


      {/* ------------------------------------------ */}
      {/* CURRENT ACTIVITY */}
      {/* ------------------------------------------ */}

      <section className="card">

        <h2>
          <Icons.Leaf />
          Current activity
        </h2>


        {context ? (

          <>

            <div className="activity">

              <span className="label">
                Website
              </span>

              <span
                className={
                  `chip ${context.website === "leetcode" ? "cool" : context.website === "youtube" ? "warm" : ""}`
                }
              >
                {context.website === "leetcode"
                  ? "LeetCode"
                  : context.website === "youtube"
                    ? "YouTube"
                    : context.website}
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


            {context.website === "youtube" && (

              <>

                {context.video ? (

                  <>

                    <div className="activity">

                      <span className="label">
                        Video
                      </span>

                      <span>
                        {context.video.title}
                      </span>

                    </div>


                    <div className="activity">

                      <span className="label">
                        Type
                      </span>

                      <span>
                        {context.video.educational
                          ? "Educational"
                          : "Not educational (not tracked)"}
                      </span>

                    </div>


                    {context.video.educational && (

                      <>

                        <div className="activity">

                          <span className="label">
                            Topics
                          </span>

                          <span>
                            {context.video.topics.length > 0
                              ? context.video.topics.join(", ")
                              : "Detecting..."}
                          </span>

                        </div>


                        {watch && (

                          <div className="video-stats">

                            <div>
                              <strong>
                                {formatSeconds(watch.watchedS)}
                              </strong>
                              <small>Watched</small>
                            </div>

                            <div>
                              <strong>
                                {watch.percentWatched}%
                              </strong>
                              <small>Reached</small>
                            </div>

                            <div>
                              <strong>
                                {watch.activePercent}%
                              </strong>
                              <small>Active</small>
                            </div>

                            <div>
                              <strong>
                                {watch.pauseCount}
                              </strong>
                              <small>Pauses</small>
                            </div>

                            <div>
                              <strong>
                                {watch.skipCount}
                              </strong>
                              <small>Skips</small>
                            </div>

                            <div>
                              <strong>
                                {watch.rewindCount}
                              </strong>
                              <small>Rewinds</small>
                            </div>

                            <div>
                              <strong>
                                {watch.tabChanges}
                              </strong>
                              <small>Tab changes</small>
                            </div>

                            <div>
                              <strong>
                                {watch.windowChanges}
                              </strong>
                              <small>Window changes</small>
                            </div>

                          </div>

                        )}


                        {watch?.quiz && watch.quiz.asked > 0 && (

                          <div className="activity">

                            <span className="label">
                              Quiz
                            </span>

                            <span>
                              {watch.quiz.correct} of {watch.quiz.answered} answered correctly
                            </span>

                          </div>

                        )}

                      </>

                    )}

                  </>

                ) : (

                  <p className="muted">
                    Open a video to check whether it is educational.
                  </p>

                )}

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
          <Icons.Timer />
          Study session
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
            className="btn btn-ghost session-button"
            onClick={
              handleEndSession
            }
          >

            End Session

          </button>

        ) : (

          <button
            className="btn btn-primary session-button"
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

          <BunnyAvatar size={38} />

          <div>

            <h2>
              Mentor
            </h2>

            <span className="mentor-subtitle">
              Watching quietly, here when you need me
            </span>

          </div>

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
              className="btn btn-sage dismiss-button"
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

          <div className="mentor-idle">

            <p>
              I'm following your study session and will
              step in when a hint or a question would help.
            </p>

            <Sprout size={34} />

          </div>

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
