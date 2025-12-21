import { z } from "zod";
import "dotenv/config";
import path from "path";

// Parse CLI arguments
function parseArgs(): { workdir: string; help: boolean; version: boolean } {
  const args = process.argv.slice(2);
  let workdir = process.cwd();
  let help = false;
  let version = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === "--workdir" || arg === "-w") {
      workdir = args[++i] || workdir;
    } else if (arg.startsWith("--workdir=")) {
      workdir = arg.split("=")[1];
    } else if (arg === "--help" || arg === "-h") {
      help = true;
    } else if (arg === "--version" || arg === "-v") {
      version = true;
    }
  }

  // Resolve to absolute path
  workdir = path.resolve(workdir);

  return { workdir, help, version };
}

const cliArgs = parseArgs();

// Show help if requested
if (cliArgs.help) {
  console.log(`
Claudelet - Remote self-hosted Claude Code from anywhere

Usage: claudelet [options]

Options:
  -w, --workdir <path>  Working directory for data storage (default: current directory)
  -h, --help            Show this help message
  -v, --version         Show version

Environment Variables:
  PORT                  Server port (default: 3001)
  HOST                  Server host (default: 0.0.0.0)
  NODE_ENV              Environment: development, production, test
  SESSION_SECRET        Session encryption secret (min 32 chars)
  GOOGLE_CLIENT_ID      Google OAuth client ID
  GOOGLE_CLIENT_SECRET  Google OAuth client secret
  GOOGLE_CALLBACK_URL   Google OAuth callback URL
  ALLOWED_EMAILS        Comma-separated list of allowed email addresses
  CORS_ORIGINS          Comma-separated list of allowed CORS origins

Data Paths (relative to workdir unless absolute):
  DB_PATH               SQLite database path (default: ./data/claudelet.db)
  WORKSPACE_BASE_PATH   Workspace storage path (default: ./data/workspaces)
  CLAUDE_CONFIG_PATH    Claude config path (default: ./data/claude-config)

Example:
  claudelet --workdir /var/lib/claudelet
  PORT=8080 claudelet -w ~/claudelet-data
`);
  process.exit(0);
}

// Show version if requested
if (cliArgs.version) {
  console.log("claudelet 0.1.0");
  process.exit(0);
}

// Helper to resolve path relative to workdir
function resolvePath(p: string | undefined, defaultPath: string): string {
  const resolved = p || defaultPath;
  if (path.isAbsolute(resolved)) {
    return resolved;
  }
  return path.join(cliArgs.workdir, resolved);
}

const configSchema = z.object({
  // Server
  nodeEnv: z.enum(["development", "production", "test"]).default("development"),
  port: z.coerce.number().default(3001),
  host: z.string().default("0.0.0.0"),

  // Working directory
  workdir: z.string(),

  // CORS
  corsOrigins: z.string().transform((s) => s.split(",")).default("http://localhost:5173"),

  // Database
  dbPath: z.string(),

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
  workspaceBasePath: z.string(),
  claudeConfigPath: z.string(),

  // Security
  allowedDomains: z.string().transform((s) => s.split(",")).default(""),
  allowedEmails: z.string().transform((s) => s ? s.split(",").map(e => e.trim().toLowerCase()) : []).default(""),
  maxSessionsPerUser: z.coerce.number().default(5),
});

export const config = configSchema.parse({
  nodeEnv: process.env.NODE_ENV,
  port: process.env.PORT,
  host: process.env.HOST,
  workdir: cliArgs.workdir,
  corsOrigins: process.env.CORS_ORIGINS,
  dbPath: resolvePath(process.env.DB_PATH, "./data/claudelet.db"),
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
  workspaceBasePath: resolvePath(process.env.WORKSPACE_BASE_PATH, "./data/workspaces"),
  claudeConfigPath: resolvePath(process.env.CLAUDE_CONFIG_PATH, "./data/claude-config"),
  allowedDomains: process.env.ALLOWED_DOMAINS,
  allowedEmails: process.env.ALLOWED_EMAILS,
  maxSessionsPerUser: process.env.MAX_SESSIONS_PER_USER,
});

export type Config = typeof config;
