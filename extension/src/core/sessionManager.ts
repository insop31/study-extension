import {
  getCurrentSession,
  saveCurrentSession,
  saveActivity,
  type StudySession
} from "../storage/storage";

import type {
  StudyActivity
} from "../storage/storage";


// --------------------------------------------------
// CONSTANTS
// --------------------------------------------------

export const IDLE_THRESHOLD =
  60 * 1000;


// --------------------------------------------------
// START SESSION
// --------------------------------------------------

export async function startSession(
  website: string,
  title: string,
  url: string
): Promise<StudySession> {

  const now =
    Date.now();


  const session: StudySession = {

    id:
      crypto.randomUUID(),

    startTime:
      now,

    lastActivityTime:
      now,

    totalActiveTime:
      0,

    website,

    currentPage:
      title,

    currentUrl:
      url,

    isActive:
      true,

    userState:
      "active"

  };


  await saveCurrentSession(
    session
  );


  console.log(
    "🟢 Study session started"
  );


  return session;

}


// --------------------------------------------------
// UPDATE PAGE
// --------------------------------------------------

export async function updateSession(
  website: string,
  title: string,
  url: string
): Promise<StudySession> {

  const session =
    await getCurrentSession();


  if (!session) {

    return startSession(
      website,
      title,
      url
    );

  }


  if (!session.isActive) {

    return session;

  }


  session.website =
    website;

  session.currentPage =
    title;

  session.currentUrl =
    url;


  await saveCurrentSession(
    session
  );


  return session;

}


// --------------------------------------------------
// RECORD USER ACTIVITY
// --------------------------------------------------

export async function recordActivity(
  website: string,
  title: string,
  url: string,
  activityType = "activity",
  details: Pick<
    StudyActivity,
    | "problemSlug"
    | "difficulty"
    | "topics"
    | "programmingLanguage"
    | "submissionResult"
  > = {}
): Promise<StudySession | null> {

  const session =
    await getCurrentSession();


  if (!session) {

    return null;

  }


  if (!session.isActive) {

    return session;

  }


  const now =
    Date.now();


  const elapsed =
    now -
    session.lastActivityTime;


  // Only count the period since the
  // previous activity if it wasn't
  // longer than our idle threshold and
  // the session was already active. This
  // prevents time spent on another tab
  // from being added when study resumes.

  if (
    session.userState === "active" &&
    elapsed > 0 &&
    elapsed <= IDLE_THRESHOLD
  ) {

    session.totalActiveTime +=
      elapsed;

  }


  session.lastActivityTime =
    now;


  session.website =
    website;

  session.currentPage =
    title;

  session.currentUrl =
    url;

  session.userState =
    "active";


  await saveCurrentSession(
    session
  );


  await saveActivity({

    timestamp:
      now,

    type:
      activityType,

    website,

    pageTitle:
      title,

    ...details

  });


  return session;

}


// --------------------------------------------------
// SET USER STATE
// --------------------------------------------------

export async function setUserState(
  state:
    | "active"
    | "idle"
    | "paused"
): Promise<StudySession | null> {

  const session =
    await getCurrentSession();


  if (!session) {

    return null;

  }


  if (!session.isActive) {

    return session;

  }


  // Repeating a state update must not move the
  // activity boundary. The side panel periodically
  // refreshes the active-tab context.
  if (
    session.userState === state
  ) {

    return session;

  }


  const now =
    Date.now();


  // Preserve the final active slice when transitioning
  // into idle/paused, then establish a new boundary so
  // paused time is never counted on resume.
  if (
    session.userState === "active" &&
    state !== "active"
  ) {

    const elapsed =
      now - session.lastActivityTime;


    if (
      elapsed > 0 &&
      elapsed <= IDLE_THRESHOLD
    ) {

      session.totalActiveTime +=
        elapsed;

    }

  }


  session.lastActivityTime =
    now;


  session.userState =
    state;


  await saveCurrentSession(
    session
  );


  return session;

}


// --------------------------------------------------
// END SESSION
// --------------------------------------------------

export async function endSession():
  Promise<StudySession | null> {

  const session =
    await getCurrentSession();


  if (!session) {

    return null;

  }


  if (!session.isActive) {

    return session;

  }


  const now =
    Date.now();


  const elapsed =
    now -
    session.lastActivityTime;


  // Count the final active period
  // only if it wasn't an idle period.

  if (
    session.userState === "active" &&
    elapsed > 0 &&
    elapsed <= IDLE_THRESHOLD
  ) {

    session.totalActiveTime +=
      elapsed;

  }


  session.isActive =
    false;


  session.userState =
    "paused";


  session.lastActivityTime =
    now;


  await saveCurrentSession(
    session
  );


  console.log(
    "⚪ Study session ended"
  );


  return session;

}
