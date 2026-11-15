import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "e2e",
  timeout: 180000,
  retries: 0,
  use: {
    baseURL: "http://127.0.0.1:43127",
    viewport: { width: 1280, height: 720 },
    video: { mode: "on", size: { width: 1280, height: 720 } },
  },
  webServer: {
    command: "npm run start -- --hostname 127.0.0.1 --port 43127",
    url: "http://127.0.0.1:43127",
    reuseExistingServer: false,
    timeout: 120000,
  },
});
