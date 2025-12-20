import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { useAuthStore } from "../stores/auth";

interface Session {
  id: string;
  project_name: string | null;
  status: string;
  created_at: number;
  last_activity_at: number;
}

export function DashboardPage() {
  const navigate = useNavigate();
  const { user, logout } = useAuthStore();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);

  const fetchSessions = async () => {
    try {
      const data = await api.get<{ sessions: Session[] }>("/api/sessions");
      setSessions(data.sessions);
    } catch (error) {
      console.error("Failed to fetch sessions:", error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchSessions();
  }, []);

  const createSession = async () => {
    setIsCreating(true);
    try {
      const data = await api.post<{ session: Session }>("/api/sessions", {
        projectName: `Session ${sessions.length + 1}`,
      });
      navigate(`/session/${data.session.id}`);
    } catch (error) {
      console.error("Failed to create session:", error);
    } finally {
      setIsCreating(false);
    }
  };

  const deleteSession = async (id: string) => {
    if (!confirm("Are you sure you want to delete this session?")) return;

    try {
      await api.delete(`/api/sessions/${id}`);
      setSessions((prev) => prev.filter((s) => s.id !== id));
    } catch (error) {
      console.error("Failed to delete session:", error);
    }
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp * 1000).toLocaleString();
  };

  return (
    <div className="min-h-screen p-6">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <header className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold">Claudelet</h1>
            <p className="text-neutral-400">Welcome, {user?.name || user?.email}</p>
          </div>
          <div className="flex items-center gap-4">
            {user?.picture && (
              <img
                src={user.picture}
                alt={user.name || "User"}
                className="w-10 h-10 rounded-full"
              />
            )}
            <button onClick={logout} className="btn btn-secondary text-sm">
              Logout
            </button>
          </div>
        </header>

        {/* New Session Button */}
        <div className="mb-6">
          <button
            onClick={createSession}
            disabled={isCreating}
            className="btn btn-primary flex items-center gap-2"
          >
            {isCreating ? (
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
            ) : (
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 4v16m8-8H4"
                />
              </svg>
            )}
            New Session
          </button>
        </div>

        {/* Sessions List */}
        {isLoading ? (
          <div className="card flex items-center justify-center h-48">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
          </div>
        ) : sessions.length === 0 ? (
          <div className="card text-center py-12">
            <svg
              className="w-16 h-16 mx-auto mb-4 text-neutral-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
              />
            </svg>
            <h3 className="text-lg font-medium mb-2">No sessions yet</h3>
            <p className="text-neutral-400 mb-4">
              Create a new session to start using Claude Code remotely.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {sessions.map((session) => (
              <div
                key={session.id}
                className="card flex items-center justify-between hover:border-neutral-600 transition-colors"
              >
                <div
                  className="flex-1 cursor-pointer"
                  onClick={() => navigate(`/session/${session.id}`)}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-2 h-2 rounded-full ${
                        session.status === "running"
                          ? "bg-green-500"
                          : session.status === "stopped"
                          ? "bg-neutral-500"
                          : "bg-yellow-500"
                      }`}
                    />
                    <h3 className="font-medium">
                      {session.project_name || `Session ${session.id.slice(0, 8)}`}
                    </h3>
                  </div>
                  <div className="mt-1 text-sm text-neutral-400">
                    <span>Created: {formatDate(session.created_at)}</span>
                    <span className="mx-2">•</span>
                    <span>Last active: {formatDate(session.last_activity_at)}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => navigate(`/session/${session.id}`)}
                    className="btn btn-primary text-sm"
                  >
                    Open
                  </button>
                  <button
                    onClick={() => deleteSession(session.id)}
                    className="btn btn-danger text-sm"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
