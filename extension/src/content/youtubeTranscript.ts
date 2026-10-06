// Reads a video's transcript from YouTube's own transcript panel.
//
// YouTube's caption and transcript APIs now refuse requests that don't
// carry a token only the player can make, so the reliable way is the same
// thing a viewer does: open "Show transcript" and read the lines. The panel
// is hidden while that happens and closed afterwards.

import {
  buildExcerpt,
  parseTimestamp,
  type TranscriptExcerpt,
  type TranscriptLine
} from "../core/transcript";


const LOAD_TIMEOUT_MS =
  12000;

// If the panel has not produced lines by then, click the button again.
const RETRY_CLICK_MS =
  3000;

// The description area renders a little after the player does.
const PAGE_SETTLE_TIMEOUT_MS =
  10000;

// A quiz never waits longer than this for the transcript; it falls back
// to a question from the video's title and topics.
const EXCERPT_WAIT_MS =
  14000;

// A missing transcript is re-checked after this long, in case the page
// simply had not finished rendering.
const NEGATIVE_CACHE_MS =
  60_000;

const HIDE_STYLE_ID =
  "study-mentor-hide-transcript-panel";


// videoId -> lines, or null when the video has no transcript.
const cache =
  new Map<string, {
    lines: TranscriptLine[] | null;
    at: number;
  }>();

const loading =
  new Map<string, Promise<TranscriptLine[] | null>>();


function sleep(
  milliseconds: number
): Promise<void> {

  return new Promise(resolve =>
    window.setTimeout(resolve, milliseconds)
  );

}


// Both layouts YouTube uses for transcript lines.
function readLines():
  TranscriptLine[] {

  const lines: TranscriptLine[] = [];

  const modern =
    document.querySelectorAll(
      "transcript-segment-view-model"
    );

  for (const segment of modern) {

    const startS =
      parseTimestamp(
        segment.querySelector(
          ".ytwTranscriptSegmentViewModelTimestamp"
        )?.textContent ?? ""
      );

    const text =
      segment.querySelector(
        'span[role="text"], .ytAttributedStringHost'
      )?.textContent?.trim();

    if (startS !== null && text) {

      lines.push({ startS, text });

    }

  }

  if (lines.length > 0) {

    return lines;

  }

  const legacy =
    document.querySelectorAll(
      "ytd-transcript-segment-renderer"
    );

  for (const segment of legacy) {

    const startS =
      parseTimestamp(
        segment.querySelector(".segment-timestamp")?.textContent ?? ""
      );

    const text =
      segment.querySelector(".segment-text")?.textContent?.trim();

    if (startS !== null && text) {

      lines.push({ startS, text });

    }

  }

  return lines;

}


function findTranscriptButton():
  HTMLElement | null {

  const inDescription =
    document.querySelector<HTMLElement>(
      "ytd-video-description-transcript-section-renderer button"
    );

  if (inDescription) {

    return inDescription;

  }

  return Array.from(
    document.querySelectorAll<HTMLElement>("button")
  ).find(button =>
    /show transcript/i.test(
      button.getAttribute("aria-label") ??
      button.textContent ??
      ""
    )
  ) ?? null;

}


function closeTranscriptPanel(): void {

  const segment =
    document.querySelector(
      "transcript-segment-view-model, ytd-transcript-segment-renderer"
    );

  segment
    ?.closest("ytd-engagement-panel-section-list-renderer")
    ?.querySelector<HTMLElement>("#visibility-button button")
    ?.click();

}


function expandButton():
  HTMLElement | null {

  return document.querySelector<HTMLElement>(
    "#description-inline-expander #expand, ytd-text-inline-expander #expand"
  );

}


// Waits until the description area has rendered something we can use.
async function waitForTranscriptEntryPoint():
  Promise<void> {

  const deadline =
    Date.now() + PAGE_SETTLE_TIMEOUT_MS;

  while (Date.now() < deadline) {

    if (
      readLines().length > 0 ||
      findTranscriptButton() ||
      expandButton()
    ) {

      return;

    }

    await sleep(300);

  }

}


async function waitForLines(
  button: HTMLElement
): Promise<TranscriptLine[]> {

  const startedAt =
    Date.now();

  let lastClickAt =
    startedAt;

  while (Date.now() - startedAt < LOAD_TIMEOUT_MS) {

    const lines =
      readLines();

    if (lines.length > 0) {

      return lines;

    }

    // The first click can land before the page is ready for it.
    if (Date.now() - lastClickAt >= RETRY_CLICK_MS) {

      button.click();

      lastClickAt =
        Date.now();

    }

    await sleep(250);

  }

  return [];

}


async function loadFromPage():
  Promise<TranscriptLine[] | null> {

  // Keep the panel out of sight while it opens and closes.
  const style =
    document.createElement("style");

  style.id =
    HIDE_STYLE_ID;

  style.textContent =
    "ytd-engagement-panel-section-list-renderer { opacity: 0 !important; pointer-events: none !important; }";

  document.head.appendChild(style);

  let expandedDescription = false;

  try {

    await waitForTranscriptEntryPoint();

    const existing =
      readLines();

    if (existing.length > 0) {

      return existing;

    }

    let button =
      findTranscriptButton();

    // The transcript button sits inside the collapsed description.
    if (!button) {

      const expand =
        expandButton();

      if (expand) {

        expand.click();

        expandedDescription =
          true;

        await sleep(700);

        button =
          findTranscriptButton();

      }

    }

    if (!button) {

      return null;

    }

    button.click();

    const lines =
      await waitForLines(button);

    return lines.length > 0
      ? lines
      : null;

  } finally {

    closeTranscriptPanel();

    if (expandedDescription) {

      document
        .querySelector<HTMLElement>(
          "#description-inline-expander #collapse, ytd-text-inline-expander #collapse"
        )
        ?.click();

    }

    // Let YouTube finish closing the panel before it is shown again.
    await sleep(400);

    style.remove();

  }

}


// Loads (once per video) and returns the transcript lines, or null.
export function loadTranscript(
  videoId: string
): Promise<TranscriptLine[] | null> {

  const cached =
    cache.get(videoId);

  if (
    cached &&
    (
      cached.lines ||
      Date.now() - cached.at < NEGATIVE_CACHE_MS
    )
  ) {

    return Promise.resolve(
      cached.lines
    );

  }

  const pending =
    loading.get(videoId);

  if (pending) {

    return pending;

  }

  const started =
    loadFromPage()
      .catch(() => null)
      .then(lines => {

        cache.set(videoId, { lines, at: Date.now() });

        loading.delete(videoId);

        return lines;

      });

  loading.set(videoId, started);

  return started;

}


// The captions for the few minutes before `endS`, for a quiz question.
export async function getTranscriptExcerpt(
  videoId: string,
  endS: number,
  windowS = 240
): Promise<TranscriptExcerpt | null> {

  const lines =
    await Promise.race([
      loadTranscript(videoId),
      sleep(EXCERPT_WAIT_MS).then(() => null)
    ]);

  if (!lines) {

    return null;

  }

  return buildExcerpt(
    lines,
    Math.max(0, endS - windowS),
    endS
  );

}
