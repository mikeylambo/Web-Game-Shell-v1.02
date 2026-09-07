import type { ImpactRecipe, ImpactSignificance } from "./types.js";

const SIGNIFICANCE_ORDER: ImpactSignificance[] = ["chaff", "normal", "critical", "boss", "cinematic"];

export function significanceAtLeast(value: ImpactSignificance, minimum: ImpactSignificance): boolean {
  return SIGNIFICANCE_ORDER.indexOf(value) >= SIGNIFICANCE_ORDER.indexOf(minimum);
}

export class ImpactLibrary {
  private readonly recipes = new Map<string, ImpactRecipe>();

  register(recipe: ImpactRecipe): void {
    this.recipes.set(recipe.id, structuredClone(recipe));
  }

  registerPack(recipes: ImpactRecipe[]): void {
    for (const recipe of recipes) this.register(recipe);
  }

  get(id: string): ImpactRecipe | undefined {
    const recipe = this.recipes.get(id);
    return recipe ? structuredClone(recipe) : undefined;
  }

  list(tags?: string[]): ImpactRecipe[] {
    const required = tags ?? [];
    return [...this.recipes.values()]
      .filter((recipe) => required.every((tag) => recipe.tags?.includes(tag)))
      .map((recipe) => structuredClone(recipe));
  }

  remove(id: string): boolean {
    return this.recipes.delete(id);
  }

  clear(): void {
    this.recipes.clear();
  }
}
