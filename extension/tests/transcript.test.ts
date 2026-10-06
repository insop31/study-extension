import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildExcerpt, isSoundCue, parseTimestamp } from "../src/core/transcript.ts";


describe("parseTimestamp", () => {

  it("reads minutes and hours", () => {

    assert.equal(parseTimestamp("0:03"), 3);
    assert.equal(parseTimestamp("3:45"), 225);
    assert.equal(parseTimestamp("1:02:03"), 3723);
    assert.equal(parseTimestamp(" 12:00 "), 720);

  });


  it("rejects anything else", () => {

    assert.equal(parseTimestamp("soon"), null);
    assert.equal(parseTimestamp("45"), null);
    assert.equal(parseTimestamp("1:2:3:4"), null);
    assert.equal(parseTimestamp("1:xx"), null);

  });

});


describe("isSoundCue", () => {

  it("spots sound descriptions in any language", () => {

    assert.equal(isSoundCue("[Music]"), true);
    assert.equal(isSoundCue("[संगीत]"), true);
    assert.equal(isSoundCue("(applause)"), true);
    assert.equal(isSoundCue("♪ la la ♪"), true);
    assert.equal(isSoundCue("An array is a list"), false);

  });

});


describe("buildExcerpt", () => {

  const lines = [
    { startS: 10, text: "[Music]" },
    { startS: 20, text: "An array stores items." },
    { startS: 30, text: "Each item has an index." },
    { startS: 90, text: "Indexes start at zero." },
    { startS: 400, text: "Later topic." }
  ];

  it("returns the lines in range with their timestamps", () => {

    const excerpt = buildExcerpt(lines, 0, 100);

    assert.deepEqual(excerpt, {
      startS: 20,
      endS: 100,
      text: "[20] An array stores items.\n[30] Each item has an index.\n[90] Indexes start at zero."
    });

  });


  it("is empty when nothing was said in range", () => {

    assert.equal(buildExcerpt(lines, 100, 300), null);
    assert.equal(buildExcerpt([], 0, 100), null);

  });


  it("keeps the most recent lines when it must cut", () => {

    const excerpt = buildExcerpt(lines, 0, 100, 60);

    assert.ok(excerpt);
    assert.ok(excerpt.text.includes("Indexes start at zero."));
    assert.ok(!excerpt.text.includes("An array stores items."));
    assert.equal(excerpt.startS, 30);

  });

});
