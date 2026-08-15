export interface StudySession {
  active: boolean;
  startTime: number | null;
  website: string | null;
  pageTitle?: string;
  topic?: string;
}


export async function saveStudySession(
  session: StudySession
): Promise<void> {

  await chrome.storage.local.set({
    studySession: session
  });

}


export async function getStudySession(): Promise<StudySession | null> {

  const result = await chrome.storage.local.get(
    "studySession"
  );

  const session = result.studySession;

  if (!session) {
    return null;
  }

  return session as StudySession;
}