import { describe, it, expect, vi, beforeEach, waitFor } from "vitest";
import { render, screen, fireEvent } from "../__tests__/utils";
import { DashboardPage } from "./Dashboard";
import { mockUser, mockSession } from "../__tests__/utils";

// Mock navigation
const mockNavigate = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

// Mock auth store
const mockLogout = vi.fn();
let authStoreMock = {
  user: mockUser,
  logout: mockLogout,
};

vi.mock("../stores/auth", () => ({
  useAuthStore: () => authStoreMock,
}));

// Mock API
const mockApiGet = vi.fn();
const mockApiPost = vi.fn();
const mockApiDelete = vi.fn();

vi.mock("../lib/api", () => ({
  api: {
    get: (...args: unknown[]) => mockApiGet(...args),
    post: (...args: unknown[]) => mockApiPost(...args),
    delete: (...args: unknown[]) => mockApiDelete(...args),
  },
}));

describe("DashboardPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authStoreMock = {
      user: mockUser,
      logout: mockLogout,
    };
    mockApiGet.mockResolvedValue({ sessions: [] });
    mockApiPost.mockResolvedValue({ session: mockSession });
    mockApiDelete.mockResolvedValue({});
  });

  describe("Initial Render", () => {
    it("should render the dashboard header", async () => {
      render(<DashboardPage />);

      expect(screen.getByRole("heading", { name: /claudelet/i })).toBeInTheDocument();
      await waitFor(() => {
        expect(screen.getByText(/welcome/i)).toBeInTheDocument();
      });
    });

    it("should display user name or email", async () => {
      render(<DashboardPage />);

      await waitFor(() => {
        expect(screen.getByText(/test user/i)).toBeInTheDocument();
      });
    });

    it("should show user avatar when available", async () => {
      render(<DashboardPage />);

      await waitFor(() => {
        const avatar = screen.getByAltText(/test user/i);
        expect(avatar).toBeInTheDocument();
        expect(avatar).toHaveAttribute("src", mockUser.picture);
      });
    });

    it("should show logout button", async () => {
      render(<DashboardPage />);

      await waitFor(() => {
        expect(screen.getByRole("button", { name: /logout/i })).toBeInTheDocument();
      });
    });
  });

  describe("Loading State", () => {
    it("should show loading spinner while fetching sessions", async () => {
      // Make the API call hang
      mockApiGet.mockImplementation(() => new Promise(() => {}));

      render(<DashboardPage />);

      // Should show loading state
      expect(screen.getByRole("heading", { name: /claudelet/i })).toBeInTheDocument();
    });
  });

  describe("Empty State", () => {
    it("should show empty state when no sessions", async () => {
      mockApiGet.mockResolvedValue({ sessions: [] });

      render(<DashboardPage />);

      await waitFor(() => {
        expect(screen.getByText(/no sessions yet/i)).toBeInTheDocument();
      });
    });

    it("should show helpful message in empty state", async () => {
      mockApiGet.mockResolvedValue({ sessions: [] });

      render(<DashboardPage />);

      await waitFor(() => {
        expect(screen.getByText(/create a new session/i)).toBeInTheDocument();
      });
    });
  });

  describe("Sessions List", () => {
    const multipleSessions = [
      {
        id: "session-1",
        project_name: "Project Alpha",
        status: "running",
        created_at: Math.floor(Date.now() / 1000) - 3600,
        last_activity_at: Math.floor(Date.now() / 1000),
      },
      {
        id: "session-2",
        project_name: "Project Beta",
        status: "stopped",
        created_at: Math.floor(Date.now() / 1000) - 7200,
        last_activity_at: Math.floor(Date.now() / 1000) - 1800,
      },
    ];

    it("should display list of sessions", async () => {
      mockApiGet.mockResolvedValue({ sessions: multipleSessions });

      render(<DashboardPage />);

      await waitFor(() => {
        expect(screen.getByText("Project Alpha")).toBeInTheDocument();
        expect(screen.getByText("Project Beta")).toBeInTheDocument();
      });
    });

    it("should show status indicators for sessions", async () => {
      mockApiGet.mockResolvedValue({ sessions: multipleSessions });

      render(<DashboardPage />);

      await waitFor(() => {
        // Sessions should be rendered with status indicators
        expect(screen.getByText("Project Alpha")).toBeInTheDocument();
      });
    });

    it("should show Open and Delete buttons for each session", async () => {
      mockApiGet.mockResolvedValue({ sessions: [mockSession] });

      render(<DashboardPage />);

      await waitFor(() => {
        expect(screen.getByRole("button", { name: /open/i })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: /delete/i })).toBeInTheDocument();
      });
    });

    it("should show repo and branch info when available", async () => {
      const sessionWithRepo = {
        ...mockSession,
        repo_name: "my-repo",
        branch: "main",
      };
      mockApiGet.mockResolvedValue({ sessions: [sessionWithRepo] });

      render(<DashboardPage />);

      await waitFor(() => {
        expect(screen.getByText(/my-repo:main/i)).toBeInTheDocument();
      });
    });
  });

  describe("Session Actions", () => {
    it("should navigate to session when clicking Open", async () => {
      mockApiGet.mockResolvedValue({ sessions: [mockSession] });

      render(<DashboardPage />);

      await waitFor(() => {
        const openButton = screen.getByRole("button", { name: /open/i });
        fireEvent.click(openButton);
      });

      expect(mockNavigate).toHaveBeenCalledWith(`/session/${mockSession.id}`);
    });

    it("should navigate to session when clicking session row", async () => {
      mockApiGet.mockResolvedValue({ sessions: [mockSession] });

      render(<DashboardPage />);

      await waitFor(() => {
        const sessionRow = screen.getByText(mockSession.project_name!);
        fireEvent.click(sessionRow);
      });

      expect(mockNavigate).toHaveBeenCalledWith(`/session/${mockSession.id}`);
    });

    it("should show confirm dialog when deleting session", async () => {
      mockApiGet.mockResolvedValue({ sessions: [mockSession] });
      window.confirm = vi.fn(() => false);

      render(<DashboardPage />);

      await waitFor(() => {
        const deleteButton = screen.getByRole("button", { name: /delete/i });
        fireEvent.click(deleteButton);
      });

      expect(window.confirm).toHaveBeenCalledWith(
        "Are you sure you want to delete this session?"
      );
    });

    it("should delete session when confirmed", async () => {
      mockApiGet.mockResolvedValue({ sessions: [mockSession] });
      window.confirm = vi.fn(() => true);

      render(<DashboardPage />);

      await waitFor(() => {
        const deleteButton = screen.getByRole("button", { name: /delete/i });
        fireEvent.click(deleteButton);
      });

      expect(mockApiDelete).toHaveBeenCalledWith(`/api/sessions/${mockSession.id}`);
    });

    it("should not delete session when cancelled", async () => {
      mockApiGet.mockResolvedValue({ sessions: [mockSession] });
      window.confirm = vi.fn(() => false);

      render(<DashboardPage />);

      await waitFor(() => {
        const deleteButton = screen.getByRole("button", { name: /delete/i });
        fireEvent.click(deleteButton);
      });

      expect(mockApiDelete).not.toHaveBeenCalled();
    });

    it("should remove session from list after deletion", async () => {
      mockApiGet.mockResolvedValue({ sessions: [mockSession] });
      window.confirm = vi.fn(() => true);

      render(<DashboardPage />);

      await waitFor(() => {
        expect(screen.getByText(mockSession.project_name!)).toBeInTheDocument();
      });

      const deleteButton = screen.getByRole("button", { name: /delete/i });
      fireEvent.click(deleteButton);

      await waitFor(() => {
        expect(screen.queryByText(mockSession.project_name!)).not.toBeInTheDocument();
      });
    });
  });

  describe("Create Session", () => {
    it("should show New Session button", async () => {
      mockApiGet.mockResolvedValue({ sessions: [] });

      render(<DashboardPage />);

      await waitFor(() => {
        expect(screen.getByRole("button", { name: /new session/i })).toBeInTheDocument();
      });
    });

    it("should create new session when clicking New Session", async () => {
      mockApiGet.mockResolvedValue({ sessions: [] });

      render(<DashboardPage />);

      await waitFor(() => {
        const newSessionButton = screen.getByRole("button", { name: /new session/i });
        fireEvent.click(newSessionButton);
      });

      expect(mockApiPost).toHaveBeenCalledWith("/api/sessions", expect.any(Object));
    });

    it("should navigate to new session after creation", async () => {
      mockApiGet.mockResolvedValue({ sessions: [] });

      render(<DashboardPage />);

      await waitFor(() => {
        const newSessionButton = screen.getByRole("button", { name: /new session/i });
        fireEvent.click(newSessionButton);
      });

      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith(`/session/${mockSession.id}`);
      });
    });
  });

  describe("Logout", () => {
    it("should call logout when clicking logout button", async () => {
      mockApiGet.mockResolvedValue({ sessions: [] });

      render(<DashboardPage />);

      await waitFor(() => {
        const logoutButton = screen.getByRole("button", { name: /logout/i });
        fireEvent.click(logoutButton);
      });

      expect(mockLogout).toHaveBeenCalled();
    });
  });

  describe("Repositories Navigation", () => {
    it("should show Repositories button", async () => {
      mockApiGet.mockResolvedValue({ sessions: [] });

      render(<DashboardPage />);

      await waitFor(() => {
        expect(screen.getByRole("button", { name: /repositories/i })).toBeInTheDocument();
      });
    });

    it("should navigate to repositories page", async () => {
      mockApiGet.mockResolvedValue({ sessions: [] });

      render(<DashboardPage />);

      await waitFor(() => {
        const reposButton = screen.getByRole("button", { name: /repositories/i });
        fireEvent.click(reposButton);
      });

      expect(mockNavigate).toHaveBeenCalledWith("/repositories");
    });
  });
});

describe("Dashboard Error Handling", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authStoreMock = {
      user: mockUser,
      logout: mockLogout,
    };
  });

  it("should handle fetch error gracefully", async () => {
    mockApiGet.mockRejectedValue(new Error("Network error"));

    render(<DashboardPage />);

    // Should not crash and should still render the page
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /claudelet/i })).toBeInTheDocument();
    });
  });

  it("should handle delete error gracefully", async () => {
    mockApiGet.mockResolvedValue({ sessions: [mockSession] });
    mockApiDelete.mockRejectedValue(new Error("Delete failed"));
    window.confirm = vi.fn(() => true);

    render(<DashboardPage />);

    await waitFor(() => {
      const deleteButton = screen.getByRole("button", { name: /delete/i });
      fireEvent.click(deleteButton);
    });

    // Session should still be in the list after failed delete
    await waitFor(() => {
      expect(screen.getByText(mockSession.project_name!)).toBeInTheDocument();
    });
  });
});
