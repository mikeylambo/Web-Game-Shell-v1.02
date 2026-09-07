import { SLU_HUMANOID_REQUIRED_BONES } from "./SLUHumanoidRig.js";
import type { HumanoidBone, RigMap } from "./types.js";

export interface RigValidationReport {
  valid: boolean;
  missingRequired: HumanoidBone[];
  duplicateBoneNames: string[];
  warnings: string[];
  mappedCount: number;
  requiredCount: number;
  coverage: number;
}

const NORMALIZE_RE = /[^a-z0-9]/g;

const ALIASES: Partial<Record<HumanoidBone, string[]>> = {
  hips: ["hips", "pelvis", "mixamorigHips"],
  spine: ["spine", "spine1", "mixamorigSpine"],
  chest: ["chest", "spine2", "mixamorigSpine1"],
  upperChest: ["upperchest", "spine3", "mixamorigSpine2"],
  neck: ["neck", "mixamorigNeck"],
  head: ["head", "mixamorigHead"],
  leftShoulder: ["leftshoulder", "lshoulder", "mixamorigLeftShoulder"],
  leftUpperArm: ["leftarm", "leftupperarm", "lupperarm", "mixamorigLeftArm"],
  leftLowerArm: ["leftforearm", "leftlowerarm", "lforearm", "mixamorigLeftForeArm"],
  leftHand: ["lefthand", "lhand", "mixamorigLeftHand"],
  rightShoulder: ["rightshoulder", "rshoulder", "mixamorigRightShoulder"],
  rightUpperArm: ["rightarm", "rightupperarm", "rupperarm", "mixamorigRightArm"],
  rightLowerArm: ["rightforearm", "rightlowerarm", "rforearm", "mixamorigRightForeArm"],
  rightHand: ["righthand", "rhand", "mixamorigRightHand"],
  leftUpperLeg: ["leftupleg", "leftupperleg", "lthigh", "mixamorigLeftUpLeg"],
  leftLowerLeg: ["leftleg", "leftlowerleg", "lcalf", "mixamorigLeftLeg"],
  leftFoot: ["leftfoot", "lfoot", "mixamorigLeftFoot"],
  leftToes: ["lefttoe", "lefttoes", "mixamorigLeftToeBase"],
  rightUpperLeg: ["rightupleg", "rightupperleg", "rthigh", "mixamorigRightUpLeg"],
  rightLowerLeg: ["rightleg", "rightlowerleg", "rcalf", "mixamorigRightLeg"],
  rightFoot: ["rightfoot", "rfoot", "mixamorigRightFoot"],
  rightToes: ["righttoe", "righttoes", "mixamorigRightToeBase"],
};

function normalize(value: string): string {
  return value.toLowerCase().replace(NORMALIZE_RE, "");
}

export function inferHumanoidMap(boneNames: string[]): Partial<Record<HumanoidBone, string>> {
  const byNormalized = new Map<string, string>();
  for (const bone of boneNames) byNormalized.set(normalize(bone), bone);
  const result: Partial<Record<HumanoidBone, string>> = {};

  for (const [semantic, aliases] of Object.entries(ALIASES) as [HumanoidBone, string[]][]) {
    for (const alias of aliases) {
      const match = byNormalized.get(normalize(alias));
      if (match) {
        result[semantic] = match;
        break;
      }
    }
  }
  return result;
}

export function buildRigMapFromBones(id: string, boneNames: string[], rootBone?: string): RigMap {
  const humanoid = inferHumanoidMap(boneNames);
  const root = rootBone ?? humanoid.hips ?? boneNames[0] ?? "Root";
  return { id, rootBone: root, humanoid, forwardAxis: "+Z", upAxis: "+Y" };
}

export function validateRigMap(rig: RigMap): RigValidationReport {
  const mapped = Object.values(rig.humanoid).filter((v): v is string => typeof v === "string");
  const missingRequired = SLU_HUMANOID_REQUIRED_BONES.filter((bone) => !rig.humanoid[bone]);
  const counts = new Map<string, number>();
  for (const bone of mapped) counts.set(bone, (counts.get(bone) ?? 0) + 1);
  const duplicateBoneNames = [...counts.entries()].filter(([, count]) => count > 1).map(([bone]) => bone);
  const warnings: string[] = [];
  if (!rig.humanoid.leftToes || !rig.humanoid.rightToes) warnings.push("Toe bones are optional but improve foot locking.");
  if (!rig.humanoid.upperChest) warnings.push("UpperChest is optional; chest twist fidelity may be reduced.");
  const mappedRequired = SLU_HUMANOID_REQUIRED_BONES.length - missingRequired.length;
  return {
    valid: missingRequired.length === 0 && duplicateBoneNames.length === 0,
    missingRequired,
    duplicateBoneNames,
    warnings,
    mappedCount: mapped.length,
    requiredCount: SLU_HUMANOID_REQUIRED_BONES.length,
    coverage: mappedRequired / SLU_HUMANOID_REQUIRED_BONES.length,
  };
}
