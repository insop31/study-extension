# AI-Powered Study Mentor

**A Context-Aware Chrome Extension for Personalized and Adaptive Learning Assistance**

An intelligent study companion that runs in your browser. It watches how you study on supported learning websites, works out *when*, *why* and *how* to step in, and offers timely nudges, hints, active-recall prompts and personalized recommendations, without getting in your way.

---

## Table of Contents

- [Problem Statement](#problem-statement)
- [Objectives](#objectives)
- [Features](#features)
- [Roadmap](#roadmap)
- [How It Works](#how-it-works)
- [System Architecture](#system-architecture)
- [Tech Stack](#tech-stack)
- [Data Sources](#data-sources)
- [Database Design](#database-design)
- [Nudge Engine Logic](#nudge-engine-logic)
- [Learning Analytics](#learning-analytics)
- [Example Walkthrough](#example-walkthrough)
- [Core Classes](#core-classes)
- [Course Mapping](#course-mapping)
- [Existing Systems and Research Gap](#existing-systems-and-research-gap)
- [Getting Started](#getting-started)
- [Project Structure](#project-structure)
- [Privacy and Security](#privacy-and-security)
- [Contributing](#contributing)
- [License](#license)

---

## Problem Statement

Students increasingly learn on **LeetCode, YouTube, online courses, documentation sites and coding practice platforms**. These platforms deliver content but do not understand the learner's behavior. As a result, students may:

- spend too long on a problem without realizing they are stuck,
- watch videos passively without retaining anything,
- repeat the same failing approach over and over,
- jump straight to the solution instead of building problem-solving skills.

Existing platforms offer static hints, solutions, recommendations and progress stats. None of them acts as a **context-aware mentor** that observes activity and decides when to intervene. This project fills that gap.

## Objectives

**Main objective:** build a context-aware Chrome extension that acts as an intelligent study mentor by monitoring learning activity and giving personalized, timely and non-intrusive guidance.

**Specific objectives**

- Detect when the user is studying on a supported website.
- Track sessions and distinguish between *active*, *idle*, *paused* and *completed* states.
- Understand the learner's context: website, problem/video, topic, difficulty, programming language, coding activity and attempts/submissions.
- Identify signs of difficulty or disengagement.
- Provide interventions: hints, thinking prompts, active-recall questions, concept reminders and break suggestions.
- Avoid excessive interruptions through nudge conditions and cooldowns.
- Maintain a learner profile from historical activity.
- Surface insights about strengths, weaknesses and study habits.
- Use an LLM to generate contextual explanations and hints.
- Offer one mentoring experience across multiple educational websites.

## Features

| Feature | Description |
| --- | --- |
| Session tracking | Start, pause, resume and end study sessions; compute active time |
| Context detection | Reads problem title, difficulty, topics, language, editor state and submission status |
| Behavior analysis | Flags stuck or disengaged learners from time, activity and attempt patterns |
| Smart nudges | Rule-based engine with cooldowns so the mentor never becomes annoying |
| Progressive hints | Guides the learner toward the answer instead of revealing it |
| Active recall | Prompts such as "Can you explain this concept without replaying the video?" |
| Learner profile | Tracks topic strengths and weaknesses over time |
| Dashboard | Weekly study time, topics studied, success rate, weak topics and recommendations |

## Roadmap

### Phase 1: LeetCode
Detect problem, difficulty, topics, language, time spent, activity, code editing and submissions, then provide contextual hints.

### Phase 2: YouTube
Identify educational videos and track title, watch duration, pauses, skipping, active watching and topic. Provide active-recall prompts.

### Phase 3: Learning Dashboard
Weekly Study Time → Topics Studied → Problems Solved → Success Rate → Weak Topics → Learning Recommendations

### Future work
- Machine-learning model to predict whether a learner is struggling.
- Additional supported study websites.
- Prerequisite-graph-based topic recommendations.

## How It Works

```
                USER
                  │
                  ▼
        Educational Website
                  │
                  ▼
          Chrome Extension
                  │
         ┌────────┴────────┐
         ▼                 ▼
  Context Analyzer   Activity Tracker
         │                 │
         └────────┬────────┘
                  ▼
           Learning Context
                  │
                  ▼
           Session Manager
                  │
                  ▼
           Behavior Analysis
                  │
                  ▼
             Nudge Engine
                  │
            ┌─────┴─────┐
         No Nudge      Nudge
            │             │
            │             ▼
            │         AI Mentor
            │             │
            │             ▼
            │        Hint / Advice
            └─────┬───────┘
                  ▼
             User Action
                  │
                  ▼
          Learning History
                  │
                  ▼
        Personalized Insights
```

## System Architecture

### Frontend: Chrome Extension (Manifest V3)

A side panel with these views:

- Current Activity
- Study Session
- Mentor
- Insights
- Settings

### Extension layer

| Component | Responsibility |
| --- | --- |
| **Content scripts** | Extract page context and activity signals from LeetCode, YouTube and other study sites |
| **Service worker** | Central coordinator: extension events, tab changes, sessions, activity signals, messaging between components, triggering the nudge engine |
| **Session manager** | Start / pause / resume / end sessions, calculate active time, track activity |
| **Context analyzer** | Interprets the current website and produces structured context |
| **Nudge engine** | Decides whether the mentor should intervene, based on time, activity, attempts, difficulty, previous nudges and history |
| **AI mentor** | Generates hints, explanations, questions, recommendations, recall prompts and feedback via an LLM API (no custom model training required) |

Example context object:

```json
{
  "website": "leetcode",
  "problem": "Two Sum",
  "difficulty": "Easy",
  "topics": ["Array", "Hash Table"],
  "language": "C++"
}
```

### Backend

A backend with a relational database (PostgreSQL) stores user data and history, and brokers requests to the AI API over HTTP/REST (WebSockets optional).

## Tech Stack

- **Extension:** React, TypeScript, HTML/CSS, Chrome Extension Manifest V3
- **Backend:** REST API (HTTP), optional WebSockets
- **Database:** PostgreSQL
- **AI:** LLM API for hints, explanations and recommendations

## Data Sources

No traditional ML dataset is needed for the first version. The system uses:

**A. Real-time browser data** (Chrome Extension APIs): current URL, page title, tab activity, visibility, keyboard activity, mouse activity, scroll activity, session duration.

**B. Website context** (LeetCode): problem title, problem slug, difficulty, topics, programming language, code editor state, submission status.

**C. User-generated historical data:** user ID, problem, topic, difficulty, time spent, attempts, success/failure, hints requested, nudges received, outcome.

## Database Design

```
USER
 │
 ├── STUDY_SESSION
 │        │
 │        └── ACTIVITY
 │
 ├── PROBLEM_ATTEMPT
 ├── TOPIC
 ├── LEARNING_PROFILE
 └── MENTOR_INTERACTION
```

| Table | Columns |
| --- | --- |
| `users` | id, name, email, created_at |
| `study_sessions` | id, user_id, website, start_time, end_time, active_duration, status |
| `activities` | id, session_id, activity_type, timestamp, page_url |
| `problem_attempts` | id, user_id, problem_id, language, attempt_number, result, timestamp |
| `mentor_interactions` | id, user_id, session_id, nudge_type, message, timestamp, user_response |

## Nudge Engine Logic

The nudge decision is a Boolean rule:

```
A = user is active
B = session duration exceeds threshold
C = multiple failed attempts
D = cooldown expired

Nudge = A ∧ B ∧ C ∧ D
```

Example rule:

```
IF   Active
AND  Time > 20 min
AND  Attempts >= 3
AND  Cooldown expired
THEN Give hint
```

Cooldowns prevent repeated interruptions, and hints are progressive rather than answer-revealing.

## Learning Analytics

The system applies basic statistics to learner behavior:

- **Average solving time:** `x̄ = Σxᵢ / n`
- **Success rate:** `Accepted Problems / Total Problems × 100`
- **Topic performance:** average time and success rate per topic

| Topic | Avg. time | Success rate |
| --- | --- | --- |
| Arrays | 14 min | 88% |
| Graphs | 31 min | 48% |
| DP | 42 min | 35% |

Low-performing topics (e.g. Dynamic Programming) are flagged as weak areas. Future analysis can add mean, median, standard deviation, percentiles, moving averages and correlation.

**Data structures used**

- **Hash map:** topic → attempt count (`{"Arrays": 15, "Graphs": 4, "DP": 2, "Trees": 7}`)
- **Queue:** ordered processing of activity events (`keydown`, `scroll`, `submission`, `click`, `page_change`)
- **Stack:** recent mentor interactions and navigation/context history
- **Graph:** topic prerequisite relationships (e.g. Arrays → Hash Tables / Two Pointers → Sliding Window) to recommend what to study next

**Resource management:** the extension avoids excessive CPU use, DOM queries and API calls, checking for relevant changes periodically instead of polling every few milliseconds.

## Example Walkthrough

A student solves **Two Sum** on LeetCode:

1. **Start:** the extension detects LeetCode / Two Sum / Easy / C++ and begins a session.
2. **Reading:** the student reads the problem. Progress looks normal, so no intervention.
3. **Coding:** editor activity is detected; the mentor keeps observing.
4. **Stuck:** 20 minutes active, frequent code changes, 2 submissions, Wrong Answer. The nudge engine fires a progressive hint:
   > 💡 *Think about what information you would need to retrieve instantly while scanning the array.*
5. **Success:** the student changes approach and is Accepted on attempt 3. The system records topic, outcome and attempts.
6. **Long-term:** after many problems, the profile shows Arrays and Hash Tables as strong, Trees as moderate, Graphs and DP as weak, and the mentor recommends a few beginner graph problems.

## Core Classes

```
StudySession        start() · pause() · resume() · end()
ActivityTracker     recordActivity() · calculateActiveTime()
ContextAnalyzer     analyzePage()
NudgeEngine         evaluate()
Mentor              generateHint() · generateExplanation()
```

These demonstrate encapsulation, abstraction, polymorphism and modularity.

## Course Mapping

| Course | Application in the project |
| --- | --- |
| **OOP** | Classes for sessions, activities, contexts, nudges and mentor behavior |
| **DBMS** | Storage of profiles, sessions, activity, attempts, nudges and statistics |
| **Operating Systems** | Background service workers, idle detection, timers, resource management |
| **DSA** | Queues, stacks, hash maps, topic graph, pattern-analysis algorithms |
| **Applied Statistics** | Study duration, success rate, topic performance, learning trends |
| **Discrete Mathematics** | Boolean rule-based nudge logic; topic relationship graphs |
| **Computer Networks** | HTTP/REST (and optional WebSockets) between extension, backend and AI API |
| **Software Engineering** | Modular architecture, requirements, testing, version control |
| **Web Development** | Chrome Extension APIs, React, TypeScript, HTML/CSS |
| **Artificial Intelligence** | LLM-based mentor, contextual hints, intelligent intervention |
| **Machine Learning** | Optional future struggle-prediction model |
| **Information Security** | Protection of activity data, API keys, authentication and privacy |

## Existing Systems and Research Gap

- **LeetCode** provides problems, hints, editorials and stats, but the learner must decide when to seek help.
- **YouTube** provides videos and recommendations, but doesn't check whether the learner understands.
- **General AI assistants** answer explicit requests, but don't continuously understand study context.

**Gap:** existing tools provide content or assistance but don't combine real-time activity, contextual understanding, behavioral analysis and adaptive intervention in a single mentor.

```
Website Context + User Activity + Study History + Behavior Analysis + AI
                              ↓
                   Personalized Mentoring
```

## Getting Started

> ⚠️ The project is in early development. The LeetCode flow works end to end; YouTube-specific tracking, the dashboard and the backend are still planned.

```bash
# Clone the repository
git clone <your-repo-url>
cd extension

# Install dependencies
npm install

# Build the extension
npm run build
```

**Load in Chrome**

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked** and select the `dist/` folder.
4. Open a LeetCode problem and open the side panel.

**Backend (PostgreSQL + REST):**

```bash
cd ../backend
npm install
docker compose up -d     # PostgreSQL 16 on localhost:5433 (or point DATABASE_URL at your own server)
cp .env.example .env     # set OPENROUTER_API_KEY (and optionally OPENROUTER_MODEL)
npm run migrate          # creates the tables from db/schema.sql
npm start                # http://127.0.0.1:8787
```

Sessions, activities, problem attempts, nudges and stats all live in PostgreSQL and are read and written through the REST API; the extension keeps only your sign-in token in `chrome.storage.local`. The OpenRouter key stays on the server. To use a different backend URL, set `VITE_BACKEND_URL` before `npm run build` and add that origin to `host_permissions` in `src/manifest.config.ts`.

`npm test` runs the API tests against a throwaway embedded PostgreSQL (or `TEST_DATABASE_URL` if set).

### YouTube tracking (Phase 2)

On `youtube.com/watch` pages the extension first decides whether the video is **educational**, from YouTube's own category plus teaching wording and subject keywords in the title and description (`src/core/youtubeClassifier.ts`). Music, gaming, vlogs, trailers and the like are identified and then ignored: they are not tracked and don't count as study time. Ads are ignored too.

For an educational video it records the title, channel, topics (e.g. "Dynamic Programming") and, from the player itself:

| Signal | How it is measured |
| --- | --- |
| Watch duration | Seconds of video actually played, skipped parts excluded; percent of the video reached |
| Pauses | Pause events (not seeks, not the end of the video) |
| Skipping | Forward jumps of 5 s or more, and how many seconds were skipped; backward jumps are counted as rewinds |
| Tab change | The learner switched to another Chrome tab (counted by the background script from `chrome.tabs.onActivated`) |
| Window change | The learner left Chrome for another application or window. Detected two ways, so it does not depend on one browser event: Chrome's `windows.onFocusChanged`, and the page reporting that it lost focus (unless the side panel took the focus). Counted once per departure |
| Active watching | Share of playing time with the tab visible and the window focused |

Totals are stored per video per study session in `video_watches` and shown in the side panel.

**Idle state.** The session goes idle when the learner leaves Chrome for another application (not only when the computer is unused), and a playing video only counts as studying while Chrome has focus.

**Mentor notes while watching** (shown in the side panel and as a card on the video page; at least 90 seconds apart; rules in `backend/src/services/videoMentor.mjs`):

| Note | When | Message |
| --- | --- | --- |
| Recall | pause after ~1.5 min watched, ~4 min watched in a row, or the video ends | "Pause for a moment. Can you explain the concept you just learned without replaying the video?" |
| Focus | 3 tab/window changes since the last note | suggests keeping the video in focus or pausing it |
| Skipping | about 2 minutes skipped since the last note | suggests noting what was missed (names the topic) |
| Confusion check | 3 rewinds since the last note | asks which part is tricky |

Recall prompts are skipped when the last stretch was mostly watched with the tab hidden or unfocused.

**Quiz questions.** Each recall prompt comes with a multiple-choice question about the few minutes you just watched, so the mentor can check that you are actually learning:

1. The extension reads the video's transcript from YouTube's own "Show transcript" panel (hidden while it does, closed afterwards) and sends the last ~4 minutes to the backend. YouTube no longer lets scripts fetch captions directly, so this is the only reliable source. If a video has no transcript, the question is written from its title and topics instead and says so.
2. The backend asks the AI model (the same OpenRouter key as the mentor) for one question with four options. The correct answer and explanation stay on the server until you answer, and options are shuffled.
3. The video pauses while you answer. You are told straight away whether you were right. If you were wrong, the mentor shows the right answer, explains it, and offers **Watch this part again**, which jumps the video to the relevant moment (those jumps are not counted as skipping or rewinding). Your score for the video appears in the side panel and in `/api/stats/summary`.

If a question can't be written (rate limit, no API key, offline), you still get the plain recall prompt.

### Learning dashboard (Phase 3)

Click **📊 Open learning dashboard** in the side panel. It opens as a full page in its own tab (an extension page, so it uses your existing sign-in) and refreshes every minute. It shows:

- **Weekly study time:** the last 7 days split by LeetCode / YouTube, against your daily goal (editable on the page), with a table view; an 8-week trend and a 12-week activity heatmap; streak, sessions and average session length.
- **Problems solved and success rate:** solved / attempted problems (the README's definition), accepted-submission rate, first-try solves, average time to solve, and a breakdown by difficulty.
- **Topics studied:** every topic from LeetCode tags and video topics (merged, so "Array" and "Arrays" are one topic) with problems solved, success rate, average solve time, video quiz score, study time and a 0-100 **mastery** score. Topics are rated Strong / Moderate / **Weak** once there are at least 3 submissions or quiz answers.
- **Recommendations:** rule-based and ordered by importance: strengthen weak topics (with a link to easy problems), practise topics you only watched videos about, finish unsolved problems, study more consistently, react to a drop in study time, move up to Medium, and what to learn next from the topic graph.
- **AI study plan:** on request, the AI model writes a short personal plan for the week from the same data. The latest plan is kept.

Days follow your own time zone, which the dashboard sets from your browser.

**Data behind it** (added to `db/schema.sql`; `npm run migrate` adds the tables and backfills from existing history):

| Table | Holds |
| --- | --- |
| `study_time_daily` | Active study time per learner, per local day, per platform |
| `problem_progress` | Per learner and problem: time spent, attempts, accepted, when first solved and how long that took |
| `coach_reports` | AI study plans |
| `users.timezone`, `users.daily_goal_minutes` | Calendar days and the daily goal |

### Sign-in and Google setup

The side panel asks you to sign in with email + password, or with Google. Passwords are stored as scrypt hashes; tokens are random, stored hashed, per device, and expire after 30 days. A Google account whose verified email matches an existing password account is linked to it.

To enable **Continue with Google**:

1. In [Google Cloud Console](https://console.cloud.google.com/apis/credentials) create an **OAuth client ID** of type **Web application**.
2. Add this **Authorized redirect URI**: `https://<EXTENSION_ID>.chromiumapp.org/` (the extension ID is shown at `chrome://extensions`; it changes if you load the unpacked folder from a different path).
3. Put the client ID in `backend/.env` as `GOOGLE_CLIENT_ID` and in `extension/.env` as `VITE_GOOGLE_CLIENT_ID` (it is public, not a secret), then restart the backend and rebuild the extension.

Without these, email + password sign-in still works and the Google button is hidden.

### REST API

All routes except `signup`, `login`, `google` and `health` need `Authorization: Bearer <token>`.

| Method | Route | Purpose |
| --- | --- | --- |
| POST | `/api/auth/signup` | Create an account with email + password, returns a token |
| POST | `/api/auth/login` | Sign in with email + password |
| POST | `/api/auth/google` | Sign in with a Google ID token (verified server-side) |
| GET | `/api/auth/me` | The signed-in user |
| POST | `/api/auth/logout` | Revoke this device's token |
| GET | `/api/sessions/current` | Latest session (active or ended) |
| GET | `/api/sessions` | Session history |
| POST | `/api/sessions` | Start a session (ends any open one) |
| PATCH | `/api/sessions/current/page` | Update the page being studied |
| PUT | `/api/sessions/current/state` | Set `active` / `idle` / `paused` |
| POST | `/api/sessions/current/activity` | Record an activity; returns the session and nudge state |
| POST | `/api/sessions/current/end` | End the session |
| GET | `/api/activities` | Recent activities (`problemSlug`, `limit`) |
| GET / POST | `/api/nudges/current`, `/api/nudges` | Current nudge / store a nudge |
| POST | `/api/nudges/:id/dismiss` | Dismiss a nudge |
| POST | `/api/mentor` | Ask the AI mentor (context is read from the database) |
| POST | `/api/youtube/quiz` | Ask for a question about the part just watched (answer withheld) |
| POST | `/api/youtube/quiz/:id/answer` | Submit an answer; returns right/wrong, the explanation and the part to rewatch |
| POST | `/api/youtube/progress` | Add a report of watching activity for a video; may return a recall prompt |
| GET | `/api/youtube/watches/current` | Running totals for a video (`videoId`) in the current session |
| GET | `/api/youtube/watches` | Recent video watch history |
| GET | `/api/dashboard` | Everything the learning dashboard shows, including recommendations |
| GET / POST | `/api/dashboard/coach` | Latest AI study plan / write a new one |
| GET / PUT | `/api/me/preferences` | Time zone and daily study goal |
| GET | `/api/stats/summary` | Weekly study time, solved count, per-topic success rate |
| GET | `/api/health` | Liveness and database check |

---

## Project Structure

A suggested layout:

```
ai-study-mentor/
├── extension/
│   ├── manifest.json
│   ├── src/
│   │   ├── content/        # content scripts (LeetCode, YouTube)
│   │   ├── background/     # service worker
│   │   ├── sidepanel/      # React UI
│   │   └── core/           # StudySession, ActivityTracker, ContextAnalyzer, NudgeEngine, Mentor
├── backend/
│   ├── src/                # Express app, routes, session and mentor services
│   └── db/                 # schema.sql and migrate.mjs
├── docs/
└── README.md
```

## Privacy and Security

- Learning activity data is sensitive: collect only what is needed and be transparent about it.
- API keys must never be exposed in the extension; route AI calls through the backend.
- Use authentication for user data and protect stored learning history.
- Give users control to pause tracking and delete their data.

## Contributing

Contributions, ideas and feedback are welcome. Please open an issue to discuss major changes before submitting a pull request.

## License

Add your license here (e.g. MIT).
