#!/usr/bin/env node
// Copies this repo into a raycast/extensions checkout as the Store copy.
//
// This repo is where the extension is developed: it keeps the tests, the
// Vitest setup and CI. The Store only wants the extension itself (code,
// README, CHANGELOG, assets/, media/, metadata/), so everything dev-only is
// left out and stripped from package.json, and package-lock.json is
// regenerated without it.
//
// Usage: node scripts/sync-to-store.mjs [path to raycast-extensions checkout]
// (defaults to ../raycast-extensions). Then build, lint, commit and push there.

import { execFileSync, execSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const storeRepo = path.resolve(repo, process.argv[2] ?? "../raycast-extensions");
const { name } = JSON.parse(readFileSync(path.join(repo, "package.json"), "utf8"));
const target = path.join(storeRepo, "extensions", name);

// Paths (top-level names) that never go to the Store.
const DEV_ONLY_PATHS = new Set([
  ".gitattributes",
  ".github",
  ".claude",
  "docs",
  "scripts",
  "tests",
  "vitest.config.ts",
  "CLAUDE.md",
]);
const DEV_ONLY_DEPENDENCIES = ["vitest"];
const DEV_ONLY_SCRIPTS = ["test"];
// Left in place in the target so the build there doesn't start from scratch.
const KEEP_IN_TARGET = new Set(["node_modules", "dist", "raycast-env.d.ts"]);

if (!existsSync(path.join(storeRepo, "extensions"))) {
  console.error(`No raycast/extensions checkout at ${storeRepo}`);
  process.exit(1);
}

// The Store copy is what is committed here, so uncommitted edits (or deletions)
// can't slip into it unreviewed.
const changes = execFileSync("git", ["status", "--porcelain"], { cwd: repo, encoding: "utf8" }).trim();
if (changes) {
  console.error(`Commit or stash these changes first:\n${changes}`);
  process.exit(1);
}

const tracked = execFileSync("git", ["ls-files", "-z"], { cwd: repo, encoding: "utf8" })
  .split("\0")
  .filter((file) => file && !DEV_ONLY_PATHS.has(file.split("/")[0]));

// Start from an empty folder so files deleted here are deleted there too.
mkdirSync(target, { recursive: true });
for (const entry of readdirSync(target)) {
  if (!KEEP_IN_TARGET.has(entry)) rmSync(path.join(target, entry), { recursive: true, force: true });
}
for (const file of tracked) {
  cpSync(path.join(repo, file), path.join(target, file), { recursive: true });
}

const npm = (args) => execSync(`npm ${args}`, { cwd: target, stdio: "inherit" });
npm(`pkg delete ${DEV_ONLY_SCRIPTS.map((script) => `scripts.${script}`).join(" ")}`);
// Uninstalling also drops the packages from package-lock.json.
npm(`uninstall ${DEV_ONLY_DEPENDENCIES.join(" ")} --no-audit --no-fund`);

console.log(`\nStore copy ready in ${target} (${tracked.length} files).`);
console.log("Next: npm run build && npm run lint there, review git diff, commit, push.");
