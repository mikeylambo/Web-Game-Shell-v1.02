#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const generator = path.join(root, "tools", "create-slu-game.mjs");
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

    // Verify the generated package exactly as a real consumer would install it,
    // while resolving the shell to this checkout instead of a published package.
    const packagePath = path.join(out, "package.json");
    const packageJson = JSON.parse(fs.readFileSync(packagePath, "utf8"));
    packageJson.dependencies["@slu/web-shell"] = `file:${root}`;
    fs.writeFileSync(packagePath, `${JSON.stringify(packageJson, null, 2)}\n`);

    run("npm", ["install", "--ignore-scripts", "--no-audit", "--no-fund"], { cwd: out });
    run("npm", ["run", "check"], { cwd: out });

    console.log(`PASS consumer: ${renderer}`);
  }

  console.log(`Consumer verification complete: ${renderers.length}/${renderers.length} targets passed.`);
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
