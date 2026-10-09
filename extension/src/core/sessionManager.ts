import { api } from "../api/client";

import type {
  StudySession
} from "../storage/storage";

import type {
  Nudge,
  UserState
} from "./types";

import type {
  PersonalNudgeData
} from "./nudgeEngine";


// Session state and active-time accounting live on the backend,
// so every client sees the same numbers. These are thin wrappers
// over the REST API.

interface SessionResponse {

  session: StudySession | null;

}


export interface ActivityDetails {

  problemSlug?: string;

  difficulty?: string;

  topics?: string[];

  programmingLanguage?: string;

  submissionResult?: string;

  // On other educational sites: what kind of page this is.
  pageKind?: string;

}


// What the nudge engine needs to decide whether to speak.
export interface NudgeState {

  lastNudgeAt: number | null;

  lastProactiveAt: number | null;

  lastProactiveType: string | null;

  failedAttempts: number;

  // This learner's pace and record for the current problem; null when
  // there is no problem in focus.
  personal?: PersonalNudgeData | null;

}


export interface ActivityResult {

  session: StudySession;

  nudgeState: NudgeState | null;

  // A break suggestion or concept reminder the backend just created.
  notice?: Nudge | null;

}


export async function startSession(
  website: string,
  title: string,
  url: string
): Promise<StudySession | null> {

  const { session } =
    await api<SessionResponse>(
      "POST",
      "/sessions",
      { website, title, url }
    );

  return session;

}


export async function updateSession(
  website: string,
  title: string,
  url: string
): Promise<StudySession | null> {

  const { session } =
    await api<SessionResponse>(
      "PATCH",
      "/sessions/current/page",
      { website, title, url }
    );

  return session;

}


export async function recordActivity(
  website: string,
  title: string,
  url: string,
  activityType = "activity",
  details: ActivityDetails = {}
): Promise<ActivityResult | null> {

  const result =
    await api<{
      session: StudySession | null;
      nudgeState: NudgeState | null;
      notice?: Nudge | null;
    }>(
      "POST",
      "/sessions/current/activity",
      {
        website,
        title,
        url,
        activityType,
        ...details
      }
    );

  return result.session
    ? result as ActivityResult
    : null;

}


export async function setUserState(
  state: UserState
): Promise<StudySession | null> {

  const { session } =
    await api<SessionResponse>(
      "PUT",
      "/sessions/current/state",
      { state }
    );

  return session;

}


// A deliberate pause: nothing counts until resumeSession().
export async function pauseSession():
  Promise<StudySession | null> {

  const { session } =
    await api<SessionResponse>(
      "POST",
      "/sessions/current/pause"
    );

  return session;

}


export async function resumeSession():
  Promise<StudySession | null> {

  const { session } =
    await api<SessionResponse>(
      "POST",
      "/sessions/current/resume"
    );

  return session;

}


// The learner left a problem page for another tab or window.
export async function recordDistraction(
  details: {
    kind: "tab" | "window";
    website: string;
    problemSlug?: string;
    title?: string;
  }
): Promise<Nudge | null> {

  const { nudge } =
    await api<{ nudge: Nudge | null }>(
      "POST",
      "/sessions/current/distraction",
      details
    );

  return nudge;

}


export async function endSession():
  Promise<StudySession | null> {

  const { session } =
    await api<SessionResponse>(
      "POST",
      "/sessions/current/end"
    );

  return session;

}


// --------------------------------------------------
// NUDGES
// --------------------------------------------------

export async function getCurrentNudge():
  Promise<Nudge | null> {

  const { nudge } =
    await api<{ nudge: Nudge | null }>(
      "GET",
      "/nudges/current"
    );

  return nudge;

}


export async function saveNudge(
  nudge: Pick<Nudge, "type" | "message" | "priority">,
  problemSlug?: string
): Promise<Nudge> {

  const { nudge: saved } =
    await api<{ nudge: Nudge }>(
      "POST",
      "/nudges",
      { ...nudge, problemSlug }
    );

  return saved;

}


export async function dismissNudge(
  id: string
): Promise<void> {

  await api(
    "POST",
    `/nudges/${id}/dismiss`
  );

}
