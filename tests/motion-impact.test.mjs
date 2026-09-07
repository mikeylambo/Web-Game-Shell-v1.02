import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  SLU_HUMANOID_V1,
  CYBER_RONIN_RIG,
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

test("user-supplied Cyber Ronin rig validates", () => {
  const report = validateRigMap(CYBER_RONIN_RIG);
  assert.equal(report.valid, true);
  assert.equal(report.missingRequired.length, 0);
  assert.equal(report.coverage, 1);
  assert.equal(CYBER_RONIN_RIG.humanoid.rightHand, "hand_r");
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

test("Unreal-style bone names infer into humanoid semantics", () => {
  const bones = [
    "root", "pelvis", "spine_01", "spine_03", "spine_05", "neck_01", "head",
    "clavicle_l", "upperarm_l", "lowerarm_l", "hand_l",
    "clavicle_r", "upperarm_r", "lowerarm_r", "hand_r",
    "thigh_l", "calf_l", "foot_l", "ball_l",
    "thigh_r", "calf_r", "foot_r", "ball_r",
  ];
  const rig = buildRigMapFromBones("unreal-test", bones, "root");
  const report = validateRigMap(rig);
  assert.equal(report.valid, true);
  assert.equal(report.coverage, 1);
  assert.equal(rig.humanoid.leftUpperArm, "upperarm_l");
  assert.equal(rig.humanoid.rightToes, "ball_r");
});

test("retarget plan binds shared semantic bones", () => {
  const plan = createRetargetPlan({ clip: { id:"x", source:"mocap", assetUri:"x.glb", duration:1 }, sourceRig: SLU_HUMANOID_V1, targetRig: SLU_HUMANOID_V1 });
  assert.equal(plan.requiredMissing.length, 0);
  assert.ok(plan.bindings.length >= 17);
  assert.equal(plan.scaleRatio, 1);
});

test("canonical motion retargets cleanly to Cyber Ronin", () => {
  const plan = createRetargetPlan({
    clip: { id:"slash", source:"procedural", assetUri:"slash.glb", duration:.92, targetRigId:CYBER_RONIN_RIG.id },
    sourceRig: SLU_HUMANOID_V1,
    targetRig: CYBER_RONIN_RIG,
    preserveRootMotion: true,
    preserveFootPlants: true,
  });
  assert.equal(plan.requiredMissing.length, 0);
  assert.equal(plan.bindings.length, 22);
  assert.equal(plan.scaleRatio, 1);
  assert.equal(plan.preserveRootMotion, true);
  assert.equal(plan.preserveFootPlants, true);
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

test("Cyber Ronin certification package validates and preserves markers in adapters", () => {
  const pkg = JSON.parse(readFileSync(new URL("../examples/cyber-ronin-heavy-slash.slu-motion-impact.json", import.meta.url), "utf8"));
  const report = validateMotionImpactPackage(pkg);
  assert.equal(report.valid, true, JSON.stringify(report.issues));
  assert.equal(pkg.clips[0].targetRigId, CYBER_RONIN_RIG.id);
  assert.ok(pkg.clips[0].markers.some((marker) => marker.kind === "impact"));
  assert.ok(pkg.clips[0].markers.some((marker) => marker.kind === "cancel_open"));

  const godot = new GodotMotionImpactAdapter().exportPackage(pkg);
  const unity = new UnityMotionImpactAdapter().exportPackage(pkg);
  const godotTracks = JSON.parse(godot.find((a) => a.path.endsWith("motion-marker-tracks.json")).content);
  const unityEvents = JSON.parse(unity.find((a) => a.path.endsWith("motion-marker-events.json")).content);
  assert.equal(godotTracks["ronin.heavy_slash.motion"].length, pkg.clips[0].markers.length);
  assert.equal(unityEvents["ronin.heavy_slash.motion"].length, pkg.clips[0].markers.length);
});
