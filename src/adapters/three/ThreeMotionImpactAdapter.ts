import type { ImpactRecipe, ImpactSpawnContext } from "../../impact/types.js";
import { MotionImpactBridge } from "../../motion/MotionImpactBridge.js";
import { MotionPlayer } from "../../motion/MotionPlayer.js";
import type { MotionClip, MotionPlayOptions, RigMap } from "../../motion/types.js";
import type { ImpactRuntimeAdapter } from "../../impact/types.js";

export interface ThreeMotionHost {
  loadRig?(rig: RigMap): Promise<void> | void;
  playAnimation(entityId: string, assetUri: string, clipId: string, options: MotionPlayOptions): string;
  stopAnimation(hostInstanceId: string): void;
  seekAnimation?(hostInstanceId: string, timeSeconds: number): void;
  setAnimationSpeed?(hostInstanceId: string, speed: number): void;
}

interface ThreeMotionInstance {
  hostId: string;
  playerId: string;
}

export class ThreeMotionRuntimeAdapter {
  private readonly bridge: MotionImpactBridge;
  private readonly player: MotionPlayer;
  private readonly instances = new Map<string, ThreeMotionInstance>();
  private readonly rigs = new Map<string, RigMap>();
  private readonly recipes = new Map<string, ImpactRecipe>();

  constructor(private readonly host: ThreeMotionHost, impact: ImpactRuntimeAdapter) {
    this.bridge = new MotionImpactBridge(impact);
    this.player = new MotionPlayer(this.bridge);
  }

  registerImpact(recipe: ImpactRecipe): void {
    this.recipes.set(recipe.id, structuredClone(recipe));
    this.bridge.register(recipe);
  }

  loadRig(rig: RigMap): Promise<void> | void {
    this.rigs.set(rig.id, structuredClone(rig));
    return this.host.loadRig?.(rig);
  }

  playClip(entityId: string, clip: MotionClip, options: MotionPlayOptions = {}, context?: ImpactSpawnContext): string {
    const hostId = this.host.playAnimation(entityId, clip.assetUri, clip.id, options);
    const playerId = this.player.play(entityId, clip, options, context);
    this.instances.set(playerId, { hostId, playerId });
    return playerId;
  }

  stopClip(instanceId: string): void {
    const instance = this.instances.get(instanceId);
    if (instance) this.host.stopAnimation(instance.hostId);
    this.player.stop(instanceId);
    this.instances.delete(instanceId);
  }

  seek(instanceId: string, timeSeconds: number): void {
    const instance = this.instances.get(instanceId);
    if (instance) this.host.seekAnimation?.(instance.hostId, timeSeconds);
    this.player.seek(instanceId, timeSeconds);
  }

  setPlaybackSpeed(instanceId: string, speed: number): void {
    const instance = this.instances.get(instanceId);
    if (instance) this.host.setAnimationSpeed?.(instance.hostId, speed);
    this.player.setSpeed(instanceId, speed);
  }

  update(deltaSeconds: number): void {
    this.player.update(deltaSeconds);
  }
}
