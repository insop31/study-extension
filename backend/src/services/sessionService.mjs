import { withTx } from "../db.mjs";

// Gaps longer than this between two activities are not counted as study time.
export const IDLE_THRESHOLD_MS = 60 * 1000;

// Activity types that are stored as rows. Heartbeats and mouse movement still
// advance the session timer but would only bloat the table.
const NOISY_ACTIVITY_TYPES = new Set(["heartbeat", "mousemove", "video_watch"]);

const FINAL_VERDICT_EXCLUDED = new Set(["submitted"]);

const ENGINE_NUDGE_TYPES = ["STUCK", "THINKING_PROMPT", "ACTIVE_RECALL", "BREAK_REMINDER"];

export function toSession(row) {
  if (!row) return null;
  return {
    id: row.id,
    startTime: row.start_time.getTime(),
    lastActivityTime: row.last_activity_time.getTime(),
    totalActiveTime: Number(row.active_duration_ms),
    website: row.website,
    currentPage: row.current_page,
    currentUrl: row.current_url,
    isActive: row.status === "active",
    userState: row.user_state
  };
}

export function createSessionService(pool, now = () => new Date()) {

  async function currentRow(client, userId, { lock = false } = {}) {
    const { rows } = await client.query(
      `SELECT * FROM study_sessions
       WHERE user_id = $1
       ORDER BY start_time DESC
       LIMIT 1
       ${lock ? "FOR UPDATE" : ""}`,
      [userId]
    );
    return rows[0] ?? null;
  }

  async function dismissOpenNudges(client, userId) {
    await client.query(
      `UPDATE mentor_interactions SET user_response = 'dismissed'
       WHERE user_id = $1 AND user_response IS NULL`,
      [userId]
    );
  }

  // Adds credited study time to the learner's day (in their time zone).
  async function creditDay(client, userId, platform, at, ms) {
    if (ms <= 0) return;
    await client.query(
      `INSERT INTO study_time_daily (user_id, day, platform, active_ms)
       SELECT $1, ($2::timestamptz AT TIME ZONE u.timezone)::date, $3, $4
       FROM users u WHERE u.id = $1
       ON CONFLICT (user_id, day, platform)
       DO UPDATE SET active_ms = study_time_daily.active_ms + EXCLUDED.active_ms`,
      [userId, at, platform, ms]
    );
  }

  // Time on the problem, attempts, and the first time it was solved.
  async function updateProblemProgress(client, userId, problemId, at, { creditedMs, verdict }) {
    const accepted = verdict === "accepted";
    await client.query(
      `INSERT INTO problem_progress
         (user_id, problem_id, first_seen, last_seen, active_ms, attempts, accepted, solved_at, solve_ms)
       VALUES ($1, $2, $3::timestamptz, $3::timestamptz, $4::bigint, $5::int, $6::int,
               CASE WHEN $6::int > 0 THEN $3::timestamptz END,
               CASE WHEN $6::int > 0 THEN $4::bigint END)
       ON CONFLICT (user_id, problem_id) DO UPDATE SET
         last_seen = EXCLUDED.last_seen,
         active_ms = problem_progress.active_ms + EXCLUDED.active_ms,
         attempts = problem_progress.attempts + EXCLUDED.attempts,
         accepted = problem_progress.accepted + EXCLUDED.accepted,
         solved_at = COALESCE(problem_progress.solved_at, EXCLUDED.solved_at),
         solve_ms = COALESCE(
           problem_progress.solve_ms,
           CASE WHEN EXCLUDED.accepted > 0
                THEN problem_progress.active_ms + EXCLUDED.active_ms END
         )`,
      [userId, problemId, at, creditedMs, verdict ? 1 : 0, accepted ? 1 : 0]
    );
  }

  async function getCurrent(userId) {
    return toSession(await currentRow(pool, userId));
  }

  // Serialises session changes per user, so a burst of page events can
  // never create overlapping sessions.
  async function lockUser(client, userId) {
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtextextended($1::text, 0))",
      [userId]
    );
  }

  async function insertSession(client, userId, { website, title, url }, at) {
    const { rows } = await client.query(
      `INSERT INTO study_sessions
         (user_id, website, current_page, current_url, start_time,
          last_activity_time, status, user_state)
       VALUES ($1, $2, $3, $4, $5, $5, 'active', 'active')
       RETURNING *`,
      [userId, website, title, url, at]
    );
    return rows[0];
  }

  async function start(userId, page) {
    return withTx(pool, async client => {
      await lockUser(client, userId);
      const at = now();

      // Only one session may be open at a time.
      await client.query(
        `UPDATE study_sessions
         SET status = 'ended', user_state = 'paused', end_time = $2
         WHERE user_id = $1 AND status = 'active'`,
        [userId, at]
      );
      await dismissOpenNudges(client, userId);

      return toSession(await insertSession(client, userId, page, at));
    });
  }

  // Follows the learner to a new page. Starts a session if there is none;
  // an ended session stays ended.
  async function updatePage(userId, page) {
    return withTx(pool, async client => {
      await lockUser(client, userId);

      const row = await currentRow(client, userId, { lock: true });
      if (!row) return toSession(await insertSession(client, userId, page, now()));
      if (row.status !== "active") return toSession(row);

      const { rows } = await client.query(
        `UPDATE study_sessions
         SET website = $2, current_page = $3, current_url = $4
         WHERE id = $1
         RETURNING *`,
        [row.id, page.website, page.title, page.url]
      );
      return toSession(rows[0]);
    });
  }

  async function upsertProblem(client, { website, problemSlug, title, difficulty, topics }) {
    const { rows } = await client.query(
      `INSERT INTO problems (platform, slug, title, difficulty, topics)
       VALUES ($1, $2, $3, $4, COALESCE($5::text[], '{}'))
       ON CONFLICT (platform, slug) DO UPDATE SET
         title = COALESCE(EXCLUDED.title, problems.title),
         difficulty = COALESCE(EXCLUDED.difficulty, problems.difficulty),
         topics = CASE WHEN cardinality(EXCLUDED.topics) > 0
                       THEN EXCLUDED.topics ELSE problems.topics END
       RETURNING id`,
      [website, problemSlug, title ?? null, difficulty ?? null, topics ?? null]
    );
    return rows[0].id;
  }

  async function nudgeState(client, userId, sessionId, website, problemSlug) {
    const { rows: [last] } = await client.query(
      `SELECT max("timestamp") AS at FROM mentor_interactions
       WHERE user_id = $1 AND nudge_type = ANY($2)`,
      [userId, ENGINE_NUDGE_TYPES]
    );

    let proactive = null;
    let failedAttempts = 0;

    if (problemSlug) {
      const { rows: [row] } = await client.query(
        `SELECT "timestamp", nudge_type FROM mentor_interactions
         WHERE user_id = $1 AND problem_slug = $2
           AND nudge_type IN ('AI_MENTOR', 'AI_MENTOR_ERROR')
         ORDER BY "timestamp" DESC LIMIT 1`,
        [userId, problemSlug]
      );
      proactive = row ?? null;

      const { rows: [count] } = await client.query(
        `SELECT count(*)::int AS n
         FROM problem_attempts a
         JOIN problems p ON p.id = a.problem_id
         WHERE a.session_id = $1 AND p.platform = $2 AND p.slug = $3
           AND a.result <> 'accepted'`,
        [sessionId, website, problemSlug]
      );
      failedAttempts = count.n;
    }

    return {
      lastNudgeAt: last.at ? last.at.getTime() : null,
      lastProactiveAt: proactive ? proactive.timestamp.getTime() : null,
      lastProactiveType: proactive ? proactive.nudge_type : null,
      failedAttempts
    };
  }

  // Records one activity event. Returns null when there is no session.
  async function recordActivity(userId, input) {
    return withTx(pool, async client => {
      const row = await currentRow(client, userId, { lock: true });
      if (!row) return null;

      if (row.status !== "active") {
        return { session: toSession(row), nudgeState: null };
      }

      const at = now();
      const elapsed = at.getTime() - row.last_activity_time.getTime();

      // Only credit the gap if the learner was already active and the gap is
      // short, so time spent on other tabs is never added on return.
      const credited =
        row.user_state === "active" && elapsed > 0 && elapsed <= IDLE_THRESHOLD_MS
          ? elapsed
          : 0;

      const { rows } = await client.query(
        `UPDATE study_sessions
         SET active_duration_ms = active_duration_ms + $2,
             last_activity_time = $3,
             website = $4, current_page = $5, current_url = $6,
             user_state = 'active'
         WHERE id = $1
         RETURNING *`,
        [row.id, credited, at, input.website, input.title, input.url]
      );
      const session = rows[0];

      // The slice since the last activity was spent on the previous page.
      await creditDay(client, userId, row.website, at, credited);

      const hasProblem = input.website === "leetcode" && input.problemSlug;
      const problemId = hasProblem
        ? await upsertProblem(client, { ...input, website: input.website })
        : null;

      const verdict =
        input.submissionResult && !FINAL_VERDICT_EXCLUDED.has(input.submissionResult)
          ? input.submissionResult
          : null;

      if (problemId) {
        await updateProblemProgress(client, userId, problemId, at, {
          creditedMs: row.website === "leetcode" ? credited : 0,
          verdict
        });
      }

      if (!NOISY_ACTIVITY_TYPES.has(input.activityType)) {
        await client.query(
          `INSERT INTO activities
             (session_id, user_id, activity_type, "timestamp", page_url, page_title,
              website, problem_slug, difficulty, topics, programming_language,
              submission_result)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
          [
            row.id, userId, input.activityType, at, input.url, input.title,
            input.website, input.problemSlug ?? null, input.difficulty ?? null,
            input.topics ?? null, input.programmingLanguage ?? null,
            input.submissionResult ?? null
          ]
        );
      }

      // A final verdict (not the bare "submitted" click) counts as an attempt.
      if (problemId && verdict) {
        const { rows: [count] } = await client.query(
          `SELECT count(*)::int AS n FROM problem_attempts
           WHERE user_id = $1 AND problem_id = $2`,
          [userId, problemId]
        );
        await client.query(
          `INSERT INTO problem_attempts
             (user_id, session_id, problem_id, language, attempt_number, result, "timestamp")
           VALUES ($1,$2,$3,$4,$5,$6,$7)`,
          [
            userId, row.id, problemId, input.programmingLanguage ?? null,
            count.n + 1, input.submissionResult, at
          ]
        );
      }

      return {
        session: toSession(session),
        nudgeState: await nudgeState(
          client, userId, row.id, input.website, input.problemSlug
        )
      };
    });
  }

  async function setState(userId, state) {
    return withTx(pool, async client => {
      const row = await currentRow(client, userId, { lock: true });
      if (!row) return null;
      if (row.status !== "active") return toSession(row);
      if (row.user_state === state) return toSession(row);

      const at = now();
      let credited = 0;

      // Keep the last active slice, then restart the boundary so time spent
      // idle or paused is never counted on resume.
      if (row.user_state === "active") {
        const elapsed = at.getTime() - row.last_activity_time.getTime();
        if (elapsed > 0 && elapsed <= IDLE_THRESHOLD_MS) credited = elapsed;
      }

      const { rows } = await client.query(
        `UPDATE study_sessions
         SET active_duration_ms = active_duration_ms + $2,
             last_activity_time = $3, user_state = $4
         WHERE id = $1
         RETURNING *`,
        [row.id, credited, at, state]
      );
      await creditDay(client, userId, row.website, at, credited);
      return toSession(rows[0]);
    });
  }

  async function end(userId) {
    return withTx(pool, async client => {
      const row = await currentRow(client, userId, { lock: true });
      if (!row) return null;
      if (row.status !== "active") return toSession(row);

      const at = now();
      const elapsed = at.getTime() - row.last_activity_time.getTime();
      const credited =
        row.user_state === "active" && elapsed > 0 && elapsed <= IDLE_THRESHOLD_MS
          ? elapsed
          : 0;

      const { rows } = await client.query(
        `UPDATE study_sessions
         SET active_duration_ms = active_duration_ms + $2,
             status = 'ended', user_state = 'paused',
             last_activity_time = $3, end_time = $3
         WHERE id = $1
         RETURNING *`,
        [row.id, credited, at]
      );
      await creditDay(client, userId, row.website, at, credited);
      await dismissOpenNudges(client, userId);
      return toSession(rows[0]);
    });
  }

  async function list(userId, limit) {
    const { rows } = await pool.query(
      `SELECT * FROM study_sessions WHERE user_id = $1
       ORDER BY start_time DESC LIMIT $2`,
      [userId, limit]
    );
    return rows.map(toSession);
  }

  return { getCurrent, start, updatePage, recordActivity, setState, end, list };
}
