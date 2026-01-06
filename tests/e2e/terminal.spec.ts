import { test, expect, TerminalPage } from "./fixtures";

test.describe("Terminal", () => {
  test("should display terminal after creating session", async ({ page, dashboardPage }) => {
    await dashboardPage.goto();
    await dashboardPage.waitForLoad();

    // Create new session
    await dashboardPage.newSessionButton.click();
    await page.waitForURL(/\/session\//);

    // Terminal should be visible
    const terminal = page.locator(".xterm");
    await expect(terminal).toBeVisible();
  });

  test("should connect via WebSocket and show connection status", async ({ page, terminalPage }) => {
    await terminalPage.goto();
    await terminalPage.waitForReady();

    // Should show connected status
    await expect(page.locator("text=connected")).toBeVisible({ timeout: 10000 });
  });

  test("should accept keyboard input", async ({ page, terminalPage }) => {
    await terminalPage.goto();
    await terminalPage.waitForReady();
    await terminalPage.waitForConnection();

    // Type a command
    await terminalPage.type("echo hello");

    // The input should be reflected in the terminal buffer
    const content = await terminalPage.getBufferContent();
    expect(content).toContain("echo hello");
  });

  test("should execute commands and display output", async ({ page, terminalPage }) => {
    await terminalPage.goto();
    await terminalPage.waitForReady();
    await terminalPage.waitForConnection();

    // Send a simple command
    await terminalPage.sendCommand('echo "test output"');

    // Wait for output
    await terminalPage.waitForOutput("test output", 5000);
  });

  test("should handle terminal resize", async ({ page, terminalPage }) => {
    await terminalPage.goto();
    await terminalPage.waitForReady();

    // Resize viewport
    await page.setViewportSize({ width: 1200, height: 800 });
    await page.waitForTimeout(500);

    // Terminal should still be functional
    await terminalPage.type("test");
    const content = await terminalPage.getBufferContent();
    expect(content).toContain("test");
  });

  test("should persist session across page reload", async ({ page, terminalPage }) => {
    await terminalPage.goto();
    await terminalPage.waitForReady();
    await terminalPage.waitForConnection();

    // Get current URL (session ID)
    const sessionUrl = page.url();

    // Send a command
    await terminalPage.sendCommand("echo session-test");
    await terminalPage.waitForOutput("session-test");

    // Reload page
    await page.reload();
    await terminalPage.waitForReady();

    // Should reconnect to the same session
    expect(page.url()).toBe(sessionUrl);
  });

  test("should navigate back to dashboard", async ({ page, terminalPage }) => {
    await terminalPage.goto();
    await terminalPage.waitForReady();

    // Click back button
    await page.click('button[aria-label="Back"], a[href="/"]');
    await page.waitForURL("/");

    // Should be on dashboard
    await expect(page.locator('button:has-text("New Session")')).toBeVisible();
  });
});

test.describe("Terminal WebSocket", () => {
  test("should handle WebSocket disconnection gracefully", async ({ page, terminalPage }) => {
    await terminalPage.goto();
    await terminalPage.waitForReady();
    await terminalPage.waitForConnection();

    // Simulate WebSocket close by going offline
    await page.context().setOffline(true);
    await page.waitForTimeout(1000);

    // Should show disconnected status
    await expect(page.locator("text=disconnected")).toBeVisible({ timeout: 5000 });

    // Reconnect
    await page.context().setOffline(false);

    // Should attempt to reconnect
    await expect(page.locator("text=connected")).toBeVisible({ timeout: 15000 });
  });

  test("should mock WebSocket terminal responses", async ({ page }) => {
    // Set up WebSocket route interception
    await page.routeWebSocket(/\/api\/terminal\/.*\/ws/, (ws) => {
      ws.onMessage((message) => {
        try {
          const data = JSON.parse(message.toString());
          if (data.type === "input") {
            // Echo the input back as output
            ws.send(
              JSON.stringify({
                type: "output",
                data: `Mocked: ${data.data}`,
              })
            );
          }
        } catch {
          // Ignore parse errors
        }
      });

      // Send initial connection message
      ws.send(JSON.stringify({ type: "connected", sessionId: "mock-session" }));
    });

    await page.goto("/session/mock-session");
    await page.waitForSelector(".xterm-screen");

    // Type something
    await page.keyboard.type("test");

    // Should see mocked response
    const content = await page.evaluate(() => {
      const term = (window as any).term;
      if (!term) return "";
      const buffer = term.buffer.active;
      const lines: string[] = [];
      for (let i = 0; i < buffer.length; i++) {
        const line = buffer.getLine(i);
        if (line) lines.push(line.translateToString(true));
      }
      return lines.join("\n");
    });

    expect(content).toContain("Mocked");
  });
});
