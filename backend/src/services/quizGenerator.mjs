import { z } from "zod";

// Turns a bit of a video (its transcript, or just its title and topics) into
// one multiple-choice question, via the AI model.

const INSTRUCTIONS = [
  "You write one multiple-choice question that checks whether a learner understood what they just watched in an educational video.",
  "You are given the video's title and topics, and usually a transcript excerpt with [seconds] timestamps for the part they just watched.",
  "Test understanding of an idea, not trivia, wording or numbers that are easy to guess.",
  "When a transcript is given, the question must be answerable from that excerpt alone.",
  "When there is no transcript, ask a fundamental conceptual question about the video's main topic.",
  "Give exactly four options with exactly one correct answer; the wrong options must be plausible but clearly wrong to someone who understood.",
  "Write in the same language as the video title.",
  "Reply with ONLY a JSON object, no markdown, in this shape:",
  '{"question": string, "options": [string, string, string, string], "correctIndex": 0-3,',
  '"explanation": string (1-3 sentences saying why the correct option is right and why a wrong one is not),',
  '"concept": string (a few words naming the idea),',
  '"evidenceStartS": number (the [seconds] timestamp of the transcript line that best supports the answer; omit if there is no transcript)}'
].join(" ");

const quizSchema = z.object({
  question: z.string().trim().min(8).max(500),
  options: z.array(z.string().trim().min(1).max(300)).length(4),
  correctIndex: z.number().int().min(0).max(3),
  explanation: z.string().trim().min(3).max(1200),
  concept: z.string().trim().max(120).optional(),
  evidenceStartS: z.number().optional()
});

export function parseQuiz(text) {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) return null;

  let raw;
  try {
    raw = JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }

  const parsed = quizSchema.safeParse(raw);
  if (!parsed.success) return null;

  // Options must differ, or "which is correct" has no answer.
  const distinct = new Set(parsed.data.options.map(o => o.toLowerCase()));
  return distinct.size === parsed.data.options.length ? parsed.data : null;
}

// Models tend to put the right answer first; shuffle so position gives nothing away.
export function shuffleOptions(quiz, random = Math.random) {
  const order = quiz.options.map((_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return {
    ...quiz,
    options: order.map(i => quiz.options[i]),
    correctIndex: order.indexOf(quiz.correctIndex)
  };
}

// The part of the video to watch again if the answer was wrong.
export function rewatchRange({ evidenceStartS, excerpt, positionS }) {
  if (!excerpt) {
    return { startS: Math.max(0, Math.floor(positionS - 180)), endS: Math.floor(positionS) };
  }

  const inside =
    typeof evidenceStartS === "number" &&
    evidenceStartS >= excerpt.startS &&
    evidenceStartS <= excerpt.endS;

  const startS = Math.max(
    excerpt.startS,
    Math.floor(inside ? evidenceStartS - 5 : excerpt.startS)
  );
  return { startS, endS: Math.min(excerpt.endS, startS + 120) };
}

export function createQuizGenerator(complete, random = Math.random) {
  return async function generateQuiz({ video, excerpt, positionS }) {
    const input = JSON.stringify({
      title: video.title,
      channel: video.channel ?? undefined,
      topics: video.topics,
      transcript: excerpt?.text ?? null
    });

    let lastError = "The mentor could not write a question right now.";

    // One retry: models occasionally wrap the JSON in prose or break it.
    for (let attempt = 0; attempt < 2; attempt++) {
      const result = await complete({ instructions: INSTRUCTIONS, input, maxOutputTokens: 6000 });
      if (!result.success) return { success: false, error: result.error };

      const parsed = parseQuiz(result.text);
      if (parsed) {
        const quiz = shuffleOptions(parsed, random);
        return {
          success: true,
          quiz: {
            question: quiz.question,
            options: quiz.options,
            correctIndex: quiz.correctIndex,
            explanation: quiz.explanation,
            concept: quiz.concept ?? null,
            grounded: Boolean(excerpt),
            rewatch: rewatchRange({ evidenceStartS: quiz.evidenceStartS, excerpt, positionS })
          }
        };
      }
      lastError = "The mentor wrote a question in an unexpected format. Try again later.";
    }

    return { success: false, error: lastError };
  };
}
