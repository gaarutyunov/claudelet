import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, renderHook } from "@testing-library/react";

// Mock the api module
const mockApiGet = vi.fn();
const mockApiPost = vi.fn();

vi.mock("../lib/api", () => ({
  api: {
    get: (...args: unknown[]) => mockApiGet(...args),
    post: (...args: unknown[]) => mockApiPost(...args),
  },
}));

// We need to dynamically import the store after mocking
let useAuthStore: typeof import("./auth").useAuthStore;

describe("Auth Store", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    localStorage.clear();

    // Reset module cache to get fresh store
    vi.resetModules();

    // Re-import the store
    const module = await import("./auth");
    useAuthStore = module.useAuthStore;
  });

  afterEach(() => {
    vi.resetModules();
  });

  describe("Initial State", () => {
    it("should start with null token", () => {
      const { result } = renderHook(() => useAuthStore());

      expect(result.current.token).toBeNull();
    });

    it("should start with null user", () => {
      const { result } = renderHook(() => useAuthStore());

      expect(result.current.user).toBeNull();
    });

    it("should start not authenticated", () => {
      const { result } = renderHook(() => useAuthStore());

      expect(result.current.isAuthenticated).toBe(false);
    });

    it("should start in loading state", () => {
      const { result } = renderHook(() => useAuthStore());

      expect(result.current.isLoading).toBe(true);
    });
  });

  describe("setToken", () => {
    it("should set the token", () => {
      const { result } = renderHook(() => useAuthStore());

      act(() => {
        result.current.setToken("test-token-123");
      });

      expect(result.current.token).toBe("test-token-123");
    });

    it("should set isAuthenticated to true", () => {
      const { result } = renderHook(() => useAuthStore());

      act(() => {
        result.current.setToken("test-token-123");
      });

      expect(result.current.isAuthenticated).toBe(true);
    });
  });

  describe("checkAuth", () => {
    it("should set isLoading to false when no token", async () => {
      const { result } = renderHook(() => useAuthStore());

      await act(async () => {
        await result.current.checkAuth();
      });

      expect(result.current.isLoading).toBe(false);
      expect(result.current.isAuthenticated).toBe(false);
    });

    it("should fetch user when token exists", async () => {
      const mockUser = {
        id: "user-123",
        email: "test@example.com",
        name: "Test User",
        picture: null,
      };

      mockApiGet.mockResolvedValue({ user: mockUser });

      const { result } = renderHook(() => useAuthStore());

      // Set token first
      act(() => {
        result.current.setToken("valid-token");
      });

      await act(async () => {
        await result.current.checkAuth();
      });

      expect(mockApiGet).toHaveBeenCalledWith("/api/auth/me");
      expect(result.current.user).toEqual(mockUser);
      expect(result.current.isAuthenticated).toBe(true);
      expect(result.current.isLoading).toBe(false);
    });

    it("should clear state when API call fails", async () => {
      mockApiGet.mockRejectedValue(new Error("Unauthorized"));

      const { result } = renderHook(() => useAuthStore());

      // Set token first
      act(() => {
        result.current.setToken("invalid-token");
      });

      await act(async () => {
        await result.current.checkAuth();
      });

      expect(result.current.token).toBeNull();
      expect(result.current.user).toBeNull();
      expect(result.current.isAuthenticated).toBe(false);
      expect(result.current.isLoading).toBe(false);
    });
  });

  describe("logout", () => {
    it("should call logout API when token exists", async () => {
      mockApiPost.mockResolvedValue({});

      const { result } = renderHook(() => useAuthStore());

      // Set token first
      act(() => {
        result.current.setToken("valid-token");
      });

      await act(async () => {
        await result.current.logout();
      });

      expect(mockApiPost).toHaveBeenCalledWith("/api/auth/logout");
    });

    it("should clear all auth state", async () => {
      mockApiPost.mockResolvedValue({});

      const { result } = renderHook(() => useAuthStore());

      // Set up authenticated state
      act(() => {
        result.current.setToken("valid-token");
      });

      await act(async () => {
        await result.current.logout();
      });

      expect(result.current.token).toBeNull();
      expect(result.current.user).toBeNull();
      expect(result.current.isAuthenticated).toBe(false);
    });

    it("should clear state even if API call fails", async () => {
      mockApiPost.mockRejectedValue(new Error("Network error"));

      const { result } = renderHook(() => useAuthStore());

      // Set token first
      act(() => {
        result.current.setToken("valid-token");
      });

      await act(async () => {
        await result.current.logout();
      });

      expect(result.current.token).toBeNull();
      expect(result.current.isAuthenticated).toBe(false);
    });

    it("should not call API when no token", async () => {
      const { result } = renderHook(() => useAuthStore());

      await act(async () => {
        await result.current.logout();
      });

      expect(mockApiPost).not.toHaveBeenCalled();
    });
  });

  describe("Persistence", () => {
    it("should persist token to localStorage", () => {
      const { result } = renderHook(() => useAuthStore());

      act(() => {
        result.current.setToken("persist-token");
      });

      const stored = localStorage.getItem("claudelet-auth");
      expect(stored).toBeTruthy();
      const parsed = JSON.parse(stored!);
      expect(parsed.state.token).toBe("persist-token");
    });
  });
});

describe("Auth Store - Login Error Scenarios", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    localStorage.clear();
    vi.resetModules();
    const module = await import("./auth");
    useAuthStore = module.useAuthStore;
  });

  it("should handle expired token gracefully", async () => {
    mockApiGet.mockRejectedValue({ status: 401, message: "Token expired" });

    const { result } = renderHook(() => useAuthStore());

    act(() => {
      result.current.setToken("expired-token");
    });

    await act(async () => {
      await result.current.checkAuth();
    });

    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.token).toBeNull();
  });

  it("should handle user not allowed error", async () => {
    mockApiGet.mockRejectedValue({
      status: 403,
      message: "User not in allowed list",
    });

    const { result } = renderHook(() => useAuthStore());

    act(() => {
      result.current.setToken("forbidden-token");
    });

    await act(async () => {
      await result.current.checkAuth();
    });

    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.user).toBeNull();
  });

  it("should handle network errors", async () => {
    mockApiGet.mockRejectedValue(new Error("Network error"));

    const { result } = renderHook(() => useAuthStore());

    act(() => {
      result.current.setToken("some-token");
    });

    await act(async () => {
      await result.current.checkAuth();
    });

    // Should clear auth state on network error to be safe
    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.isLoading).toBe(false);
  });
});
