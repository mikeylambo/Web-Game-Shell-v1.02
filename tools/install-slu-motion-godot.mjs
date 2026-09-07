#!/usr/bin/env node
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..");
const sourceAddon = join(repoRoot, "tools", "godot", "addons", "slu_motion");
const targetProject = resolve(process.argv[2] ?? process.cwd());
const projectFile = join(targetProject, "project.godot");

if (!existsSync(projectFile)) {
  console.error(`[SLU] project.godot not found at ${projectFile}`);
  process.exit(1);
}

const targetAddon = join(targetProject, "addons", "slu_motion");
mkdirSync(dirname(targetAddon), { recursive: true });
cpSync(sourceAddon, targetAddon, { recursive: true, force: true });

const pluginKey = 'res://addons/slu_motion/plugin.cfg';
let projectText = readFileSync(projectFile, "utf8");
if (!projectText.includes('[editor_plugins]')) {
  projectText += `\n[editor_plugins]\n\nenabled=PackedStringArray("${pluginKey}")\n`;
} else if (!projectText.includes(pluginKey)) {
  projectText = projectText.replace(
    /\[editor_plugins\][\s\S]*?(?=\n\[[^\]]+\]|$)/,
    (section) => {
      const match = section.match(/enabled=PackedStringArray\(([^)]*)\)/);
      if (!match) return `${section.trimEnd()}\nenabled=PackedStringArray("${pluginKey}")\n`;
      const current = match[1].trim();
      const next = current ? `${current}, "${pluginKey}"` : `"${pluginKey}"`;
      return section.replace(match[0], `enabled=PackedStringArray(${next})`);
    }
  );
}
writeFileSync(projectFile, projectText);

console.log(`[SLU] Motion Dock installed -> ${targetAddon}`);
console.log(`[SLU] Plugin enabled in ${projectFile}`);
console.log('[SLU] Restart/reopen Godot, then look for the "SLU Motion" dock.');
