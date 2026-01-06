import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { nanoid } from "nanoid";
import {
  createTerminalSession,
  getTerminalSession,
  getUserTerminalSessions,
  updateTerminalSession,
  deleteTerminalSession,
  getWorkspace,
  getWorkspaceWithRepo,
  getRepository,
  TerminalSession,
} from "../db/index.js";
import { config } from "../config.js";
import { logger } from "../utils/logger.js";
import path from "path";
import fs from "fs";

// Extended session info with workspace details
interface SessionWithWorkspace extends TerminalSession {
  repo_name?: string;
  repo_git_url?: string;
  branch?: string;
}

function enrichSessionWithWorkspace(session: TerminalSession): SessionWithWorkspace {
  if (!session.workspace_id) {
    return session;
  }

  const workspaceWithRepo = getWorkspaceWithRepo(session.workspace_id);
  if (!workspaceWithRepo) {
    return session;
  }

  return {
    ...session,
    repo_name: workspaceWithRepo.repo_name,
    repo_git_url: workspaceWithRepo.repo_git_url,
    branch: workspaceWithRepo.branch,
  };
}

export async function setupSessionRoutes(fastify: FastifyInstance): Promise<void> {
  // List user's terminal sessions
  fastify.get(
    "/",
    { preHandler: [fastify.authenticate] },
    async (request: FastifyRequest) => {
      const sessions = getUserTerminalSessions(request.user!.id);
      const enrichedSessions = sessions.map(enrichSessionWithWorkspace);
      return { sessions: enrichedSessions };
    }
  );

  // Create new terminal session
  fastify.post(
    "/",
    { preHandler: [fastify.authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const user = request.user!;
      const { projectName, workspaceId } = (request.body as { projectName?: string; workspaceId?: string }) || {};

      // Check session limit
      const existingSessions = getUserTerminalSessions(user.id);
      if (existingSessions.length >= config.maxSessionsPerUser) {
        return reply.code(400).send({
          error: `Maximum ${config.maxSessionsPerUser} sessions allowed`,
        });
      }

      const sessionId = nanoid();
      let workspacePath: string;
      let resolvedWorkspaceId: string | null = null;

      // If workspaceId is provided, use the workspace directory
      if (workspaceId) {
        const workspace = getWorkspace(workspaceId);
        if (!workspace) {
          return reply.code(404).send({ error: "Workspace not found" });
        }

        // Verify the user owns this workspace via repository
        const repo = getRepository(workspace.repository_id);
        if (!repo || repo.user_id !== user.id) {
          return reply.code(403).send({ error: "Access denied to workspace" });
        }

        workspacePath = workspace.directory_path;
        resolvedWorkspaceId = workspaceId;
      } else {
        // Create a standalone workspace directory (legacy mode)
        workspacePath = path.join(config.workspaceBasePath, user.id, "standalone", sessionId);
        fs.mkdirSync(workspacePath, { recursive: true });
      }

      try {
        // Create Claude config directory for this user if it doesn't exist
        const userClaudeConfig = path.join(config.claudeConfigPath, user.id);
        if (!fs.existsSync(userClaudeConfig)) {
          fs.mkdirSync(userClaudeConfig, { recursive: true });
          // Create default settings.json
          fs.writeFileSync(
            path.join(userClaudeConfig, "settings.json"),
            JSON.stringify({ theme: "dark" }, null, 2)
          );
        }

        const session = createTerminalSession({
          id: sessionId,
          user_id: user.id,
          workspace_id: resolvedWorkspaceId,
          container_id: null,
          workspace_path: workspacePath,
          project_name: projectName || null,
        });

        const enrichedSession = enrichSessionWithWorkspace(session);
        logger.info({ sessionId, userId: user.id, workspaceId: resolvedWorkspaceId }, "Created terminal session");
        return { session: enrichedSession };
      } catch (error) {
        logger.error({ error }, "Failed to create session");
        return reply.code(500).send({ error: "Failed to create session" });
      }
    }
  );

  // Get specific session
  fastify.get(
    "/:id",
    { preHandler: [fastify.authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const session = getTerminalSession(id);

      if (!session || session.user_id !== request.user!.id) {
        return reply.code(404).send({ error: "Session not found" });
      }

      return { session: enrichSessionWithWorkspace(session) };
    }
  );

  // Update session (e.g., rename)
  fastify.patch(
    "/:id",
    { preHandler: [fastify.authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const updates = request.body as { projectName?: string };

      const session = getTerminalSession(id);
      if (!session || session.user_id !== request.user!.id) {
        return reply.code(404).send({ error: "Session not found" });
      }

      if (updates.projectName !== undefined) {
        updateTerminalSession(id, { project_name: updates.projectName });
      }

      return { session: getTerminalSession(id) };
    }
  );

  // Delete session
  fastify.delete(
    "/:id",
    { preHandler: [fastify.authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const session = getTerminalSession(id);

      if (!session || session.user_id !== request.user!.id) {
        return reply.code(404).send({ error: "Session not found" });
      }

      // TODO: Stop container if running

      // Only clean up standalone workspace directories (not workspace-linked ones)
      // Workspace-linked directories are managed by the repository/workspace lifecycle
      if (!session.workspace_id) {
        try {
          if (fs.existsSync(session.workspace_path)) {
            fs.rmSync(session.workspace_path, { recursive: true, force: true });
          }
        } catch (error) {
          logger.error({ error, sessionId: id }, "Failed to clean workspace");
        }
      }

      deleteTerminalSession(id);
      logger.info({ sessionId: id, workspaceId: session.workspace_id }, "Deleted terminal session");

      return { success: true };
    }
  );
}
