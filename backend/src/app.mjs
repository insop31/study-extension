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
    "AI_MENTOR", "AI_MENTOR_ERROR"
  ]),
  message: text(4000),
  priority: z.enum(["low", "medium", "high"]).default("medium"),
  problemSlug: text(200).optional()
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

export function createApp({ pool, askMentor, verifyGoogleToken = null, now = () => new Date(), authAttemptsPerMinute = 10 }) {
  const app = express();
  const sessions = createSessionService(pool, now);
  const auth = requireAuth(pool, now);

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

      try {
        res.json(await askMentor({
          ...body,
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
        }));
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

    res.json({
      days,
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
