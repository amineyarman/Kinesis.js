import { defineConfig, devices } from "@playwright/test"

export default defineConfig({
  testDir: "./tests/browser",
  fullyParallel: true,
  use: { baseURL: "http://127.0.0.1:5174" },
  webServer: {
    command: "npx vite --port 5174 --strictPort --host 127.0.0.1",
    url: "http://127.0.0.1:5174/tests/browser/fixtures/blank.html",
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1200, height: 800 } } }],
})
