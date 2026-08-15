interface StudyContext {
  title: string;
  url: string;
  website: string;
  timestamp: number;
  tabId?: number;
}

let currentContext: StudyContext | null = null;

console.log("AI Study Mentor background service started.");


// --------------------------------------------------
// EXTENSION INSTALLATION
// --------------------------------------------------

chrome.runtime.onInstalled.addListener(() => {
  console.log("AI Study Mentor installed.");

  chrome.storage.local.set({
    studySession: {
      active: false,
      startTime: null,
      website: null
    }
  });
});


// --------------------------------------------------
// OPEN SIDE PANEL
// --------------------------------------------------

chrome.action.onClicked.addListener(
  async (tab: chrome.tabs.Tab) => {

    if (!tab.id) {
      return;
    }

    await chrome.sidePanel.open({
      tabId: tab.id
    });
  }
);


// --------------------------------------------------
// MESSAGE HANDLING
// --------------------------------------------------

chrome.runtime.onMessage.addListener(
  (
    message: {
      type: string;
      context?: StudyContext;
    },
    sender: chrome.runtime.MessageSender,
    sendResponse: (response?: unknown) => void
  ) => {

    // ----------------------------------------------
    // Page context sent by content script
    // ----------------------------------------------

    if (
      message.type === "PAGE_CONTEXT" &&
      message.context
    ) {

      currentContext = {
        ...message.context,

        tabId: sender.tab?.id
      };

      console.log(
        "Current study context:",
        currentContext
      );

      return;
    }


    // ----------------------------------------------
    // Side panel requesting current context
    // ----------------------------------------------

    if (
      message.type === "GET_CURRENT_CONTEXT"
    ) {

      sendResponse(currentContext);

      return true;
    }

  }
);