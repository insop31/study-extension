// Reads pages on educational sites without a dedicated tracker
// (documentation, tutorials, courses, other problem sites): what the page is
// about and what kind of page it is, and its text when the learner asks the
// mentor a question about it.

import {
  extractTopics,
  deriveTopicFromTitle
} from "../core/youtubeClassifier";

import {
  pageKindFor,
  siteForHostname,
  type PageKind
} from "../core/sites";


const MAX_EXCERPT_CHARS =
  6000;


function textOf(
  selector: string,
  limit: number
): string {

  return Array.from(document.querySelectorAll<HTMLElement>(selector))
    .slice(0, limit)
    .map(element => element.innerText.trim())
    .filter(Boolean)
    .join(" ");

}


let cachedUrl = "";

let cached: { topics: string[]; pageKind: PageKind } | null = null;


// Topics and page kind, cached per URL (activity is reported every few seconds).
export function readingMetadata(): {
  topics: string[];
  pageKind: PageKind;
} {

  if (cached && cachedUrl === window.location.href) {

    return cached;

  }

  const heading =
    textOf("h1", 1);

  const title =
    heading || document.title;

  const description = [
    document.querySelector<HTMLMetaElement>('meta[name="description"]')?.content ?? "",
    textOf("h2", 8)
  ].join(" ");

  const topics =
    extractTopics({ title, description });

  // Name the subject from the heading when no known topic matches.
  if (topics.length === 0) {

    const derived =
      deriveTopicFromTitle(title);

    if (derived) {

      topics.push(derived);

    }

  }

  const site =
    siteForHostname(window.location.hostname);

  cached = {
    topics: topics.slice(0, 5),
    pageKind: site
      ? pageKindFor(site, window.location.pathname)
      : "reading"
  };

  cachedUrl =
    window.location.href;

  return cached;

}


// What the learner is looking at, for a question to the mentor: the text
// they selected, or else the main content of the page.
export function pageExcerpt(): string {

  const selected =
    window.getSelection()?.toString().trim() ?? "";

  if (selected.length >= 20) {

    return selected.slice(0, MAX_EXCERPT_CHARS);

  }

  const main =
    document.querySelector<HTMLElement>("main, article, [role='main']") ??
    document.body;

  return main.innerText
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_EXCERPT_CHARS);

}
