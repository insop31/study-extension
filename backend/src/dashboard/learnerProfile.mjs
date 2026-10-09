// A compact picture of one learner, built from their stored history, that the
// mentor uses to adapt what it says and when. Pure: takes rows, returns data.

import { buildTopics, canonicalTopic } from "./metrics.mjs";

// Fewer samples than this and a "typical" figure would be noise.
const MIN_SAMPLES = 2;

function median(values) {
  if (values.length < MIN_SAMPLES) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

const pct = (part, whole) => (whole > 0 ? Math.round((part / whole) * 100) : null);

export function learnerLevel(problems) {
  const solved = difficulty => problems.filter(p => p.solved && p.difficulty === difficulty).length;
  if (solved("Hard") >= 3 || solved("Medium") >= 15) return "advanced";
  if (solved("Medium") >= 3) return "intermediate";
  return "beginner";
}

/**
 * raw: {
 *   problems: [{ title, slug, difficulty, topics, attempts, accepted, solved, solve_ms, active_ms, last_seen }],
 *   languages: [{ language, n }],
 *   videos: [{ topics, watch_time_s, playing_s, active_s, switches, skip_count, rewind_count }],
 *   quizzes: [{ topics, concept, answered, correct, created_at }],
 *   hints: [{ problem_slug, at, solved_at }],
 *   avgSessionMs, activeDays14
 * }
 * focus: { topics?: string[], difficulty?: string, problemSlug?: string }
 */
export function buildLearnerProfile(raw, focus = {}) {
  const problems = raw.problems.map(p => ({
    ...p,
    attempts: Number(p.attempts),
    accepted: Number(p.accepted),
    solve_ms: p.solve_ms === null || p.solve_ms === undefined ? null : Number(p.solve_ms),
    active_ms: Number(p.active_ms ?? 0)
  }));

  const topics = buildTopics({
    problems,
    videos: raw.videos,
    quizzes: raw.quizzes,
    readings: raw.readings ?? []
  });

  const attempted = problems.filter(p => p.attempts > 0);
  const solved = problems.filter(p => p.solved);
  const totalAttempts = attempted.reduce((acc, p) => acc + p.attempts, 0);
  const totalAccepted = attempted.reduce((acc, p) => acc + p.accepted, 0);

  const typicalSolveMs = {};
  for (const difficulty of ["Easy", "Medium", "Hard"]) {
    typicalSolveMs[difficulty] = median(
      solved
        .filter(p => p.difficulty === difficulty && p.solve_ms > 0)
        .map(p => p.solve_ms)
    );
  }

  // Attempts it usually takes to get accepted, over solved problems.
  const attemptsToSolve = median(solved.map(p => p.attempts).filter(n => n > 0));

  // ---- quizzes ----
  const answered = raw.quizzes.filter(q => q.answered);
  const recentMisses = [];
  for (const q of [...answered].sort((a, b) => b.created_at - a.created_at)) {
    if (q.correct) continue;
    const label = q.concept || q.topics?.[0];
    if (label && !recentMisses.includes(label)) recentMisses.push(label);
    if (recentMisses.length === 3) break;
  }

  // ---- video habits (only meaningful after 10+ minutes of playback) ----
  const playingS = raw.videos.reduce((acc, v) => acc + Number(v.playing_s ?? 0), 0);
  const hours = playingS / 3600;
  const videoHabits = playingS >= 600
    ? {
      activePct: pct(raw.videos.reduce((acc, v) => acc + Number(v.active_s ?? 0), 0), playingS),
      switchesPerHour: Math.round(raw.videos.reduce((acc, v) => acc + Number(v.switches ?? 0), 0) / hours),
      skipsPerHour: Math.round(raw.videos.reduce((acc, v) => acc + Number(v.skip_count ?? 0), 0) / hours),
      rewindsPerHour: Math.round(raw.videos.reduce((acc, v) => acc + Number(v.rewind_count ?? 0), 0) / hours)
    }
    : null;

  // ---- did earlier AI hints lead to a solve? ----
  // Only hints given while the problem was still unsolved can have helped.
  const usefulHints = raw.hints.filter(h => !(h.solved_at && h.solved_at <= h.at));
  const hintsGiven = usefulHints.length;
  const hintsFollowedBySolve = usefulHints.filter(h => h.solved_at && h.solved_at > h.at).length;

  // ---- the topics in focus right now (the current problem or video) ----
  const focusNames = [...new Set((focus.topics ?? []).map(canonicalTopic).filter(Boolean))];
  const focusTopics = focusNames.map(name => {
    const stats = topics.find(t => t.topic === name);
    const related = problems
      .filter(p => p.slug !== focus.problemSlug && (p.topics ?? []).some(t => canonicalTopic(t) === name))
      .sort((a, b) => b.last_seen - a.last_seen);
    return {
      topic: name,
      status: stats?.status ?? "new",
      mastery: stats?.mastery ?? null,
      problemsSolved: stats?.problemsSolved ?? 0,
      problemsAttempted: stats?.problemsAttempted ?? 0,
      quizAccuracy: stats?.quizAccuracy ?? null,
      quizAnswered: stats?.quizAnswered ?? 0,
      studyMs: stats?.studyMs ?? 0,
      solvedExamples: related.filter(p => p.solved).slice(0, 3).map(p => p.title),
      unsolvedExamples: related.filter(p => !p.solved && p.attempts > 0).slice(0, 2).map(p => p.title)
    };
  });

  const currentProblem = focus.problemSlug
    ? problems.find(p => p.slug === focus.problemSlug) ?? null
    : null;

  const language = raw.languages.find(l => l.language)?.language ?? null;

  return {
    level: learnerLevel(problems),
    preferredLanguage: language,
    problemsSolved: solved.length,
    problemsAttempted: attempted.length,
    successRate: pct(solved.length, attempted.length),
    attemptAccuracy: pct(totalAccepted, totalAttempts),
    attemptsToSolve,
    typicalSolveMs,
    strongTopics: topics.filter(t => t.status === "strong").slice(0, 3).map(t => ({ topic: t.topic, mastery: t.mastery })),
    weakTopics: topics
      .filter(t => t.status === "weak")
      .sort((a, b) => a.mastery - b.mastery)
      .slice(0, 3)
      .map(t => ({ topic: t.topic, mastery: t.mastery })),
    quiz: {
      answered: answered.length,
      accuracy: pct(answered.filter(q => q.correct).length, answered.length),
      recentMisses
    },
    videoHabits,
    hints: {
      given: hintsGiven,
      followedBySolvePct: pct(hintsFollowedBySolve, hintsGiven)
    },
    study: {
      avgSessionMinutes: Math.round((raw.avgSessionMs ?? 0) / 60000),
      activeDaysLast14: raw.activeDays14 ?? 0
    },
    focusTopics,
    currentProblem: currentProblem
      ? {
        attempts: currentProblem.attempts,
        activeMs: currentProblem.active_ms,
        solved: currentProblem.solved
      }
      : null
  };
}
