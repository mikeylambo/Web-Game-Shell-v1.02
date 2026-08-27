#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const generator = path.join(root, "tools", "create-slu-game.mjs");
const distPackage = root;
const renderers = ["three", "babylon", "phaser", "canvas2d", "dom"];

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    shell: process.platform === "win32",
    ...options
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "slu-consumer-check-"));

try {
  for (const renderer of renderers) {
    const out = path.join(tempRoot, `consumer-${renderer}`);

    run(process.execPath, [
      generator,
      "--id", `consumer-${renderer}`,
      "--name", `Consumer ${renderer}`,
      "--renderer", renderer,
      "--frames", renderer === "three" ? "arcade,vehicle" : "arcade",
      "--out", out
    ]);

    const nodeModules = path.join(out, "node_modules");
    const scopeDir = path.join(nodeModules, "@slu");
    fs.mkdirSync(scopeDir, { recursive: true });

    const linkTarget = path.join(scopeDir, "web-shell");
    try {
      fs.symlinkSync(distPackage, linkTarget, process.platform === "win32" ? "junction" : "dir");
    } catch {
      // Fallback for environments where symlink creation is restricted.
      fs.cpSync(distPackage, linkTarget, {
        recursive: true,
        filter: (src) =>
          !src.includes(`${path.sep}node_modules${path.sep}`) &&
          !src.includes(`${path.sep}.git${path.sep}`)
      });
    }

    // Use the shell repository's compiler so consumer verification adds no new install step.
    run("tsc", ["-p", path.join(out, "tsconfig.json"), "--noEmit"], { cwd: out });

    console.log(`PASS consumer: ${renderer}`);
  }

  console.log(`Consumer verification complete: ${renderers.length}/${renderers.length} targets passed.`);
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
