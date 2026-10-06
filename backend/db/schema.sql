-- AI Study Mentor schema (PostgreSQL 13+). Safe to re-run.

CREATE TABLE IF NOT EXISTS users (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name           text,
  -- Stored lower-cased.
  email          text UNIQUE,
  -- scrypt hash; NULL for accounts that only sign in with Google.
  password_hash  text,
  -- Google's stable account id ("sub" claim); NULL if Google is not linked.
  google_sub     text UNIQUE,
  created_at     timestamptz NOT NULL DEFAULT now()
);

-- Upgrades from the earlier anonymous-token version of this table.
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS google_sub text UNIQUE;
ALTER TABLE users DROP COLUMN IF EXISTS token_hash;

-- One row per signed-in device. Only a SHA-256 of the token is stored.
CREATE TABLE IF NOT EXISTS auth_tokens (
  id          bigserial PRIMARY KEY,
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  text NOT NULL UNIQUE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS auth_tokens_user_idx ON auth_tokens (user_id);

CREATE TABLE IF NOT EXISTS problems (
  id          bigserial PRIMARY KEY,
  platform    text NOT NULL,
  slug        text NOT NULL,
  title       text,
  difficulty  text,
  topics      text[] NOT NULL DEFAULT '{}',
  UNIQUE (platform, slug)
);

CREATE TABLE IF NOT EXISTS study_sessions (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  website             text NOT NULL,
  current_page        text NOT NULL,
  current_url         text NOT NULL,
  start_time          timestamptz NOT NULL,
  end_time            timestamptz,
  last_activity_time  timestamptz NOT NULL,
  active_duration_ms  bigint NOT NULL DEFAULT 0,
  status              text NOT NULL CHECK (status IN ('active', 'ended')),
  user_state          text NOT NULL CHECK (user_state IN ('active', 'idle', 'paused'))
);
-- Close duplicate open sessions left by an earlier race, keeping the newest,
-- so the unique index below can be created.
UPDATE study_sessions s
SET status = 'ended', user_state = 'paused', end_time = COALESCE(end_time, now())
WHERE s.status = 'active'
  AND s.id <> (
    SELECT s2.id FROM study_sessions s2
    WHERE s2.user_id = s.user_id AND s2.status = 'active'
    ORDER BY s2.start_time DESC LIMIT 1
  );

-- At most one open session per learner.
CREATE UNIQUE INDEX IF NOT EXISTS study_sessions_one_active_idx
  ON study_sessions (user_id) WHERE status = 'active';

CREATE INDEX IF NOT EXISTS study_sessions_user_start_idx
  ON study_sessions (user_id, start_time DESC);

CREATE TABLE IF NOT EXISTS activities (
  id                   bigserial PRIMARY KEY,
  session_id           uuid NOT NULL REFERENCES study_sessions(id) ON DELETE CASCADE,
  user_id              uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  activity_type        text NOT NULL,
  "timestamp"          timestamptz NOT NULL,
  page_url             text,
  page_title           text,
  website              text,
  problem_slug         text,
  difficulty           text,
  topics               text[],
  programming_language text,
  submission_result    text
);
CREATE INDEX IF NOT EXISTS activities_user_problem_idx
  ON activities (user_id, problem_slug, "timestamp" DESC);
CREATE INDEX IF NOT EXISTS activities_session_idx
  ON activities (session_id, "timestamp" DESC);

CREATE TABLE IF NOT EXISTS problem_attempts (
  id              bigserial PRIMARY KEY,
  user_id         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_id      uuid REFERENCES study_sessions(id) ON DELETE SET NULL,
  problem_id      bigint NOT NULL REFERENCES problems(id),
  language        text,
  attempt_number  integer NOT NULL,
  result          text NOT NULL,
  "timestamp"     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS problem_attempts_user_problem_idx
  ON problem_attempts (user_id, problem_id);
CREATE INDEX IF NOT EXISTS problem_attempts_session_idx
  ON problem_attempts (session_id, problem_id);

CREATE TABLE IF NOT EXISTS mentor_interactions (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_id     uuid REFERENCES study_sessions(id) ON DELETE SET NULL,
  nudge_type     text NOT NULL,
  message        text NOT NULL,
  priority       text NOT NULL DEFAULT 'medium',
  problem_slug   text,
  "timestamp"    timestamptz NOT NULL DEFAULT now(),
  -- 'dismissed' once the learner clicks "Got it"; NULL while it is still showing.
  user_response  text
);
CREATE INDEX IF NOT EXISTS mentor_interactions_user_time_idx
  ON mentor_interactions (user_id, "timestamp" DESC);

-- One row per video per study session; counters are running totals.
CREATE TABLE IF NOT EXISTS video_watches (
  id                bigserial PRIMARY KEY,
  user_id           uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_id        uuid NOT NULL REFERENCES study_sessions(id) ON DELETE CASCADE,
  video_id          text NOT NULL,
  title             text NOT NULL,
  channel           text,
  category          text,
  topics            text[] NOT NULL DEFAULT '{}',
  duration_s        integer NOT NULL DEFAULT 0,
  educational_score integer NOT NULL DEFAULT 0,
  -- Seconds of the video actually watched (skipped parts excluded).
  watch_time_s      double precision NOT NULL DEFAULT 0,
  -- Wall-clock seconds playing / playing with the tab visible and focused / paused.
  playing_s         double precision NOT NULL DEFAULT 0,
  active_s          double precision NOT NULL DEFAULT 0,
  paused_s          double precision NOT NULL DEFAULT 0,
  pause_count       integer NOT NULL DEFAULT 0,
  tab_changes       integer NOT NULL DEFAULT 0,
  window_changes    integer NOT NULL DEFAULT 0,
  skip_count        integer NOT NULL DEFAULT 0,
  skipped_s         double precision NOT NULL DEFAULT 0,
  rewind_count      integer NOT NULL DEFAULT 0,
  rewound_s         double precision NOT NULL DEFAULT 0,
  max_position_s    double precision NOT NULL DEFAULT 0,
  ended             boolean NOT NULL DEFAULT false,
  recall_count      integer NOT NULL DEFAULT 0,
  -- watch_time_s when the learner was last asked to recall.
  recall_marker_s   double precision NOT NULL DEFAULT 0,
  -- playing_s / active_s at that moment, to judge attentiveness per stretch.
  recall_playing_marker_s double precision NOT NULL DEFAULT 0,
  recall_active_marker_s  double precision NOT NULL DEFAULT 0,
  -- Counters when the mentor last commented, so each note reflects only
  -- what happened since then.
  switch_marker     integer NOT NULL DEFAULT 0,
  skipped_marker_s  double precision NOT NULL DEFAULT 0,
  rewind_marker     integer NOT NULL DEFAULT 0,
  first_seen        timestamptz NOT NULL,
  last_seen         timestamptz NOT NULL,
  UNIQUE (session_id, video_id)
);
CREATE INDEX IF NOT EXISTS video_watches_user_seen_idx
  ON video_watches (user_id, last_seen DESC);

-- Upgrades from the first version of video_watches.
ALTER TABLE video_watches ADD COLUMN IF NOT EXISTS recall_playing_marker_s double precision NOT NULL DEFAULT 0;
ALTER TABLE video_watches ADD COLUMN IF NOT EXISTS recall_active_marker_s double precision NOT NULL DEFAULT 0;
ALTER TABLE video_watches ADD COLUMN IF NOT EXISTS switch_marker integer NOT NULL DEFAULT 0;
ALTER TABLE video_watches ADD COLUMN IF NOT EXISTS skipped_marker_s double precision NOT NULL DEFAULT 0;
ALTER TABLE video_watches ADD COLUMN IF NOT EXISTS rewind_marker integer NOT NULL DEFAULT 0;

-- Questions asked while watching a video, and how the learner answered.
CREATE TABLE IF NOT EXISTS video_quizzes (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_id       uuid REFERENCES study_sessions(id) ON DELETE SET NULL,
  video_id         text NOT NULL,
  nudge_id         uuid REFERENCES mentor_interactions(id) ON DELETE SET NULL,
  question         text NOT NULL,
  options          text[] NOT NULL,
  correct_index    integer NOT NULL,
  explanation      text NOT NULL,
  concept          text,
  -- Where in the video the learner was when asked.
  position_s       double precision NOT NULL,
  -- The part of the video to watch again after a wrong answer.
  segment_start_s  double precision NOT NULL,
  segment_end_s    double precision NOT NULL,
  -- true when the question came from the transcript, false when only from the title and topics.
  grounded         boolean NOT NULL,
  created_at       timestamptz NOT NULL,
  answered_at      timestamptz,
  chosen_index     integer,
  correct          boolean
);
CREATE INDEX IF NOT EXISTS video_quizzes_user_video_idx
  ON video_quizzes (user_id, video_id, created_at DESC);


-- ---------------------------------------------------------------------------
-- Learning dashboard (Phase 3)
-- ---------------------------------------------------------------------------

-- Per-learner settings the dashboard needs: which calendar days to use, and
-- a daily study goal for recommendations.
ALTER TABLE users ADD COLUMN IF NOT EXISTS timezone text NOT NULL DEFAULT 'UTC';
ALTER TABLE users ADD COLUMN IF NOT EXISTS daily_goal_minutes integer NOT NULL DEFAULT 60;

-- Active study time per learner, per local calendar day, per platform.
-- Incremented as time is credited to a session, so the weekly view is exact
-- even when a session spans midnight or several sites.
CREATE TABLE IF NOT EXISTS study_time_daily (
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day        date NOT NULL,
  platform   text NOT NULL,
  active_ms  bigint NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, day, platform)
);

-- One row per learner per problem: time spent, attempts, and when it was
-- first solved (and how much active time that took).
CREATE TABLE IF NOT EXISTS problem_progress (
  user_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  problem_id   bigint NOT NULL REFERENCES problems(id) ON DELETE CASCADE,
  first_seen   timestamptz NOT NULL,
  last_seen    timestamptz NOT NULL,
  active_ms    bigint NOT NULL DEFAULT 0,
  attempts     integer NOT NULL DEFAULT 0,
  accepted     integer NOT NULL DEFAULT 0,
  solved_at    timestamptz,
  solve_ms     bigint,
  PRIMARY KEY (user_id, problem_id)
);

-- AI-written study plans, kept so the dashboard can show the latest one.
CREATE TABLE IF NOT EXISTS coach_reports (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL,
  content     text NOT NULL
);
CREATE INDEX IF NOT EXISTS coach_reports_user_idx ON coach_reports (user_id, created_at DESC);

-- Backfill from data recorded before these tables existed (runs once: only
-- when the tables are still empty).
INSERT INTO study_time_daily (user_id, day, platform, active_ms)
SELECT s.user_id, (s.start_time AT TIME ZONE u.timezone)::date, s.website, sum(s.active_duration_ms)
FROM study_sessions s JOIN users u ON u.id = s.user_id
WHERE s.active_duration_ms > 0
  AND NOT EXISTS (SELECT 1 FROM study_time_daily)
GROUP BY 1, 2, 3
ON CONFLICT DO NOTHING;

INSERT INTO problem_progress
  (user_id, problem_id, first_seen, last_seen, attempts, accepted, solved_at)
SELECT a.user_id, a.problem_id, min(a."timestamp"), max(a."timestamp"),
       count(*), count(*) FILTER (WHERE a.result = 'accepted'),
       min(a."timestamp") FILTER (WHERE a.result = 'accepted')
FROM problem_attempts a
WHERE NOT EXISTS (SELECT 1 FROM problem_progress)
GROUP BY a.user_id, a.problem_id
ON CONFLICT DO NOTHING;
