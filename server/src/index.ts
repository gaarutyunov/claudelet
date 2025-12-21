import Fastify, { FastifyRequest, FastifyReply } from "fastify";
import fastifyWebsocket from "@fastify/websocket";
import fastifyCors from "@fastify/cors";
import fastifyHelmet from "@fastify/helmet";
import fastifyRateLimit from "@fastify/rate-limit";
import fastifyStatic from "@fastify/static";
import { config } from "./config.js";
import { setupTerminalRoutes } from "./routes/terminal.js";
import { setupChatRoutes } from "./routes/chat.js";
import { setupAuthRoutes } from "./routes/auth.js";
import { setupSessionRoutes } from "./routes/sessions.js";
import { setupHealthRoutes } from "./routes/health.js";
import { setupRepositoryRoutes } from "./routes/repositories.js";
import { initDatabase } from "./db/index.js";
import { logger } from "./utils/logger.js";
import { authMiddleware } from "./middleware/auth.js";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Try to load embedded assets (available in compiled binary)
type EmbeddedAssets = { getAsset: (path: string) => Buffer | null; hasAsset: (path: string) => boolean };
let embeddedAssets: EmbeddedAssets | null = null;
try {
  // Dynamic import - module only exists in compiled binary
  // @ts-ignore - Module is generated at build time
  embeddedAssets = await import("./embedded-assets/index.js") as EmbeddedAssets;
} catch {
  // Embedded assets not available (development mode or standard deployment)
}

// MIME types for static files
const MIME_TYPES: Record<string, string> = {
  ".html": "text/html",
  ".js": "application/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".eot": "application/vnd.ms-fontobject",
};

async function main() {
  // Initialize database
  await initDatabase();

  const fastify = Fastify({
    logger: logger,
  });

  // Security middleware
  await fastify.register(fastifyHelmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        connectSrc: ["'self'", "wss:", "ws:"],
      },
    },
  });

  await fastify.register(fastifyCors, {
    origin: config.corsOrigins,
    credentials: true,
  });

  await fastify.register(fastifyRateLimit, {
    max: 100,
    timeWindow: "1 minute",
  });

  // WebSocket support
  await fastify.register(fastifyWebsocket, {
    options: {
      maxPayload: 1048576, // 1MB
    },
  });

  // Serve static files in production
  if (config.nodeEnv === "production") {
    if (embeddedAssets) {
      // Serve from embedded assets (compiled binary mode)
      logger.info("Serving frontend from embedded assets");

      // Catch-all for frontend routes (SPA)
      fastify.setNotFoundHandler(async (request: FastifyRequest, reply: FastifyReply) => {
        // Skip API routes
        if (request.url.startsWith("/api/")) {
          return reply.code(404).send({ error: "Not found" });
        }

        let assetPath = request.url.split("?")[0];

        // Try exact path first
        if (embeddedAssets!.hasAsset(assetPath)) {
          const content = embeddedAssets!.getAsset(assetPath);
          const ext = path.extname(assetPath);
          const contentType = MIME_TYPES[ext] || "application/octet-stream";
          return reply.type(contentType).send(content);
        }

        // For SPA routes, serve index.html
        const indexHtml = embeddedAssets!.getAsset("/index.html");
        if (indexHtml) {
          return reply.type("text/html").send(indexHtml);
        }

        return reply.code(404).send({ error: "Not found" });
      });
    } else {
      // Serve from filesystem (standard deployment)
      const webDistPath = path.join(__dirname, "../../web/dist");
      if (fs.existsSync(webDistPath)) {
        logger.info("Serving frontend from filesystem");
        await fastify.register(fastifyStatic, {
          root: webDistPath,
          prefix: "/",
        });

        // SPA fallback
        fastify.setNotFoundHandler(async (request: FastifyRequest, reply: FastifyReply) => {
          if (request.url.startsWith("/api/")) {
            return reply.code(404).send({ error: "Not found" });
          }
          return reply.sendFile("index.html");
        });
      } else {
        logger.warn("Web dist directory not found, frontend will not be served");
      }
    }
  }

  // Auth middleware for protected routes
  fastify.decorate("authenticate", authMiddleware);

  // Routes
  await fastify.register(setupHealthRoutes, { prefix: "/api" });
  await fastify.register(setupAuthRoutes, { prefix: "/api/auth" });
  await fastify.register(setupSessionRoutes, { prefix: "/api/sessions" });
  await fastify.register(setupRepositoryRoutes, { prefix: "/api/repositories" });
  await fastify.register(setupTerminalRoutes, { prefix: "/api/terminal" });
  await fastify.register(setupChatRoutes, { prefix: "/api/chat" });

  // Start server
  try {
    await fastify.listen({
      port: config.port,
      host: config.host,
    });
    logger.info({
      url: `http://${config.host}:${config.port}`,
      workdir: config.workdir,
      dbPath: config.dbPath,
    }, "Claudelet server started");
  } catch (err) {
    logger.error(err);
    process.exit(1);
  }
}

main();
