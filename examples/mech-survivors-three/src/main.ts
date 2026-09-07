import * as THREE from "three";
import {
  BoostMotionController,
  TargetCombatController,
  createBoostMotionState,
  type BoostMotionState,
  type TargetCandidate
} from "../../../src/modules/highMobility/index.ts";
import "./style.css";

const $ = <T extends HTMLElement>(selector: string) => document.querySelector(selector) as T;
const canvas = $("#game") as HTMLCanvasElement;
const hpFill = $("#hpFill");
const enFill = $("#enFill");
const xpFill = $("#xpFill");
const stateLine = $("#stateLine");
const timerEl = $("#timer");
const levelEl = $("#level");
const killsEl = $("#kills");
const targetEl = $("#target");
const densityEl = $("#density");
const upgradeEl = $("#upgrade");
const cardsEl = $("#cards");
const resultEl = $("#result");
const resultTitle = $("#resultTitle");
const resultStats = $("#resultStats");
const retry = $("#retry") as HTMLButtonElement;

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x030811);
scene.fog = new THREE.FogExp2(0x030811, 0.0014);

const camera = new THREE.PerspectiveCamera(64, innerWidth / innerHeight, 0.1, 2400);
camera.position.set(0, 28, 42);

scene.add(new THREE.HemisphereLight(0x9adfff, 0x101018, 1.15));
const sun = new THREE.DirectionalLight(0xffffff, 2.2);
sun.position.set(80, 140, 40);
scene.add(sun);

const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(1800, 1800),
  new THREE.MeshStandardMaterial({ color: 0x07101a, roughness: 0.92, metalness: 0.08 })
);
ground.rotation.x = -Math.PI / 2;
scene.add(ground);
const grid = new THREE.GridHelper(1800, 90, 0x1e6f94, 0x102939);
grid.position.y = 0.02;
scene.add(grid);

for (let i = 0; i < 70; i++) {
  const height = 18 + Math.random() * 90;
  const tower = new THREE.Mesh(
    new THREE.BoxGeometry(12 + Math.random() * 26, height, 12 + Math.random() * 26),
    new THREE.MeshStandardMaterial({ color: 0x091622, roughness: 0.75, metalness: 0.35 })
  );
  const angle = Math.random() * Math.PI * 2;
  const radius = 120 + Math.random() * 720;
  tower.position.set(Math.cos(angle) * radius, height / 2, Math.sin(angle) * radius);
  scene.add(tower);
}

function createMech() {
  const root = new THREE.Group();
  const armor = new THREE.MeshStandardMaterial({ color: 0xd8e8ef, metalness: 0.82, roughness: 0.28 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x09131f, metalness: 0.72, roughness: 0.32 });
  const glow = new THREE.MeshBasicMaterial({ color: 0x39c7ff, toneMapped: false });
  const core = new THREE.Mesh(new THREE.BoxGeometry(4.8, 6.4, 3.2), armor);
  core.position.y = 7.2;
  root.add(core);
  const waist = new THREE.Mesh(new THREE.BoxGeometry(3.2, 1.8, 2.7), dark);
  waist.position.y = 3.8;
  root.add(waist);
  for (const side of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(1.6, 4.8, 2), armor);
    leg.position.set(side * 1.6, 1.9, 0);
    root.add(leg);
    const shoulder = new THREE.Mesh(new THREE.BoxGeometry(2.8, 2.1, 3.2), armor);
    shoulder.position.set(side * 3.6, 8.4, 0.2);
    root.add(shoulder);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(1.4, 4.6, 1.6), dark);
    arm.position.set(side * 3.4, 5.7, -0.2);
    root.add(arm);
    const thruster = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.8, 1.8, 8), glow);
    thruster.rotation.x = Math.PI / 2;
    thruster.position.set(side * 2.4, 6.5, 2.3);
    root.add(thruster);
  }
  const head = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.8, 2), armor);
  head.position.y = 11.2;
  root.add(head);
  const eye = new THREE.Mesh(new THREE.BoxGeometry(1.45, 0.22, 0.12), glow);
  eye.position.set(0, 11.25, -1.04);
  root.add(eye);
  return root;
}

const mech = createMech();
scene.add(mech);

const motion = new BoostMotionController({
  moveSpeed: 70,
  acceleration: 18,
  airAcceleration: 11,
  burstSpeed: 205,
  burstDuration: 0.18,
  burstCost: 16,
  burstCooldown: 0.27,
  overdriveSpeed: 230,
  overdriveDrainPerSecond: 8,
  liftSpeed: 92,
  liftDrainPerSecond: 13,
  descendSpeed: 145,
  groundEnergyRegenPerSecond: 46,
  airEnergyRegenPerSecond: 20,
  energyRegenDelay: 0.45,
  maxEnergy: 100
});
const combat = new TargetCombatController(
  { maxRange: 700, softLockCone: 0.58, centerWeight: 0.54, distanceWeight: 0.34, priorityWeight: 0.12 },
  { breakDuration: 1.35, vulnerableMultiplier: 1.45, impactDecayPerSecond: 190, impactDecayDelay: 1.2 }
);

let motionState: BoostMotionState = createBoostMotionState({ x: 0, y: 0, z: 60 });
let yaw = 0;
let pitch = -0.24;
let hp = 100;
let maxHp = 100;
let invuln = 0;
let elapsed = 0;
let running = true;
let pausedForUpgrade = false;
let kills = 0;
let level = 1;
let xp = 0;
let nextXp = 18;
let spawnClock = 0;
let fireClock = 0;
let bossSpawned = false;
let hardLock = false;
let last = performance.now();
const RUN_SECONDS = 240;

const build = {
  damage: 16,
  fireRate: 3.8,
  multiTarget: 1,
  pickupRange: 32,
  orbitBlades: 0,
  maxEnemies: 110,
  breakImpact: 28
};

interface Enemy {
  id: string;
  mesh: THREE.Mesh;
  velocity: THREE.Vector3;
  hp: number;
  maxHp: number;
  impact: number;
  maxImpact: number;
  brokenFor: number;
  recentHitFor: number;
  speed: number;
  damage: number;
  radius: number;
  elite: boolean;
  boss: boolean;
  shootClock: number;
}
interface Gem { mesh: THREE.Mesh; value: number; }
interface Shot { mesh: THREE.Mesh; velocity: THREE.Vector3; damage: number; impact: number; life: number; enemy: boolean; }
interface Tracer { line: THREE.Line; life: number; }

const enemies: Enemy[] = [];
const gems: Gem[] = [];
const shots: Shot[] = [];
const tracers: Tracer[] = [];
const orbiters: THREE.Mesh[] = [];
const keys = new Set<string>();
let burstPressed = false;
let overdrivePressed = false;

const enemyGeo = new THREE.OctahedronGeometry(4, 0);
const enemyMat = new THREE.MeshStandardMaterial({ color: 0x8a3548, roughness: 0.5, metalness: 0.48 });
const eliteMat = new THREE.MeshStandardMaterial({ color: 0xc36d38, roughness: 0.4, metalness: 0.58 });
const bossMat = new THREE.MeshStandardMaterial({ color: 0x6f2536, roughness: 0.32, metalness: 0.7 });
const gemGeo = new THREE.OctahedronGeometry(0.9, 0);
const gemMat = new THREE.MeshBasicMaterial({ color: 0x4fe2ff, toneMapped: false });
const playerShotGeo = new THREE.SphereGeometry(0.38, 6, 5);
const playerShotMat = new THREE.MeshBasicMaterial({ color: 0x9feaff, toneMapped: false });
const enemyShotMat = new THREE.MeshBasicMaterial({ color: 0xff536c, toneMapped: false });

function spawnEnemy(forceBoss = false) {
  if (enemies.length >= build.maxEnemies) return;
  const boss = forceBoss;
  const elite = !boss && elapsed > 45 && Math.random() < 0.07;
  const mesh = new THREE.Mesh(enemyGeo, boss ? bossMat : elite ? eliteMat : enemyMat);
  const angle = Math.random() * Math.PI * 2;
  const radius = boss ? 320 : 150 + Math.random() * 260;
  mesh.position.set(
    motionState.position.x + Math.cos(angle) * radius,
    boss ? 18 : Math.random() < 0.18 ? 24 + Math.random() * 26 : 4,
    motionState.position.z + Math.sin(angle) * radius
  );
  const scale = boss ? 6.5 : elite ? 1.8 : 0.85 + Math.random() * 0.55;
  mesh.scale.setScalar(scale);
  scene.add(mesh);
  const difficulty = 1 + elapsed / 150;
  const hpValue = boss ? 9000 : (elite ? 260 : 54) * difficulty;
  enemies.push({
    id: `hostile-${crypto.randomUUID()}`,
    mesh,
    velocity: new THREE.Vector3(),
    hp: hpValue,
    maxHp: hpValue,
    impact: 0,
    maxImpact: boss ? 620 : elite ? 160 : 80,
    brokenFor: 0,
    recentHitFor: 0,
    speed: boss ? 28 : (elite ? 43 : 48 + Math.random() * 22) * (1 + elapsed / 700),
    damage: boss ? 22 : elite ? 13 : 7,
    radius: boss ? 24 : elite ? 8 : 5,
    elite,
    boss,
    shootClock: 0.5 + Math.random() * 2
  });
}

function enemyCandidate(enemy: Enemy): TargetCandidate {
  return {
    id: enemy.id,
    position: { x: enemy.mesh.position.x, y: enemy.mesh.position.y, z: enemy.mesh.position.z },
    velocity: { x: enemy.velocity.x, y: enemy.velocity.y, z: enemy.velocity.z },
    alive: enemy.hp > 0,
    priority: enemy.boss ? 1 : enemy.elite ? 0.7 : 0
  };
}

function killEnemy(enemy: Enemy) {
  enemy.hp = 0;
  kills++;
  const gem = new THREE.Mesh(gemGeo, gemMat);
  gem.position.copy(enemy.mesh.position);
  scene.add(gem);
  gems.push({ mesh: gem, value: enemy.boss ? 60 : enemy.elite ? 12 : 3 });
  scene.remove(enemy.mesh);
  if (combat.hardLockId === enemy.id) combat.setHardLock(null);
}

function damageEnemy(enemy: Enemy, damage: number, impact: number) {
  const result = combat.applyDamage(
    { health: enemy.hp, impact: enemy.impact, maxImpact: enemy.maxImpact, brokenFor: enemy.brokenFor, recentHitFor: enemy.recentHitFor },
    damage,
    impact
  );
  enemy.hp = result.state.health;
  enemy.impact = result.state.impact;
  enemy.brokenFor = result.state.brokenFor;
  enemy.recentHitFor = result.state.recentHitFor;
  if (result.broke) {
    enemy.mesh.scale.multiplyScalar(1.06);
    setTimeout(() => enemy.hp > 0 && enemy.mesh.scale.multiplyScalar(1 / 1.06), 90);
  }
  if (enemy.hp <= 0) killEnemy(enemy);
}

function firePlayerShot(target: Enemy) {
  const origin = new THREE.Vector3(motionState.position.x, motionState.position.y + 8, motionState.position.z);
  const aim = combat.leadAim(
    { x: origin.x, y: origin.y, z: origin.z },
    enemyCandidate(target),
    310
  );
  const direction = new THREE.Vector3(aim.x - origin.x, aim.y - origin.y, aim.z - origin.z).normalize();
  const shot = new THREE.Mesh(playerShotGeo, playerShotMat);
  shot.position.copy(origin).addScaledVector(direction, 5);
  scene.add(shot);
  shots.push({ mesh: shot, velocity: direction.multiplyScalar(310), damage: build.damage, impact: build.breakImpact, life: 2.2, enemy: false });
}

function fireEnemyShot(enemy: Enemy) {
  const origin = enemy.mesh.position.clone();
  const target = new THREE.Vector3(motionState.position.x, motionState.position.y + 5, motionState.position.z);
  const direction = target.sub(origin).normalize();
  const shot = new THREE.Mesh(playerShotGeo, enemyShotMat);
  shot.scale.setScalar(enemy.boss ? 2.4 : 1.3);
  shot.position.copy(origin);
  scene.add(shot);
  shots.push({ mesh: shot, velocity: direction.multiplyScalar(enemy.boss ? 145 : 110), damage: enemy.boss ? 18 : 7, impact: 0, life: 4.5, enemy: true });
}

function addTracer(a: THREE.Vector3, b: THREE.Vector3, color = 0x86e8ff) {
  const geometry = new THREE.BufferGeometry().setFromPoints([a, b]);
  const line = new THREE.Line(geometry, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.75, toneMapped: false }));
  scene.add(line);
  tracers.push({ line, life: 0.07 });
}

function grantXp(value: number) {
  xp += value;
  while (xp >= nextXp && running) {
    xp -= nextXp;
    level++;
    nextXp = Math.floor(nextXp * 1.22 + 5);
    openUpgrade();
    break;
  }
}

interface Upgrade {
  name: string;
  type: string;
  effect: string;
  description: string;
  apply: () => void;
}

const upgradeBank: Upgrade[] = [
  { name: "Twin Rack", type: "WEAPON", effect: "+1 auto-target", description: "The fire-control lattice tracks another hostile each volley.", apply: () => build.multiTarget = Math.min(4, build.multiTarget + 1) },
  { name: "Vector Capacitor", type: "MOBILITY", effect: "-12% burst cost", description: "Store more directional impulse per reactor cycle.", apply: () => motion.tuning.burstCost = Math.max(7, motion.tuning.burstCost * 0.88) },
  { name: "Reactor Bleed", type: "REACTOR", effect: "+20% EN regen", description: "Aggressive cooling returns energy faster on ground and in air.", apply: () => { motion.tuning.groundEnergyRegenPerSecond *= 1.2; motion.tuning.airEnergyRegenPerSecond *= 1.2; } },
  { name: "Cobalt Rail", type: "ARM WEAPON", effect: "+28% rifle damage", description: "Higher-output magnetic acceleration increases every rifle hit.", apply: () => build.damage *= 1.28 },
  { name: "Overclock", type: "CORE", effect: "+18% fire rate", description: "Shorter weapon cycle time. More shots, more heat, more pressure.", apply: () => build.fireRate *= 1.18 },
  { name: "Aegis Blade", type: "BEAM EMITTER", effect: "+1 orbit blade", description: "A close-defense cutter damages anything that crowds the frame.", apply: () => addOrbiter() },
  { name: "Impact Driver", type: "WEAPON", effect: "+25% break impact", description: "Hits build break pressure faster without increasing raw damage.", apply: () => build.breakImpact *= 1.25 },
  { name: "Long Reach", type: "TARGETING", effect: "+18% target range", description: "Extends soft-lock acquisition and pickup routing distance.", apply: () => { combat.targetTuning.maxRange *= 1.18; build.pickupRange *= 1.12; } },
  { name: "Thruster Vanes", type: "MOBILITY", effect: "+10% glide speed", description: "More lateral authority without changing burst speed.", apply: () => motion.tuning.moveSpeed *= 1.1 },
  { name: "Argent Plating", type: "ARMOR", effect: "+25 max HP", description: "Reinforced armor restores and increases frame integrity.", apply: () => { maxHp += 25; hp = Math.min(maxHp, hp + 25); } }
];

function addOrbiter() {
  build.orbitBlades++;
  const blade = new THREE.Mesh(
    new THREE.BoxGeometry(0.8, 0.25, 5),
    new THREE.MeshBasicMaterial({ color: 0x6be4ff, toneMapped: false })
  );
  scene.add(blade);
  orbiters.push(blade);
}

function openUpgrade() {
  if (pausedForUpgrade || !running) return;
  pausedForUpgrade = true;
  upgradeEl.classList.remove("hidden");
  const choices = [...upgradeBank].sort(() => Math.random() - 0.5).slice(0, 3);
  cardsEl.innerHTML = "";
  for (const upgrade of choices) {
    const button = document.createElement("button");
    button.className = "card";
    button.innerHTML = `<div class="type">${upgrade.type}</div><h2>${upgrade.name}</h2><p>${upgrade.description}</p><strong>${upgrade.effect}</strong>`;
    button.onclick = () => {
      upgrade.apply();
      pausedForUpgrade = false;
      upgradeEl.classList.add("hidden");
    };
    cardsEl.appendChild(button);
  }
}

function resetGame() {
  for (const enemy of enemies) scene.remove(enemy.mesh);
  for (const gem of gems) scene.remove(gem.mesh);
  for (const shot of shots) scene.remove(shot.mesh);
  for (const tracer of tracers) scene.remove(tracer.line);
  for (const blade of orbiters) scene.remove(blade);
  enemies.length = gems.length = shots.length = tracers.length = orbiters.length = 0;
  motionState = createBoostMotionState({ x: 0, y: 0, z: 60 });
  motionState.energy = motion.tuning.maxEnergy;
  hp = maxHp = 100;
  elapsed = 0;
  kills = 0;
  level = 1;
  xp = 0;
  nextXp = 18;
  spawnClock = 0;
  fireClock = 0;
  bossSpawned = false;
  hardLock = false;
  combat.setHardLock(null);
  running = true;
  pausedForUpgrade = false;
  resultEl.classList.add("hidden");
  upgradeEl.classList.add("hidden");
  build.damage = 16;
  build.fireRate = 3.8;
  build.multiTarget = 1;
  build.pickupRange = 32;
  build.orbitBlades = 0;
  build.breakImpact = 28;
  motion.tuning.moveSpeed = 70;
  motion.tuning.burstCost = 16;
  motion.tuning.groundEnergyRegenPerSecond = 46;
  motion.tuning.airEnergyRegenPerSecond = 20;
  combat.targetTuning.maxRange = 700;
  last = performance.now();
}

function endGame(victory: boolean) {
  if (!running) return;
  running = false;
  document.exitPointerLock?.();
  resultTitle.textContent = victory ? "SORTIE SURVIVED" : "FRAME LOST";
  resultStats.textContent = `${kills} kills · level ${level} · ${Math.floor(elapsed)}s survived`;
  resultEl.classList.remove("hidden");
}

addEventListener("keydown", (event) => {
  keys.add(event.code);
  if (["ShiftLeft", "ShiftRight"].includes(event.code) && !event.repeat) burstPressed = true;
  if (event.code === "KeyE" && !event.repeat) overdrivePressed = true;
  if (event.code === "KeyQ" && !event.repeat) {
    hardLock = !hardLock;
    if (!hardLock) combat.setHardLock(null);
  }
  if (pausedForUpgrade && ["Digit1", "Digit2", "Digit3"].includes(event.code)) {
    (cardsEl.children[Number(event.code.at(-1)) - 1] as HTMLButtonElement | undefined)?.click();
  }
});
addEventListener("keyup", (event) => keys.delete(event.code));
canvas.addEventListener("click", () => canvas.requestPointerLock?.());
addEventListener("mousemove", (event) => {
  if (document.pointerLockElement !== canvas || hardLock) return;
  yaw -= event.movementX * 0.0025;
  pitch = THREE.MathUtils.clamp(pitch - event.movementY * 0.0018, -0.75, 0.35);
});
retry.onclick = resetGame;

function updateCamera(dt: number, lockedEnemy: Enemy | null) {
  const playerPos = new THREE.Vector3(motionState.position.x, motionState.position.y + 7, motionState.position.z);
  if (hardLock && lockedEnemy) {
    const delta = lockedEnemy.mesh.position.clone().sub(playerPos);
    const targetYaw = Math.atan2(-delta.x, -delta.z);
    const targetPitch = Math.atan2(delta.y, Math.hypot(delta.x, delta.z)) * 0.5;
    yaw = THREE.MathUtils.damp(yaw, targetYaw, 8, dt);
    pitch = THREE.MathUtils.damp(pitch, targetPitch, 7, dt);
  }
  const distance = 38 + Math.min(18, new THREE.Vector3(motionState.velocity.x, 0, motionState.velocity.z).length() * 0.055);
  const horizontal = Math.cos(pitch) * distance;
  const desired = new THREE.Vector3(
    playerPos.x + Math.sin(yaw) * horizontal,
    playerPos.y + 9 - Math.sin(pitch) * distance,
    playerPos.z + Math.cos(yaw) * horizontal
  );
  camera.position.lerp(desired, 1 - Math.exp(-7 * dt));
  camera.lookAt(playerPos);
  camera.fov = THREE.MathUtils.damp(camera.fov, motionState.overdrive ? 76 : motionState.burstTime > 0 ? 72 : 64, 9, dt);
  camera.updateProjectionMatrix();
}

function getFacing() {
  return { x: -Math.sin(yaw), y: 0, z: -Math.cos(yaw) };
}

function updateEnemies(dt: number) {
  const playerPos = new THREE.Vector3(motionState.position.x, motionState.position.y + 4, motionState.position.z);
  for (let i = enemies.length - 1; i >= 0; i--) {
    const enemy = enemies[i];
    if (enemy.hp <= 0) { enemies.splice(i, 1); continue; }
    const stepped = combat.stepBreak({ health: enemy.hp, impact: enemy.impact, maxImpact: enemy.maxImpact, brokenFor: enemy.brokenFor, recentHitFor: enemy.recentHitFor }, dt);
    enemy.impact = stepped.impact;
    enemy.brokenFor = stepped.brokenFor;
    enemy.recentHitFor = stepped.recentHitFor;
    const toPlayer = playerPos.clone().sub(enemy.mesh.position);
    const distance = toPlayer.length();
    const desiredY = enemy.mesh.position.y > 10 ? motionState.position.y + 16 : 4;
    if (enemy.brokenFor <= 0) {
      const direction = toPlayer.normalize();
      enemy.velocity.lerp(direction.multiplyScalar(enemy.speed), 1 - Math.exp(-3.8 * dt));
      enemy.velocity.y += (desiredY - enemy.mesh.position.y) * dt * 3;
      enemy.mesh.position.addScaledVector(enemy.velocity, dt);
      enemy.mesh.rotation.x += dt * 0.6;
      enemy.mesh.rotation.y += dt * 1.1;
    }
    if (distance < enemy.radius + 5 && invuln <= 0) {
      hp -= enemy.damage * dt * 1.8;
      invuln = 0.08;
    }
    enemy.shootClock -= dt;
    if ((enemy.elite || enemy.boss) && enemy.shootClock <= 0 && distance < 520) {
      fireEnemyShot(enemy);
      enemy.shootClock = enemy.boss ? 0.65 : 1.7;
    }
  }
}

function updateShots(dt: number) {
  const playerPos = new THREE.Vector3(motionState.position.x, motionState.position.y + 5, motionState.position.z);
  for (let i = shots.length - 1; i >= 0; i--) {
    const shot = shots[i];
    const previous = shot.mesh.position.clone();
    shot.mesh.position.addScaledVector(shot.velocity, dt);
    shot.life -= dt;
    if (shot.enemy) {
      if (shot.mesh.position.distanceTo(playerPos) < 4.2 && invuln <= 0) {
        hp -= shot.damage;
        invuln = 0.22;
        shot.life = 0;
      }
    } else {
      for (const enemy of enemies) {
        if (enemy.hp <= 0) continue;
        if (shot.mesh.position.distanceTo(enemy.mesh.position) < enemy.radius + 2) {
          damageEnemy(enemy, shot.damage, shot.impact);
          addTracer(previous, shot.mesh.position.clone());
          shot.life = 0;
          break;
        }
      }
    }
    if (shot.life <= 0) {
      scene.remove(shot.mesh);
      shots.splice(i, 1);
    }
  }
}

function updateGems(dt: number) {
  const playerPos = new THREE.Vector3(motionState.position.x, motionState.position.y + 2, motionState.position.z);
  for (let i = gems.length - 1; i >= 0; i--) {
    const gem = gems[i];
    const distance = gem.mesh.position.distanceTo(playerPos);
    gem.mesh.rotation.y += dt * 4;
    if (distance < build.pickupRange) {
      gem.mesh.position.lerp(playerPos, 1 - Math.exp(-8 * dt));
    }
    if (distance < 4.5) {
      grantXp(gem.value);
      scene.remove(gem.mesh);
      gems.splice(i, 1);
    }
  }
}

function updateOrbiters(time: number, dt: number) {
  const playerPos = new THREE.Vector3(motionState.position.x, motionState.position.y + 5, motionState.position.z);
  orbiters.forEach((blade, index) => {
    const angle = time * 2.5 + index * Math.PI * 2 / Math.max(1, orbiters.length);
    blade.position.copy(playerPos).add(new THREE.Vector3(Math.cos(angle) * 10, Math.sin(time * 3 + index) * 1.5, Math.sin(angle) * 10));
    blade.rotation.y = -angle;
    for (const enemy of enemies) {
      if (enemy.hp > 0 && blade.position.distanceTo(enemy.mesh.position) < enemy.radius + 3) damageEnemy(enemy, 24 * dt, 20 * dt);
    }
  });
}

function currentTargets() {
  return enemies.filter(enemy => enemy.hp > 0).map(enemyCandidate);
}

function resolveTarget(): Enemy | null {
  const candidates = currentTargets();
  const origin = { x: motionState.position.x, y: motionState.position.y + 7, z: motionState.position.z };
  const facing = getFacing();
  if (hardLock) {
    let locked = combat.resolveHardLock(candidates);
    if (!locked) {
      const soft = combat.chooseSoftTarget(origin, facing, candidates);
      if (soft) combat.setHardLock(soft);
      locked = soft;
    }
    return enemies.find(enemy => enemy.id === locked?.id) ?? null;
  }
  const soft = combat.chooseSoftTarget(origin, facing, candidates);
  return enemies.find(enemy => enemy.id === soft?.id) ?? null;
}

function updateFire(dt: number, primary: Enemy | null) {
  fireClock -= dt;
  if (fireClock > 0 || !primary) return;
  const candidates = currentTargets();
  const origin = { x: motionState.position.x, y: motionState.position.y + 7, z: motionState.position.z };
  const facing = getFacing();
  const ordered = candidates
    .map(candidate => ({ candidate, score: candidate.position.x * 0 + Math.hypot(candidate.position.x - origin.x, candidate.position.z - origin.z) }))
    .sort((a, b) => a.score - b.score)
    .map(entry => entry.candidate);
  const targets: Enemy[] = [primary];
  for (const candidate of ordered) {
    if (targets.length >= build.multiTarget) break;
    const enemy = enemies.find(entry => entry.id === candidate.id);
    if (enemy && !targets.includes(enemy) && combat.chooseSoftTarget(origin, facing, [candidate])) targets.push(enemy);
  }
  for (const target of targets) firePlayerShot(target);
  fireClock = 1 / build.fireRate;
}

function updateHUD(target: Enemy | null) {
  hpFill.style.width = `${Math.max(0, hp / maxHp) * 100}%`;
  enFill.style.width = `${motionState.energy / motion.tuning.maxEnergy * 100}%`;
  xpFill.style.width = `${xp / nextXp * 100}%`;
  stateLine.textContent = motionState.overdrive ? "OVERDRIVE" : motionState.burstTime > 0 ? "VECTOR BURST" : motionState.position.y > 1 ? "AIRBORNE" : "BOOST SKATE";
  const remaining = Math.max(0, RUN_SECONDS - elapsed);
  timerEl.textContent = `${String(Math.floor(remaining / 60)).padStart(2, "0")}:${String(Math.floor(remaining % 60)).padStart(2, "0")}`;
  levelEl.textContent = `LV ${level}`;
  killsEl.textContent = `${kills} KILLS`;
  targetEl.textContent = target ? `${hardLock ? "LOCK" : "SOFT"} // ${target.boss ? "BOSS" : target.elite ? "ELITE" : "HOSTILE"}` : "NO TARGET";
  densityEl.textContent = `${enemies.length} HOSTILES`;
}

function loop(now: number) {
  requestAnimationFrame(loop);
  const dt = Math.min(0.033, Math.max(0, (now - last) / 1000));
  last = now;
  if (!running || pausedForUpgrade) {
    renderer.render(scene, camera);
    return;
  }

  elapsed += dt;
  invuln = Math.max(0, invuln - dt);
  spawnClock -= dt;
  if (spawnClock <= 0 && !bossSpawned) {
    const batch = 1 + Math.floor(elapsed / 55);
    for (let i = 0; i < batch; i++) spawnEnemy();
    spawnClock = Math.max(0.12, 0.65 - elapsed / 650);
  }
  if (elapsed >= 210 && !bossSpawned) {
    bossSpawned = true;
    spawnEnemy(true);
  }

  const moveX = Number(keys.has("KeyD") || keys.has("ArrowRight")) - Number(keys.has("KeyA") || keys.has("ArrowLeft"));
  const moveZ = Number(keys.has("KeyW") || keys.has("ArrowUp")) - Number(keys.has("KeyS") || keys.has("ArrowDown"));
  const stepped = motion.step(
    motionState,
    {
      moveX,
      moveZ,
      rise: keys.has("Space"),
      descend: keys.has("ControlLeft") || keys.has("ControlRight") || keys.has("KeyC"),
      burstPressed,
      overdrivePressed
    },
    getFacing(),
    dt,
    0
  );
  motionState = stepped.state;
  if (stepped.events.includes("motion.burst")) invuln = Math.max(invuln, 0.2);
  burstPressed = false;
  overdrivePressed = false;
  motionState.position.x = THREE.MathUtils.clamp(motionState.position.x, -850, 850);
  motionState.position.z = THREE.MathUtils.clamp(motionState.position.z, -850, 850);
  motionState.position.y = THREE.MathUtils.clamp(motionState.position.y, 0, 180);

  mech.position.set(motionState.position.x, motionState.position.y, motionState.position.z);
  mech.rotation.y = yaw;
  const speed = Math.hypot(motionState.velocity.x, motionState.velocity.z);
  mech.rotation.z = THREE.MathUtils.damp(mech.rotation.z, -moveX * Math.min(0.28, speed / 420), 8, dt);
  mech.rotation.x = THREE.MathUtils.damp(mech.rotation.x, moveZ * Math.min(0.12, speed / 700), 8, dt);

  updateEnemies(dt);
  updateShots(dt);
  updateGems(dt);
  updateOrbiters(now / 1000, dt);
  const target = resolveTarget();
  updateFire(dt, target);
  updateCamera(dt, target);
  updateHUD(target);

  for (let i = tracers.length - 1; i >= 0; i--) {
    const tracer = tracers[i];
    tracer.life -= dt;
    const material = tracer.line.material as THREE.LineBasicMaterial;
    material.opacity = Math.max(0, tracer.life / 0.07);
    if (tracer.life <= 0) {
      scene.remove(tracer.line);
      tracer.line.geometry.dispose();
      material.dispose();
      tracers.splice(i, 1);
    }
  }

  if (hp <= 0) endGame(false);
  else if (elapsed >= RUN_SECONDS) endGame(true);

  renderer.render(scene, camera);
}

addEventListener("resize", () => {
  renderer.setSize(innerWidth, innerHeight);
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
});

for (let i = 0; i < 18; i++) spawnEnemy();
requestAnimationFrame(loop);
