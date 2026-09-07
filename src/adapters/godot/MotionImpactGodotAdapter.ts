import type { ImpactRecipe } from "../../impact/types.js";
import type { MotionClip, RigMap } from "../../motion/types.js";

export interface GodotMotionImpactManifest {
  version: 1;
  rigs: RigMap[];
  clips: MotionClip[];
  impacts: ImpactRecipe[];
  importHints: {
    animationPlayerNode: string;
    skeletonNode: string;
    useRootMotion: boolean;
    markerSignal: string;
  };
}

export function createGodotMotionImpactManifest(input: {
  rigs?: RigMap[];
  clips?: MotionClip[];
  impacts?: ImpactRecipe[];
  useRootMotion?: boolean;
}): GodotMotionImpactManifest {
  return {
    version: 1,
    rigs: input.rigs ?? [],
    clips: input.clips ?? [],
    impacts: input.impacts ?? [],
    importHints: {
      animationPlayerNode: "AnimationPlayer",
      skeletonNode: "Skeleton3D",
      useRootMotion: input.useRootMotion ?? true,
      markerSignal: "slu_motion_marker"
    }
  };
}

export function godotMarkerMethodTrack(clip: MotionClip): Array<{ time: number; method: string; args: unknown[] }> {
  return (clip.markers ?? []).map((marker) => ({
    time: marker.at,
    method: "_slu_motion_marker",
    args: [marker.id, marker.kind, marker.recipeId ?? "", marker.payload ?? {}]
  }));
}
