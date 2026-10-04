import type { Platform } from "./types";

function hostMatches(
  hostname: string,
  domain: string
): boolean {

  return (
    hostname === domain ||
    hostname.endsWith(`.${domain}`)
  );
}

export function detectPlatformFromHostname(
  hostname: string
): Platform {

  if (hostMatches(hostname, "leetcode.com")) {
    return "leetcode";
  }

  if (hostMatches(hostname, "youtube.com")) {
    return "youtube";
  }

  return "unknown";
}

export function detectPlatform(
  url?: string
): Platform {

  if (!url) {
    return "unknown";
  }

  try {
    return detectPlatformFromHostname(
      new URL(url).hostname
    );
  } catch {
    return "unknown";
  }
}
