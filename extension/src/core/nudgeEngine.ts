import type {
  Nudge,
  UserState
} from "./types";


// What the backend knows about this learner for the current problem
// (see backend/src/dashboard/personalize.mjs, leetCodePersonal).
export interface PersonalNudgeData {

  // Their usual active time to solve a problem of this difficulty.
  expectedSolveMs: number | null;

  // Active time spent on this problem so far.
  problemActiveMs: number | null;

  topic: string | null;

  topicStatus: "strong" | "moderate" | "weak" | "new" | null;

  // A problem in the same topic they have already solved.
  solvedSimilar: string | null;

  // Attempts they usually need before an accepted submission.
  attemptsToSolve: number | null;

}


export interface NudgeContext {

  website: string;

  pageTitle: string;

  activeTime: number;

  userState: UserState;

  // Unsuccessful submissions on the current problem.
  failedAttempts: number;

  personal?: PersonalNudgeData | null;

}


// --------------------------------------------------
// COOLDOWN
// --------------------------------------------------

export const NUDGE_COOLDOWN =
  15 * 60 * 1000;

// Defaults for a learner with no history yet.
const DEFAULT_THINKING_MS =
  10 * 60 * 1000;

const DEFAULT_STUCK_ATTEMPTS =
  3;

const MIN_THINKING_MS =
  5 * 60 * 1000;

const MAX_THINKING_MS =
  30 * 60 * 1000;


// When to step in: a little past this learner's usual solving time.
export function thinkingThresholdMs(
  personal?: PersonalNudgeData | null
): number {

  if (!personal?.expectedSolveMs) {

    return DEFAULT_THINKING_MS;

  }

  return Math.min(
    MAX_THINKING_MS,
    Math.max(MIN_THINKING_MS, Math.round(personal.expectedSolveMs * 1.25))
  );

}


// Someone who usually needs 4 tries is not stuck after 3.
export function stuckAttempts(
  personal?: PersonalNudgeData | null
): number {

  return personal?.attemptsToSolve
    ? Math.max(DEFAULT_STUCK_ATTEMPTS, personal.attemptsToSolve + 1)
    : DEFAULT_STUCK_ATTEMPTS;

}


function problemName(
  pageTitle: string
): string {

  return pageTitle.replace(/ - LeetCode$/, "");

}


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


  // ------------------------------------------------
  // LEETCODE
  // ------------------------------------------------

  if (
    context.website ===
    "leetcode"
  ) {

    const personal =
      context.personal ?? null;

    // Time on this problem when known, otherwise on the session.
    const timeSpent =
      personal?.problemActiveMs ?? context.activeTime;

    const threshold =
      thinkingThresholdMs(personal);

    const name =
      problemName(context.pageTitle);

    const topic =
      personal?.topic;


    // Active + enough time + more failures than usual
    // (cooldown is checked by the caller).
    if (
      timeSpent >= threshold &&
      context.failedAttempts >= stuckAttempts(personal)
    ) {

      const parts = [
        `You've had ${context.failedAttempts} unsuccessful submissions on ${name}.`,
        "Instead of tweaking the same approach, write down what the failing cases have in common."
      ];

      if (personal?.solvedSimilar && topic) {

        parts.push(`You solved "${problemName(personal.solvedSimilar)}", which uses the same ${topic} idea: what did you keep track of there?`);

      } else if (personal?.topicStatus === "weak" && topic) {

        parts.push(`${topic} is still one of your weaker areas, so it's fine to review a short explanation of the core technique before trying again.`);

      } else {

        parts.push("Then think about what information you need to look up quickly.");

      }

      return {

        id:
          `stuck-${Date.now()}`,

        type:
          "STUCK",

        priority:
          "high",

        message:
          parts.join(" "),

        createdAt:
          Date.now()

      };

    }


    if (
      timeSpent >= threshold
    ) {

      const minutesSpent =
        Math.round(timeSpent / 60000);

      const opening =
        personal?.expectedSolveMs
          ? `You usually solve problems like this in about ${Math.round(personal.expectedSolveMs / 60000)} min and you're ${minutesSpent} min into ${name}.`
          : `You've been working on ${name} for a while.`;

      let prompt =
        "Before looking at the solution, explain your current approach in your own words. What information do you need to keep track of while scanning the input?";

      if (personal?.topicStatus === "strong" && topic) {

        prompt = `You're strong in ${topic}. Which ${topic} technique you already know fits this problem, and what is stopping it from working?`;

      } else if (personal?.topicStatus === "weak" && topic) {

        prompt = `${topic} is still a weaker area for you: write down a brute-force approach first, then look for the work it repeats.`;

      }

      return {

        id:
          `leetcode-${Date.now()}`,

        type:
          "THINKING_PROMPT",

        priority:
          "medium",

        message:
          `${opening} ${prompt}`,

        createdAt:
          Date.now()

      };

    }

  }


  // YouTube recall prompts are decided by the backend from real
  // watch data (see youtubeService), not from elapsed time alone.


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