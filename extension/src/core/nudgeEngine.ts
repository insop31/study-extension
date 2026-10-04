import type {
  Nudge,
  UserState
} from "./types";


export interface NudgeContext {

  website: string;

  pageTitle: string;

  activeTime: number;

  userState: UserState;

  // Unsuccessful submissions on the current problem.
  failedAttempts: number;

}


// --------------------------------------------------
// COOLDOWN
// --------------------------------------------------

export const NUDGE_COOLDOWN =
  15 * 60 * 1000;

const STUCK_MINUTES =
  10;

const STUCK_ATTEMPTS =
  3;


// --------------------------------------------------
// EVALUATE NUDGE
// --------------------------------------------------

export function evaluateNudge(
  context: NudgeContext
): Nudge | null {

  // Never interrupt an idle user.

  if (
    context.userState !==
    "active"
  ) {

    return null;

  }


  const activeMinutes =
    Math.floor(
      context.activeTime / 60000
    );


  // ------------------------------------------------
  // LEETCODE
  // ------------------------------------------------

  if (
    context.website ===
    "leetcode"
  ) {

    // Active + enough time + repeated failures
    // (cooldown is checked by the caller).
    if (
      activeMinutes >= STUCK_MINUTES &&
      context.failedAttempts >= STUCK_ATTEMPTS
    ) {

      return {

        id:
          `stuck-${Date.now()}`,

        type:
          "STUCK",

        priority:
          "high",

        message:
          `You've had ${context.failedAttempts} unsuccessful submissions on ${context.pageTitle}. Instead of tweaking the same approach, write down what each failing case has in common, then think about what information you need to look up quickly.`,

        createdAt:
          Date.now()

      };

    }

    if (
      activeMinutes >= 10
    ) {

      return {

        id:
          `leetcode-${Date.now()}`,

        type:
          "THINKING_PROMPT",

        priority:
          "medium",

        message:
          `You've been working on ${context.pageTitle} for a while. Before looking at the solution, explain your current approach in your own words. What information do you need to keep track of while scanning the input?`,

        createdAt:
          Date.now()

      };

    }

  }


  // ------------------------------------------------
  // YOUTUBE
  // ------------------------------------------------

  if (
    context.website ===
    "youtube"
  ) {

    if (
      activeMinutes >= 15
    ) {

      return {

        id:
          `youtube-${Date.now()}`,

        type:
          "ACTIVE_RECALL",

        priority:
          "low",

        message:
          "Pause for a moment. Can you explain the main idea from what you just watched without looking back at the video?",

        createdAt:
          Date.now()

      };

    }

  }


  return null;

}


// --------------------------------------------------
// CHECK COOLDOWN
// --------------------------------------------------

export function canShowNudge(
  lastNudgeTime: number | undefined
): boolean {

  if (!lastNudgeTime) {

    return true;

  }


  return (
    Date.now() -
    lastNudgeTime
  ) >= NUDGE_COOLDOWN;

}