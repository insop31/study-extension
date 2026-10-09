// Pure calculations behind the learning dashboard. Everything here takes plain
// rows and returns plain data, so it can be tested without a database.

const DAY_MS = 24 * 60 * 60 * 1000;

// ---- calendar days ("YYYY-MM-DD", no time zone) ---------------------------

export function addDays(day, n) {
  const date = new Date(`${day}T00:00:00Z`);
  return new Date(date.getTime() + n * DAY_MS).toISOString().slice(0, 10);
}

// Monday of the week containing `day`.
export function weekStart(day) {
  const dow = new Date(`${day}T00:00:00Z`).getUTCDay(); // 0 = Sunday
  return addDays(day, -((dow + 6) % 7));
}

export function dayRange(lastDay, count) {
  return Array.from({ length: count }, (_, i) => addDays(lastDay, i - count + 1));
}

// rows: [{ day: "YYYY-MM-DD", platform, active_ms }]
// -> Map day -> { leetcode, youtube, other, total } in ms
export function byDay(rows) {
  const days = new Map();
  for (const row of rows) {
    const entry = days.get(row.day) ?? { leetcode: 0, youtube: 0, other: 0, total: 0 };
    const ms = Number(row.active_ms);
    const key = row.platform === "leetcode" || row.platform === "youtube" ? row.platform : "other";
    entry[key] += ms;
    entry.total += ms;
    days.set(row.day, entry);
  }
  return days;
}

// A day counts towards the streak after a minute of study.
export const STREAK_MIN_MS = 60 * 1000;

// Consecutive study days ending today, or yesterday if today has none yet.
export function streak(days, today) {
  const studied = day => (days.get(day)?.total ?? 0) >= STREAK_MIN_MS;
  let day = studied(today) ? today : addDays(today, -1);
  let count = 0;
  while (studied(day)) {
    count += 1;
    day = addDays(day, -1);
  }
  return count;
}

export function percentChange(current, previous) {
  if (previous <= 0) return current > 0 ? null : 0;
  return Math.round(((current - previous) / previous) * 100);
}

// ---- topics ----------------------------------------------------------------

// LeetCode tags and the video classifier name some topics differently;
// both are folded into one name so a topic's videos and problems meet.
const TOPIC_ALIASES = {
  "array": "Arrays",
  "arrays": "Arrays",
  "hash table": "Hash Tables",
  "hash tables": "Hash Tables",
  "string": "Strings",
  "strings": "Strings",
  "linked list": "Linked Lists",
  "linked lists": "Linked Lists",
  "tree": "Trees",
  "trees": "Trees",
  "binary tree": "Trees",
  "binary search tree": "Trees",
  "graph": "Graphs",
  "graphs": "Graphs",
  "breadth-first search": "Graphs",
  "depth-first search": "Graphs",
  "heap (priority queue)": "Heaps",
  "heaps": "Heaps",
  "stack": "Stacks & Queues",
  "queue": "Stacks & Queues",
  "monotonic stack": "Stacks & Queues",
  "stacks & queues": "Stacks & Queues",
  "trie": "Tries",
  "tries": "Tries",
  "greedy": "Greedy Algorithms",
  "greedy algorithms": "Greedy Algorithms",
  "sorting": "Sorting",
  "two pointers": "Two Pointers",
  "sliding window": "Sliding Window",
  "binary search": "Binary Search",
  "recursion": "Recursion",
  "backtracking": "Backtracking",
  "dynamic programming": "Dynamic Programming",
  "memoization": "Dynamic Programming",
  "bit manipulation": "Bit Manipulation",
  "database": "Databases",
  "databases": "Databases",
  "math": "Math"
};

export function canonicalTopic(name) {
  const trimmed = String(name ?? "").trim();
  return TOPIC_ALIASES[trimmed.toLowerCase()] ?? trimmed;
}

// LeetCode's tag page for a topic, when it has one.
const LEETCODE_TAGS = {
  "Arrays": "array",
  "Hash Tables": "hash-table",
  "Strings": "string",
  "Linked Lists": "linked-list",
  "Trees": "tree",
  "Graphs": "graph",
  "Heaps": "heap-priority-queue",
  "Stacks & Queues": "stack",
  "Tries": "trie",
  "Greedy Algorithms": "greedy",
  "Sorting": "sorting",
  "Two Pointers": "two-pointers",
  "Sliding Window": "sliding-window",
  "Binary Search": "binary-search",
  "Recursion": "recursion",
  "Backtracking": "backtracking",
  "Dynamic Programming": "dynamic-programming",
  "Bit Manipulation": "bit-manipulation",
  "Databases": "database",
  "Math": "math"
};

export function leetCodeTagUrl(topic) {
  const slug = LEETCODE_TAGS[topic];
  return slug ? `https://leetcode.com/tag/${slug}/` : null;
}

// What to learn after what (from the README's topic graph).
export const NEXT_TOPICS = {
  "Arrays": ["Hash Tables", "Two Pointers", "Binary Search", "Sorting"],
  "Strings": ["Hash Tables", "Two Pointers"],
  "Two Pointers": ["Sliding Window"],
  "Hash Tables": ["Sliding Window"],
  "Linked Lists": ["Stacks & Queues"],
  "Stacks & Queues": ["Trees"],
  "Sorting": ["Greedy Algorithms", "Heaps"],
  "Recursion": ["Trees", "Backtracking", "Dynamic Programming"],
  "Trees": ["Graphs", "Heaps", "Tries"],
  "Graphs": ["Dynamic Programming"],
  "Backtracking": ["Dynamic Programming"]
};

// Weights of the parts of a topic's mastery score.
const MASTERY_PARTS = [
  ["solveRate", 0.35],     // problems solved / problems attempted
  ["attemptAccuracy", 0.35], // accepted submissions / all submissions
  ["quizAccuracy", 0.3]    // video quiz answers right / answered
];

// Below this much evidence (submissions + quiz answers) a topic is "new".
export const MIN_EVIDENCE = 3;

export function topicStatus(mastery, evidence) {
  if (evidence < MIN_EVIDENCE || mastery === null) return "new";
  if (mastery >= 70) return "strong";
  if (mastery >= 45) return "moderate";
  return "weak";
}

const ratio = (part, whole) => (whole > 0 ? part / whole : null);

/**
 * problems: [{ topics: string[], attempts, accepted, solved: boolean, active_ms, solve_ms }]
 * videos:   [{ topics: string[], watch_time_s }]
 * quizzes:  [{ topics: string[], answered: boolean, correct: boolean }]
 * readings: [{ topics: string[], active_ms }]   pages on other educational sites
 */
export function buildTopics({ problems, videos, quizzes, readings = [] }) {
  const topics = new Map();
  const get = name => {
    const topic = canonicalTopic(name);
    if (!topic) return null;
    if (!topics.has(topic)) {
      topics.set(topic, {
        topic,
        problemsAttempted: 0,
        problemsSolved: 0,
        attempts: 0,
        accepted: 0,
        problemMs: 0,
        solveMsTotal: 0,
        solveCount: 0,
        videoWatchMs: 0,
        readingMs: 0,
        quizAnswered: 0,
        quizCorrect: 0,
        sources: new Set()
      });
    }
    return topics.get(topic);
  };

  // A problem tagged twice with the same canonical topic counts once.
  const unique = list => [...new Set((list ?? []).map(canonicalTopic).filter(Boolean))];

  for (const p of problems) {
    for (const name of unique(p.topics)) {
      const t = get(name);
      t.sources.add("leetcode");
      t.problemsAttempted += p.attempts > 0 || p.active_ms > 0 ? 1 : 0;
      t.problemsSolved += p.solved ? 1 : 0;
      t.attempts += Number(p.attempts);
      t.accepted += Number(p.accepted);
      t.problemMs += Number(p.active_ms);
      if (p.solved && p.solve_ms !== null && p.solve_ms !== undefined && Number(p.solve_ms) > 0) {
        t.solveMsTotal += Number(p.solve_ms);
        t.solveCount += 1;
      }
    }
  }

  for (const v of videos) {
    for (const name of unique(v.topics)) {
      const t = get(name);
      t.sources.add("youtube");
      t.videoWatchMs += Math.round(Number(v.watch_time_s) * 1000);
    }
  }

  for (const r of readings) {
    for (const name of unique(r.topics)) {
      const t = get(name);
      t.sources.add("web");
      t.readingMs += Number(r.active_ms);
    }
  }

  for (const q of quizzes) {
    if (!q.answered) continue;
    for (const name of unique(q.topics)) {
      const t = get(name);
      t.sources.add("youtube");
      t.quizAnswered += 1;
      t.quizCorrect += q.correct ? 1 : 0;
    }
  }

  return [...topics.values()]
    .map(t => {
      const parts = {
        solveRate: ratio(t.problemsSolved, t.problemsAttempted),
        attemptAccuracy: ratio(t.accepted, t.attempts),
        quizAccuracy: ratio(t.quizCorrect, t.quizAnswered)
      };

      // Weighted average over the parts this topic has data for.
      let weight = 0;
      let sum = 0;
      for (const [key, w] of MASTERY_PARTS) {
        if (parts[key] !== null) {
          sum += parts[key] * w;
          weight += w;
        }
      }
      const mastery = weight > 0 ? Math.round((sum / weight) * 100) : null;
      const evidence = t.attempts + t.quizAnswered;

      return {
        topic: t.topic,
        sources: [...t.sources].sort(),
        problemsAttempted: t.problemsAttempted,
        problemsSolved: t.problemsSolved,
        attempts: t.attempts,
        accepted: t.accepted,
        successRate: parts.solveRate === null ? null : Math.round(parts.solveRate * 100),
        attemptAccuracy: parts.attemptAccuracy === null ? null : Math.round(parts.attemptAccuracy * 100),
        avgSolveMs: t.solveCount > 0 ? Math.round(t.solveMsTotal / t.solveCount) : null,
        problemMs: t.problemMs,
        videoWatchMs: t.videoWatchMs,
        readingMs: t.readingMs,
        studyMs: t.problemMs + t.videoWatchMs + t.readingMs,
        quizAnswered: t.quizAnswered,
        quizCorrect: t.quizCorrect,
        quizAccuracy: parts.quizAccuracy === null ? null : Math.round(parts.quizAccuracy * 100),
        mastery,
        evidence,
        status: topicStatus(mastery, evidence)
      };
    })
    .sort((a, b) => b.studyMs - a.studyMs || b.evidence - a.evidence || a.topic.localeCompare(b.topic));
}

export function weakTopics(topics, limit = 5) {
  return topics
    .filter(t => t.status === "weak")
    .sort((a, b) => a.mastery - b.mastery || b.evidence - a.evidence)
    .slice(0, limit);
}


// ---- study rhythm ("when you study best") --------------------------------

export const PERIODS = [
  { id: "morning", label: "Morning", hours: "5am-12pm", from: 5, to: 12 },
  { id: "afternoon", label: "Afternoon", hours: "12-5pm", from: 12, to: 17 },
  { id: "evening", label: "Evening", hours: "5-9pm", from: 17, to: 21 },
  { id: "night", label: "Night", hours: "9pm-5am", from: 21, to: 29 }
];

export function periodOf(hour) {
  const h = hour < 5 ? hour + 24 : hour;
  return PERIODS.find(p => h >= p.from && h < p.to).id;
}

// A period needs this many graded submissions before its accuracy is compared.
export const MIN_PERIOD_ATTEMPTS = 5;

/**
 * hours:    [{ hour: 0-23, active_ms }]       local hours, recent weeks
 * attempts: [{ hour: 0-23, accepted: bool }]  graded submissions, local hours
 */
export function buildRhythm({ hours, attempts }) {
  const periods = PERIODS.map(p => ({
    id: p.id,
    label: p.label,
    hours: p.hours,
    studyMs: 0,
    attempts: 0,
    accepted: 0,
    accuracy: null
  }));
  const byId = Object.fromEntries(periods.map(p => [p.id, p]));

  for (const row of hours) byId[periodOf(Number(row.hour))].studyMs += Number(row.active_ms);
  for (const row of attempts) {
    const p = byId[periodOf(Number(row.hour))];
    p.attempts += 1;
    p.accepted += row.accepted ? 1 : 0;
  }
  for (const p of periods) {
    p.accuracy = p.attempts > 0 ? Math.round((p.accepted / p.attempts) * 100) : null;
  }

  const totalMs = periods.reduce((acc, p) => acc + p.studyMs, 0);
  const mostStudied = totalMs > 0 ? [...periods].sort((a, b) => b.studyMs - a.studyMs)[0] : null;

  const graded = periods.filter(p => p.attempts >= MIN_PERIOD_ATTEMPTS);
  const totalAttempts = periods.reduce((acc, p) => acc + p.attempts, 0);
  const overall = totalAttempts > 0
    ? Math.round((periods.reduce((acc, p) => acc + p.accepted, 0) / totalAttempts) * 100)
    : null;
  const sharpest = graded.length >= 2
    ? [...graded].sort((a, b) => b.accuracy - a.accuracy)[0]
    : null;

  let insight = null;
  if (sharpest && overall !== null && sharpest.accuracy - overall >= 10) {
    insight =
      `Your submissions are most accurate in the ${sharpest.label.toLowerCase()} ` +
      `(${sharpest.accuracy}% accepted vs ${overall}% overall)` +
      (mostStudied && mostStudied.id !== sharpest.id
        ? `, but you study most in the ${mostStudied.label.toLowerCase()}.`
        : ".");
  } else if (mostStudied && mostStudied.studyMs >= 30 * 60000) {
    insight = `You study most in the ${mostStudied.label.toLowerCase()} (${mostStudied.hours}).`;
  }

  return {
    periods,
    mostStudied: mostStudied?.id ?? null,
    sharpest: sharpest?.id ?? null,
    overallAccuracy: overall,
    insight
  };
}

