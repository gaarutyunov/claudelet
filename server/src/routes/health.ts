import { FastifyInstance } from "fastify";
import { getDb } from "../db/index.js";

export async function setupHealthRoutes(fastify: FastifyInstance): Promise<void> {
  // Health check endpoint
  fastify.get("/health", async () => {
    const db = getDb();
    const dbCheck = db.prepare("SELECT 1 as ok").get() as { ok: number };

    return {
      status: "ok",
      timestamp: new Date().toISOString(),
      database: dbCheck?.ok === 1 ? "connected" : "error",
    };
  });

  // Readiness check
  fastify.get("/ready", async () => {
    return { ready: true };
  });
}
