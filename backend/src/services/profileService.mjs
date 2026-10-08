import { buildLearnerProfile } from "../dashboard/learnerProfile.mjs";

// History changes slowly but video progress arrives every few seconds, so a
// learner's raw history is cached briefly.
const CACHE_MS = 2 * 60 * 1000;

export function createProfileService(pool, now = () => new Date()) {
  const cache = new Map();

  async function loadRaw(userId) {
    const at = now();

    const [problems, languages, videos, quizzes, hints, sessions, days] = await Promise.all([
      pool.query(
        `SELECT p.slug, p.title, p.difficulty, p.topics,
                pp.attempts, pp.accepted, pp.active_ms, pp.solve_ms, pp.last_seen,
                (pp.solved_at IS NOT NULL) AS solved
         FROM problem_progress pp JOIN problems p ON p.id = pp.problem_id
         WHERE pp.user_id = $1`,
        [userId]
      ),
      pool.query(
        `SELECT language, count(*)::int AS n FROM problem_attempts
         WHERE user_id = $1 AND language IS NOT NULL
         GROUP BY language ORDER BY n DESC LIMIT 3`,
        [userId]
      ),
      pool.query(
        `SELECT topics, watch_time_s, playing_s, active_s,
                tab_changes + window_changes AS switches, skip_count, rewind_count
         FROM video_watches
         WHERE user_id = $1 AND last_seen >= $2::timestamptz - interval '30 days'`,
        [userId, at]
      ),
      pool.query(
        `SELECT q.concept, q.correct, q.created_at,
                (q.answered_at IS NOT NULL) AS answered,
                COALESCE(w.topics, '{}') AS topics
         FROM video_quizzes q
         LEFT JOIN video_watches w ON w.session_id = q.session_id AND w.video_id = q.video_id
         WHERE q.user_id = $1`,
        [userId]
      ),
      pool.query(
        `SELECT m.problem_slug, m."timestamp" AS at, pp.solved_at
         FROM mentor_interactions m
         LEFT JOIN problems p ON p.platform = 'leetcode' AND p.slug = m.problem_slug
         LEFT JOIN problem_progress pp ON pp.problem_id = p.id AND pp.user_id = m.user_id
         WHERE m.user_id = $1 AND m.nudge_type = 'AI_MENTOR' AND m.problem_slug IS NOT NULL`,
        [userId]
      ),
      pool.query(
        `SELECT COALESCE(avg(active_duration_ms), 0)::float AS avg_ms
         FROM study_sessions
         WHERE user_id = $1 AND active_duration_ms >= 60000
           AND start_time >= $2::timestamptz - interval '14 days'`,
        [userId, at]
      ),
      pool.query(
        `SELECT count(DISTINCT day)::int AS n FROM study_time_daily
         WHERE user_id = $1 AND active_ms >= 60000
           AND day >= (($2::timestamptz AT TIME ZONE
                         (SELECT timezone FROM users WHERE id = $1))::date - 13)`,
        [userId, at]
      )
    ]);

    return {
      problems: problems.rows,
      languages: languages.rows,
      videos: videos.rows,
      quizzes: quizzes.rows,
      hints: hints.rows,
      avgSessionMs: sessions.rows[0].avg_ms,
      activeDays14: days.rows[0].n
    };
  }

  async function raw(userId) {
    const cached = cache.get(userId);
    if (cached && now().getTime() - cached.at < CACHE_MS) return cached.raw;

    const loaded = await loadRaw(userId);
    cache.set(userId, { at: now().getTime(), raw: loaded });
    return loaded;
  }

  // The learner's profile, focused on the problem or video in front of them.
  async function get(userId, focus = {}) {
    return buildLearnerProfile(await raw(userId), focus);
  }

  // Call after something that changes the picture (a solve, a quiz answer).
  function invalidate(userId) {
    cache.delete(userId);
  }

  return { get, invalidate };
}
