import {
  useCallback,
  useEffect,
  useState
} from "react";

import {
  api,
  NotSignedInError
} from "../api/client";

import {
  DifficultyBars,
  Heatmap,
  MasteryBar,
  StatusBadge,
  TrendChart,
  WeeklyChart
} from "./charts";

import {
  formatDuration,
  formatPercent,
  timeAgo
} from "./format";

import type {
  CoachReport,
  DashboardData,
  DashboardTopic
} from "./types";


const REFRESH_MS =
  60_000;

type TopicFilter =
  | "all"
  | "weak"
  | "strong";


function browserTimeZone(): string {

  return Intl.DateTimeFormat().resolvedOptions().timeZone;

}


// --------------------------------------------------
// STAT TILE
// --------------------------------------------------

function StatTile({
  label,
  value,
  detail,
  delta
}: {
  label: string;
  value: string;
  detail?: string;
  delta?: number | null;
}) {

  return (
    <div className="tile">

      <span className="tile-label">{label}</span>

      <span className="tile-value">{value}</span>

      {delta !== undefined && delta !== null && (
        <span className={`tile-delta ${delta >= 0 ? "up" : "down"}`}>
          <span aria-hidden="true">{delta >= 0 ? "▲" : "▼"}</span>
          {" "}
          {Math.abs(delta)}% vs last week
        </span>
      )}

      {detail && (
        <span className="tile-detail">{detail}</span>
      )}

    </div>
  );

}


// --------------------------------------------------
// TOPICS TABLE
// --------------------------------------------------

function TopicsTable({
  topics
}: {
  topics: DashboardTopic[];
}) {

  const [filter, setFilter] =
    useState<TopicFilter>("all");

  const shown =
    topics.filter(t =>
      filter === "all" ||
      t.status === filter
    );

  return (
    <>

      <div className="segmented" role="tablist" aria-label="Filter topics">

        {(["all", "weak", "strong"] as const).map(option => (
          <button
            key={option}
            role="tab"
            aria-selected={filter === option}
            className={filter === option ? "active" : ""}
            onClick={() => setFilter(option)}
          >
            {option === "all"
              ? `All (${topics.length})`
              : option === "weak"
                ? `Weak (${topics.filter(t => t.status === "weak").length})`
                : `Strong (${topics.filter(t => t.status === "strong").length})`}
          </button>
        ))}

      </div>


      {shown.length === 0 ? (

        <p className="empty">
          {filter === "all"
            ? "No topics yet. They appear as you solve problems and watch educational videos."
            : `No ${filter} topics right now.`}
        </p>

      ) : (

        <div className="table-scroll">

          <table className="data-table">

            <thead>
              <tr>
                <th>Topic</th>
                <th>Status</th>
                <th>Mastery</th>
                <th className="num">Problems solved</th>
                <th className="num">Success rate</th>
                <th className="num">Avg. solve time</th>
                <th className="num">Quiz</th>
                <th className="num">Study time</th>
              </tr>
            </thead>

            <tbody>
              {shown.map(t => (
                <tr key={t.topic}>
                  <td>
                    <span className="topic-name">{t.topic}</span>
                    <span className="topic-sources">
                      {t.sources.map(source => source === "leetcode" ? "LeetCode" : "YouTube").join(" · ")}
                    </span>
                  </td>
                  <td><StatusBadge status={t.status} /></td>
                  <td><MasteryBar value={t.mastery} /></td>
                  <td className="num">
                    {t.problemsAttempted > 0 ? `${t.problemsSolved} / ${t.problemsAttempted}` : "–"}
                  </td>
                  <td className="num">{formatPercent(t.successRate)}</td>
                  <td className="num">{t.avgSolveMs ? formatDuration(t.avgSolveMs) : "–"}</td>
                  <td className="num">
                    {t.quizAnswered > 0 ? `${t.quizCorrect} / ${t.quizAnswered}` : "–"}
                  </td>
                  <td className="num">{formatDuration(t.studyMs)}</td>
                </tr>
              ))}
            </tbody>

          </table>

        </div>

      )}

    </>
  );

}


// --------------------------------------------------
// AI STUDY PLAN
// --------------------------------------------------

function CoachCard() {

  const [report, setReport] =
    useState<CoachReport | null>(null);

  const [busy, setBusy] =
    useState(false);

  const [error, setError] =
    useState<string | null>(null);


  useEffect(() => {

    api<{ report: CoachReport | null }>("GET", "/dashboard/coach")
      .then(result => setReport(result.report))
      .catch(() => {

        // The rest of the dashboard still works without it.

      });

  }, []);


  async function write(): Promise<void> {

    setBusy(true);
    setError(null);

    try {

      const result =
        await api<{ report: CoachReport }>("POST", "/dashboard/coach");

      setReport(result.report);

    } catch (caught) {

      setError(
        caught instanceof Error
          ? caught.message
          : "The study plan could not be written right now."
      );

    } finally {

      setBusy(false);

    }

  }


  return (
    <section className="card coach-card">

      <div className="card-header">

        <div>
          <h2>Your AI study plan</h2>
          <p className="card-subtitle">
            A personal plan for the coming week, written from everything above.
          </p>
        </div>

        <button
          className="primary-button"
          onClick={write}
          disabled={busy}
        >
          {busy
            ? "Writing..."
            : report ? "Write a new plan" : "Write my study plan"}
        </button>

      </div>

      {busy && (
        <p className="muted">This can take 20-30 seconds.</p>
      )}

      {error && (
        <p className="error-text" role="alert">{error}</p>
      )}

      {report ? (
        <>
          <div className="coach-text">{report.content}</div>
          <p className="muted small">Written {timeAgo(report.createdAt)}</p>
        </>
      ) : !busy && (
        <p className="empty">No plan yet.</p>
      )}

    </section>
  );

}


// --------------------------------------------------
// PAGE
// --------------------------------------------------

export default function DashboardPage() {

  const [data, setData] =
    useState<DashboardData | null>(null);

  const [error, setError] =
    useState<string | null>(null);

  const [signedOut, setSignedOut] =
    useState(false);

  const [goalDraft, setGoalDraft] =
    useState("");

  const [loading, setLoading] =
    useState(false);


  const load = useCallback(async () => {

    setLoading(true);

    try {

      let next =
        await api<DashboardData>("GET", "/dashboard");

      // Calendar days follow the learner's own time zone.
      const zone =
        browserTimeZone();

      if (next.timezone !== zone) {

        await api("PUT", "/me/preferences", { timezone: zone })
          .catch(() => undefined);

        next =
          await api<DashboardData>("GET", "/dashboard");

      }

      setData(next);
      setGoalDraft(String(next.dailyGoalMinutes));
      setError(null);
      setSignedOut(false);

    } catch (caught) {

      if (caught instanceof NotSignedInError) {

        setSignedOut(true);

      } else {

        setError(
          caught instanceof Error
            ? `${caught.message} Is the backend running?`
            : "Could not load the dashboard."
        );

      }

    } finally {

      setLoading(false);

    }

  }, []);


  useEffect(() => {

    // First load right after mount, then every minute.
    const first =
      window.setTimeout(() => void load(), 0);

    const timer =
      window.setInterval(() => void load(), REFRESH_MS);

    return () => {

      window.clearTimeout(first);

      window.clearInterval(timer);

    };

  }, [load]);


  async function saveGoal(): Promise<void> {

    const minutes =
      Number(goalDraft);

    if (!Number.isInteger(minutes) || minutes < 5 || minutes > 720) {

      setError("Set a daily goal between 5 and 720 minutes.");

      return;

    }

    await api("PUT", "/me/preferences", { dailyGoalMinutes: minutes });

    await load();

  }


  if (signedOut) {

    return (
      <main className="page narrow">
        <h1>Learning Dashboard</h1>
        <section className="card">
          <p>
            Sign in from the Study Mentor side panel to see your dashboard, then reload this page.
          </p>
          <button className="primary-button" onClick={() => void load()}>
            I've signed in, reload
          </button>
        </section>
      </main>
    );

  }


  if (!data) {

    return (
      <main className="page narrow">
        <h1>Learning Dashboard</h1>
        {error
          ? <p className="error-text" role="alert">{error}</p>
          : <p className="muted">Loading your learning data...</p>}
      </main>
    );

  }


  const s =
    data.summary;

  const goalMs =
    data.dailyGoalMinutes * 60000;

  return (
    <main className="page">

      {/* ------------------------------------------ */}
      {/* HEADER */}
      {/* ------------------------------------------ */}

      <header className="page-header">

        <div>
          <h1>Learning Dashboard</h1>
          <p className="muted">
            Your study across LeetCode and YouTube · updated {timeAgo(data.generatedAt)}
          </p>
        </div>

        <div className="header-actions">

          <label className="goal-input">
            Daily goal
            <input
              type="number"
              min={5}
              max={720}
              value={goalDraft}
              onChange={event => setGoalDraft(event.target.value)}
              onKeyDown={event => {
                if (event.key === "Enter") void saveGoal();
              }}
            />
            min
          </label>

          {goalDraft !== String(data.dailyGoalMinutes) && (
            <button className="text-button" onClick={() => void saveGoal()}>
              Save
            </button>
          )}

          <button
            className="secondary-button"
            onClick={() => void load()}
            disabled={loading}
          >
            {loading ? "Refreshing..." : "Refresh"}
          </button>

        </div>

      </header>


      {error && (
        <p className="error-text" role="alert">{error}</p>
      )}


      {/* ------------------------------------------ */}
      {/* HEADLINE NUMBERS */}
      {/* ------------------------------------------ */}

      <section className="tiles" aria-label="Summary">

        <StatTile
          label="Study time this week"
          value={formatDuration(s.thisWeekMs)}
          delta={s.lastWeekMs > 0 ? s.weekChangePct : undefined}
          detail={`${s.activeDaysThisWeek} of 7 days · today ${formatDuration(s.todayMs)} of ${formatDuration(goalMs)}`}
        />

        <StatTile
          label="Study streak"
          value={`${s.streakDays} ${s.streakDays === 1 ? "day" : "days"}`}
          detail={`${s.sessionsThisWeek} sessions this week · avg. ${formatDuration(s.avgSessionMs)}`}
        />

        <StatTile
          label="Problems solved"
          value={String(s.problemsSolved)}
          detail={`${s.problemsSolvedThisWeek} this week · ${s.problemsAttempted} attempted`}
        />

        <StatTile
          label="Success rate"
          value={formatPercent(s.successRate)}
          detail={
            s.attemptAccuracy === null
              ? "Solved / attempted problems"
              : `${s.attemptAccuracy}% of submissions accepted · ${s.firstTrySolved} first try`
          }
        />

        <StatTile
          label="Video quiz accuracy"
          value={formatPercent(s.quizAccuracy)}
          detail={`${s.quizCorrect} of ${s.quizAnswered} questions right`}
        />

        <StatTile
          label="Videos watched"
          value={String(s.videosWatched)}
          detail={`${formatDuration(s.videoWatchMs)} of learning videos`}
        />

      </section>


      {/* ------------------------------------------ */}
      {/* WEEK + RECOMMENDATIONS */}
      {/* ------------------------------------------ */}

      <div className="grid two">

        <section className="card">

          <div className="card-header">
            <div>
              <h2>Weekly study time</h2>
              <p className="card-subtitle">
                Last 7 days, by platform · {formatDuration(s.thisWeekMs)} total
              </p>
            </div>
          </div>

          <WeeklyChart
            days={data.weekly.days}
            goalMinutes={data.dailyGoalMinutes}
          />

        </section>


        <section className="card">

          <div className="card-header">
            <div>
              <h2>Recommendations</h2>
              <p className="card-subtitle">What to focus on next, most important first.</p>
            </div>
          </div>

          <ol className="recommendations">
            {data.recommendations.map(r => (
              <li key={r.id} className={`rec priority-${r.priority}`}>
                <span className="rec-priority">
                  {r.priority === 1 ? "Do first" : r.priority === 2 ? "Next" : "Tip"}
                </span>
                <strong>{r.title}</strong>
                <p>{r.detail}</p>
                {r.action && (
                  <a href={r.action.url} target="_blank" rel="noreferrer">
                    {r.action.label} ↗
                  </a>
                )}
              </li>
            ))}
          </ol>

        </section>

      </div>


      {/* ------------------------------------------ */}
      {/* TOPICS */}
      {/* ------------------------------------------ */}

      <section className="card">

        <div className="card-header">
          <div>
            <h2>Topics studied</h2>
            <p className="card-subtitle">
              Mastery combines problems solved, accepted submissions and video quiz answers.
              A topic needs a few attempts or answers before it is rated.
            </p>
          </div>
        </div>

        {data.weakTopics.length > 0 && (
          <div className="weak-callout" role="note">
            <StatusBadge status="weak" />
            <span>
              Weak topics: <strong>{data.weakTopics.map(t => t.topic).join(", ")}</strong>
            </span>
          </div>
        )}

        <TopicsTable topics={data.topics} />

      </section>


      {/* ------------------------------------------ */}
      {/* TRENDS */}
      {/* ------------------------------------------ */}

      <div className="grid three">

        <section className="card">
          <h2>Daily activity</h2>
          <p className="card-subtitle">Last 12 weeks</p>
          <Heatmap days={data.heatmap} />
        </section>

        <section className="card">
          <h2>Study time trend</h2>
          <p className="card-subtitle">Last 8 weeks</p>
          <TrendChart weeks={data.weekly.weeks} />
        </section>

        <section className="card">
          <h2>Problems by difficulty</h2>
          <p className="card-subtitle">
            {s.avgSolveMs ? `Average time to solve: ${formatDuration(s.avgSolveMs)}` : "Solved out of attempted"}
          </p>
          <DifficultyBars rows={data.problems.byDifficulty} />
        </section>

      </div>


      {/* ------------------------------------------ */}
      {/* RECENT WORK */}
      {/* ------------------------------------------ */}

      <div className="grid two">

        <section className="card">

          <h2>Recent problems</h2>

          {data.problems.recent.length === 0 ? (
            <p className="empty">No LeetCode problems yet.</p>
          ) : (
            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Problem</th>
                    <th>Difficulty</th>
                    <th className="num">Attempts</th>
                    <th className="num">Time</th>
                    <th>Result</th>
                  </tr>
                </thead>
                <tbody>
                  {data.problems.recent.map(p => (
                    <tr key={p.slug}>
                      <td>
                        <a href={`https://leetcode.com/problems/${p.slug}/`} target="_blank" rel="noreferrer">
                          {p.title.replace(/ - LeetCode$/, "")}
                        </a>
                        <span className="topic-sources">{timeAgo(p.lastSeen)}</span>
                      </td>
                      <td>{p.difficulty ?? "–"}</td>
                      <td className="num">{p.attempts}</td>
                      <td className="num">{formatDuration(p.timeMs)}</td>
                      <td>
                        <StatusBadge status={p.solved ? "strong" : p.attempts > 0 ? "weak" : "new"} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

        </section>


        <section className="card">

          <h2>Recent videos</h2>

          {data.videos.recent.length === 0 ? (
            <p className="empty">No educational videos yet.</p>
          ) : (
            <ul className="video-list">
              {data.videos.recent.map(v => (
                <li key={v.videoId}>
                  <a href={`https://www.youtube.com/watch?v=${v.videoId}`} target="_blank" rel="noreferrer">
                    {v.title}
                  </a>
                  <span className="topic-sources">
                    {[v.channel, v.topics.join(", "), timeAgo(v.lastSeen)].filter(Boolean).join(" · ")}
                  </span>
                  <span className="video-progress">
                    <span
                      className="meter small"
                      role="meter"
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={v.percentWatched}
                      aria-label={`${v.percentWatched}% of the video reached`}
                    >
                      <span className="meter-fill" style={{ width: `${v.percentWatched}%` }} />
                    </span>
                    {v.percentWatched}% · {formatDuration(v.watchMs)} watched
                  </span>
                </li>
              ))}
            </ul>
          )}

        </section>

      </div>


      <CoachCard />


      <footer className="page-footer muted small">
        Times are in {data.timezone}. Study time counts only while you are active on a study page.
      </footer>

    </main>
  );

}
