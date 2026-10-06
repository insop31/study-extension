import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { classifyVideo, deriveTopicFromTitle } from "../src/core/youtubeClassifier.ts";


describe("classifyVideo", () => {

  it("accepts a programming course in the Education category", () => {

    const result = classifyVideo({
      title: "Dynamic Programming - Learn to Solve Algorithmic Problems & Coding Challenges",
      channel: "freeCodeCamp.org",
      category: "Education",
      description: "Learn how to use Dynamic Programming in this course for beginners."
    });

    assert.equal(result.educational, true);
    assert.ok(result.topics.includes("Dynamic Programming"));

  });


  it("accepts a tutorial even when YouTube files it under Science & Technology", () => {

    const result = classifyVideo({
      title: "Python Tutorial for Beginners - Full Course",
      category: "Science & Technology"
    });

    assert.equal(result.educational, true);
    assert.deepEqual(result.topics, ["Python"]);

  });


  it("accepts a lecture with no category", () => {

    const result = classifyVideo({
      title: "Lecture 4: Graphs, BFS and DFS explained",
      description: "Algorithms course, MIT"
    });

    assert.equal(result.educational, true);
    assert.ok(result.topics.includes("Graphs"));

  });


  it("rejects music videos", () => {

    const result = classifyVideo({
      title: "Rick Astley - Never Gonna Give You Up (Official Music Video)",
      category: "Music"
    });

    assert.equal(result.educational, false);
    assert.deepEqual(result.topics, []);

  });


  it("rejects gaming and vlogs", () => {

    assert.equal(
      classifyVideo({ title: "Minecraft Let's Play #42", category: "Gaming" }).educational,
      false
    );

    assert.equal(
      classifyVideo({ title: "Day in my life vlog", category: "People & Blogs" }).educational,
      false
    );

  });


  it("rejects a tech product review that is not teaching", () => {

    const result = classifyVideo({
      title: "iPhone 17 Pro review: worth it?",
      category: "Science & Technology"
    });

    assert.equal(result.educational, false);

  });


  it("does not let a trailer for a course-like title through", () => {

    const result = classifyVideo({
      title: "Learn Physics - Official Trailer",
      category: "Film & Animation"
    });

    assert.equal(result.educational, false);

  });



  it("recognises C as a subject", () => {

    const result = classifyVideo({
      title: "C Language Tutorial for Beginners (with Notes & Practice Questions)",
      category: "Education"
    });

    assert.equal(result.educational, true);
    assert.deepEqual(result.topics, ["C Programming"]);

  });


  it("names the subject from the title when it is not in the topic list", () => {

    const result = classifyVideo({
      title: "Bayesian Thinking Lecture 3: Priors and Posteriors",
      category: "Education"
    });

    assert.equal(result.educational, true);
    assert.deepEqual(result.topics, ["Bayesian Thinking"]);

  });


  it("derives a short subject from a title", () => {

    assert.equal(
      deriveTopicFromTitle("Organic Chemistry Full Course for Beginners (2024)"),
      "Organic Chemistry"
    );

    assert.equal(
      deriveTopicFromTitle("How to learn"),
      undefined
    );

  });

});
