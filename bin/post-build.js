#!/usr/bin/env node
/**
 * Cross-platform production build (Windows / macOS / Linux).
 * Runs `next build`, then copies static assets into the standalone
 * output — replaces the Unix-only `cp -r` pipeline.
 */
const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const root = process.cwd();

execSync("next build", { stdio: "inherit", env: process.env });

const copies = [
  [path.join(root, ".next", "static"), path.join(root, ".next", "standalone", ".next", "static")],
  [path.join(root, "public"), path.join(root, ".next", "standalone", "public")],
];

for (const [src, dest] of copies) {
  if (!fs.existsSync(src)) {
    console.warn(`skip copy (missing): ${src}`);
    continue;
  }
  fs.cpSync(src, dest, { recursive: true });
  console.log(`copied ${path.relative(root, src)} -> ${path.relative(root, dest)}`);
}

console.log("standalone build ready: .next/standalone");
