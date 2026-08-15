export type Platform =
  | "leetcode"
  | "youtube"
  | "generic"
  | "unknown";

export type ActivityType =
  | "problem_solving"
  | "video_learning"
  | "reading"
  | "unknown";

export interface StudyContext {

  platform: Platform;

  activityType: ActivityType;

  title: string;

  url: string;

  timeSpent: number;

  topic?: string;

  difficulty?: string;

  attempts?: number;

  timestamp: number;
}

export interface Nudge {

  type:
    | "STUCK"
    | "ACTIVE_RECALL"
    | "PRACTICE"
    | "REVISION"
    | "BREAK"
    | "ENCOURAGEMENT";

  message: string;

  priority: "low" | "medium" | "high";

  reason: string;
}