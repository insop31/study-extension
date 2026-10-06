import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";

import EmbeddedPostgres from "embedded-postgres";

import { migrate } from "../db/migrate.mjs";
import { createApp } from "../src/app.mjs";
import { createPool } from "../src/db.mjs";

// Uses TEST_DATABASE_URL if set, otherwise boots a throwaway embedded Postgres.
// A random port avoids clashing with a leftover instance from an interrupted run.
const pgPort = 55000 + Math.floor(Math.random() * 5000);
let embedded;
let dataDir;
let pool;
let server;
let base;
let clock = new Date("2026-01-01T10:00:00Z");
const advance = ms => { clock = new Date(clock.getTime() + ms); };

async function api(method, path, { token, body } = {}) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });
  return { status: res.status, body: await res.json() };
}

const signup = (email, password = "password123") =>
  api("POST", "/api/auth/signup", { body: { email, password } });

before(async () => {
  let url = process.env.TEST_DATABASE_URL;

  if (!url) {
    dataDir = await mkdtemp(join(tmpdir(), "mentor-pg-"));
    embedded = new EmbeddedPostgres({
      databaseDir: dataDir,
      user: "postgres",
      password: "postgres",
      port: pgPort,
      persistent: false
    });
    await embedded.initialise();
    await embedded.start();
    url = `postgres://postgres:postgres@localhost:${pgPort}/postgres`;
  }

  pool = createPool(url);
  await migrate(pool);

  const app = createApp({
    pool,
    now: () => clock,
    authAttemptsPerMinute: 1000,
    quizRequestsPerMinute: 1000,
    verifyGoogleToken: async ({ idToken, nonce }) => {
      if (idToken.startsWith("bad")) throw new Error("bad token");
      const [, sub, email, verified] = idToken.split("|");
      return { sub, email, emailVerified: verified === "true", name: "Gina Google", nonce };
    },
    generateQuiz: async ({ video, excerpt, positionS }) => {
      if (excerpt?.text === "FAIL") return { success: false, error: "The AI model is rate-limited right now." };
      return {
        success: true,
        quiz: {
          question: `What does ${video.topics[0]} avoid?`,
          options: ["Repeated work", "Memory", "Recursion", "Loops"],
          correctIndex: 0,
          explanation: "It stores results so the same subproblem is never solved twice.",
          concept: video.topics[0],
          grounded: Boolean(excerpt),
          rewatch: excerpt
            ? { startS: excerpt.startS + 30, endS: excerpt.startS + 150 }
            : { startS: Math.max(0, positionS - 180), endS: positionS }
        }
      };
    },
    completeText: async ({ input }) => ({
      success: true,
      text: `Plan for ${JSON.parse(input).summary.problemsSolved} solved problems.
- Practise Graphs`
    }),
    askMentor: async ctx => ({ success: true, guidance: `hint for ${ctx.slug}` })
  });
  await new Promise(resolve => { server = app.listen(0, "127.0.0.1", resolve); });
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  server?.close();
  // Idle keep-alive connections would otherwise keep the process open.
  server?.closeAllConnections?.();
  await pool?.end();
  // Stopping also deletes the data folder, which Windows may still hold
  // locked; that must not fail the run.
  await embedded?.stop().catch(() => {});
  // Windows can keep the folder locked for a moment after Postgres exits;
  // a leftover temp folder must not fail the run.
  if (dataDir) {
    await rm(dataDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 })
      .catch(() => {});
  }
});

const page = {
  website: "leetcode",
  title: "Two Sum - LeetCode",
  url: "https://leetcode.com/problems/two-sum/"
};
const activity = (activityType, extra = {}) => ({
  ...page,
  activityType,
  problemSlug: "two-sum",
  difficulty: "Easy",
  topics: ["Array", "Hash Table"],
  programmingLanguage: "C++",
  ...extra
});

describe("study mentor API", () => {
  let token;

  it("rejects requests without a valid token", async () => {
    assert.equal((await api("GET", "/api/sessions/current")).status, 401);
    assert.equal((await api("GET", "/api/sessions/current", { token: "nope" })).status, 401);
  });

  it("signs up with email and password", async () => {
    const res = await api("POST", "/api/auth/signup", {
      body: { name: "Sam", email: "Sam@Example.com", password: "correct horse" }
    });
    assert.equal(res.status, 201);
    assert.ok(res.body.token);
    assert.equal(res.body.user.email, "sam@example.com");
    assert.equal(res.body.user.hasGoogle, false);
    assert.equal(res.body.user.password_hash, undefined);
    token = res.body.token;
  });

  it("rejects weak passwords, bad emails and duplicate accounts", async () => {
    assert.equal((await signup("a@example.com", "short")).status, 400);
    assert.equal((await signup("not-an-email")).status, 400);
    assert.equal((await signup("sam@example.com")).status, 409);
  });

  it("logs in with the right password only", async () => {
    let res = await api("POST", "/api/auth/login", {
      body: { email: "sam@example.com", password: "correct horse" }
    });
    assert.equal(res.status, 200);
    assert.notEqual(res.body.token, token); // a separate token per sign-in

    const wrong = await api("POST", "/api/auth/login", {
      body: { email: "sam@example.com", password: "wrong password" }
    });
    const unknown = await api("POST", "/api/auth/login", {
      body: { email: "nobody@example.com", password: "whatever12" }
    });
    assert.equal(wrong.status, 401);
    assert.equal(unknown.status, 401);
    assert.equal(wrong.body.error, unknown.body.error);

    res = await api("GET", "/api/auth/me", { token });
    assert.equal(res.body.user.email, "sam@example.com");
  });

  it("has no session at first", async () => {
    const res = await api("GET", "/api/sessions/current", { token });
    assert.equal(res.body.session, null);
  });

  it("validates input", async () => {
    const res = await api("POST", "/api/sessions", { token, body: { website: "nope" } });
    assert.equal(res.status, 400);
  });

  it("starts a session", async () => {
    const res = await api("POST", "/api/sessions", { token, body: page });
    assert.equal(res.status, 201);
    assert.equal(res.body.session.isActive, true);
    assert.equal(res.body.session.userState, "active");
    assert.equal(res.body.session.totalActiveTime, 0);
  });

  it("credits short gaps and ignores long ones", async () => {
    advance(10_000);
    let res = await api("POST", "/api/sessions/current/activity", { token, body: activity("keydown") });
    assert.equal(res.body.session.totalActiveTime, 10_000);

    advance(5 * 60_000); // longer than the idle threshold
    res = await api("POST", "/api/sessions/current/activity", { token, body: activity("keydown") });
    assert.equal(res.body.session.totalActiveTime, 10_000);
  });

  it("does not count time spent idle", async () => {
    advance(20_000);
    let res = await api("PUT", "/api/sessions/current/state", { token, body: { state: "idle" } });
    assert.equal(res.body.session.totalActiveTime, 30_000);
    assert.equal(res.body.session.userState, "idle");

    advance(30_000);
    res = await api("POST", "/api/sessions/current/activity", { token, body: activity("keydown") });
    assert.equal(res.body.session.totalActiveTime, 30_000);
    assert.equal(res.body.session.userState, "active");
  });

  it("records attempts from final verdicts only", async () => {
    advance(2_000);
    await api("POST", "/api/sessions/current/activity", {
      token, body: activity("submission", { submissionResult: "submitted" })
    });
    advance(2_000);
    let res = await api("POST", "/api/sessions/current/activity", {
      token, body: activity("submission", { submissionResult: "wrong_answer" })
    });
    assert.equal(res.body.nudgeState.failedAttempts, 1);

    advance(2_000);
    res = await api("POST", "/api/sessions/current/activity", {
      token, body: activity("submission", { submissionResult: "wrong_answer" })
    });
    assert.equal(res.body.nudgeState.failedAttempts, 2);
  });

  it("stores meaningful activities but not heartbeats", async () => {
    await api("POST", "/api/sessions/current/activity", { token, body: activity("heartbeat") });
    const res = await api("GET", "/api/activities?problemSlug=two-sum", { token });
    const types = res.body.activities.map(a => a.type);
    assert.ok(types.includes("submission"));
    assert.ok(!types.includes("heartbeat"));
  });

  it("stores, returns and dismisses nudges", async () => {
    let res = await api("POST", "/api/nudges", {
      token, body: { type: "THINKING_PROMPT", message: "Think!", priority: "medium" }
    });
    assert.equal(res.status, 201);
    const id = res.body.nudge.id;

    res = await api("GET", "/api/nudges/current", { token });
    assert.equal(res.body.nudge.id, id);

    advance(1_000);
    res = await api("POST", "/api/sessions/current/activity", { token, body: activity("keydown") });
    assert.ok(res.body.nudgeState.lastNudgeAt);

    await api("POST", `/api/nudges/${id}/dismiss`, { token });
    res = await api("GET", "/api/nudges/current", { token });
    assert.equal(res.body.nudge, null);
  });

  it("asks the mentor with server-side context", async () => {
    const res = await api("POST", "/api/mentor", {
      token, body: { slug: "two-sum", problem: "Two Sum" }
    });
    assert.deepEqual(res.body, { success: true, guidance: "hint for two-sum" });
  });

  it("builds a stats summary", async () => {
    advance(1_000);
    await api("POST", "/api/sessions/current/activity", {
      token, body: activity("submission", { submissionResult: "accepted" })
    });
    const res = await api("GET", "/api/stats/summary", { token });
    assert.equal(res.body.problemsSolved, 1);
    const array = res.body.topics.find(t => t.topic === "Array");
    assert.equal(array.attempts, 3);
    assert.equal(array.accepted, 1);
    assert.equal(array.successRate, 33);
    assert.ok(res.body.totalActiveMs > 0);
  });

  it("ends the session and dismisses open nudges", async () => {
    await api("POST", "/api/nudges", { token, body: { type: "ACTIVE_RECALL", message: "Recall" } });
    advance(5_000);
    const res = await api("POST", "/api/sessions/current/end", { token });
    assert.equal(res.body.session.isActive, false);
    assert.equal(res.body.session.userState, "paused");

    const nudge = await api("GET", "/api/nudges/current", { token });
    assert.equal(nudge.body.nudge, null);

    // Activity after the end must not change the finished session.
    advance(1_000);
    const after = await api("POST", "/api/sessions/current/activity", { token, body: activity("keydown") });
    assert.equal(after.body.session.totalActiveTime, res.body.session.totalActiveTime);
  });

  it("keeps each user's data separate", async () => {
    const other = (await signup("other@example.com")).body.token;
    const res = await api("GET", "/api/sessions/current", { token: other });
    assert.equal(res.body.session, null);
    const stats = await api("GET", "/api/stats/summary", { token: other });
    assert.equal(stats.body.problemsSolved, 0);
  });

  it("signs in with Google, linking an existing email account", async () => {
    const nonce = "nonce-12345678";

    // New Google user -> new account.
    let res = await api("POST", "/api/auth/google", {
      body: { idToken: "g|sub-1|gina@example.com|true", nonce }
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.user.hasGoogle, true);
    const ginaId = res.body.user.id;

    // Same Google account again -> same user.
    res = await api("POST", "/api/auth/google", {
      body: { idToken: "g|sub-1|gina@example.com|true", nonce }
    });
    assert.equal(res.body.user.id, ginaId);

    // Google account whose verified email matches a password account -> linked.
    const sam = await api("GET", "/api/auth/me", { token });
    res = await api("POST", "/api/auth/google", {
      body: { idToken: "g|sub-2|sam@example.com|true", nonce }
    });
    assert.equal(res.body.user.id, sam.body.user.id);
    assert.equal(res.body.user.hasGoogle, true);
  });

  it("rejects bad or unverified Google tokens", async () => {
    const nonce = "nonce-12345678";
    let res = await api("POST", "/api/auth/google", { body: { idToken: "bad-token-0000000000000", nonce } });
    assert.equal(res.status, 401);

    res = await api("POST", "/api/auth/google", {
      body: { idToken: "g|sub-3|unverified@example.com|false", nonce }
    });
    assert.equal(res.status, 401);
  });

  it("explains Google-only accounts at the password login", async () => {
    const res = await api("POST", "/api/auth/login", {
      body: { email: "gina@example.com", password: "anything123" }
    });
    assert.equal(res.status, 401);
    assert.match(res.body.error, /Google/);
  });

  it("logs out and expires tokens", async () => {
    const fresh = (await api("POST", "/api/auth/login", {
      body: { email: "sam@example.com", password: "correct horse" }
    })).body.token;

    assert.equal((await api("POST", "/api/auth/logout", { token: fresh })).status, 200);
    assert.equal((await api("GET", "/api/auth/me", { token: fresh })).status, 401);

    const old = (await api("POST", "/api/auth/login", {
      body: { email: "sam@example.com", password: "correct horse" }
    })).body.token;
    advance(31 * 24 * 60 * 60 * 1000);
    assert.equal((await api("GET", "/api/auth/me", { token: old })).status, 401);
  });

  it("never creates overlapping sessions when page events arrive together", async () => {
    const token = (await signup("burst@example.com")).body.token;
    const page = { website: "youtube", title: "Lecture", url: "https://www.youtube.com/watch?v=abcdefghijk" };

    await Promise.all(
      Array.from({ length: 8 }, () => api("PATCH", "/api/sessions/current/page", { token, body: page }))
    );

    const { body } = await api("GET", "/api/sessions", { token });
    assert.equal(body.sessions.length, 1);
    assert.equal(body.sessions[0].isActive, true);
  });

  describe("YouTube tracking", () => {
    let yt;

    const video = {
      videoId: "oBt53YbR9Kk",
      title: "Dynamic Programming - Learn to Solve Algorithmic Problems",
      channel: "freeCodeCamp.org",
      category: "Education",
      durationS: 18000,
      score: 10,
      topics: ["Dynamic Programming", "Recursion"]
    };
    const delta = (extra = {}) => ({
      watchedS: 0, playingS: 0, activeS: 0, pausedS: 0, pauseCount: 0,
      tabChanges: 0, windowChanges: 0, skipCount: 0, skippedS: 0,
      rewindCount: 0, rewoundS: 0, ...extra
    });
    const progress = (event, d, positionS = 0) =>
      api("POST", "/api/youtube/progress", { token: yt, body: { video, delta: delta(d), positionS, event } });

    // Minutes of attentive, uninterrupted viewing.
    const watchMinutes = m => ({ watchedS: m * 60, playingS: m * 60, activeS: m * 60 });
    const minutes = m => advance(m * 60_000);

    before(async () => {
      yt = (await signup("yt@example.com")).body.token;
    });

    it("ignores progress when no session is open", async () => {
      const res = await progress("periodic", {});
      assert.equal(res.status, 200);
      assert.equal(res.body.watch, null);
    });

    it("accumulates deltas for one video", async () => {
      await api("POST", "/api/sessions", {
        token: yt,
        body: { website: "youtube", title: video.title, url: "https://www.youtube.com/watch?v=oBt53YbR9Kk" }
      });

      let res = await progress("periodic", watchMinutes(1), 60);
      assert.equal(res.body.watch.watchedS, 60);

      res = await progress("visibility", { tabChanges: 1, pausedS: 30 }, 60);
      res = await progress("blur", { windowChanges: 1 }, 60);
      assert.equal(res.body.watch.tabChanges, 1);
      assert.equal(res.body.watch.windowChanges, 1);
      assert.equal(res.body.watch.pausedS, 30);
      assert.equal(res.body.watch.maxPositionS, 60);
      assert.equal(res.body.watch.activePercent, 100);
      assert.deepEqual(res.body.watch.topics, ["Dynamic Programming", "Recursion"]);
      assert.equal(res.body.nudge, null);
    });

    it("does not prompt after too little viewing", async () => {
      const res = await progress("pause", { pauseCount: 1, ...watchMinutes(0.4) }, 90);
      assert.equal(res.body.watch.pauseCount, 1);
      assert.equal(res.body.nudge, null); // 84 seconds watched, a pause needs 90
    });

    it("asks the learner to recall when they pause after a real stretch", async () => {
      const res = await progress("pause", { pauseCount: 1, ...watchMinutes(0.2) }, 110);
      assert.equal(res.body.nudge.type, "ACTIVE_RECALL");
      assert.equal(
        res.body.nudge.message,
        "Pause for a moment. Can you explain the concept you just learned without replaying the video?"
      );
      assert.equal(res.body.watch.recallCount, 1);

      const current = await api("GET", "/api/nudges/current", { token: yt });
      assert.equal(current.body.nudge.id, res.body.nudge.id);
    });

    it("prompts on a long unbroken stretch, once the minimum gap has passed", async () => {
      minutes(0.5);
      let res = await progress("periodic", watchMinutes(5), 400);
      assert.equal(res.body.nudge, null); // inside the 90 second gap

      minutes(2);
      res = await progress("periodic", {}, 400);
      assert.equal(res.body.nudge.type, "ACTIVE_RECALL");
      assert.equal(res.body.watch.recallCount, 2);
    });

    it("notices repeated switching away and asks the learner to stay focused", async () => {
      minutes(2);
      let res = await progress("visibility", { tabChanges: 2 }, 400);
      assert.equal(res.body.nudge, null); // two switches is not yet a pattern

      res = await progress("blur", { windowChanges: 1 }, 400);
      assert.equal(res.body.nudge.type, "FOCUS_REMINDER");
      assert.match(res.body.nudge.message, /switched away from the video 3 times/);

      // The counter restarts after a note.
      minutes(2);
      res = await progress("visibility", { tabChanges: 1 }, 400);
      assert.equal(res.body.nudge, null);
    });

    it("notices skipping and rewinding", async () => {
      minutes(2);
      let res = await progress("seek", { skipCount: 1, skippedS: 150 }, 600);
      assert.equal(res.body.nudge.type, "SKIP_REMINDER");
      assert.match(res.body.nudge.message, /skipped about 3 min/);
      assert.match(res.body.nudge.message, /Dynamic Programming/);

      minutes(2);
      res = await progress("seek", { rewindCount: 3, rewoundS: 60 }, 500);
      assert.equal(res.body.nudge.type, "CONFUSION_CHECK");
      assert.match(res.body.nudge.message, /rewound 3 times/);
    });

    it("does not prompt a learner who was mostly away from the video", async () => {
      minutes(10);
      // 10 minutes of playback, but only 1 minute with the tab in focus.
      const res = await progress("periodic", { watchedS: 600, playingS: 600, activeS: 60 }, 1800);
      assert.equal(res.body.nudge, null);
    });

    it("looks up the current watch and rejects bad payloads", async () => {
      let res = await api("GET", "/api/youtube/watches/current?videoId=oBt53YbR9Kk", { token: yt });
      assert.equal(res.body.watch.videoId, "oBt53YbR9Kk");

      res = await api("GET", "/api/youtube/watches/current?videoId=unknown", { token: yt });
      assert.equal(res.body.watch, null);

      res = await api("POST", "/api/youtube/progress", {
        token: yt, body: { video, delta: delta({ watchedS: 99999 }), positionS: 0, event: "periodic" }
      });
      assert.equal(res.status, 400);
    });

    it("includes video time in the stats summary", async () => {
      const res = await api("GET", "/api/stats/summary", { token: yt });
      assert.equal(res.body.videos.count, 1);
      assert.ok(res.body.videos.watchedMs > 0);
      assert.equal(res.body.videos.topics[0].topic, "Dynamic Programming");
    });
  });

  describe("video quizzes", () => {
    let qt;
    let other;
    const video = {
      videoId: "quizVideo_01", title: "Memoization explained", channel: "Teacher",
      category: "Education", durationS: 1800, score: 9, topics: ["Dynamic Programming"]
    };
    const zero = {
      watchedS: 0, playingS: 0, activeS: 0, pausedS: 0, pauseCount: 0, tabChanges: 0,
      windowChanges: 0, skipCount: 0, skippedS: 0, rewindCount: 0, rewoundS: 0
    };
    const excerpt = { startS: 600, endS: 840, text: "[620] Memoization stores each result." };

    before(async () => {
      qt = (await signup("quiz@example.com")).body.token;
      other = (await signup("quiz-other@example.com")).body.token;
      await api("POST", "/api/sessions", {
        token: qt, body: { website: "youtube", title: video.title, url: "https://www.youtube.com/watch?v=quizVideo_01" }
      });
    });

    const ask = (body, token = qt) => api("POST", "/api/youtube/quiz", { token, body });

    it("needs the video to have been watched first", async () => {
      const res = await ask({ videoId: video.videoId, positionS: 840, excerpt });
      assert.equal(res.status, 404);
    });

    it("asks a question without revealing the answer", async () => {
      await api("POST", "/api/youtube/progress", {
        token: qt, body: { video, delta: { ...zero, watchedS: 30 }, positionS: 840, event: "periodic" }
      });

      const res = await ask({ videoId: video.videoId, positionS: 840, excerpt });
      assert.equal(res.status, 201);
      assert.equal(res.body.quiz.options.length, 4);
      assert.equal(res.body.quiz.grounded, true);
      const text = JSON.stringify(res.body);
      assert.ok(!("correctIndex" in res.body.quiz));
      assert.ok(!text.includes("same subproblem"), "the explanation must not be sent before answering");
    });

    it("tells the learner they are right", async () => {
      const { body: { quiz } } = await ask({ videoId: video.videoId, positionS: 840, excerpt });
      const res = await api("POST", `/api/youtube/quiz/${quiz.id}/answer`, { token: qt, body: { chosenIndex: 0 } });
      assert.equal(res.body.correct, true);
      assert.equal(res.body.correctIndex, 0);
      assert.equal(res.body.rewatch, null);
    });

    it("explains a wrong answer and points to the part to watch again", async () => {
      const { body: { quiz } } = await ask({ videoId: video.videoId, positionS: 840, excerpt });
      const res = await api("POST", `/api/youtube/quiz/${quiz.id}/answer`, { token: qt, body: { chosenIndex: 2 } });
      assert.equal(res.body.correct, false);
      assert.equal(res.body.correctIndex, 0);
      assert.match(res.body.explanation, /same subproblem/);
      assert.deepEqual(res.body.rewatch, { startS: 630, endS: 750 });
    });

    it("counts only the first answer", async () => {
      const { body: { quiz } } = await ask({ videoId: video.videoId, positionS: 840, excerpt });
      await api("POST", `/api/youtube/quiz/${quiz.id}/answer`, { token: qt, body: { chosenIndex: 1 } });
      const again = await api("POST", `/api/youtube/quiz/${quiz.id}/answer`, { token: qt, body: { chosenIndex: 0 } });
      assert.equal(again.body.correct, false);
      assert.equal(again.body.chosenIndex, 1);
    });

    it("falls back to the last few minutes when there is no transcript", async () => {
      const { body: { quiz } } = await ask({ videoId: video.videoId, positionS: 900 });
      assert.equal(quiz.grounded, false);
      const res = await api("POST", `/api/youtube/quiz/${quiz.id}/answer`, { token: qt, body: { chosenIndex: 3 } });
      assert.deepEqual(res.body.rewatch, { startS: 720, endS: 900 });
    });

    it("rejects bad input and other people's questions", async () => {
      const { body: { quiz } } = await ask({ videoId: video.videoId, positionS: 840, excerpt });

      assert.equal((await api("POST", `/api/youtube/quiz/${quiz.id}/answer`, { token: qt, body: { chosenIndex: 9 } })).status, 400);
      assert.equal((await api("POST", `/api/youtube/quiz/${quiz.id}/answer`, { token: qt, body: { chosenIndex: 4 } })).status, 400);
      assert.equal((await api("POST", `/api/youtube/quiz/${quiz.id}/answer`, { token: other, body: { chosenIndex: 0 } })).status, 404);
      assert.equal((await api("POST", "/api/youtube/quiz/not-a-uuid/answer", { token: qt, body: { chosenIndex: 0 } })).status, 400);
      assert.equal((await ask({ videoId: video.videoId, positionS: 1, excerpt: { startS: 0, endS: 1, text: "x".repeat(9000) } })).status, 400);
    });

    it("reports a failed generation without breaking", async () => {
      const res = await ask({ videoId: video.videoId, positionS: 840, excerpt: { ...excerpt, text: "FAIL" } });
      assert.equal(res.status, 502);
      assert.match(res.body.error, /rate-limited/);
    });

    it("closes the prompt that led to the question once it is answered", async () => {
      const nudge = (await api("POST", "/api/nudges", {
        token: qt, body: { type: "ACTIVE_RECALL", message: "Pause for a moment." }
      })).body.nudge;
      const { body: { quiz } } = await ask({ videoId: video.videoId, positionS: 840, excerpt, nudgeId: nudge.id });

      assert.equal((await api("GET", "/api/nudges/current", { token: qt })).body.nudge.id, nudge.id);
      await api("POST", `/api/youtube/quiz/${quiz.id}/answer`, { token: qt, body: { chosenIndex: 0 } });
      assert.equal((await api("GET", "/api/nudges/current", { token: qt })).body.nudge, null);
    });

    it("summarises quiz results for the video and the stats", async () => {
      const watch = (await api("GET", `/api/youtube/watches/current?videoId=${video.videoId}`, { token: qt })).body.watch;
      assert.ok(watch.quiz.asked >= 5);
      assert.ok(watch.quiz.correct >= 2);
      assert.ok(watch.quiz.answered >= watch.quiz.correct);

      const stats = (await api("GET", "/api/stats/summary", { token: qt })).body;
      assert.equal(stats.videos.quizzes.correct, watch.quiz.correct);
    });
  });

  describe("learning dashboard", () => {
    let dt;
    const MIN = 60_000;
    const localDay = date =>
      new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(date);

    before(async () => {
      dt = (await signup("dash@example.com")).body.token;
    });

    it("stores and validates preferences", async () => {
      let res = await api("PUT", "/api/me/preferences", { token: dt, body: { timezone: "Asia/Kolkata", dailyGoalMinutes: 45 } });
      assert.deepEqual(res.body.preferences, { timezone: "Asia/Kolkata", dailyGoalMinutes: 45 });

      assert.equal((await api("PUT", "/api/me/preferences", { token: dt, body: { timezone: "Mars/Olympus" } })).status, 400);
      assert.equal((await api("PUT", "/api/me/preferences", { token: dt, body: {} })).status, 400);
      assert.equal((await api("PUT", "/api/me/preferences", { token: dt, body: { dailyGoalMinutes: 2 } })).status, 400);
    });

    it("shows an empty dashboard and how to start", async () => {
      const { body } = await api("GET", "/api/dashboard", { token: dt });
      assert.equal(body.summary.thisWeekMs, 0);
      assert.equal(body.summary.successRate, null);
      assert.equal(body.weekly.days.length, 7);
      assert.equal(body.weekly.weeks.length, 8);
      assert.ok(body.heatmap.length >= 78 && body.heatmap.length <= 84);
      assert.equal(body.recommendations[0].id, "get-started");
    });

    it("counts study time, problems and success from real activity", async () => {
      const page = { website: "leetcode", title: "Two Sum - LeetCode", url: "https://leetcode.com/problems/two-sum/" };
      const act = extra => api("POST", "/api/sessions/current/activity", {
        token: dt,
        body: {
          ...page, activityType: "keydown", problemSlug: "two-sum", difficulty: "Easy",
          topics: ["Array", "Hash Table"], ...extra
        }
      });

      await api("POST", "/api/sessions", { token: dt, body: page });
      await act();
      advance(30_000); await act();
      advance(20_000); await act({ activityType: "submission", submissionResult: "wrong_answer" });
      advance(10_000); await act({ activityType: "submission", submissionResult: "accepted" });

      const { body } = await api("GET", "/api/dashboard", { token: dt });
      assert.equal(body.today, localDay(clock));
      assert.equal(body.summary.todayMs, MIN);
      assert.equal(body.weekly.days[6].date, body.today);
      assert.equal(body.weekly.days[6].leetcodeMs, MIN);

      assert.equal(body.summary.problemsAttempted, 1);
      assert.equal(body.summary.problemsSolved, 1);
      assert.equal(body.summary.successRate, 100);
      assert.equal(body.summary.attemptAccuracy, 50);
      assert.equal(body.summary.firstTrySolved, 0);
      assert.equal(body.summary.avgSolveMs, MIN);
      assert.deepEqual(body.problems.byDifficulty[0], { difficulty: "Easy", attempted: 1, solved: 1 });
      assert.equal(body.problems.recent[0].slug, "two-sum");
      assert.equal(body.problems.recent[0].attempts, 2);

      const arrays = body.topics.find(t => t.topic === "Arrays");
      assert.equal(arrays.problemsSolved, 1);
      assert.equal(arrays.avgSolveMs, MIN);
      assert.ok(body.topics.some(t => t.topic === "Hash Tables"));
      assert.ok(!body.topics.some(t => t.topic === "Array"), "LeetCode tags are folded into one name");
    });

    it("adds video watching and quiz results to the topics", async () => {
      const video = {
        videoId: "dashVideo01", title: "Hash tables explained", category: "Education",
        durationS: 600, score: 9, topics: ["Hash Tables"]
      };
      const delta = {
        watchedS: 300, playingS: 300, activeS: 300, pausedS: 0, pauseCount: 0, tabChanges: 0,
        windowChanges: 0, skipCount: 0, skippedS: 0, rewindCount: 0, rewoundS: 0
      };
      await api("POST", "/api/youtube/progress", { token: dt, body: { video, delta, positionS: 300, event: "periodic" } });

      const { body: { quiz } } = await api("POST", "/api/youtube/quiz", { token: dt, body: { videoId: video.videoId, positionS: 300 } });
      await api("POST", `/api/youtube/quiz/${quiz.id}/answer`, { token: dt, body: { chosenIndex: 1 } });

      const { body } = await api("GET", "/api/dashboard", { token: dt });
      assert.equal(body.summary.videosWatched, 1);
      assert.equal(body.summary.videoWatchMs, 300_000);
      assert.equal(body.summary.quizAnswered, 1);
      assert.equal(body.summary.quizAccuracy, 0);
      assert.equal(body.videos.recent[0].percentWatched, 50);

      const hash = body.topics.find(t => t.topic === "Hash Tables");
      assert.deepEqual(hash.sources, ["leetcode", "youtube"]);
      assert.equal(hash.videoWatchMs, 300_000);
      assert.equal(hash.quizAnswered, 1);
    });

    it("writes and keeps an AI study plan", async () => {
      assert.equal((await api("GET", "/api/dashboard/coach", { token: dt })).body.report, null);

      const created = await api("POST", "/api/dashboard/coach", { token: dt });
      assert.equal(created.status, 201);
      assert.match(created.body.report.content, /Plan for 1 solved problems/);

      const latest = await api("GET", "/api/dashboard/coach", { token: dt });
      assert.equal(latest.body.report.content, created.body.report.content);
    });

    it("never shows another learner's data", async () => {
      const other = (await signup("dash-other@example.com")).body.token;
      const { body } = await api("GET", "/api/dashboard", { token: other });
      assert.equal(body.summary.problemsSolved, 0);
      assert.equal(body.topics.length, 0);
      assert.equal((await api("GET", "/api/dashboard/coach", { token: other })).body.report, null);
    });
  });
});
