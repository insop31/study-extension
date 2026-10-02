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

> ⚠️ The project is in the planning/early development stage. Update the steps below as the implementation takes shape.

```bash
# Clone the repository
git clone <your-repo-url>
cd ai-study-mentor

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

**Configuration:** create a `.env` file with your AI API key and backend URL. Never commit it.

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
│   ├── api/
│   └── db/                 # schema and migrations
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
