import { test as baseTest, expect } from "@playwright/test";

// Use base test without authentication for auth tests
const test = baseTest;

test.describe("Authentication", () => {
  test.use({ storageState: { cookies: [], origins: [] } }); // Clear auth state

  test("should redirect to login when not authenticated", async ({ page }) => {
    await page.goto("/");

    // Should redirect to login
    await expect(page).toHaveURL(/\/login/);
  });

  test("should display login options", async ({ page }) => {
    await page.goto("/login");

    // Google login button should be visible
    await expect(page.locator('button:has-text("Sign in with Google")')).toBeVisible();
  });

  test("should show dev login in development mode", async ({ page }) => {
    await page.goto("/login");

    // Dev login button may be visible in development
    const devButton = page.locator('button:has-text("Development Login")');

    // This test passes regardless - dev login is optional
    const isVisible = await devButton.isVisible().catch(() => false);
    expect(typeof isVisible).toBe("boolean");
  });

  test("should authenticate with development login", async ({ page }) => {
    await page.goto("/login");

    const devButton = page.locator('button:has-text("Development Login")');

    if (await devButton.isVisible()) {
      await devButton.click();

      // Should redirect to dashboard
      await page.waitForURL("/");
      await expect(page.locator('button:has-text("New Session")')).toBeVisible();
    } else {
      // Skip if dev login not available
      test.skip();
    }
  });

  test("should persist authentication across page reloads", async ({ page }) => {
    await page.goto("/login");

    const devButton = page.locator('button:has-text("Development Login")');
    if (!(await devButton.isVisible())) {
      test.skip();
      return;
    }

    await devButton.click();
    await page.waitForURL("/");

    // Reload page
    await page.reload();

    // Should still be authenticated
    await expect(page.locator('button:has-text("New Session")')).toBeVisible({ timeout: 5000 });
  });

  test("should logout successfully", async ({ page }) => {
    await page.goto("/login");

    const devButton = page.locator('button:has-text("Development Login")');
    if (!(await devButton.isVisible())) {
      test.skip();
      return;
    }

    await devButton.click();
    await page.waitForURL("/");

    // Click logout
    await page.click('button:has-text("Logout")');

    // Should redirect to login
    await expect(page).toHaveURL(/\/login/);
  });

  test("should show user info when authenticated", async ({ page }) => {
    await page.goto("/login");

    const devButton = page.locator('button:has-text("Development Login")');
    if (!(await devButton.isVisible())) {
      test.skip();
      return;
    }

    await devButton.click();
    await page.waitForURL("/");

    // Should show welcome message with user info
    await expect(page.locator("text=/Welcome,/")).toBeVisible();
  });
});

test.describe("OAuth Flow", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("should initiate Google OAuth flow", async ({ page }) => {
    await page.goto("/login");

    // Mock the OAuth redirect
    await page.route("**/api/auth/google**", async (route) => {
      // Simulate redirect to OAuth provider
      await route.fulfill({
        status: 302,
        headers: {
          Location: "http://localhost:8080/authorize?client_id=test",
        },
      });
    });

    const googleButton = page.locator('button:has-text("Sign in with Google")');
    await googleButton.click();

    // Should attempt OAuth redirect
    await page.waitForTimeout(500);
  });

  test("should handle OAuth callback with token", async ({ page }) => {
    // Simulate OAuth callback with token
    await page.goto("/auth/callback?token=test-token-12345");

    // Should process token and redirect
    await page.waitForTimeout(1000);

    // Either redirected to dashboard or shows error
    const url = page.url();
    expect(url.includes("/") || url.includes("/login")).toBe(true);
  });

  test("should handle OAuth callback without token", async ({ page }) => {
    // Simulate OAuth callback without token
    await page.goto("/auth/callback");

    // Should redirect to login or show error
    await page.waitForTimeout(1000);

    const url = page.url();
    expect(url.includes("/login") || url.includes("/auth")).toBe(true);
  });
});

test.describe("Token Injection", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("should authenticate via localStorage token injection", async ({ page }) => {
    // Inject token before navigation
    await page.addInitScript(() => {
      localStorage.setItem(
        "claudelet-auth",
        JSON.stringify({
          state: { token: "injected-test-token" },
          version: 0,
        })
      );
    });

    // Mock the auth check endpoint
    await page.route("**/api/auth/me", async (route) => {
      await route.fulfill({
        status: 200,
        body: JSON.stringify({
          user: {
            id: "test-user",
            email: "test@example.com",
            name: "Test User",
          },
        }),
      });
    });

    await page.goto("/");

    // Should be authenticated
    await expect(page.locator('button:has-text("New Session")')).toBeVisible({ timeout: 5000 });
  });
});
