// Pure helpers for working with a video transcript.

export interface TranscriptLine {

  startS: number;

  text: string;

}


export interface TranscriptExcerpt {

  startS: number;

  endS: number;

  // One "[seconds] text" line per caption, ready for the AI model.
  text: string;

}


// "3:45" -> 225, "1:02:03" -> 3723. Anything else -> null.
export function parseTimestamp(
  value: string
): number | null {

  const parts =
    value.trim().split(":");

  if (
    parts.length < 2 ||
    parts.length > 3 ||
    parts.some(part => !/^\d+$/.test(part))
  ) {

    return null;

  }

  return parts
    .map(Number)
    .reduce((total, part) => total * 60 + part, 0);

}


// "[music]" and similar sound descriptions say nothing about the lesson.
export function isSoundCue(
  text: string
): boolean {

  return /^[[(♪].*[\])♪]$/.test(text.trim());

}


export function buildExcerpt(
  lines: TranscriptLine[],
  fromS: number,
  toS: number,
  maxChars = 6000
): TranscriptExcerpt | null {

  const inRange =
    lines.filter(line =>
      line.startS >= fromS &&
      line.startS <= toS &&
      !isSoundCue(line.text)
    );

  if (inRange.length === 0) {

    return null;

  }

  let text = "";

  // Keep the most recent lines if the range is too long: that is what
  // the learner has just watched.
  const kept: string[] = [];

  for (let index = inRange.length - 1; index >= 0; index--) {

    const line =
      `[${Math.floor(inRange[index].startS)}] ${inRange[index].text.trim()}`;

    if (text.length + line.length + 1 > maxChars) {

      break;

    }

    text += line + "\n";

    kept.unshift(line);

  }

  if (kept.length === 0) {

    return null;

  }

  const firstKept =
    inRange[inRange.length - kept.length];

  return {
    startS: Math.floor(firstKept.startS),
    endS: Math.ceil(toS),
    text: kept.join("\n")
  };

}
