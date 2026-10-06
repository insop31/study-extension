// Shared types used by the content script, service worker and side panel.

export type Platform =
  | "leetcode"
  | "youtube"
  | "unknown";

export type UserState =
  | "active"
  | "idle"
  | "paused";

export interface PageContext {

  title: string;

  url: string;

  website: Platform;

  timestamp: number;

  problemSlug?: string;

  difficulty?: string;

  topics?: string[];

  programmingLanguage?: string;

  // Set on YouTube watch pages once the video has been identified.
  video?: VideoInfo;

}

export type NudgeType =
  | "STUCK"
  | "THINKING_PROMPT"
  | "ACTIVE_RECALL"
  | "BREAK_REMINDER"
  | "AI_MENTOR"
  | "AI_MENTOR_ERROR"
  | "FOCUS_REMINDER"
  | "SKIP_REMINDER"
  | "CONFUSION_CHECK";

export interface Nudge {

  id: string;

  type: NudgeType;

  message: string;

  priority: "low" | "medium" | "high";

  createdAt: number;

}

export interface AuthUser {

  id: string;

  name: string | null;

  email: string;

  hasGoogle: boolean;

  createdAt: number;

}

// A YouTube video the learner is watching, as identified on the page.
export interface VideoInfo {

  videoId: string;

  title: string;

  channel?: string;

  // YouTube's own category, e.g. "Education".
  category?: string;

  durationS: number;

  // Only educational videos are tracked.
  educational: boolean;

  score: number;

  topics: string[];

}

// Change since the previous report for the same video.
export interface VideoDelta {

  // Seconds of the video actually watched (not skipped).
  watchedS: number;

  // Wall-clock seconds the video was playing.
  playingS: number;

  // Playing seconds with the tab visible and the window focused.
  activeS: number;

  // Wall-clock seconds spent paused.
  pausedS: number;

  pauseCount: number;

  tabChanges: number;

  windowChanges: number;

  skipCount: number;

  skippedS: number;

  rewindCount: number;

  rewoundS: number;

}

// Running totals for one video in one study session.
export interface VideoWatch {

  videoId: string;

  title: string;

  topics: string[];

  durationS: number;

  watchedS: number;

  playingS: number;

  activeS: number;

  pausedS: number;

  pauseCount: number;

  tabChanges: number;

  windowChanges: number;

  skipCount: number;

  skippedS: number;

  rewindCount: number;

  rewoundS: number;

  maxPositionS: number;

  percentWatched: number;

  // Share of playing time spent attentively, 0-100.
  activePercent: number;

  recallCount: number;

  ended: boolean;

  // Questions asked about this video in the current session.
  quiz?: {
    asked: number;
    answered: number;
    correct: number;
  };

}

// A question about what the learner just watched. The correct answer is
// withheld until they answer.
export interface QuizQuestion {

  id: string;

  question: string;

  options: string[];

  // false when it was written from the title and topics only.
  grounded: boolean;

  concept?: string | null;

}

export interface QuizResult {

  correct: boolean;

  chosenIndex: number;

  correctIndex: number;

  explanation: string;

  // Where to rewatch after a wrong answer.
  rewatch: {
    startS: number;
    endS: number;
  } | null;

}
