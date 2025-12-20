import { test as base, expect, Page } from "@playwright/test";

// Page Object for Terminal
export class TerminalPage {
  constructor(private page: Page) {}

  async goto(sessionId?: string) {
    if (sessionId) {
      await this.page.goto(`/session/${sessionId}`);
    } else {
      // Create new session first
      await this.page.goto("/");
      await this.page.click('button:has-text("New Session")');
      await this.page.waitForURL(/\/session\//);
    }
  }

  async waitForReady() {
    await this.page.waitForSelector(".xterm-screen", { state: "visible" });
    await this.page.waitForTimeout(500); // Allow terminal to initialize
  }

  async waitForConnection() {
    await expect(this.page.locator("text=connected")).toBeVisible({ timeout: 10000 });
  }

  get terminal() {
    return this.page.locator(".xterm");
  }

  get screen() {
    return this.page.locator(".xterm-screen");
  }

  async type(text: string, options?: { delay?: number }) {
    await this.screen.focus();
    await this.page.keyboard.type(text, { delay: options?.delay ?? 50 });
  }

  async pressEnter() {
    await this.page.keyboard.press("Enter");
  }

  async sendCommand(command: string) {
    await this.type(command);
    await this.pressEnter();
  }

  async getBufferContent(): Promise<string> {
    return this.page.evaluate(() => {
      const term = (window as any).term;
      if (!term) return "";

      const buffer = term.buffer.active;
      const lines: string[] = [];
      for (let i = 0; i < buffer.length; i++) {
        const line = buffer.getLine(i);
        if (line) {
          lines.push(line.translateToString(true));
        }
      }
      return lines.join("\n");
    });
  }

  async waitForOutput(text: string, timeout = 10000) {
    const startTime = Date.now();
    while (Date.now() - startTime < timeout) {
      const content = await this.getBufferContent();
      if (content.includes(text)) {
        return content;
      }
      await this.page.waitForTimeout(100);
    }
    throw new Error(`Timeout waiting for output: "${text}"`);
  }

  async clearTerminal() {
    await this.sendCommand("clear");
    await this.page.waitForTimeout(200);
  }
}

// Page Object for Dashboard
export class DashboardPage {
  constructor(private page: Page) {}

  async goto() {
    await this.page.goto("/");
  }

  async waitForLoad() {
    await this.page.waitForSelector('button:has-text("New Session")', { state: "visible" });
  }

  get newSessionButton() {
    return this.page.locator('button:has-text("New Session")');
  }

  get sessionList() {
    return this.page.locator('[class*="card"]').filter({ hasText: /Session/ });
  }

  async createSession(name?: string) {
    await this.newSessionButton.click();
    await this.page.waitForURL(/\/session\//);
    return this.page.url().split("/session/")[1];
  }

  async openSession(sessionId: string) {
    await this.page.click(`[href="/session/${sessionId}"]`);
    await this.page.waitForURL(`/session/${sessionId}`);
  }

  async deleteSession(sessionId: string) {
    const sessionCard = this.page.locator(`[data-session-id="${sessionId}"]`);
    await sessionCard.locator('button:has-text("Delete")').click();
    await this.page.click('button:has-text("Confirm")');
  }

  async getSessionCount(): Promise<number> {
    return this.sessionList.count();
  }
}

// Page Object for Login
export class LoginPage {
  constructor(private page: Page) {}

  async goto() {
    await this.page.goto("/login");
  }

  get googleLoginButton() {
    return this.page.locator('button:has-text("Sign in with Google")');
  }

  get devLoginButton() {
    return this.page.locator('button:has-text("Development Login")');
  }

  async loginWithGoogle() {
    await this.googleLoginButton.click();
    // OAuth flow will be mocked
  }

  async loginWithDevMode() {
    await this.devLoginButton.click();
    await this.page.waitForURL("/");
  }
}

// Extended test fixture with page objects
export const test = base.extend<{
  terminalPage: TerminalPage;
  dashboardPage: DashboardPage;
  loginPage: LoginPage;
}>({
  terminalPage: async ({ page }, use) => {
    const terminalPage = new TerminalPage(page);
    await use(terminalPage);
  },

  dashboardPage: async ({ page }, use) => {
    const dashboardPage = new DashboardPage(page);
    await use(dashboardPage);
  },

  loginPage: async ({ page }, use) => {
    const loginPage = new LoginPage(page);
    await use(loginPage);
  },
});

export { expect } from "@playwright/test";
