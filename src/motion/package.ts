import type { ImpactRecipe } from "../impact/types.js";
import type { MotionClip, RigMap } from "./types.js";

export interface MotionImpactPackage {
  schema: "slu-motion-impact";
  version: 1;
  id: string;
  rigs: RigMap[];
  clips: MotionClip[];
  impacts: ImpactRecipe[];
  metadata?: Record<string, unknown>;
}

export interface PackageValidationIssue {
  severity: "error" | "warning";
  path: string;
  message: string;
}

export interface PackageValidationReport {
  valid: boolean;
  issues: PackageValidationIssue[];
}

export function validateMotionImpactPackage(pkg: MotionImpactPackage): PackageValidationReport {
  const issues: PackageValidationIssue[] = [];
  const rigIds = new Set<string>();
  const clipIds = new Set<string>();
  const impactIds = new Set<string>();

  for (const rig of pkg.rigs) {
    if (rigIds.has(rig.id)) issues.push({ severity: "error", path: `rigs.${rig.id}`, message: "Duplicate rig id." });
    rigIds.add(rig.id);
  }
  for (const clip of pkg.clips) {
    if (clipIds.has(clip.id)) issues.push({ severity: "error", path: `clips.${clip.id}`, message: "Duplicate clip id." });
    clipIds.add(clip.id);
    if (clip.duration <= 0) issues.push({ severity: "error", path: `clips.${clip.id}.duration`, message: "Duration must be greater than zero." });
    if (clip.targetRigId && !rigIds.has(clip.targetRigId)) issues.push({ severity: "warning", path: `clips.${clip.id}.targetRigId`, message: `Target rig '${clip.targetRigId}' is not included in package.` });
    for (const marker of clip.markers ?? []) {
      if (marker.at < 0 || marker.at > clip.duration) issues.push({ severity: "error", path: `clips.${clip.id}.markers.${marker.id}`, message: "Marker time is outside clip duration." });
    }
  }
  for (const impact of pkg.impacts) {
    if (impactIds.has(impact.id)) issues.push({ severity: "error", path: `impacts.${impact.id}`, message: "Duplicate impact id." });
    impactIds.add(impact.id);
    if (impact.duration < 0) issues.push({ severity: "error", path: `impacts.${impact.id}.duration`, message: "Duration cannot be negative." });
    for (const cue of impact.cues) {
      if (cue.at < 0 || cue.at > impact.duration) issues.push({ severity: "error", path: `impacts.${impact.id}.cues.${cue.id}`, message: "Cue time is outside recipe duration." });
    }
  }

  for (const clip of pkg.clips) {
    for (const marker of clip.markers ?? []) {
      if (marker.recipeId && !impactIds.has(marker.recipeId)) issues.push({ severity: "warning", path: `clips.${clip.id}.markers.${marker.id}.recipeId`, message: `Impact recipe '${marker.recipeId}' is not included in package.` });
    }
  }

  return { valid: !issues.some((issue) => issue.severity === "error"), issues };
}

export function createMotionImpactPackage(input: Omit<MotionImpactPackage, "schema" | "version">): MotionImpactPackage {
  return { schema: "slu-motion-impact", version: 1, ...input };
}
