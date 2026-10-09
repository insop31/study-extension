import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { keyIdea } from "../src/dashboard/concepts.mjs";
import { buildRhythm, periodOf } from "../src/dashboard/metrics.mjs";
import {
  breakAfterMs,
  breakMessage,
  chooseConceptReminder,
  problemFocusMessage,
  shouldRemindProblemFocus,
  shouldSuggestBreak
} from "../src/dashboard/reminders.mjs";
import { buildRecommendations } from "../src/dashboard/recommendations.mjs";

const MIN = 60_000;
const now = new Date("2026-10-09T12:00:00Z");

describe("break reminders", () => {
  it("fits the break interval to the learner's usual session length", () => {
    assert.equal(breakAfterMs(null), 60 * MIN);
    assert.equal(breakAfterMs({ study: { avgSessionMinutes: 10 } }), 60 * MIN);
    assert.equal(breakAfterMs({ study: { avgSessionMinutes: 20 } }), 45 * MIN);
    assert.equal(breakAfterMs({ study: { avgSessionMinutes: 60 } }), 75 * MIN);
    assert.equal(breakAfterMs({ study: { avgSessionMinutes: 200 } }), 90 * MIN);
  });

  it("suggests a break after a long stretch, but not twice in a row", () => {
    assert.equal(shouldSuggestBreak({ focusMs: 30 * MIN, lastBreakAt: null, now, profile: null }), false);
    assert.equal(shouldSuggestBreak({ focusMs: 61 * MIN, lastBreakAt: null, now, profile: null }), true);
    assert.equal(
      shouldSuggestBreak({ focusMs: 70 * MIN, lastBreakAt: new Date(now.getTime() - 20 * MIN), now, profile: null }),
      false
    );
    assert.match(breakMessage(64 * MIN), /studying for 64 minutes without a break/);
  });
});

describe("concept reminders", () => {
  const focus = (topic, extra) => ({
    topic, status: "new", mastery: null, problemsSolved: 0, problemsAttempted: 0,
    quizAccuracy: null, quizAnswered: 0, studyMs: 0, solvedExamples: [], unsolvedExamples: [], ...extra
  });
  const profile = (focusTopics, recentMisses = []) => ({ focusTopics, quiz: { recentMisses } });
  const none = { remindedToday: new Set(), remindedEver: new Set() };

  it("has a key idea for the main topics", () => {
    for (const topic of ["Arrays", "Graphs", "Dynamic Programming", "C Programming", "Calculus"]) {
      assert.ok(keyIdea(topic), topic);
    }
    assert.equal(keyIdea("Underwater Basket Weaving"), null);
  });

  it("reminds a struggling learner of the key idea", () => {
    const choice = chooseConceptReminder(
      profile([focus("Graphs", { status: "weak", mastery: 20, problemsAttempted: 4, studyMs: 60 * MIN })]),
      none
    );
    assert.equal(choice.topic, "Graphs");
    assert.match(choice.message, /Graphs has been tricky for you so far. Key idea: Model the problem/);
  });

  it("mentions a missed quiz question when quiz answers are the trouble", () => {
    const choice = chooseConceptReminder(
      profile([focus("Dynamic Programming", { quizAccuracy: 25, quizAnswered: 4, studyMs: MIN })], ["Memoization"]),
      none
    );
    assert.match(choice.message, /recently missed a question on Memoization/);
  });

  it("introduces a brand-new topic once, and only once", () => {
    const p = profile([focus("Tries")]);
    assert.match(chooseConceptReminder(p, none).message, /^New topic: Tries/);
    assert.equal(chooseConceptReminder(p, { remindedToday: new Set(), remindedEver: new Set(["Tries"]) }), null);
  });

  it("stays quiet for topics going well, already reminded today, or without a key idea", () => {
    assert.equal(chooseConceptReminder(profile([focus("Arrays", { status: "strong", problemsAttempted: 9, studyMs: MIN })]), none), null);
    assert.equal(
      chooseConceptReminder(profile([focus("Graphs", { status: "weak" })]), { remindedToday: new Set(["Graphs"]), remindedEver: new Set(["Graphs"]) }),
      null
    );
    assert.equal(chooseConceptReminder(profile([focus("Underwater Basket Weaving", { status: "weak" })]), none), null);
  });
});

describe("focus on a problem", () => {
  it("speaks up after enough switches, with a cooldown", () => {
    assert.equal(shouldRemindProblemFocus({ switches: 2, threshold: 3, lastFocusAt: null, now }), false);
    assert.equal(shouldRemindProblemFocus({ switches: 3, threshold: 3, lastFocusAt: null, now }), true);
    assert.equal(
      shouldRemindProblemFocus({ switches: 6, threshold: 3, lastFocusAt: new Date(now.getTime() - 5 * MIN), now }),
      false
    );
    assert.match(problemFocusMessage(4, "Coin Change"), /switched away from Coin Change 4 times/);
  });
});

describe("study rhythm", () => {
  it("places hours in the right part of the day", () => {
    assert.equal(periodOf(7), "morning");
    assert.equal(periodOf(12), "afternoon");
    assert.equal(periodOf(18), "evening");
    assert.equal(periodOf(23), "night");
    assert.equal(periodOf(3), "night");
  });

  it("finds when the learner studies most and is most accurate", () => {
    const attempts = [
      ...Array.from({ length: 6 }, (_, i) => ({ hour: 9, accepted: i < 5 })),   // morning 83%
      ...Array.from({ length: 10 }, (_, i) => ({ hour: 22, accepted: i < 3 }))  // night 30%
    ];
    const rhythm = buildRhythm({
      hours: [{ hour: 9, active_ms: 20 * MIN }, { hour: 22, active_ms: 120 * MIN }, { hour: 23, active_ms: 60 * MIN }],
      attempts
    });

    assert.equal(rhythm.mostStudied, "night");
    assert.equal(rhythm.sharpest, "morning");
    assert.equal(rhythm.periods.find(p => p.id === "morning").accuracy, 83);
    assert.equal(rhythm.overallAccuracy, 50);
    assert.match(rhythm.insight, /most accurate in the morning \(83% accepted vs 50% overall\), but you study most in the night/);

    const recs = buildRecommendations({
      summary: { thisWeekMs: 300 * MIN, lastWeekMs: 300 * MIN, weekChangePct: 0, activeDaysThisWeek: 6, streakDays: 0 },
      topics: [], problems: [], byDifficulty: [], dailyGoalMinutes: 60, rhythm
    });
    assert.ok(recs.some(r => r.id === "rhythm" && /hardest problems in the morning/.test(r.title)));
  });

  it("does not compare times of day without enough submissions", () => {
    const rhythm = buildRhythm({
      hours: [{ hour: 18, active_ms: 45 * MIN }],
      attempts: [{ hour: 9, accepted: true }, { hour: 22, accepted: false }]
    });
    assert.equal(rhythm.sharpest, null);
    assert.match(rhythm.insight, /study most in the evening/);
  });

  it("flags frequent switching away from problems", () => {
    const recs = buildRecommendations({
      summary: { thisWeekMs: 300 * MIN, lastWeekMs: 300 * MIN, weekChangePct: 0, activeDaysThisWeek: 6, streakDays: 0 },
      topics: [], problems: [], byDifficulty: [], dailyGoalMinutes: 60,
      focus: { problemSwitchesPerHour: 15 }
    });
    assert.ok(recs.some(r => r.id === "focus"));
  });
});
