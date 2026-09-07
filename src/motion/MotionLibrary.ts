import type { MotionClip, RigMap } from "./types.js";

export class MotionLibrary {
  private readonly rigs = new Map<string, RigMap>();
  private readonly clips = new Map<string, MotionClip>();

  registerRig(rig: RigMap): void {
    this.rigs.set(rig.id, structuredClone(rig));
  }

  registerClip(clip: MotionClip): void {
    this.clips.set(clip.id, structuredClone(clip));
  }

  registerPack(pack: { rigs?: RigMap[]; clips?: MotionClip[] }): void {
    for (const rig of pack.rigs ?? []) this.registerRig(rig);
    for (const clip of pack.clips ?? []) this.registerClip(clip);
  }

  getRig(id: string): RigMap | undefined {
    const rig = this.rigs.get(id);
    return rig ? structuredClone(rig) : undefined;
  }

  getClip(id: string): MotionClip | undefined {
    const clip = this.clips.get(id);
    return clip ? structuredClone(clip) : undefined;
  }

  listRigs(): RigMap[] {
    return [...this.rigs.values()].map((rig) => structuredClone(rig));
  }

  listClips(tags?: string[]): MotionClip[] {
    const required = tags ?? [];
    return [...this.clips.values()]
      .filter((clip) => required.every((tag) => clip.tags?.includes(tag)))
      .map((clip) => structuredClone(clip));
  }

  removeClip(id: string): boolean {
    return this.clips.delete(id);
  }

  clear(): void {
    this.rigs.clear();
    this.clips.clear();
  }
}
