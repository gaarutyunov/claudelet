import { FastifyRequest, FastifyReply } from "fastify";
import { getAuthSessionByToken, User } from "../db/index.js";

declare module "fastify" {
  interface FastifyRequest {
    user?: User;
  }
  interface FastifyInstance {
    authenticate: typeof authMiddleware;
  }
}

export async function authMiddleware(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  // Check Authorization header
  const authHeader = request.headers.authorization;
  let token: string | undefined;

  if (authHeader?.startsWith("Bearer ")) {
    token = authHeader.slice(7);
  }

  // Also check query parameter for WebSocket connections
  if (!token && request.query) {
    token = (request.query as any).token;
  }

  if (!token) {
    reply.code(401).send({ error: "Authentication required" });
    return;
  }

  const session = getAuthSessionByToken(token);
  if (!session) {
    reply.code(401).send({ error: "Invalid or expired token" });
    return;
  }

  request.user = session.user;
}

// Helper to extract token from request (for WebSocket)
export function extractToken(request: FastifyRequest): string | undefined {
  const authHeader = request.headers.authorization;
  if (authHeader?.startsWith("Bearer ")) {
    return authHeader.slice(7);
  }
  return (request.query as any)?.token;
}

// Validate token without sending response (for WebSocket)
export function validateToken(token: string): User | undefined {
  const session = getAuthSessionByToken(token);
  return session?.user;
}
