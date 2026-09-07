import test from "node:test";
import assert from "node:assert/strict";
import { highMobilityCombatFrame } from "../dist/frames/index.js";
import {
  BoostMotionController,
  createBoostMotionState,
  TargetCombatController,
  TuningStore,
  RuntimeEventBus,
  ObjectPool,
  SpatialHash,
  HeightField,
  PerformanceSampler,
  StreamedWorldGrid,
  HighMobilityEnemyBrain,
  DEFAULT_MECH_ARCHETYPES,
  BossPhaseController
} from "../dist/modules/index.js";

test("high mobility frame exposes survival and tuning flow", () => {
  const frame = highMobilityCombatFrame();
  assert.equal(frame.id, "high-mobility-combat");
  assert.ok(frame.modes.some((mode) => mode.id === "survival"));
  assert.ok(frame.menuFlow.some((step) => step.id === "tuning"));
});

test("burst spends energy and produces a burst event", () => {
  const controller = new BoostMotionController();
  const initial = createBoostMotionState();
  const { state, events } = controller.step(
    initial,
    {
      moveX: 1,
      moveZ: 0,
      rise: false,
      descend: false,
      burstPressed: true,
      overdrivePressed: false
    },
    { x: 0, y: 0, z: -1 },
    1 / 60
  );

  assert.ok(events.includes("motion.burst"));
  assert.ok(state.energy < initial.energy);
  assert.ok(Math.abs(state.velocity.x) > controller.tuning.moveSpeed);
});

test("soft target favors the centered candidate and lead aim predicts motion", () => {
  const controller = new TargetCombatController();
  const candidates = [
    { id: "center", position: { x: 0, y: 0, z: -100 }, velocity: { x: 10, y: 0, z: 0 } },
    { id: "edge", position: { x: 50, y: 0, z: -100 } }
  ];

  const target = controller.chooseSoftTarget(
    { x: 0, y: 0, z: 0 },
    { x: 0, y: 0, z: -1 },
    candidates
  );

  assert.equal(target?.id, "center");
  const aim = controller.leadAim({ x: 0, y: 0, z: 0 }, candidates[0], 100);
  assert.ok(aim.x > candidates[0].position.x);
});

test("impact can trigger break and broken targets take bonus damage", () => {
  const controller = new TargetCombatController();
  const base = { health: 1000, impact: 90, maxImpact: 100, brokenFor: 0, recentHitFor: 0 };
  const broken = controller.applyDamage(base, 100, 20);
  assert.equal(broken.broke, true);
  assert.ok(broken.state.brokenFor > 0);

  const followup = controller.applyDamage(broken.state, 100, 0);
  assert.ok(followup.damageApplied > 100);
});

test("live tuning store publishes changed values", () => {
  const tuning = new TuningStore({ speed: 10, assist: true });
  let observed = null;
  tuning.subscribe((snapshot, key) => observed = { snapshot, key });
  tuning.set("speed", 14);
  assert.equal(tuning.get("speed"), 14);
  assert.equal(observed.key, "speed");
  assert.equal(observed.snapshot.speed, 14);
});

test("event bus and object pool provide allocation-light runtime primitives", () => {
  const bus = new RuntimeEventBus();
  let payload = 0;
  bus.on("hit", (value) => payload = value);
  bus.emit("hit", 7);
  assert.equal(payload, 7);

  let created = 0;
  const pool = new ObjectPool(() => ({ id: ++created, value: 0 }), (item) => item.value = 0, 1);
  const first = pool.acquire();
  first.value = 9;
  assert.equal(pool.activeCount, 1);
  pool.release(first);
  assert.equal(first.value, 0);
  assert.equal(pool.acquire(), first);
});

test("spatial hash queries nearby entries and height field interpolates", () => {
  const hash = new SpatialHash(50);
  hash.upsert({ id: "near", position: { x: 20, y: 0, z: 10 }, radius: 2 });
  hash.upsert({ id: "far", position: { x: 400, y: 0, z: 400 }, radius: 2 });
  assert.deepEqual(hash.queryRadius({ x: 0, y: 0, z: 0 }, 60).map((entry) => entry.id), ["near"]);

  const field = new HeightField(10, (x, z) => x + z);
  assert.equal(field.heightAt(5, 5), 1);
});

test("world streaming biases its loaded center along velocity and unloads old cells", () => {
  const loads = [], unloads = [];
  const grid = new StreamedWorldGrid(
    { cellSize: 100, fullRadiusCells: 0, farRadiusCells: 1, velocityBiasSeconds: 1 },
    { load: (cell) => loads.push(cell), unload: (cell) => unloads.push(cell) }
  );
  grid.update({ x: 0, y: 0, z: 0 }, { x: 220, y: 0, z: 0 });
  assert.ok(grid.snapshot().some((cell) => cell.id.x === 2));
  grid.update({ x: 900, y: 0, z: 0 }, { x: 0, y: 0, z: 0 });
  assert.ok(unloads.length > 0);
});

test("enemy brain exposes five profiles and deterministic nine-state decisions", () => {
  assert.equal(DEFAULT_MECH_ARCHETYPES.length, 5);
  const brain = new HighMobilityEnemyBrain(DEFAULT_MECH_ARCHETYPES[0]);
  const command = brain.step({
    selfPosition: { x: 0, y: 0, z: 0 },
    targetPosition: { x: 0, y: 0, z: 300 },
    lineOfSight: true,
    incomingThreat: false,
    broken: false,
    healthFraction: 1,
    attackReady: true
  }, 1 / 60);
  assert.equal(command.state, "approach");
  assert.equal(command.move, "approach");
});

test("boss controller changes phases and detaches armor plates", () => {
  const boss = new BossPhaseController(1000, [{ id: "left", maxHealth: 100 }, { id: "right", maxHealth: 100 }]);
  assert.equal(boss.step(1000).phase.id, "phase-1");
  boss.damagePlate("left", 120);
  assert.deepEqual(boss.step(550).detachedPlates, ["left"]);
  assert.equal(boss.step(200).phase.id, "phase-3");
});

test("performance sampler emits a rolling performance snapshot", () => {
  const sampler = new PerformanceSampler();
  let snapshot = null;
  for (let i = 0; i < 40; i++) snapshot = sampler.sample(1 / 60) ?? snapshot;
  assert.ok(snapshot);
  assert.ok(snapshot.fps > 50);
  assert.ok(snapshot.frameMs > 0);
});
