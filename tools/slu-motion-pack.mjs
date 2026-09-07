#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { GodotMotionImpactAdapter, UnityMotionImpactAdapter, validateMotionImpactPackage } from "../dist/index.js";

function usage() {
  console.log("Usage: node tools/slu-motion-pack.mjs <package.json> --target godot|unity --out <dir>");
}

const args = process.argv.slice(2);
const input = args[0];
const targetIndex = args.indexOf("--target");
const outIndex = args.indexOf("--out");
const target = targetIndex >= 0 ? args[targetIndex + 1] : undefined;
const outDir = outIndex >= 0 ? args[outIndex + 1] : undefined;

if (!input || !target || !outDir || !["godot", "unity"].includes(target)) {
  usage();
  process.exitCode = 1;
} else {
  const pkg = JSON.parse(fs.readFileSync(input, "utf8"));
  const report = validateMotionImpactPackage(pkg);
  for (const issue of report.issues) console.log(`[${issue.severity}] ${issue.path}: ${issue.message}`);
  if (!report.valid) {
    console.error("Package validation failed.");
    process.exitCode = 2;
  } else {
    const adapter = target === "godot" ? new GodotMotionImpactAdapter() : new UnityMotionImpactAdapter();
    const artifacts = adapter.exportPackage(pkg);
    for (const artifact of artifacts) {
      const output = path.join(outDir, artifact.path);
      fs.mkdirSync(path.dirname(output), { recursive: true });
      fs.writeFileSync(output, artifact.content, "utf8");
      console.log(`wrote ${output}`);
    }
    console.log(`SLU Motion/Impact: exported ${artifacts.length} artifacts for ${adapter.displayName}.`);
  }
}
