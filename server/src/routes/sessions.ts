import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { nanoid } from "nanoid";
import {
  createTerminalSession,
  getTerminalSession,
  getUserTerminalSessions,
  updateTerminalSession,
  deleteTerminalSession,
} from "../db/index.js";
import { config } from "../config.js";
import { logger } from "../utils/logger.js";
import path from "path";
import fs from "fs";

export async function setupSessionRoutes(fastify: FastifyInstance): Promise<void> {
  // List user's terminal sessions
  fastify.get(
    "/",
    { preHandler: [fastify.authenticate] },
    async (request: FastifyRequest) => {
      const sessions = getUserTerminalSessions(request.user!.id);
      return { sessions };
    }
  );

  // Create new terminal session
  fastify.post(
    "/",
    { preHandler: [fastify.authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const user = request.user!;
      const { projectName } = (request.body as { projectName?: string }) || {};

      // Check session limit
      const existingSessions = getUserTerminalSessions(user.id);
      if (existingSessions.length >= config.maxSessionsPerUser) {
        return reply.code(400).send({
          error: `Maximum ${config.maxSessionsPerUser} sessions allowed`,
        });
      }

      // Create workspace directory
      const sessionId = nanoid();
      const workspacePath = path.join(config.workspaceBasePath, user.id, sessionId);

      try {
        fs.mkdirSync(workspacePath, { recursive: true });

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
          container_id: null,
          workspace_path: workspacePath,
          project_name: projectName || null,
        });

        logger.info({ sessionId, userId: user.id }, "Created terminal session");
        return { session };
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

      return { session };
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

      // Clean up workspace directory
      try {
        if (fs.existsSync(session.workspace_path)) {
          fs.rmSync(session.workspace_path, { recursive: true, force: true });
        }
      } catch (error) {
        logger.error({ error, sessionId: id }, "Failed to clean workspace");
      }

      deleteTerminalSession(id);
      logger.info({ sessionId: id }, "Deleted terminal session");

      return { success: true };
    }
  );
}
