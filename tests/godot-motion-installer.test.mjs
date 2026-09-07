import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();

test("SLU Motion Dock installer copies addon and enables plugin", () => {
  const project = mkdtempSync(join(tmpdir(), "slu-motion-godot-"));
  try {
    writeFileSync(join(project, "project.godot"), '[application]\nconfig/name="Installer Test"\n');
    const run = spawnSync(process.execPath, [join(root, "tools/install-slu-motion-godot.mjs"), project], {
      cwd: root,
      encoding: "utf8",
    });
    assert.equal(run.status, 0, run.stderr || run.stdout);
    assert.equal(existsSync(join(project, "addons/slu_motion/plugin.cfg")), true);
    assert.equal(existsSync(join(project, "addons/slu_motion/slu_motion_plugin.gd")), true);
    assert.equal(existsSync(join(project, "addons/slu_motion/slu_motion_dock.gd")), true);
    const projectText = readFileSync(join(project, "project.godot"), "utf8");
    assert.match(projectText, /\[editor_plugins\]/);
    assert.match(projectText, /res:\/\/addons\/slu_motion\/plugin\.cfg/);
  } finally {
    rmSync(project, { recursive: true, force: true });
  }
});
