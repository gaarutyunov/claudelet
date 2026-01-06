import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import os from "os";

// Mock the config before importing db functions
const testDbPath = path.join(os.tmpdir(), `claudelet-test-${Date.now()}.db`);

vi.mock("../../../server/src/config.js", () => ({
  config: {
    dbPath: testDbPath,
    workdir: os.tmpdir(),
  },
}));

vi.mock("../../../server/src/utils/logger.js", () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

// Import after mocks
import {
  initDatabase,
  getDb,
  createUser,
  getUserById,
  getUserByEmail,
  createAuthSession,
  getAuthSessionByToken,
  deleteAuthSession,
  createTerminalSession,
  getTerminalSession,
  getUserTerminalSessions,
  updateTerminalSession,
  deleteTerminalSession,
  saveOAuthState,
  getOAuthState,
  logUsage,
  getUserUsage,
} from "../../../server/src/db/index.js";

describe("Database Operations", () => {
  beforeEach(async () => {
    // Clean up any existing test database
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
    // Initialize fresh database
    await initDatabase();
  });

  afterEach(() => {
    // Clean up test database
    try {
      const db = getDb();
      db.close();
    } catch {
      // Ignore if not initialized
    }
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  });

  describe("getDb", () => {
    it("should return the database instance after initialization", () => {
      const db = getDb();
      expect(db).toBeDefined();
      expect(db).toBeInstanceOf(Database);
    });
  });

  describe("User Operations", () => {
    it("should create a new user", () => {
      const user = createUser({
        id: "user-123",
        email: "test@example.com",
        name: "Test User",
        picture: "https://example.com/pic.jpg",
        google_id: "google-123",
      });

      expect(user).toBeDefined();
      expect(user.id).toBe("user-123");
      expect(user.email).toBe("test@example.com");
      expect(user.name).toBe("Test User");
      expect(user.created_at).toBeDefined();
    });

    it("should get user by ID", () => {
      createUser({
        id: "user-456",
        email: "user456@example.com",
        name: "User 456",
        picture: null,
        google_id: "google-456",
      });

      const user = getUserById("user-456");
      expect(user).toBeDefined();
      expect(user?.email).toBe("user456@example.com");
    });

    it("should return undefined for non-existent user", () => {
      const user = getUserById("non-existent");
      expect(user).toBeUndefined();
    });

    it("should get user by email", () => {
      createUser({
        id: "user-789",
        email: "findme@example.com",
        name: "Find Me",
        picture: null,
        google_id: "google-789",
      });

      const user = getUserByEmail("findme@example.com");
      expect(user).toBeDefined();
      expect(user?.id).toBe("user-789");
    });

    it("should enforce unique email constraint", () => {
      createUser({
        id: "user-1",
        email: "duplicate@example.com",
        name: "First",
        picture: null,
        google_id: "google-1",
      });

      expect(() => {
        createUser({
          id: "user-2",
          email: "duplicate@example.com",
          name: "Second",
          picture: null,
          google_id: "google-2",
        });
      }).toThrow();
    });
  });

  describe("Auth Session Operations", () => {
    const testUser = {
      id: "auth-user-1",
      email: "auth@example.com",
      name: "Auth User",
      picture: null,
      google_id: "google-auth-1",
    };

    beforeEach(() => {
      createUser(testUser);
    });

    it("should create an auth session", () => {
      createAuthSession({
        id: "session-1",
        user_id: testUser.id,
        token: "test-token-123",
        expires_at: Math.floor(Date.now() / 1000) + 3600,
      });

      const session = getAuthSessionByToken("test-token-123");
      expect(session).toBeDefined();
      expect(session?.token).toBe("test-token-123");
      expect(session?.user.email).toBe("auth@example.com");
    });

    it("should return undefined for expired session", () => {
      createAuthSession({
        id: "session-expired",
        user_id: testUser.id,
        token: "expired-token",
        expires_at: Math.floor(Date.now() / 1000) - 3600, // 1 hour ago
      });

      const session = getAuthSessionByToken("expired-token");
      expect(session).toBeUndefined();
    });

    it("should delete auth session", () => {
      createAuthSession({
        id: "session-delete",
        user_id: testUser.id,
        token: "delete-me-token",
        expires_at: Math.floor(Date.now() / 1000) + 3600,
      });

      deleteAuthSession("delete-me-token");
      const session = getAuthSessionByToken("delete-me-token");
      expect(session).toBeUndefined();
    });

    it("should return undefined for invalid token", () => {
      const session = getAuthSessionByToken("invalid-token");
      expect(session).toBeUndefined();
    });
  });

  describe("Terminal Session Operations", () => {
    const testUser = {
      id: "terminal-user-1",
      email: "terminal@example.com",
      name: "Terminal User",
      picture: null,
      google_id: "google-terminal-1",
    };

    beforeEach(() => {
      createUser(testUser);
    });

    it("should create a terminal session", () => {
      const session = createTerminalSession({
        id: "term-session-1",
        user_id: testUser.id,
        workspace_id: null,
        container_id: "container-123",
        workspace_path: "/workspace/project",
        project_name: "My Project",
      });

      expect(session).toBeDefined();
      expect(session.id).toBe("term-session-1");
      expect(session.project_name).toBe("My Project");
      expect(session.status).toBe("created");
    });

    it("should get terminal session by ID", () => {
      createTerminalSession({
        id: "term-session-get",
        user_id: testUser.id,
        workspace_id: null,
        container_id: null,
        workspace_path: "/workspace",
        project_name: null,
      });

      const session = getTerminalSession("term-session-get");
      expect(session).toBeDefined();
      expect(session?.user_id).toBe(testUser.id);
    });

    it("should get all user terminal sessions", () => {
      createTerminalSession({
        id: "term-1",
        user_id: testUser.id,
        workspace_id: null,
        container_id: null,
        workspace_path: "/workspace/1",
        project_name: "Project 1",
      });

      createTerminalSession({
        id: "term-2",
        user_id: testUser.id,
        workspace_id: null,
        container_id: null,
        workspace_path: "/workspace/2",
        project_name: "Project 2",
      });

      const sessions = getUserTerminalSessions(testUser.id);
      expect(sessions).toHaveLength(2);
    });

    it("should update terminal session", () => {
      createTerminalSession({
        id: "term-update",
        user_id: testUser.id,
        workspace_id: null,
        container_id: null,
        workspace_path: "/workspace",
        project_name: "Original",
      });

      updateTerminalSession("term-update", {
        status: "running",
        project_name: "Updated",
      });

      const session = getTerminalSession("term-update");
      expect(session?.status).toBe("running");
      expect(session?.project_name).toBe("Updated");
    });

    it("should delete terminal session", () => {
      createTerminalSession({
        id: "term-delete",
        user_id: testUser.id,
        workspace_id: null,
        container_id: null,
        workspace_path: "/workspace",
        project_name: null,
      });

      deleteTerminalSession("term-delete");
      const session = getTerminalSession("term-delete");
      expect(session).toBeUndefined();
    });
  });

  describe("OAuth State Operations", () => {
    it("should save and retrieve OAuth state", () => {
      saveOAuthState("state-123", "verifier-abc", "https://example.com/callback");

      const state = getOAuthState("state-123");
      expect(state).toBeDefined();
      expect(state?.code_verifier).toBe("verifier-abc");
      expect(state?.redirect_uri).toBe("https://example.com/callback");
    });

    it("should delete OAuth state after retrieval (one-time use)", () => {
      saveOAuthState("state-once", "verifier-once", null);

      const first = getOAuthState("state-once");
      expect(first).toBeDefined();

      const second = getOAuthState("state-once");
      expect(second).toBeUndefined();
    });
  });

  describe("Usage Tracking", () => {
    const testUser = {
      id: "usage-user-1",
      email: "usage@example.com",
      name: "Usage User",
      picture: null,
      google_id: "google-usage-1",
    };

    beforeEach(() => {
      createUser(testUser);
    });

    it("should log usage", () => {
      logUsage(testUser.id, null, 100, 50, 0.005);

      const usage = getUserUsage(testUser.id);
      expect(usage.tokens_input).toBe(100);
      expect(usage.tokens_output).toBe(50);
      expect(usage.cost_usd).toBe(0.005);
    });

    it("should aggregate usage", () => {
      logUsage(testUser.id, null, 100, 50, 0.005);
      logUsage(testUser.id, null, 200, 100, 0.010);

      const usage = getUserUsage(testUser.id);
      expect(usage.tokens_input).toBe(300);
      expect(usage.tokens_output).toBe(150);
      expect(usage.cost_usd).toBeCloseTo(0.015);
    });

    it("should return zero for user with no usage", () => {
      const usage = getUserUsage("no-usage-user");
      expect(usage.tokens_input).toBe(0);
      expect(usage.tokens_output).toBe(0);
      expect(usage.cost_usd).toBe(0);
    });
  });
});
