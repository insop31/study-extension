import {
  addDays,
  buildRhythm,
  buildTopics,
  byDay,
  dayRange,
  percentChange,
  streak,
  STREAK_MIN_MS,
  weakTopics,
  weekStart
} from "../dashboard/metrics.mjs";
import { buildRecommendations } from "../dashboard/recommendations.mjs";
import { SITES } from "../sites.mjs";

const DIFFICULTIES = ["Easy", "Medium", "Hard"];

const COACH_INSTRUCTIONS = [
  "You are a supportive, practical study coach for a student learning programming and computer science.",
  "You get a JSON summary of their last weeks of study: time, topics with mastery scores (0-100), problems, video quiz results and rule-based recommendations.",
  "Write a short personal study plan for the coming week in plain text: one sentence on how they are doing, then 4-6 bullet points starting with '- '.",
  "Be specific: name topics, suggest how many problems or minutes, and say why. Build on the recommendations, don't just repeat them.",
  "Be encouraging but honest about weak areas. No markdown headings, no tables, under 180 words."
].join(" ");

export function createDashboardService(pool, { now = () => new Date(), complete = null } = {}) {

  async function preferences(userId) {
    const { rows: [user] } = await pool.query(
      "SELECT timezone, daily_goal_minutes FROM users WHERE id = $1",
      [userId]
    );
    return { timezone: user.timezone, dailyGoalMinutes: user.daily_goal_minutes };
  }

  // Returns the saved preferences, or { error } for an unknown time zone.
  async function updatePreferences(userId, { timezone, dailyGoalMinutes }) {
    if (timezone !== undefined) {
      const { rows } = await pool.query(
        "SELECT 1 FROM pg_timezone_names WHERE name = $1",
        [timezone]
      );
      if (!rows[0]) return { error: "Unknown time zone." };
    }
    await pool.query(
      `UPDATE users SET
         timezone = COALESCE($2, timezone),
         daily_goal_minutes = COALESCE($3, daily_goal_minutes)
       WHERE id = $1`,
      [userId, timezone ?? null, dailyGoalMinutes ?? null]
    );
    return { preferences: await preferences(userId) };
  }

  async function build(userId) {
    const at = now();
    const { timezone, dailyGoalMinutes } = await preferences(userId);

    const { rows: [{ today }] } = await pool.query(
      "SELECT to_char(($1::timestamptz AT TIME ZONE $2)::date, 'YYYY-MM-DD') AS today",
      [at, timezone]
    );

    // 12 calendar weeks (Monday to Sunday) for the heatmap; also covers the
    // last two 7-day periods and the last 8 weeks.
    const heatmapStart = addDays(weekStart(today), -77);

    const [daily, sessions, problems, firstTry, videos, quizzes, mentor, readings, hours, attemptHours, focus] = await Promise.all([
      pool.query(
        `SELECT to_char(day, 'YYYY-MM-DD') AS day, platform, active_ms
         FROM study_time_daily WHERE user_id = $1 AND day >= $2::date`,
        [userId, heatmapStart]
      ),
      pool.query(
        `SELECT count(*)::int AS n, COALESCE(avg(active_duration_ms), 0)::float AS avg_ms
         FROM study_sessions
         WHERE user_id = $1 AND active_duration_ms >= 60000
           AND (start_time AT TIME ZONE $2)::date >= $3::date`,
        [userId, timezone, addDays(today, -6)]
      ),
      pool.query(
        `SELECT p.slug, p.title, p.difficulty, p.topics,
                pp.attempts, pp.accepted, pp.active_ms, pp.solve_ms,
                pp.solved_at, pp.first_seen, pp.last_seen,
                (pp.solved_at IS NOT NULL) AS solved
         FROM problem_progress pp JOIN problems p ON p.id = pp.problem_id
         WHERE pp.user_id = $1`,
        [userId]
      ),
      pool.query(
        `SELECT count(*)::int AS n FROM problem_attempts
         WHERE user_id = $1 AND attempt_number = 1 AND result = 'accepted'`,
        [userId]
      ),
      pool.query(
        `SELECT w.video_id, latest.title, latest.channel, latest.topics,
                sum(w.watch_time_s)::float AS watch_time_s,
                max(w.duration_s) AS duration_s,
                max(w.max_position_s)::float AS max_position_s,
                bool_or(w.ended) AS ended,
                max(w.last_seen) AS last_seen
         FROM video_watches w
         JOIN LATERAL (
           SELECT title, channel, topics FROM video_watches l
           WHERE l.user_id = w.user_id AND l.video_id = w.video_id
           ORDER BY l.last_seen DESC LIMIT 1
         ) latest ON true
         WHERE w.user_id = $1
         GROUP BY w.video_id, latest.title, latest.channel, latest.topics`,
        [userId]
      ),
      pool.query(
        `SELECT q.answered_at IS NOT NULL AS answered, q.correct, w.topics
         FROM video_quizzes q
         LEFT JOIN video_watches w ON w.session_id = q.session_id AND w.video_id = q.video_id
         WHERE q.user_id = $1`,
        [userId]
      ),
      pool.query(
        `SELECT count(*)::int AS n FROM mentor_interactions
         WHERE user_id = $1 AND "timestamp" >= $2::timestamptz - interval '7 days'`,
        [userId, at]
      ),
      pool.query(
        `SELECT url, site, title, kind, topics, active_ms, last_seen
         FROM page_reads WHERE user_id = $1`,
        [userId]
      ),
      // Study time by local hour over the last 4 weeks.
      pool.query(
        `SELECT hour, sum(active_ms)::bigint AS active_ms FROM study_time_hourly
         WHERE user_id = $1 AND day >= $2::date
         GROUP BY hour`,
        [userId, addDays(today, -27)]
      ),
      // Graded submissions by local hour over the last 90 days.
      pool.query(
        `SELECT extract(hour FROM ("timestamp" AT TIME ZONE $2))::int AS hour,
                (result = 'accepted') AS accepted
         FROM problem_attempts
         WHERE user_id = $1 AND "timestamp" >= $3::timestamptz - interval '90 days'`,
        [userId, timezone, at]
      ),
      // How focused: switching away from problems and from videos.
      pool.query(
        `SELECT
           (SELECT COALESCE(sum(switches), 0) FROM problem_progress WHERE user_id = $1)::int AS problem_switches,
           (SELECT COALESCE(sum(active_ms), 0) FROM problem_progress WHERE user_id = $1)::bigint AS problem_ms,
           (SELECT COALESCE(sum(tab_changes + window_changes), 0) FROM video_watches WHERE user_id = $1)::int AS video_switches,
           (SELECT COALESCE(sum(playing_s), 0) FROM video_watches WHERE user_id = $1)::float AS video_playing_s,
           (SELECT COALESCE(sum(active_s), 0) FROM video_watches WHERE user_id = $1)::float AS video_active_s,
           (SELECT count(*) FROM mentor_interactions
             WHERE user_id = $1 AND nudge_type = 'BREAK_REMINDER'
               AND "timestamp" >= $2::timestamptz - interval '7 days')::int AS breaks_suggested`,
        [userId, at]
      )
    ]);

    // ---- time --------------------------------------------------------------
    const days = byDay(daily.rows);
    const total = day => days.get(day)?.total ?? 0;
    const sum = list => list.reduce((acc, day) => acc + total(day), 0);

    const last7 = dayRange(today, 7);
    const prev7 = dayRange(addDays(today, -7), 7);
    const thisWeekMs = sum(last7);
    const lastWeekMs = sum(prev7);

    const weekly = {
      days: last7.map(date => {
        const d = days.get(date) ?? { leetcode: 0, youtube: 0, other: 0, total: 0 };
        return { date, leetcodeMs: d.leetcode, youtubeMs: d.youtube, otherMs: d.other, totalMs: d.total };
      }),
      weeks: Array.from({ length: 8 }, (_, i) => {
        const start = addDays(weekStart(today), (i - 7) * 7);
        return { weekStart: start, totalMs: sum(dayRange(addDays(start, 6), 7)) };
      })
    };

    const heatmap = dayRange(today, Math.round((Date.parse(today) - Date.parse(heatmapStart)) / 86400000) + 1)
      .map(date => ({ date, totalMs: total(date) }));

    // ---- problems ----------------------------------------------------------
    const problemRows = problems.rows.map(p => ({
      ...p,
      attempts: Number(p.attempts),
      accepted: Number(p.accepted),
      active_ms: Number(p.active_ms),
      solve_ms: p.solve_ms === null ? null : Number(p.solve_ms)
    }));
    const attempted = problemRows.filter(p => p.attempts > 0);
    const solved = problemRows.filter(p => p.solved);
    const totalAttempts = problemRows.reduce((acc, p) => acc + p.attempts, 0);
    const totalAccepted = problemRows.reduce((acc, p) => acc + p.accepted, 0);
    const timedSolves = solved.filter(p => p.solve_ms && p.solve_ms > 0);
    const weekAgo = new Date(at.getTime() - 7 * 86400000);

    const byDifficulty = DIFFICULTIES.map(difficulty => ({
      difficulty,
      attempted: attempted.filter(p => p.difficulty === difficulty).length,
      solved: solved.filter(p => p.difficulty === difficulty).length
    }));

    const recentProblems = [...problemRows]
      .sort((a, b) => b.last_seen - a.last_seen)
      .slice(0, 8)
      .map(p => ({
        slug: p.slug,
        title: p.title ?? p.slug,
        difficulty: p.difficulty,
        topics: p.topics,
        attempts: p.attempts,
        solved: p.solved,
        timeMs: p.active_ms,
        lastSeen: p.last_seen.getTime()
      }));

    // ---- videos & quizzes --------------------------------------------------
    const videoRows = videos.rows;
    const quizRows = quizzes.rows.map(q => ({ ...q, topics: q.topics ?? [] }));
    const answeredQuizzes = quizRows.filter(q => q.answered);
    const correctQuizzes = answeredQuizzes.filter(q => q.correct);

    const recentVideos = [...videoRows]
      .sort((a, b) => b.last_seen - a.last_seen)
      .slice(0, 6)
      .map(v => ({
        videoId: v.video_id,
        title: v.title,
        channel: v.channel,
        topics: v.topics,
        watchMs: Math.round(v.watch_time_s * 1000),
        percentWatched: v.duration_s > 0 ? Math.min(100, Math.round((v.max_position_s / v.duration_s) * 100)) : 0,
        lastSeen: v.last_seen.getTime()
      }));

    // ---- topics ------------------------------------------------------------
    const readingRows = readings.rows.map(r => ({ ...r, active_ms: Number(r.active_ms) }));

    const topics = buildTopics({
      problems: problemRows,
      videos: videoRows,
      quizzes: quizRows,
      readings: readingRows
    });

    const recentReading = [...readingRows]
      .sort((a, b) => b.last_seen - a.last_seen)
      .slice(0, 6)
      .map(r => ({
        url: r.url,
        title: r.title,
        site: SITES[r.site]?.label ?? r.site,
        kind: r.kind,
        topics: r.topics,
        timeMs: r.active_ms,
        lastSeen: r.last_seen.getTime()
      }));

    const rhythm = buildRhythm({ hours: hours.rows, attempts: attemptHours.rows });

    const f = focus.rows[0];
    const problemHours = Number(f.problem_ms) / 3600000;
    const videoHours = f.video_playing_s / 3600;
    const focusStats = {
      problemSwitchesPerHour: problemHours >= 0.25 ? Math.round(f.problem_switches / problemHours) : null,
      videoSwitchesPerHour: videoHours >= 0.25 ? Math.round(f.video_switches / videoHours) : null,
      videoFocusPct: f.video_playing_s >= 600 ? Math.round((f.video_active_s / f.video_playing_s) * 100) : null,
      breaksSuggestedThisWeek: f.breaks_suggested
    };

    const summary = {
      todayMs: total(today),
      thisWeekMs,
      lastWeekMs,
      weekChangePct: percentChange(thisWeekMs, lastWeekMs),
      streakDays: streak(days, today),
      activeDaysThisWeek: last7.filter(day => total(day) >= STREAK_MIN_MS).length,
      sessionsThisWeek: sessions.rows[0].n,
      avgSessionMs: Math.round(sessions.rows[0].avg_ms),
      problemsAttempted: attempted.length,
      problemsSolved: solved.length,
      problemsSolvedThisWeek: solved.filter(p => p.solved_at >= weekAgo).length,
      // README: accepted problems / total problems x 100
      successRate: attempted.length > 0 ? Math.round((solved.length / attempted.length) * 100) : null,
      attemptAccuracy: totalAttempts > 0 ? Math.round((totalAccepted / totalAttempts) * 100) : null,
      firstTrySolved: firstTry.rows[0].n,
      avgSolveMs: timedSolves.length > 0
        ? Math.round(timedSolves.reduce((acc, p) => acc + p.solve_ms, 0) / timedSolves.length)
        : null,
      videosWatched: videoRows.length,
      videoWatchMs: Math.round(videoRows.reduce((acc, v) => acc + v.watch_time_s, 0) * 1000),
      quizAnswered: answeredQuizzes.length,
      quizCorrect: correctQuizzes.length,
      quizAccuracy: answeredQuizzes.length > 0
        ? Math.round((correctQuizzes.length / answeredQuizzes.length) * 100)
        : null,
      mentorNotesThisWeek: mentor.rows[0].n,
      topicsStudied: topics.length,
      pagesRead: readingRows.length,
      readingMs: readingRows.reduce((acc, r) => acc + r.active_ms, 0)
    };

    return {
      generatedAt: at.getTime(),
      today,
      timezone,
      dailyGoalMinutes,
      summary,
      weekly,
      heatmap,
      problems: { byDifficulty, recent: recentProblems },
      videos: { recent: recentVideos },
      reading: { recent: recentReading },
      rhythm,
      focus: focusStats,
      topics,
      weakTopics: weakTopics(topics),
      strongTopics: topics.filter(t => t.status === "strong").slice(0, 5),
      recommendations: buildRecommendations({
        summary,
        topics,
        problems: problemRows,
        byDifficulty,
        dailyGoalMinutes,
        rhythm,
        focus: focusStats
      })
    };
  }

  async function latestCoachReport(userId) {
    const { rows } = await pool.query(
      `SELECT content, created_at FROM coach_reports
       WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [userId]
    );
    return rows[0] ? { content: rows[0].content, createdAt: rows[0].created_at.getTime() } : null;
  }

  // Asks the AI model for a personal plan based on the dashboard.
  async function writeCoachReport(userId) {
    if (!complete) return { status: 503, error: "The AI coach is not configured on the server." };

    const dashboard = await build(userId);
    const input = JSON.stringify({
      dailyGoalMinutes: dashboard.dailyGoalMinutes,
      summary: dashboard.summary,
      topics: dashboard.topics.slice(0, 12).map(t => ({
        topic: t.topic, mastery: t.mastery, status: t.status,
        successRate: t.successRate, quizAccuracy: t.quizAccuracy,
        studyMinutes: Math.round(t.studyMs / 60000)
      })),
      recentProblems: dashboard.problems.recent.map(p => ({ title: p.title, difficulty: p.difficulty, solved: p.solved })),
      recommendations: dashboard.recommendations.map(r => r.title)
    });

    const result = await complete({ instructions: COACH_INSTRUCTIONS, input });
    if (!result.success) return { status: 502, error: result.error };

    const createdAt = now();
    await pool.query(
      "INSERT INTO coach_reports (user_id, created_at, content) VALUES ($1, $2, $3)",
      [userId, createdAt, result.text.trim()]
    );
    return { report: { content: result.text.trim(), createdAt: createdAt.getTime() } };
  }

  return { build, preferences, updatePreferences, latestCoachReport, writeCoachReport };
}
