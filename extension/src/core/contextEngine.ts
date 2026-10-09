import type { Platform } from "./types";

import { siteForHostname } from "./sites";


// The supported site a hostname belongs to (its id), or "unknown".
export function detectPlatformFromHostname(
  hostname: string
): Platform {

  return siteForHostname(hostname)?.id ?? "unknown";

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
