import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { crx } from "@crxjs/vite-plugin";
import manifest from "./src/manifest.config.ts";

export default defineConfig({
  plugins: [
    react(),
    crx({
      manifest
    })
  ],
  build: {
    rollupOptions: {
      // The learning dashboard is a full page opened in its own tab, so it
      // is not referenced by the manifest and must be listed here.
      input: {
        dashboard: "src/dashboard/index.html"
      }
    }
  }
});
