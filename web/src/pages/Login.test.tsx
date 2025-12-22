import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "../__tests__/utils";
import { LoginPage } from "./Login";

// Mock the auth store
const mockNavigate = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

// Mock useAuthStore with different states
const createAuthStoreMock = (overrides = {}) => ({
  isAuthenticated: false,
  isLoading: false,
  token: null,
  user: null,
  ...overrides,
});

let authStoreMock = createAuthStoreMock();

vi.mock("../stores/auth", () => ({
  useAuthStore: () => authStoreMock,
}));

describe("LoginPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authStoreMock = createAuthStoreMock();
    // Reset location mock
    Object.defineProperty(window, "location", {
      value: {
        href: "http://localhost:5173/login",
        origin: "http://localhost:5173",
      },
      writable: true,
    });
  });

  describe("Initial Render", () => {
    it("should render the login page with title", () => {
      render(<LoginPage />);

      expect(screen.getByRole("heading", { name: /claudelet/i })).toBeInTheDocument();
      expect(screen.getByText(/remote self-hosted claude code/i)).toBeInTheDocument();
    });

    it("should render the Google sign-in button", () => {
      render(<LoginPage />);

      const signInButton = screen.getByRole("button", { name: /sign in with google/i });
      expect(signInButton).toBeInTheDocument();
    });

    it("should render the description text", () => {
      render(<LoginPage />);

      expect(screen.getByText(/isolated containers/i)).toBeInTheDocument();
    });
  });

  describe("Google Login", () => {
    it("should redirect to Google OAuth when clicking sign in", () => {
      render(<LoginPage />);

      const signInButton = screen.getByRole("button", { name: /sign in with google/i });
      fireEvent.click(signInButton);

      // Check that location.href was set to the OAuth URL
      expect(window.location.href).toContain("/api/auth/google");
      expect(window.location.href).toContain("redirect_uri");
    });

    it("should include the callback URL in the redirect", () => {
      render(<LoginPage />);

      const signInButton = screen.getByRole("button", { name: /sign in with google/i });
      fireEvent.click(signInButton);

      expect(window.location.href).toContain(encodeURIComponent("/auth/callback"));
    });
  });

  describe("Authenticated User Redirect", () => {
    it("should redirect to home when already authenticated", () => {
      authStoreMock = createAuthStoreMock({
        isAuthenticated: true,
        isLoading: false,
      });

      render(<LoginPage />);

      expect(mockNavigate).toHaveBeenCalledWith("/");
    });

    it("should not redirect when loading", () => {
      authStoreMock = createAuthStoreMock({
        isAuthenticated: false,
        isLoading: true,
      });

      render(<LoginPage />);

      expect(mockNavigate).not.toHaveBeenCalled();
    });

    it("should not redirect when not authenticated", () => {
      authStoreMock = createAuthStoreMock({
        isAuthenticated: false,
        isLoading: false,
      });

      render(<LoginPage />);

      expect(mockNavigate).not.toHaveBeenCalled();
    });
  });

  describe("Accessibility", () => {
    it("should have accessible button", () => {
      render(<LoginPage />);

      const button = screen.getByRole("button", { name: /sign in with google/i });
      expect(button).toBeEnabled();
    });

    it("should have proper heading hierarchy", () => {
      render(<LoginPage />);

      const heading = screen.getByRole("heading", { level: 1 });
      expect(heading).toHaveTextContent(/claudelet/i);
    });
  });
});

describe("Login Error States", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authStoreMock = createAuthStoreMock();
  });

  it("should show login page for unauthenticated user", () => {
    authStoreMock = createAuthStoreMock({
      isAuthenticated: false,
      isLoading: false,
      user: null,
    });

    render(<LoginPage />);

    expect(screen.getByRole("button", { name: /sign in with google/i })).toBeInTheDocument();
  });
});
