export type HumanoidBone =
  | "hips" | "spine" | "chest" | "neck" | "head"
  | "leftShoulder" | "leftUpperArm" | "leftLowerArm" | "leftHand"
  | "rightShoulder" | "rightUpperArm" | "rightLowerArm" | "rightHand"
  | "leftUpperLeg" | "leftLowerLeg" | "leftFoot" | "leftToes"
  | "rightUpperLeg" | "rightLowerLeg" | "rightFoot" | "rightToes";

export interface RigMap {
  id: string;
  rootBone: string;
  humanoid: Partial<Record<HumanoidBone, string>>;
  scaleMeters?: number;
  forwardAxis?: "+Z" | "-Z" | "+X" | "-X";
  upAxis?: "+Y" | "+Z";
}

export type MotionMarkerKind =
  | "impact" | "hitbox_on" | "hitbox_off" | "foot_plant"
  | "vfx" | "audio" | "camera" | "gameplay" | "custom";

export interface MotionMarker {
  id: string;
  at: number;
  kind: MotionMarkerKind;
  recipeId?: string;
  payload?: Record<string, unknown>;
}

export interface MotionClip {
  id: string;
  source: "mocap" | "keyframed" | "procedural" | "imported";
  assetUri: string;
  duration: number;
  fps?: number;
  sourceRig?: RigMap;
  targetRigId?: string;
  loop?: boolean;
  rootMotion?: "none" | "extract" | "apply";
  markers?: MotionMarker[];
  tags?: string[];
}

export interface RetargetRequest {
  clip: MotionClip;
  sourceRig: RigMap;
  targetRig: RigMap;
  preserveRootMotion?: boolean;
  preserveFootPlants?: boolean;
}

export interface RetargetResult {
  clipId: string;
  outputAssetUri: string;
  warnings: string[];
  unmappedBones: string[];
}

export interface MotionRuntimeAdapter {
  loadRig(rig: RigMap): Promise<void> | void;
  playClip(entityId: string, clip: MotionClip, options?: { blendSeconds?: number; speed?: number }): string;
  stopClip(instanceId: string): void;
  retarget?(request: RetargetRequest): Promise<RetargetResult>;
}
