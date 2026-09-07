import {
  MotionImpactBridge,
  createGodotMotionImpactManifest,
  type ImpactRecipe,
  type ImpactRuntimeAdapter,
  type MotionClip,
  type RigMap
} from "../src/index.js";

const mechRig: RigMap = {
  id: "mech.humanoid.v1",
  rootBone: "Root",
  humanoid: {
    hips: "Hips",
    spine: "Spine",
    chest: "Chest",
    head: "Head",
    leftUpperArm: "UpperArm_L",
    leftLowerArm: "LowerArm_L",
    leftHand: "Hand_L",
    rightUpperArm: "UpperArm_R",
    rightLowerArm: "LowerArm_R",
    rightHand: "Hand_R",
    leftUpperLeg: "UpperLeg_L",
    leftLowerLeg: "LowerLeg_L",
    leftFoot: "Foot_L",
    rightUpperLeg: "UpperLeg_R",
    rightLowerLeg: "LowerLeg_R",
    rightFoot: "Foot_R"
  },
  scaleMeters: 1.0,
  forwardAxis: "+Z",
  upAxis: "+Y"
};

const bladeImpact: ImpactRecipe = {
  id: "mech.blade.impact.heavy",
  duration: 0.32,
  cues: [
    { id: "flash", at: 0, channel: "vfx", payload: { preset: "hit.heavy_launch" } },
    { id: "audio", at: 0.01, channel: "audio", payload: { event: "mech.blade.hit.heavy" } },
    { id: "hitstop", at: 0, channel: "gameplay", payload: { seconds: 0.075 } },
    { id: "camera", at: 0, channel: "camera", payload: { shake: 0.42 } }
  ]
};

const mocapSlash: MotionClip = {
  id: "mech.slash.heavy.01",
  source: "mocap",
  assetUri: "assets/mocap/mech_slash_heavy_01.glb",
  duration: 0.9,
  fps: 60,
  sourceRig: mechRig,
  targetRigId: mechRig.id,
  rootMotion: "extract",
  markers: [
    { id: "blade_on", at: 0.28, kind: "hitbox_on", payload: { hitbox: "blade" } },
    { id: "impact", at: 0.41, kind: "impact", recipeId: bladeImpact.id },
    { id: "blade_off", at: 0.50, kind: "hitbox_off", payload: { hitbox: "blade" } },
    { id: "plant", at: 0.63, kind: "foot_plant", payload: { foot: "left" } }
  ]
};

// Any renderer/game can implement this adapter. The bridge is engine-neutral.
const impactRuntime: ImpactRuntimeAdapter = {
  play(recipe) {
    console.log("play impact", recipe.id);
    return crypto.randomUUID();
  },
  stop() {}
};

const bridge = new MotionImpactBridge(impactRuntime);
bridge.register(bladeImpact);
bridge.update("player-slash-1", mocapSlash, 0.38, 0.43, { sourceId: "player", significance: "critical" });

export const godotManifest = createGodotMotionImpactManifest({
  rigs: [mechRig],
  clips: [mocapSlash],
  impacts: [bladeImpact],
  useRootMotion: true
});
