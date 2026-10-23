#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Cross-platform production start (Windows / macOS / Linux).
 * Sets NODE_ENV=production and launches the Next.js standalone
 * server — replaces the Unix-only `NODE_ENV=production bun ...`
 * pipeline.
 */
const { spawn } = require("child_process");
const path = require("path");

const server = path.join(process.cwd(), ".next", "standalone", "server.js");
if (!require("fs").existsSync(server)) {
  console.error("standalone server not found. Run `npm run build` first.");
  process.exit(1);
}

const child = spawn(process.execPath, [server], {
  stdio: "inherit",
  env: { ...process.env, NODE_ENV: "production" },
});

for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => child.kill(sig));
}
child.on("exit", (code) => process.exit(code ?? 0));
