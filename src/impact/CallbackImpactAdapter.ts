import { ImpactPlayer, type ImpactPlayerHooks } from "./ImpactPlayer.js";
import type { ImpactRecipe, ImpactRuntimeAdapter, ImpactSpawnContext } from "./types.js";

export class CallbackImpactAdapter implements ImpactRuntimeAdapter {
  private readonly player: ImpactPlayer;

  constructor(hooks: ImpactPlayerHooks) {
    this.player = new ImpactPlayer(hooks);
  }

  play(recipe: ImpactRecipe, context?: ImpactSpawnContext): string {
    return this.player.play(recipe, context);
  }

  stop(instanceId: string): void {
    this.player.stop(instanceId);
  }

  update(deltaSeconds: number): void {
    this.player.update(deltaSeconds);
  }

  getActiveCount(): number {
    return this.player.getActiveCount();
  }
}
