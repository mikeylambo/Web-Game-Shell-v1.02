import { ImpactLibrary } from "../impact/ImpactLibrary.js";
import type { ImpactRuntimeAdapter, ImpactSpawnContext } from "../impact/types.js";
import { MotionLibrary } from "./MotionLibrary.js";
import { MotionImpactBridge } from "./MotionImpactBridge.js";
import { MotionPlayer } from "./MotionPlayer.js";
import { MoveLibrary, type MoveAsset } from "./MoveAsset.js";
import type { MotionImpactPackage } from "./package.js";
import type { MotionPlayOptions } from "./types.js";

export class MotionImpactRuntime {
  readonly motions = new MotionLibrary();
  readonly impacts = new ImpactLibrary();
  readonly moves = new MoveLibrary();
  readonly bridge: MotionImpactBridge;
  readonly player: MotionPlayer;

  constructor(private readonly impactRuntime: ImpactRuntimeAdapter) {
    this.bridge = new MotionImpactBridge(impactRuntime);
    this.player = new MotionPlayer(this.bridge);
  }

  registerPackage(pkg: MotionImpactPackage): void {
    this.motions.registerPack({ rigs: pkg.rigs, clips: pkg.clips });
    this.impacts.registerPack(pkg.impacts);
    for (const recipe of pkg.impacts) this.bridge.register(recipe);
  }

  registerMove(move: MoveAsset): void {
    this.moves.register(move);
  }

  playMove(entityId: string, moveId: string, options: MotionPlayOptions = {}, context: ImpactSpawnContext = {}): string {
    const move = this.moves.get(moveId);
    if (!move) throw new Error(`Unknown move '${moveId}'.`);
    const clip = this.motions.getClip(move.clipId);
    if (!clip) throw new Error(`Move '${moveId}' references unknown clip '${move.clipId}'.`);
    const mergedOptions: MotionPlayOptions = { ...(move.defaultPlayback ?? {}), ...options };
    const mergedContext: ImpactSpawnContext = {
      ...(move.defaultImpactContext ?? {}),
      ...context,
      parameters: {
        ...(move.defaultImpactContext?.parameters ?? {}),
        ...(context.parameters ?? {}),
      },
    };
    return this.player.play(entityId, clip, mergedOptions, mergedContext);
  }

  stop(instanceId: string): void {
    this.player.stop(instanceId);
  }

  update(deltaSeconds: number): void {
    this.player.update(deltaSeconds);
    this.impactRuntime.update?.(deltaSeconds);
  }
}
