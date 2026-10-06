// Watches the YouTube player and reports how the learner watches an
// educational video: how long, pauses, skips, tab and window changes, and
// how attentive the viewing was. Non-educational videos are identified and
// then ignored.

import {
  classifyVideo
} from "../core/youtubeClassifier";

import {
  emptyDelta,
  hasDelta
} from "../core/videoDelta";

import type {
  VideoInfo,
  VideoDelta
} from "../core/types";


const REPORT_INTERVAL_MS =
  5000;

// A seek smaller than this (in video seconds) is not a skip.
const SKIP_THRESHOLD_S =
  5;

// Give YouTube's single-page app time to swap in the new video's metadata.
const METADATA_TIMEOUT_MS =
  15000;

const SEEK_PAUSE_GRACE_MS =
  400;


// The extension itself seeks or pauses the video (to show a quiz, or to
// replay a part). Those are not the learner skipping or pausing.
let ignorePlayerChangesUntil = 0;


export function ignorePlayerChanges(
  milliseconds = 2000
): void {

  ignorePlayerChangesUntil =
    performance.now() + milliseconds;

}


function ignoringPlayerChanges(): boolean {

  return performance.now() < ignorePlayerChangesUntil;

}


export type VideoEvent =
  | "pause"
  | "playing"
  | "seek"
  | "ended"
  | "visibility"
  | "blur"
  | "periodic";


export interface VideoReport {

  video: VideoInfo;

  delta: VideoDelta;

  positionS: number;

  playbackRate: number;

  playing: boolean;

  visible: boolean;

  // Whether this page (not just the browser) has keyboard focus.
  focused: boolean;

  event: VideoEvent;

}


// --------------------------------------------------
// PAGE READING
// --------------------------------------------------

function currentVideoId():
  string | null {

  if (window.location.pathname !== "/watch") {

    return null;

  }

  return new URLSearchParams(
    window.location.search
  ).get("v");

}


function metaContent(
  selector: string
): string | undefined {

  return document
    .querySelector<HTMLMetaElement>(selector)
    ?.content
    ?.trim() || undefined;

}


function playerElement():
  HTMLVideoElement | null {

  return document.querySelector<HTMLVideoElement>(
    "video.html5-main-video"
  );

}


// Ads play in the same <video> element as the lesson.
function isAdPlaying(): boolean {

  return Boolean(
    document
      .querySelector("#movie_player")
      ?.classList.contains("ad-showing")
  );

}


// YouTube keeps the previous video's <meta> tags until it re-renders,
// so only trust them once they name the video in the URL.
function readVideoInfo(
  videoId: string,
  durationS: number,
  allowStale: boolean
): VideoInfo | null {

  const metaId =
    metaContent('meta[itemprop="identifier"]') ??
    metaContent('meta[itemprop="videoId"]');

  if (metaId !== videoId && !allowStale) {

    return null;

  }

  const title =
    document
      .querySelector<HTMLElement>("ytd-watch-metadata h1")
      ?.innerText.trim() ||
    metaContent('meta[name="title"]') ||
    document.title.replace(/ - YouTube$/, "");

  if (!title) {

    return null;

  }

  const channel =
    document
      .querySelector<HTMLElement>("ytd-watch-metadata ytd-channel-name a")
      ?.innerText.trim() || undefined;

  const category =
    metaId === videoId
      ? metaContent('meta[itemprop="genre"]')
      : undefined;

  const description =
    metaId === videoId
      ? metaContent('meta[name="description"]')
      : undefined;

  const classification =
    classifyVideo({
      title,
      channel,
      category,
      description
    });

  return {
    videoId,
    title,
    channel,
    category,
    durationS: Math.round(durationS),
    educational: classification.educational,
    score: classification.score,
    topics: classification.topics
  };

}


// --------------------------------------------------
// TRACKER
// --------------------------------------------------

export function startYouTubeTracker(
  report: (report: VideoReport) => void,
  onVideoIdentified: (video: VideoInfo | null) => void
): void {

  let videoId:
    string | null = null;

  let info:
    VideoInfo | null = null;

  let identifyStartedAt = 0;

  let delta =
    emptyDelta();

  let lastTickAt =
    performance.now();

  let lastPosition = 0;

  let maxPosition = 0;

  let lastSeekAt = 0;

  let lastReportAt = 0;

  let attached:
    HTMLVideoElement | null = null;


  function tracking(): boolean {

    return Boolean(
      info?.educational
    );

  }


  function flush(
    event: VideoEvent
  ): void {

    const video =
      attached;

    if (
      !info ||
      !info.educational ||
      !video
    ) {

      return;

    }

    // Nothing new to say; a ping with no change is skipped.
    if (
      (event === "periodic" || event === "playing") &&
      !hasDelta(delta)
    ) {

      return;

    }

    report({
      video: info,
      delta,
      positionS: Math.max(maxPosition, video.currentTime),
      playbackRate: video.playbackRate,
      playing: !video.paused && !video.ended,
      visible: document.visibilityState === "visible",
      focused: document.hasFocus(),
      event
    });

    delta =
      emptyDelta();

    lastReportAt =
      performance.now();

  }


  function resetForNewVideo(
    nextId: string | null
  ): void {

    flush("periodic");

    videoId =
      nextId;

    info =
      null;

    delta =
      emptyDelta();

    lastPosition =
      0;

    maxPosition =
      0;

    identifyStartedAt =
      performance.now();

    onVideoIdentified(null);

  }


  // ---- player events -----------------------------------

  function onTimeUpdate(): void {

    const video =
      attached;

    if (
      !video ||
      !tracking() ||
      isAdPlaying()
    ) {

      return;

    }

    const step =
      video.currentTime - lastPosition;

    // Normal playback advances by about (elapsed * rate). Anything much
    // bigger is a seek, which onSeeking accounts for separately.
    if (
      !video.paused &&
      !video.seeking &&
      step > 0 &&
      step <= 2.5 * video.playbackRate + 0.5
    ) {

      delta.watchedS +=
        step;

    }

    lastPosition =
      video.currentTime;

    maxPosition =
      Math.max(maxPosition, lastPosition);

  }


  function onSeeking(): void {

    const video =
      attached;

    if (
      !video ||
      !tracking() ||
      isAdPlaying()
    ) {

      return;

    }

    lastSeekAt =
      performance.now();

    const jump =
      video.currentTime - lastPosition;

    if (ignoringPlayerChanges()) {

      lastPosition =
        video.currentTime;

      return;

    }

    if (jump >= SKIP_THRESHOLD_S) {

      delta.skipCount += 1;
      delta.skippedS += jump;

    } else if (jump <= -SKIP_THRESHOLD_S) {

      delta.rewindCount += 1;
      delta.rewoundS += -jump;

    }

    lastPosition =
      video.currentTime;

    maxPosition =
      Math.max(maxPosition, lastPosition);

    if (Math.abs(jump) >= SKIP_THRESHOLD_S) {

      flush("seek");

    }

  }


  function onPause(): void {

    const video =
      attached;

    if (
      !video ||
      !tracking() ||
      isAdPlaying() ||
      video.ended ||
      video.seeking ||
      ignoringPlayerChanges() ||
      performance.now() - lastSeekAt < SEEK_PAUSE_GRACE_MS
    ) {

      return;

    }

    delta.pauseCount += 1;

    flush("pause");

  }


  function onPlaying(): void {

    if (tracking()) {

      flush("playing");

    }

  }


  function onEnded(): void {

    if (tracking()) {

      flush("ended");

    }

  }


  function attach(
    video: HTMLVideoElement
  ): void {

    if (attached === video) {

      return;

    }

    attached =
      video;

    video.addEventListener("timeupdate", onTimeUpdate);
    video.addEventListener("seeking", onSeeking);
    video.addEventListener("pause", onPause);
    video.addEventListener("playing", onPlaying);
    video.addEventListener("ended", onEnded);

  }


  // Tab changes are counted by the background script (it sees Chrome switch
  // tabs). Losing focus is reported here so the background script can decide
  // whether the learner left Chrome (a window change) or just clicked the
  // side panel. It does the counting.
  window.addEventListener(
    "blur",
    () => {

      if (tracking()) {

        flush("blur");

      }

    }
  );

  window.addEventListener(
    "pagehide",
    () => {

      flush("periodic");

    }
  );


  // ---- one-second tick ---------------------------------

  setInterval(() => {

    const now =
      performance.now();

    // Cap so a suspended tab doesn't credit a long gap in one go.
    const elapsedS =
      Math.min((now - lastTickAt) / 1000, 2);

    lastTickAt =
      now;


    const nextId =
      currentVideoId();

    if (nextId !== videoId) {

      resetForNewVideo(nextId);

    }

    if (!nextId) {

      return;

    }


    const video =
      playerElement();

    if (!video) {

      return;

    }

    attach(video);


    // Identify the video once YouTube has rendered its metadata.
    if (!info) {

      const timedOut =
        now - identifyStartedAt > METADATA_TIMEOUT_MS;

      {

        // The player element reports the ad's length while an ad plays,
        // so the real duration is filled in later (see below).
        const found =
          readVideoInfo(
            nextId,
            !isAdPlaying() && Number.isFinite(video.duration)
              ? video.duration
              : 0,
            timedOut
          );

        if (found) {

          info =
            found;

          lastPosition =
            video.currentTime;

          maxPosition =
            video.currentTime;

          onVideoIdentified(found);

          // Register the video with the backend straight away.
          if (found.educational) {

            report({
              video: found,
              delta: emptyDelta(),
              positionS: video.currentTime,
              playbackRate: video.playbackRate,
              playing: !video.paused,
              visible: document.visibilityState === "visible",
              focused: document.hasFocus(),
              event: "periodic"
            });

            lastReportAt = now;

          }

        }

      }

      return;

    }


    if (
      !info.educational ||
      isAdPlaying()
    ) {

      return;

    }


    if (Number.isFinite(video.duration)) {

      info.durationS =
        Math.round(video.duration);

    }


    const playing =
      !video.paused &&
      !video.ended &&
      video.readyState >= 3;

    const attentive =
      document.visibilityState === "visible" &&
      document.hasFocus();

    if (playing) {

      delta.playingS += elapsedS;

      if (attentive) {

        delta.activeS += elapsedS;

      }

    } else if (!video.ended) {

      delta.pausedS += elapsedS;

    }


    if (now - lastReportAt >= REPORT_INTERVAL_MS) {

      flush("periodic");

      lastReportAt =
        now;

    }

  }, 1000);

}
