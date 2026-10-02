// --------------------------------------------------
// TYPES
// --------------------------------------------------

export interface NudgeContext {

  website: string;

  pageTitle: string;

  activeTime: number;

  userState:
    | "active"
    | "idle"
    | "paused";

}


export interface Nudge {

  id: string;

  type:
    | "THINKING_PROMPT"
    | "ACTIVE_RECALL"
    | "BREAK_REMINDER";

  message: string;

  priority:
    | "low"
    | "medium"
    | "high";

  createdAt: number;

}


// --------------------------------------------------
// COOLDOWN
// --------------------------------------------------

export const NUDGE_COOLDOWN =
  15 * 60 * 1000;


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