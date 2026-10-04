import { defineManifest } from "@crxjs/vite-plugin";

export default defineManifest({
  manifest_version: 3,

  name: "AI Study Mentor",

  version: "1.0.0",

  description:
    "An AI-powered study mentor that tracks learning activity and provides useful nudges.",

  permissions: [
    "storage",
    "tabs",
    "activeTab",
    "sidePanel",
    "idle",
    "identity"
  ],

  host_permissions: [
    "https://leetcode.com/*",
    "https://*.leetcode.com/*",
    "https://www.youtube.com/*",
    "https://youtube.com/*",
    "http://localhost:8787/*"
  ],

  background: {
    service_worker:
      "src/background/serviceWorker.ts",
    type: "module"
  },

  action: {
    default_title: "Open Study Mentor",
    default_icon: {
      "16": "public/icons/icon-16.png",
      "32": "public/icons/icon-32.png"
    }
  },

  side_panel: {
    default_path:
      "src/sidepanel/index.html"
  },

  content_scripts: [
    {
      matches: [
        "https://leetcode.com/*",
        "https://*.leetcode.com/*",
        "https://www.youtube.com/*",
        "https://youtube.com/*"
      ],

      js: [
        "src/content/content.ts"
      ],

      run_at: "document_idle"
    }
  ],

  icons: {
    "16": "public/icons/icon-16.png",
    "32": "public/icons/icon-32.png",
    "48": "public/icons/icon-48.png",
    "128": "public/icons/icon-128.png"
  }
});
