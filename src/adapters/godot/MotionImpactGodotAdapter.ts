import type { ImpactRecipe } from "../../impact/types.js";
import type { MotionImpactPackage } from "../../motion/package.js";
import type { MotionClip, RigMap } from "../../motion/types.js";
import type { AdapterArtifact, MotionImpactAdapterOptions, MotionImpactEngineAdapter } from "../MotionImpactAdapter.js";

export interface GodotMotionImpactManifest {
  version: 1;
  packageId?: string;
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
  packageId?: string;
  rigs?: RigMap[];
  clips?: MotionClip[];
  impacts?: ImpactRecipe[];
  useRootMotion?: boolean;
  animationPlayerNode?: string;
  skeletonNode?: string;
}): GodotMotionImpactManifest {
  return {
    version: 1,
    packageId: input.packageId,
    rigs: input.rigs ?? [],
    clips: input.clips ?? [],
    impacts: input.impacts ?? [],
    importHints: {
      animationPlayerNode: input.animationPlayerNode ?? "AnimationPlayer",
      skeletonNode: input.skeletonNode ?? "Skeleton3D",
      useRootMotion: input.useRootMotion ?? true,
      markerSignal: "slu_motion_marker",
    },
  };
}

export function godotMarkerMethodTrack(clip: MotionClip): Array<{ time: number; method: string; args: unknown[] }> {
  return (clip.markers ?? []).map((marker) => ({
    time: marker.at,
    method: "_slu_motion_marker",
    args: [marker.id, marker.kind, marker.recipeId ?? "", marker.payload ?? {}],
  }));
}

export function generateGodotRuntimeBridge(): string {
  return `class_name SLUMotionImpactBridge\nextends Node\n\nsignal slu_motion_marker(marker_id: String, kind: String, recipe_id: String, payload: Dictionary)\nsignal slu_impact_requested(recipe_id: String, context: Dictionary)\n\nvar impact_recipes: Dictionary = {}\n\nfunc load_manifest(manifest: Dictionary) -> void:\n    impact_recipes.clear()\n    for recipe in manifest.get("impacts", []):\n        impact_recipes[recipe.get("id", "")] = recipe\n\nfunc _slu_motion_marker(marker_id: String, kind: String, recipe_id: String = "", payload: Dictionary = {}) -> void:\n    slu_motion_marker.emit(marker_id, kind, recipe_id, payload)\n    if recipe_id != "":\n        play_impact(recipe_id, payload)\n\nfunc play_impact(recipe_id: String, context: Dictionary = {}) -> void:\n    if not impact_recipes.has(recipe_id):\n        push_warning("SLU impact recipe not found: " + recipe_id)\n        return\n    slu_impact_requested.emit(recipe_id, context)\n`;
}

export function generateGodotImportGuide(manifestPath = "res://slu/motion-impact.json"): string {
  return `# SLU Motion/Impact Godot Adapter\n\n1. Import character + animation GLB/FBX into Godot.\n2. Add SLUMotionImpactBridge.gd to your actor or presentation root.\n3. Load ${manifestPath} into the bridge at startup.\n4. Add method tracks to AnimationPlayer using each clip's marker list.\n5. Route slu_impact_requested to your Godot VFX/audio/camera implementation.\n6. For root motion clips, set AnimationTree root motion tracks to the imported root bone.\n`;
}

export class GodotMotionImpactAdapter implements MotionImpactEngineAdapter {
  readonly id = "godot-4";
  readonly displayName = "Godot 4";

  exportPackage(pkg: MotionImpactPackage, options: MotionImpactAdapterOptions = {}): AdapterArtifact[] {
    const manifest = createGodotMotionImpactManifest({
      packageId: pkg.id,
      rigs: pkg.rigs,
      clips: pkg.clips,
      impacts: pkg.impacts,
      useRootMotion: options.rootMotion,
      animationPlayerNode: options.animationPlayerPath,
      skeletonNode: options.skeletonPath,
    });
    const markerTracks = Object.fromEntries(pkg.clips.map((clip) => [clip.id, godotMarkerMethodTrack(clip)]));
    return [
      { path: "slu/motion-impact.json", content: JSON.stringify(manifest, null, 2), kind: "manifest" },
      { path: "slu/motion-marker-tracks.json", content: JSON.stringify(markerTracks, null, 2), kind: "resource" },
      { path: "slu/SLUMotionImpactBridge.gd", content: generateGodotRuntimeBridge(), kind: "script" },
      { path: "slu/README.md", content: generateGodotImportGuide(), kind: "documentation" },
    ];
  }
}
