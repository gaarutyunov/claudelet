import { FastifyInstance, FastifyRequest } from "fastify";
import { WebSocket } from "ws";
import * as pty from "node-pty";
import { validateToken } from "../middleware/auth.js";
import { getTerminalSession, updateTerminalSession } from "../db/index.js";
import { config } from "../config.js";
import { logger } from "../utils/logger.js";
import { WorkspaceManager } from "../services/workspace.js";
import path from "path";

// Store active PTY processes
const activePtys = new Map<string, pty.IPty>();

interface TerminalMessage {
  type: "input" | "resize" | "ping";
  data?: string;
  cols?: number;
  rows?: number;
}

export async function setupTerminalRoutes(fastify: FastifyInstance): Promise<void> {
  const workspaceManager = new WorkspaceManager();

  // WebSocket terminal endpoint
  fastify.get(
    "/:sessionId/ws",
    { websocket: true },
    async (socket: WebSocket, request: FastifyRequest) => {
      const { sessionId } = request.params as { sessionId: string };
      const token = (request.query as any)?.token;

      // Authenticate
      const user = token ? validateToken(token) : undefined;
      if (!user) {
        socket.send(JSON.stringify({ type: "error", message: "Unauthorized" }));
        socket.close(4001, "Unauthorized");
        return;
      }

      // Validate session
      const session = getTerminalSession(sessionId);
      if (!session || session.user_id !== user.id) {
        socket.send(JSON.stringify({ type: "error", message: "Session not found" }));
        socket.close(4004, "Session not found");
        return;
      }

      logger.info({ sessionId, userId: user.id }, "Terminal WebSocket connected");

      let ptyProcess: pty.IPty | undefined;

      try {
        // Check if PTY already exists for this session
        ptyProcess = activePtys.get(sessionId);

        if (!ptyProcess) {
          // Create new PTY process
          const shell = process.env.SHELL || "/bin/bash";
          const claudeConfigPath = path.join(config.claudeConfigPath, user.id);

          ptyProcess = pty.spawn(shell, [], {
            name: "xterm-256color",
            cols: 80,
            rows: 24,
            cwd: session.workspace_path,
            env: {
              ...process.env,
              TERM: "xterm-256color",
              COLORTERM: "truecolor",
              HOME: session.workspace_path,
              CLAUDE_CONFIG_DIR: claudeConfigPath,
              // Indicate remote execution
              CLAUDE_CODE_REMOTE: "1",
              // User info for display
              USER: user.email.split("@")[0],
            },
          });

          activePtys.set(sessionId, ptyProcess);
          updateTerminalSession(sessionId, { status: "running" });

          logger.info({ sessionId, pid: ptyProcess.pid }, "PTY process spawned");
        }

        // Send initial message
        socket.send(JSON.stringify({
          type: "connected",
          sessionId,
          cols: 80,
          rows: 24,
        }));

        // PTY output -> WebSocket
        const outputHandler = (data: string) => {
          if (socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({ type: "output", data }));
          }
        };
        ptyProcess.onData(outputHandler);

        // Handle PTY exit
        const exitHandler = (exitCode: number) => {
          logger.info({ sessionId, exitCode }, "PTY process exited");
          activePtys.delete(sessionId);
          updateTerminalSession(sessionId, { status: "stopped" });

          if (socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({ type: "exit", exitCode }));
            socket.close(1000, "Process exited");
          }
        };
        ptyProcess.onExit(({ exitCode }) => exitHandler(exitCode));

        // WebSocket -> PTY
        socket.on("message", (rawData: Buffer) => {
          try {
            const message: TerminalMessage = JSON.parse(rawData.toString());

            switch (message.type) {
              case "input":
                if (message.data && ptyProcess) {
                  ptyProcess.write(message.data);
                  // Update last activity
                  updateTerminalSession(sessionId, {
                    last_activity_at: Math.floor(Date.now() / 1000),
                  });
                }
                break;

              case "resize":
                if (message.cols && message.rows && ptyProcess) {
                  ptyProcess.resize(message.cols, message.rows);
                }
                break;

              case "ping":
                socket.send(JSON.stringify({ type: "pong" }));
                break;
            }
          } catch (error) {
            logger.error({ error }, "Failed to parse terminal message");
          }
        });

        // Handle WebSocket close
        socket.on("close", () => {
          logger.info({ sessionId }, "Terminal WebSocket closed");
          // Don't kill the PTY - allow reconnection
        });

        socket.on("error", (error) => {
          logger.error({ error, sessionId }, "Terminal WebSocket error");
        });

      } catch (error) {
        logger.error({ error, sessionId }, "Failed to setup terminal");
        socket.send(JSON.stringify({ type: "error", message: "Failed to setup terminal" }));
        socket.close(4500, "Internal error");
      }
    }
  );

  // Kill terminal session (stop PTY)
  fastify.post(
    "/:sessionId/kill",
    { preHandler: [fastify.authenticate] },
    async (request: FastifyRequest) => {
      const { sessionId } = request.params as { sessionId: string };
      const session = getTerminalSession(sessionId);

      if (!session || session.user_id !== request.user!.id) {
        return { error: "Session not found" };
      }

      const ptyProcess = activePtys.get(sessionId);
      if (ptyProcess) {
        ptyProcess.kill();
        activePtys.delete(sessionId);
        updateTerminalSession(sessionId, { status: "stopped" });
        logger.info({ sessionId }, "PTY process killed");
      }

      return { success: true };
    }
  );

  // Get terminal status
  fastify.get(
    "/:sessionId/status",
    { preHandler: [fastify.authenticate] },
    async (request: FastifyRequest) => {
      const { sessionId } = request.params as { sessionId: string };
      const session = getTerminalSession(sessionId);

      if (!session || session.user_id !== request.user!.id) {
        return { error: "Session not found" };
      }

      const isRunning = activePtys.has(sessionId);
      return {
        sessionId,
        status: isRunning ? "running" : session.status,
        hasActivePty: isRunning,
      };
    }
  );
}
