import test from "node:test";
import assert from "node:assert/strict";
import { highMobilityCombatFrame } from "../dist/frames/index.js";
import {
  BoostMotionController,
  createBoostMotionState,
  TargetCombatController
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
