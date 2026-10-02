import {
  getCurrentSession
} from "../storage/storage";

import {
  getActivities
} from "../storage/storage";

import {
  startSession,
  updateSession,
  recordActivity,
  setUserState,
  endSession
} from "../core/sessionManager";

import {
  evaluateNudge,
  canShowNudge
} from "../core/nudgeEngine";


// --------------------------------------------------
// TYPES
// --------------------------------------------------

interface PageContext {

  title: string;

  url: string;

  website: string;

  timestamp: number;

  problemSlug?: string;

  difficulty?: string;

  topics?: string[];

  programmingLanguage?: string;

}


interface Message {

  type: string;

  context?: PageContext;

  activityType?: string;

  timestamp?: number;

  visible?: boolean;

  submissionResult?: string;

  question?: string;

  code?: string;

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
// WEBSITE FROM URL
// --------------------------------------------------

function getWebsiteFromUrl(
  url?: string
): string {

  if (!url) {

    return "unknown";

  }


  try {

    const hostname =
      new URL(url).hostname;


    if (
      hostname === "leetcode.com" ||
      hostname.endsWith(".leetcode.com")
    ) {

      return "leetcode";

    }


    if (
      hostname === "youtube.com" ||
      hostname === "www.youtube.com" ||
      hostname.endsWith(".youtube.com")
    ) {

      return "youtube";

    }

  } catch {

    return "unknown";

  }


  return "unknown";

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
    getWebsiteFromUrl(
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
            currentContext.programmingLanguage
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
    await chrome.idle.queryState(15) === "active"
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


    await chrome.storage.local.set({

      studySettings: {

        trackingEnabled:
          true

      }

    });

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

    currentTabId =
      activeInfo.tabId;


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
      getWebsiteFromUrl(
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


    if (chromeState === "active") {

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
        currentContext
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

      chrome.storage.local.get(
        "currentNudge"
      )
        .then(result => {

          sendResponse(
            result.currentNudge ??
              null
          );

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

  if (
    context.website ===
    "unknown"
  ) {

    return;

  }


  const session =
    await getCurrentSession();


  // ----------------------------------------------
  // NO SESSION
  // ----------------------------------------------

  if (!session) {

    await startSession(

      context.website,

      context.title,

      context.url

    );


    return;

  }


  // ----------------------------------------------
  // ENDED SESSION
  // ----------------------------------------------

  if (
    !session.isActive
  ) {

    return;

  }


  // ----------------------------------------------
  // ACTIVE SESSION
  // ----------------------------------------------

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


  const updatedSession =
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

        submissionResult
      }

    );


  if (!updatedSession) {

    return;

  }


  console.log(
    "🟢 STUDY ACTIVITY:",
    activityType,
    "|",
    context.title
  );


  await evaluateCurrentNudge();


  await maybeGenerateProactiveGuidance(
    submissionResult
  );

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


  await chrome.storage.local.remove(
    "currentNudge"
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


  await chrome.storage.local.remove(
    "currentNudge"
  );


  return {

    success:
      true,

    session

  };

}


// --------------------------------------------------
// NUDGE ENGINE
// --------------------------------------------------

async function evaluateCurrentNudge():
  Promise<void> {

  const session =
    await getCurrentSession();


  if (
    !session ||
    !session.isActive
  ) {

    return;

  }


  if (
    session.userState !==
    "active"
  ) {

    return;

  }


  const storage =
    await chrome.storage.local.get([

      "lastNudgeTime",

      "currentNudge"

    ]);


  const lastNudgeTime =
    storage.lastNudgeTime as
      | number
      | undefined;


  if (
    !canShowNudge(
      lastNudgeTime
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
        session.userState

    });


  if (!nudge) {

    return;

  }


  await chrome.storage.local.set({

    currentNudge:
      nudge,

    lastNudgeTime:
      Date.now()

  });


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


async function getMentorGuidance(
  question?: string,
  code?: string
): Promise<MentorResponse> {

  const apiKey =
    import.meta.env.VITE_OPENAI_API_KEY;


  if (!apiKey) {

    return {

      success: false,

      error:
        "Add VITE_OPENAI_API_KEY to .env, then rebuild and reload the extension."

    };

  }


  await updateContextFromActiveTab();


  if (
    !currentContext ||
    currentContext.website !== "leetcode"
  ) {

    return {

      success: false,

      error:
        "Open a LeetCode problem before asking the mentor."

    };

  }


  const session =
    await getCurrentSession();


  const activities =
    await getActivities();


  const recentSignals =
    activities
      .filter(activity =>
        activity.website === "leetcode" &&
        activity.problemSlug === currentContext?.problemSlug
      )
      .slice(-25)
      .map(activity => ({
        type: activity.type,
        at: new Date(activity.timestamp).toISOString(),
        language: activity.programmingLanguage,
        submissionResult: activity.submissionResult
      }));


  const learnerContext = {
    problem: currentContext.title,
    slug: currentContext.problemSlug,
    difficulty: currentContext.difficulty,
    topics: currentContext.topics,
    programmingLanguage: currentContext.programmingLanguage,
    activeMinutes: Math.floor(
      (session?.totalActiveTime ?? 0) / 60000
    ),
    recentSignals,
    currentCode:
      code,
    studentQuestion:
      question?.trim() ||
      "Give me the single most useful next step."
  };


  const response =
    await fetch(
      "https://openrouter.ai/api/v1/responses",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model:
            import.meta.env.VITE_OPENAI_MODEL || "gpt-5-mini",
          instructions: [
            "You are a concise Socratic programming mentor.",
            "Use the supplied metadata and activity signals to guide the student.",
            "Do not provide a full solution, full code, or final algorithm unless the student explicitly asks for it.",
            "Prefer one concrete next step, a clarifying question, or a small hint.",
            "Acknowledge submission outcomes when relevant.",
            "When currentCode is supplied, review it only to identify the next debugging or reasoning step.",
            "Do not provide a full solution or replacement implementation."
          ].join(" "),
          input: JSON.stringify(learnerContext),
          max_output_tokens: 350
        })
      }
    );


  if (!response.ok) {

    const errorBody =
      await response.text();


    console.error(
      "OpenRouter API response:",
      response.status,
      errorBody
    );


    return {

      success: false,

      error:
        "The mentor request failed. Check your OpenRouter API key, model, and credits."

    };

  }


  const data =
    await response.json() as {
      output_text?: string;
    };


  if (!data.output_text) {

    return {

      success: false,

      error:
        "The mentor returned an empty response. Please try again."

    };

  }


  return {

    success: true,
    guidance:
      data.output_text
  };

}


async function maybeGenerateProactiveGuidance(
  submissionResult?: string
): Promise<void> {

  const session =
    await getCurrentSession();


  if (
    !session?.isActive ||
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


  const storage =
    await chrome.storage.local.get([
      "lastProactiveMentorTime",
      "lastProactiveMentorProblem"
    ]);


  const lastInsight =
    storage.lastProactiveMentorTime as
      | number
      | undefined;


  const lastProblem =
    storage.lastProactiveMentorProblem as
      | string
      | undefined;


  if (
    lastProblem === currentContext.problemSlug &&
    lastInsight &&
    Date.now() - lastInsight < 8 * 60 * 1000
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


  if (!guidance.success || !guidance.guidance) {

    await chrome.storage.local.set({

      currentNudge: {
        id:
          `mentor-error-${Date.now()}`,
        type:
          "AI_MENTOR_ERROR",
        message:
          guidance.error ??
          "The mentor could not generate guidance.",
        priority:
          "medium",
        createdAt:
          Date.now()
      }

    });

    return;

  }


  await chrome.storage.local.set({

    currentNudge: {
      id:
        `mentor-${Date.now()}`,
      type:
        "AI_MENTOR",
      message:
        guidance.guidance,
      priority:
        "medium",
      createdAt:
        Date.now()
    },

    lastProactiveMentorTime:
      Date.now(),

    lastProactiveMentorProblem:
      currentContext.problemSlug

  });

}
