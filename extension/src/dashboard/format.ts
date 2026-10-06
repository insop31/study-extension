// Formatting helpers for the dashboard.

// 0 -> "0m", 35 min -> "35m", 80 min -> "1h 20m"
export function formatDuration(
  milliseconds: number
): string {

  const totalMinutes =
    Math.round(milliseconds / 60000);

  if (totalMinutes < 60) {

    return `${totalMinutes}m`;

  }

  const hours =
    Math.floor(totalMinutes / 60);

  const minutes =
    totalMinutes % 60;

  return minutes === 0
    ? `${hours}h`
    : `${hours}h ${minutes}m`;

}


export function formatPercent(
  value: number | null
): string {

  return value === null
    ? "–"
    : `${value}%`;

}


// "2026-10-06" -> "Tue"
export function weekdayShort(
  day: string
): string {

  return new Date(`${day}T00:00:00Z`).toLocaleDateString(
    undefined,
    { weekday: "short", timeZone: "UTC" }
  );

}


// "2026-10-06" -> "6 Oct"
export function dayMonth(
  day: string
): string {

  return new Date(`${day}T00:00:00Z`).toLocaleDateString(
    undefined,
    { day: "numeric", month: "short", timeZone: "UTC" }
  );

}


// "2026-10-06" -> "Tuesday, 6 October"
export function longDay(
  day: string
): string {

  return new Date(`${day}T00:00:00Z`).toLocaleDateString(
    undefined,
    { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }
  );

}


export function timeAgo(
  timestamp: number,
  now = Date.now()
): string {

  const minutes =
    Math.round((now - timestamp) / 60000);

  if (minutes < 1) return "just now";

  if (minutes < 60) return `${minutes} min ago`;

  const hours =
    Math.round(minutes / 60);

  if (hours < 24) return `${hours} h ago`;

  const days =
    Math.round(hours / 24);

  return days === 1
    ? "yesterday"
    : `${days} days ago`;

}
