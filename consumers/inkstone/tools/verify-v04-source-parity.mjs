import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

/**
 * V0.5 migration guardrail.
 *
 * These are Git blob SHAs from the last known-good public V0.4 baseline:
 *   mikeylambo/Inkstone@10e1d80c67ae1ac8f4fbf7abd23374fcbb901652
 *
 * Shell/lifecycle work is allowed to change outer application code. It is not
 * allowed to silently change the combat feel underneath the parity migration.
 */
const BASELINE = '10e1d80c67ae1ac8f4fbf7abd23374fcbb901652';

const expected = new Map(Object.entries({
  'src/anim/poses.js': 'f42959b018825feebca78bf50afd8c456a6caebe',
  'src/combat/attacks.js': '27bad039ffd964efe217021117a3e9966a22a537',
  'src/combat/hits.js': '873a65bc03c07b0611fa20cede130edf5fec129b',
  'src/entities/oni.js': '603a03e28a2a6af475a65e9a9b2edd9ad1757246',
  'src/entities/player.js': '0730ef552a829941687e8de39e5a0622c900264b',
  'src/entities/tengu.js': 'ede1e09cb4338161c8a33633be8e8502df8bb86c',
  'src/camera.js': '67d07cf046a4aed55ad8481d7935eb845eb0edb4',
  'src/gfx/fx.js': 'bb28df0df55ad317e23caf965274ec38ee79fa11',
  'src/glyphs.js': 'e54c7cf6f5947bf1d6e2b042a9c5e17443792626',
  'src/input.js': '027527a243bf50b8a54bb442a972714d1c03d968',
  'src/game.js': '8e4a420c7daa26dea193243ef5bfdf1bc9eed016',
  'src/pause.js': 'f2ba13d667e11e966112bc57f148927548621618',
  'src/record.js': '519658cefef82512e25078df42b90f9bebe512f3',
  'src/rng.js': 'a32bd6997b8ad1d9f0b7420c374e6e81ab08783b',
  'src/run.js': '508c9569be0949f90ab0586b64429df020bc0b87',
  'src/score.js': '0cc8027b40584fe9a62c287240a78d931d150078',
  'src/strokes.js': 'eade1432ea45e02ce9ff1e23a1fc87e43db328c4',
  'src/tuning.js': 'faffd4f026836ac72b5b02da316cf957369de136',
  'src/world.js': '173c80f2eeebf3a0dec98d76e7df35d8adb5f2fd',
}));

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function gitBlobSha(file) {
  const bytes = fs.readFileSync(file);
  const header = Buffer.from(`blob ${bytes.length}\0`);
  return crypto.createHash('sha1').update(header).update(bytes).digest('hex');
}

const failures = [];
for (const [relative, sha] of expected) {
  const file = path.join(root, relative);
  if (!fs.existsSync(file)) {
    failures.push(`${relative}: missing (expected ${sha})`);
    continue;
  }
  const actual = gitBlobSha(file);
  if (actual !== sha) failures.push(`${relative}: ${actual} != ${sha}`);
}

if (failures.length) {
  console.error(`INKSTONE V0.4 PARITY LOCK FAILED (${BASELINE})`);
  for (const failure of failures) console.error(`  - ${failure}`);
  console.error('\nIf a feel-critical change is intentional, treat it as a separate gameplay change and establish a new reviewed baseline.');
  process.exit(1);
}

console.log(`INKSTONE V0.4 PARITY LOCK PASS — ${expected.size} feel-critical files match ${BASELINE}.`);
