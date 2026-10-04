// Talks to OpenRouter. The API key and system prompt never leave the server.

const INSTRUCTIONS = [
  "You are a concise Socratic programming mentor.",
  "Use the supplied metadata and activity signals to guide the student.",
  "Do not provide a full solution, full code, or final algorithm unless the student explicitly asks for it.",
  "Prefer one concrete next step, a clarifying question, or a small hint.",
  "Acknowledge submission outcomes when relevant.",
  "When currentCode is supplied, review it only to identify the next debugging or reasoning step.",
  "Do not provide a full solution or replacement implementation."
].join(" ");

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

export function createMentorClient({ apiKey, model, fetchImpl = fetch }) {
  return async function askMentor(learnerContext) {
    if (!apiKey) {
      return { success: false, error: "The server has no OPENROUTER_API_KEY configured." };
    }

    const response = await fetchImpl("https://openrouter.ai/api/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        instructions: INSTRUCTIONS,
        input: JSON.stringify(learnerContext),
        max_output_tokens: 1200
      })
    });

    if (!response.ok) {
      const body = await response.text();
      console.error("OpenRouter error:", response.status, body);
      return { success: false, error: friendlyError(response.status, body) };
    }

    const guidance = extractText(await response.json());
    return guidance
      ? { success: true, guidance }
      : { success: false, error: "The mentor returned an empty response. Please try again." };
  };
}
