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
