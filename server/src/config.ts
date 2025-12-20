import { z } from "zod";
import "dotenv/config";

const configSchema = z.object({
  // Server
  nodeEnv: z.enum(["development", "production", "test"]).default("development"),
  port: z.coerce.number().default(3001),
  host: z.string().default("0.0.0.0"),

  // CORS
  corsOrigins: z.string().transform((s) => s.split(",")).default("http://localhost:5173"),

  // Database
  dbPath: z.string().default("./data/claudelet.db"),

  // Session
  sessionSecret: z.string().min(32).default("change-me-in-production-to-a-secure-secret"),
  sessionMaxAge: z.coerce.number().default(24 * 60 * 60 * 1000), // 24 hours

  // Google OAuth
  googleClientId: z.string().optional(),
  googleClientSecret: z.string().optional(),
  googleCallbackUrl: z.string().default("http://localhost:3001/api/auth/google/callback"),

  // Claude API (for credential proxy)
  anthropicApiKey: z.string().optional(),

  // Docker
  dockerSocketPath: z.string().default("/var/run/docker.sock"),
  workspaceImage: z.string().default("claudelet-workspace:latest"),
  workspaceMemoryLimit: z.string().default("2g"),
  workspaceCpuLimit: z.coerce.number().default(1),

  // Workspace persistence
  workspaceBasePath: z.string().default("./data/workspaces"),
  claudeConfigPath: z.string().default("./data/claude-config"),

  // Security
  allowedDomains: z.string().transform((s) => s.split(",")).default(""),
  maxSessionsPerUser: z.coerce.number().default(5),
});

export const config = configSchema.parse({
  nodeEnv: process.env.NODE_ENV,
  port: process.env.PORT,
  host: process.env.HOST,
  corsOrigins: process.env.CORS_ORIGINS,
  dbPath: process.env.DB_PATH,
  sessionSecret: process.env.SESSION_SECRET,
  sessionMaxAge: process.env.SESSION_MAX_AGE,
  googleClientId: process.env.GOOGLE_CLIENT_ID,
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET,
  googleCallbackUrl: process.env.GOOGLE_CALLBACK_URL,
  anthropicApiKey: process.env.ANTHROPIC_API_KEY,
  dockerSocketPath: process.env.DOCKER_SOCKET_PATH,
  workspaceImage: process.env.WORKSPACE_IMAGE,
  workspaceMemoryLimit: process.env.WORKSPACE_MEMORY_LIMIT,
  workspaceCpuLimit: process.env.WORKSPACE_CPU_LIMIT,
  workspaceBasePath: process.env.WORKSPACE_BASE_PATH,
  claudeConfigPath: process.env.CLAUDE_CONFIG_PATH,
  allowedDomains: process.env.ALLOWED_DOMAINS,
  maxSessionsPerUser: process.env.MAX_SESSIONS_PER_USER,
});

export type Config = typeof config;
