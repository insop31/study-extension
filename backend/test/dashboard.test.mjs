import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  addDays,
  buildTopics,
  byDay,
  canonicalTopic,
  dayRange,
  percentChange,
  streak,
  topicStatus,
  weakTopics,
  weekStart
} from "../src/dashboard/metrics.mjs";
import { buildRecommendations } from "../src/dashboard/recommendations.mjs";

const MIN = 60_000;

describe("calendar helpers", () => {
  it("adds days across month and year ends", () => {
    assert.equal(addDays("2026-01-31", 1), "2026-02-01");
    assert.equal(addDays("2026-01-01", -1), "2025-12-31");
  });

  it("finds the Monday of a week", () => {
    assert.equal(weekStart("2026-10-06"), "2026-10-05"); // Tuesday -> Monday
    assert.equal(weekStart("2026-10-05"), "2026-10-05"); // Monday
    assert.equal(weekStart("2026-10-11"), "2026-10-05"); // Sunday
  });

  it("lists days ending on a date", () => {
    assert.deepEqual(dayRange("2026-10-06", 3), ["2026-10-04", "2026-10-05", "2026-10-06"]);
  });
});

describe("study time", () => {
  const days = byDay([
    { day: "2026-10-06", platform: "leetcode", active_ms: 20 * MIN },
    { day: "2026-10-06", platform: "youtube", active_ms: "600000" },
    { day: "2026-10-05", platform: "youtube", active_ms: 5 * MIN },
    { day: "2026-10-04", platform: "leetcode", active_ms: 30 * 1000 }, // under a minute
    { day: "2026-10-03", platform: "leetcode", active_ms: 40 * MIN }
  ]);

  it("splits time by platform and day", () => {
    assert.deepEqual(days.get("2026-10-06"), { leetcode: 20 * MIN, youtube: 10 * MIN, other: 0, total: 30 * MIN });
  });

  it("counts a streak of days with at least a minute of study", () => {
    assert.equal(streak(days, "2026-10-06"), 2); // the 4th breaks it
  });

  it("keeps yesterday's streak alive before studying today", () => {
    assert.equal(streak(days, "2026-10-07"), 2);
    assert.equal(streak(days, "2026-10-08"), 0);
  });

  it("reports change against last week", () => {
    assert.equal(percentChange(50, 100), -50);
    assert.equal(percentChange(150, 100), 50);
    assert.equal(percentChange(10, 0), null);
    assert.equal(percentChange(0, 0), 0);
  });
});

describe("topics", () => {
  it("merges LeetCode tags and video topics into one name", () => {
    assert.equal(canonicalTopic("Array"), "Arrays");
    assert.equal(canonicalTopic("Hash Table"), "Hash Tables");
    assert.equal(canonicalTopic("Heap (Priority Queue)"), "Heaps");
    assert.equal(canonicalTopic("C Programming"), "C Programming");
  });

  const topics = buildTopics({
    problems: [
      { topics: ["Array", "Hash Table"], attempts: 1, accepted: 1, solved: true, active_ms: 10 * MIN, solve_ms: 10 * MIN },
      { topics: ["Array"], attempts: 3, accepted: 1, solved: true, active_ms: 30 * MIN, solve_ms: 30 * MIN },
      { topics: ["Dynamic Programming"], attempts: 4, accepted: 0, solved: false, active_ms: 40 * MIN, solve_ms: null }
    ],
    videos: [
      { topics: ["Arrays"], watch_time_s: 600 },
      { topics: ["Dynamic Programming"], watch_time_s: 1200 }
    ],
    quizzes: [
      { topics: ["Dynamic Programming"], answered: true, correct: false },
      { topics: ["Dynamic Programming"], answered: true, correct: true },
      { topics: ["Dynamic Programming"], answered: false, correct: null }
    ]
  });
  const find = name => topics.find(t => t.topic === name);

  it("combines problems, videos and quizzes per topic", () => {
    const arrays = find("Arrays");
    assert.equal(arrays.problemsAttempted, 2);
    assert.equal(arrays.problemsSolved, 2);
    assert.equal(arrays.successRate, 100);
    assert.equal(arrays.attemptAccuracy, 50);
    assert.equal(arrays.avgSolveMs, 20 * MIN);
    assert.equal(arrays.studyMs, 50 * MIN);
    assert.deepEqual(arrays.sources, ["leetcode", "youtube"]);
  });

  it("scores mastery and flags weak topics", () => {
    const dp = find("Dynamic Programming");
    assert.equal(dp.quizAnswered, 2);
    assert.equal(dp.quizAccuracy, 50);
    // solveRate 0 (0.35), attemptAccuracy 0 (0.35), quiz 0.5 (0.3) -> 15
    assert.equal(dp.mastery, 15);
    assert.equal(dp.status, "weak");
    assert.equal(find("Arrays").status, "strong");
    assert.deepEqual(weakTopics(topics).map(t => t.topic), ["Dynamic Programming"]);
  });

  it("does not judge a topic on too little evidence", () => {
    assert.equal(find("Hash Tables").status, "new"); // one submission
    assert.equal(topicStatus(90, 2), "new");
    assert.equal(topicStatus(50, 3), "moderate");
  });
});

describe("recommendations", () => {
  const baseSummary = {
    thisWeekMs: 5 * 60 * MIN, lastWeekMs: 5 * 60 * MIN, weekChangePct: 0,
    activeDaysThisWeek: 6, streakDays: 0
  };
  const topic = (topic, extra) => ({
    topic, problemsAttempted: 0, problemsSolved: 0, successRate: null, quizAccuracy: null,
    videoWatchMs: 0, mastery: null, evidence: 0, status: "new", ...extra
  });
  const recs = input => buildRecommendations({
    summary: baseSummary, topics: [], problems: [], byDifficulty: [], dailyGoalMinutes: 60, ...input
  });

  it("tells a new learner how to start", () => {
    const result = buildRecommendations({
      summary: { ...baseSummary, thisWeekMs: 0, lastWeekMs: 0 },
      topics: [], problems: [], byDifficulty: [], dailyGoalMinutes: 60
    });
    assert.equal(result.length, 1);
    assert.equal(result[0].id, "get-started");
  });

  it("puts weak topics first, with a practice link", () => {
    const result = recs({
      topics: [
        topic("Graphs", { problemsAttempted: 4, problemsSolved: 1, successRate: 25, mastery: 20, evidence: 8, status: "weak" }),
        topic("Arrays", { problemsAttempted: 5, problemsSolved: 5, successRate: 100, mastery: 95, evidence: 6, status: "strong" })
      ]
    });
    assert.equal(result[0].id, "weak-Graphs");
    assert.equal(result[0].action.url, "https://leetcode.com/tag/graph/");
    assert.match(result[0].detail, /25% of attempted problems solved/);
  });

  it("suggests the next topic after a strong one", () => {
    const result = recs({
      topics: [topic("Arrays", { problemsAttempted: 5, problemsSolved: 5, mastery: 95, evidence: 6, status: "strong" })]
    });
    assert.ok(result.some(r => r.id === "next-Hash Tables"));
  });

  it("turns watched-only topics into practice", () => {
    const result = recs({ topics: [topic("Dynamic Programming", { videoWatchMs: 25 * MIN })] });
    const rec = result.find(r => r.kind === "practice");
    assert.match(rec.title, /Dynamic Programming/);
    assert.match(rec.detail, /25 min/);
  });

  it("nudges towards consistency and flags a drop", () => {
    const result = recs({
      summary: { ...baseSummary, activeDaysThisWeek: 2, thisWeekMs: 60 * MIN, lastWeekMs: 300 * MIN, weekChangePct: -80 }
    });
    assert.ok(result.some(r => r.id === "consistency"));
    assert.ok(result.some(r => r.id === "trend"));
  });

  it("suggests Medium problems after a run of solved Easy ones", () => {
    const result = recs({
      byDifficulty: [
        { difficulty: "Easy", attempted: 6, solved: 6 },
        { difficulty: "Medium", attempted: 0, solved: 0 }
      ]
    });
    assert.ok(result.some(r => r.id === "level-up"));
  });

  it("brings back the latest unsolved problem", () => {
    const result = recs({
      problems: [
        { slug: "two-sum", title: "Two Sum", solved: false, attempts: 3, last_seen: new Date("2026-10-05") },
        { slug: "old", title: "Old", solved: false, attempts: 1, last_seen: new Date("2026-09-01") }
      ]
    });
    const rec = result.find(r => r.kind === "retry");
    assert.equal(rec.action.url, "https://leetcode.com/problems/two-sum/");
  });

  it("returns at most six, most important first", () => {
    const result = recs({
      summary: { ...baseSummary, activeDaysThisWeek: 1, streakDays: 5, thisWeekMs: 30 * MIN, lastWeekMs: 300 * MIN, weekChangePct: -90 },
      topics: [
        topic("Graphs", { problemsAttempted: 4, successRate: 0, mastery: 0, evidence: 8, status: "weak" }),
        topic("Trees", { problemsAttempted: 4, successRate: 10, mastery: 10, evidence: 8, status: "weak" }),
        topic("Arrays", { problemsAttempted: 5, problemsSolved: 5, mastery: 95, evidence: 6, status: "strong" }),
        topic("Dynamic Programming", { videoWatchMs: 30 * MIN })
      ],
      problems: [{ slug: "x", title: "X", solved: false, attempts: 2, last_seen: new Date() }]
    });
    assert.ok(result.length <= 6);
    const priorities = result.map(r => r.priority);
    assert.deepEqual(priorities, [...priorities].sort());
  });
});
