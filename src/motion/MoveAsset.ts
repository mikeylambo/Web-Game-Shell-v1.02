import type { ImpactSpawnContext } from "../impact/types.js";
import type { MotionPlayOptions } from "./types.js";

export interface MoveAsset {
  id: string;
  clipId: string;
  targetRigId?: string;
  defaultPlayback?: MotionPlayOptions;
  defaultImpactContext?: ImpactSpawnContext;
  tags?: string[];
  metadata?: Record<string, unknown>;
}

export interface MoveLibraryPack {
  moves: MoveAsset[];
}

export class MoveLibrary {
  private readonly moves = new Map<string, MoveAsset>();

  register(move: MoveAsset): void {
    this.moves.set(move.id, structuredClone(move));
  }

  registerPack(pack: MoveLibraryPack): void {
    for (const move of pack.moves) this.register(move);
  }

  get(id: string): MoveAsset | undefined {
    const move = this.moves.get(id);
    return move ? structuredClone(move) : undefined;
  }

  list(tags?: string[]): MoveAsset[] {
    const required = tags ?? [];
    return [...this.moves.values()]
      .filter((move) => required.every((tag) => move.tags?.includes(tag)))
      .map((move) => structuredClone(move));
  }
}
