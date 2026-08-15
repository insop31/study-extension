import { defineManifest } from "@crxjs/vite-plugin";

export default defineManifest({
  manifest_version: 3,

  name: "AI Study Mentor",

  version: "0.1.0",

  description:
    "An AI-powered study mentor that provides contextual learning nudges.",

  permissions: [
    "storage",
    "tabs",
    "activeTab",
    "sidePanel"
  ],

  host_permissions: [
    "https://leetcode.com/*",
    "https://www.youtube.com/*"
  ],

  background: {
    service_worker: "src/background/serviceWorker.ts",
    type: "module"
  },

  action: {
    default_title: "Open AI Study Mentor"
  },

  side_panel: {
    default_path: "src/sidepanel/index.html"
  },

  content_scripts: [
    {
      matches: [
        "https://leetcode.com/*",
        "https://www.youtube.com/*"
      ],

      js: [
        "src/content/content.ts"
      ],

      run_at: "document_idle"
    }
  ]
});