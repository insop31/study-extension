// Talks to OpenRouter. The API key and system prompts never leave the server.

const INSTRUCTIONS = [
  "You are a concise Socratic programming mentor.",
  "Use the supplied metadata and activity signals to guide the student.",
  "Do not provide a full solution, full code, or final algorithm unless the student explicitly asks for it.",
  "Prefer one concrete next step, a clarifying question, or a small hint.",
  "Acknowledge submission outcomes when relevant.",
  "When currentCode is supplied, review it only to identify the next debugging or reasoning step.",
  "Do not provide a full solution or replacement implementation."
].join(" ");

// For questions about a video or a page: explain, don't just hint.
const EXPLAIN_INSTRUCTIONS = [
  "You are a patient study mentor helping a student understand learning material.",
  "The input gives the title and topics of what they are studying (a video or a web page) and, when available, an excerpt of it.",
  "Answer the student's question using the excerpt when it is relevant; explain in plain language with one short example.",
  "Check understanding by ending with one short question they can answer themselves.",
  "Keep it under 150 words. If the question is unrelated to the material, still help briefly."
].join(" ");

const REQUEST_TIMEOUT_MS = 40_000;

export function extractText(data) {
  if (typeof data?.output_text === "string" && data.output_text.trim()) {
    return data.output_text.trim();
  }
  const texts = [];
  for (const item of data?.output ?? []) {
    if (item?.type && item.type !== "message") continue;
    if (typeof item.content === "string" && item.content.trim()) {
      texts.push(item.content.trim());
      continue;
    }
    for (const part of Array.isArray(item.content) ? item.content : []) {
      if (typeof part?.text === "string" && part.text.trim() && part.type !== "reasoning") {
        texts.push(part.text.trim());
      }
    }
  }
  for (const choice of data?.choices ?? []) {
    const content = choice?.message?.content ?? choice?.text;
    if (typeof content === "string" && content.trim()) {
      texts.push(content.trim());
      continue;
    }
    for (const part of Array.isArray(content) ? content : []) {
      if (typeof part?.text === "string" && part.text.trim() && part.type !== "reasoning") {
        texts.push(part.text.trim());
      }
    }
  }
  return texts.join("\n") || undefined;
}

function friendlyError(status, body) {
  let message;
  try {
    message = JSON.parse(body)?.error?.message?.trim();
  } catch {
    // ignore unparseable error bodies
  }
  if (status === 401) return "The server's OpenRouter API key was rejected. Check OPENROUTER_API_KEY.";
  if (status === 429) return "The AI model is rate-limited right now. Wait a minute and try again, or change OPENROUTER_MODEL.";
  return message ? `OpenRouter error (${status}): ${message}` : "The mentor request failed.";
}

// Returns async ({ instructions, input, maxOutputTokens }) =>
//   { success: true, text } | { success: false, error }
//
// Reasoning models think before they answer and that thinking counts against
// max_output_tokens, so the budget is generous and the effort is kept low;
// otherwise the answer can be cut off before it starts.
export function createCompleter({ apiKey, model, fetchImpl = fetch }) {
  return async function complete({ instructions, input, maxOutputTokens = 6000 }) {
    if (!apiKey) {
      return { success: false, error: "The server has no OPENROUTER_API_KEY configured." };
    }

    let response;
    try {
      response = await fetchImpl("https://openrouter.ai/api/v1/responses", {
        method: "POST",
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model,
          instructions,
          input,
          max_output_tokens: maxOutputTokens,
          reasoning: { effort: "low" }
        })
      });
    } catch (error) {
      console.error("OpenRouter request failed:", error.message);
      return { success: false, error: "The AI model did not respond in time. Please try again." };
    }

    if (!response.ok) {
      const body = await response.text();
      console.error("OpenRouter error:", response.status, body);
      return { success: false, error: friendlyError(response.status, body) };
    }

    const text = extractText(await response.json());
    return text
      ? { success: true, text }
      : { success: false, error: "The AI model returned no answer (it may have run out of tokens while thinking). Please try again." };
  };
}

export function createMentorClient({ apiKey, model, fetchImpl = fetch }) {
  const complete = createCompleter({ apiKey, model, fetchImpl });

  // style: extra instructions that adapt the hint to this learner.
  return async function askMentor(learnerContext, { style = [], platform = "leetcode" } = {}) {
    const result = await complete({
      instructions: [
        platform === "leetcode" ? INSTRUCTIONS : EXPLAIN_INSTRUCTIONS,
        "The input's `learner` field describes this student's history; use it to pitch the hint at the right level, but never recite their statistics back to them.",
        ...style
      ].join(" "),
      input: JSON.stringify(learnerContext),
      maxOutputTokens: 3000
    });

    return result.success
      ? { success: true, guidance: result.text }
      : { success: false, error: result.error };
  };
}
