// Turns a learner profile into concrete changes to what the mentor says and
// when. Pure functions, each with a sensible default when there is no history.

const minutes = ms => Math.round(ms / 60000);

// The weakest focus topic matters most: that is where help is needed.
function weakestFocus(profile) {
  const order = { weak: 0, new: 1, moderate: 2, strong: 3 };
  return [...profile.focusTopics].sort((a, b) => order[a.status] - order[b.status])[0] ?? null;
}

// ---------------------------------------------------------------------------
// AI hints (LeetCode mentor)
// ---------------------------------------------------------------------------

// Extra instructions for the AI mentor, from what this learner needs.
// Earlier hints rarely led to a solve: lighter hints are not working for them.
function hintsNotWorking(profile) {
  return (
    profile.hints.given >= 3 &&
    profile.hints.followedBySolvePct !== null &&
    profile.hints.followedBySolvePct < 40
  );
}

export function mentorStyle(profile) {
  const lines = [];
  const focus = weakestFocus(profile);
  const tooVague = hintsNotWorking(profile);

  if (profile.level === "beginner") {
    lines.push("The learner is a beginner: use plain language, avoid jargon, and explain any term you use in a few words.");
  } else if (profile.level === "advanced") {
    lines.push("The learner is advanced: be brief and precise; skip basics.");
  }

  if (focus?.status === "weak") {
    lines.push(
      `${focus.topic} is one of the learner's weakest topics (mastery ${focus.mastery}/100): ` +
      "give a more concrete hint, name the technique or data structure that applies, and break the next step into a small action."
    );
  } else if (focus?.status === "strong" && !tooVague) {
    lines.push(
      `The learner is strong in ${focus.topic}: do not name the technique; ask one short question that lets them spot it themselves.`
    );
  } else if (focus) {
    lines.push(`The learner is still building up ${focus.topic}: give a medium-sized hint.`);
  }

  if (focus?.solvedExamples.length) {
    lines.push(
      `They have already solved related problems (${focus.solvedExamples.join(", ")}). ` +
      "When it genuinely helps, connect the hint to one of them."
    );
  }

  // Light hints that did not lead to a solve: be more concrete this time
  // (this overrides the hands-off style for strong topics above).
  if (tooVague) {
    lines.push(
      `Only ${profile.hints.followedBySolvePct}% of earlier hints led to a solution, so previous hints were probably too vague: be noticeably more specific.`
    );
  }

  if (profile.attemptAccuracy !== null && profile.attemptAccuracy < 40 && profile.problemsAttempted >= 3) {
    lines.push("This learner often submits before the solution is ready: suggest one edge case to test by hand before submitting.");
  }

  if (profile.preferredLanguage) {
    lines.push(`Use ${profile.preferredLanguage} for any syntax you mention.`);
  }

  return lines;
}

// A small, model-friendly summary to send alongside the request.
export function profileForModel(profile) {
  return {
    level: profile.level,
    preferredLanguage: profile.preferredLanguage,
    problemsSolved: profile.problemsSolved,
    successRate: profile.successRate,
    typicalSolveMinutes: Object.fromEntries(
      Object.entries(profile.typicalSolveMs)
        .filter(([, ms]) => ms !== null)
        .map(([difficulty, ms]) => [difficulty, minutes(ms)])
    ),
    strongTopics: profile.strongTopics.map(t => t.topic),
    weakTopics: profile.weakTopics.map(t => t.topic),
    focusTopics: profile.focusTopics,
    thisProblemSoFar: profile.currentProblem
      ? { attempts: profile.currentProblem.attempts, minutes: minutes(profile.currentProblem.activeMs) }
      : null
  };
}

// ---------------------------------------------------------------------------
// Quiz questions
// ---------------------------------------------------------------------------

export function quizPersonalization(profile, recentQuestions = []) {
  const { answered, accuracy, recentMisses } = profile.quiz;

  let difficulty = "standard";
  if (answered >= 4 && accuracy >= 80) difficulty = "challenging";
  else if (answered >= 3 && accuracy < 50) difficulty = "foundational";

  const instruction = {
    foundational:
      "This learner has been getting video questions wrong: ask a foundational question about the core idea, with clearly distinct options.",
    standard:
      "Ask a question of normal difficulty.",
    challenging:
      "This learner answers most questions correctly: ask a harder question that applies the idea to a new case or an edge case, with close distractors."
  }[difficulty];

  return {
    difficulty,
    instruction,
    // Concepts they recently got wrong: worth testing again if covered.
    revisit: recentMisses,
    // Do not ask the same thing twice in a video.
    avoid: recentQuestions.slice(0, 5)
  };
}

// ---------------------------------------------------------------------------
// Video prompts
// ---------------------------------------------------------------------------

export const DEFAULT_VIDEO_THRESHOLDS = {
  afterPauseS: 90,
  afterWatchS: 4 * 60,
  switchesForFocus: 3
};

export function videoThresholds(profile) {
  const thresholds = { ...DEFAULT_VIDEO_THRESHOLDS };
  const { answered, accuracy } = profile.quiz;

  // Struggling learners get checked more often; confident ones less.
  if (answered >= 3 && accuracy < 50) {
    thresholds.afterPauseS = 60;
    thresholds.afterWatchS = 3 * 60;
  } else if (answered >= 5 && accuracy >= 80) {
    thresholds.afterPauseS = 2 * 60;
    thresholds.afterWatchS = 6 * 60;
  }

  // Someone who habitually switches a lot would be nagged constantly at 3;
  // remind them only when it is unusual for them.
  const habits = profile.videoHabits;
  if (habits && habits.switchesPerHour >= 20) {
    thresholds.switchesForFocus = 5;
  }

  return thresholds;
}

// A personal line added after the standard recall prompt, when there is
// something specific to say. Returns "" otherwise.
export function recallNote(profile, videoTopics) {
  const topics = new Set(videoTopics);
  const weak = profile.weakTopics.find(t => topics.has(t.topic));
  if (weak) {
    return `${weak.topic} is one of your weaker topics, so this is a good moment to check you've got it.`;
  }

  const missed = profile.quiz.recentMisses.find(concept => topics.has(concept));
  if (missed) {
    return `You missed a question on ${missed} recently. See if it's clearer now.`;
  }

  return "";
}

export function focusNote(profile) {
  const habits = profile.videoHabits;
  if (habits && habits.activePct !== null && habits.activePct >= 80) {
    return "That's unusual for you: you normally stay focused on the video.";
  }
  return "";
}

// ---------------------------------------------------------------------------
// LeetCode nudges
// ---------------------------------------------------------------------------

// What the extension's nudge engine needs to time and word its nudges for
// this learner and this problem.
export function leetCodePersonal(profile, difficulty) {
  const focus = weakestFocus(profile);
  return {
    expectedSolveMs: difficulty ? profile.typicalSolveMs[difficulty] ?? null : null,
    problemActiveMs: profile.currentProblem?.activeMs ?? null,
    topic: focus?.topic ?? null,
    topicStatus: focus?.status ?? null,
    solvedSimilar: focus?.solvedExamples[0] ?? null,
    attemptsToSolve: profile.attemptsToSolve
  };
}
