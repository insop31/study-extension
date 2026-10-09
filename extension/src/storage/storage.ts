import { api } from "../api/client";

import type { UserState } from "../core/types";


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

  userState: UserState;

  // Paused with the Pause button (stays paused until resumed).
  pausedByUser?: boolean;

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
// READS (data lives in PostgreSQL behind the REST API)
// --------------------------------------------------

export async function getCurrentSession():
  Promise<StudySession | null> {

  const { session } =
    await api<{ session: StudySession | null }>(
      "GET",
      "/sessions/current"
    );

  return session;

}


export async function getActivities(
  problemSlug?: string,
  limit = 50
): Promise<StudyActivity[]> {

  const query =
    new URLSearchParams({
      limit: String(limit),
      ...(problemSlug
        ? { problemSlug }
        : {})
    });

  const { activities } =
    await api<{ activities: StudyActivity[] }>(
      "GET",
      `/activities?${query}`
    );

  return activities;

}
