import type {
  Platform,
  ActivityType
} from "./types";

export function detectPlatform(
  url: string
): Platform {

  if (url.includes("leetcode.com")) {
    return "leetcode";
  }

  if (url.includes("youtube.com")) {
    return "youtube";
  }

  return "unknown";
}

export function detectActivity(
  platform: Platform
): ActivityType {

  switch (platform) {

    case "leetcode":
      return "problem_solving";

    case "youtube":
      return "video_learning";

    default:
      return "unknown";
  }
}