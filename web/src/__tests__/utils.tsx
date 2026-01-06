import React from "react";
import { render, RenderOptions } from "@testing-library/react";
import { BrowserRouter } from "react-router-dom";

// Custom render that wraps components with necessary providers
interface WrapperProps {
  children: React.ReactNode;
}

function AllProviders({ children }: WrapperProps) {
  return <BrowserRouter>{children}</BrowserRouter>;
}

const customRender = (
  ui: React.ReactElement,
  options?: Omit<RenderOptions, "wrapper">
) => render(ui, { wrapper: AllProviders, ...options });

// Re-export everything
export * from "@testing-library/react";
export { customRender as render };

// Mock API responses helper
export function mockFetch(responses: Record<string, unknown>) {
  (global.fetch as ReturnType<typeof vi.fn>).mockImplementation(
    async (url: string, options?: RequestInit) => {
      const method = options?.method || "GET";
      const key = `${method}:${url}`;

      // Check for exact match first
      if (responses[key]) {
        return {
          ok: true,
          json: async () => responses[key],
        };
      }

      // Check for URL pattern match
      for (const pattern of Object.keys(responses)) {
        if (url.includes(pattern.replace(/^(GET|POST|DELETE|PUT|PATCH):/, ""))) {
          return {
            ok: true,
            json: async () => responses[pattern],
          };
        }
      }

      return {
        ok: false,
        status: 404,
        json: async () => ({ error: "Not found" }),
      };
    }
  );
}

// Mock failed fetch
export function mockFetchError(error: string = "Network error") {
  (global.fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new Error(error));
}

// Mock user for authenticated tests
export const mockUser = {
  id: "test-user-123",
  email: "test@example.com",
  name: "Test User",
  picture: "https://example.com/avatar.jpg",
};

// Mock session data
export const mockSession = {
  id: "session-123",
  project_name: "Test Project",
  status: "running",
  created_at: Math.floor(Date.now() / 1000) - 3600,
  last_activity_at: Math.floor(Date.now() / 1000),
  workspace_id: null,
};

// Import vi for TypeScript
import { vi } from "vitest";
