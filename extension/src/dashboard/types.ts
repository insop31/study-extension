// Shape of GET /api/dashboard (see backend/src/services/dashboardService.mjs).

export type TopicStatus =
  | "strong"
  | "moderate"
  | "weak"
  | "new";


export interface DashboardTopic {

  topic: string;

  sources: string[];

  problemsAttempted: number;

  problemsSolved: number;

  attempts: number;

  accepted: number;

  successRate: number | null;

  attemptAccuracy: number | null;

  avgSolveMs: number | null;

  problemMs: number;

  videoWatchMs: number;

  // Time on pages of other educational sites.
  readingMs: number;

  studyMs: number;

  quizAnswered: number;

  quizCorrect: number;

  quizAccuracy: number | null;

  mastery: number | null;

  evidence: number;

  status: TopicStatus;

}


export interface Recommendation {

  id: string;

  kind: string;

  // 1 = do this first, 3 = nice to know
  priority: 1 | 2 | 3;

  title: string;

  detail: string;

  action?: {
    label: string;
    url: string;
  };

}


export interface DashboardData {

  generatedAt: number;

  today: string;

  timezone: string;

  dailyGoalMinutes: number;

  summary: {
    todayMs: number;
    thisWeekMs: number;
    lastWeekMs: number;
    weekChangePct: number | null;
    streakDays: number;
    activeDaysThisWeek: number;
    sessionsThisWeek: number;
    avgSessionMs: number;
    problemsAttempted: number;
    problemsSolved: number;
    problemsSolvedThisWeek: number;
    successRate: number | null;
    attemptAccuracy: number | null;
    firstTrySolved: number;
    avgSolveMs: number | null;
    videosWatched: number;
    videoWatchMs: number;
    quizAnswered: number;
    quizCorrect: number;
    quizAccuracy: number | null;
    mentorNotesThisWeek: number;
    topicsStudied: number;
    pagesRead: number;
    readingMs: number;
  };

  reading: {
    recent: Array<{
      url: string;
      title: string;
      site: string;
      kind: string;
      topics: string[];
      timeMs: number;
      lastSeen: number;
    }>;
  };

  // When in the day the learner studies, and how accurate they are then.
  rhythm: {
    periods: Array<{
      id: string;
      label: string;
      hours: string;
      studyMs: number;
      attempts: number;
      accepted: number;
      accuracy: number | null;
    }>;
    mostStudied: string | null;
    sharpest: string | null;
    overallAccuracy: number | null;
    insight: string | null;
  };

  focus: {
    problemSwitchesPerHour: number | null;
    videoSwitchesPerHour: number | null;
    videoFocusPct: number | null;
    breaksSuggestedThisWeek: number;
  };

  weekly: {
    days: Array<{
      date: string;
      leetcodeMs: number;
      youtubeMs: number;
      otherMs: number;
      totalMs: number;
    }>;
    weeks: Array<{
      weekStart: string;
      totalMs: number;
    }>;
  };

  heatmap: Array<{
    date: string;
    totalMs: number;
  }>;

  problems: {
    byDifficulty: Array<{
      difficulty: string;
      attempted: number;
      solved: number;
    }>;
    recent: Array<{
      slug: string;
      title: string;
      difficulty: string | null;
      topics: string[];
      attempts: number;
      solved: boolean;
      timeMs: number;
      lastSeen: number;
    }>;
  };

  videos: {
    recent: Array<{
      videoId: string;
      title: string;
      channel: string | null;
      topics: string[];
      watchMs: number;
      percentWatched: number;
      lastSeen: number;
    }>;
  };

  topics: DashboardTopic[];

  weakTopics: DashboardTopic[];

  strongTopics: DashboardTopic[];

  recommendations: Recommendation[];

}


export interface CoachReport {

  content: string;

  createdAt: number;

}
