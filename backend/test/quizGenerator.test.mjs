import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createQuizGenerator, parseQuiz, rewatchRange, shuffleOptions } from "../src/services/quizGenerator.mjs";

const good = {
  question: "What does memoization store?",
  options: ["Results of subproblems", "The input", "A random seed", "Nothing"],
  correctIndex: 0,
  explanation: "It caches results so subproblems are not solved twice.",
  concept: "Memoization",
  evidenceStartS: 700
};

const video = { title: "Memoization explained", topics: ["Dynamic Programming"] };
const excerpt = { startS: 600, endS: 840, text: "[700] Memoization stores results." };

describe("parseQuiz", () => {
  it("reads JSON even when wrapped in prose or a code fence", () => {
    const text = "Here you go:\n```json\n" + JSON.stringify(good) + "\n```";
    assert.equal(parseQuiz(text).question, good.question);
  });

  it("rejects broken or malformed questions", () => {
    assert.equal(parseQuiz("no json here"), null);
    assert.equal(parseQuiz("{not json}"), null);
    assert.equal(parseQuiz(JSON.stringify({ ...good, options: ["a", "b", "c"] })), null);
    assert.equal(parseQuiz(JSON.stringify({ ...good, correctIndex: 7 })), null);
    assert.equal(parseQuiz(JSON.stringify({ ...good, options: ["a", "A", "b", "c"] })), null);
  });
});

describe("shuffleOptions", () => {
  it("keeps the correct answer pointing at the right option", () => {
    for (let seed = 0; seed < 20; seed++) {
      let state = seed + 1;
      const random = () => ((state = (state * 48271) % 2147483647) / 2147483647);
      const shuffled = shuffleOptions(good, random);
      assert.equal(shuffled.options[shuffled.correctIndex], "Results of subproblems");
      assert.deepEqual([...shuffled.options].sort(), [...good.options].sort());
    }
  });
});

describe("rewatchRange", () => {
  it("starts a few seconds before the supporting line, within the excerpt", () => {
    assert.deepEqual(rewatchRange({ evidenceStartS: 700, excerpt, positionS: 840 }), { startS: 695, endS: 815 });
  });

  it("ignores a timestamp outside the excerpt", () => {
    assert.deepEqual(rewatchRange({ evidenceStartS: 5, excerpt, positionS: 840 }), { startS: 600, endS: 720 });
  });

  it("never runs past the end of the excerpt", () => {
    assert.deepEqual(rewatchRange({ evidenceStartS: 830, excerpt, positionS: 840 }), { startS: 825, endS: 840 });
  });

  it("uses the last three minutes when there is no transcript", () => {
    assert.deepEqual(rewatchRange({ excerpt: null, positionS: 900 }), { startS: 720, endS: 900 });
    assert.deepEqual(rewatchRange({ excerpt: null, positionS: 60 }), { startS: 0, endS: 60 });
  });
});

describe("createQuizGenerator", () => {
  it("returns a graded-ready question with a rewatch range", async () => {
    const generate = createQuizGenerator(async () => ({ success: true, text: JSON.stringify(good) }), () => 0.5);
    const result = await generate({ video, excerpt, positionS: 840 });

    assert.equal(result.success, true);
    assert.equal(result.quiz.options[result.quiz.correctIndex], "Results of subproblems");
    assert.equal(result.quiz.grounded, true);
    assert.deepEqual(result.quiz.rewatch, { startS: 695, endS: 815 });
  });

  it("sends the transcript and topics to the model", async () => {
    let sent;
    const generate = createQuizGenerator(async args => { sent = args; return { success: true, text: JSON.stringify(good) }; });
    await generate({ video, excerpt, positionS: 840 });

    const input = JSON.parse(sent.input);
    assert.equal(input.title, "Memoization explained");
    assert.deepEqual(input.topics, ["Dynamic Programming"]);
    assert.match(input.transcript, /Memoization stores results/);
  });

  it("retries once when the first reply is unusable", async () => {
    const replies = ["sorry, I can't", JSON.stringify(good)];
    const generate = createQuizGenerator(async () => ({ success: true, text: replies.shift() }));
    assert.equal((await generate({ video, excerpt: null, positionS: 100 })).success, true);
    assert.equal(replies.length, 0);
  });

  it("gives up with a clear message after two bad replies", async () => {
    const generate = createQuizGenerator(async () => ({ success: true, text: "nope" }));
    const result = await generate({ video, excerpt: null, positionS: 100 });
    assert.equal(result.success, false);
    assert.match(result.error, /unexpected format/);
  });

  it("passes the model's own error straight through", async () => {
    const generate = createQuizGenerator(async () => ({ success: false, error: "rate-limited" }));
    assert.deepEqual(await generate({ video, excerpt: null, positionS: 1 }), { success: false, error: "rate-limited" });
  });
});
