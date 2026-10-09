import {
  getCurrentSession
} from "../storage/storage";

import type {
  PageContext,
  QuizQuestion,
  QuizResult,
  VideoDelta,
  VideoInfo,
  VideoWatch
} from "../core/types";

import {
  emptyDelta
} from "../core/videoDelta";

import type {
  VideoReport
} from "../content/youtubeTracker";

import {
  detectPlatform
} from "../core/contextEngine";

import {
  startSession,
  updateSession,
  recordActivity,
  setUserState,
  endSession,
  pauseSession,
  resumeSession,
  recordDistraction,
  getCurrentNudge,
  saveNudge,
  dismissNudge,
  type NudgeState
} from "../core/sessionManager";

import type {
  StudySession
} from "../storage/storage";

import {
  api,
  BACKEND_URL,
  getToken,
  NotSignedInError
} from "../api/client";

import {
  getAuthState,
  login,
  loginWithGoogle,
  logout,
  signup
} from "../api/auth";

import {
  evaluateNudge,
  canShowNudge
} from "../core/nudgeEngine";


// --------------------------------------------------
// TYPES
// --------------------------------------------------

interface Message {

  type: string;

  context?: PageContext;

  activityType?: string;

  timestamp?: number;

  visible?: boolean;

  submissionResult?: string;

  question?: string;

  code?: string;

  nudgeId?: string;

  name?: string;

  email?: string;

  password?: string;

  report?: VideoReport;

  videoId?: string;

  quizId?: string;

  chosenIndex?: number;

  // Whether the page that sent the message has keyboard focus.
  focused?: boolean;

}


// --------------------------------------------------
// STATE
// --------------------------------------------------

let currentContext:
  PageContext | null = null;


let currentTabId:
  number | null = null;


let pageVisible =
  true;


interface CodeSnapshot {

  code: string;

  updatedAt: number;

}


// Source code is held only in service-worker memory, never storage.
const codeByTab =
  new Map<number, CodeSnapshot>();


// Background events keep firing after sign-out. Their API calls are
// rejected locally with NotSignedInError, which is expected, not a bug.
self.addEventListener(
  "unhandledrejection",
  event => {

    if (event.reason instanceof NotSignedInError) {

      event.preventDefault();

    }

  }
);


// --------------------------------------------------
// CHROME IDLE API
// --------------------------------------------------
//
// Chrome needs at least 15 seconds for
// system-level idle detection.
//

chrome.idle.setDetectionInterval(
  15
);


// --------------------------------------------------
// BROWSER FOCUS
// --------------------------------------------------
//
// chrome.idle only knows whether the computer is in use. A learner
// working in another application is "active" to Chrome, but they are
// not studying, so counting also needs Chrome to have focus.
//

// The learner is "in the browser" when Chrome has focus AND that focus is
// on the study page or on this extension's side panel (not the address bar
// or another application). Chrome's window events alone have proved
// unreliable for this, so the pages report their own focus too.
let pageFocused =
  true;

// The side panel reports every couple of seconds while it has focus.
let panelFocusedUntil =
  0;


function panelHasFocus(): boolean {

  return Date.now() < panelFocusedUntil;

}


async function userIsInBrowser():
  Promise<boolean> {

  return (
    await isBrowserFocused() &&
    (pageFocused || panelHasFocus())
  );

}


// Per tab, so one focus loss is not counted twice when both Chrome's
// window event and the page's own blur report it.
const lastWindowChangeAt =
  new Map<number, number>();


async function countWindowChange(
  tabId: number
): Promise<void> {

  const previous =
    lastWindowChangeAt.get(tabId) ?? 0;

  if (Date.now() - previous < 3000) {

    return;

  }

  lastWindowChangeAt.set(tabId, Date.now());

  await recordVideoEvent(
    tabId,
    { windowChanges: 1 },
    "blur"
  );

}


// A page lost focus. If it went to the side panel the learner is still
// studying; otherwise they have left the page or Chrome.
async function handleFocusLost(
  tabId?: number
): Promise<void> {

  // Give the side panel a moment to report that it took the focus.
  await new Promise(resolve =>
    setTimeout(resolve, 400)
  );

  if (
    panelHasFocus() ||
    !await getToken()
  ) {

    return;

  }

  await setUserState(
    "idle"
  );

  if (tabId !== undefined) {

    await countWindowChange(tabId);

  }

}


async function isBrowserFocused():
  Promise<boolean> {

  try {

    const lastFocused =
      await chrome.windows.getLastFocused();

    return lastFocused.focused;

  } catch {

    return true;

  }

}


async function getLeetCodeDifficulty(
  url: string
): Promise<string | undefined> {

  const problemSlug =
    new URL(url).pathname.match(
      /^\/problems\/([^/]+)/
    )?.[1];


  if (!problemSlug) {

    return undefined;

  }


  try {

    const response =
      await fetch(
        "https://leetcode.com/graphql/",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            operationName: "questionData",
            variables: {
              titleSlug: problemSlug
            },
            query: `query questionData($titleSlug: String!) {
              question(titleSlug: $titleSlug) { difficulty }
            }`
          })
        }
      );


    const data =
      await response.json() as {
        data?: {
          question?: {
            difficulty?: string;
          };
        };
      };


    return data.data?.question?.difficulty;

  } catch {

    return undefined;

  }

}


// --------------------------------------------------
// ACTIVE TAB CONTEXT
// --------------------------------------------------

async function updateContextFromActiveTab():
  Promise<void> {

  const tabs =
    await chrome.tabs.query({

      active:
        true,

      currentWindow:
        true

    });


  const tab =
    tabs[0];


  if (
    !tab ||
    !tab.url
  ) {

    currentTabId =
      tab?.id ?? null;

    currentContext =
      null;

    pageVisible =
      false;

    await setUserState(
      "idle"
    );

    return;

  }


  const website =
    detectPlatform(
      tab.url
    );


  if (
    website ===
    "unknown"
  ) {

    // A session stays open when the user leaves a study
    // site, but its timer must stop until they return.
    currentTabId =
      tab.id ?? null;

    currentContext =
      null;

    pageVisible =
      false;

    await setUserState(
      "idle"
    );

    return;

  }


  currentTabId =
    tab.id ?? null;


  currentContext = {

    title:
      tab.title ??
      "Unknown Page",

    url:
      tab.url,

    website,

    timestamp:
      Date.now(),

    // Tab APIs provide the URL/title but not LeetCode's
    // page metadata. Preserve it between side-panel polls
    // until the content script supplies a newer context.
    ...(currentContext?.url === tab.url
      ? {
          problemSlug:
            currentContext.problemSlug,
          difficulty:
            currentContext.difficulty,
          topics:
            currentContext.topics,
          programmingLanguage:
            currentContext.programmingLanguage,
          video:
            currentContext.video
        }
      : {})

  };


  if (
    website === "leetcode" &&
    !currentContext.difficulty
  ) {

    currentContext.difficulty =
      await getLeetCodeDifficulty(
        tab.url
      );

  }


  const session =
    await getCurrentSession();


  if (
    session?.isActive &&
    await chrome.idle.queryState(15) === "active" &&
    await userIsInBrowser()
  ) {

    await setUserState(
      "active"
    );

  }


  console.log(
    "📄 Context detected:",
    currentContext
  );

}


// --------------------------------------------------
// EXTENSION INSTALLED
// --------------------------------------------------

chrome.runtime.onInstalled.addListener(
  async () => {

    console.log(
      "🧠 AI Study Mentor installed."
    );

  }
);


// --------------------------------------------------
// ACTION CLICK
// --------------------------------------------------

chrome.action.onClicked.addListener(
  async (
    tab: chrome.tabs.Tab
  ) => {

    if (!tab.id) {

      return;

    }


    try {

      await chrome.sidePanel.open({

        tabId:
          tab.id

      });

    } catch (error) {

      console.error(
        "Could not open side panel:",
        error
      );

    }

  }
);


// --------------------------------------------------
// TAB ACTIVATED
// --------------------------------------------------

chrome.tabs.onActivated.addListener(
  async (
    activeInfo
  ) => {

    const previousTabId =
      currentTabId;

    currentTabId =
      activeInfo.tabId;

    pageFocused =
      true;


    // Switching Chrome tabs while watching a lecture is a tab change.
    if (
      previousTabId !== null &&
      previousTabId !== activeInfo.tabId
    ) {

      recordVideoEvent(
        previousTabId,
        { tabChanges: 1 },
        "visibility"
      ).catch(logUnlessSignedOut("Tab change"));

    }


    pageVisible =
      true;


    try {

      await updateContextFromActiveTab();

    } catch (error) {

      console.error(
        "Tab activation error:",
        error
      );

    }

  }
);


// --------------------------------------------------
// TAB UPDATED
// --------------------------------------------------

chrome.tabs.onUpdated.addListener(
  async (
    _tabId,
    changeInfo,
    tab
  ) => {

    // Loading in a background tab must not replace the
    // context of the tab the user is currently viewing.
    if (!tab.active) {

      return;

    }

    if (
      changeInfo.status !==
      "complete"
    ) {

      return;

    }


    if (!tab.url) {

      return;

    }


    const website =
      detectPlatform(
        tab.url
      );


    if (
      website ===
      "unknown"
    ) {

      currentTabId =
        tab.id ?? null;

      currentContext =
        null;

      pageVisible =
        false;

      await setUserState(
        "idle"
      );

      return;

    }


    currentTabId =
      tab.id ?? null;


    currentContext = {

      title:
        tab.title ??
        "Unknown Page",

      url:
        tab.url,

      website,

      timestamp:
        Date.now()

    };


    pageVisible =
      true;


    const chromeState =
      await chrome.idle.queryState(15);


    if (
      chromeState === "active" &&
      await userIsInBrowser()
    ) {

      await setUserState(
        "active"
      );

    }


    console.log(
      "📄 Tab updated:",
      currentContext
    );


    const session =
      await getCurrentSession();


    if (
      session &&
      session.isActive
    ) {

      await updateSession(

        website,

        currentContext.title,

        currentContext.url

      );

    }

  }
);


// --------------------------------------------------
// WINDOW FOCUS
// --------------------------------------------------
//
// Fires with WINDOW_ID_NONE when the learner leaves Chrome for another
// application, and with a window id when they come back or move to
// another Chrome window.
//

let lastFocusedWindowId: number =
  chrome.windows.WINDOW_ID_NONE;


function logUnlessSignedOut(
  label: string
): (error: unknown) => void {

  return error => {

    if (!(error instanceof NotSignedInError)) {

      console.error(
        `${label} error:`,
        error
      );

    }

  };

}


chrome.windows.onFocusChanged.addListener(
  async windowId => {

    const previousWindowId =
      lastFocusedWindowId;

    lastFocusedWindowId =
      windowId;


    try {

      if (windowId === chrome.windows.WINDOW_ID_NONE) {

        // Left Chrome for another application: not studying right now.
        await setUserState(
          "idle"
        );

        console.log(
          "🟡 LEFT CHROME"
        );

        const left =
          await chrome.windows.getLastFocused({
            populate: true
          });

        const leftTab =
          left.tabs?.find(tab => tab.active);

        if (leftTab?.id !== undefined) {

          await countWindowChange(leftTab.id);

        }

        return;

      }


      // Moved from one Chrome window to another.
      if (
        previousWindowId !== chrome.windows.WINDOW_ID_NONE &&
        previousWindowId !== windowId
      ) {

        const [leftTab] =
          await chrome.tabs.query({
            active: true,
            windowId: previousWindowId
          });

        if (leftTab?.id !== undefined) {

          await countWindowChange(leftTab.id);

        }

      }


      // Back in Chrome: resume if the learner is on a study page.
      await updateContextFromActiveTab();

    } catch (error) {

      logUnlessSignedOut("Window focus")(error);

    }

  }
);


// --------------------------------------------------
// TAB REMOVED
// --------------------------------------------------

chrome.tabs.onRemoved.addListener(
  async (
    tabId
  ) => {

    if (
      tabId ===
      currentTabId
    ) {

      currentTabId =
        null;

      pageVisible =
        false;

      currentContext =
        null;

      await setUserState(
        "idle"
      );

    }

  }
);


// --------------------------------------------------
// CHROME IDLE STATE
// --------------------------------------------------

chrome.idle.onStateChanged.addListener(
  async (
    newState
  ) => {

    console.log(
      "🖥 Chrome user state:",
      newState
    );


    const session =
      await getCurrentSession();


    if (
      !session ||
      !session.isActive
    ) {

      return;

    }


    // ----------------------------------------------
    // COMPUTER ACTIVE
    // ----------------------------------------------

    if (
      newState ===
      "active"
    ) {

      if (
        pageVisible &&
        currentContext &&
        await userIsInBrowser()
      ) {

        await setUserState(
          "active"
        );

      }


      console.log(
        "🟢 COMPUTER ACTIVE"
      );


      return;

    }


    // ----------------------------------------------
    // COMPUTER IDLE
    // ----------------------------------------------

    if (
      newState ===
      "idle"
    ) {

      await setUserState(
        "idle"
      );


      console.log(
        "🟡 COMPUTER IDLE"
      );


      return;

    }


    // ----------------------------------------------
    // LOCKED
    // ----------------------------------------------

    if (
      newState ===
      "locked"
    ) {

      await setUserState(
        "paused"
      );


      console.log(
        "🔴 COMPUTER LOCKED"
      );

    }

  }
);


// --------------------------------------------------
// MESSAGE HANDLER
// --------------------------------------------------

chrome.runtime.onMessage.addListener(

  (
    message: Message,

    sender:
      chrome.runtime.MessageSender,

    sendResponse:
      (response?: unknown) => void

  ) => {


    // ==============================================
    // PAGE CONTEXT
    // ==============================================

    if (
      message.type ===
      "PAGE_CONTEXT" &&
      message.context
    ) {

      // Content scripts in background study tabs can send
      // delayed messages. They must not reactivate tracking
      // after the user has switched to a different tab.
      if (
        sender.tab?.id &&
        currentTabId !== null &&
        sender.tab.id !== currentTabId
      ) {

        return;

      }

      currentContext =
        message.context;


      if (
        sender.tab?.id
      ) {

        currentTabId =
          sender.tab.id;

      }


      pageVisible =
        message.visible ??
        true;


      handlePageContext(
        message.context
      ).catch(error => {

        console.error(
          "Page context error:",
          error
        );

      });


      return;

    }


    // ==============================================
    // YOUTUBE VIDEO PROGRESS
    // ==============================================

    if (
      message.type === "YOUTUBE_PROGRESS" &&
      message.report
    ) {

      // A report from a tab the learner just left is still real watching
      // data, so it is recorded. It just must not change what the
      // extension thinks the learner is looking at now.
      const fromCurrentTab =
        !(
          sender.tab?.id &&
          currentTabId !== null &&
          sender.tab.id !== currentTabId
        );


      if (fromCurrentTab) {

        if (message.context) {

          currentContext =
            message.context;

        }


        if (sender.tab?.id) {

          currentTabId =
            sender.tab.id;

        }


        pageVisible =
          message.report.visible;

        pageFocused =
          message.report.focused;

      }


      if (message.report.event === "blur") {

        handleFocusLost(sender.tab?.id).catch(
          logUnlessSignedOut("Focus loss")
        );

      }


      handleYouTubeProgress(
        message.report,
        sender.tab?.id,
        fromCurrentTab
      ).catch(error => {

        console.error(
          "YouTube progress error:",
          error
        );

      });


      return;

    }


    if (
      message.type === "ANSWER_QUIZ" &&
      message.quizId &&
      typeof message.chosenIndex === "number"
    ) {

      api<QuizResult>(
        "POST",
        `/youtube/quiz/${message.quizId}/answer`,
        { chosenIndex: message.chosenIndex }
      )
        .then(result => {

          sendResponse({ success: true, ...result });

        })
        .catch(error => {

          console.error(
            "Quiz answer error:",
            error
          );

          sendResponse({ success: false });

        });


      return true;

    }


    if (message.type === "PANEL_FOCUS") {

      panelFocusedUntil =
        message.focused
          ? Date.now() + 4000
          : 0;

      return;

    }


    if (
      message.type === "GET_VIDEO_STATS" &&
      message.videoId
    ) {

      api<{ watch: VideoWatch | null }>(
        "GET",
        `/youtube/watches/current?videoId=${encodeURIComponent(message.videoId)}`
      )
        .then(result => {

          sendResponse(result.watch);

        })
        .catch(() => {

          sendResponse(null);

        });


      return true;

    }


    // ==============================================
    // USER ACTIVITY
    // ==============================================

    if (
      message.type ===
      "USER_ACTIVITY"
    ) {

      if (
        sender.tab?.id &&
        currentTabId !== null &&
        sender.tab.id !== currentTabId
      ) {

        return;

      }

      if (
        message.context
      ) {

        currentContext =
          message.context;

      }


      if (
        sender.tab?.id
      ) {

        currentTabId =
          sender.tab.id;

      }


      if (
        typeof message.visible ===
        "boolean"
      ) {

        pageVisible =
          message.visible;

      }


      if (typeof message.focused === "boolean") {

        pageFocused =
          message.focused;

      }


      // The page lost focus: the learner may have left Chrome. Not
      // activity, and not studying until focus returns.
      if (message.focused === false) {

        handleFocusLost(sender.tab?.id).catch(
          logUnlessSignedOut("Focus loss")
        );

        return;

      }


      if (
        currentContext
      ) {

        handleUserActivity(

          currentContext,

          message.activityType ??
            "activity"

        ).catch(error => {

          console.error(
            "Activity error:",
            error
          );

        });

      }


      return;

    }


    // ==============================================
    // LEETCODE SUBMISSION
    // ==============================================

    if (
      message.type === "LEETCODE_SUBMISSION" &&
      message.context &&
      message.submissionResult
    ) {

      if (
        sender.tab?.id &&
        currentTabId !== null &&
        sender.tab.id !== currentTabId
      ) {

        return;

      }


      currentContext = message.context;


      handleUserActivity(
        message.context,
        "submission",
        message.submissionResult
      ).catch(error => {

        console.error(
          "Submission tracking error:",
          error
        );

      });


      return;

    }


    // ==============================================
    // CURRENT EDITOR CODE (MEMORY ONLY)
    // ==============================================

    if (
      message.type === "CODE_SNAPSHOT" &&
      message.context &&
      message.code &&
      sender.tab?.id !== undefined
    ) {

      if (
        currentTabId !== null &&
        sender.tab.id !== currentTabId
      ) {

        return;

      }


      codeByTab.set(
        sender.tab.id,
        {
          code:
            message.code,
          updatedAt:
            Date.now()
        }
      );


      currentContext =
        message.context;


      return;

    }


    // ==============================================
    // GET CONTEXT
    // ==============================================

    if (
      message.type ===
      "GET_CURRENT_CONTEXT"
    ) {

      updateContextFromActiveTab()

        .then(() => {

          sendResponse(
            currentContext
          );

        })

        .catch(error => {

          console.error(
            "Context lookup error:",
            error
          );


          sendResponse(
            currentContext
          );

        });


      return true;

    }


    // ==============================================
    // GET SESSION
    // ==============================================

    if (
      message.type ===
      "GET_CURRENT_SESSION"
    ) {

      getCurrentSession()

        .then(session => {

          sendResponse(
            session
          );

        })

        .catch(error => {

          console.error(
            "Session lookup error:",
            error
          );


          sendResponse(
            null
          );

        });


      return true;

    }


    // ==============================================
    // START SESSION
    // ==============================================

    if (
      message.type ===
      "START_SESSION"
    ) {

      handleStartSession()

        .then(result => {

          sendResponse(
            result
          );

        })

        .catch(error => {

          console.error(
            "Start session error:",
            error
          );


          sendResponse({

            success:
              false,

            error:
              "Could not start session."

          });

        });


      return true;

    }


    // ==============================================
    // PAUSE / RESUME
    // ==============================================

    if (
      message.type === "PAUSE_SESSION" ||
      message.type === "RESUME_SESSION"
    ) {

      (message.type === "PAUSE_SESSION" ? pauseSession() : resumeSession())
        .then(session => {

          sendResponse({ success: true, session });

        })
        .catch(error => {

          console.error(
            "Pause/resume error:",
            error
          );

          sendResponse({ success: false });

        });


      return true;

    }


    // ==============================================
    // END SESSION
    // ==============================================

    if (
      message.type ===
      "END_SESSION"
    ) {

      handleEndSession()

        .then(result => {

          sendResponse(
            result
          );

        })

        .catch(error => {

          console.error(
            "End session error:",
            error
          );


          sendResponse({

            success:
              false,

            error:
              "Could not end session."

          });

        });


      return true;

    }


    // ==============================================
    // GET NUDGE
    // ==============================================

    if (
      message.type ===
      "GET_CURRENT_NUDGE"
    ) {

      getCurrentNudge()
        .then(nudge => {

          sendResponse(
            nudge
          );

        })
        .catch(error => {

          console.error(
            "Nudge lookup error:",
            error
          );

          sendResponse(
            null
          );

        });


      return true;

    }


    // ==============================================
    // AUTH
    // ==============================================

    if (
      message.type === "GET_AUTH_STATE"
    ) {

      getAuthState()
        .then(user => {

          sendResponse({ success: true, user });

        })
        .catch(() => {

          sendResponse({ success: true, user: null });

        });


      return true;

    }


    if (
      message.type === "AUTH_SIGNUP" ||
      message.type === "AUTH_LOGIN" ||
      message.type === "AUTH_GOOGLE"
    ) {

      const attempt =
        message.type === "AUTH_SIGNUP"
          ? signup(
              message.name ?? "",
              message.email ?? "",
              message.password ?? ""
            )
          : message.type === "AUTH_LOGIN"
            ? login(
                message.email ?? "",
                message.password ?? ""
              )
            : loginWithGoogle();


      attempt
        .then(user => {

          sendResponse({ success: true, user });

        })
        .catch(error => {

          sendResponse({
            success: false,
            error:
              error instanceof Error
                ? error.message
                : "Sign-in failed."
          });

        });


      return true;

    }


    if (
      message.type === "AUTH_LOGOUT"
    ) {

      logout()
        .then(() => {

          currentContext = null;

          codeByTab.clear();

          sendResponse({ success: true });

        });


      return true;

    }


    // ==============================================
    // DISMISS NUDGE
    // ==============================================

    if (
      message.type ===
      "DISMISS_NUDGE" &&
      message.nudgeId
    ) {

      dismissNudge(
        message.nudgeId
      )
        .then(() => {

          sendResponse({ success: true });

        })
        .catch(error => {

          console.error(
            "Dismiss nudge error:",
            error
          );

          sendResponse({ success: false });

        });


      return true;

    }


    // ==============================================
    // AI MENTOR
    // ==============================================

    if (
      message.type === "ASK_AI_MENTOR"
    ) {

      getMentorGuidance(
        message.question
      )
        .then(response => {

          sendResponse(response);

        })
        .catch(error => {

          console.error(
            "AI mentor error:",
            error
          );


          sendResponse({

            success: false,

            error:
              "The mentor could not respond right now."

          });

        });


      return true;

    }

  }

);


// --------------------------------------------------
// PAGE CONTEXT HANDLER
// --------------------------------------------------

async function handlePageContext(
  context: PageContext
): Promise<void> {

  if (!await getToken()) {

    return;

  }


  if (
    context.website ===
    "unknown"
  ) {

    return;

  }


  // The backend starts a session if there is none, leaves an ended
  // session ended, and otherwise follows the learner to the new page.
  // One call, so a burst of page events can't create duplicate sessions.
  await updateSession(

    context.website,

    context.title,

    context.url

  );

}


// --------------------------------------------------
// USER ACTIVITY HANDLER
// --------------------------------------------------

async function handleUserActivity(
  context: PageContext,
  activityType: string,
  submissionResult?: string
): Promise<void> {

  if (!await getToken()) {

    return;

  }


  const session =
    await getCurrentSession();


  if (!session) {

    return;

  }


  if (!session.isActive) {

    return;

  }


  // Only count activity from the visible
  // study page.

  if (!pageVisible) {

    return;

  }


  // Ask Chrome whether the computer is
  // currently active.

  const chromeState =
    await chrome.idle.queryState(
      15
    );


  if (
    chromeState !==
    "active"
  ) {

    return;

  }


  // The page still sends heartbeats while another application is in
  // front. That is not studying.
  if (!await userIsInBrowser()) {

    return;

  }


  const result =
    await recordActivity(

      context.website,

      context.title,

      context.url,

      activityType,

      {
        problemSlug:
          context.problemSlug,

        difficulty:
          context.difficulty,

        topics:
          context.topics,

        programmingLanguage:
          context.programmingLanguage,

        submissionResult,

        pageKind:
          context.pageKind
      }

    );


  if (!result) {

    return;

  }


  // A break suggestion or a concept reminder: also show it on the page.
  if (
    result.notice &&
    currentTabId !== null
  ) {

    showNote(
      currentTabId,
      result.notice.id,
      result.notice.message
    );

  }


  console.log(
    "🟢 STUDY ACTIVITY:",
    activityType,
    "|",
    context.title
  );


  if (!result.nudgeState) {

    return;

  }


  await evaluateCurrentNudge(
    result.session,
    result.nudgeState,
    context.problemSlug
  );


  await maybeGenerateProactiveGuidance(
    result.session,
    result.nudgeState,
    submissionResult
  );

}


// --------------------------------------------------
// YOUTUBE PROGRESS HANDLER
// --------------------------------------------------

async function handleYouTubeProgress(
  report: VideoReport,
  tabId?: number,
  fromCurrentTab = true
): Promise<void> {

  if (
    !report.video.educational ||
    !await getToken()
  ) {

    return;

  }


  const session =
    await getCurrentSession();


  if (!session?.isActive) {

    return;

  }


  // Watching a lecture involves little mouse or keyboard input, so
  // Chrome's idle check would call it idle. A playing educational video
  // on screen, in the browser the learner is using, counts as studying.
  if (
    fromCurrentTab &&
    report.playing &&
    report.visible &&
    currentContext &&
    (report.focused || panelHasFocus()) &&
    await isBrowserFocused()
  ) {

    await recordActivity(
      "youtube",
      currentContext.title,
      currentContext.url,
      "video_watch"
    );

  }


  await postVideoProgress(
    report.video,
    report.delta,
    report.positionS,
    report.event,
    tabId
  );

}


async function postVideoProgress(
  video: VideoInfo,
  delta: VideoDelta,
  positionS: number,
  event: VideoReport["event"],
  tabId?: number
): Promise<void> {

  const result =
    await api<{
      watch: VideoWatch | null;
      nudge: { id: string; type: string; message: string } | null;
    }>(
      "POST",
      "/youtube/progress",
      {
        video,
        delta,
        positionS,
        event
      }
    );


  if (
    !result.nudge ||
    tabId === undefined
  ) {

    return;

  }


  // A recall prompt comes with a question about what was just watched.
  // Other notes (focus, skipping...) are shown as they are.
  if (result.nudge.type === "ACTIVE_RECALL") {

    offerQuiz(
      tabId,
      result.nudge.id,
      result.nudge.message
    ).catch(logUnlessSignedOut("Quiz"));

    return;

  }

  showNote(
    tabId,
    result.nudge.id,
    result.nudge.message
  );

}


function showNote(
  tabId: number,
  nudgeId: string,
  message: string,
  loading = false
): void {

  // Also shown on the video page, in case the side panel is closed.
  chrome.tabs.sendMessage(
    tabId,
    {
      type: "SHOW_RECALL_PROMPT",
      nudgeId,
      message,
      loading
    }
  ).catch(() => {

    // The tab was closed or navigated away.

  });

}


// Nudges whose question is already being prepared.
const quizzesInFlight =
  new Set<string>();


// Shows the recall prompt straight away, then replaces it with a quiz
// question about the last few minutes of the video when it is ready.
async function offerQuiz(
  tabId: number,
  nudgeId: string,
  message: string
): Promise<void> {

  if (quizzesInFlight.has(nudgeId)) {

    return;

  }

  quizzesInFlight.add(nudgeId);

  showNote(tabId, nudgeId, message, true);

  try {

    const where =
      await chrome.tabs.sendMessage(
        tabId,
        { type: "GET_TRANSCRIPT_EXCERPT" }
      ) as {
        videoId: string;
        positionS: number;
        excerpt: { startS: number; endS: number; text: string } | null;
      } | null;

    if (!where) {

      throw new Error("The video page did not answer.");

    }

    const { quiz } =
      await api<{ quiz: QuizQuestion }>(
        "POST",
        "/youtube/quiz",
        {
          videoId: where.videoId,
          nudgeId,
          positionS: where.positionS,
          excerpt: where.excerpt ?? undefined
        }
      );

    chrome.tabs.sendMessage(
      tabId,
      {
        type: "SHOW_QUIZ",
        nudgeId,
        message,
        quiz
      }
    ).catch(() => {

      // The tab was closed or navigated away.

    });

  } catch (error) {

    // No question this time (rate limit, offline...): the plain recall
    // prompt still stands.
    logUnlessSignedOut("Quiz question")(error);

    showNote(tabId, nudgeId, message);

  } finally {

    quizzesInFlight.delete(nudgeId);

  }

}


// Records a tab or window change against what the tab was being used to
// study: the video playing in it, or the LeetCode problem open in it.
async function recordVideoEvent(
  tabId: number,
  counts: Partial<Pick<VideoDelta, "tabChanges" | "windowChanges">>,
  event: "visibility" | "blur"
): Promise<void> {

  if (!await getToken()) {

    return;

  }


  const page =
    await chrome.tabs.sendMessage(
      tabId,
      { type: "GET_PAGE_INFO" }
    ).catch(() => null) as {
      website: string;
      title: string;
      problemSlug?: string;
      video: VideoInfo | null;
    } | null;


  if (!page) {

    return;

  }


  const session =
    await getCurrentSession();


  if (!session?.isActive || session.pausedByUser) {

    return;

  }


  // Watching a lecture: counted on the video.
  if (page.video?.educational) {

    await postVideoProgress(
      page.video,
      { ...emptyDelta(), ...counts },
      0,
      event,
      tabId
    );

    return;

  }


  // Working on a LeetCode problem: counted on the problem.
  if (
    page.website === "leetcode" &&
    page.problemSlug
  ) {

    const nudge =
      await recordDistraction({
        kind: counts.tabChanges ? "tab" : "window",
        website: page.website,
        problemSlug: page.problemSlug,
        title: page.title
      });

    if (nudge) {

      showNote(tabId, nudge.id, nudge.message);

    }

  }

}


// --------------------------------------------------
// START SESSION
// --------------------------------------------------

async function handleStartSession() {

  await updateContextFromActiveTab();


  if (!currentContext) {

    return {

      success:
        false,

      error:
        "No supported study page detected."

    };

  }


  if (
    currentContext.website ===
    "unknown"
  ) {

    return {

      success:
        false,

      error:
        "This website is not supported."

    };

  }


  const session =
    await startSession(

      currentContext.website,

      currentContext.title,

      currentContext.url

    );


  return {

    success:
      true,

    session

  };

}


// --------------------------------------------------
// END SESSION
// --------------------------------------------------

async function handleEndSession() {

  const session =
    await endSession();


  return {

    success:
      true,

    session

  };

}


// --------------------------------------------------
// NUDGE ENGINE
// --------------------------------------------------

async function evaluateCurrentNudge(
  session: StudySession,
  state: NudgeState,
  problemSlug?: string
): Promise<void> {

  if (
    !session.isActive ||
    session.userState !== "active"
  ) {

    return;

  }


  if (
    !canShowNudge(
      state.lastNudgeAt ?? undefined
    )
  ) {

    return;

  }


  const nudge =
    evaluateNudge({

      website:
        session.website,

      pageTitle:
        session.currentPage,

      activeTime:
        session.totalActiveTime,

      userState:
        session.userState,

      failedAttempts:
        state.failedAttempts,

      personal:
        state.personal ?? null

    });


  if (!nudge) {

    return;

  }


  await saveNudge(
    nudge,
    problemSlug
  );


  console.log(
    "💡 MENTOR NUDGE:",
    nudge.message
  );

}


// --------------------------------------------------
// AI MENTOR
// --------------------------------------------------

interface MentorResponse {

  success: boolean;

  guidance?: string;

  error?: string;

}


// The mentor backend holds the OpenRouter API key and prompt, and
// reads recent activity from PostgreSQL itself. The extension only
// sends what it can see on the page.
async function getMentorGuidance(
  question?: string,
  code?: string
): Promise<MentorResponse> {

  await updateContextFromActiveTab();


  if (
    !currentContext ||
    currentContext.website === "unknown"
  ) {

    return {

      success: false,

      error:
        "Open a study page (LeetCode, an educational video, or a supported site) before asking the mentor."

    };

  }


  const context =
    currentContext;


  try {

    // A LeetCode problem: hints about the problem and the current code.
    if (context.website === "leetcode") {

      return await api<MentorResponse>(
        "POST",
        "/mentor",
        {
          platform: "leetcode",
          problem: context.title,
          slug: context.problemSlug,
          difficulty: context.difficulty,
          topics: context.topics,
          programmingLanguage: context.programmingLanguage,
          currentCode:
            code ??
            (currentTabId !== null ? codeByTab.get(currentTabId)?.code : undefined),
          studentQuestion: question
        }
      );

    }


    // A video: explanation from the transcript around where they are.
    if (context.website === "youtube") {

      if (!context.video?.educational || currentTabId === null) {

        return {
          success: false,
          error: "Open an educational video to ask about it."
        };

      }

      const where =
        await chrome.tabs.sendMessage(
          currentTabId,
          { type: "GET_TRANSCRIPT_EXCERPT" }
        ).catch(() => null) as {
          positionS: number;
          excerpt: { text: string } | null;
        } | null;

      return await api<MentorResponse>(
        "POST",
        "/mentor",
        {
          platform: "youtube",
          title: context.video.title,
          topics: context.video.topics,
          excerpt: where?.excerpt?.text,
          positionS: where?.positionS,
          studentQuestion: question
        }
      );

    }


    // Any other supported site: the selected text or the page's main text.
    const page =
      currentTabId !== null
        ? await chrome.tabs.sendMessage(
          currentTabId,
          { type: "GET_PAGE_EXCERPT" }
        ).catch(() => null) as { excerpt: string } | null
        : null;

    return await api<MentorResponse>(
      "POST",
      "/mentor",
      {
        platform: "web",
        site: context.website,
        title: context.title,
        topics: context.topics,
        excerpt: page?.excerpt || undefined,
        studentQuestion: question
      }
    );

  } catch (error) {

    console.error(
      `Mentor backend request failed (${BACKEND_URL}):`,
      error
    );


    return {

      success: false,

      error:
        error instanceof Error && error.message
          ? error.message
          : "Could not reach the mentor backend. Make sure it is running."

    };

  }

}


const PROACTIVE_COOLDOWN =
  8 * 60 * 1000;


// After a failed AI call, wait a shorter time before retrying.
const PROACTIVE_ERROR_COOLDOWN =
  2 * 60 * 1000;


async function maybeGenerateProactiveGuidance(
  session: StudySession,
  state: NudgeState,
  submissionResult?: string
): Promise<void> {

  if (
    !session.isActive ||
    session.userState !== "active" ||
    currentContext?.website !== "leetcode" ||
    currentTabId === null
  ) {

    return;

  }


  const codeSnapshot =
    codeByTab.get(
      currentTabId
    );


  if (!codeSnapshot) {

    return;

  }


  const activeMinutes =
    session.totalActiveTime / 60000;


  const hasFailedSubmission =
    submissionResult !== undefined &&
    submissionResult !== "submitted" &&
    submissionResult !== "accepted";


  const hasStoppedEditing =
    Date.now() - codeSnapshot.updatedAt >=
    2 * 60 * 1000;


  if (
    !hasFailedSubmission &&
    !(activeMinutes >= 8 && hasStoppedEditing)
  ) {

    return;

  }


  const cooldown =
    state.lastProactiveType === "AI_MENTOR_ERROR"
      ? PROACTIVE_ERROR_COOLDOWN
      : PROACTIVE_COOLDOWN;


  if (
    state.lastProactiveAt &&
    Date.now() - state.lastProactiveAt < cooldown
  ) {

    return;

  }


  const guidance =
    await getMentorGuidance(
      hasFailedSubmission
        ? "I just received an unsuccessful submission. Give one targeted debugging step."
        : "The student has paused code editing while working on this problem. Give one useful next step.",
      codeSnapshot.code
    );


  const succeeded =
    guidance.success &&
    Boolean(guidance.guidance);


  await saveNudge(
    {
      type:
        succeeded
          ? "AI_MENTOR"
          : "AI_MENTOR_ERROR",
      message:
        succeeded
          ? guidance.guidance!
          : guidance.error ??
            "The mentor could not generate guidance.",
      priority:
        "medium"
    },
    currentContext.problemSlug
  );

}
