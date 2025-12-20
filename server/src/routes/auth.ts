import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import crypto from "crypto";
import { nanoid } from "nanoid";
import { config } from "../config.js";
import {
  createUser,
  getUserByGoogleId,
  getUserByEmail,
  updateUserLastLogin,
  createAuthSession,
  deleteAuthSession,
  saveOAuthState,
  getOAuthState,
} from "../db/index.js";
import { logger } from "../utils/logger.js";

// PKCE helpers
function generateCodeVerifier(): string {
  return crypto.randomBytes(32).toString("base64url");
}

function generateCodeChallenge(verifier: string): string {
  return crypto.createHash("sha256").update(verifier).digest("base64url");
}

function generateState(): string {
  return crypto.randomBytes(32).toString("hex");
}

export async function setupAuthRoutes(fastify: FastifyInstance): Promise<void> {
  // Get current user
  fastify.get(
    "/me",
    { preHandler: [fastify.authenticate] },
    async (request: FastifyRequest) => {
      return { user: request.user };
    }
  );

  // Initiate Google OAuth login
  fastify.get("/google", async (request: FastifyRequest, reply: FastifyReply) => {
    if (!config.googleClientId) {
      return reply.code(501).send({ error: "Google OAuth not configured" });
    }

    const state = generateState();
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = generateCodeChallenge(codeVerifier);

    // Store state and verifier
    const redirectUri = (request.query as any)?.redirect_uri;
    saveOAuthState(state, codeVerifier, redirectUri);

    const params = new URLSearchParams({
      client_id: config.googleClientId,
      redirect_uri: config.googleCallbackUrl,
      response_type: "code",
      scope: "openid email profile",
      state,
      code_challenge: codeChallenge,
      code_challenge_method: "S256",
      access_type: "offline",
      prompt: "consent",
    });

    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
    return reply.redirect(authUrl);
  });

  // Google OAuth callback
  fastify.get("/google/callback", async (request: FastifyRequest, reply: FastifyReply) => {
    const { code, state, error } = request.query as {
      code?: string;
      state?: string;
      error?: string;
    };

    if (error) {
      logger.error({ error }, "OAuth error");
      return reply.code(400).send({ error: `OAuth error: ${error}` });
    }

    if (!code || !state) {
      return reply.code(400).send({ error: "Missing code or state" });
    }

    // Retrieve and validate state
    const storedState = getOAuthState(state);
    if (!storedState) {
      return reply.code(400).send({ error: "Invalid or expired state" });
    }

    if (!config.googleClientId || !config.googleClientSecret) {
      return reply.code(501).send({ error: "Google OAuth not configured" });
    }

    try {
      // Exchange code for tokens
      const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: config.googleClientId,
          client_secret: config.googleClientSecret,
          code,
          code_verifier: storedState.code_verifier,
          grant_type: "authorization_code",
          redirect_uri: config.googleCallbackUrl,
        }),
      });

      if (!tokenResponse.ok) {
        const errorData = await tokenResponse.text();
        logger.error({ error: errorData }, "Token exchange failed");
        return reply.code(400).send({ error: "Token exchange failed" });
      }

      const tokens = await tokenResponse.json() as { access_token: string; id_token: string };

      // Get user info
      const userInfoResponse = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      });

      if (!userInfoResponse.ok) {
        return reply.code(400).send({ error: "Failed to get user info" });
      }

      const userInfo = await userInfoResponse.json() as {
        id: string;
        email: string;
        name: string;
        picture: string;
      };

      // Find or create user
      let user = getUserByGoogleId(userInfo.id);
      if (!user) {
        user = getUserByEmail(userInfo.email);
        if (user) {
          // Link Google account to existing user - would need update function
          logger.info({ userId: user.id }, "Linking Google account to existing user");
        } else {
          user = createUser({
            id: nanoid(),
            email: userInfo.email,
            name: userInfo.name,
            picture: userInfo.picture,
            google_id: userInfo.id,
          });
          logger.info({ userId: user.id }, "Created new user");
        }
      }

      updateUserLastLogin(user.id);

      // Create auth session
      const sessionToken = crypto.randomBytes(32).toString("base64url");
      const expiresAt = Math.floor(Date.now() / 1000) + config.sessionMaxAge / 1000;

      createAuthSession({
        id: nanoid(),
        user_id: user.id,
        token: sessionToken,
        expires_at: expiresAt,
      });

      // Redirect with token
      const redirectUri = storedState.redirect_uri || "/";
      const separator = redirectUri.includes("?") ? "&" : "?";
      return reply.redirect(`${redirectUri}${separator}token=${sessionToken}`);
    } catch (error) {
      logger.error({ error }, "OAuth callback error");
      return reply.code(500).send({ error: "Authentication failed" });
    }
  });

  // Logout
  fastify.post(
    "/logout",
    { preHandler: [fastify.authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const authHeader = request.headers.authorization;
      if (authHeader?.startsWith("Bearer ")) {
        const token = authHeader.slice(7);
        deleteAuthSession(token);
      }
      return { success: true };
    }
  );

  // Dev-only: Create test user and session
  if (config.nodeEnv === "development") {
    fastify.post("/dev/login", async () => {
      let user = getUserByEmail("dev@localhost");
      if (!user) {
        user = createUser({
          id: nanoid(),
          email: "dev@localhost",
          name: "Development User",
          picture: null,
          google_id: null,
        });
      }

      const sessionToken = crypto.randomBytes(32).toString("base64url");
      const expiresAt = Math.floor(Date.now() / 1000) + config.sessionMaxAge / 1000;

      createAuthSession({
        id: nanoid(),
        user_id: user.id,
        token: sessionToken,
        expires_at: expiresAt,
      });

      return { token: sessionToken, user };
    });
  }
}
