import { create } from "zustand";
import { persist } from "zustand/middleware";
import { api } from "../lib/api";

interface User {
  id: string;
  email: string;
  name: string | null;
  picture: string | null;
}

interface AuthState {
  token: string | null;
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  setToken: (token: string) => void;
  checkAuth: () => Promise<void>;
  logout: () => Promise<void>;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      token: null,
      user: null,
      isAuthenticated: false,
      isLoading: true,

      setToken: (token: string) => {
        set({ token, isAuthenticated: true });
      },

      checkAuth: async () => {
        const { token } = get();
        if (!token) {
          set({ isLoading: false, isAuthenticated: false });
          return;
        }

        try {
          const { user } = await api.get<{ user: User }>("/api/auth/me");
          set({ user, isAuthenticated: true, isLoading: false });
        } catch {
          set({ token: null, user: null, isAuthenticated: false, isLoading: false });
        }
      },

      logout: async () => {
        const { token } = get();
        if (token) {
          try {
            await api.post("/api/auth/logout");
          } catch {
            // Ignore errors
          }
        }
        set({ token: null, user: null, isAuthenticated: false });
      },
    }),
    {
      name: "claudelet-auth",
      partialize: (state) => ({ token: state.token }),
    }
  )
);
