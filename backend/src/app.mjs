import cors from "cors";
import express from "express";
import { z } from "zod";

import {
  burnPasswordCheck,
  hashPassword,
  issueToken,
  publicUser,
  requireAuth,
  revokeToken,
  verifyPassword
} from "./auth.mjs";
import { rateLimit } from "./rateLimit.mjs";
import { createSessionService } from "./services/sessionService.mjs";
import { createProfileService } from "./services/profileService.mjs";
import { mentorStyle, profileForModel } from "./dashboard/personalize.mjs";
import { createDashboardService } from "./services/dashboardService.mjs";
import { createQuizService } from "./services/quizService.mjs";
import { createYouTubeService } from "./services/youtubeService.mjs";

const text = max => z.string().max(max);

const websiteSchema = z.enum(["leetcode", "youtube"]);

const pageSchema = z.object({
  website: websiteSchema,
  title: text(500),
  url: text(2000)
});

const activitySchema = pageSchema.extend({
  activityType: text(50),
  problemSlug: text(200).optional(),
  difficulty: text(20).optional(),
  topics: z.array(text(100)).max(30).optional(),
  programmingLanguage: text(50).optional(),
  submissionResult: text(50).optional()
});

const emailSchema = z.string().trim().toLowerCase().email().max(254);

const signupSchema = z.object({
  name: z.string().trim().max(100).optional(),
  email: emailSchema,
  password: z.string().min(8, "Password must be at least 8 characters.").max(200)
});

const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(200)
});

const googleSchema = z.object({
  idToken: z.string().min(20).max(5000),
  nonce: z.string().min(8).max(200)
});

const nudgeSchema = z.object({
  type: z.enum([
    "STUCK", "THINKING_PROMPT", "ACTIVE_RECALL", "BREAK_REMINDER",
    "AI_MENTOR", "AI_MENTOR_ERROR",
    "FOCUS_REMINDER", "SKIP_REMINDER", "CONFUSION_CHECK"
  ]),
  message: text(4000),
  priority: z.enum(["low", "medium", "high"]).default("medium"),
  problemSlug: text(200).optional()
});

const seconds = z.number().min(0).max(600);
const count = z.number().int().min(0).max(100);

const videoProgressSchema = z.object({
  video: z.object({
    videoId: z.string().regex(/^[\w-]{6,20}$/),
    title: text(500),
    channel: text(200).optional(),
    category: text(100).optional(),
    durationS: z.number().int().min(0).max(172800),
    score: z.number().int().min(-50).max(50),
    topics: z.array(text(100)).max(10)
  }),
  delta: z.object({
    watchedS: seconds,
    playingS: seconds,
    activeS: seconds,
    pausedS: seconds,
    pauseCount: count,
    tabChanges: count,
    windowChanges: count,
    skipCount: count,
    skippedS: z.number().min(0).max(172800),
    rewindCount: count,
    rewoundS: z.number().min(0).max(172800)
  }),
  positionS: z.number().min(0).max(172800),
  event: z.enum(["pause", "playing", "seek", "ended", "visibility", "blur", "periodic"])
});

const quizRequestSchema = z.object({
  videoId: z.string().regex(/^[\w-]{6,20}$/),
  nudgeId: z.uuid().optional(),
  positionS: z.number().min(0).max(172800),
  excerpt: z.object({
    startS: z.number().min(0).max(172800),
    endS: z.number().min(0).max(172800),
    text: text(8000)
  }).optional()
});

const quizAnswerSchema = z.object({
  chosenIndex: z.number().int().min(0).max(5)
});

const preferencesSchema = z.object({
  timezone: z.string().min(1).max(64).optional(),
  dailyGoalMinutes: z.number().int().min(5).max(720).optional()
}).refine(v => v.timezone !== undefined || v.dailyGoalMinutes !== undefined, {
  message: "Nothing to update."
});

const mentorSchema = z.object({
  problem: text(500).optional(),
  slug: text(200).optional(),
  difficulty: text(20).optional(),
  topics: z.array(text(100)).max(30).optional(),
  programmingLanguage: text(50).optional(),
  currentCode: text(12000).optional(),
  studentQuestion: text(1000).optional()
});

function parse(schema, data, res) {
  const result = schema.safeParse(data);
  if (!result.success) {
    res.status(400).json({
      success: false,
      error: "Invalid request.",
      details: result.error.issues.map(i => `${i.path.join(".")}: ${i.message}`)
    });
    return null;
  }
  return result.data;
}

function toNudge(row) {
  return {
    id: row.id,
    type: row.nudge_type,
    message: row.message,
    priority: row.priority,
    createdAt: row.timestamp.getTime()
  };
}

export function createApp({ pool, askMentor, generateQuiz = null, completeText = null, verifyGoogleToken = null, now = () => new Date(), authAttemptsPerMinute = 10, quizRequestsPerMinute = 6, coachRequestsPerHour = 6 }) {
  const app = express();
  // What the mentor knows about each learner, from their stored history.
  const profiles = createProfileService(pool, now);
  const sessions = createSessionService(pool, now, profiles);
  const auth = requireAuth(pool, now);
  const youtube = createYouTubeService(pool, now, profiles);
  const quizzes = createQuizService(pool, generateQuiz, now, profiles);
  const dashboard = createDashboardService(pool, { now, complete: completeText });

  app.use(cors());
  app.use(express.json({ limit: "64kb" }));

  app.get("/api/health", async (_req, res) => {
    await pool.query("SELECT 1");
    res.json({ ok: true });
  });

  // ---- auth -------------------------------------------------------------
  const authLimit = rateLimit({ windowMs: 60_000, max: authAttemptsPerMinute, key: req => req.ip });

  async function respondWithSession(res, status, userRow) {
    const token = await issueToken(pool, userRow.id, now());
    res.status(status).json({ token, user: publicUser(userRow) });
  }

  app.post("/api/auth/signup", authLimit, async (req, res) => {
    const body = parse(signupSchema, req.body, res);
    if (!body) return;

    const passwordHash = await hashPassword(body.password);
    const { rows } = await pool.query(
      `INSERT INTO users (name, email, password_hash)
       VALUES ($1, $2, $3)
       ON CONFLICT (email) DO NOTHING
       RETURNING *`,
      [body.name || null, body.email, passwordHash]
    );

    if (!rows[0]) {
      return res.status(409).json({
        success: false,
        error: "An account with this email already exists. Try signing in."
      });
    }
    await respondWithSession(res, 201, rows[0]);
  });

  app.post("/api/auth/login", authLimit, async (req, res) => {
    const body = parse(loginSchema, req.body, res);
    if (!body) return;

    const { rows } = await pool.query("SELECT * FROM users WHERE email = $1", [body.email]);
    const user = rows[0];

    // Same error and similar timing whether the email or the password is wrong.
    if (!user?.password_hash) {
      await burnPasswordCheck(body.password);
    }
    const ok = user?.password_hash
      ? await verifyPassword(body.password, user.password_hash)
      : false;

    if (!ok) {
      const googleOnly = user && !user.password_hash;
      return res.status(401).json({
        success: false,
        error: googleOnly
          ? "This account uses Google sign-in. Use \"Continue with Google\"."
          : "Incorrect email or password."
      });
    }
    await respondWithSession(res, 200, user);
  });

  app.post("/api/auth/google", authLimit, async (req, res) => {
    if (!verifyGoogleToken) {
      return res.status(503).json({ success: false, error: "Google sign-in is not configured on the server." });
    }
    const body = parse(googleSchema, req.body, res);
    if (!body) return;

    let google;
    try {
      google = await verifyGoogleToken(body);
    } catch (error) {
      console.warn("Google token rejected:", error.message);
      return res.status(401).json({ success: false, error: "Google sign-in could not be verified." });
    }

    // Returning Google user, else link to an existing account with the same
    // verified email, else create a new account.
    let { rows } = await pool.query("SELECT * FROM users WHERE google_sub = $1", [google.sub]);

    if (!rows[0] && google.email && google.emailVerified) {
      ({ rows } = await pool.query(
        `UPDATE users SET google_sub = $1, name = COALESCE(name, $3)
         WHERE email = $2 AND google_sub IS NULL
         RETURNING *`,
        [google.sub, google.email, google.name ?? null]
      ));
    }

    if (!rows[0]) {
      if (!google.email || !google.emailVerified) {
        return res.status(401).json({ success: false, error: "Your Google account has no verified email." });
      }
      ({ rows } = await pool.query(
        `INSERT INTO users (name, email, google_sub) VALUES ($1, $2, $3) RETURNING *`,
        [google.name ?? null, google.email, google.sub]
      ));
    }
    await respondWithSession(res, 200, rows[0]);
  });

  app.get("/api/auth/me", auth, async (req, res) => {
    const { rows } = await pool.query("SELECT * FROM users WHERE id = $1", [req.userId]);
    res.json({ user: publicUser(rows[0]) });
  });

  app.post("/api/auth/logout", auth, async (req, res) => {
    await revokeToken(pool, req.token);
    res.json({ success: true });
  });

  // ---- sessions ---------------------------------------------------------
  app.get("/api/sessions/current", auth, async (req, res) => {
    res.json({ session: await sessions.getCurrent(req.userId) });
  });

  app.get("/api/sessions", auth, async (req, res) => {
    const limit = Math.min(Number(req.query.limit) || 20, 100);
    res.json({ sessions: await sessions.list(req.userId, limit) });
  });

  app.post("/api/sessions", auth, async (req, res) => {
    const body = parse(pageSchema, req.body, res);
    if (!body) return;
    res.status(201).json({ session: await sessions.start(req.userId, body) });
  });

  app.patch("/api/sessions/current/page", auth, async (req, res) => {
    const body = parse(pageSchema, req.body, res);
    if (!body) return;
    res.json({ session: await sessions.updatePage(req.userId, body) });
  });

  app.put("/api/sessions/current/state", auth, async (req, res) => {
    const body = parse(z.object({ state: z.enum(["active", "idle", "paused"]) }), req.body, res);
    if (!body) return;
    res.json({ session: await sessions.setState(req.userId, body.state) });
  });

  app.post("/api/sessions/current/end", auth, async (req, res) => {
    res.json({ session: await sessions.end(req.userId) });
  });

  app.post("/api/sessions/current/activity", auth, async (req, res) => {
    const body = parse(activitySchema, req.body, res);
    if (!body) return;
    const result = await sessions.recordActivity(req.userId, body);
    res.json(result ?? { session: null, nudgeState: null });
  });

  // ---- activities -------------------------------------------------------
  app.get("/api/activities", auth, async (req, res) => {
    const limit = Math.min(Number(req.query.limit) || 50, 500);
    const slug = typeof req.query.problemSlug === "string" ? req.query.problemSlug : null;
    const { rows } = await pool.query(
      `SELECT * FROM (
         SELECT * FROM activities
         WHERE user_id = $1 AND ($2::text IS NULL OR problem_slug = $2)
         ORDER BY "timestamp" DESC LIMIT $3
       ) recent ORDER BY "timestamp" ASC`,
      [req.userId, slug, limit]
    );
    res.json({
      activities: rows.map(r => ({
        timestamp: r.timestamp.getTime(),
        type: r.activity_type,
        website: r.website,
        pageTitle: r.page_title,
        problemSlug: r.problem_slug,
        difficulty: r.difficulty,
        topics: r.topics,
        programmingLanguage: r.programming_language,
        submissionResult: r.submission_result
      }))
    });
  });

  // ---- nudges (mentor_interactions) ------------------------------------
  app.get("/api/nudges/current", auth, async (req, res) => {
    const { rows } = await pool.query(
      `SELECT * FROM mentor_interactions
       WHERE user_id = $1 AND user_response IS NULL
       ORDER BY "timestamp" DESC LIMIT 1`,
      [req.userId]
    );
    res.json({ nudge: rows[0] ? toNudge(rows[0]) : null });
  });

  app.post("/api/nudges", auth, async (req, res) => {
    const body = parse(nudgeSchema, req.body, res);
    if (!body) return;

    const session = await sessions.getCurrent(req.userId);
    const { rows } = await pool.query(
      `INSERT INTO mentor_interactions
         (user_id, session_id, nudge_type, message, priority, problem_slug)
       VALUES ($1,$2,$3,$4,$5,$6)
       RETURNING *`,
      [req.userId, session?.id ?? null, body.type, body.message, body.priority, body.problemSlug ?? null]
    );
    res.status(201).json({ nudge: toNudge(rows[0]) });
  });

  app.post("/api/nudges/:id/dismiss", auth, async (req, res) => {
    if (!z.uuid().safeParse(req.params.id).success) {
      return res.status(400).json({ success: false, error: "Invalid nudge id." });
    }
    await pool.query(
      `UPDATE mentor_interactions SET user_response = 'dismissed'
       WHERE id = $1 AND user_id = $2`,
      [req.params.id, req.userId]
    );
    res.json({ success: true });
  });

  // ---- YouTube ----------------------------------------------------------
  app.post("/api/youtube/progress", auth, async (req, res) => {
    const body = parse(videoProgressSchema, req.body, res);
    if (!body) return;
    res.json(await youtube.recordProgress(req.userId, body));
  });

  app.get("/api/youtube/watches/current", auth, async (req, res) => {
    const videoId = typeof req.query.videoId === "string" ? req.query.videoId : "";
    const watch = videoId ? await youtube.currentWatch(req.userId, videoId) : null;
    res.json({
      watch: watch ? { ...watch, quiz: await quizzes.summaryForVideo(req.userId, videoId) } : null
    });
  });

  // Asks the AI for a question about what the learner just watched. The
  // correct answer is withheld until they answer.
  app.post(
    "/api/youtube/quiz",
    auth,
    rateLimit({ windowMs: 60_000, max: quizRequestsPerMinute, key: req => req.userId }),
    async (req, res) => {
      const body = parse(quizRequestSchema, req.body, res);
      if (!body) return;
      const outcome = await quizzes.create(req.userId, body);
      if (outcome.error) {
        return res.status(outcome.status).json({ success: false, error: outcome.error });
      }
      res.status(201).json({ success: true, quiz: outcome.quiz });
    }
  );

  app.post("/api/youtube/quiz/:id/answer", auth, async (req, res) => {
    if (!z.uuid().safeParse(req.params.id).success) {
      return res.status(400).json({ success: false, error: "Invalid question id." });
    }
    const body = parse(quizAnswerSchema, req.body, res);
    if (!body) return;
    const outcome = await quizzes.answer(req.userId, req.params.id, body.chosenIndex);
    if (outcome.error) {
      return res.status(outcome.status).json({ success: false, error: outcome.error });
    }
    res.json({ success: true, ...outcome.result });
  });

  app.get("/api/youtube/watches", auth, async (req, res) => {
    const limit = Math.min(Number(req.query.limit) || 20, 100);
    res.json({ watches: await youtube.list(req.userId, limit) });
  });

  // ---- learning dashboard ----------------------------------------------
  app.get("/api/me/preferences", auth, async (req, res) => {
    res.json({ preferences: await dashboard.preferences(req.userId) });
  });

  app.put("/api/me/preferences", auth, async (req, res) => {
    const body = parse(preferencesSchema, req.body, res);
    if (!body) return;
    const outcome = await dashboard.updatePreferences(req.userId, body);
    if (outcome.error) return res.status(400).json({ success: false, error: outcome.error });
    res.json(outcome);
  });

  app.get("/api/dashboard", auth, async (req, res) => {
    res.json(await dashboard.build(req.userId));
  });

  app.get("/api/dashboard/coach", auth, async (req, res) => {
    res.json({ report: await dashboard.latestCoachReport(req.userId) });
  });

  app.post(
    "/api/dashboard/coach",
    auth,
    rateLimit({ windowMs: 60 * 60_000, max: coachRequestsPerHour, key: req => req.userId }),
    async (req, res) => {
      const outcome = await dashboard.writeCoachReport(req.userId);
      if (outcome.error) {
        return res.status(outcome.status).json({ success: false, error: outcome.error });
      }
      res.status(201).json({ success: true, report: outcome.report });
    }
  );

  // ---- AI mentor --------------------------------------------------------
  app.post(
    "/api/mentor",
    auth,
    rateLimit({ windowMs: 60_000, max: 10, key: req => req.userId }),
    async (req, res) => {
      const body = parse(mentorSchema, req.body, res);
      if (!body) return;

      const session = await sessions.getCurrent(req.userId);

      // Recent signals come from the database, not from the client.
      const { rows } = await pool.query(
        `SELECT * FROM (
           SELECT activity_type, "timestamp", programming_language, submission_result
           FROM activities
           WHERE user_id = $1 AND website = 'leetcode'
             AND ($2::text IS NULL OR problem_slug = $2)
           ORDER BY "timestamp" DESC LIMIT 25
         ) recent ORDER BY "timestamp" ASC`,
        [req.userId, body.slug ?? null]
      );

      // Tailor the hint to this learner: their level, how they do in this
      // topic, problems they already solved, and whether past hints worked.
      const profile = await profiles.get(req.userId, {
        topics: body.topics,
        difficulty: body.difficulty,
        problemSlug: body.slug
      });

      try {
        res.json(await askMentor({
          ...body,
          learner: profileForModel(profile),
          activeMinutes: Math.floor((session?.totalActiveTime ?? 0) / 60000),
          recentSignals: rows.map(r => ({
            type: r.activity_type,
            at: r.timestamp.toISOString(),
            language: r.programming_language,
            submissionResult: r.submission_result
          })),
          studentQuestion:
            body.studentQuestion?.trim() ||
            "Give me the single most useful next step."
        }, { style: mentorStyle(profile) }));
      } catch (error) {
        console.error("Mentor error:", error);
        res.status(502).json({ success: false, error: "The mentor could not respond right now." });
      }
    }
  );

  // ---- stats ------------------------------------------------------------
  app.get("/api/stats/summary", auth, async (req, res) => {
    const days = Math.min(Number(req.query.days) || 7, 365);

    const { rows: perDay } = await pool.query(
      `SELECT to_char(date_trunc('day', start_time), 'YYYY-MM-DD') AS day,
              sum(active_duration_ms)::bigint AS active_ms
       FROM study_sessions
       WHERE user_id = $1 AND start_time >= $3::timestamptz - make_interval(days => $2)
       GROUP BY 1 ORDER BY 1`,
      [req.userId, days, now()]
    );

    const { rows: topics } = await pool.query(
      `SELECT t.topic,
              count(*)::int AS attempts,
              count(*) FILTER (WHERE a.result = 'accepted')::int AS accepted
       FROM problem_attempts a
       JOIN problems p ON p.id = a.problem_id
       CROSS JOIN LATERAL unnest(p.topics) AS t(topic)
       WHERE a.user_id = $1
       GROUP BY t.topic
       ORDER BY attempts DESC`,
      [req.userId]
    );

    const { rows: [solved] } = await pool.query(
      `SELECT count(DISTINCT problem_id)::int AS n
       FROM problem_attempts WHERE user_id = $1 AND result = 'accepted'`,
      [req.userId]
    );

    const { rows: [videoTotals] } = await pool.query(
      `SELECT count(DISTINCT video_id)::int AS videos,
              COALESCE(sum(watch_time_s), 0) AS watched_s
       FROM video_watches
       WHERE user_id = $1 AND last_seen >= $2::timestamptz - make_interval(days => $3)`,
      [req.userId, now(), days]
    );

    const { rows: videoTopics } = await pool.query(
      `SELECT t.topic, sum(w.watch_time_s) AS watched_s
       FROM video_watches w
       CROSS JOIN LATERAL unnest(w.topics) AS t(topic)
       WHERE w.user_id = $1 AND w.last_seen >= $2::timestamptz - make_interval(days => $3)
       GROUP BY t.topic ORDER BY watched_s DESC, t.topic LIMIT 10`,
      [req.userId, now(), days]
    );

    const { rows: [quizTotals] } = await pool.query(
      `SELECT count(*) FILTER (WHERE answered_at IS NOT NULL)::int AS answered,
              count(*) FILTER (WHERE correct)::int AS correct
       FROM video_quizzes
       WHERE user_id = $1 AND created_at >= $2::timestamptz - make_interval(days => $3)`,
      [req.userId, now(), days]
    );

    res.json({
      days,
      videos: {
        quizzes: quizTotals,
        count: videoTotals.videos,
        watchedMs: Math.round(Number(videoTotals.watched_s) * 1000),
        topics: videoTopics.map(t => ({ topic: t.topic, watchedMs: Math.round(Number(t.watched_s) * 1000) }))
      },
      totalActiveMs: perDay.reduce((sum, r) => sum + Number(r.active_ms), 0),
      perDay: perDay.map(r => ({ day: r.day, activeMs: Number(r.active_ms) })),
      problemsSolved: solved.n,
      topics: topics.map(t => ({
        topic: t.topic,
        attempts: t.attempts,
        accepted: t.accepted,
        successRate: Math.round((t.accepted / t.attempts) * 100)
      }))
    });
  });

  // ---- errors -----------------------------------------------------------
  app.use((_req, res) => {
    res.status(404).json({ success: false, error: "Not found." });
  });

  app.use((error, _req, res, _next) => {
    console.error("Unhandled error:", error);
    res.status(500).json({ success: false, error: "Internal server error." });
  });

  return app;
}
