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

}

export type NudgeType =
  | "STUCK"
  | "THINKING_PROMPT"
  | "ACTIVE_RECALL"
  | "BREAK_REMINDER"
  | "AI_MENTOR"
  | "AI_MENTOR_ERROR";

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
