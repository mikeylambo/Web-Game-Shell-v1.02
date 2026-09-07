import type { ImpactRecipe } from "../impact/types.js";
import { createMotionImpactPackage, type MotionImpactPackage } from "./package.js";
import type { MotionClip, MotionMarker, MotionMarkerKind, RigMap } from "./types.js";

export class MotionAuthoringSession {
  private readonly rigs = new Map<string, RigMap>();
  private readonly clips = new Map<string, MotionClip>();
  private readonly impacts = new Map<string, ImpactRecipe>();

  constructor(public readonly id: string) {}

  addRig(rig: RigMap): this {
    this.rigs.set(rig.id, structuredClone(rig));
    return this;
  }

  addClip(clip: MotionClip): this {
    this.clips.set(clip.id, structuredClone(clip));
    return this;
  }

  addImpact(recipe: ImpactRecipe): this {
    this.impacts.set(recipe.id, structuredClone(recipe));
    return this;
  }

  addMarker(clipId: string, marker: MotionMarker): this {
    const clip = this.requireClip(clipId);
    const markers = [...(clip.markers ?? [])].filter((existing) => existing.id !== marker.id);
    markers.push(structuredClone(marker));
    markers.sort((a, b) => a.at - b.at);
    clip.markers = markers;
    return this;
  }

  createMarker(clipId: string, input: {
    id: string;
    at: number;
    kind: MotionMarkerKind;
    recipeId?: string;
    payload?: Record<string, unknown>;
  }): this {
    const clip = this.requireClip(clipId);
    const at = Math.max(0, Math.min(input.at, clip.duration));
    return this.addMarker(clipId, { ...input, at });
  }

  removeMarker(clipId: string, markerId: string): boolean {
    const clip = this.requireClip(clipId);
    const before = clip.markers?.length ?? 0;
    clip.markers = (clip.markers ?? []).filter((marker) => marker.id !== markerId);
    return (clip.markers?.length ?? 0) < before;
  }

  bindImpact(clipId: string, markerId: string, recipeId: string): this {
    if (!this.impacts.has(recipeId)) throw new Error(`Unknown impact recipe '${recipeId}'.`);
    const clip = this.requireClip(clipId);
    const marker = clip.markers?.find((candidate) => candidate.id === markerId);
    if (!marker) throw new Error(`Unknown marker '${markerId}' on clip '${clipId}'.`);
    marker.recipeId = recipeId;
    return this;
  }

  setRootMotion(clipId: string, rootMotion: MotionClip["rootMotion"]): this {
    this.requireClip(clipId).rootMotion = rootMotion;
    return this;
  }

  setTargetRig(clipId: string, rigId: string): this {
    if (!this.rigs.has(rigId)) throw new Error(`Unknown target rig '${rigId}'.`);
    this.requireClip(clipId).targetRigId = rigId;
    return this;
  }

  getClip(clipId: string): MotionClip {
    return structuredClone(this.requireClip(clipId));
  }

  export(metadata?: Record<string, unknown>): MotionImpactPackage {
    return createMotionImpactPackage({
      id: this.id,
      rigs: [...this.rigs.values()].map((rig) => structuredClone(rig)),
      clips: [...this.clips.values()].map((clip) => structuredClone(clip)),
      impacts: [...this.impacts.values()].map((impact) => structuredClone(impact)),
      metadata,
    });
  }

  private requireClip(id: string): MotionClip {
    const clip = this.clips.get(id);
    if (!clip) throw new Error(`Unknown motion clip '${id}'.`);
    return clip;
  }
}
