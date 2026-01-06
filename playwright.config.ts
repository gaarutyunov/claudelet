import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? "blob" : "html",

  // Terminal operations need longer timeouts
  timeout: 60000,
  expect: {
    timeout: 15000, // Streaming responses take time
  },

  use: {
    baseURL: "http://localhost:3001",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "on-first-retry",
    actionTimeout: 15000,
    navigationTimeout: 30000,
  },

  webServer: [
    {
      command: "bun run mock-server",
      url: "http://localhost:4010/health",
      reuseExistingServer: !process.env.CI,
      timeout: 30000,
    },
    {
      command: "bun run start:server",
      url: "http://localhost:3001/api/health",
      reuseExistingServer: !process.env.CI,
      timeout: 120000,
      env: {
        NODE_ENV: "test",
        PORT: "3001",
        SESSION_SECRET: "test-secret-for-e2e-testing-minimum-32-chars",
        ANTHROPIC_BASE_URL: "http://localhost:4010",
        OAUTH_ISSUER: "http://localhost:8080",
        CORS_ORIGINS: "http://localhost:5173,http://localhost:3001",
      },
    },
    {
      command: "bun run dev:web",
      url: "http://localhost:5173",
      reuseExistingServer: !process.env.CI,
      timeout: 60000,
    },
  ],

  projects: [
    // Setup project for authentication
    {
      name: "setup",
      testMatch: /.*\.setup\.ts/,
    },
    // Main test projects
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        storageState: "tests/.auth/user.json",
      },
      dependencies: ["setup"],
    },
    {
      name: "firefox",
      use: {
        ...devices["Desktop Firefox"],
        storageState: "tests/.auth/user.json",
      },
      dependencies: ["setup"],
    },
    {
      name: "webkit",
      use: {
        ...devices["Desktop Safari"],
        storageState: "tests/.auth/user.json",
      },
      dependencies: ["setup"],
    },
    // Mobile viewports
    {
      name: "mobile-chrome",
      use: {
        ...devices["Pixel 5"],
        storageState: "tests/.auth/user.json",
      },
      dependencies: ["setup"],
    },
  ],
});
