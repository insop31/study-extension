// Educational sites the extension tracks. Keep the ids in sync with
// backend/src/sites.mjs. LeetCode and YouTube have dedicated trackers; the
// others are tracked as reading (time and topics per page).

export type PageKind =
  | "reading"
  | "problem"
  | "course"
  | "video";


export interface SiteConfig {

  id: string;

  label: string;

  // Hostnames, matched exactly or as a parent domain.
  hosts: string[];

  // What a page on this site usually is.
  defaultKind: PageKind;

  // URL paths that are problem pages (practice/judge sites).
  problemPaths?: RegExp;

}


export const SITES: SiteConfig[] = [
  { id: "leetcode", label: "LeetCode", hosts: ["leetcode.com"], defaultKind: "problem" },
  { id: "youtube", label: "YouTube", hosts: ["youtube.com"], defaultKind: "video" },
  {
    id: "geeksforgeeks", label: "GeeksforGeeks", hosts: ["geeksforgeeks.org"], defaultKind: "reading",
    problemPaths: /^\/problems\//
  },
  {
    id: "hackerrank", label: "HackerRank", hosts: ["hackerrank.com"], defaultKind: "reading",
    problemPaths: /\/challenges\/[^/]+\/problem/
  },
  {
    id: "codeforces", label: "Codeforces", hosts: ["codeforces.com"], defaultKind: "reading",
    problemPaths: /\/(problemset\/problem|contest\/\d+\/problem|gym\/\d+\/problem)\//
  },
  { id: "w3schools", label: "W3Schools", hosts: ["w3schools.com"], defaultKind: "reading" },
  { id: "mdn", label: "MDN Web Docs", hosts: ["developer.mozilla.org"], defaultKind: "reading" },
  { id: "khanacademy", label: "Khan Academy", hosts: ["khanacademy.org"], defaultKind: "course" },
  { id: "coursera", label: "Coursera", hosts: ["coursera.org"], defaultKind: "course" },
  { id: "freecodecamp", label: "freeCodeCamp", hosts: ["freecodecamp.org"], defaultKind: "course" },
  { id: "pythondocs", label: "Python docs", hosts: ["docs.python.org"], defaultKind: "reading" },
  { id: "cppreference", label: "cppreference", hosts: ["cppreference.com"], defaultKind: "reading" }
];


export function siteForHostname(
  hostname: string
): SiteConfig | null {

  return SITES.find(site =>
    site.hosts.some(host =>
      hostname === host ||
      hostname.endsWith(`.${host}`)
    )
  ) ?? null;

}


export function siteLabel(
  id: string
): string {

  return SITES.find(site => site.id === id)?.label ?? id;

}


// Sites without a dedicated tracker.
export function isReadingSite(
  id: string
): boolean {

  return id !== "leetcode" && id !== "youtube" && SITES.some(site => site.id === id);

}


export function pageKindFor(
  site: SiteConfig,
  pathname: string
): PageKind {

  return site.problemPaths?.test(pathname)
    ? "problem"
    : site.defaultKind;

}


// Content-script match patterns for the manifest.
export function matchPatterns(): string[] {

  return SITES.flatMap(site =>
    site.hosts.flatMap(host => [
      `https://${host}/*`,
      `https://*.${host}/*`
    ])
  );

}
