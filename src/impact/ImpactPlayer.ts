import { significanceAtLeast } from "./ImpactLibrary.js";
import type { ImpactCue, ImpactRecipe, ImpactSignificance, ImpactSpawnContext } from "./types.js";

export interface ImpactPlayerHooks {
  onCue(instanceId: string, recipe: ImpactRecipe, cue: ImpactCue, context: ImpactSpawnContext): void;
  onComplete?(instanceId: string, recipe: ImpactRecipe): void;
}

interface ActiveImpact {
  id: string;
  recipe: ImpactRecipe;
  context: ImpactSpawnContext;
  time: number;
  fired: Set<string>;
}

let nextImpactId = 1;

export class ImpactPlayer {
  private readonly active = new Map<string, ActiveImpact>();

  constructor(private readonly hooks: ImpactPlayerHooks) {}

  play(recipe: ImpactRecipe, context: ImpactSpawnContext = {}): string {
    const id = `impact:${nextImpactId++}`;
    const normalized: ImpactSpawnContext = {
      significance: context.significance ?? "normal",
      seed: context.seed ?? 1,
      ...context,
    };
    this.active.set(id, { id, recipe: structuredClone(recipe), context: normalized, time: 0, fired: new Set() });
    this.dispatchDue(this.active.get(id)!, 0, 0);
    return id;
  }

  stop(instanceId: string): void {
    this.active.delete(instanceId);
  }

  update(deltaSeconds: number): void {
    if (!Number.isFinite(deltaSeconds) || deltaSeconds <= 0) return;
    for (const state of [...this.active.values()]) {
      const previous = state.time;
      state.time = Math.min(state.recipe.duration, state.time + deltaSeconds);
      this.dispatchDue(state, previous, state.time);
      if (state.time >= state.recipe.duration) {
        this.hooks.onComplete?.(state.id, state.recipe);
        this.active.delete(state.id);
      }
    }
  }

  private dispatchDue(state: ActiveImpact, previous: number, current: number): void {
    const significance: ImpactSignificance = state.context.significance ?? "normal";
    for (const cue of state.recipe.cues) {
      if (state.fired.has(cue.id)) continue;
      if (cue.at < previous || cue.at > current) continue;
      if (cue.minSignificance && !significanceAtLeast(significance, cue.minSignificance)) continue;
      state.fired.add(cue.id);
      this.hooks.onCue(state.id, state.recipe, cue, state.context);
    }
  }

  getActiveCount(): number {
    return this.active.size;
  }
}
