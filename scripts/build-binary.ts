#!/usr/bin/env bun
/**
 * Build script for creating a single Claudelet binary
 * This script:
 * 1. Builds the web frontend
 * 2. Embeds the frontend assets into the server
 * 3. Compiles everything into a single executable
 */

import { $ } from "bun";
import * as fs from "fs";
import * as path from "path";

const ROOT_DIR = path.resolve(import.meta.dir, "..");
const SERVER_DIR = path.join(ROOT_DIR, "server");
const WEB_DIR = path.join(ROOT_DIR, "web");
const DIST_DIR = path.join(ROOT_DIR, "dist");

// Target platforms for cross-compilation
const TARGETS = [
  { name: "linux-x64", target: "bun-linux-x64" },
  { name: "linux-arm64", target: "bun-linux-arm64" },
  // { name: "darwin-x64", target: "bun-darwin-x64" },
  // { name: "darwin-arm64", target: "bun-darwin-arm64" },
];

async function main() {
  const args = process.argv.slice(2);
  const targetArg = args.find((a) => a.startsWith("--target="));
  const specificTarget = targetArg?.split("=")[1];

  console.log("🚀 Building Claudelet binary...\n");

  // Clean dist directory
  console.log("📁 Cleaning dist directory...");
  if (fs.existsSync(DIST_DIR)) {
    fs.rmSync(DIST_DIR, { recursive: true });
  }
  fs.mkdirSync(DIST_DIR, { recursive: true });

  // Build web frontend
  console.log("🌐 Building web frontend...");
  await $`cd ${WEB_DIR} && bun run build`;

  // Copy web assets to be embedded
  const webDistDir = path.join(WEB_DIR, "dist");
  const embeddedAssetsDir = path.join(SERVER_DIR, "src", "embedded-assets");

  if (fs.existsSync(embeddedAssetsDir)) {
    fs.rmSync(embeddedAssetsDir, { recursive: true });
  }
  fs.mkdirSync(embeddedAssetsDir, { recursive: true });

  // Create an asset manifest
  console.log("📦 Preparing embedded assets...");
  const assets: Record<string, string> = {};

  function collectAssets(dir: string, prefix = "") {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      const relativePath = path.join(prefix, entry.name);

      if (entry.isDirectory()) {
        collectAssets(fullPath, relativePath);
      } else {
        const content = fs.readFileSync(fullPath);
        assets["/" + relativePath.replace(/\\/g, "/")] = content.toString("base64");
      }
    }
  }

  collectAssets(webDistDir);

  // Write assets as a TypeScript module
  const assetsModule = `// Auto-generated embedded assets
export const EMBEDDED_ASSETS: Record<string, string> = ${JSON.stringify(assets, null, 2)};

export function getAsset(path: string): Buffer | null {
  const base64 = EMBEDDED_ASSETS[path];
  if (!base64) return null;
  return Buffer.from(base64, "base64");
}

export function hasAsset(path: string): boolean {
  return path in EMBEDDED_ASSETS;
}

export function getAssetPaths(): string[] {
  return Object.keys(EMBEDDED_ASSETS);
}
`;

  fs.writeFileSync(path.join(embeddedAssetsDir, "index.ts"), assetsModule);
  console.log(`   Embedded ${Object.keys(assets).length} assets`);

  // Create the entry point that serves embedded assets
  const entryPoint = path.join(SERVER_DIR, "src", "bun-entry.ts");
  const entryContent = `#!/usr/bin/env bun
/**
 * Claudelet - Single binary entry point
 * This file is the entry point for the compiled binary
 */

// Re-export and run the main server
import "./index.js";
`;

  fs.writeFileSync(entryPoint, entryContent);

  // Build targets
  const targets = specificTarget
    ? TARGETS.filter((t) => t.name === specificTarget)
    : TARGETS;

  if (targets.length === 0) {
    console.error(`Unknown target: ${specificTarget}`);
    console.error(`Available targets: ${TARGETS.map((t) => t.name).join(", ")}`);
    process.exit(1);
  }

  for (const { name, target } of targets) {
    console.log(`\n🔨 Building for ${name}...`);

    const outputPath = path.join(DIST_DIR, `claudelet-${name}`);

    try {
      await $`bun build ${path.join(SERVER_DIR, "src", "index.ts")} \
        --compile \
        --target=${target} \
        --outfile=${outputPath} \
        --minify`;

      console.log(`   ✅ Built: ${outputPath}`);

      // Get file size
      const stats = fs.statSync(outputPath);
      console.log(`   📊 Size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
    } catch (error) {
      console.error(`   ❌ Failed to build for ${name}:`, error);
    }
  }

  // Clean up
  fs.rmSync(embeddedAssetsDir, { recursive: true });
  fs.unlinkSync(entryPoint);

  console.log("\n✨ Build complete!");
  console.log(`   Output directory: ${DIST_DIR}`);
}

main().catch(console.error);
