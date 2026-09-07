import test from "node:test";
import assert from "node:assert/strict";
import {
  SLU_HUMANOID_V1,
  buildRigMapFromBones,
  validateRigMap,
  createRetargetPlan,
  MotionAuthoringSession,
  validateMotionImpactPackage,
  ImpactPlayer,
  CallbackImpactAdapter,
  MotionImpactBridge,
  MotionPlayer,
  GodotMotionImpactAdapter,
  UnityMotionImpactAdapter,
} from "../dist/index.js";

test("canonical SLU humanoid validates", () => {
  const report = validateRigMap(SLU_HUMANOID_V1);
  assert.equal(report.valid, true);
  assert.equal(report.missingRequired.length, 0);
});

test("Mixamo-style bone names infer into humanoid semantics", () => {
  const bones = [
    "mixamorigHips", "mixamorigSpine", "mixamorigSpine1", "mixamorigNeck", "mixamorigHead",
    "mixamorigLeftArm", "mixamorigLeftForeArm", "mixamorigLeftHand",
    "mixamorigRightArm", "mixamorigRightForeArm", "mixamorigRightHand",
    "mixamorigLeftUpLeg", "mixamorigLeftLeg", "mixamorigLeftFoot",
    "mixamorigRightUpLeg", "mixamorigRightLeg", "mixamorigRightFoot",
  ];
  const rig = buildRigMapFromBones("mixamo-test", bones);
  const report = validateRigMap(rig);
  assert.equal(report.valid, true);
  assert.equal(rig.humanoid.leftHand, "mixamorigLeftHand");
});

test("retarget plan binds shared semantic bones", () => {
  const plan = createRetargetPlan({ clip: { id:"x", source:"mocap", assetUri:"x.glb", duration:1 }, sourceRig: SLU_HUMANOID_V1, targetRig: SLU_HUMANOID_V1 });
  assert.equal(plan.requiredMissing.length, 0);
  assert.ok(plan.bindings.length >= 17);
  assert.equal(plan.scaleRatio, 1);
});

test("authoring session creates a valid package and binds impacts", () => {
  const impact = { id:"mech.hit", duration:.2, cues:[{ id:"spark", at:0, channel:"vfx", payload:{ primitive:"burst" } }] };
  const session = new MotionAuthoringSession("mech-pack")
    .addRig(SLU_HUMANOID_V1)
    .addImpact(impact)
    .addClip({ id:"slash", source:"mocap", assetUri:"slash.glb", duration:1, targetRigId:SLU_HUMANOID_V1.id });
  session.createMarker("slash", { id:"impact", at:.4, kind:"impact" }).bindImpact("slash", "impact", "mech.hit");
  const pkg = session.export();
  const report = validateMotionImpactPackage(pkg);
  assert.equal(report.valid, true);
  assert.equal(pkg.clips[0].markers[0].recipeId, "mech.hit");
});

test("impact player respects significance filtering", () => {
  const fired = [];
  const player = new ImpactPlayer({ onCue(_id,_recipe,cue){ fired.push(cue.id); } });
  player.play({ id:"hit", duration:.2, cues:[
    { id:"base", at:0, channel:"vfx" },
    { id:"critical", at:.1, channel:"camera", minSignificance:"critical" },
  ]}, { significance:"normal" });
  player.update(.2);
  assert.deepEqual(fired, ["base"]);
});

test("motion markers trigger bound impact recipes", () => {
  const cues = [];
  const impact = new CallbackImpactAdapter({ onCue(_id, recipe, cue){ cues.push(`${recipe.id}:${cue.id}`); } });
  const bridge = new MotionImpactBridge(impact);
  bridge.register({ id:"slash.hit", duration:.1, cues:[{ id:"flash", at:0, channel:"vfx" }] });
  const player = new MotionPlayer(bridge);
  player.play("mech", { id:"slash", source:"mocap", assetUri:"slash.glb", duration:1, markers:[{ id:"impact", at:.25, kind:"impact", recipeId:"slash.hit" }] });
  player.update(.3);
  impact.update(0.001);
  assert.deepEqual(cues, ["slash.hit:flash"]);
});

test("Godot and Unity adapters emit engine artifacts", () => {
  const pkg = { schema:"slu-motion-impact", version:1, id:"test", rigs:[SLU_HUMANOID_V1], clips:[], impacts:[] };
  const godot = new GodotMotionImpactAdapter().exportPackage(pkg);
  const unity = new UnityMotionImpactAdapter().exportPackage(pkg);
  assert.ok(godot.some((a) => a.path.endsWith(".gd")));
  assert.ok(unity.some((a) => a.path.endsWith(".cs")));
  assert.ok(godot.some((a) => a.kind === "manifest"));
  assert.ok(unity.some((a) => a.kind === "manifest"));
});
