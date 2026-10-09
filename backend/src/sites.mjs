// Educational sites the extension tracks. Keep in sync with
// extension/src/core/sites.ts (which also knows their URLs).

export const SITES = {
  leetcode: { label: "LeetCode", kind: "problems" },
  youtube: { label: "YouTube", kind: "video" },
  geeksforgeeks: { label: "GeeksforGeeks", kind: "tutorials" },
  hackerrank: { label: "HackerRank", kind: "problems" },
  codeforces: { label: "Codeforces", kind: "problems" },
  w3schools: { label: "W3Schools", kind: "tutorials" },
  mdn: { label: "MDN Web Docs", kind: "docs" },
  khanacademy: { label: "Khan Academy", kind: "course" },
  coursera: { label: "Coursera", kind: "course" },
  freecodecamp: { label: "freeCodeCamp", kind: "course" },
  pythondocs: { label: "Python docs", kind: "docs" },
  cppreference: { label: "cppreference", kind: "docs" }
};

export const SITE_IDS = Object.keys(SITES);

// Sites with no dedicated tracker: their pages are recorded as reading.
export const isReadingSite = site => site !== "leetcode" && site !== "youtube" && site in SITES;
