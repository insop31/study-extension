// Small hand-built SVG charts for the dashboard. Colours come from CSS
// variables (see dashboard.css) so light and dark mode each use their own
// validated steps. Every chart has a hover tooltip and a text alternative.

import {
  useRef,
  useState,
  type ReactNode
} from "react";

import {
  dayMonth,
  formatDuration,
  longDay,
  weekdayShort
} from "./format";

import type {
  DashboardData,
  TopicStatus
} from "./types";


// --------------------------------------------------
// TOOLTIP
// --------------------------------------------------

interface TipState {

  x: number;

  y: number;

  content: ReactNode;

}


function useTooltip() {

  const frame =
    useRef<HTMLDivElement>(null);

  const [tip, setTip] =
    useState<TipState | null>(null);

  function show(
    event: React.MouseEvent | React.FocusEvent,
    content: ReactNode
  ): void {

    const box =
      frame.current?.getBoundingClientRect();

    if (!box) {

      return;

    }

    const target =
      (event.currentTarget as Element).getBoundingClientRect();

    // Keep the tooltip inside the chart so it never spills off-screen.
    const centre =
      target.left + target.width / 2 - box.left;

    const margin =
      Math.min(80, box.width / 2);

    setTip({
      x: Math.min(Math.max(centre, margin), box.width - margin),
      y: target.top - box.top,
      content
    });

  }

  function hide(): void {

    setTip(null);

  }

  const tooltip =
    tip
      ? (
        <div
          className="chart-tooltip"
          role="status"
          style={{ left: tip.x, top: tip.y }}
        >
          {tip.content}
        </div>
      )
      : null;

  return { frame, show, hide, tooltip };

}


// Picks a round gridline step (in minutes) for a maximum in ms.
function niceStepMinutes(
  maxMs: number
): number {

  const maxMinutes =
    maxMs / 60000;

  const steps =
    [5, 10, 15, 30, 60, 120, 180, 240, 360];

  return steps.find(step => maxMinutes / step <= 4) ?? 480;

}


// A bar whose top corners are rounded (the data end), anchored to the baseline.
function barPath(
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
): string {

  const r =
    Math.min(radius, width / 2, height);

  return [
    `M${x},${y + height}`,
    `V${y + r}`,
    `Q${x},${y} ${x + r},${y}`,
    `H${x + width - r}`,
    `Q${x + width},${y} ${x + width},${y + r}`,
    `V${y + height}`,
    "Z"
  ].join(" ");

}


// --------------------------------------------------
// WEEKLY STUDY TIME
// --------------------------------------------------

const SERIES = [
  { key: "leetcodeMs", label: "LeetCode", color: "var(--series-1)" },
  { key: "youtubeMs", label: "YouTube", color: "var(--series-2)" },
  { key: "otherMs", label: "Other", color: "var(--series-3)" }
] as const;


export function WeeklyChart({
  days,
  goalMinutes
}: {
  days: DashboardData["weekly"]["days"];
  goalMinutes: number;
}) {

  const { frame, show, hide, tooltip } =
    useTooltip();

  const [asTable, setAsTable] =
    useState(false);

  // Only series with data get a colour and a legend entry.
  const series =
    SERIES.filter(s => days.some(d => d[s.key] > 0));

  const goalMs =
    goalMinutes * 60000;

  const width = 560;
  const height = 230;
  const left = 44;
  const right = 64;
  const top = 18;
  const bottom = 28;
  const plotW = width - left - right;
  const plotH = height - top - bottom;

  const maxMs =
    Math.max(goalMs, ...days.map(d => d.totalMs), 1);

  const stepMin =
    niceStepMinutes(maxMs * 1.1);

  const ticks =
    Math.ceil((maxMs * 1.1) / (stepMin * 60000));

  const scaleMax =
    ticks * stepMin * 60000;

  const y =
    (ms: number) => top + plotH - (ms / scaleMax) * plotH;

  const column =
    plotW / days.length;

  const barW =
    Math.min(36, column * 0.55);

  return (
    <div className="chart" ref={frame}>

      <div className="chart-toolbar">

        <div className="legend" aria-label="Legend">

          {series.map(s => (
            <span key={s.key} className="legend-item">
              <span className="legend-swatch" style={{ background: s.color }} />
              {s.label}
            </span>
          ))}

          <span className="legend-item">
            <span className="legend-goal" />
            Daily goal
          </span>

        </div>

        <button
          className="text-button"
          onClick={() => setAsTable(!asTable)}
        >
          {asTable ? "Show chart" : "Show table"}
        </button>

      </div>


      {asTable ? (

        <table className="data-table compact">

          <thead>
            <tr>
              <th>Day</th>
              {series.map(s => <th key={s.key} className="num">{s.label}</th>)}
              <th className="num">Total</th>
            </tr>
          </thead>

          <tbody>
            {days.map(d => (
              <tr key={d.date}>
                <td>{longDay(d.date)}</td>
                {series.map(s => <td key={s.key} className="num">{formatDuration(d[s.key])}</td>)}
                <td className="num">{formatDuration(d.totalMs)}</td>
              </tr>
            ))}
          </tbody>

        </table>

      ) : (

        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="chart-svg"
          role="img"
          aria-label={`Study time for the last 7 days: ${days.map(d => `${weekdayShort(d.date)} ${formatDuration(d.totalMs)}`).join(", ")}`}
        >

          {/* gridlines and axis labels */}
          {Array.from({ length: ticks + 1 }, (_, i) => {

            const ms =
              i * stepMin * 60000;

            return (
              <g key={i}>
                <line
                  x1={left}
                  x2={width - right}
                  y1={y(ms)}
                  y2={y(ms)}
                  className={i === 0 ? "axis-line" : "grid-line"}
                />
                <text x={left - 8} y={y(ms) + 4} className="axis-label" textAnchor="end">
                  {formatDuration(ms)}
                </text>
              </g>
            );

          })}


          {/* bars */}
          {days.map((d, index) => {

            const cx =
              left + column * index + column / 2;

            const x =
              cx - barW / 2;

            let base =
              d.totalMs > 0 ? y(0) : 0;

            const segments =
              series.filter(s => d[s.key] > 0);

            return (
              <g key={d.date}>

                {segments.map((s, i) => {

                  const h =
                    (d[s.key] / scaleMax) * plotH;

                  // 2px gap between stacked segments.
                  const gap =
                    i > 0 ? 2 : 0;

                  const isTop =
                    i === segments.length - 1;

                  const segmentTop =
                    base - h;

                  const path =
                    isTop
                      ? barPath(x, segmentTop, barW, Math.max(h - gap, 1), 4)
                      : `M${x},${base - gap} V${segmentTop} H${x + barW} V${base - gap} Z`;

                  base =
                    segmentTop;

                  return (
                    <path key={s.key} d={path} fill={s.color} />
                  );

                })}

                {d.totalMs > 0 && (
                  <text
                    x={cx}
                    y={y(d.totalMs) - 6}
                    textAnchor="middle"
                    className="value-label"
                  >
                    {formatDuration(d.totalMs)}
                  </text>
                )}

                <text
                  x={cx}
                  y={height - 8}
                  textAnchor="middle"
                  className="axis-label"
                >
                  {weekdayShort(d.date)}
                </text>

                {/* hover target bigger than the mark */}
                <rect
                  x={cx - column / 2}
                  y={top}
                  width={column}
                  height={plotH}
                  fill="transparent"
                  tabIndex={0}
                  onMouseEnter={event => show(event, (
                    <>
                      <strong>{longDay(d.date)}</strong>
                      {series.map(s => (
                        <span key={s.key} className="tip-row">
                          <span className="legend-swatch" style={{ background: s.color }} />
                          {s.label}: {formatDuration(d[s.key])}
                        </span>
                      ))}
                      <span className="tip-row">Total: {formatDuration(d.totalMs)}</span>
                    </>
                  ))}
                  onFocus={event => show(event, `${longDay(d.date)}: ${formatDuration(d.totalMs)}`)}
                  onMouseLeave={hide}
                  onBlur={hide}
                />

              </g>
            );

          })}


          {/* daily goal */}
          <line
            x1={left}
            x2={width - right}
            y1={y(goalMs)}
            y2={y(goalMs)}
            className="goal-line"
          />
          <text x={width - right + 6} y={y(goalMs) + 4} className="axis-label">
            Goal {formatDuration(goalMs)}
          </text>

        </svg>

      )}

      {tooltip}

    </div>
  );

}


// --------------------------------------------------
// 8-WEEK TREND
// --------------------------------------------------

export function TrendChart({
  weeks
}: {
  weeks: DashboardData["weekly"]["weeks"];
}) {

  const { frame, show, hide, tooltip } =
    useTooltip();

  const width = 360;
  const height = 170;
  const left = 40;
  const top = 14;
  const bottom = 26;
  const plotW = width - left - 8;
  const plotH = height - top - bottom;

  const maxMs =
    Math.max(...weeks.map(w => w.totalMs), 60000);

  const stepMin =
    niceStepMinutes(maxMs * 1.1);

  const ticks =
    Math.max(1, Math.ceil((maxMs * 1.1) / (stepMin * 60000)));

  const scaleMax =
    ticks * stepMin * 60000;

  const y =
    (ms: number) => top + plotH - (ms / scaleMax) * plotH;

  const column =
    plotW / weeks.length;

  const barW =
    Math.min(24, column * 0.6);

  return (
    <div className="chart" ref={frame}>

      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="chart-svg"
        role="img"
        aria-label={`Weekly study time: ${weeks.map(w => `week of ${dayMonth(w.weekStart)} ${formatDuration(w.totalMs)}`).join(", ")}`}
      >

        {Array.from({ length: ticks + 1 }, (_, i) => {

          const ms =
            i * stepMin * 60000;

          return (
            <g key={i}>
              <line x1={left} x2={width - 8} y1={y(ms)} y2={y(ms)} className={i === 0 ? "axis-line" : "grid-line"} />
              <text x={left - 6} y={y(ms) + 4} className="axis-label" textAnchor="end">
                {formatDuration(ms)}
              </text>
            </g>
          );

        })}

        {weeks.map((w, index) => {

          const cx =
            left + column * index + column / 2;

          const h =
            (w.totalMs / scaleMax) * plotH;

          const isCurrent =
            index === weeks.length - 1;

          return (
            <g key={w.weekStart}>

              {w.totalMs > 0 && (
                <path
                  d={barPath(cx - barW / 2, y(w.totalMs), barW, h, 4)}
                  fill="var(--series-1)"
                />
              )}

              {(index % 2 === 1 || isCurrent) && (
                <text x={cx} y={height - 8} textAnchor="middle" className="axis-label">
                  {isCurrent ? "This wk" : dayMonth(w.weekStart)}
                </text>
              )}

              <rect
                x={cx - column / 2}
                y={top}
                width={column}
                height={plotH}
                fill="transparent"
                tabIndex={0}
                onMouseEnter={event => show(event, (
                  <>
                    <strong>{isCurrent ? "This week" : `Week of ${dayMonth(w.weekStart)}`}</strong>
                    <span className="tip-row">{formatDuration(w.totalMs)}</span>
                  </>
                ))}
                onFocus={event => show(event, `${dayMonth(w.weekStart)}: ${formatDuration(w.totalMs)}`)}
                onMouseLeave={hide}
                onBlur={hide}
              />

            </g>
          );

        })}

      </svg>

      {tooltip}

    </div>
  );

}


// --------------------------------------------------
// ACTIVITY HEATMAP (12 weeks, Monday-first)
// --------------------------------------------------

const HEAT_LEVELS = [
  { maxMinutes: 0, label: "No study", color: "var(--heat-0)" },
  { maxMinutes: 15, label: "Under 15 min", color: "var(--heat-1)" },
  { maxMinutes: 30, label: "15-30 min", color: "var(--heat-2)" },
  { maxMinutes: 60, label: "30-60 min", color: "var(--heat-3)" },
  { maxMinutes: Infinity, label: "Over an hour", color: "var(--heat-4)" }
];


function heatLevel(
  ms: number
) {

  const minutes =
    ms / 60000;

  if (minutes < 1) {

    return HEAT_LEVELS[0];

  }

  return HEAT_LEVELS.slice(1).find(level => minutes <= level.maxMinutes) ?? HEAT_LEVELS[4];

}


export function Heatmap({
  days
}: {
  days: DashboardData["heatmap"];
}) {

  const { frame, show, hide, tooltip } =
    useTooltip();

  const cell = 14;
  const gap = 3;
  const left = 30;
  const top = 4;

  // days starts on a Monday; pad the last week so columns line up.
  const weeks: Array<typeof days> = [];

  for (let i = 0; i < days.length; i += 7) {

    weeks.push(days.slice(i, i + 7));

  }

  const width =
    left + weeks.length * (cell + gap);

  const height =
    top + 7 * (cell + gap);

  return (
    <div className="chart" ref={frame}>

      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="chart-svg heatmap-svg"
        role="img"
        aria-label={`Daily study over the last 12 weeks. Studied on ${days.filter(d => d.totalMs >= 60000).length} of ${days.length} days.`}
      >

        {["Mon", "Wed", "Fri"].map((label, i) => (
          <text
            key={label}
            x={0}
            y={top + (i * 2) * (cell + gap) + cell - 3}
            className="axis-label"
          >
            {label}
          </text>
        ))}

        {weeks.map((week, w) => week.map((d, row) => {

          const level =
            heatLevel(d.totalMs);

          return (
            <rect
              key={d.date}
              x={left + w * (cell + gap)}
              y={top + row * (cell + gap)}
              width={cell}
              height={cell}
              rx={3}
              fill={level.color}
              className="heat-cell"
              tabIndex={0}
              onMouseEnter={event => show(event, (
                <>
                  <strong>{longDay(d.date)}</strong>
                  <span className="tip-row">{formatDuration(d.totalMs)}</span>
                </>
              ))}
              onFocus={event => show(event, `${longDay(d.date)}: ${formatDuration(d.totalMs)}`)}
              onMouseLeave={hide}
              onBlur={hide}
            />
          );

        }))}

      </svg>

      <div className="heat-legend" aria-hidden="true">
        <span>Less</span>
        {HEAT_LEVELS.map(level => (
          <span
            key={level.label}
            className="heat-swatch"
            style={{ background: level.color }}
            title={level.label}
          />
        ))}
        <span>More</span>
      </div>

      {tooltip}

    </div>
  );

}


// --------------------------------------------------
// PROBLEMS BY DIFFICULTY
// --------------------------------------------------

export function DifficultyBars({
  rows
}: {
  rows: DashboardData["problems"]["byDifficulty"];
}) {

  return (
    <div className="difficulty-list">

      {rows.map(row => {

        const share =
          row.attempted > 0 ? row.solved / row.attempted : 0;

        return (
          <div key={row.difficulty} className="difficulty-row">

            <span className="difficulty-name">{row.difficulty}</span>

            <span
              className="meter"
              role="meter"
              aria-valuemin={0}
              aria-valuemax={row.attempted}
              aria-valuenow={row.solved}
              aria-label={`${row.difficulty}: ${row.solved} of ${row.attempted} attempted problems solved`}
            >
              <span className="meter-fill" style={{ width: `${share * 100}%` }} />
            </span>

            <span className="difficulty-count">
              {row.solved} / {row.attempted} solved
            </span>

          </div>
        );

      })}

    </div>
  );

}


// --------------------------------------------------
// TOPIC MASTERY
// --------------------------------------------------

export function MasteryBar({
  value
}: {
  value: number | null;
}) {

  if (value === null) {

    return <span className="muted">–</span>;

  }

  return (
    <span className="mastery">
      <span
        className="meter small"
        role="meter"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={value}
        aria-label={`Mastery ${value} out of 100`}
      >
        <span className="meter-fill" style={{ width: `${value}%` }} />
      </span>
      <span className="mastery-value">{value}</span>
    </span>
  );

}


const STATUS_LABELS: Record<TopicStatus, { icon: string; label: string }> = {
  strong: { icon: "✓", label: "Strong" },
  moderate: { icon: "~", label: "Moderate" },
  weak: { icon: "!", label: "Weak" },
  new: { icon: "•", label: "Not enough data" }
};


// Status always carries an icon and a word, never colour alone.
export function StatusBadge({
  status
}: {
  status: TopicStatus;
}) {

  const { icon, label } =
    STATUS_LABELS[status];

  return (
    <span className={`status status-${status}`}>
      <span className="status-icon" aria-hidden="true">{icon}</span>
      {label}
    </span>
  );

}
