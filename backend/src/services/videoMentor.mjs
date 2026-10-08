// Decides what the mentor says while a learner watches an educational
// video, from how they are watching. Pure, so it is easy to test.

export const RECALL_MESSAGE =
  "Pause for a moment. Can you explain the concept you just learned without replaying the video?";

// Video-mentor nudge types (all stored in mentor_interactions).
export const VIDEO_NUDGE_TYPES = [
  "ACTIVE_RECALL",
  "FOCUS_REMINDER",
  "SKIP_REMINDER",
  "CONFUSION_CHECK"
];

// ---- recall prompts (seconds of video watched since the last prompt) -----
export const AFTER_PAUSE_S = 90;      // a natural stopping point
export const AFTER_WATCH_S = 4 * 60;  // a long unbroken stretch
export const AFTER_END_S = 60;        // finished the video

// Minimum time between two recall prompts.
export const RECALL_COOLDOWN_MS = 2 * 60 * 1000;

// Minimum time between any two mentor notes while watching.
export const MIN_GAP_MS = 90 * 1000;

// Below this share of attentive viewing the learner was mostly away, so a
// recall prompt would not be about something they just learned.
export const MIN_ACTIVE_RATIO = 0.5;
const ENOUGH_PLAYING_S = 60;

// ---- behaviour notes (changes since the last mentor note) ---------------
export const SWITCHES_FOR_FOCUS = 3;   // tab + window changes
export const SKIPPED_S_FOR_NOTE = 120; // seconds of video skipped
export const REWINDS_FOR_CHECK = 3;

function mainTopic(watch) {
  return Array.isArray(watch.topics) && watch.topics.length > 0
    ? watch.topics[0]
    : null;
}

/**
 * @param {object} input
 * @param {object} input.watch  a video_watches row (after this report)
 * @param {string} input.event  "pause" | "ended" | "periodic" | ...
 * @param {Date|null} input.lastNudgeAt   last video-mentor note of any kind
 * @param {Date|null} input.lastRecallAt  last recall prompt
 * @param {Date} input.now
 * @returns {{ type: string, message: string, priority: string } | null}
 */
/**
 * thresholds (optional): { afterPauseS, afterWatchS, switchesForFocus } for this learner
 * notes (optional): { recall, focus } personal lines appended to the message
 */
export function decideVideoNudge({
  watch,
  event,
  lastNudgeAt,
  lastRecallAt,
  now,
  thresholds = {},
  notes = {}
}) {
  const afterPauseS = thresholds.afterPauseS ?? AFTER_PAUSE_S;
  const afterWatchS = thresholds.afterWatchS ?? AFTER_WATCH_S;
  const switchesForFocus = thresholds.switchesForFocus ?? SWITCHES_FOR_FOCUS;
  const withNote = (message, note) => (note ? `${message} ${note}` : message);

  if (lastNudgeAt && now.getTime() - lastNudgeAt.getTime() < MIN_GAP_MS) {
    return null;
  }

  const sinceRecall = watch.watch_time_s - watch.recall_marker_s;

  // Judge attentiveness over the stretch since the last recall prompt, not
  // the whole video, so earlier focus doesn't hide a distracted recent stretch.
  const stretchPlaying = watch.playing_s - watch.recall_playing_marker_s;
  const stretchActive = watch.active_s - watch.recall_active_marker_s;
  const attentive =
    stretchPlaying < ENOUGH_PLAYING_S ||
    stretchActive / stretchPlaying >= MIN_ACTIVE_RATIO;

  const recallAllowed =
    attentive &&
    !(lastRecallAt && now.getTime() - lastRecallAt.getTime() < RECALL_COOLDOWN_MS);

  const recall = { type: "ACTIVE_RECALL", message: withNote(RECALL_MESSAGE, notes.recall), priority: "low" };

  if (event === "ended" && recallAllowed && sinceRecall >= AFTER_END_S) {
    return recall;
  }

  const switches = watch.tab_changes + watch.window_changes - watch.switch_marker;
  if (switches >= switchesForFocus) {
    return {
      type: "FOCUS_REMINDER",
      priority: "medium",
      message: withNote(
        `You've switched away from the video ${switches} times. ` +
        "Try keeping it in focus, or pause it while you check something else.",
        notes.focus
      )
    };
  }

  const skippedS = watch.skipped_s - watch.skipped_marker_s;
  if (skippedS >= SKIPPED_S_FOR_NOTE) {
    const topic = mainTopic(watch);
    return {
      type: "SKIP_REMINDER",
      priority: "low",
      message:
        `You've skipped about ${Math.round(skippedS / 60)} min of this video. ` +
        (topic
          ? `If you skipped part of the ${topic} explanation, note what you missed and come back to it.`
          : "If you skipped part of the explanation, note what you missed and come back to it.")
    };
  }

  const rewinds = watch.rewind_count - watch.rewind_marker;
  if (rewinds >= REWINDS_FOR_CHECK) {
    return {
      type: "CONFUSION_CHECK",
      priority: "low",
      message:
        `You've rewound ${rewinds} times. Which part is tricky? ` +
        "Try writing the idea in one sentence before you continue."
    };
  }

  if (recallAllowed && event === "pause" && sinceRecall >= afterPauseS) return recall;
  if (recallAllowed && sinceRecall >= afterWatchS) return recall;

  return null;
}
