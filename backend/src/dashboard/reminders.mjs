// When to suggest a break, when to remind the learner of a key concept, and
// when switching away from a problem is worth a word. Pure functions.

import { keyIdea } from "./concepts.mjs";

const MIN = 60 * 1000;

// ---------------------------------------------------------------------------
// Breaks
// ---------------------------------------------------------------------------

// A gap at least this long between activities counts as having had a break.
export const BREAK_GAP_MS = 5 * MIN;

// Do not suggest another break within this time.
export const BREAK_COOLDOWN_MS = 45 * MIN;

// How long to study before suggesting a break: about the learner's usual
// session length (they know what works for them), between 45 and 90 minutes.
export function breakAfterMs(profile) {
  const usual = profile?.study?.avgSessionMinutes ?? 0;
  if (usual < 15) return 60 * MIN;
  return Math.min(90, Math.max(45, Math.round(usual * 1.25))) * MIN;
}

export function shouldSuggestBreak({ focusMs, lastBreakAt, now, profile }) {
  if (focusMs < breakAfterMs(profile)) return false;
  if (lastBreakAt && now.getTime() - lastBreakAt.getTime() < BREAK_COOLDOWN_MS) return false;
  return true;
}

export function breakMessage(focusMs) {
  const minutes = Math.round(focusMs / MIN);
  return (
    `You've been studying for ${minutes} minutes without a break. ` +
    "Take 5 minutes away from the screen: stand up, stretch, get some water. " +
    "Short breaks help you remember what you just learned."
  );
}

// ---------------------------------------------------------------------------
// Concept reminders
// ---------------------------------------------------------------------------

/**
 * Picks a topic worth a short reminder before the learner starts.
 * profile: built with focus topics = the topics of the problem/video/page.
 * remindedToday / remindedEver: sets of topics already reminded.
 * Returns { topic, message } or null.
 */
export function chooseConceptReminder(profile, { remindedToday, remindedEver }) {
  for (const focus of profile.focusTopics) {
    const idea = keyIdea(focus.topic);
    if (!idea || remindedToday.has(focus.topic)) continue;

    const struggling =
      focus.status === "weak" ||
      (focus.quizAccuracy !== null && focus.quizAccuracy < 50);

    if (struggling) {
      const missed = profile.quiz.recentMisses[0];
      return {
        topic: focus.topic,
        message:
          `Before you start: ${focus.topic} has been tricky for you so far. Key idea: ${idea}` +
          (missed && focus.quizAccuracy !== null ? ` (You recently missed a question on ${missed}.)` : "")
      };
    }

    // First time on this topic at all: introduce it once.
    const brandNew =
      focus.problemsAttempted === 0 &&
      (focus.quizAnswered ?? 0) === 0 &&
      (focus.studyMs ?? 0) === 0;

    if (brandNew && !remindedEver.has(focus.topic)) {
      return {
        topic: focus.topic,
        message: `New topic: ${focus.topic}. Key idea to hold on to: ${idea}`
      };
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Switching away from a problem
// ---------------------------------------------------------------------------

export const PROBLEM_FOCUS_COOLDOWN_MS = 10 * MIN;

export function shouldRemindProblemFocus({ switches, threshold, lastFocusAt, now }) {
  if (switches < threshold) return false;
  if (lastFocusAt && now.getTime() - lastFocusAt.getTime() < PROBLEM_FOCUS_COOLDOWN_MS) return false;
  return true;
}

export function problemFocusMessage(switches, title) {
  return (
    `You've switched away from ${title} ${switches} times. ` +
    "Switching costs focus each time: try 15 minutes on the problem alone, " +
    "with notes on paper if you need to think something through."
  );
}
