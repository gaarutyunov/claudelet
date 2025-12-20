import Docker from "dockerode";
import { config } from "../config.js";
import { logger } from "../utils/logger.js";
import path from "path";
import fs from "fs";

export interface WorkspaceConfig {
  userId: string;
  sessionId: string;
  workspacePath: string;
  claudeConfigPath: string;
}

export class WorkspaceManager {
  private docker: Docker;

  constructor() {
    this.docker = new Docker({ socketPath: config.dockerSocketPath });
  }

  async createContainer(workspaceConfig: WorkspaceConfig): Promise<string> {
    const containerName = `claudelet-${workspaceConfig.sessionId}`;

    // Security-hardened container configuration
    const container = await this.docker.createContainer({
      name: containerName,
      Image: config.workspaceImage,
      Tty: true,
      OpenStdin: true,
      Env: [
        `USER_ID=${workspaceConfig.userId}`,
        `SESSION_ID=${workspaceConfig.sessionId}`,
        "TERM=xterm-256color",
        "COLORTERM=truecolor",
        "CLAUDE_CODE_REMOTE=1",
      ],
      WorkingDir: "/workspace",
      HostConfig: {
        // Resource limits
        Memory: this.parseMemory(config.workspaceMemoryLimit),
        NanoCpus: config.workspaceCpuLimit * 1e9,

        // Security settings
        CapDrop: ["ALL"],
        SecurityOpt: ["no-new-privileges:true"],
        ReadonlyRootfs: false, // Need write for /tmp, etc.

        // Mount volumes
        Binds: [
          `${path.resolve(workspaceConfig.workspacePath)}:/workspace:rw`,
          `${path.resolve(workspaceConfig.claudeConfigPath)}:/home/coder/.claude:rw`,
        ],

        // Network - can be restricted further if needed
        NetworkMode: "bridge",

        // Restart policy
        RestartPolicy: { Name: "unless-stopped" },
      },
      User: "1000:1000", // Non-root user
    });

    await container.start();
    logger.info({ containerId: container.id, containerName }, "Container started");

    return container.id;
  }

  async stopContainer(containerId: string): Promise<void> {
    try {
      const container = this.docker.getContainer(containerId);
      await container.stop({ t: 10 });
      logger.info({ containerId }, "Container stopped");
    } catch (error: any) {
      if (error.statusCode !== 304) {
        // 304 = already stopped
        throw error;
      }
    }
  }

  async removeContainer(containerId: string): Promise<void> {
    try {
      const container = this.docker.getContainer(containerId);
      await container.remove({ force: true, v: true });
      logger.info({ containerId }, "Container removed");
    } catch (error: any) {
      if (error.statusCode !== 404) {
        throw error;
      }
    }
  }

  async execInContainer(
    containerId: string,
    command: string[]
  ): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    const container = this.docker.getContainer(containerId);

    const exec = await container.exec({
      Cmd: command,
      AttachStdout: true,
      AttachStderr: true,
    });

    return new Promise((resolve, reject) => {
      exec.start({ hijack: true, stdin: false }, (err, stream) => {
        if (err) {
          reject(err);
          return;
        }

        if (!stream) {
          reject(new Error("No stream returned"));
          return;
        }

        let stdout = "";
        let stderr = "";

        stream.on("data", (chunk: Buffer) => {
          // Docker multiplexes stdout/stderr
          const type = chunk[0];
          const payload = chunk.slice(8).toString();
          if (type === 1) {
            stdout += payload;
          } else {
            stderr += payload;
          }
        });

        stream.on("end", async () => {
          const inspect = await exec.inspect();
          resolve({
            stdout,
            stderr,
            exitCode: inspect.ExitCode ?? 0,
          });
        });

        stream.on("error", reject);
      });
    });
  }

  async listContainers(): Promise<Docker.ContainerInfo[]> {
    return this.docker.listContainers({
      all: true,
      filters: { name: ["claudelet-"] },
    });
  }

  async getContainerStats(containerId: string): Promise<{
    cpuPercent: number;
    memoryUsage: number;
    memoryLimit: number;
  }> {
    const container = this.docker.getContainer(containerId);
    const stats = await container.stats({ stream: false });

    // Calculate CPU percentage
    const cpuDelta =
      stats.cpu_stats.cpu_usage.total_usage -
      stats.precpu_stats.cpu_usage.total_usage;
    const systemDelta =
      stats.cpu_stats.system_cpu_usage - stats.precpu_stats.system_cpu_usage;
    const cpuCount = stats.cpu_stats.online_cpus || 1;
    const cpuPercent = (cpuDelta / systemDelta) * cpuCount * 100;

    return {
      cpuPercent: Math.round(cpuPercent * 100) / 100,
      memoryUsage: stats.memory_stats.usage,
      memoryLimit: stats.memory_stats.limit,
    };
  }

  async buildWorkspaceImage(): Promise<void> {
    const dockerfilePath = path.join(__dirname, "../../docker/Dockerfile.workspace");

    if (!fs.existsSync(dockerfilePath)) {
      logger.warn("Workspace Dockerfile not found, skipping build");
      return;
    }

    logger.info("Building workspace image...");

    const stream = await this.docker.buildImage(
      {
        context: path.dirname(dockerfilePath),
        src: ["Dockerfile.workspace"],
      },
      { t: config.workspaceImage, dockerfile: "Dockerfile.workspace" }
    );

    await new Promise((resolve, reject) => {
      this.docker.modem.followProgress(stream, (err, result) => {
        if (err) reject(err);
        else resolve(result);
      });
    });

    logger.info("Workspace image built successfully");
  }

  private parseMemory(memStr: string): number {
    const match = memStr.match(/^(\d+)([kmg]?)$/i);
    if (!match) return 2 * 1024 * 1024 * 1024; // Default 2GB

    const value = parseInt(match[1]);
    const unit = match[2].toLowerCase();

    switch (unit) {
      case "k":
        return value * 1024;
      case "m":
        return value * 1024 * 1024;
      case "g":
        return value * 1024 * 1024 * 1024;
      default:
        return value;
    }
  }
}
