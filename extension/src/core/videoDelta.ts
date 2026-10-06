import type { VideoDelta } from "./types";


export function emptyDelta(): VideoDelta {

  return {
    watchedS: 0,
    playingS: 0,
    activeS: 0,
    pausedS: 0,
    pauseCount: 0,
    tabChanges: 0,
    windowChanges: 0,
    skipCount: 0,
    skippedS: 0,
    rewindCount: 0,
    rewoundS: 0
  };

}


export function hasDelta(
  delta: VideoDelta
): boolean {

  return Object.values(delta).some(
    value => value > 0
  );

}
