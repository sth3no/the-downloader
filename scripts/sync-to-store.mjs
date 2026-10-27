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
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const fail = (message) => {
  console.error(message);
  process.exit(1);
};
const git = (cwd, args) => execFileSync("git", args, { cwd, encoding: "utf8" }).trim();

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const storeRepo = path.resolve(repo, process.argv[2] ?? "../raycast-extensions");
const { name } = JSON.parse(readFileSync(path.join(repo, "package.json"), "utf8"));
if (!/^[a-z0-9-]+$/.test(name)) fail(`Unexpected extension name in package.json: ${name}`);
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

// The target folder gets emptied, so make sure it really is this extension's
// folder in a raycast/extensions checkout, and that nothing there is unsaved.
const isStoreCheckout = (() => {
  try {
    return (
      realpathSync(git(storeRepo, ["rev-parse", "--show-toplevel"])) === realpathSync(storeRepo) &&
      /raycast\/extensions|raycast-extensions/.test(git(storeRepo, ["remote", "-v"]))
    );
  } catch {
    return false;
  }
})();
if (!isStoreCheckout) fail(`No raycast/extensions checkout at ${storeRepo}`);
if (existsSync(target) && path.dirname(realpathSync(target)) !== realpathSync(path.join(storeRepo, "extensions"))) {
  fail(`${target} points outside the checkout's extensions folder`);
}
const targetChanges = git(storeRepo, ["status", "--porcelain", "--", `extensions/${name}`]);
if (targetChanges) fail(`Commit or discard these changes in the Store copy first:\n${targetChanges}`);

// The Store copy is what is committed here, so uncommitted edits (or deletions)
// can't slip into it unreviewed. Untracked files are never copied.
const changes = git(repo, ["status", "--porcelain", "--untracked-files=no"]);
if (changes) fail(`Commit or stash these changes first:\n${changes}`);

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
