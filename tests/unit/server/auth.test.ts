import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock database functions
const mockUser = {
  id: "user-123",
  email: "test@example.com",
  name: "Test User",
  picture: "https://example.com/pic.jpg",
  google_id: "google-123",
  created_at: Date.now(),
  last_login_at: null,
};

const mockAuthSession = {
  id: "session-123",
  user_id: "user-123",
  token: "valid-token",
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  created_at: Date.now(),
  user: mockUser,
};

vi.mock("../../../server/src/db/index.js", () => ({
  getAuthSessionByToken: vi.fn((token: string) => {
    if (token === "valid-token") {
      return mockAuthSession;
    }
    return undefined;
  }),
}));

import { extractToken, validateToken } from "../../../server/src/middleware/auth.js";
import { getAuthSessionByToken } from "../../../server/src/db/index.js";

describe("Auth Middleware", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("extractToken", () => {
    it("should extract token from Authorization header", () => {
      const request = {
        headers: {
          authorization: "Bearer my-token-123",
        },
        query: {},
      } as any;

      const token = extractToken(request);
      expect(token).toBe("my-token-123");
    });

    it("should extract token from query parameter", () => {
      const request = {
        headers: {},
        query: { token: "query-token" },
      } as any;

      const token = extractToken(request);
      expect(token).toBe("query-token");
    });

    it("should prefer Authorization header over query parameter", () => {
      const request = {
        headers: {
          authorization: "Bearer header-token",
        },
        query: { token: "query-token" },
      } as any;

      const token = extractToken(request);
      expect(token).toBe("header-token");
    });

    it("should return undefined when no token present", () => {
      const request = {
        headers: {},
        query: {},
      } as any;

      const token = extractToken(request);
      expect(token).toBeUndefined();
    });

    it("should return undefined for non-Bearer Authorization", () => {
      const request = {
        headers: {
          authorization: "Basic some-credentials",
        },
        query: {},
      } as any;

      const token = extractToken(request);
      expect(token).toBeUndefined();
    });
  });

  describe("validateToken", () => {
    it("should return user for valid token", () => {
      const user = validateToken("valid-token");
      expect(user).toBeDefined();
      expect(user?.email).toBe("test@example.com");
      expect(getAuthSessionByToken).toHaveBeenCalledWith("valid-token");
    });

    it("should return undefined for invalid token", () => {
      const user = validateToken("invalid-token");
      expect(user).toBeUndefined();
    });

    it("should return undefined for empty token", () => {
      const user = validateToken("");
      expect(user).toBeUndefined();
    });
  });
});

describe("Auth Middleware Integration", () => {
  describe("authMiddleware", () => {
    it("should call reply with 401 when no token provided", async () => {
      // Dynamic import to get fresh module with mocks
      const { authMiddleware } = await import("../../../server/src/middleware/auth.js");

      const request = {
        headers: {},
        query: {},
      } as any;

      const reply = {
        code: vi.fn().mockReturnThis(),
        send: vi.fn(),
      } as any;

      await authMiddleware(request, reply);

      expect(reply.code).toHaveBeenCalledWith(401);
      expect(reply.send).toHaveBeenCalledWith({ error: "Authentication required" });
    });

    it("should call reply with 401 for invalid token", async () => {
      const { authMiddleware } = await import("../../../server/src/middleware/auth.js");

      const request = {
        headers: {
          authorization: "Bearer invalid-token",
        },
        query: {},
      } as any;

      const reply = {
        code: vi.fn().mockReturnThis(),
        send: vi.fn(),
      } as any;

      await authMiddleware(request, reply);

      expect(reply.code).toHaveBeenCalledWith(401);
      expect(reply.send).toHaveBeenCalledWith({ error: "Invalid or expired token" });
    });

    it("should set user on request for valid token", async () => {
      const { authMiddleware } = await import("../../../server/src/middleware/auth.js");

      const request = {
        headers: {
          authorization: "Bearer valid-token",
        },
        query: {},
        user: undefined,
      } as any;

      const reply = {
        code: vi.fn().mockReturnThis(),
        send: vi.fn(),
      } as any;

      await authMiddleware(request, reply);

      expect(request.user).toBeDefined();
      expect(request.user?.email).toBe("test@example.com");
      expect(reply.code).not.toHaveBeenCalled();
    });
  });
});
