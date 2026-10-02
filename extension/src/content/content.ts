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


type ActivityType =
  | "mousemove"
  | "mousedown"
  | "keydown"
  | "scroll"
  | "touchstart"
  | "visibility"
  | "heartbeat"
  | "code_edit";


type SubmissionResult =
  | "submitted"
  | "accepted"
  | "wrong_answer"
  | "time_limit_exceeded"
  | "runtime_error"
  | "compile_error"
  | "memory_limit_exceeded"
  | "failed";


// --------------------------------------------------
// WEBSITE DETECTION
// --------------------------------------------------

function getWebsite(): string {

  const hostname =
    window.location.hostname;


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


  return "unknown";

}


interface LeetCodeMetadata {

  problemSlug?: string;

  difficulty?: string;

  topics?: string[];

}


// --------------------------------------------------
// LEETCODE METADATA
// --------------------------------------------------
//
// The public problem API is the primary source because LeetCode's
// visible page markup changes frequently. DOM detection fills in
// the currently selected editor language.

const LANGUAGE_NAMES = new Set([
  "C++", "C", "C#", "Dart", "Elixir", "Erlang", "Go",
  "Java", "JavaScript", "Kotlin", "MySQL", "MS SQL Server",
  "Objective-C", "Oracle", "PHP", "PostgreSQL", "Python",
  "Python3", "Racket", "Ruby", "Rust", "Scala", "Swift",
  "TypeScript"
]);


let leetCodeMetadata: LeetCodeMetadata =
  {};


let metadataSlug:
  string | undefined;


function getProblemSlug():
  string | undefined {

  return window.location.pathname.match(
    /^\/problems\/([^/]+)/
  )?.[1];

}


async function refreshLeetCodeMetadata():
  Promise<void> {

  const problemSlug =
    getProblemSlug();


  if (
    !problemSlug ||
    problemSlug === metadataSlug
  ) {

    return;

  }


  metadataSlug =
    problemSlug;


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
              titleSlug:
                problemSlug
            },
            query: `query questionData($titleSlug: String!) {
              question(titleSlug: $titleSlug) {
                difficulty
                topicTags { name }
              }
            }`
          })
        }
      );


    if (!response.ok) {

      metadataSlug =
        undefined;

      return;

    }


    const data =
      await response.json() as {
        data?: {
          question?: {
            difficulty?: string;
            topicTags?: Array<{
              name?: string;
            }>;
          };
        };
      };


    const question =
      data.data?.question;


    if (!question) {

      metadataSlug =
        undefined;

      return;

    }


    leetCodeMetadata = {
      problemSlug,
      difficulty:
        question.difficulty,
      topics:
        question.topicTags
          ?.map(tag => tag.name)
          .filter((name): name is string => Boolean(name))
    };


    sendPageContext();

  } catch {

    // The DOM fallback remains available when the request fails.

    metadataSlug =
      undefined;

  }

}


function getProgrammingLanguage():
  string | undefined {

  // In newer LeetCode layouts the selected language is plain text,
  // not a button. Read the visible text node in the editor header.
  const textWalker =
    document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT
    );


  let textNode =
    textWalker.nextNode();


  while (textNode) {

    const language =
      textNode.textContent?.trim();

    const element =
      textNode.parentElement;


    if (
      language &&
      LANGUAGE_NAMES.has(language) &&
      element
    ) {

      const bounds =
        element.getBoundingClientRect();

      const styles =
        window.getComputedStyle(element);


      if (
        bounds.width > 0 &&
        bounds.height > 0 &&
        styles.visibility !== "hidden" &&
        styles.display !== "none"
      ) {

        return language;

      }

    }


    textNode =
      textWalker.nextNode();

  }

  const selector = [
    "[data-cy='lang-select']",
    "[data-testid*='lang']",
    "[aria-label*='language' i]",
    ".ant-select-selection-item",
    "button",
    "[role=button]"
  ].join(", ");


  const labels =
    Array.from(document.querySelectorAll<HTMLElement>(selector))
      .filter(node => {

        const bounds =
          node.getBoundingClientRect();


        const styles =
          window.getComputedStyle(node);


        return (
          bounds.width > 0 &&
          bounds.height > 0 &&
          styles.visibility !== "hidden" &&
          styles.display !== "none"
        );

      })
      .flatMap(node => [
        node.innerText,
        node.getAttribute("aria-label") ?? "",
        node.getAttribute("data-cy") ?? ""
      ])
      .map(label => label.trim());


  const matchingLabels =
    Array.from(LANGUAGE_NAMES)
      .filter(language =>
        labels.some(label =>
          label === language ||
          label.startsWith(`${language}\n`) ||
          label.startsWith(`${language} `)
        )
      )
      .sort((first, second) =>
        second.length - first.length
      );


  if (matchingLabels[0]) {

    return matchingLabels[0];

  }


  const pageText =
    document.body.innerText;


  return Array.from(LANGUAGE_NAMES)
    .filter(language =>
      new RegExp(
        `\\b${language.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`
      ).test(pageText)
    )
    .sort((first, second) =>
      second.length - first.length
    )[0];

}


function getLeetCodeMetadata():
  Omit<PageContext, "title" | "url" | "website" | "timestamp"> {

  if (getWebsite() !== "leetcode") {

    return {};

  }


  const problemSlug =
    getProblemSlug();


  const textNodes =
    Array.from(document.querySelectorAll<HTMLElement>(
      "h1, h2, h3, div, span, a"
    ));


  const difficulty =
    textNodes
      .map(node => node.innerText.trim())
      .find(text => ["Easy", "Medium", "Hard"].includes(text));


  const topics =
    Array.from(
      document.querySelectorAll<HTMLAnchorElement>(
        'a[href*="/tag/"]'
      )
    )
      .map(link => link.innerText.trim())
      .filter(Boolean)
      .filter((topic, index, values) =>
        values.indexOf(topic) === index
      );


  const languageCandidates =
    Array.from(document.querySelectorAll<HTMLElement>(
      "button, [role=button], [aria-label*='language' i]"
    ))
      .map(node => node.innerText.trim())
      .filter(text => LANGUAGE_NAMES.has(text));


  return {
    problemSlug:
      leetCodeMetadata.problemSlug ??
      problemSlug,
    difficulty:
      leetCodeMetadata.difficulty ??
      difficulty,
    topics:
      leetCodeMetadata.topics ??
      topics,
    programmingLanguage:
      getProgrammingLanguage() ??
      languageCandidates[0]
  };

}


// --------------------------------------------------
// PAGE CONTEXT
// --------------------------------------------------

function getPageContext():
  PageContext {

  return {

    title:
      document.title ||
      "Unknown Page",

    url:
      window.location.href,

    website:
      getWebsite(),

    timestamp:
      Date.now(),

    ...getLeetCodeMetadata()

  };

}


// --------------------------------------------------
// CODE EDITING AND SUBMISSIONS
// --------------------------------------------------

function isCodeEditorTarget(
  target: EventTarget | null
): boolean {

  if (!(target instanceof HTMLElement)) {

    return false;

  }


  return Boolean(
    target.closest(
      ".monaco-editor, [data-mode='edit'], textarea"
    )
  );

}


function getEditorCode():
  string | undefined {

  const monacoCode =
    Array.from(
      document.querySelectorAll<HTMLElement>(
        ".monaco-editor .view-lines"
      )
    )
      .map(editor => editor.innerText)
      .join("\n")
      .trim();


  if (monacoCode) {

    return monacoCode.slice(0, 12000);

  }


  const textarea =
    document.querySelector<HTMLTextAreaElement>(
      "textarea"
    );


  return textarea?.value
    .trim()
    .slice(0, 12000) || undefined;

}


let lastCodeSnapshot =
  "";


function sendCodeSnapshot(): void {

  const code =
    getEditorCode();


  if (!code) {

    return;

  }


  if (code === lastCodeSnapshot) {

    return;

  }


  lastCodeSnapshot =
    code;


  try {

    chrome.runtime.sendMessage({

      type:
        "CODE_SNAPSHOT",

      code,

      context:
        getPageContext()

    }).catch(() => {

      // Extension may have been reloaded.

    });

  } catch {

    // Ignore invalidated extension context.

  }

}


function sendSubmission(
  submissionResult: SubmissionResult
): void {

  try {

    chrome.runtime.sendMessage({

      type:
        "LEETCODE_SUBMISSION",

      submissionResult,

      context:
        getPageContext()

    }).catch(() => {

      // Extension may have been reloaded.

    });

  } catch {

    // Ignore invalidated extension context.

  }

}


function getSubmissionResult():
  SubmissionResult | null {

  const pageText =
    document.body.innerText;


  if (/\bWrong Answer\b/.test(pageText)) {

    return "wrong_answer";

  }

  if (/\bTime Limit Exceeded\b/.test(pageText)) {

    return "time_limit_exceeded";

  }

  if (/\bRuntime Error\b/.test(pageText)) {

    return "runtime_error";

  }

  if (/\bCompile Error\b/.test(pageText)) {

    return "compile_error";

  }

  if (/\bMemory Limit Exceeded\b/.test(pageText)) {

    return "memory_limit_exceeded";

  }

  if (/\bAccepted\b/.test(pageText)) {

    return "accepted";

  }

  return null;

}


// --------------------------------------------------
// SEND PAGE CONTEXT
// --------------------------------------------------

function sendPageContext(): void {

  try {

    chrome.runtime.sendMessage({

      type:
        "PAGE_CONTEXT",

      context:
        getPageContext()

    }).catch(() => {

      // Extension may have been reloaded.

    });

  } catch {

    // Ignore invalidated extension context.

  }

}


// --------------------------------------------------
// ACTIVITY THROTTLE
// --------------------------------------------------

let lastActivitySent =
  0;


const ACTIVITY_THROTTLE =
  3000;


// --------------------------------------------------
// SEND ACTIVITY
// --------------------------------------------------

function sendActivity(
  activityType: ActivityType,
  force = false
): void {

  const now =
    Date.now();


  if (
    !force &&
    now - lastActivitySent <
      ACTIVITY_THROTTLE
  ) {

    return;

  }


  lastActivitySent =
    now;


  try {

    chrome.runtime.sendMessage({

      type:
        "USER_ACTIVITY",

      activityType,

      timestamp:
        now,

      visible:
        document.visibilityState ===
        "visible",

      context:
        getPageContext()

    }).catch(() => {

      // Extension was reloaded.

    });

  } catch {

    // Ignore invalidated context.

  }

}


// --------------------------------------------------
// MOUSE
// --------------------------------------------------

document.addEventListener(
  "mousemove",
  () => {

    sendActivity(
      "mousemove"
    );

  },
  {
    passive: true,
    capture: true
  }
);


// --------------------------------------------------
// CLICK
// --------------------------------------------------

document.addEventListener(
  "mousedown",
  () => {

    sendActivity(
      "mousedown"
    );

  },
  {
    passive: true,
    capture: true
  }
);


// --------------------------------------------------
// KEYBOARD
// --------------------------------------------------

document.addEventListener(
  "keydown",
  () => {

    sendActivity(
      "keydown"
    );

  },
  {
    capture: true
  }
);


// --------------------------------------------------
// SCROLL
// --------------------------------------------------

document.addEventListener(
  "scroll",
  () => {

    sendActivity(
      "scroll"
    );

  },
  {
    passive: true,
    capture: true
  }
);


// --------------------------------------------------
// TOUCH
// --------------------------------------------------

document.addEventListener(
  "touchstart",
  () => {

    sendActivity(
      "touchstart"
    );

  },
  {
    passive: true,
    capture: true
  }
);


// --------------------------------------------------
// LEETCODE EDITOR AND SUBMISSION EVENTS
// --------------------------------------------------

document.addEventListener(
  "input",
  event => {

    if (
      getWebsite() === "leetcode" &&
      isCodeEditorTarget(event.target)
    ) {

      sendActivity(
        "code_edit"
      );

      sendCodeSnapshot();

    }

  },
  {
    capture: true
  }
);


let lastSubmissionResult:
  SubmissionResult | null = null;


let submissionResultWatchTimer:
  number | undefined;


function watchForSubmissionResult(): void {

  if (submissionResultWatchTimer !== undefined) {

    window.clearInterval(
      submissionResultWatchTimer
    );

  }


  let attempts = 0;


  submissionResultWatchTimer =
    window.setInterval(() => {

      attempts += 1;


      const submissionResult =
        getSubmissionResult();


      if (
        submissionResult &&
        submissionResult !== lastSubmissionResult
      ) {

        lastSubmissionResult =
          submissionResult;

        sendSubmission(
          submissionResult
        );

      }


      // LeetCode's verdict can appear several seconds after the click.
      // Stop watching after 30 seconds so this does not run indefinitely.
      if (
        submissionResult ||
        attempts >= 40
      ) {

        if (submissionResultWatchTimer !== undefined) {

          window.clearInterval(
            submissionResultWatchTimer
          );

          submissionResultWatchTimer =
            undefined;

        }

      }

    }, 750);

}


document.addEventListener(
  "click",
  event => {

    if (getWebsite() !== "leetcode") {

      return;

    }


    const target =
      event.target instanceof Element
        ? event.target.closest("button, [role=button]")
        : null;


    const targetLabel = [
      target?.textContent,
      target?.getAttribute("aria-label"),
      target?.getAttribute("data-cy"),
      target?.getAttribute("data-e2e-locator")
    ]
      .filter(Boolean)
      .join(" ");


    if (!target || !/submit|run|test/i.test(targetLabel)) {

      return;

    }


    lastSubmissionResult =
      null;


    // Capture the exact code that produced this result before the
    // verdict is rendered. The background worker uses it for guidance.
    sendCodeSnapshot();


    // Record the attempt even if LeetCode later fails to
    // return a verdict (for example, on a network error).
    sendSubmission(
      "submitted"
    );


    scheduleContextUpdate();


    watchForSubmissionResult();

  },
  {
    capture: true
  }
);


// LeetCode's language picker is a custom control on different
// page versions, so listen for both native changes and picker clicks.
document.addEventListener(
  "change",
  () => {

    if (getWebsite() === "leetcode") {

      scheduleContextUpdate();

    }

  },
  {
    capture: true
  }
);


document.addEventListener(
  "click",
  event => {

    if (getWebsite() !== "leetcode") {

      return;

    }


    const target =
      event.target instanceof Element
        ? event.target.closest("button, [role=button], [data-cy]")
        : null;


    const label = [
      target?.textContent,
      target?.getAttribute("aria-label"),
      target?.getAttribute("data-cy"),
      target?.getAttribute("data-e2e-locator")
    ]
      .filter(Boolean)
      .join(" ");


    if (/lang|python|java|c\+\+|typescript|javascript|rust|go/i.test(label)) {

      scheduleContextUpdate();

    }

  },
  {
    capture: true
  }
);


// --------------------------------------------------
// VISIBILITY
// --------------------------------------------------

document.addEventListener(
  "visibilitychange",
  () => {

    sendActivity(
      "visibility",
      true
    );

  }
);


// --------------------------------------------------
// HEARTBEAT
// --------------------------------------------------
//
// This keeps the mentor aware that the
// study page is visible.
//
// IMPORTANT:
// The service worker also checks Chrome's
// Idle API before counting this as activity.
//

setInterval(() => {

  if (
    document.visibilityState ===
    "visible"
  ) {

    sendActivity(
      "heartbeat",
      true
    );


    if (getWebsite() === "leetcode") {

      sendCodeSnapshot();

    }

  }

}, 5000);


// --------------------------------------------------
// INITIAL PAGE CONTEXT
// --------------------------------------------------

sendPageContext();

refreshLeetCodeMetadata();

sendCodeSnapshot();


// LeetCode renders the problem panel and editor after the content
// script has started. Re-read the context during that initial render.
[500, 1500, 3500, 7000].forEach(delay => {

  window.setTimeout(() => {

    if (getWebsite() !== "leetcode") {

      return;

    }


    sendPageContext();
    refreshLeetCodeMetadata();
    sendCodeSnapshot();

  }, delay);

});


// LeetCode is a single-page app. DOM changes reveal the
// difficulty, topics, language picker, and submission verdict.
let contextUpdateTimer:
  number | undefined;


let resultCheckTimer:
  number | undefined;


function scheduleContextUpdate(): void {

  if (contextUpdateTimer !== undefined) {

    window.clearTimeout(
      contextUpdateTimer
    );

  }


  contextUpdateTimer =
    window.setTimeout(() => {

      sendPageContext();

    }, 150);

}


const pageObserver =
  new MutationObserver(() => {

    if (getWebsite() !== "leetcode") {

      return;

    }


    scheduleContextUpdate();


    if (resultCheckTimer !== undefined) {

      window.clearTimeout(
        resultCheckTimer
      );

    }


    resultCheckTimer =
      window.setTimeout(() => {

        sendPageContext();


        const submissionResult =
          getSubmissionResult();


        if (
          submissionResult &&
          submissionResult !== lastSubmissionResult
        ) {

          lastSubmissionResult =
            submissionResult;

          sendSubmission(
            submissionResult
          );

        }

      }, 500);

  });


pageObserver.observe(
  document.documentElement,
  {
    childList: true,
    subtree: true,
    characterData: true
  }
);


// Pick up a verdict that was already visible when the extension
// was reloaded, not only results created after a click.
window.setTimeout(() => {

  const submissionResult =
    getSubmissionResult();


  if (submissionResult) {

    lastSubmissionResult =
      submissionResult;

    sendSubmission(
      submissionResult
    );

  }

}, 3000);


// --------------------------------------------------
// SPA NAVIGATION
// --------------------------------------------------

let lastUrl =
  window.location.href;


setInterval(() => {

  const currentUrl =
    window.location.href;


  if (
    currentUrl !== lastUrl
  ) {

    lastUrl =
      currentUrl;


    sendPageContext();

    refreshLeetCodeMetadata();

  }

}, 1000);
