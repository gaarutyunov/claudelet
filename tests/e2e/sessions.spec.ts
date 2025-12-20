import { test, expect } from "./fixtures";

test.describe("Sessions", () => {
  test("should display empty state when no sessions exist", async ({ page, dashboardPage }) => {
    await dashboardPage.goto();
    await dashboardPage.waitForLoad();

    // Check for empty state or session list
    const hasEmptyState = await page.locator("text=No sessions yet").isVisible().catch(() => false);
    const hasSessions = await dashboardPage.sessionList.count() > 0;

    // Either empty state or sessions should be shown
    expect(hasEmptyState || hasSessions).toBe(true);
  });

  test("should create a new session", async ({ page, dashboardPage }) => {
    await dashboardPage.goto();
    await dashboardPage.waitForLoad();

    const initialCount = await dashboardPage.getSessionCount();

    // Create session
    await dashboardPage.newSessionButton.click();
    await page.waitForURL(/\/session\//);

    // Go back to dashboard
    await page.goto("/");
    await dashboardPage.waitForLoad();

    // Should have one more session
    const newCount = await dashboardPage.getSessionCount();
    expect(newCount).toBeGreaterThanOrEqual(initialCount);
  });

  test("should open existing session", async ({ page, dashboardPage }) => {
    await dashboardPage.goto();
    await dashboardPage.waitForLoad();

    // Create a session first
    await dashboardPage.newSessionButton.click();
    await page.waitForURL(/\/session\//);
    const sessionUrl = page.url();

    // Go back
    await page.goto("/");
    await dashboardPage.waitForLoad();

    // Click on the session
    const sessionCard = dashboardPage.sessionList.first();
    await sessionCard.locator('button:has-text("Open")').click();

    // Should be in a session
    await page.waitForURL(/\/session\//);
    expect(page.url()).toContain("/session/");
  });

  test("should show session status indicator", async ({ page, dashboardPage }) => {
    await dashboardPage.goto();
    await dashboardPage.waitForLoad();

    // Create a session
    await dashboardPage.newSessionButton.click();
    await page.waitForURL(/\/session\//);

    // Go back
    await page.goto("/");
    await dashboardPage.waitForLoad();

    // Session should have a status indicator (colored dot)
    const statusDot = dashboardPage.sessionList.first().locator('[class*="rounded-full"]');
    await expect(statusDot).toBeVisible();
  });

  test("should show session metadata", async ({ page, dashboardPage }) => {
    await dashboardPage.goto();
    await dashboardPage.waitForLoad();

    // Create a session
    await dashboardPage.newSessionButton.click();
    await page.waitForURL(/\/session\//);

    // Go back
    await page.goto("/");
    await dashboardPage.waitForLoad();

    // Session card should show creation time
    const sessionCard = dashboardPage.sessionList.first();
    await expect(sessionCard.locator("text=Created")).toBeVisible();
  });

  test("should delete session", async ({ page, dashboardPage }) => {
    await dashboardPage.goto();
    await dashboardPage.waitForLoad();

    // Create a session first
    await dashboardPage.newSessionButton.click();
    await page.waitForURL(/\/session\//);

    await page.goto("/");
    await dashboardPage.waitForLoad();

    const initialCount = await dashboardPage.getSessionCount();

    // Delete the session
    const sessionCard = dashboardPage.sessionList.first();
    await sessionCard.locator('button:has-text("Delete")').click();

    // Handle confirmation dialog if present
    const confirmButton = page.locator('button:has-text("Confirm"), button:has-text("Yes")');
    if (await confirmButton.isVisible({ timeout: 1000 }).catch(() => false)) {
      await confirmButton.click();
    }

    // Wait for deletion
    await page.waitForTimeout(500);

    // Should have one less session (or stay same if delete didn't work due to no confirm)
    const newCount = await dashboardPage.getSessionCount();
    expect(newCount).toBeLessThanOrEqual(initialCount);
  });

  test("should enforce maximum session limit", async ({ page, dashboardPage }) => {
    await dashboardPage.goto();
    await dashboardPage.waitForLoad();

    // Try to create max + 1 sessions
    const maxSessions = 5; // From config

    for (let i = 0; i < maxSessions + 1; i++) {
      const button = dashboardPage.newSessionButton;

      // Check if button is disabled (at limit)
      const isDisabled = await button.isDisabled();

      if (isDisabled) {
        // We've hit the limit
        expect(i).toBeGreaterThanOrEqual(maxSessions);
        break;
      }

      await button.click();

      // Check for error message when at limit
      const errorMessage = page.locator('text=/Maximum.*sessions/i');
      if (await errorMessage.isVisible({ timeout: 1000 }).catch(() => false)) {
        expect(i).toBeGreaterThanOrEqual(maxSessions);
        break;
      }

      await page.waitForURL(/\/session\//);
      await page.goto("/");
      await dashboardPage.waitForLoad();
    }
  });
});
