import Database from "better-sqlite3";
import { config } from "../config.js";
import { logger } from "../utils/logger.js";
import fs from "fs";
import path from "path";

let db: Database.Database;

export function getDb(): Database.Database {
  if (!db) {
    throw new Error("Database not initialized. Call initDatabase first.");
  }
  return db;
}

export async function initDatabase(): Promise<void> {
  // Ensure data directory exists
  const dataDir = path.dirname(config.dbPath);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  db = new Database(config.dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  // Create tables
  db.exec(`
    -- Users table
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      name TEXT,
      picture TEXT,
      google_id TEXT UNIQUE,
      created_at INTEGER DEFAULT (unixepoch()),
      last_login_at INTEGER
    );

    -- Sessions table (auth sessions, not terminal sessions)
    CREATE TABLE IF NOT EXISTS auth_sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token TEXT UNIQUE NOT NULL,
      expires_at INTEGER NOT NULL,
      created_at INTEGER DEFAULT (unixepoch())
    );

    -- Terminal sessions table
    CREATE TABLE IF NOT EXISTS terminal_sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      container_id TEXT,
      workspace_path TEXT NOT NULL,
      project_name TEXT,
      status TEXT DEFAULT 'created',
      created_at INTEGER DEFAULT (unixepoch()),
      last_activity_at INTEGER DEFAULT (unixepoch())
    );

    -- Usage tracking
    CREATE TABLE IF NOT EXISTS usage_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      session_id TEXT REFERENCES terminal_sessions(id) ON DELETE SET NULL,
      tokens_input INTEGER DEFAULT 0,
      tokens_output INTEGER DEFAULT 0,
      cost_usd REAL DEFAULT 0,
      timestamp INTEGER DEFAULT (unixepoch())
    );

    -- OAuth state storage (for PKCE)
    CREATE TABLE IF NOT EXISTS oauth_states (
      state TEXT PRIMARY KEY,
      code_verifier TEXT NOT NULL,
      redirect_uri TEXT,
      created_at INTEGER DEFAULT (unixepoch())
    );

    -- Indexes
    CREATE INDEX IF NOT EXISTS idx_auth_sessions_token ON auth_sessions(token);
    CREATE INDEX IF NOT EXISTS idx_auth_sessions_user ON auth_sessions(user_id);
    CREATE INDEX IF NOT EXISTS idx_terminal_sessions_user ON terminal_sessions(user_id);
    CREATE INDEX IF NOT EXISTS idx_usage_logs_user ON usage_logs(user_id);
    CREATE INDEX IF NOT EXISTS idx_oauth_states_created ON oauth_states(created_at);
  `);

  // Clean up expired OAuth states (older than 10 minutes)
  const cleanupStmt = db.prepare(`
    DELETE FROM oauth_states WHERE created_at < unixepoch() - 600
  `);
  cleanupStmt.run();

  logger.info("Database initialized");
}

// User operations
export interface User {
  id: string;
  email: string;
  name: string | null;
  picture: string | null;
  google_id: string | null;
  created_at: number;
  last_login_at: number | null;
}

export function getUserById(id: string): User | undefined {
  return getDb().prepare("SELECT * FROM users WHERE id = ?").get(id) as User | undefined;
}

export function getUserByEmail(email: string): User | undefined {
  return getDb().prepare("SELECT * FROM users WHERE email = ?").get(email) as User | undefined;
}

export function getUserByGoogleId(googleId: string): User | undefined {
  return getDb().prepare("SELECT * FROM users WHERE google_id = ?").get(googleId) as User | undefined;
}

export function createUser(user: Omit<User, "created_at" | "last_login_at">): User {
  const stmt = getDb().prepare(`
    INSERT INTO users (id, email, name, picture, google_id)
    VALUES (?, ?, ?, ?, ?)
  `);
  stmt.run(user.id, user.email, user.name, user.picture, user.google_id);
  return getUserById(user.id)!;
}

export function updateUserLastLogin(userId: string): void {
  getDb().prepare("UPDATE users SET last_login_at = unixepoch() WHERE id = ?").run(userId);
}

// Auth session operations
export interface AuthSession {
  id: string;
  user_id: string;
  token: string;
  expires_at: number;
  created_at: number;
}

export function createAuthSession(session: Omit<AuthSession, "created_at">): void {
  const stmt = getDb().prepare(`
    INSERT INTO auth_sessions (id, user_id, token, expires_at)
    VALUES (?, ?, ?, ?)
  `);
  stmt.run(session.id, session.user_id, session.token, session.expires_at);
}

export function getAuthSessionByToken(token: string): (AuthSession & { user: User }) | undefined {
  const result = getDb().prepare(`
    SELECT s.*, u.id as u_id, u.email as u_email, u.name as u_name,
           u.picture as u_picture, u.google_id as u_google_id,
           u.created_at as u_created_at, u.last_login_at as u_last_login_at
    FROM auth_sessions s
    JOIN users u ON s.user_id = u.id
    WHERE s.token = ? AND s.expires_at > unixepoch()
  `).get(token) as any;

  if (!result) return undefined;

  return {
    id: result.id,
    user_id: result.user_id,
    token: result.token,
    expires_at: result.expires_at,
    created_at: result.created_at,
    user: {
      id: result.u_id,
      email: result.u_email,
      name: result.u_name,
      picture: result.u_picture,
      google_id: result.u_google_id,
      created_at: result.u_created_at,
      last_login_at: result.u_last_login_at,
    },
  };
}

export function deleteAuthSession(token: string): void {
  getDb().prepare("DELETE FROM auth_sessions WHERE token = ?").run(token);
}

export function deleteUserAuthSessions(userId: string): void {
  getDb().prepare("DELETE FROM auth_sessions WHERE user_id = ?").run(userId);
}

// Terminal session operations
export interface TerminalSession {
  id: string;
  user_id: string;
  container_id: string | null;
  workspace_path: string;
  project_name: string | null;
  status: "created" | "running" | "stopped" | "error";
  created_at: number;
  last_activity_at: number;
}

export function createTerminalSession(session: Omit<TerminalSession, "created_at" | "last_activity_at" | "status">): TerminalSession {
  const stmt = getDb().prepare(`
    INSERT INTO terminal_sessions (id, user_id, container_id, workspace_path, project_name)
    VALUES (?, ?, ?, ?, ?)
  `);
  stmt.run(session.id, session.user_id, session.container_id, session.workspace_path, session.project_name);
  return getTerminalSession(session.id)!;
}

export function getTerminalSession(id: string): TerminalSession | undefined {
  return getDb().prepare("SELECT * FROM terminal_sessions WHERE id = ?").get(id) as TerminalSession | undefined;
}

export function getUserTerminalSessions(userId: string): TerminalSession[] {
  return getDb().prepare(`
    SELECT * FROM terminal_sessions
    WHERE user_id = ?
    ORDER BY last_activity_at DESC
  `).all(userId) as TerminalSession[];
}

export function updateTerminalSession(id: string, updates: Partial<TerminalSession>): void {
  const allowedFields = ["container_id", "status", "last_activity_at", "project_name"];
  const fields = Object.keys(updates).filter((k) => allowedFields.includes(k));
  if (fields.length === 0) return;

  const setClause = fields.map((f) => `${f} = ?`).join(", ");
  const values = fields.map((f) => (updates as any)[f]);

  getDb().prepare(`UPDATE terminal_sessions SET ${setClause} WHERE id = ?`).run(...values, id);
}

export function deleteTerminalSession(id: string): void {
  getDb().prepare("DELETE FROM terminal_sessions WHERE id = ?").run(id);
}

// OAuth state operations
export function saveOAuthState(state: string, codeVerifier: string, redirectUri?: string): void {
  getDb().prepare(`
    INSERT INTO oauth_states (state, code_verifier, redirect_uri)
    VALUES (?, ?, ?)
  `).run(state, codeVerifier, redirectUri);
}

export function getOAuthState(state: string): { code_verifier: string; redirect_uri: string | null } | undefined {
  const result = getDb().prepare("SELECT code_verifier, redirect_uri FROM oauth_states WHERE state = ?").get(state) as any;
  if (result) {
    getDb().prepare("DELETE FROM oauth_states WHERE state = ?").run(state);
  }
  return result;
}

// Usage tracking
export function logUsage(userId: string, sessionId: string | null, tokensInput: number, tokensOutput: number, costUsd: number): void {
  getDb().prepare(`
    INSERT INTO usage_logs (user_id, session_id, tokens_input, tokens_output, cost_usd)
    VALUES (?, ?, ?, ?, ?)
  `).run(userId, sessionId, tokensInput, tokensOutput, costUsd);
}

export function getUserUsage(userId: string, since?: number): { tokens_input: number; tokens_output: number; cost_usd: number } {
  const sinceTs = since ?? 0;
  return getDb().prepare(`
    SELECT
      COALESCE(SUM(tokens_input), 0) as tokens_input,
      COALESCE(SUM(tokens_output), 0) as tokens_output,
      COALESCE(SUM(cost_usd), 0) as cost_usd
    FROM usage_logs
    WHERE user_id = ? AND timestamp >= ?
  `).get(userId, sinceTs) as { tokens_input: number; tokens_output: number; cost_usd: number };
}
