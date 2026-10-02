// --------------------------------------------------
// TYPES
// --------------------------------------------------

export interface StudySession {

  id: string;

  startTime: number;

  lastActivityTime: number;

  totalActiveTime: number;

  website: string;

  currentPage: string;

  currentUrl: string;

  isActive: boolean;

  userState:
    | "active"
    | "idle"
    | "paused";

}


export interface StudyActivity {

  timestamp: number;

  type: string;

  website: string;

  pageTitle: string;

  problemSlug?: string;

  difficulty?: string;

  topics?: string[];

  programmingLanguage?: string;

  submissionResult?: string;

}


// --------------------------------------------------
// STORAGE KEYS
// --------------------------------------------------

const SESSION_KEY =
  "currentStudySession";

const ACTIVITY_KEY =
  "studyActivities";


// --------------------------------------------------
// SAVE SESSION
// --------------------------------------------------

export async function saveCurrentSession(
  session: StudySession
): Promise<void> {

  await chrome.storage.local.set({

    [SESSION_KEY]:
      session

  });

}


// --------------------------------------------------
// GET SESSION
// --------------------------------------------------

export async function getCurrentSession():
  Promise<StudySession | null> {

  const result =
    await chrome.storage.local.get(
      SESSION_KEY
    );


  const session =
    result[SESSION_KEY] as
      | StudySession
      | undefined;


  if (!session) {

    return null;

  }


  return session;

}


// --------------------------------------------------
// CLEAR SESSION
// --------------------------------------------------

export async function clearCurrentSession():
  Promise<void> {

  await chrome.storage.local.remove(
    SESSION_KEY
  );

}


// --------------------------------------------------
// SAVE ACTIVITY
// --------------------------------------------------

export async function saveActivity(
  activity: StudyActivity
): Promise<void> {

  const result =
    await chrome.storage.local.get(
      ACTIVITY_KEY
    );


  const activities =
    (result[ACTIVITY_KEY] as StudyActivity[] | undefined)
    ?? [];


  activities.push(activity);


  // Keep only the latest 500 activities.

  const trimmed =
    activities.slice(-500);


  await chrome.storage.local.set({

    [ACTIVITY_KEY]:
      trimmed

  });

}


// --------------------------------------------------
// GET ACTIVITIES
// --------------------------------------------------

export async function getActivities():
  Promise<StudyActivity[]> {

  const result =
    await chrome.storage.local.get(
      ACTIVITY_KEY
    );


  return (
    result[ACTIVITY_KEY] as
      | StudyActivity[]
      | undefined
  ) ?? [];

}
