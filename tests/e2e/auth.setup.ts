import { test as setup, expect } from "@playwright/test";
import fs from "fs";
import path from "path";

const authFile = "tests/.auth/user.json";

setup("authenticate", async ({ page }) => {
  // Ensure auth directory exists
  const authDir = path.dirname(authFile);
  if (!fs.existsSync(authDir)) {
    fs.mkdirSync(authDir, { recursive: true });
  }

  // Go to login page
  await page.goto("/login");

  // Use development login for testing
  const devLoginButton = page.locator('button:has-text("Development Login")');

  if (await devLoginButton.isVisible()) {
    // Dev mode available - use it
    await devLoginButton.click();
    await page.waitForURL("/");
  } else {
    // Production mode - inject test token directly
    await page.evaluate(() => {
      // Generate a test token (in real tests, this would come from the mock OAuth server)
      const testToken = "test-auth-token-for-e2e";
      localStorage.setItem(
        "claudelet-auth",
        JSON.stringify({
          state: { token: testToken },
          version: 0,
        })
      );
    });

    await page.goto("/");
  }

  // Verify we're authenticated
  await expect(page.locator('button:has-text("New Session")')).toBeVisible({
    timeout: 10000,
  });

  // Save authentication state
  await page.context().storageState({ path: authFile });
});
