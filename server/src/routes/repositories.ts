import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { nanoid } from "nanoid";
import { spawn } from "child_process";
import path from "path";
import fs from "fs";
import {
  createRepository,
  getRepository,
  getRepositoryByUrl,
  getUserRepositories,
  updateRepository,
  deleteRepository,
  createWorkspace,
  getWorkspace,
  getWorkspaceByBranch,
  getRepositoryWorkspaces,
  deleteWorkspace,
  getWorkspaceSessions,
  Repository,
} from "../db/index.js";
import { config } from "../config.js";
import { logger } from "../utils/logger.js";

// Git helper functions
async function execGit(args: string[], cwd?: string): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const proc = spawn("git", args, { cwd });
    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (data) => {
      stdout += data.toString();
    });

    proc.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    proc.on("close", (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        reject(new Error(`Git command failed: ${stderr || stdout}`));
      }
    });

    proc.on("error", reject);
  });
}

async function cloneRepository(gitUrl: string, localPath: string): Promise<void> {
  await execGit(["clone", gitUrl, localPath]);
}

async function fetchRepository(localPath: string): Promise<void> {
  await execGit(["fetch", "--all", "--prune"], localPath);
}

async function listBranches(localPath: string): Promise<{ name: string; isRemote: boolean; current: boolean }[]> {
  const { stdout } = await execGit(["branch", "-a", "--format=%(refname:short)|%(HEAD)"], localPath);
  const branches: { name: string; isRemote: boolean; current: boolean }[] = [];

  for (const line of stdout.trim().split("\n")) {
    if (!line) continue;
    const [name, head] = line.split("|");
    const current = head === "*";

    // Skip HEAD refs
    if (name.includes("HEAD")) continue;

    if (name.startsWith("origin/")) {
      branches.push({
        name: name.replace("origin/", ""),
        isRemote: true,
        current: false,
      });
    } else {
      branches.push({
        name,
        isRemote: false,
        current,
      });
    }
  }

  // Deduplicate (prefer local over remote)
  const seen = new Set<string>();
  const result: { name: string; isRemote: boolean; current: boolean }[] = [];

  for (const branch of branches) {
    if (!seen.has(branch.name)) {
      seen.add(branch.name);
      result.push(branch);
    }
  }

  return result;
}

async function getCurrentBranch(localPath: string): Promise<string> {
  const { stdout } = await execGit(["rev-parse", "--abbrev-ref", "HEAD"], localPath);
  return stdout.trim();
}

async function createWorktree(repoPath: string, worktreePath: string, branch: string): Promise<void> {
  // Check if branch exists locally
  try {
    await execGit(["rev-parse", "--verify", branch], repoPath);
    // Branch exists locally, create worktree
    await execGit(["worktree", "add", worktreePath, branch], repoPath);
  } catch {
    // Branch might be remote-only, try to create from origin
    try {
      await execGit(["worktree", "add", worktreePath, "-b", branch, `origin/${branch}`], repoPath);
    } catch (e) {
      // Maybe it's a new branch
      await execGit(["worktree", "add", "-b", branch, worktreePath], repoPath);
    }
  }
}

async function removeWorktree(repoPath: string, worktreePath: string): Promise<void> {
  try {
    await execGit(["worktree", "remove", worktreePath, "--force"], repoPath);
  } catch {
    // Worktree might not exist, that's fine
  }
}

function extractRepoName(gitUrl: string): string {
  // Extract repo name from URL like:
  // git@server:user/repo.git -> repo
  // https://server/user/repo.git -> repo
  const match = gitUrl.match(/\/([^/]+?)(\.git)?$/);
  return match?.[1] || "unknown";
}

export async function setupRepositoryRoutes(fastify: FastifyInstance): Promise<void> {
  // List user's repositories
  fastify.get(
    "/",
    { preHandler: [fastify.authenticate] },
    async (request: FastifyRequest) => {
      const repos = getUserRepositories(request.user!.id);
      return { repositories: repos };
    }
  );

  // Add a new repository
  fastify.post(
    "/",
    { preHandler: [fastify.authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const user = request.user!;
      const { gitUrl, name } = request.body as { gitUrl: string; name?: string };

      if (!gitUrl) {
        return reply.code(400).send({ error: "gitUrl is required" });
      }

      // Check if repo already exists for this user
      const existing = getRepositoryByUrl(user.id, gitUrl);
      if (existing) {
        return reply.code(409).send({ error: "Repository already added", repository: existing });
      }

      const repoId = nanoid();
      const repoName = name || extractRepoName(gitUrl);
      const localPath = path.join(config.workspaceBasePath, user.id, "repos", repoId);

      try {
        // Create directory
        fs.mkdirSync(path.dirname(localPath), { recursive: true });

        // Clone the repository
        logger.info({ gitUrl, localPath }, "Cloning repository");
        await cloneRepository(gitUrl, localPath);

        // Get default branch
        const defaultBranch = await getCurrentBranch(localPath);

        // Save to database
        const repo = createRepository({
          id: repoId,
          user_id: user.id,
          name: repoName,
          git_url: gitUrl,
          default_branch: defaultBranch,
          local_path: localPath,
        });

        logger.info({ repoId, gitUrl }, "Repository added");
        return { repository: repo };
      } catch (error) {
        // Clean up on failure
        try {
          if (fs.existsSync(localPath)) {
            fs.rmSync(localPath, { recursive: true, force: true });
          }
        } catch {}

        logger.error({ error, gitUrl }, "Failed to clone repository");
        return reply.code(500).send({
          error: "Failed to clone repository",
          details: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }
  );

  // Get specific repository
  fastify.get(
    "/:id",
    { preHandler: [fastify.authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const repo = getRepository(id);

      if (!repo || repo.user_id !== request.user!.id) {
        return reply.code(404).send({ error: "Repository not found" });
      }

      // Get workspaces for this repo
      const workspaces = getRepositoryWorkspaces(id);

      return { repository: repo, workspaces };
    }
  );

  // Fetch updates for a repository
  fastify.post(
    "/:id/fetch",
    { preHandler: [fastify.authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const repo = getRepository(id);

      if (!repo || repo.user_id !== request.user!.id) {
        return reply.code(404).send({ error: "Repository not found" });
      }

      try {
        await fetchRepository(repo.local_path);
        updateRepository(id, { last_fetched_at: Math.floor(Date.now() / 1000) });

        logger.info({ repoId: id }, "Repository fetched");
        return { success: true };
      } catch (error) {
        logger.error({ error, repoId: id }, "Failed to fetch repository");
        return reply.code(500).send({
          error: "Failed to fetch repository",
          details: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }
  );

  // List branches for a repository
  fastify.get(
    "/:id/branches",
    { preHandler: [fastify.authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const repo = getRepository(id);

      if (!repo || repo.user_id !== request.user!.id) {
        return reply.code(404).send({ error: "Repository not found" });
      }

      try {
        const branches = await listBranches(repo.local_path);

        // Add workspace info to branches
        const workspaces = getRepositoryWorkspaces(id);
        const workspaceMap = new Map(workspaces.map((w) => [w.branch, w]));

        const branchesWithWorkspace = branches.map((b) => ({
          ...b,
          workspace: workspaceMap.get(b.name) || null,
        }));

        return { branches: branchesWithWorkspace };
      } catch (error) {
        logger.error({ error, repoId: id }, "Failed to list branches");
        return reply.code(500).send({
          error: "Failed to list branches",
          details: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }
  );

  // Create workspace for a branch
  fastify.post(
    "/:id/workspaces",
    { preHandler: [fastify.authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const { branch } = request.body as { branch: string };
      const user = request.user!;

      if (!branch) {
        return reply.code(400).send({ error: "branch is required" });
      }

      const repo = getRepository(id);
      if (!repo || repo.user_id !== user.id) {
        return reply.code(404).send({ error: "Repository not found" });
      }

      // Check if workspace already exists
      const existing = getWorkspaceByBranch(id, branch);
      if (existing) {
        return reply.code(409).send({ error: "Workspace already exists for this branch", workspace: existing });
      }

      const workspaceId = nanoid();
      const worktreePath = path.join(config.workspaceBasePath, user.id, "workspaces", workspaceId);

      try {
        // Create worktree directory
        fs.mkdirSync(path.dirname(worktreePath), { recursive: true });

        // Create git worktree
        await createWorktree(repo.local_path, worktreePath, branch);

        // Save to database
        const workspace = createWorkspace({
          id: workspaceId,
          repository_id: id,
          branch,
          directory_path: worktreePath,
        });

        logger.info({ workspaceId, repoId: id, branch }, "Workspace created");
        return { workspace };
      } catch (error) {
        // Clean up on failure
        try {
          await removeWorktree(repo.local_path, worktreePath);
          if (fs.existsSync(worktreePath)) {
            fs.rmSync(worktreePath, { recursive: true, force: true });
          }
        } catch {}

        logger.error({ error, repoId: id, branch }, "Failed to create workspace");
        return reply.code(500).send({
          error: "Failed to create workspace",
          details: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }
  );

  // Delete a workspace
  fastify.delete(
    "/:repoId/workspaces/:workspaceId",
    { preHandler: [fastify.authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { repoId, workspaceId } = request.params as { repoId: string; workspaceId: string };
      const user = request.user!;

      const repo = getRepository(repoId);
      if (!repo || repo.user_id !== user.id) {
        return reply.code(404).send({ error: "Repository not found" });
      }

      const workspace = getWorkspace(workspaceId);
      if (!workspace || workspace.repository_id !== repoId) {
        return reply.code(404).send({ error: "Workspace not found" });
      }

      // Check if workspace has active sessions
      const sessions = getWorkspaceSessions(workspaceId);
      const activeSessions = sessions.filter((s) => s.status === "running");
      if (activeSessions.length > 0) {
        return reply.code(400).send({ error: "Cannot delete workspace with active sessions" });
      }

      try {
        // Remove git worktree
        await removeWorktree(repo.local_path, workspace.directory_path);

        // Clean up directory
        if (fs.existsSync(workspace.directory_path)) {
          fs.rmSync(workspace.directory_path, { recursive: true, force: true });
        }

        // Delete from database
        deleteWorkspace(workspaceId);

        logger.info({ workspaceId, repoId }, "Workspace deleted");
        return { success: true };
      } catch (error) {
        logger.error({ error, workspaceId }, "Failed to delete workspace");
        return reply.code(500).send({
          error: "Failed to delete workspace",
          details: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }
  );

  // Delete a repository
  fastify.delete(
    "/:id",
    { preHandler: [fastify.authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const user = request.user!;

      const repo = getRepository(id);
      if (!repo || repo.user_id !== user.id) {
        return reply.code(404).send({ error: "Repository not found" });
      }

      // Check if any workspaces have active sessions
      const workspaces = getRepositoryWorkspaces(id);
      for (const workspace of workspaces) {
        const sessions = getWorkspaceSessions(workspace.id);
        const activeSessions = sessions.filter((s) => s.status === "running");
        if (activeSessions.length > 0) {
          return reply.code(400).send({
            error: "Cannot delete repository with active sessions",
            workspaceId: workspace.id,
            branch: workspace.branch,
          });
        }
      }

      try {
        // Remove all worktrees first
        for (const workspace of workspaces) {
          try {
            await removeWorktree(repo.local_path, workspace.directory_path);
            if (fs.existsSync(workspace.directory_path)) {
              fs.rmSync(workspace.directory_path, { recursive: true, force: true });
            }
          } catch {}
        }

        // Remove the main repository directory
        if (fs.existsSync(repo.local_path)) {
          fs.rmSync(repo.local_path, { recursive: true, force: true });
        }

        // Delete from database (cascade will delete workspaces)
        deleteRepository(id);

        logger.info({ repoId: id }, "Repository deleted");
        return { success: true };
      } catch (error) {
        logger.error({ error, repoId: id }, "Failed to delete repository");
        return reply.code(500).send({
          error: "Failed to delete repository",
          details: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }
  );
}
