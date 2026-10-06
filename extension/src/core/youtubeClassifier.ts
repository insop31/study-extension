// Decides whether a YouTube video is educational and which topics it
// covers, from the metadata visible on the watch page. Pure functions,
// so they can be tested without a browser.

export interface VideoMetadata {

  title: string;

  channel?: string;

  // YouTube's own category, e.g. "Education" or "Music".
  category?: string;

  description?: string;

  tags?: string[];

}


export interface VideoClassification {

  educational: boolean;

  score: number;

  topics: string[];

}


export const EDUCATIONAL_THRESHOLD =
  4;


const EDUCATIONAL_CATEGORIES: Record<string, number> = {
  "education": 4,
  "science & technology": 2,
  "howto & style": 1,
  "nonprofits & activism": 0
};


const DISTRACTION_CATEGORIES = new Set([
  "music",
  "gaming",
  "entertainment",
  "comedy",
  "sports",
  "film & animation",
  "people & blogs",
  "pets & animals",
  "autos & vehicles",
  "travel & events",
  "shows"
]);


// Words that describe how something is taught.
const TEACHING_PATTERNS: RegExp[] = [
  /\blectures?\b/,
  /\btutorials?\b/,
  /\bcourses?\b/,
  /\bcrash course\b/,
  /\blessons?\b/,
  /\bexplained\b|\bexplanation\b/,
  /\bfor beginners\b|\bbeginner'?s?\b/,
  /\bintro(duction)? to\b/,
  /\bhow (to|does|do)\b/,
  /\blearn(ing)?\b/,
  /\bstep[- ]by[- ]step\b/,
  /\bwalkthrough\b/,
  /\bmasterclass\b/,
  /\bfull course\b/,
  /\bchapter \d+\b/,
  /\bleetcode\b|\bneetcode\b/,
  /\binterview (questions?|prep)\b/,
  /\bsolutions?\b/,
  /\bderivation\b|\bproof\b/,
  /\bplaylist\b|\bsyllabus\b/
];


// Signals that a video is entertainment, not study material.
const DISTRACTION_PATTERNS: RegExp[] = [
  /\bofficial (music )?video\b/,
  /\bmusic video\b|\blyrics?\b|\bofficial audio\b/,
  /\btrailer\b|\bteaser\b/,
  /\bvlog\b/,
  /\breaction\b|\breacts? to\b/,
  /\bgameplay\b|\blet'?s play\b|\bwalkthrough part\b/,
  /\bfunny\b|\bmemes?\b|\bprank\b|\bcompilation\b/,
  /\bunboxing\b/,
  /\bhighlights\b/,
  /#shorts\b/
];


// topic name -> patterns that indicate it.
export const TOPIC_PATTERNS: Record<string, RegExp[]> = {
  "Arrays": [/\barrays?\b/],
  "Strings": [/\bstrings?\b(?! theory)/],
  "Linked Lists": [/\blinked lists?\b/],
  "Stacks & Queues": [/\bstacks?\b/, /\bqueues?\b/],
  "Hash Tables": [/\bhash ?(table|map|set)s?\b/, /\bhashing\b/],
  "Trees": [/\bbinary trees?\b/, /\bbst\b/, /\btrees?\b(?! diagram)/],
  "Binary Search": [/\bbinary search\b/],
  "Graphs": [/\bgraphs?\b(?! card)/, /\bbfs\b|\bdfs\b/, /\bdijkstra\b/],
  "Dynamic Programming": [/\bdynamic programming\b/, /\bmemoization\b/, /\bknapsack\b/],
  "Recursion": [/\brecursion\b|\brecursive\b/],
  "Backtracking": [/\bbacktracking\b/],
  "Greedy Algorithms": [/\bgreedy\b/],
  "Sorting": [/\bsorting\b|\bsort algorithms?\b|\bquick ?sort\b|\bmerge ?sort\b/],
  "Sliding Window": [/\bsliding window\b/],
  "Two Pointers": [/\btwo pointers?\b/],
  "Heaps": [/\bheaps?\b|\bpriority queues?\b/],
  "Tries": [/\btrie\b/],
  "Bit Manipulation": [/\bbit(wise)? manipulation\b|\bbitwise\b/],
  "Algorithms": [/\balgorithms?\b/],
  "Data Structures": [/\bdata structures?\b|\bdsa\b/],
  "Time Complexity": [/\bbig[- ]?o\b|\btime complexity\b|\bspace complexity\b/],
  "Object-Oriented Programming": [/\bobject[- ]oriented\b|\boop\b/],
  "Databases": [/\bsql\b|\bdatabases?\b|\bpostgres(ql)?\b|\bmongodb\b/],
  "Operating Systems": [/\boperating systems?\b/, /\bprocess scheduling\b|\bdeadlocks?\b/],
  "Computer Networks": [/\bcomputer networks?\b|\btcp\b|\bhttp\b|\bdns\b/],
  "System Design": [/\bsystem design\b/],
  "Machine Learning": [/\bmachine learning\b|\bneural networks?\b|\bdeep learning\b/],
  "Python": [/\bpython\b/],
  "JavaScript": [/\bjavascript\b|\btypescript\b/],
  "Java": [/\bjava\b(?!script)/],
  "C++": [/\bc\+\+\b/],
  "C Programming": [/\bc (language|programming)\b|\bc tutorial\b|\blearn c\b/],
  "Rust": [/\brust (programming|language|tutorial|course)\b|\blearn rust\b/],
  "Go": [/\bgolang\b|\bgo (programming|language)\b/],
  "Kotlin & Android": [/\bkotlin\b|\bandroid (development|app)/],
  "Swift & iOS": [/\bswiftui\b|\bswift (programming|tutorial)\b|\bios development\b/],
  "Linux": [/\blinux\b|\bbash\b|\bshell scripting\b/],
  "DevOps & Cloud": [/\bdocker\b|\bkubernetes\b|\bdevops\b|\baws\b|\bazure\b/],
  "Cybersecurity": [/\bcyber ?security\b|\bethical hacking\b|\bcryptography\b/],
  "Data Science": [/\bdata science\b|\bpandas\b|\bnumpy\b|\bdata analysis\b/],
  "Excel": [/\bexcel\b|\bspreadsheets?\b/],
  "Computer Architecture": [/\bcomputer architecture\b|\bassembly language\b|\bcpu\b/],
  "Compilers": [/\bcompilers?\b|\bautomata\b|\bformal languages?\b/],
  "Web Development": [/\breact\b|\bhtml\b|\bcss\b|\bweb development\b|\bnode\.?js\b/],
  "Git": [/\bgit\b|\bgithub\b/],
  "Calculus": [/\bcalculus\b|\bderivatives?\b|\bintegrals?\b/],
  "Linear Algebra": [/\blinear algebra\b|\bmatrices\b|\beigen/],
  "Probability": [/\bprobability\b/],
  "Statistics": [/\bstatistics\b|\bstatistical\b/],
  "Discrete Mathematics": [/\bdiscrete (math|mathematics)\b|\bboolean algebra\b/],
  "Algebra": [/\balgebra\b/],
  "Geometry": [/\bgeometry\b|\btrigonometry\b/],
  "Physics": [/\bphysics\b|\bmechanics\b|\bthermodynamics\b|\bquantum\b/],
  "Chemistry": [/\bchemistry\b|\borganic chem/],
  "Biology": [/\bbiology\b|\bgenetics\b|\bcell division\b/],
  "Economics": [/\beconomics\b|\bmacroeconomics\b|\bmicroeconomics\b/]
};


function normalise(
  text: string | undefined
): string {

  return (text ?? "").toLowerCase();

}


function countMatches(
  patterns: RegExp[],
  text: string
): number {

  return patterns.filter(pattern =>
    pattern.test(text)
  ).length;

}


// Words that describe the format of a video rather than its subject.
const TITLE_FORMAT_WORDS =
  /\b(part \d+|chapter \d+|episode \d+|lectures? \d+|lessons? \d+|full course|crash course|complete|ultimate|full|tutorials?|courses?|lectures?|lessons?|class|classes|for beginners|beginners?|absolute|introduction to|intro to|introduction|intro|explained|explanation|learn|learning|how to|guide|masterclass|step by step|walkthrough|with notes|practice questions|part \d+|chapter \d+|episode \d+|lecture \d+|in \d+ (hours?|minutes?|mins?)|\d+ (hours?|minutes?|mins?)|free|hd|2\d{3})\b/gi;


// When no known subject matches, name the video's subject from its
// title, e.g. "Bayesian Thinking Lecture 3: Priors" -> "Bayesian Thinking".
export function deriveTopicFromTitle(
  title: string
): string | undefined {

  const head =
    title.split(/\s[-\u2013\u2014|:]\s|[:|([]/)[0] ?? title;

  const cleaned =
    head
      .replace(TITLE_FORMAT_WORDS, " ")
      .replace(/[^\p{L}\p{N}+#. ]/gu, " ")
      .replace(/\s+/g, " ")
      .trim();

  const words =
    cleaned.split(" ").filter(Boolean);

  if (words.length === 0 || cleaned.length < 2) {

    return undefined;

  }

  return words.slice(0, 4).join(" ").slice(0, 60);

}


export function extractTopics(
  video: VideoMetadata
): string[] {

  const title =
    normalise(video.title);

  const tags =
    normalise((video.tags ?? []).join(" "));

  const description =
    normalise(video.description);


  const scored =
    Object.entries(TOPIC_PATTERNS)
      .map(([topic, patterns]) => ({

        topic,

        // The title says what a video is about; the description
        // mentions things in passing, so it counts for less.
        weight:
          countMatches(patterns, title) * 3 +
          countMatches(patterns, tags) * 2 +
          countMatches(patterns, description)

      }))
      .filter(entry => entry.weight > 0)
      .sort((first, second) =>
        second.weight - first.weight
      );


  // A topic only found in the description is a weak signal unless
  // the video also looks like study material (checked by the caller).
  return scored
    .slice(0, 5)
    .map(entry => entry.topic);

}


export function classifyVideo(
  video: VideoMetadata
): VideoClassification {

  const title =
    normalise(video.title);

  const text =
    `${normalise(video.description)} ${normalise((video.tags ?? []).join(" "))}`;

  const category =
    normalise(video.category);


  let score = 0;


  score +=
    EDUCATIONAL_CATEGORIES[category] ?? 0;


  if (DISTRACTION_CATEGORIES.has(category)) {

    score -= 3;

  }


  // How-it's-taught wording: strong in the title, weaker elsewhere.
  score +=
    Math.min(
      countMatches(TEACHING_PATTERNS, title) * 2,
      4
    );

  score +=
    Math.min(
      countMatches(TEACHING_PATTERNS, text),
      2
    );


  const topics =
    extractTopics(video);


  // Subject matter in the title (e.g. "Dynamic Programming").
  const titleTopics =
    Object.values(TOPIC_PATTERNS)
      .filter(patterns =>
        countMatches(patterns, title) > 0
      ).length;

  score +=
    Math.min(titleTopics * 2, 4);

  if (titleTopics === 0 && topics.length > 0) {

    score += 1;

  }


  score -=
    Math.min(
      countMatches(DISTRACTION_PATTERNS, `${title} ${text}`) * 3,
      6
    );


  const educational =
    score >= EDUCATIONAL_THRESHOLD;

  const fallback =
    educational && topics.length === 0
      ? deriveTopicFromTitle(video.title)
      : undefined;

  return {

    educational,

    score,

    topics:
      educational
        ? topics.length > 0
          ? topics
          : fallback
            ? [fallback]
            : []
        : []

  };

}
