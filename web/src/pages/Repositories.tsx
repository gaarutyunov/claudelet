import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { useAuthStore } from "../stores/auth";

interface Repository {
  id: string;
  name: string;
  git_url: string;
  default_branch: string;
  created_at: number;
  last_fetched_at: number | null;
}

interface Workspace {
  id: string;
  repository_id: string;
  branch: string;
  directory_path: string;
  created_at: number;
}

interface Branch {
  name: string;
  isRemote: boolean;
  current: boolean;
  workspace: Workspace | null;
}

export function RepositoriesPage() {
  const navigate = useNavigate();
  const { user, logout } = useAuthStore();
  const [repos, setRepos] = useState<Repository[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isAdding, setIsAdding] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [gitUrl, setGitUrl] = useState("");
  const [repoName, setRepoName] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Expanded repo states
  const [expandedRepo, setExpandedRepo] = useState<string | null>(null);
  const [branches, setBranches] = useState<Record<string, Branch[]>>({});
  const [loadingBranches, setLoadingBranches] = useState<string | null>(null);
  const [creatingWorkspace, setCreatingWorkspace] = useState<string | null>(null);

  const fetchRepos = async () => {
    try {
      const data = await api.get<{ repositories: Repository[] }>("/api/repositories");
      setRepos(data.repositories);
    } catch (err) {
      console.error("Failed to fetch repositories:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchRepos();
  }, []);

  const addRepository = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!gitUrl.trim()) return;

    setIsAdding(true);
    setError(null);

    try {
      const data = await api.post<{ repository: Repository }>("/api/repositories", {
        gitUrl: gitUrl.trim(),
        name: repoName.trim() || undefined,
      });
      setRepos((prev) => [...prev, data.repository]);
      setGitUrl("");
      setRepoName("");
      setShowAddForm(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add repository");
    } finally {
      setIsAdding(false);
    }
  };

  const deleteRepository = async (id: string) => {
    if (!confirm("Are you sure you want to delete this repository and all its workspaces?")) return;

    try {
      await api.delete(`/api/repositories/${id}`);
      setRepos((prev) => prev.filter((r) => r.id !== id));
      if (expandedRepo === id) {
        setExpandedRepo(null);
      }
    } catch (err) {
      console.error("Failed to delete repository:", err);
      alert(err instanceof Error ? err.message : "Failed to delete repository");
    }
  };

  const fetchBranches = async (repoId: string) => {
    if (branches[repoId]) return;

    setLoadingBranches(repoId);
    try {
      const data = await api.get<{ branches: Branch[] }>(`/api/repositories/${repoId}/branches`);
      setBranches((prev) => ({ ...prev, [repoId]: data.branches }));
    } catch (err) {
      console.error("Failed to fetch branches:", err);
    } finally {
      setLoadingBranches(null);
    }
  };

  const fetchRepo = async (repoId: string) => {
    try {
      await api.post(`/api/repositories/${repoId}/fetch`);
      // Refresh branches
      delete branches[repoId];
      setBranches({ ...branches });
      await fetchBranches(repoId);
    } catch (err) {
      console.error("Failed to fetch repository:", err);
      alert(err instanceof Error ? err.message : "Failed to fetch repository");
    }
  };

  const toggleRepo = async (repoId: string) => {
    if (expandedRepo === repoId) {
      setExpandedRepo(null);
    } else {
      setExpandedRepo(repoId);
      await fetchBranches(repoId);
    }
  };

  const createWorkspace = async (repoId: string, branch: string) => {
    setCreatingWorkspace(`${repoId}:${branch}`);
    try {
      const data = await api.post<{ workspace: Workspace }>(`/api/repositories/${repoId}/workspaces`, {
        branch,
      });
      // Update branches to include the new workspace
      setBranches((prev) => ({
        ...prev,
        [repoId]: prev[repoId]?.map((b) =>
          b.name === branch ? { ...b, workspace: data.workspace } : b
        ),
      }));
    } catch (err) {
      console.error("Failed to create workspace:", err);
      alert(err instanceof Error ? err.message : "Failed to create workspace");
    } finally {
      setCreatingWorkspace(null);
    }
  };

  const createSession = async (workspaceId: string, repoName: string, branch: string) => {
    try {
      const data = await api.post<{ session: { id: string } }>("/api/sessions", {
        workspaceId,
        projectName: `${repoName}:${branch}`,
      });
      navigate(`/session/${data.session.id}`);
    } catch (err) {
      console.error("Failed to create session:", err);
      alert(err instanceof Error ? err.message : "Failed to create session");
    }
  };

  return (
    <div className="min-h-screen p-6">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <header className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate("/")}
              className="p-2 text-neutral-400 hover:text-white transition-colors rounded-lg hover:bg-neutral-800"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
            </button>
            <div>
              <h1 className="text-2xl font-bold">Repositories</h1>
              <p className="text-neutral-400">Manage your git repositories</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            {user?.picture && (
              <img src={user.picture} alt={user.name || "User"} className="w-10 h-10 rounded-full" />
            )}
            <button onClick={logout} className="btn btn-secondary text-sm">
              Logout
            </button>
          </div>
        </header>

        {/* Add Repository Button/Form */}
        <div className="mb-6">
          {showAddForm ? (
            <form onSubmit={addRepository} className="card">
              <h3 className="font-medium mb-4">Add Repository</h3>
              {error && (
                <div className="mb-4 p-3 bg-red-900/50 border border-red-700 rounded-lg text-sm text-red-200">
                  {error}
                </div>
              )}
              <div className="space-y-4">
                <div>
                  <label className="block text-sm text-neutral-400 mb-1">Git URL (SSH)</label>
                  <input
                    type="text"
                    value={gitUrl}
                    onChange={(e) => setGitUrl(e.target.value)}
                    placeholder="git@server:user/repo.git"
                    className="w-full px-3 py-2 bg-neutral-800 border border-neutral-700 rounded-lg
                             focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm text-neutral-400 mb-1">Name (optional)</label>
                  <input
                    type="text"
                    value={repoName}
                    onChange={(e) => setRepoName(e.target.value)}
                    placeholder="my-project"
                    className="w-full px-3 py-2 bg-neutral-800 border border-neutral-700 rounded-lg
                             focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                <div className="flex gap-3">
                  <button
                    type="submit"
                    disabled={isAdding}
                    className="btn btn-primary flex items-center gap-2"
                  >
                    {isAdding && <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />}
                    {isAdding ? "Cloning..." : "Add Repository"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowAddForm(false);
                      setError(null);
                    }}
                    className="btn btn-secondary"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </form>
          ) : (
            <button
              onClick={() => setShowAddForm(true)}
              className="btn btn-primary flex items-center gap-2"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Add Repository
            </button>
          )}
        </div>

        {/* Repositories List */}
        {isLoading ? (
          <div className="card flex items-center justify-center h-48">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
          </div>
        ) : repos.length === 0 ? (
          <div className="card text-center py-12">
            <svg className="w-16 h-16 mx-auto mb-4 text-neutral-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
            </svg>
            <h3 className="text-lg font-medium mb-2">No repositories yet</h3>
            <p className="text-neutral-400 mb-4">Add a git repository to get started.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {repos.map((repo) => (
              <div key={repo.id} className="card">
                <div
                  className="flex items-center justify-between cursor-pointer"
                  onClick={() => toggleRepo(repo.id)}
                >
                  <div className="flex items-center gap-3">
                    <svg
                      className={`w-5 h-5 text-neutral-400 transition-transform ${
                        expandedRepo === repo.id ? "rotate-90" : ""
                      }`}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                    <div>
                      <h3 className="font-medium">{repo.name}</h3>
                      <div className="text-sm text-neutral-400">{repo.git_url}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={() => fetchRepo(repo.id)}
                      className="btn btn-secondary text-sm"
                      title="Fetch updates"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                    </button>
                    <button
                      onClick={() => deleteRepository(repo.id)}
                      className="btn btn-danger text-sm"
                    >
                      Delete
                    </button>
                  </div>
                </div>

                {/* Branches */}
                {expandedRepo === repo.id && (
                  <div className="mt-4 pt-4 border-t border-neutral-700">
                    {loadingBranches === repo.id ? (
                      <div className="flex items-center justify-center py-4">
                        <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-500" />
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <h4 className="text-sm text-neutral-400 mb-2">Branches</h4>
                        {branches[repo.id]?.map((branch) => (
                          <div
                            key={branch.name}
                            className="flex items-center justify-between p-2 bg-neutral-800 rounded-lg"
                          >
                            <div className="flex items-center gap-2">
                              <svg className="w-4 h-4 text-neutral-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" />
                              </svg>
                              <span>{branch.name}</span>
                              {branch.current && (
                                <span className="px-1.5 py-0.5 text-xs bg-green-900 text-green-300 rounded">
                                  current
                                </span>
                              )}
                              {branch.workspace && (
                                <span className="px-1.5 py-0.5 text-xs bg-blue-900 text-blue-300 rounded">
                                  workspace
                                </span>
                              )}
                            </div>
                            <div>
                              {branch.workspace ? (
                                <button
                                  onClick={() => createSession(branch.workspace!.id, repo.name, branch.name)}
                                  className="btn btn-primary text-sm"
                                >
                                  New Session
                                </button>
                              ) : (
                                <button
                                  onClick={() => createWorkspace(repo.id, branch.name)}
                                  disabled={creatingWorkspace === `${repo.id}:${branch.name}`}
                                  className="btn btn-secondary text-sm"
                                >
                                  {creatingWorkspace === `${repo.id}:${branch.name}` ? (
                                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                                  ) : (
                                    "Create Workspace"
                                  )}
                                </button>
                              )}
                            </div>
                          </div>
                        ))}
                        {(!branches[repo.id] || branches[repo.id].length === 0) && (
                          <p className="text-sm text-neutral-500">No branches found</p>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
