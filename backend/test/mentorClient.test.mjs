import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { extractText } from "../src/services/mentorClient.mjs";

describe("extractText", () => {
  it("extracts text from Responses API output", () => {
    assert.equal(extractText({
      output: [{ type: "message", content: [{ type: "output_text", text: "A small hint." }] }]
    }), "A small hint.");
  });

  it("extracts text from Chat Completions responses", () => {
    assert.equal(extractText({
      choices: [{ message: { content: "A small hint." } }]
    }), "A small hint.");
  });

  it("extracts text blocks and ignores reasoning in Chat Completions responses", () => {
    assert.equal(extractText({
      choices: [{ message: { content: [
        { type: "reasoning", text: "internal reasoning" },
        { type: "text", text: "A small hint." }
      ] } }]
    }), "A small hint.");
  });

  it("returns undefined when the response contains no text", () => {
    assert.equal(extractText({ choices: [{ message: { content: "" } }] }), undefined);
  });
});
