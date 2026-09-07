import { SLU_HUMANOID_REQUIRED_BONES } from "./SLUHumanoidRig.js";
import type { HumanoidBone, RetargetRequest } from "./types.js";

export interface BoneRetargetBinding {
  semantic: HumanoidBone;
  sourceBone: string;
  targetBone: string;
}

export interface RetargetPlan {
  sourceRigId: string;
  targetRigId: string;
  bindings: BoneRetargetBinding[];
  sourceOnly: HumanoidBone[];
  targetOnly: HumanoidBone[];
  requiredMissing: HumanoidBone[];
  scaleRatio: number;
  preserveRootMotion: boolean;
  preserveFootPlants: boolean;
  warnings: string[];
}

export function createRetargetPlan(request: RetargetRequest): RetargetPlan {
  const bindings: BoneRetargetBinding[] = [];
  const sourceOnly: HumanoidBone[] = [];
  const targetOnly: HumanoidBone[] = [];
  const all = new Set<HumanoidBone>([
    ...Object.keys(request.sourceRig.humanoid) as HumanoidBone[],
    ...Object.keys(request.targetRig.humanoid) as HumanoidBone[],
  ]);

  for (const semantic of all) {
    const sourceBone = request.sourceRig.humanoid[semantic];
    const targetBone = request.targetRig.humanoid[semantic];
    if (sourceBone && targetBone) bindings.push({ semantic, sourceBone, targetBone });
    else if (sourceBone) sourceOnly.push(semantic);
    else if (targetBone) targetOnly.push(semantic);
  }

  const requiredMissing = SLU_HUMANOID_REQUIRED_BONES.filter((semantic) =>
    !request.sourceRig.humanoid[semantic] || !request.targetRig.humanoid[semantic]);
  const sourceScale = request.sourceRig.scaleMeters ?? 1;
  const targetScale = request.targetHeightMeters ?? request.targetRig.scaleMeters ?? sourceScale;
  const scaleRatio = sourceScale > 0 ? targetScale / sourceScale : 1;
  const warnings: string[] = [];
  if (requiredMissing.length) warnings.push(`Missing required semantic bones: ${requiredMissing.join(", ")}`);
  if (Math.abs(scaleRatio - 1) > 0.35) warnings.push(`Large retarget scale ratio (${scaleRatio.toFixed(2)}x); verify root motion and stride.`);
  if (request.sourceRig.forwardAxis !== request.targetRig.forwardAxis) warnings.push("Forward-axis conversion required.");
  if (request.sourceRig.upAxis !== request.targetRig.upAxis) warnings.push("Up-axis conversion required.");

  return {
    sourceRigId: request.sourceRig.id,
    targetRigId: request.targetRig.id,
    bindings,
    sourceOnly,
    targetOnly,
    requiredMissing,
    scaleRatio,
    preserveRootMotion: request.preserveRootMotion ?? true,
    preserveFootPlants: request.preserveFootPlants ?? true,
    warnings,
  };
}
