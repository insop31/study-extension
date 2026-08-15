interface PageContext {
  title: string;
  url: string;
  website: string;
  timestamp: number;
}


function getWebsite(): string {

  const hostname =
    window.location.hostname;

  if (hostname.includes("leetcode.com")) {
    return "leetcode";
  }

  if (hostname.includes("youtube.com")) {
    return "youtube";
  }

  return "unknown";
}


function getPageContext(): PageContext {

  return {
    title: document.title,

    url: window.location.href,

    website: getWebsite(),

    timestamp: Date.now()
  };
}


console.log(
  "AI Study Mentor content script loaded."
);


chrome.runtime.sendMessage({
  type: "PAGE_CONTEXT",

  context: getPageContext()
});