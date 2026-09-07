import type { ImpactRecipe, ImpactRuntimeAdapter, ImpactSpawnContext } from "../impact/types.js";
import type { MotionClip, MotionMarker } from "./types.js";

export interface MotionImpactBinding {
  markerId: string;
  recipeId: string;
}

export class MotionImpactBridge {
  private recipes = new Map<string, ImpactRecipe>();
  private fired = new Set<string>();

  constructor(private readonly impact: ImpactRuntimeAdapter) {}

  register(recipe: ImpactRecipe): void {
    this.recipes.set(recipe.id, recipe);
  }

  reset(instanceId: string): void {
    for (const key of this.fired) {
      if (key.startsWith(`${instanceId}:`)) this.fired.delete(key);
    }
  }

  update(instanceId: string, clip: MotionClip, previousTime: number, currentTime: number, context?: ImpactSpawnContext): MotionMarker[] {
    const markers = clip.markers ?? [];
    const firedNow: MotionMarker[] = [];

    for (const marker of markers) {
      if (marker.at <= previousTime || marker.at > currentTime) continue;
      const key = `${instanceId}:${marker.id}`;
      if (this.fired.has(key)) continue;
      this.fired.add(key);
      firedNow.push(marker);

      if (marker.recipeId) {
        const recipe = this.recipes.get(marker.recipeId);
        if (recipe) this.impact.play(recipe, context);
      }
    }

    return firedNow;
  }
}
