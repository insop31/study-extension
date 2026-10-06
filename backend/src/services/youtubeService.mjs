import { withTx } from "../db.mjs";
import { VIDEO_NUDGE_TYPES, decideVideoNudge } from "./videoMentor.mjs";

export function toWatch(row) {
  if (!row) return null;

  const duration = Number(row.duration_s);
  const playing = Number(row.playing_s);

  return {
    videoId: row.video_id,
    title: row.title,
    channel: row.channel,
    topics: row.topics,
    durationS: duration,
    watchedS: Number(row.watch_time_s),
    playingS: playing,
    activeS: Number(row.active_s),
    pausedS: Number(row.paused_s),
    pauseCount: row.pause_count,
    tabChanges: row.tab_changes,
    windowChanges: row.window_changes,
    skipCount: row.skip_count,
    skippedS: Number(row.skipped_s),
    rewindCount: row.rewind_count,
    rewoundS: Number(row.rewound_s),
    maxPositionS: Number(row.max_position_s),
    percentWatched: duration > 0
      ? Math.min(100, Math.round((Number(row.max_position_s) / duration) * 100))
      : 0,
    activePercent: playing > 0
      ? Math.min(100, Math.round((Number(row.active_s) / playing) * 100))
      : 0,
    recallCount: row.recall_count,
    ended: row.ended
  };
}

export function createYouTubeService(pool, now = () => new Date()) {

  // Adds one report's deltas to the learner's running totals for the video
  // and, if it is a good moment, creates a recall prompt.
  async function recordProgress(userId, report) {
    return withTx(pool, async client => {
      const { rows: [session] } = await client.query(
        `SELECT id, user_state FROM study_sessions
         WHERE user_id = $1 AND status = 'active'
         ORDER BY start_time DESC LIMIT 1
         FOR UPDATE`,
        [userId]
      );

      if (!session) return { watch: null, nudge: null };

      const at = now();
      const { video, delta } = report;

      const { rows: [watch] } = await client.query(
        `INSERT INTO video_watches
           (user_id, session_id, video_id, title, channel, category, topics,
            duration_s, educational_score, watch_time_s, playing_s, active_s,
            paused_s, pause_count, tab_changes, window_changes, skip_count,
            skipped_s, rewind_count, rewound_s, max_position_s, ended,
            first_seen, last_seen)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,
                 $18,$19,$20,$21,$22,$23,$23)
         ON CONFLICT (session_id, video_id) DO UPDATE SET
           title = EXCLUDED.title,
           channel = COALESCE(EXCLUDED.channel, video_watches.channel),
           category = COALESCE(EXCLUDED.category, video_watches.category),
           topics = EXCLUDED.topics,
           duration_s = GREATEST(video_watches.duration_s, EXCLUDED.duration_s),
           educational_score = EXCLUDED.educational_score,
           watch_time_s = video_watches.watch_time_s + EXCLUDED.watch_time_s,
           playing_s = video_watches.playing_s + EXCLUDED.playing_s,
           active_s = video_watches.active_s + EXCLUDED.active_s,
           paused_s = video_watches.paused_s + EXCLUDED.paused_s,
           pause_count = video_watches.pause_count + EXCLUDED.pause_count,
           tab_changes = video_watches.tab_changes + EXCLUDED.tab_changes,
           window_changes = video_watches.window_changes + EXCLUDED.window_changes,
           skip_count = video_watches.skip_count + EXCLUDED.skip_count,
           skipped_s = video_watches.skipped_s + EXCLUDED.skipped_s,
           rewind_count = video_watches.rewind_count + EXCLUDED.rewind_count,
           rewound_s = video_watches.rewound_s + EXCLUDED.rewound_s,
           max_position_s = GREATEST(video_watches.max_position_s, EXCLUDED.max_position_s),
           ended = video_watches.ended OR EXCLUDED.ended,
           last_seen = EXCLUDED.last_seen
         RETURNING *`,
        [
          userId, session.id, video.videoId, video.title, video.channel ?? null,
          video.category ?? null, video.topics, video.durationS, video.score,
          delta.watchedS, delta.playingS, delta.activeS, delta.pausedS,
          delta.pauseCount, delta.tabChanges, delta.windowChanges,
          delta.skipCount, delta.skippedS, delta.rewindCount, delta.rewoundS,
          report.positionS, report.event === "ended", at
        ]
      );

      const { rows: [last] } = await client.query(
        `SELECT max("timestamp") AS any_at,
                max("timestamp") FILTER (WHERE nudge_type = 'ACTIVE_RECALL') AS recall_at
         FROM mentor_interactions
         WHERE user_id = $1 AND nudge_type = ANY($2)`,
        [userId, VIDEO_NUDGE_TYPES]
      );

      const decision = decideVideoNudge({
        watch,
        event: report.event,
        lastNudgeAt: last.any_at,
        lastRecallAt: last.recall_at,
        now: at
      });

      let nudge = null;

      if (decision) {
        const { rows: [created] } = await client.query(
          `INSERT INTO mentor_interactions
             (user_id, session_id, nudge_type, message, priority, "timestamp")
           VALUES ($1, $2, $3, $4, $5, $6)
           RETURNING id, nudge_type, message, priority, "timestamp"`,
          [userId, session.id, decision.type, decision.message, decision.priority, at]
        );

        // Every note restarts the behaviour counters; only a recall prompt
        // restarts the "how much have they watched since" markers.
        await client.query(
          `UPDATE video_watches SET
             switch_marker = tab_changes + window_changes,
             skipped_marker_s = skipped_s,
             rewind_marker = rewind_count,
             recall_count = recall_count + $2,
             recall_marker_s = CASE WHEN $2 = 1 THEN watch_time_s ELSE recall_marker_s END,
             recall_playing_marker_s = CASE WHEN $2 = 1 THEN playing_s ELSE recall_playing_marker_s END,
             recall_active_marker_s = CASE WHEN $2 = 1 THEN active_s ELSE recall_active_marker_s END
           WHERE id = $1`,
          [watch.id, decision.type === "ACTIVE_RECALL" ? 1 : 0]
        );
        if (decision.type === "ACTIVE_RECALL") watch.recall_count += 1;

        nudge = {
          id: created.id,
          type: created.nudge_type,
          message: created.message,
          priority: created.priority,
          createdAt: created.timestamp.getTime()
        };
      }

      return { watch: toWatch(watch), nudge };
    });
  }

  async function currentWatch(userId, videoId) {
    const { rows } = await pool.query(
      `SELECT w.* FROM video_watches w
       JOIN study_sessions s ON s.id = w.session_id
       WHERE w.user_id = $1 AND w.video_id = $2
       ORDER BY s.start_time DESC LIMIT 1`,
      [userId, videoId]
    );
    return toWatch(rows[0]);
  }

  async function list(userId, limit) {
    const { rows } = await pool.query(
      `SELECT * FROM video_watches WHERE user_id = $1
       ORDER BY last_seen DESC LIMIT $2`,
      [userId, limit]
    );
    return rows.map(toWatch);
  }

  return { recordProgress, currentWatch, list };
}
