import type {
  StudyContext,
  Nudge
} from "./types";

export function evaluateNudge(
  context: StudyContext
): Nudge | null {

  // LeetCode stuck detection

  if (
    context.platform === "leetcode" &&
    context.timeSpent >= 20 &&
    (context.attempts ?? 0) >= 2
  ) {

    return {
      type: "STUCK",

      message:
        "You've been working on this for a while. Try breaking the problem into a smaller subproblem before looking at the solution.",

      priority: "medium",

      reason:
        "Long problem-solving time with multiple failed attempts."
    };
  }

  // YouTube passive learning detection

  if (
    context.platform === "youtube" &&
    context.timeSpent >= 30
  ) {

    return {
      type: "ACTIVE_RECALL",

      message:
        "You've been watching for a while. Pause here and explain the main concept in your own words.",

      priority: "low",

      reason:
        "Long educational video session."
    };
  }

  return null;
}