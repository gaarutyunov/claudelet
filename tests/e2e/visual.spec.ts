import { test, expect } from "./fixtures";

test.describe("Visual Regression @visual", () => {
  test("login page renders correctly", async ({ page }) => {
    // Clear auth state for this test
    await page.context().clearCookies();
    await page.evaluate(() => localStorage.clear());

    await page.goto("/login");
    await page.waitForSelector('button:has-text("Sign in with Google")');

    await expect(page).toHaveScreenshot("login-page.png", {
      threshold: 0.2,
      animations: "disabled",
    });
  });

  test("dashboard renders correctly", async ({ page, dashboardPage }) => {
    await dashboardPage.goto();
    await dashboardPage.waitForLoad();

    await expect(page).toHaveScreenshot("dashboard.png", {
      threshold: 0.2,
      animations: "disabled",
    });
  });

  test("terminal renders correctly", async ({ page, terminalPage }) => {
    await terminalPage.goto();
    await terminalPage.waitForReady();

    // Wait for terminal to stabilize
    await page.waitForTimeout(1000);

    await expect(page.locator(".xterm")).toHaveScreenshot("terminal.png", {
      threshold: 0.3, // Higher threshold for terminal content
      animations: "disabled",
    });
  });

  test("terminal with command output renders correctly", async ({ page, terminalPage }) => {
    await terminalPage.goto();
    await terminalPage.waitForReady();
    await terminalPage.waitForConnection();

    // Type a command
    await terminalPage.sendCommand('echo "Visual test"');
    await terminalPage.waitForOutput("Visual test");

    // Wait for output to stabilize
    await page.waitForTimeout(500);

    await expect(page.locator(".xterm")).toHaveScreenshot("terminal-with-output.png", {
      threshold: 0.3,
      animations: "disabled",
    });
  });

  test("dashboard with sessions renders correctly", async ({ page, dashboardPage }) => {
    await dashboardPage.goto();
    await dashboardPage.waitForLoad();

    // Create a session so we have content
    await dashboardPage.newSessionButton.click();
    await page.waitForURL(/\/session\//);

    // Go back to dashboard
    await page.goto("/");
    await dashboardPage.waitForLoad();

    await expect(page).toHaveScreenshot("dashboard-with-sessions.png", {
      threshold: 0.2,
      animations: "disabled",
      mask: [
        // Mask dynamic content like timestamps
        page.locator("text=/Created:/"),
        page.locator("text=/Last active:/"),
      ],
    });
  });

  test("mobile viewport renders correctly", async ({ page, dashboardPage }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });

    await dashboardPage.goto();
    await dashboardPage.waitForLoad();

    await expect(page).toHaveScreenshot("dashboard-mobile.png", {
      threshold: 0.2,
      animations: "disabled",
    });
  });

  test("terminal header shows correct status", async ({ page, terminalPage }) => {
    await terminalPage.goto();
    await terminalPage.waitForReady();

    const header = page.locator("header");

    await expect(header).toHaveScreenshot("terminal-header-connected.png", {
      threshold: 0.2,
      animations: "disabled",
    });
  });
});
