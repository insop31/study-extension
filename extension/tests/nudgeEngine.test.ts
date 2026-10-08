import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  evaluateNudge,
  stuckAttempts,
  thinkingThresholdMs,
  type PersonalNudgeData
} from "../src/core/nudgeEngine.ts";


const MIN = 60_000;

const personal = (extra: Partial<PersonalNudgeData> = {}): PersonalNudgeData => ({
  expectedSolveMs: null,
  problemActiveMs: null,
  topic: null,
  topicStatus: null,
  solvedSimilar: null,
  attemptsToSolve: null,
  ...extra
});

const context = (extra = {}) => ({
  website: "leetcode",
  pageTitle: "Coin Change - LeetCode",
  activeTime: 0,
  userState: "active" as const,
  failedAttempts: 0,
  ...extra
});


describe("personal timing", () => {

  it("steps in a little after this learner's usual solving time", () => {

    assert.equal(thinkingThresholdMs(null), 10 * MIN);
    assert.equal(thinkingThresholdMs(personal({ expectedSolveMs: 16 * MIN })), 20 * MIN);
    assert.equal(thinkingThresholdMs(personal({ expectedSolveMs: 1 * MIN })), 5 * MIN);
    assert.equal(thinkingThresholdMs(personal({ expectedSolveMs: 60 * MIN })), 30 * MIN);

  });


  it("does not call someone stuck before their usual number of attempts", () => {

    assert.equal(stuckAttempts(null), 3);
    assert.equal(stuckAttempts(personal({ attemptsToSolve: 4 })), 5);
    assert.equal(stuckAttempts(personal({ attemptsToSolve: 1 })), 3);

  });


  it("waits for a slow, careful learner and nudges a fast one sooner", () => {

    const slow = personal({ expectedSolveMs: 24 * MIN, problemActiveMs: 15 * MIN });
    assert.equal(evaluateNudge(context({ personal: slow })), null);

    const fast = personal({ expectedSolveMs: 4 * MIN, problemActiveMs: 6 * MIN });
    assert.equal(evaluateNudge(context({ personal: fast }))?.type, "THINKING_PROMPT");

  });


  it("uses time on this problem rather than the whole session", () => {

    const nudge =
      evaluateNudge(context({
        activeTime: 60 * MIN,
        personal: personal({ problemActiveMs: 2 * MIN })
      }));

    assert.equal(nudge, null);

  });

});


describe("personal wording", () => {

  it("mentions their pace and builds on a strong topic", () => {

    const nudge =
      evaluateNudge(context({
        personal: personal({
          expectedSolveMs: 8 * MIN,
          problemActiveMs: 12 * MIN,
          topic: "Dynamic Programming",
          topicStatus: "strong"
        })
      }));

    assert.match(nudge!.message, /usually solve problems like this in about 8 min and you're 12 min into Coin Change/);
    assert.match(nudge!.message, /You're strong in Dynamic Programming/);
    assert.doesNotMatch(nudge!.message, / - LeetCode/);

  });


  it("suggests a simpler route for a weak topic", () => {

    const nudge =
      evaluateNudge(context({
        personal: personal({ problemActiveMs: 11 * MIN, topic: "Graphs", topicStatus: "weak" })
      }));

    assert.match(nudge!.message, /Graphs is still a weaker area for you: write down a brute-force approach first/);

  });


  it("points a stuck learner back to a problem they already solved", () => {

    const nudge =
      evaluateNudge(context({
        failedAttempts: 4,
        personal: personal({
          problemActiveMs: 12 * MIN,
          topic: "Dynamic Programming",
          topicStatus: "moderate",
          solvedSimilar: "Climbing Stairs - LeetCode"
        })
      }));

    assert.equal(nudge!.type, "STUCK");
    assert.match(nudge!.message, /You solved "Climbing Stairs", which uses the same Dynamic Programming idea/);

  });


  it("keeps the general nudge for a learner with no history", () => {

    const nudge =
      evaluateNudge(context({ activeTime: 11 * MIN }));

    assert.match(nudge!.message, /You've been working on Coin Change for a while/);

  });

});
