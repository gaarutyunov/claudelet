import { FastifyInstance, FastifyRequest } from "fastify";
import { WebSocket } from "ws";
import { spawn, ChildProcess } from "child_process";
import * as pty from "node-pty";
import { validateToken } from "../middleware/auth.js";
import { getTerminalSession, updateTerminalSession } from "../db/index.js";
import { config } from "../config.js";
import { logger } from "../utils/logger.js";
import path from "path";
import fs from "fs";

// Types for chat messages
export interface ChatMessage {
  type: "user" | "assistant" | "tool_use" | "tool_result" | "error" | "status" | "system" | "login_required";
  content?: string;
  tool?: string;
  toolId?: string;
  params?: Record<string, unknown>;
  result?: string;
  isError?: boolean;
  status?: "connected" | "thinking" | "idle" | "error";
  timestamp?: number;
  loginUrl?: string;
}

// Store active Claude processes
const activeProcesses = new Map<string, ChildProcess>();
// Store pending login PTY processes
const pendingLogins = new Map<string, pty.IPty>();

function getUserClaudeConfigDir(userId: string): string {
  const userHome = process.env.HOME || "/tmp";
  return path.join(userHome, ".claudelet-users", userId);
}

function ensureUserConfigDir(userId: string): string {
  const configDir = getUserClaudeConfigDir(userId);
  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
  }
  return configDir;
}

function isUserLoggedIn(userId: string): boolean {
  const configDir = getUserClaudeConfigDir(userId);
  const credentialsFile = path.join(configDir, ".credentials.json");
  if (!fs.existsSync(credentialsFile)) {
    return false;
  }
  try {
    const credentials = JSON.parse(fs.readFileSync(credentialsFile, "utf-8"));
    return !!(credentials.claudeAiOauth?.accessToken);
  } catch {
    return false;
  }
}

export async function setupChatRoutes(fastify: FastifyInstance): Promise<void> {
  // Login endpoint - initiates Claude OAuth using PTY
  fastify.post(
    "/login",
    { preHandler: [fastify.authenticate] },
    async (request: FastifyRequest) => {
      const userId = request.user!.id;
      const configDir = ensureUserConfigDir(userId);

      logger.info({ userId, configDir }, "Initiating Claude login with PTY");

      // Kill any existing login process
      const existingLogin = pendingLogins.get(userId);
      if (existingLogin) {
        existingLogin.kill();
        pendingLogins.delete(userId);
      }

      // Remove API key to force OAuth login
      const loginEnv: Record<string, string> = {};
      for (const [key, value] of Object.entries(process.env)) {
        if (key !== "ANTHROPIC_API_KEY" && value) {
          loginEnv[key] = value;
        }
      }
      loginEnv.HOME = configDir;
      loginEnv.CLAUDE_CONFIG_DIR = configDir;

      return new Promise((resolve) => {
        const loginPty = pty.spawn("/usr/local/bin/claude", ["setup-token"], {
          name: "xterm-256color",
          cols: 80,
          rows: 24,
          cwd: configDir,
          env: loginEnv,
        });

        pendingLogins.set(userId, loginPty);
        let output = "";
        let resolved = false;

        loginPty.onData((data) => {
          output += data;
          logger.info({ userId, data: data.slice(0, 200) }, "Login PTY data");

          // Look for OAuth URL (claude.ai or console.anthropic.com)
          // eslint-disable-next-line no-control-regex
          const urlMatch = output.match(/https:\/\/claude\.ai\/oauth\/authorize[^\s\x1b\x07]*/);
          if (urlMatch && !resolved) {
            resolved = true;
            logger.info({ userId, url: urlMatch[0] }, "Found OAuth URL");
            resolve({ loginUrl: urlMatch[0], message: "Open this URL to authenticate with Claude" });
          }
        });

        loginPty.onExit(({ exitCode }) => {
          logger.info({ userId, exitCode }, "Login PTY exited");
          pendingLogins.delete(userId);

          if (!resolved) {
            if (exitCode === 0) {
              resolve({ success: true, message: "Login successful" });
            } else {
              // Try to find URL in final output
              // eslint-disable-next-line no-control-regex
              const urlMatch = output.match(/https:\/\/claude\.ai\/oauth\/authorize[^\s\x1b\x07]*/);
              if (urlMatch) {
                resolve({ loginUrl: urlMatch[0], message: "Open this URL to authenticate" });
              } else {
                resolve({ error: "Login failed or timed out", output: output.slice(-500) });
              }
            }
          }
        });

        // Timeout after 30 seconds
        setTimeout(() => {
          if (!resolved) {
            resolved = true;
            // eslint-disable-next-line no-control-regex
            const urlMatch = output.match(/https:\/\/claude\.ai\/oauth\/authorize[^\s\x1b\x07]*/);
            if (urlMatch) {
              resolve({ loginUrl: urlMatch[0], message: "Open this URL to authenticate" });
            } else {
              loginPty.kill();
              resolve({ error: "Login timed out", output: output.slice(-500) });
            }
          }
        }, 30000);
      });
    }
  );

  // Check login status
  fastify.get(
    "/auth-status",
    { preHandler: [fastify.authenticate] },
    async (request: FastifyRequest) => {
      const userId = request.user!.id;
      const loggedIn = isUserLoggedIn(userId);
      return { loggedIn, userId };
    }
  );

  // WebSocket chat endpoint
  fastify.get(
    "/:sessionId/ws",
    { websocket: true },
    async (socket: WebSocket, request: FastifyRequest) => {
      const { sessionId } = request.params as { sessionId: string };
      const token = (request.query as Record<string, string>)?.token;

      // Authenticate
      const user = token ? validateToken(token) : undefined;
      if (!user) {
        sendMessage(socket, { type: "error", content: "Unauthorized" });
        socket.close(4001, "Unauthorized");
        return;
      }

      // Validate session
      const session = getTerminalSession(sessionId);
      if (!session || session.user_id !== user.id) {
        sendMessage(socket, { type: "error", content: "Session not found" });
        socket.close(4004, "Session not found");
        return;
      }

      logger.info({ sessionId, userId: user.id }, "Chat WebSocket connected");

      // Send connected status
      try {
        sendMessage(socket, {
          type: "status",
          status: "connected",
          timestamp: Date.now(),
        });
        logger.info({ sessionId }, "Sent connected status");

        sendMessage(socket, {
          type: "system",
          content: "Connected to Claudelet. Send a message to start chatting with Claude.",
          timestamp: Date.now(),
        });
        logger.info({ sessionId }, "Sent system message");

        updateTerminalSession(sessionId, { status: "running" });
        logger.info({ sessionId }, "Updated session status");
      } catch (err) {
        logger.error({ err, sessionId }, "Error during initial setup");
      }

      // Handle incoming messages
      socket.on("message", async (rawData: Buffer) => {
        const rawStr = rawData.toString();
        logger.info({ sessionId, rawMessage: rawStr }, "Received raw message");

        try {
          const message = JSON.parse(rawStr);
          logger.info({ sessionId, messageType: message.type, content: message.content?.slice(0, 100) }, "Parsed message");

          if (message.type === "user" && message.content) {
            logger.info({ sessionId, content: message.content }, "Handling user message");
            await handleUserMessage(socket, sessionId, session.workspace_path, user.id, message.content);
          } else if (message.type === "ping") {
            logger.debug({ sessionId }, "Ping received");
            socket.send(JSON.stringify({ type: "pong" }));
          } else if (message.type === "abort") {
            logger.info({ sessionId }, "Abort requested");
            abortCurrentProcess(sessionId);
          } else {
            logger.warn({ sessionId, messageType: message.type }, "Unknown message type");
          }
        } catch (error) {
          logger.error({ error, rawMessage: rawStr }, "Failed to parse chat message");
          sendMessage(socket, {
            type: "error",
            content: "Invalid message format",
          });
        }
      });

      // Handle WebSocket close
      socket.on("close", (code, reason) => {
        logger.info({ sessionId, code, reason: reason?.toString() }, "Chat WebSocket closed");
        abortCurrentProcess(sessionId);
      });

      socket.on("error", (error) => {
        logger.error({ error, sessionId }, "Chat WebSocket error");
      });
    }
  );
}

function sendMessage(socket: WebSocket, message: ChatMessage): void {
  if (socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(message));
  }
}

function abortCurrentProcess(sessionId: string): void {
  const process = activeProcesses.get(sessionId);
  if (process) {
    process.kill("SIGTERM");
    activeProcesses.delete(sessionId);
  }
}

async function handleUserMessage(
  socket: WebSocket,
  sessionId: string,
  workspacePath: string,
  userId: string,
  content: string
): Promise<void> {
  logger.info({ sessionId, content, workspacePath, userId }, "handleUserMessage called");

  // Echo user message back
  sendMessage(socket, {
    type: "user",
    content,
    timestamp: Date.now(),
  });
  logger.info({ sessionId }, "Echoed user message");

  // Set thinking status
  sendMessage(socket, {
    type: "status",
    status: "thinking",
  });
  logger.info({ sessionId }, "Set thinking status");

  const claudeConfigPath = path.join(config.claudeConfigPath, userId);
  logger.info({ sessionId, claudeConfigPath, workspacePath }, "Spawning Claude process");

  // Spawn Claude process with JSON output
  const claudePath = "/usr/local/bin/claude";
  const args = [
    "--print",
    "--verbose",
    "--output-format", "stream-json",
    "--dangerously-skip-permissions",
    "-p", content,
  ];
  logger.info({ sessionId, claudePath, args }, "Spawn command details");

  // Use per-user Claude config directory for auth
  const userClaudeConfig = ensureUserConfigDir(userId);

  // Remove API key to use subscription auth instead
  const claudeEnv = { ...process.env };
  delete claudeEnv.ANTHROPIC_API_KEY;

  const claudeProcess = spawn(claudePath, args, {
    cwd: workspacePath,
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...claudeEnv,
      PATH: process.env.PATH + ":/usr/local/bin",
      HOME: userClaudeConfig,
      CLAUDE_CONFIG_DIR: userClaudeConfig,
      CLAUDE_CODE_REMOTE: "1",
      NO_COLOR: "1",
      FORCE_COLOR: "0",
    },
  });

  logger.info({ sessionId, pid: claudeProcess.pid }, "Claude process spawned");
  activeProcesses.set(sessionId, claudeProcess);

  let buffer = "";
  let currentToolId: string | null = null;

  claudeProcess.stdout?.on("data", (data: Buffer) => {
    const dataStr = data.toString();
    logger.info({ sessionId, dataLength: dataStr.length, preview: dataStr.slice(0, 200) }, "Claude stdout data");
    buffer += dataStr;

    // Process complete JSON lines
    const lines = buffer.split("\n");
    buffer = lines.pop() || ""; // Keep incomplete line in buffer

    for (const line of lines) {
      if (!line.trim()) continue;
      logger.info({ sessionId, line: line.slice(0, 200) }, "Processing line");

      try {
        const event = JSON.parse(line);
        logger.info({ sessionId, eventType: event.type }, "Parsed Claude event");
        processClaudeEvent(socket, event, currentToolId);

        // Track current tool ID for results
        if (event.type === "tool_use") {
          currentToolId = event.tool_use?.id || event.id;
        } else if (event.type === "tool_result") {
          currentToolId = null;
        }
      } catch {
        // Non-JSON output, treat as text
        logger.info({ sessionId, line: line.slice(0, 100) }, "Non-JSON line from Claude");
      }
    }
  });

  claudeProcess.stderr?.on("data", (data: Buffer) => {
    const errorText = data.toString();
    logger.info({ sessionId, stderr: errorText.slice(0, 500) }, "Claude stderr");

    // Don't send debug/info messages as errors
    if (!errorText.includes("Debug") && !errorText.includes("Info")) {
      sendMessage(socket, {
        type: "error",
        content: errorText,
        timestamp: Date.now(),
      });
    }
  });

  claudeProcess.on("close", (code) => {
    logger.info({ sessionId, code }, "Claude process closed");
    activeProcesses.delete(sessionId);

    // Process any remaining buffer
    if (buffer.trim()) {
      try {
        const event = JSON.parse(buffer);
        processClaudeEvent(socket, event, null);
      } catch {
        // Ignore incomplete JSON
      }
    }

    sendMessage(socket, {
      type: "status",
      status: "idle",
    });

    if (code !== 0 && code !== null) {
      logger.warn({ sessionId, code }, "Claude process exited with non-zero code");
    }
  });

  claudeProcess.on("error", (error) => {
    activeProcesses.delete(sessionId);
    logger.error({ error, sessionId }, "Claude process error");
    sendMessage(socket, {
      type: "error",
      content: `Failed to start Claude: ${error.message}`,
      timestamp: Date.now(),
    });
    sendMessage(socket, {
      type: "status",
      status: "error",
    });
  });
}

function processClaudeEvent(socket: WebSocket, event: Record<string, unknown>, _currentToolId: string | null): void {
  const eventType = event.type as string;

  switch (eventType) {
    case "assistant":
    case "message": {
      // Handle text messages
      const message = event.message as Record<string, unknown> | undefined;
      const content = message?.content || event.content;

      if (Array.isArray(content)) {
        for (const block of content) {
          if (block.type === "text") {
            sendMessage(socket, {
              type: "assistant",
              content: block.text,
              timestamp: Date.now(),
            });
          } else if (block.type === "tool_use") {
            sendMessage(socket, {
              type: "tool_use",
              tool: block.name,
              toolId: block.id,
              params: block.input,
              timestamp: Date.now(),
            });
          }
        }
      } else if (typeof content === "string") {
        sendMessage(socket, {
          type: "assistant",
          content,
          timestamp: Date.now(),
        });
      }
      break;
    }

    case "content_block_start":
    case "content_block": {
      const block = event.content_block as Record<string, unknown> | undefined;
      if (block?.type === "text") {
        sendMessage(socket, {
          type: "assistant",
          content: block.text as string,
          timestamp: Date.now(),
        });
      } else if (block?.type === "tool_use") {
        sendMessage(socket, {
          type: "tool_use",
          tool: block.name as string,
          toolId: block.id as string,
          params: block.input as Record<string, unknown>,
          timestamp: Date.now(),
        });
      }
      break;
    }

    case "tool_use": {
      sendMessage(socket, {
        type: "tool_use",
        tool: event.name as string || (event.tool_use as Record<string, unknown>)?.name as string,
        toolId: event.id as string || (event.tool_use as Record<string, unknown>)?.id as string,
        params: event.input as Record<string, unknown> || (event.tool_use as Record<string, unknown>)?.input as Record<string, unknown>,
        timestamp: Date.now(),
      });
      break;
    }

    case "tool_result": {
      const result = event.content || event.result;
      const resultText = typeof result === "string" ? result : JSON.stringify(result, null, 2);

      sendMessage(socket, {
        type: "tool_result",
        toolId: event.tool_use_id as string || event.id as string,
        result: resultText,
        isError: event.is_error as boolean || false,
        timestamp: Date.now(),
      });
      break;
    }

    case "error": {
      sendMessage(socket, {
        type: "error",
        content: event.message as string || event.error as string || "Unknown error",
        timestamp: Date.now(),
      });
      break;
    }

    case "result": {
      // Final result message - skip sending since "assistant" event already sent the content
      // This prevents duplicate messages
      break;
    }

    default:
      // Log unhandled event types for debugging
      logger.debug({ eventType, event }, "Unhandled Claude event type");
  }
}
