import { useAuthStore } from "../stores/auth";

class ApiError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(url: string, options: RequestInit = {}): Promise<T> {
  const token = useAuthStore.getState().token;

  const headers = new Headers(options.headers);

  // Only set Content-Type for requests with body
  if (options.body) {
    headers.set("Content-Type", "application/json");
  }

  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const response = await fetch(url, {
    ...options,
    headers,
  });

  if (!response.ok) {
    if (response.status === 401) {
      useAuthStore.getState().logout();
    }

    const error = await response.json().catch(() => ({ error: "Request failed" }));
    throw new ApiError(response.status, error.error || "Request failed");
  }

  return response.json();
}

export const api = {
  get: <T>(url: string) => request<T>(url),

  post: <T>(url: string, body?: unknown) =>
    request<T>(url, {
      method: "POST",
      body: body ? JSON.stringify(body) : undefined,
    }),

  patch: <T>(url: string, body: unknown) =>
    request<T>(url, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),

  delete: <T>(url: string) =>
    request<T>(url, {
      method: "DELETE",
    }),
};

export function getWebSocketUrl(sessionId: string): string {
  const token = useAuthStore.getState().token;
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const host = window.location.host;
  return `${protocol}//${host}/api/terminal/${sessionId}/ws?token=${token}`;
}

export function getChatWebSocketUrl(sessionId: string): string {
  const token = useAuthStore.getState().token;
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const host = window.location.host;
  return `${protocol}//${host}/api/chat/${sessionId}/ws?token=${token}`;
}
