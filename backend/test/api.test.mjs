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
    verifyGoogleToken: async ({ idToken, nonce }) => {
      if (idToken.startsWith("bad")) throw new Error("bad token");
      const [, sub, email, verified] = idToken.split("|");
      return { sub, email, emailVerified: verified === "true", name: "Gina Google", nonce };
    },
    askMentor: async ctx => ({ success: true, guidance: `hint for ${ctx.slug}` })
  });
  await new Promise(resolve => { server = app.listen(0, "127.0.0.1", resolve); });
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  server?.close();
  await pool?.end();
  await embedded?.stop();
  if (dataDir) await rm(dataDir, { recursive: true, force: true });
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
});
