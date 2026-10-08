import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildLearnerProfile, learnerLevel } from "../src/dashboard/learnerProfile.mjs";
import {
  DEFAULT_VIDEO_THRESHOLDS,
  focusNote,
  leetCodePersonal,
  mentorStyle,
  profileForModel,
  quizPersonalization,
  recallNote,
  videoThresholds
} from "../src/dashboard/personalize.mjs";
import { RECALL_MESSAGE, decideVideoNudge } from "../src/services/videoMentor.mjs";

const MIN = 60_000;

const problem = (slug, extra) => ({
  slug, title: slug.replace(/-/g, " "), difficulty: "Easy", topics: ["Array"],
  attempts: 1, accepted: 1, solved: true, solve_ms: 10 * MIN, active_ms: 10 * MIN,
  last_seen: new Date("2026-10-01"), ...extra
});

const empty = {
  problems: [], languages: [], videos: [], quizzes: [], hints: [], avgSessionMs: 0, activeDays14: 0
};

// A learner who is good at arrays, bad at DP, and gets video questions wrong.
const raw = {
  ...empty,
  problems: [
    problem("two-sum", { solve_ms: 8 * MIN }),
    problem("contains-duplicate", { solve_ms: 12 * MIN, topics: ["Array", "Hash Table"] }),
    problem("best-time", { solve_ms: 16 * MIN }),
    problem("climbing-stairs", { topics: ["Dynamic Programming"], attempts: 4, accepted: 0, solved: false, solve_ms: null }),
    problem("coin-change", { topics: ["Dynamic Programming"], difficulty: "Medium", attempts: 5, accepted: 0, solved: false, solve_ms: null })
  ],
  languages: [{ language: "C++", n: 9 }, { language: "Python3", n: 2 }],
  quizzes: [
    { topics: ["Dynamic Programming"], concept: "Memoization", answered: true, correct: false, created_at: new Date("2026-10-05") },
    { topics: ["Dynamic Programming"], concept: "Base cases", answered: true, correct: false, created_at: new Date("2026-10-04") },
    { topics: ["Arrays"], concept: "Indexing", answered: true, correct: true, created_at: new Date("2026-10-03") }
  ],
  hints: [
    { problem_slug: "coin-change", at: new Date("2026-10-02"), solved_at: null },
    { problem_slug: "climbing-stairs", at: new Date("2026-10-02"), solved_at: null },
    { problem_slug: "two-sum", at: new Date("2026-09-20"), solved_at: new Date("2026-09-21") }
  ]
};

describe("learner profile", () => {
  const profile = buildLearnerProfile(raw, { topics: ["Dynamic Programming"], difficulty: "Medium", problemSlug: "coin-change" });

  it("summarises level, pace and language", () => {
    assert.equal(profile.level, "beginner");
    assert.equal(profile.preferredLanguage, "C++");
    assert.equal(profile.typicalSolveMs.Easy, 12 * MIN); // median of 8, 12, 16
    assert.equal(profile.typicalSolveMs.Medium, null);   // nothing solved yet
    assert.equal(profile.successRate, 60);
  });

  it("finds strong and weak topics and what they missed", () => {
    assert.deepEqual(profile.strongTopics.map(t => t.topic), ["Arrays"]);
    assert.deepEqual(profile.weakTopics.map(t => t.topic), ["Dynamic Programming"]);
    assert.deepEqual(profile.quiz.recentMisses, ["Memoization", "Base cases"]);
    assert.equal(profile.quiz.accuracy, 33);
  });

  it("tracks whether earlier hints led to a solve", () => {
    assert.deepEqual(profile.hints, { given: 3, followedBySolvePct: 33 });
  });

  it("describes the topic in focus, leaving out the current problem", () => {
    const dp = profile.focusTopics[0];
    assert.equal(dp.topic, "Dynamic Programming");
    assert.equal(dp.status, "weak");
    assert.deepEqual(dp.unsolvedExamples, ["climbing stairs"]);
    assert.deepEqual(profile.currentProblem, { attempts: 5, activeMs: 10 * MIN, solved: false });
  });

  it("rates levels from what has been solved", () => {
    assert.equal(learnerLevel([]), "beginner");
    const mediums = Array.from({ length: 3 }, (_, i) => ({ solved: true, difficulty: "Medium", i }));
    assert.equal(learnerLevel(mediums), "intermediate");
    const hards = Array.from({ length: 3 }, () => ({ solved: true, difficulty: "Hard" }));
    assert.equal(learnerLevel(hards), "advanced");
  });
});

describe("personalised AI hints", () => {
  it("gives a struggling beginner concrete, plain-language help", () => {
    const profile = buildLearnerProfile(raw, { topics: ["Dynamic Programming"], problemSlug: "coin-change" });
    const style = mentorStyle(profile).join(" ");
    assert.match(style, /beginner/);
    assert.match(style, /weakest topics.*more concrete hint/);
    assert.match(style, /Only 33% of earlier hints led to a solution/);
    assert.match(style, /Use C\+\+/);
  });

  it("lets a strong learner work it out, pointing to problems they solved", () => {
    const profile = buildLearnerProfile({ ...raw, hints: [] }, { topics: ["Array"], problemSlug: "best-time" });
    const style = mentorStyle(profile).join(" ");
    assert.match(style, /strong in Arrays: do not name the technique/);
    assert.match(style, /already solved related problems \(/);
    assert.doesNotMatch(style, /more concrete hint/);
  });

  it("falls back to neutral guidance with no history", () => {
    const profile = buildLearnerProfile(empty, { topics: ["Graph"] });
    const style = mentorStyle(profile);
    assert.ok(style.some(line => /still building up Graphs/.test(line)));
    assert.ok(!style.some(line => /earlier hints/.test(line)));
  });

  it("sends the model a compact summary, not raw rows", () => {
    const summary = profileForModel(buildLearnerProfile(raw, { topics: ["Array"] }));
    assert.deepEqual(summary.typicalSolveMinutes, { Easy: 12 });
    assert.deepEqual(summary.weakTopics, ["Dynamic Programming"]);
    assert.ok(!("problems" in summary));
  });
});

describe("personalised quizzes", () => {
  const withQuizzes = (n, correct) => buildLearnerProfile({
    ...empty,
    quizzes: Array.from({ length: n }, (_, i) => ({
      topics: ["Graphs"], concept: `C${i}`, answered: true, correct: i < correct, created_at: new Date(2026, 9, i + 1)
    }))
  });

  it("picks the difficulty from the learner's accuracy", () => {
    assert.equal(quizPersonalization(withQuizzes(4, 1)).difficulty, "foundational");
    assert.equal(quizPersonalization(withQuizzes(5, 5)).difficulty, "challenging");
    assert.equal(quizPersonalization(withQuizzes(1, 1)).difficulty, "standard");
  });

  it("revisits misses and avoids repeats", () => {
    const p = quizPersonalization(buildLearnerProfile(raw), ["Q1?", "Q2?"]);
    assert.deepEqual(p.revisit, ["Memoization", "Base cases"]);
    assert.deepEqual(p.avoid, ["Q1?", "Q2?"]);
  });
});

describe("personalised video prompts", () => {
  it("checks struggling learners more often and confident ones less", () => {
    const struggling = buildLearnerProfile(raw);
    assert.deepEqual(videoThresholds(struggling), { ...DEFAULT_VIDEO_THRESHOLDS, afterPauseS: 60, afterWatchS: 180 });

    const confident = buildLearnerProfile({
      ...empty,
      quizzes: Array.from({ length: 5 }, () => ({ topics: [], answered: true, correct: true, created_at: new Date() }))
    });
    assert.equal(videoThresholds(confident).afterWatchS, 360);
    assert.deepEqual(videoThresholds(buildLearnerProfile(empty)), DEFAULT_VIDEO_THRESHOLDS);
  });

  it("only reminds habitual switchers about unusual switching", () => {
    const switcher = buildLearnerProfile({
      ...empty,
      videos: [{ topics: [], playing_s: 3600, active_s: 1800, switches: 30, skip_count: 0, rewind_count: 0 }]
    });
    assert.equal(videoThresholds(switcher).switchesForFocus, 5);
    assert.equal(focusNote(switcher), "");

    const focused = buildLearnerProfile({
      ...empty,
      videos: [{ topics: [], playing_s: 3600, active_s: 3400, switches: 2, skip_count: 0, rewind_count: 0 }]
    });
    assert.match(focusNote(focused), /unusual for you/);
  });

  it("adds a personal line to the recall prompt, keeping the prompt itself", () => {
    const profile = buildLearnerProfile(raw);
    const note = recallNote(profile, ["Dynamic Programming"]);
    assert.match(note, /Dynamic Programming is one of your weaker topics/);
    assert.equal(recallNote(buildLearnerProfile(empty), ["Physics"]), "");

    const watch = {
      watch_time_s: 200, recall_marker_s: 0, playing_s: 200, active_s: 200,
      recall_playing_marker_s: 0, recall_active_marker_s: 0, tab_changes: 0, window_changes: 0,
      switch_marker: 0, skipped_s: 0, skipped_marker_s: 0, rewind_count: 0, rewind_marker: 0, topics: []
    };
    const nudge = decideVideoNudge({
      watch, event: "pause", lastNudgeAt: null, lastRecallAt: null, now: new Date(),
      thresholds: videoThresholds(profile), notes: { recall: note }
    });
    assert.ok(nudge.message.startsWith(RECALL_MESSAGE));
    assert.match(nudge.message, /weaker topics/);
  });

  it("uses the personal thresholds", () => {
    const watch = {
      watch_time_s: 70, recall_marker_s: 0, playing_s: 70, active_s: 70,
      recall_playing_marker_s: 0, recall_active_marker_s: 0, tab_changes: 0, window_changes: 0,
      switch_marker: 0, skipped_s: 0, skipped_marker_s: 0, rewind_count: 0, rewind_marker: 0, topics: []
    };
    const decide = thresholds => decideVideoNudge({ watch, event: "pause", lastNudgeAt: null, lastRecallAt: null, now: new Date(), thresholds });
    assert.equal(decide({}), null);                       // default: 90 s
    assert.equal(decide({ afterPauseS: 60 }).type, "ACTIVE_RECALL");
  });
});

describe("personalised LeetCode nudges", () => {
  it("passes the learner's pace and a related solved problem", () => {
    const profile = buildLearnerProfile(raw, { topics: ["Array"], problemSlug: "best-time", difficulty: "Easy" });
    const personal = leetCodePersonal(profile, "Easy");
    assert.equal(personal.expectedSolveMs, 12 * MIN);
    assert.equal(personal.topic, "Arrays");
    assert.equal(personal.topicStatus, "strong");
    assert.ok(personal.solvedSimilar);
  });
});

describe("hint history", () => {
  it("ignores hints on problems that were already solved", () => {
    const profile = buildLearnerProfile({
      ...empty,
      problems: [problem("two-sum")],
      hints: Array.from({ length: 4 }, () => ({
        problem_slug: "two-sum", at: new Date("2026-10-05"), solved_at: new Date("2026-10-01")
      }))
    });
    assert.deepEqual(profile.hints, { given: 0, followedBySolvePct: null });
  });

  it("drops the hands-off style when earlier hints did not help", () => {
    const profile = buildLearnerProfile({
      ...raw,
      hints: Array.from({ length: 3 }, () => ({ problem_slug: "x", at: new Date("2026-10-05"), solved_at: null }))
    }, { topics: ["Array"], problemSlug: "best-time" });
    const style = mentorStyle(profile).join(" ");
    assert.doesNotMatch(style, /do not name the technique/);
    assert.match(style, /be noticeably more specific/);
  });
});

