import Fastify from "fastify";
import fastifyWebsocket from "@fastify/websocket";
import fastifyCors from "@fastify/cors";
import fastifyHelmet from "@fastify/helmet";
import fastifyRateLimit from "@fastify/rate-limit";
import fastifyStatic from "@fastify/static";
import { config } from "./config.js";
import { setupTerminalRoutes } from "./routes/terminal.js";
import { setupAuthRoutes } from "./routes/auth.js";
import { setupSessionRoutes } from "./routes/sessions.js";
import { setupHealthRoutes } from "./routes/health.js";
import { initDatabase } from "./db/index.js";
import { logger } from "./utils/logger.js";
import { authMiddleware } from "./middleware/auth.js";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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
    await fastify.register(fastifyStatic, {
      root: path.join(__dirname, "../../web/dist"),
      prefix: "/",
    });
  }

  // Auth middleware for protected routes
  fastify.decorate("authenticate", authMiddleware);

  // Routes
  await fastify.register(setupHealthRoutes, { prefix: "/api" });
  await fastify.register(setupAuthRoutes, { prefix: "/api/auth" });
  await fastify.register(setupSessionRoutes, { prefix: "/api/sessions" });
  await fastify.register(setupTerminalRoutes, { prefix: "/api/terminal" });

  // Start server
  try {
    await fastify.listen({
      port: config.port,
      host: config.host,
    });
    logger.info(`Claudelet server running at http://${config.host}:${config.port}`);
  } catch (err) {
    logger.error(err);
    process.exit(1);
  }
}

main();
