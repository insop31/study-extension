// Turns dashboard numbers into a short, ordered list of things to do next.
// Rule-based so it is predictable, explainable and works without the AI model.

import { NEXT_TOPICS, leetCodeTagUrl, weakTopics } from "./metrics.mjs";

const minutes = ms => Math.round(ms / 60000);

const youtubeSearch = topic =>
  `https://www.youtube.com/results?search_query=${encodeURIComponent(`${topic} explained`)}`;

/**
 * @param {object} input
 * @param {object} input.summary   the dashboard summary block
 * @param {Array}  input.topics    from buildTopics
 * @param {Array}  input.problems  recent problems [{ title, slug, solved, attempts, last_seen }]
 * @param {Array}  input.byDifficulty [{ difficulty, solved, attempted }]
 * @param {number} input.dailyGoalMinutes
 * @returns {Array<{ id, kind, priority, title, detail, action? }>}
 *   priority: 1 = do this first, 3 = nice to know
 */
export function buildRecommendations({ summary, topics, problems, byDifficulty, dailyGoalMinutes }) {
  const recs = [];
  const add = rec => recs.push(rec);

  const hasAnyData = summary.thisWeekMs > 0 || summary.lastWeekMs > 0 || topics.length > 0;
  if (!hasAnyData) {
    return [{
      id: "get-started",
      kind: "start",
      priority: 1,
      title: "Start your first study session",
      detail: "Open a LeetCode problem or an educational YouTube video and start a session from the side panel. Your dashboard fills in as you study."
    }];
  }

  // 1. Weak topics: practise before moving on.
  for (const t of weakTopics(topics, 2)) {
    const evidence = [];
    if (t.successRate !== null) evidence.push(`${t.successRate}% of attempted problems solved`);
    if (t.quizAccuracy !== null) evidence.push(`${t.quizAccuracy}% of video questions right`);
    const url = leetCodeTagUrl(t.topic);

    add({
      id: `weak-${t.topic}`,
      kind: "weak-topic",
      priority: 1,
      title: `Strengthen ${t.topic}`,
      detail:
        `${t.topic} is your weakest area (${evidence.join(", ")}). ` +
        (url
          ? "Solve 2-3 easy problems on it before moving to harder ones, and read the editorial after each."
          : "Rewatch the parts you got wrong and explain the idea in your own words before moving on."),
      action: url
        ? { label: `Easy ${t.topic} problems`, url }
        : { label: `Videos on ${t.topic}`, url: youtubeSearch(t.topic) }
    });
  }

  // 2. Watched but never practised: turn passive learning into practice.
  const watchedOnly = topics
    .filter(t => t.videoWatchMs >= 10 * 60000 && t.problemsAttempted === 0 && leetCodeTagUrl(t.topic))
    .sort((a, b) => b.videoWatchMs - a.videoWatchMs)[0];
  if (watchedOnly) {
    add({
      id: `practise-${watchedOnly.topic}`,
      kind: "practice",
      priority: 1,
      title: `Practise what you watched: ${watchedOnly.topic}`,
      detail: `You've watched ${minutes(watchedOnly.videoWatchMs)} min of ${watchedOnly.topic} videos but haven't tried a problem on it yet. Solving one now is the best way to make it stick.`,
      action: { label: `${watchedOnly.topic} problems`, url: leetCodeTagUrl(watchedOnly.topic) }
    });
  }

  // 3. Unsolved problems worth another go.
  const unsolved = problems
    .filter(p => !p.solved && p.attempts > 0)
    .sort((a, b) => new Date(b.last_seen) - new Date(a.last_seen))[0];
  if (unsolved) {
    add({
      id: `retry-${unsolved.slug}`,
      kind: "retry",
      priority: 2,
      title: `Finish "${unsolved.title}"`,
      detail: `You made ${unsolved.attempts} attempt${unsolved.attempts === 1 ? "" : "s"} without an accepted solution. Coming back after a break often makes the idea click.`,
      action: { label: "Open problem", url: `https://leetcode.com/problems/${unsolved.slug}/` }
    });
  }

  // 4. Consistency and the daily goal.
  const goalMs = dailyGoalMinutes * 60000;
  const avgDayMs = summary.thisWeekMs / 7;
  if (summary.activeDaysThisWeek < 4) {
    add({
      id: "consistency",
      kind: "habit",
      priority: 2,
      title: "Study a little every day",
      detail: `You studied on ${summary.activeDaysThisWeek} of the last 7 days. Short daily sessions (even ${Math.min(30, dailyGoalMinutes)} min) beat occasional long ones for remembering what you learn.`
    });
  } else if (avgDayMs < goalMs * 0.6) {
    add({
      id: "goal",
      kind: "habit",
      priority: 3,
      title: `Work towards your ${dailyGoalMinutes}-minute daily goal`,
      detail: `You're averaging ${minutes(avgDayMs)} min a day this week. Adding one more focused session a day would get you there.`
    });
  }

  // 5. Week-on-week drop.
  if (summary.weekChangePct !== null && summary.weekChangePct <= -30 && summary.lastWeekMs >= 30 * 60000) {
    add({
      id: "trend",
      kind: "habit",
      priority: 2,
      title: "Your study time dropped this week",
      detail: `${minutes(summary.thisWeekMs)} min this week vs ${minutes(summary.lastWeekMs)} min last week (${summary.weekChangePct}%). Block out a regular time slot to get back on track.`
    });
  }

  // 6. Ready for harder problems.
  const easy = byDifficulty.find(d => d.difficulty === "Easy");
  const medium = byDifficulty.find(d => d.difficulty === "Medium");
  if (easy && easy.solved >= 5 && easy.solved / easy.attempted >= 0.7 && (!medium || medium.attempted < 3)) {
    add({
      id: "level-up",
      kind: "challenge",
      priority: 2,
      title: "Try Medium problems",
      detail: `You've solved ${easy.solved} Easy problems with a strong success rate. Medium problems in your strongest topic are the next step.`,
      action: { label: "Medium problems", url: "https://leetcode.com/problemset/?difficulty=MEDIUM" }
    });
  }

  // 7. What to learn next: a successor of a strong topic not studied yet.
  const studied = new Set(topics.map(t => t.topic));
  const strong = topics.filter(t => t.status === "strong");
  for (const t of strong) {
    const next = (NEXT_TOPICS[t.topic] ?? []).find(n => !studied.has(n));
    if (next) {
      add({
        id: `next-${next}`,
        kind: "next-topic",
        priority: 3,
        title: `Ready for ${next}`,
        detail: `You're strong in ${t.topic}, which ${next} builds on. Start with a short video, then an easy problem.`,
        action: leetCodeTagUrl(next)
          ? { label: `${next} problems`, url: leetCodeTagUrl(next) }
          : { label: `Videos on ${next}`, url: youtubeSearch(next) }
      });
      break;
    }
  }

  // 8. Streak encouragement.
  if (summary.streakDays >= 3) {
    add({
      id: "streak",
      kind: "encouragement",
      priority: 3,
      title: `${summary.streakDays}-day streak`,
      detail: "Keep it going: study at least a few minutes today to extend it."
    });
  }

  return recs
    .sort((a, b) => a.priority - b.priority)
    .slice(0, 6);
}
